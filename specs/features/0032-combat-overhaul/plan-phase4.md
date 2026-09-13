# 0032 — Combat overhaul — Plan (Fase 4: O5, squad de verdade)

Derivado de `spec.md`. Escopo: quad 2x2 em lockstep de verdade — com
troca de formatura quando não cabe, sem travar em obstáculo, lockstep só
em sala perigosa, e decisão de recuar-ou-lutar — duas composições
(combate/cerco), console `raidSquad`. Revisado duas vezes: a primeira
decidiu lockstep de verdade + as duas composições; a segunda (abaixo)
substituiu quatro simplificações do primeiro rascunho por comportamento
de verdade.

Esta é a peça mais nova de todo o `0032` — nada parecido existe no bot
hoje (`utils/move.js` é por-creep independente).

## Approach

**Formatura tem duas formas, não uma fixa.** `block` (2x2, padrão) e
`column` (fileira única, alinhada com a direção de marcha) — ambas em
coordenadas de mundo, **não rotativas** com a direção pra "sempre
apresentar a frente" como um quad de PvP faria (esse continua sendo o
corte de simplicidade que sobrevive à revisão: rotacionar a grade inteira
é bem mais caro de calcular que trocar entre dois formatos fixos, e não
foi pedido). Antes de cada avanço, o líder testa se as 4 tiles seguintes
em `block` são todas passáveis; se não, testa `column`; a formatura ativa
fica em `Memory.squads[id].shape` e só muda quando o formato atual deixa
de caber (ou volta a caber). Trocar de forma não é instantâneo — os
membros precisam literalmente andar até o novo slot relativo (mesmo
mecanismo do passo "não formado" abaixo), então uma passagem estreita
custa alguns ticks de reorganização, não é grátis.

**Nunca trava de verdade.** Um bloqueio (creep no caminho, obstáculo que
nem `block` nem `column` contornam) incrementa
`Memory.squads[id].stuckTicks`; depois de
`config.get("squad.stuckTicksLimit", 5)` ticks sem avançar, a(s) tile(s)
bloqueada(s) entra(m) numa lista `avoid` temporária que penaliza o
próximo cálculo de rota do líder (mesmo princípio do stall guard que
`architect.js` já usa pra forçar progresso) — o líder recalcula em volta
do bloqueio em vez de insistir pra sempre na mesma direção. `avoid` some
sozinho depois de `config.get("squad.avoidTicks", 100)` ticks (o
bloqueio pode ter sido temporário - um creep que só estava de passagem).

**Lockstep só em sala perigosa**, não só na sala-alvo: qualquer sala com
`Memory.rooms[x].enemies > 0` conhecido, **ou** a própria sala-alvo da
missão. Fora disso (viagem por sala tranquila), cada membro viaja sozinho
via `routing.moveToRoom`, igual ao `raider` hoje - `isDangerousRoom` é
reavaliado a cada sala nova que o squad entra, então o grupo naturalmente
reforma em lockstep assim que cruza pra dentro de uma sala perigosa (o
passo "não formado" cuida disso) e volta a viajar solto quando sai de
uma.

**Decisão de recuar, tomada a cada tick que a sala é perigosa e o squad
ainda está `advancing`:** se a proporção média de `hits/hitsMax` dos
membros vivos cai abaixo de `config.get("squad.retreatHpRatio", 0.3)`,
avalia se dá pra recuar em segurança — existe alguma saída da sala atual
(`Memory.rooms[x].exits`) pra uma sala sem hostil conhecido
(`Memory.rooms[exitRoom].enemies` zerado/ausente)? Se sim: `state` vira
`"retreating"`, o alvo do squad muda pra sala-mãe, e ele recua **em
lockstep** (mesma máquina de avanço, só que na direção contrária) até
sair de sala perigosa — a essa altura, desfaz o squad
(`memory.squadId` apagado em todo mundo: `defenderStriker`/`defenderMedic`
voltam sozinhos pro modo de defesa de casa da Fase 2 automaticamente, já
que esse modo só depende de `squadId` **não** estar setado;
`squadDismantler` não tem modo solo, então se aposenta). Se **não**
houver saída segura: fica em `"advancing"`, luta até morrer ou vencer —
sem meio-termo, decisão tomada e revista a cada tick (uma saída pode
abrir depois, ex.: um hostil que bloqueava saiu da sala vizinha).

**Por que dá pra mover tudo junto com 1 cálculo de path:** todo corpo de
squad mantém a proporção 1:1 de `MOVE` (mesmo princípio do D1) — striker
(`RANGED_ATTACK`:`MOVE`), medic (`HEAL`:`MOVE`), dismantler
(`WORK`:`MOVE`) andam **na mesma velocidade** em qualquer terreno,
independente da contagem absoluta de partes. Isso é o que permite: só o
líder roda `PathFinder` (cacheado); os outros três só espelham a mesma
direção.

**Algoritmo por tick, rodado por cada um dos 4 (independente, sem
depender de ordem de iteração do `Game.creeps` — todos calculam o mesmo
resultado a partir do mesmo estado em `Memory`):**

1. Resolve os 4 membros (`Game.getObjectById`). Um id que não resolve
   mais = membro morto (modo degradado: sobreviventes continuam com o
   slot vazio; se o líder morreu, o de menor offset assume no próximo
   tick).
2. `dangerous = creep.room.name === target.room || (Memory.rooms[creep.room.name]||{}).enemies > 0`.
   Se **não** perigosa: `routing.moveToRoom` (independente, sem formatura)
   rumo a `target.room` (ou à sala-mãe, se `state==="retreating"`).
3. Se perigosa e `state==="advancing"`: checa a proporção de hp do squad;
   se abaixo do limiar e existe uma saída da sala atual sem hostil
   conhecido, muda pra `"retreating"` (alvo vira a sala-mãe). Sem saída
   segura: continua `"advancing"`.
4. Escolhe a formatura (`block` testado primeiro, `column` como
   fallback - passo "Formatura tem duas formas" acima); `formado?` =
   posição real de cada membro vivo bate com
   `líder + meu-offset-na-formatura-ativa`.
5. **Não formado:** `creep.moveTo(líder.pos + meu offset)` - cobre
   spawn inicial, troca de formatura, e reentrada em sala perigosa vinda
   de viagem solta.
6. **Formado:** líder calcula o próximo passo (`PathFinder`, penalizando
   tiles em `avoid`), grava `dir`; todo mundo lê `dir` e `move()`. Se a
   formatura ativa não tem 4 tiles seguintes passáveis em nenhum formato,
   incrementa `stuckTicks` (ver "Nunca trava" acima) em vez de mover.
7. Combate em paralelo (não exclui movimento): striker atira o que
   estiver a alcance, medic cura o membro mais ferido do squad em
   alcance, dismantler desmonta o alvo designado se adjacente.

**Composição por missão** (`raidSquad(room, mission, motherRoom?)`):
- `"combat"`: 2× `defenderStriker` + 2× `defenderMedic`, corpos
  idênticos aos que a Fase 2 já constrói — **reaproveitados
  integralmente**, só ganham um branch de "modo squad"
  (`memory.squadId` setado) que troca a postura de defesa de casa (D3,
  mop-up) por lockstep + focar fogo no alvo do squad.
- `"siege"`: 2× `squadDismantler` (novo, `WORK`-heavy) + 2×
  `defenderMedic`. O dismantler ignora criaturas hostis (não tem como
  atirar nelas) e desmonta a primeira `FIND_HOSTILE_STRUCTURES` no
  caminho — pensado pra abrir uma brecha em rampart/wall, não pra vencer
  defensores; um `mission: "combat"` antes ou depois cuida da parte viva.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/squad.js` | `advance(creep, squadId)` (algoritmo completo acima: formatura, movimento, recuo, stall guard); `leaderOf(squadId)`; `isDangerousRoom(roomName, targetRoom)`. Único lugar que sabe de `Memory.squads` — `defenderStriker`/`defenderMedic`/`squadDismantler` só chamam. |
| `src/roles/squadDismantler.js` | `WORK`:`MOVE` 1:1. Modo squad sempre (não tem modo solo/defesa de casa - só existe dentro de um squad, se aposenta quando desfeito). Desmonta a primeira `FIND_HOSTILE_STRUCTURES` adjacente; sem alvo, aguarda em formação. |

### Changed

| Path | Change |
|------|--------|
| `src/roles/defenderStriker.js` | `memory.squadId` setado → pula a lógica de defesa de casa (D3/O1/postura de rampart própria - não faz sentido longe de casa) e usa `utils/squad.advance` + foca fogo no alvo do squad. `squadId` apagado (recuo bem-sucedido) → volta ao modo solo de sempre, sem mudança nenhuma nele. |
| `src/roles/defenderMedic.js` | Mesma troca de `squadId` que o striker; `combat.patch` já cura "o aliado ferido mais próximo", que dentro de um squad tende a ser um squad-mate - sem mudança de lógica de cura, só a de movimento/recuo. |
| `src/rooms/raiding.js` | `raidSquad(targetRoomName, mission, motherRoomName?)` — spawna os 4 (via `Memory.pendingSquad`, fila de montagem até as 4 unidades existirem), monta `Memory.squads[id]` só quando as 4 já existem (`shape: "block"`, `state: "advancing"`). |
| `src/rooms/needs.js` | `Memory.pendingSquad` pede exatamente as 4 unidades que faltam, ignorando `pairEnergyThreshold`/`maxCount` (squad é pedido explícito, não reativo a ameaça). |
| `src/roles/index.js` | Registra `squadDismantler`. |
| `src/utils/config.js` | `squad.retreatHpRatio` (0.3), `squad.stuckTicksLimit` (5), `squad.avoidTicks` (100). |
| `test/smoke.js` | Cobertura: formatura escolhe `block` quando cabe, cai pra `column` quando não cabe e volta quando torna a caber; reforma quando fora de posição; avança em lockstep (mesma direção pros 4) quando formado; `stuckTicks` sobe num bloqueio e vira `avoid` depois do limite; modo degradado promove novo líder; `isDangerousRoom` só é `true` em sala-alvo ou com `enemies>0`; recuo dispara com hp baixo **e** saída segura disponível, não dispara sem saída segura (luta até a morte); squad desfeito devolve `defenderStriker`/`defenderMedic` ao modo solo automaticamente; `raidSquad`/`Memory.pendingSquad` só vira `Memory.squads` com as 4 unidades prontas; `squadDismantler` ataca estrutura, ignora creep hostil, se aposenta quando `squadId` some. |

## Data shapes

| Chave | Onde | Forma |
|-------|------|-------|
| `Memory.squads[id]` | Memory (pequeno, 1 por squad ativo) | `{mission: "combat"\|"siege", room, from, target: {id?, room}, members: [id,id,id,id], leader: id, shape: "block"\|"column", state: "advancing"\|"retreating", dir?: number, stuckTicks?: number, avoid?: [{x,y,roomName,until}]}` |
| `Memory.pendingSquad` | Memory (transitório) | `{mission, room, from, spawned: [id,...]}` — some assim que os 4 existem e viram `Memory.squads[id]` |
| `creep.memory.squadId` | `Memory.creeps[x]` | `string` (chave em `Memory.squads`) — ausente = modo solo normal do role |

## How it satisfies the constitution

- **CPU:** só o líder roda `PathFinder` por tick (cacheado) - os outros 3
  só leem `dir` e chamam `move()`. `avoid`/`stuckTicks` são leitura/escrita
  de Memory, não pathfinding extra. Testar `block` vs `column` é checagem
  de terreno em ≤4 tiles, não busca de caminho.
- **Memory:** `avoid` list é pequena e auto-expira (`avoidTicks`) - não
  cresce sem limite.
- **Fail-soft:** membro morto nunca trava o squad (modo degradado);
  `Memory.squads[id]` órfão (todos os membros sumiram) é limpo — mesmo
  gatilho que já desfaz o squad num recuo bem-sucedido.
- **§5 (roles finos):** toda a lógica de formatura/lockstep/recuo mora em
  `utils/squad.js`, chamada pelos 3 roles - não duplicada.
- **§6 (config sobre hardcode):** os três limiares novos (`retreatHpRatio`,
  `stuckTicksLimit`, `avoidTicks`) são `config.get()`.

## Simplificação que sobrevive à revisão

- **Formatura não rotaciona pra "sempre de frente pro inimigo"** - só
  troca entre `block` e `column`, ambas fixas em coordenadas de mundo.
  Rotacionar a grade inteira conforme a direção de marcha é bem mais caro
  de calcular (geometria, não só troca de tabela de offsets) e não foi
  pedido nesta revisão - fica como possível Fase 5 se um dia importar na
  prática.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `column` também não cabe (corredor de largura zero, cercado) | Cai no stall guard (`stuckTicks`/`avoid`) como qualquer outro bloqueio - eventualmente o líder rota em volta |
| Squad oscila entre `block`/`column` toda hora num mapa irregular | Aceito - custo é alguns ticks de reforma, não CPU nem risco; se virar problema na prática, dá pra adicionar uma histerese (só troca de volta depois de N ticks estável) |
| Checagem de "saída segura" é só o hop adjacente, não a rota inteira até casa | Mesmo nível de precisão que outras decisões de risco já aceitas no 0032 (O4); uma saída imediata livre de hostil é o sinal mais barato e mais correlacionado com "dá pra sair vivo" |
| CPU de `formed()`+`advance()` 4×/tick em squads simultâneos | Só liga com `raidSquad()` explícito - nunca automático; poucos squads simultâneos esperados |
| `Memory.pendingSquad` nunca completa (uma das 4 unidades falha ao spawnar) | Fica pendente até completar - sem timeout nesta fase; console pode limpar manualmente (`delete Memory.pendingSquad`) |

## Rollback

Reverter os arquivos listados; `squadDismantler.js`/`utils/squad.js` são
novos, apagar. `Memory.squads`/`Memory.pendingSquad` somem sozinhos.
`defenderStriker`/`defenderMedic` sem `memory.squadId` setado continuam
exatamente como na Fase 2 - nenhuma creep de defesa de casa é afetada.
