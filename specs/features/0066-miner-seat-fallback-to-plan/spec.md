# 0066 — Miner cai pro tile planejado do container quando ele não existe

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

`roles/miner.js`'s re-seat (ROADMAP 0016) já garante que o miner sente em
cima do container de verdade quando ele existe. Mas quando o container
**não existe** — destruído (ataque), ou ainda não construído — o código caía
direto no ramo `else` de `findContainerSeat`'s uso em `run()`: `onContainer =
true`, `seat = null`, e a posição real ficava inteiramente por conta do
fallback de `harvest`'s `ERR_NOT_IN_RANGE` (`creep.moveTo(source, {
reusePath: 5 })`, sem `range` fixo) — qualquer tile a alcance 1 da source
serve, escolhida pelo pathfinder, não necessariamente a mesma tile todo
tick.

Bug real (usuário reportou, 2026-09-14): containers de source quebrados (em
combate) deixavam o miner "errando" a posição — a cada replan de path ele
podia acabar numa tile de source diferente da que o container ocupava,
espalhando a pilha de overflow em tiles diferentes em vez de uma só,
prejudicando tanto o hauler (não sabe onde procurar) quanto a reconstrução
do container (`architect.js`'s `createConstructionSite` mira a tile do
plano, não onde o miner por acaso está parado).

## Desired outcome

Com o container destruído ou ainda não construído, mas **planejado**
(`utils/planStore`'s `plan.buildings` tem uma entrada `STRUCTURE_CONTAINER`
a alcance 1 da source), o miner senta nessa tile planejada — mesma
mecânica de re-seat/shove que já usa pra um container de verdade (`memory.seat`,
`moveToSeat` compartilhado) — em vez de qualquer tile a alcance 1 da source
escolhida pelo pathfinder. Sem plano nenhum pra essa source (sala ainda sem
`architect.planCity` rodado), cai no comportamento antigo: minerar direto
da tile onde o `harvest` fallback põe o creep.

## In scope

- `src/roles/miner.js`: `plannedContainerPos()` (nova) lê `planStore.getPlan`
  e acha a entrada `STRUCTURE_CONTAINER` a alcance 1 da source; `moveToSeat()`
  (extraído do bloco de seat original) compartilhado entre o ramo de
  container real e o novo ramo de tile planejada.
- `test/smoke.js`: nova cobertura — sem container construído mas com entrada
  de container no plano, o miner mira a tile do plano (não a source crua) e
  grava essa tile em `memory.seat`.

## Out of scope

- Reconstruir o container automaticamente (isso já é `architect.js`'s
  `createConstructionSite`, fora deste fix) — este fix só garante que o
  miner fique parado no lugar certo enquanto isso não acontece.
- `remoteMiner.js` / `mineralMiner.js` — não tocados; o pedido do usuário foi
  especificamente sobre o container de source em sala própria.

## Acceptance criteria

1. Com o container de uma source destruído mas uma entrada
   `STRUCTURE_CONTAINER` a alcance 1 dela no plano da sala, o miner sem seat
   ainda anda pra essa tile planejada (não pra qualquer tile a alcance 1 da
   source) e grava `memory.seat` com essa posição. *(smoke)*
2. Sem plano algum pra essa source, o comportamento antigo é preservado
   (`onContainer = true`, `seat = null`, minera de onde estiver). *(smoke,
   comportamento inalterado — sem teste novo, cobertura já existente)*
3. `node test/smoke.js "$(pwd)"` verde com a assertion nova.

## Constitution check

- Sem `room.find`/`Game.creeps` novo por tick — só lê `planStore.getPlan`
  (heap-cached, já usado em todo `rooms/architect.js`) e faz uma busca
  simples no array `plan.buildings`.
- Nenhum objeto de jogo vai pra `Memory` — `memory.seat` continua só
  `[x, y]`, como já era pro container de verdade.
- Fail-soft: sem plano, cai sem erro no comportamento antigo.
- Testável offline: coberto por `test/smoke.js`, sem depender do motor.

## Open questions

Nenhuma — comportamento confirmado com o usuário (correção da causa: o
container é quem estava quebrado, não a lógica de reservar assento em si).

## Outcome

Entregue. `plannedContainerPos(roomName, source)` busca em
`planStore.getPlan(roomName).buildings` a entrada `STRUCTURE_CONTAINER` mais
próxima da source (alcance 1, mesmo critério que `architect.js`'s
`getContainerLocations` já usa pra plantar essas entradas). O bloco de seat
em `run()` ganhou um terceiro ramo (depois de "seat de container real" e
"containers todos ocupados por outro miner"): sem nenhum container
construído, tenta a tile planejada antes de desistir e minerar de onde
estiver. `moveToSeat()`, extraído do código de shove/approach que já existia
pro container real, é reaproveitado nos dois ramos (real e planejado) — o
squatter não-miner é empurrado do jeito de sempre em qualquer um dos dois.
`test/smoke.js` ganhou uma source dedicada (longe dos clusters reais do
plano de teste, pra evitar que um container planejado de uma source
diferente colidisse por coincidência de distância) confirmando que o miner
mira a tile do plano e grava `memory.seat` com ela.
