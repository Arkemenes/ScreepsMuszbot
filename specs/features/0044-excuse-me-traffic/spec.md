# 0044 — Cortesia de tráfego: "excuse-me"

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12
- **Depends on:** 0006 (movement & logistics — `utils/move.js`'s `travel()`)

## Problem

Vários creeps parados trabalhando/esperando recurso (miner na seat do
container, upgrader esperando no link receptor, qualquer creep sentado em
cima de um container/link — `utils/move.js`'s `isParked()`) bloqueiam o
único caminho de um creep em trânsito. Hoje `travel()` nunca empurra um
creep parado — só o rodeia (`repath` com `avoidCreeps`), o que pode ser mais
lento ou até impossível num corredor de 1 tile. A pedido do usuário: quando
isso acontecer, o creep que quer passar deve "pedir licença" e o(s)
creep(s) parado(s) devem sair para outra tile válida, para o
solicitante conseguir passar — inclusive quando são vários creeps
enfileirados num corredor estreito (mover mais de um de uma vez).

## Desired outcome

Quando `travel()` encontra um creep aliado parado exatamente na próxima
tile do caminho já calculado, em vez de recalcular rota ao redor dele de
cara, ele pede licença: o solicitante diz "Excuse-me", o bloqueador (ou uma
fila de bloqueadores parados em fila indiana na mesma direção) responde
"Ok!" e se desloca para uma tile livre de verdade — a fila inteira anda um
passo de uma vez, no mesmo tick (o motor do Screeps resolve nativamente
uma cadeia de "todo mundo anda uma casa" quando o último da fila pousa
numa tile vazia, sem precisar de um swap 1:1 escrito à mão). Só quando não
existe nenhuma tile válida para o(s) bloqueador(es) irem é que o
comportamento antigo (rodear, nunca empurrar) continua valendo.

## In scope

- Novo módulo `src/utils/excuseMe.js`: `ask(mover, nx, ny)` — detecta a
  fila de creeps aliados parados em linha reta a partir de `(nx, ny)` (até
  `excuseMe.maxChain`, default 4), acha uma tile de saída para o último da
  fila e move a fila inteira nesse mesmo tick. `mover.say("Excuse-me")` +
  `blocker.say("Ok!")` por cada bloqueador que efetivamente se move.
- **Preferência por tile válida** (a pedido do usuário, follow-up): entre
  as tiles livres candidatas para o último da fila, `pickExitTile()`
  prefere uma que mantenha o bloqueador dentro do "ancora" de trabalho
  dele agora (`anchorsFor()`) — controller a alcance 3 pra um upgrader, ou
  o container/link debaixo dele agora (qualquer role, mesma checagem que
  `isParked()` já usa) — em vez de qualquer tile livre. Sem nenhuma tile
  candidata satisfazendo alguma âncora, cai pra tile livre reta-à-frente
  primeiro (comportamento sem preferência, como antes deste follow-up).
- **Miner nunca aceita excuse-me** (a pedido do usuário, follow-up):
  `NEVER_ASKED` em `chain()` para a coleta da fila assim que encontra um
  creep com `memory.role === "miner"`, sem incluí-lo — o miner nunca tem
  uma âncora computada pra ele (nunca chega em `pickExitTile`), sempre
  mantém a seat do container (`roles/miner.js`'s próprio re-seat), e o
  `travel()` do solicitante cai pro rodeio de sempre. Um miner mais à
  frente numa fila também nunca deixa a fila "atravessar" a tile dele —
  só quem está entre o solicitante e o miner pode se deslocar sozinho pro
  lado.
- `src/utils/move.js`: `travel()` chama `excuseMe.ask()` no lugar de ir
  direto pro `repath`/`blockedByParked` quando a próxima tile do caminho
  tem um creep parado; só cai no comportamento antigo (rodear) se `ask()`
  devolver `false` (sem tile válida disponível pra ninguém na fila).
- `src/utils/config.js`: `excuseMe.maxChain` (default 4).

## Out of scope

- Bloqueadores que não estão em fila indiana na mesma direção do
  movimento (a detecção é uma linha reta, não uma busca geral) — cai no
  comportamento antigo (rodear).
- Um "traffic resolver" central por sala (reserva de intenção de move de
  1 tick pra hotspots, já listado em `ROADMAP.md`'s "Later") — este recurso
  é local ao `travel()` de um único creep, não um planejador de tráfego.

## Acceptance criteria

1. Um creep parado (role estacionário, ou sentado num container/link) com
   uma tile livre adjacente se desloca para ela quando um creep aliado
   precisa passar pela sua tile — `test/smoke.js`: `"a parked worker with
   a free tile to go to steps aside instead of being routed around"`.
2. Um creep parado sem nenhuma tile válida ao redor nunca é empurrado — o
   solicitante volta a rodear como antes — `test/smoke.js`: `"a parked
   worker with nowhere valid to go is never shoved"`.
3. Uma fila de dois (ou mais, até `excuseMe.maxChain`) creeps parados em
   fila indiana na mesma direção se move inteira no mesmo tick quando o
   último da fila tem uma tile livre à frente — `test/smoke.js`: `"a
   single-file line of parked blockers steps aside together, not just the
   immediate one"`.
4. Entre tiles livres candidatas, um bloqueador prefere uma que o mantenha
   dentro do alcance de trabalho atual (controller pro upgrader) em vez
   da primeira tile livre encontrada — `test/smoke.js`: `"an upgrader
   steps aside to a tile that stays within range 3 of the controller, not
   just the first free tile"`.
5. Um miner nunca aceita um pedido de excuse-me, mesmo com uma tile livre
   disponível — o solicitante sempre rodeia — `test/smoke.js`: `"a miner
   never accepts an excuse-me request, even with a free tile available -
   it always keeps its container seat"`.
6. Um miner mais à frente numa fila continua recusando (a fila não
   atravessa a tile dele), mas quem está entre o solicitante e o miner
   ainda pode se deslocar sozinho — `test/smoke.js`: `"a miner further
   down a single-file line still refuses to move, but the mobile creep in
   front of it can still sidestep"`.

## Constitution check

- **CPU:** `ask()` só roda quando `travel()` já detectou um bloqueio real
  (a próxima tile do caminho já calculado) — nada de varredura nova de
  `Game.creeps`/`room.find` por tick; usa `room.lookForAt`/`getTerrain`
  pontuais, mesma classe de custo que o resto de `move.js` já paga.
- **Memory:** nenhum estado novo em `Memory` — a cadeia é recalculada do
  zero a cada chamada, mesmo princípio de `raiding.findWeakTarget()`.
- **Fail-soft:** `ask()` só commita (fala/move) depois de confirmar que
  toda a fila tem uma tile de saída — sem estado parcial se falhar;
  `Creep.prototype.moveTo` (que chama `travel()`) já está em
  try/catch com fallback pro `moveTo` nativo (`prototypes/move.js`).
- **Config over hardcode:** `excuseMe.maxChain` vive em `utils/config.js`.
- **Offline test:** `test/smoke.js` cobre os seis critérios acima.
