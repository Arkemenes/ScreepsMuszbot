# 0046 — contestRoom(): siege an already-claimed/reserved enemy controller

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

`old_1/prototype.creep.role.claimer.js` conseguia atacar o controller de uma
sala já reivindicada ou reservada por outro jogador (`attackController()`)
até zerar a reivindicação/reserva dele, e só então reivindicar/reservar por
conta própria. Hoje `claimRoom()`/`reserveRoom()` (`rooms/remotes.js`)
recusam explicitamente qualquer alvo já dono de outro jogador — o bot só
sabe expandir pra sala neutra, nunca contestar uma já ocupada. Isso é uma
decisão de design deliberada (não iniciar conflito sem intenção explícita
do jogador), então a capacidade que falta é **manual**: um comando de
console que o jogador dispara de propósito, não uma varredura automática
tipo `raiding.autoRaid`.

## Desired outcome

O jogador digita `contestRoom(roomName)` contra a sala de um alvo já
listado em `targetEnemies` (nunca um aliado, nunca fora da lista opt-in —
mesma filosofia de `raidRoom`/`raidSquad`/`raidRemote`). O bot despacha um
creep com `CLAIM` que viaja até lá e passa a chamar `attackController()`
todo tick em que o controller ainda estiver reivindicado/reservado por
outro jogador — reduzindo a reserva ou o timer de downgrade do dono. Isso é
deliberadamente um cerco lento: um único corpo com `CLAIM` tem vida útil de
só 600 ticks (`CREEP_CLAIM_LIFE_TIME`), então uma sala bem estabelecida
provavelmente precisa de várias gerações de creep pra zerar. Diferente da
missão `claim` (0035), um contestador que morre no meio do cerco NÃO é
tratado como beco-sem-saída — é o resultado esperado de um cerco longo, e o
bot continua respawnando outro enquanto `Memory.contestTarget` existir. Uma
vez que o controller fica neutro, o próprio creep muda pra `claimController`
e a missão se fecha (sucesso) ou termina em erro irrecuperável (ex.: GCL
insuficiente). O jogador pode cancelar a qualquer momento com
`cancelContest()`.

## In scope

- `src/rooms/raiding.js`: `contestRefusalReason(roomName)` — mesma família
  de validação de `refusalReason()`/`remoteRefusalReason()`: precisa estar
  escoutada, não pode já ser minha, precisa estar reivindicada OU reservada
  por alguém (senão a resposta é "use claimRoom/reserveRoom"), esse alguém
  não pode ser aliado (`utils/hostiles.isAlly`), precisa estar em
  `targetEnemies` (`isTargetEnemy`), precisa ter controller
  (`hasController !== false`), e não pode estar bloqueada por
  `Game.map.getRoomStatus` (novice/respawn/fora dos limites).
- `global.contestRoom(targetRoomName, motherRoomName?)`: valida com
  `contestRefusalReason`, recusa se já existe `Memory.contestTarget`
  pendente, recusa se a viagem estimada (mesmo cálculo de
  `claimRoom`/`claim.ticksPerRoomHop`+`claim.travelMargin`) excede o que um
  corpo com `CLAIM` sobrevive, senão grava `Memory.contestTarget = {room,
  from}`.
- `global.cancelContest()`: apaga `Memory.contestTarget` a qualquer momento
  (o jogador decide quando desistir do cerco).
- `src/roles/reserver.js`: nova missão `"contest"` — enquanto
  `controller.owner` ou `controller.reservation` existir, chama
  `creep.attackController(controller)` (move até range 1 se preciso);
  quando nenhum dos dois existir mais (controller neutro), muda para
  `creep.claimController(controller)` — sucesso (`OK`) ou qualquer erro
  irrecuperável fecham a missão (`delete Memory.contestTarget`), igual ao
  fluxo já existente da missão `"claim"`. `spawnData()` prioriza um
  `Memory.contestTarget` pendente pra esta sala (mesmo nível de prioridade
  de `claimTarget`, corpo escalável via `reserveBody()` em vez do
  `[CLAIM, MOVE]` fixo da missão `claim` — mais `CLAIM` = cerco mais rápido).
- `src/rooms/needs.js`: `Memory.contestTarget` pendente sem um contestador
  vivo (`census.all("reserver").some(mission === "contest")`) conta +1
  reserver — **sem** a lógica de abandono por morte de 0035 (morrer no meio
  do cerco é esperado, não um beco-sem-saída).
- `src/utils/console.js`: `contestRoom`/`cancelContest` na seção
  "Ofensiva".

## Out of scope

- Qualquer heurística automática de "essa sala parece fraca, contesta
  sozinho" (equivalente ao `raiding.autoRaid` pra O4) — fora de escopo por
  decisão do usuário: `contestRoom()` é sempre um ato deliberado do
  jogador, nunca automático.
- Múltiplos cercos simultâneos — mesmo padrão de `Memory.claimTarget`
  (1 por vez, império inteiro).
- Suporte pra contestar uma sala de um jogador fora de `targetEnemies` —
  mesma barreira de opt-in que `raidRoom`/O4 já usa; digitar o comando não
  basta, o alvo tem que estar na lista (`addTargetEnemy`) primeiro.
- Acelerar o cerco com boosts/labs — fora de escopo (ver ROADMAP "Later",
  lab/power/factory automação).

## Acceptance criteria

1. `contestRoom()` recusa uma sala não escoutada, já minha, sem dono nem
   reserva (neutra), reservada/dona por um aliado, ou dona/reservada por
   alguém fora de `targetEnemies` — `test/smoke.js`: uma assertion por
   caso, prefixo `"contestRoom() refuses..."`.
2. `contestRoom()` grava `Memory.contestTarget` com `room`/`from` corretos
   quando o alvo é válido; uma segunda chamada enquanto um cerco já está
   pendente é ignorada — `test/smoke.js`: `"contestRoom() records a
   pending contest"` / `"a second contestRoom() call is ignored while one
   is already pending"`.
3. `contestRoom()` recusa um alvo cuja viagem estimada excede o que um
   corpo `CLAIM` sobrevive (mesmo cálculo de `claimRoom`) —
   `test/smoke.js`: `"contestRoom() refuses a target too far for a CLAIM
   creep to survive the trip"`.
4. `cancelContest()` apaga `Memory.contestTarget` e loga — `test/smoke.js`:
   `"cancelContest() clears a pending contest"`.
5. `reserver.run()` em missão `"contest"` chama `attackController()`
   enquanto o controller tem dono ou reserva de outro jogador (`moveTo`
   quando fora de alcance), muda para `claimController()` quando o
   controller fica neutro, e fecha a missão (`delete
   Memory.contestTarget`) em qualquer resultado que não seja
   `ERR_NOT_IN_RANGE` — `test/smoke.js`: cobre as três transições.
6. `rooms/needs.js` conta +1 reserver enquanto `Memory.contestTarget`
   estiver pendente sem contestador vivo, e não conta quando já existe um
   vivo — `test/smoke.js`: `"a pending contest without a live contester
   wants one spawned"` / `"a live contester means no extra one is
   wanted"`.

## Constitution check

- **CPU:** nenhuma varredura nova — reaproveita `remotes.roomDistance`,
  `census.all`, e a mesma leitura de `Memory.rooms` que `claimRoom` já faz.
- **Memory:** `Memory.contestTarget = {room, from}` — mesma forma pequena
  de `Memory.claimTarget`, nunca guarda objeto de jogo (só nome de sala).
- **Fail-soft:** `attackController`/`claimController` são chamadas nativas
  com código de retorno; qualquer erro irrecuperável fecha a missão em vez
  de tentar de novo às ciegas.
- **Config over hardcode:** reaproveita `claim.ticksPerRoomHop`/
  `claim.travelMargin` já existentes em `utils/config.js` — nenhum novo
  tunable necessário.
- **Offline test:** `test/smoke.js` cobre os 6 critérios acima.

## Open questions

Nenhuma — decisões de design (manual-only, sem abandono-por-morte, opt-in
via `targetEnemies`) já fechadas com o usuário antes desta spec.
