# 0065 — Hauler prioriza fonte confiável quando spawn/extension têm fome

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

`roles/hauler.js`'s `pickLoad()` (linha ~264) usa a mesma cascata de coleta
sempre, independente de urgência: terminal → energia caída no chão
(`FIND_DROPPED_RESOURCES`, decay-aware) → tombstones → ruins → link receptor
→ storage (condicional a `essentialConsumer`) → container de source. Energia
caída no chão vem **antes** de link/storage na busca, escolhida pela mais
próxima *por path* em toda a sala.

Isso significa que mesmo quando spawn/extension estão com `getFreeCapacity >
0` (`essentialConsumer` verdadeiro — a sala não consegue spawnar), o hauler
ainda pode ser desviado por uma pilha de energia caída longe (ex.: perto de
um remote), prejudicando a estabilidade da economia enquanto o spawn fica
sem energia. Energia caída decai (~1/1000/tick) e vale a pena resgatar
*quando não há pressa*, mas não deveria vencer uma fonte confiável e
normalmente mais perto do cluster do spawn (link não-coletor, depois
storage) quando a sala está com fome de verdade.

Pedido do usuário (anotado antes em `ROADMAP.md`'s seção "Later" como
"Logística: priorizar o recurso mais próximo do storage", 2026-09-14).

## Desired outcome

Quando `essentialConsumer` for verdadeiro (spawn/extension com espaço livre,
ou torre crítica com fome — mesma função já usada por `pickLoad`/
`pickDeliver`), o hauler tenta, **antes** de qualquer busca por energia
caída/tombstone/ruin: (1) o link receptor (não coletor) com energia, depois
(2) o storage com energia — nessa ordem, sem gate de reserva (mesma
justificativa de `essentialConsumer` já documentada: manter a sala capaz de
spawnar sempre vence a reserva). Se nenhum dos dois tiver energia, cai na
cascata normal já existente (chão/tomb/ruin/link/storage/container),
inalterada.

Fora do caso urgente (spawn/ext satisfeitos), nada muda: energia caída
continua tendo prioridade sobre link/storage, preservando o comportamento
de "resgatar antes que decaia" do ROADMAP 0043.

## In scope

- `src/roles/hauler.js`'s `pickLoad()` — novo bloco condicional no topo
  (depois do terminal, antes da busca por energia caída).
- Testes em `test/smoke.js` cobrindo os três casos: urgente com link
  disponível, urgente sem link mas com storage, e o controle (não-urgente,
  comportamento antigo preservado).

## Out of scope

- Mudar a ordem geral da cascata pra quem não está com fome (spawn/ext
  satisfeitos) — decisão do usuário, fora do escopo.
- `pickDeliver` (entrega) — não tocado, só a coleta (`pickLoad`).
- Medir "mais perto" por rota real em vez de existência simples de
  link/storage com energia — não necessário aqui, o gate é binário
  (tem energia ou não), sem comparação de distância entre os dois.

## Acceptance criteria

1. Com `essentialConsumer(creep)` verdadeiro e um link receptor com energia
   disponível, `pickLoad` devolve o link mesmo havendo uma pilha de energia
   caída fisicamente mais perto do hauler.
2. Com `essentialConsumer(creep)` verdadeiro, sem link com energia, mas com
   storage tendo energia, `pickLoad` devolve o storage mesmo havendo uma
   pilha de energia caída mais perto.
3. Com `essentialConsumer(creep)` falso (spawn/ext satisfeitos), o
   comportamento antigo é preservado: a pilha de energia caída mais perto
   ainda vence storage.
4. `node test/smoke.js "$(pwd)")` verde com as três novas assertions.

## Constitution check

- Sem `room.find`/`Game.creeps` novo por tick — reaproveita
  `roomCache.myStructures` e `essentialConsumer`/`reservations.available`
  já existentes.
- Nenhum objeto de jogo vai pra `Memory` — só ids, como já era.
- Fail-soft: se nem link nem storage tiverem energia, cai sem erro na
  cascata antiga.
- Testável offline: coberto por `test/smoke.js`, sem depender do motor.

## Open questions

Nenhuma — ordem link-antes-de-storage e escopo (só quando urgente)
confirmados com o usuário antes da implementação.

## Follow-up (mesmo dia): container de source cheio = problema de vazão

Pedido do usuário logo em seguida: um ou mais containers de source
(`sourceContainers(room)`, os que ficam ao lado de uma fonte, alimentados
pelo miner) acumulando **1000+** de energia não é só "vale a pena buscar" —
é sintoma de um problema de **vazão**: o miner não está conseguindo
descarregar no link coletor rápido o bastante e derrama o excedente no
container; o link coletor, por sua vez, só fica cheio assim quando nada
esvazia o link **receptor** do outro lado da rede.

Fix (`pickLoad`, `src/roles/hauler.js`): novo bloco, verificado **antes**
até do ponto de `essentialConsumer` (0065 acima) — decisão explícita do
usuário, desengasgar o próprio cano de energia da sala vale mais que um
único ciclo de entrega pro spawn/extension. `containersBackedUp(room)` (novo
`hauler.containerBackedUpThreshold`, default 1000 — chave separada de
`hauler.minContainerLoad`, mesmo valor hoje mas significado diferente: um é
"vale a viagem", o outro é "o cano está entupido") checa se algum container
de source bateu o piso; se sim, o hauler puxa do link receptor (não
coletor) e marca `dest: "storage"` (mesmo mecanismo do terminal) — a entrega
vai **direto pro storage**, nunca pro spawn/extension mesmo que estejam com
fome, porque alimentar o spawn em vez de desengasgar o link deixaria o
problema exatamente onde estava, disparando o mesmo check de novo na
próxima carga. Sem link com energia pra puxar, cai de volta, sem erro, na
cascata normal (`essentialConsumer`, e dali em diante).

**Acceptance criteria adicionais:**

5. Container de source com 1000+ de energia e link receptor com energia:
   `pickLoad` devolve o link com `dest: "storage"`, mesmo com
   `essentialConsumer` verdadeiro (spawn com espaço livre).
6. Container de source com 999 (abaixo do piso): o bloco novo não dispara —
   cai no comportamento do `essentialConsumer` (item 1 acima), sem
   `dest: "storage"`.
7. Container de source com 1000+, mas link receptor sem energia: cai sem
   erro na cascata normal (`essentialConsumer`/storage), sem
   `dest: "storage"`.

`test/smoke.js` cobre os três casos (735 asserções, `EXIT:0`).
