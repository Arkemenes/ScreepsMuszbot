# 0077 — Roteamento multi-sala considera estrutura conhecida (não só terreno)

- **Status:** in-progress
- **Owner:**
- **Created:** 2026-09-14

## Problem

`utils/routing.js`'s três funções de passabilidade multi-sala —
`computeRealRoute`'s `roomCallback`, `routeCostCallback`, `avoidCostCallback`
— decidem se uma tile é andável olhando só pra terreno
(`Game.map.getRoomTerrain`, disponível mesmo sem visão) e pra `avoid`/
dead-end compartilhado (ROADMAP 0076)/`isDangerousRoom` (presença de hostil
OU posse estrangeira, ROADMAP 0064). Nenhuma delas chama
`room.find(FIND_STRUCTURES)` nem reaproveita `utils/move.js`'s
`roomMatrix()`, que já resolve exatamente esse problema pra movimento
*dentro* da mesma sala (rampart não-própria/não-pública e wall = 255
impassável; container e rampart própria/pública = andável; estrada = custo
1) — o próprio comentário de `isDangerousRoom` em `routing.js` chama isso
de gap aberto, e o item "Later" do `ROADMAP.md` documenta dois incidentes
ao vivo do mesmo padrão: um claimer e, depois, pioneers de E1N47→E1N45
entrando numa sala de aliado (isenta de `isDangerousRoom` de propósito) cujo
interior estava fechado por rampart/wall, descobrindo isso só depois de já
estarem parados lá dentro sofrendo `ERR_NO_PATH` — mesmo em ticks em que a
sala já estava com visão (`Game.rooms[roomName]` presente) no exato momento
em que o costCallback rodou. O ROADMAP 0076 amenizou o CUSTO de repetição
(compartilha o beco-sem-saída confirmado entre creeps), mas não fechou a
causa: a detecção em si continua cega a estrutura.

## Desired outcome

Enquanto a sala atravessada por uma viagem multi-sala estiver com visão
(`Game.rooms[roomName]` truthy) no tick em que a rota é calculada ou
validada, o roteamento já enxerga rampart/wall não-passável nela — tanto na
pré-validação (`computeRealRoute`) quanto na execução tick-a-tick
(`routeCostCallback`/`avoidCostCallback`, usadas pelo `Creep.moveTo()`
nativo dentro de `moveToRoom()`). Um creep que entra numa sala de aliado
com o interior fechado por rampart passa a ser barrado (e o backtrack já
existente, ROADMAP 0063, dispara) no mesmo tick em que a obstrução está
diante dele, em vez de continuar avançando por vários tiles dentro do
bolsão até esgotar a sequência de `ERR_NO_PATH`. Sala sem visão continua
exatamente como hoje (só terreno) — o gap "prever estrutura sem visão
prévia" permanece de fora, decisão já registrada no `ROADMAP.md`.

## In scope

- Reaproveitar `utils/move.js`'s `roomMatrix(room)` (já cacheada por sala no
  heap, versionada por contagem de estrutura+canteiro — zero `room.find`
  novo) de dentro de `utils/routing.js`, nos três pontos que hoje só
  decidem por terreno/avoid:
  - `computeRealRoute`'s `roomCallback` — sala com visão devolve a
    CostMatrix de estrutura em vez do default terreno-only.
  - `routeCostCallback` — mesma troca, só pra sala já dentro do `allowed`
    set (nenhuma mudança em quais salas entram no set).
  - `avoidCostCallback` — mesma troca, só pra sala que já passa nas
    checagens de `avoid`/hostil/dead-end/`allowRoom` existentes.
- Fallback idêntico ao comportamento atual (matrix vazia repassada /
  `undefined`, terreno puro) pra qualquer sala sem `Game.rooms[roomName]`.

## Out of scope

- Enxergar estrutura de sala SEM visão atual (previsão/scouting
  antecipado antes de entrar) — gap conhecido, decisão já tomada de deixar
  aberto (`ROADMAP.md`'s "Later").
- Mudar `isDangerousRoom`/a seleção de sala no nível de
  `Game.map.findRoute` (`findRoute`'s `routeCallback`, escolha de QUAL
  sala cruzar) pra também penalizar sala com obstrução estrutural
  conhecida — escopo aqui é só a camada de CostMatrix tile-level dentro de
  uma sala já aceita, como o próprio texto do ROADMAP descreve.
- Qualquer mudança em `utils/move.js`'s `roomMatrix()` em si (reaproveitada
  como está, sem alterar sua lógica de custo).

## Acceptance criteria

1. `computeRealRoute(fromPos, toRoomName, opts)`: com `Game.rooms[roomName]`
   presente pra uma sala intermediária e uma estrutura bloqueante
   (`STRUCTURE_WALL`, ou `STRUCTURE_RAMPART` com `my: false` e
   `isPublic: false`) sentada na única tile de passagem dela, a busca não
   encontra mais caminho atravessando essa sala — o smoke test prova que
   o bloqueio agora vale por ESTRUTURA conhecida, não só por terreno.
2. `routeCostCallback(route, currentRoomName, toRoomName, opts)`'s callback
   devolvido, chamado como `(roomName, matrixVazia)` pra uma
   `roomName` dentro do `allowed` set com `Game.rooms[roomName]` presente,
   devolve uma CostMatrix com a tile da estrutura bloqueante marcada
   impassável (255) — não mais a `matrixVazia` recebida sem modificação.
3. `avoidCostCallback(avoid, opts)`'s callback devolvido, chamado do mesmo
   jeito pra uma sala que passa nas checagens de avoid/hostil/dead-end/
   `allowRoom`, tem a mesma assertion do critério 2.
4. Sala SEM `Game.rooms[roomName]` (sem visão): as três funções continuam
   devolvendo exatamente o comportamento de hoje (matrix repassada sem
   alteração / `undefined`) — smoke test prova que nada regride pra sala
   fora de visão.
5. `node --check` limpo em `src/utils/routing.js`; `node test/smoke.js
   "$(pwd)"` verde com as novas assertions; `npx grunt` builda
   `dist/main.js`.

## Constitution check

- **§1 CPU is the budget**: `roomMatrix()` já é cacheada por sala no heap,
  versionada por contagem de estrutura+canteiro (`utils/move.js`) — reuso
  puro, sem `room.find` adicional; o custo (já existente hoje pra
  movimento intra-sala) só é pago quando a sala está mesmo em visão nesse
  tick, exatamente como já acontece pro `travel()` de hoje.
- **§5 roles finos, utils dono de cross-cutting**: `utils/routing.js`
  passa a reaproveitar `utils/move.js` — dois utils, nenhum role no meio.
  Confirmado sem `require` circular: `move.js` só depende de
  `./roomCache` e `./excuseMe`, nenhum dos dois toca `routing.js`.
- **§4 deterministic and testable offline**: `test/smoke.js` já mocka
  `PathFinder.CostMatrix`/`Game.rooms`; as novas assertions seguem o
  mesmo padrão das existentes pra `avoidCostCallback`/`routeCostCallback`/
  `computeRealRoute`.
- **§9 spending cascade**: não se aplica — decisão de rota, não de gasto
  de recurso.

## Open questions

O bloqueio ainda não está encerrado: a CostMatrix de estruturas conhecidas e
o fallback de passo direto (`move()`) existem, mas o stall do caminho nativo
continua reproduzível em produção. A próxima investigação deve reproduzir o
caso sem a mitigação e explicar por que a rota nativa ainda falha.

- A extensão "prever estrutura sem visão prévia" continua fora de escopo.
