# 0057 — Claim mission espera sala-alvo hostil limpar, em vez de entrar

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-13

## Problem

O usuário reportou (regressão do mesmo tipo de bug que o `roles/scout.js`
já tratava com `isFlapping` - ROADMAP 0009/scout hardening) que o claimer
volta a ir pra uma sala com hostil e fica entrando e saindo dela.
`roles/reserver.js`'s missão `"claim"` já chama
`routing.moveToRoom(..., { blockHostiles: true })`, e `utils/routing.js`
já recusa **cruzar** uma sala intermediária com hostil conhecido
(`findRoute`'s `routeCallback` devolve `Infinity` com `blockHostiles`). Mas
`findRoute` tem um bypass deliberado — `if (roomName === toRoomName)
return 1;` — que nunca aplica esse bloqueio à própria sala de **destino**
(pensado pra `"contest"`, cujo trabalho é justamente entrar numa sala já
hostil — ROADMAP 0046 — e pra scout/reserve, cujo alvo normalmente não é
hostil). Resultado: quando a sala-alvo do `"claim"` tem um hostil
*agora* (invasor, NPC, etc.), o claimer marcha reto pra dentro dela toda
vez que é despachado ou reaparece — sem armadura nenhuma (corpo
`CLAIM`+`MOVE`), sem chance de terminar o claim.

## Desired outcome

Com a missão `"claim"`, se `Memory.rooms[targetRoom].enemies > 0` nesse
tick, o creep não se move em direção à sala-alvo — fica parado onde está
(mesmo stall guard que já existe pra "sem rota segura") até o hostil sumir
de lá, daí retoma o trajeto normalmente. `"reserve"` (já filtrado a
montante por `remotes.pendingReserves()`) e `"contest"` (que precisa
entrar numa sala hostil de propósito) continuam exatamente como antes —
esse gate é específico da missão `"claim"`.

## In scope

- `src/roles/reserver.js`: no branch de movimento (`creep.room.name !==
  targetRoomName`), checar `mission === "claim" &&
  remotes.hasHostiles(targetRoomName)` antes de chamar
  `routing.moveToRoom` — se hostil, pula o movimento nesse tick e cai no
  stall guard já existente (mesma contagem de `_stallPos`/`_stallTicks`,
  mensagem de aviso distinta pra esse caso).

## Out of scope

- Mudar `utils/routing.js`/`findRoute` — o bypass do destino ali é
  intencional e compartilhado por scout (sign/layout) e `"contest"`;
  mexer nele quebraria o `"contest"` (0046), cujo destino É pra ser
  hostil.
- Aplicar o mesmo gate a `"reserve"` — o alvo já é filtrado a montante
  (`remotes.pendingReserves()` já exclui sala com `hasHostiles`); um
  hostil aparecendo *depois* do despacho é um risco de trânsito aceito,
  igual a qualquer outro remote, não o bug reportado.
- Detectar e reagir a um hostil que aparece **depois** que o claimer já
  chegou na sala e está tentando `claimController` — fora do escopo desse
  relato (o creep só fica lá parado tentando, sem lógica de fuga; isso é
  igual pra qualquer role sem `takeCover`).

## Acceptance criteria

1. Com a sala-alvo de uma missão `"claim"` mostrando `enemies > 0`, o
   `reserver.run()` não chama `creep.moveTo` (nem via
   `routing.moveToRoom`) — `test/smoke.js`: `"a claim mission never moves
   toward a target room that currently has a hostile in it"`.
2. Assim que a sala-alvo volta a `enemies === 0`, a mesma missão retoma o
   movimento no próximo `run()` — `test/smoke.js`: `"once the target room
   is clear again, the claim mission resumes moving toward it"`.
3. `"reserve"` e `"contest"` não são afetados — nenhum teste existente
   dessas duas missões muda de comportamento (suite completa continua
   verde sem alterar as expectativas anteriores).

## Constitution check

- **Memory:** nenhum campo novo — reusa `Memory.rooms[x].enemies`
  (já mantido por `rooms/intel.js`) e `creep.memory._stallPos`/
  `_stallTicks` (já existentes).
- **Stall guard:** o creep parado por hostil no destino cai no mesmo
  aviso único (após `routing.claimStallTicks` ticks) já usado pra "sem
  rota segura" — não fica camping silenciosamente pra sempre.
- **Fail-soft:** sem hostil na sala-alvo, caminho idêntico ao anterior.

## Open questions

Nenhuma.
