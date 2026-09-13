# 0008 — Road network (intra-room, traffic-driven)

- **Status:** done
- **Analysis refs:** item de planejamento E (item 8)
- **Rescoped:** estradas inter-sala saíram daqui → [0020](../0020-remote-mining/spec.md)

## Problem

Hoje o plano tem estrada:

- na treliça interna dos stamps do core (passos 1–7),
- do anchor do spawn até cada container de source (passo 10),
- ao redor de cada extension (`?E?`, passos 8–9).

Faltam / problemas:

- **nenhuma estrada até o controller** — literal `// TODO: add road to upgrader`
  em [architect.js](../../../src/rooms/architect.js) passo 10,
- **shortest-path fixo**: o passo 10 pavimenta a rota do spawn ao container
  mesmo que o tráfego real passe por outro lugar; estrada decai e custa energia
  de repair, então pavimentar rota sem uso é desperdício,
- o anchor `spawn.x+1, spawn.y-1` é um tile mágico que pode ser wall,
- a política de repair de estrada é a mesma de qualquer estrutura (`< 30 %`),
  sem noção de "esse tile não tem tráfego, deixa morrer".

## Desired outcome

1. O plano inclui uma estrada contínua anchor → alcance 3 do controller (onde
   o upgrader estaciona).
2. A colocação de estrada passa a ser **guiada por tráfego**: um contador por
   tile acumula as posições dos creeps ao longo dos ticks (heap, decai devagar);
   só vira canteiro de estrada o tile cujo tráfego passa de um limiar. As rotas
   "sempre" (spawn↔source, spawn↔controller) continuam sendo semeadas por
   `getShortestPath` como baseline; o resto emerge do tráfego.
3. Política de repair de estrada: repara acima de um piso (ex.: 40 %) e ignora
   tile de estrada planejada sem tráfego recente (deixa decair).

## In scope

- `utils/traffic.js`: `record(creep)` chamado no `main` (ou por role) acumula
  `heap.traffic[roomName]["x:y"] += 1` a cada tick; `decay()` periódica;
  `hot(roomName, threshold)` → lista de tiles quentes. Nunca vai pra Memory.
- `architect.js` passo 10:
  - anchor robusto: primeiro tile de estrada do plano adjacente ao spawn, com
    fallback pro spawn.
  - adicionar rota anchor → controller (alcance 3).
  - além das rotas baseline, pavimentar os tiles `hot()` acima do limiar que
    ainda não são estrada planejada e não colidem com estrutura planejada.
- `builder` (spend / repair): estrada só entra na fila de repair se
  `hits/hitsMax < piso` **e** o tile teve tráfego recente; senão pula.
- `tower` repair (já gated por energia): mesmo filtro de tráfego para estrada.

## Out of scope

- Estradas até saídas / entre salas → 0020 (remote mining).
- Mudar o formato do plano ou onde ele mora (0007).
- Remover o `getShortestPathToAdjacentRooms` comentado (0010 faz o sweep).
- Persistir o contador de tráfego entre global resets (heap-only é aceitável;
  reaquece em ~algumas centenas de ticks).

## Acceptance criteria

1. Após planejar, o plano contém um caminho de estrada contínuo do anchor até
   menos de 1 tile de cada container de source (baseline, como hoje). *(smoke)*
2. O plano contém um caminho de estrada do anchor até menos de 3 tiles do
   controller. *(smoke)*
3. Entradas de estrada são `structureType: STRUCTURE_ROAD`, `minimalRCL: 3`, e
   **não** entram em `mincutBoundries`. *(smoke)*
4. `traffic.record` + `traffic.hot` acumulam e retornam tiles acima do limiar;
   `decay` reduz. *(smoke unit)*
5. `builder` não enfileira repair de um tile de estrada planejada sem tráfego
   recente, mesmo abaixo do piso. *(smoke)*
6. O passo 10 completa em um tick e não trava (stall guard cobre).

## Constitution check

- **CPU (§1):** `traffic.record` é O(1) por creep; `hot()`/`decay()` O(tiles
  registrados) e só rodam no planejador / periodicamente. Baseline de
  `getShortestPath` é one-time, gated por bucket.
- **Memory (§2):** contador de tráfego é heap puro; entradas de estrada vão no
  plan store (0007).
- **Fail-soft (§3):** `PathFinder` incompleto → adiciona o caminho parcial e o
  passo avança; `traffic` vazio → planejador cai no baseline shortest-path.
- **Static data (§?):** tráfego é dado derivado → heap, nunca Memory.

## Open questions

- Limiar de tráfego e taxa de decay: começar com limiar = 50 passagens numa
  janela de ~1500 ticks, decay de 1 % a cada 100 ticks. Ajustar via
  `Memory.settings` (0012).
- `traffic.record` no `main` (uma passada, todos os creeps) ou dentro de cada
  `role.run`? → no `main`, junto do loop de creeps que já existe, para não
  espalhar.

## Adição (pedido do usuário): estrada até a borda só se valer a pena

Escopo original dizia "estradas até saídas/entre salas → 0020". O usuário
pediu que a 0008 já saiba **não** pavimentar até a borda por padrão, e só o
fizer quando a sala vizinha for minha ou já estiver sendo minerada
remotamente — sem a 0008 precisar entender nada de elegibilidade de remote
(isso é todo da 0020). Resolvido lendo dois campos que já existem/serão
escritos por outros módulos: `Memory.rooms[vizinha].my` (já setado pelo
`intel.js`) e `Memory.rooms[roomName].remotes` (lista que a 0020 escreve).
Sem nenhum dos dois — nunca pavimenta até a saída, mantendo o comportamento
de hoje.

## Outcome

Entregue.

- **`src/utils/traffic.js`** (novo): contador de tráfego 100 % heap.
  `record(creep)` incrementa `"x:y"` por sala; `decay()` (gated a 1×/100
  ticks) reduz tudo em 1 %; `hot(roomName, threshold=50)` retorna os tiles
  acima do limiar; `isHot(roomName, x, y, threshold)` é a checagem O(1) pra
  política de repair; `worthRepairing(structure)` centraliza a regra —
  qualquer estrutura não-estrada sempre vale reparar; uma estrada só vale se
  `hits/hitsMax < ROAD_REPAIR_FLOOR` (0.4) **e** o tile tem tráfego recente.
  `main.js` chama `traffic.record` por creep e `traffic.decay()` 1×/tick no
  loop já existente (não espalhado por role).
- **`architect.js` case 10 reescrito**: `roadAnchor()` troca o
  `anchorSpawm.x+1, y-1` mágico pelo primeiro tile de estrada do plano
  adjacente ao spawn (fallback pro spawn); rota anchor→controller (alcance
  3, `getShortestPath` ganhou um parâmetro `range` opcional); tiles
  `traffic.hot()` acima do limiar viram estrada extra, além do baseline;
  `closestExitTile()` + o gate `remotes`/`my` decidem estrada até a borda.
- **`builder.js`** (repair principal + `opportunisticWork`) e
  **`tower.js`** (`findRepairTarget`): filtro de reparo ganhou
  `traffic.worthRepairing(s)`.
- Validado pelo smoke (140 assertions no total, 15 novas: unit de
  `traffic.record`/`hot`/`decay`/`isHot`/`worthRepairing`; plano com estrada
  a ≤3 do controller; sem `remotes`/`my` nenhuma estrada chega na borda; com
  `remotes` chega na borda certa (topo); com vizinha `my` chega na borda
  certa (direita); builder não enfileira repair de estrada fria e enfileira
  a mesma estrada quente) + confirmado que as assertions de gate de borda e
  de skip de reparo falham revertendo os fixes + `npx grunt` (43 arquivos).
