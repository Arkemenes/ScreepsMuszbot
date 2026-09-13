# 0033 — claimRoom() refuses a target the CLAIM lifetime can't reach

- **Status:** done
- **Depends on:** 0020 (remote mining — `rooms/remotes.js`'s `claimRoom`/
  `roomDistance`)

## Problem

Um creep com qualquer parte `CLAIM` no corpo é limitado a
`CREEP_CLAIM_LIFE_TIME` (600 ticks) de vida, não os 1.500 normais — isso é
fixo pelo motor do jogo, nenhum body/boost muda isso. `claimRoom()` não
levava isso em conta: pedir o claim de uma sala longe o bastante spawnava
um creep de 650 de energia (`[CLAIM, MOVE]`) que morria em trânsito antes
de nunca chegar no controller — spawn e energia desperdiçados, sem
nenhum aviso até o creep já estar morto.

## Desired outcome

`claimRoom(targetRoomName, motherRoomName?)` calcula uma estimativa de
viagem (hops de sala × ticks/hop) e recusa o pedido — com uma mensagem
clara — se essa estimativa, mais uma margem de segurança, ultrapassar o
orçamento de 600 ticks. Nenhum `Memory.claimTarget` fica setado nesse
caso, então nenhum reserver de missão `claim` é spawnado pra uma missão
já fadada a falhar.

## In scope

- `rooms/remotes.js`'s `claimRoom()`: novo gate, entre resolver `mother` e
  o aviso de GCL existente. Usa `roomDistance()` (já existe, cacheado por
  tick) × `config.get("claim.ticksPerRoomHop", 50)` como estimativa;
  recusa se isso exceder `CREEP_CLAIM_LIFE_TIME - config.get("claim.travelMargin", 10)`.
- `utils/config.js`: `claim.ticksPerRoomHop` (50) e `claim.travelMargin`
  (10), ambos ajustáveis via `Memory.settings` sem redeploy.
- `utils/console.js` (`help()`): nota no `claimRoom` sobre a recusa.

## Out of scope

- Recalcular a estimativa no momento do spawn (`reserver.js`) — `mother`
  não muda entre `claimRoom()` e o spawn de fato, então validar uma vez no
  console já é suficiente.
- Estimativa exata via `PathFinder`/rota real (`utils/routing.js`'s
  preferência por highway/hostil pode alongar a rota real além do hop
  count ingênuo) — a estimativa é deliberadamente grosseira, com margem,
  não uma ETA precisa.
- Permitir override explícito ("sei que é arriscado, manda assim mesmo") —
  não pedido; se precisar, é fácil adicionar um terceiro argumento depois.

## Acceptance criteria

1. `claimRoom()` com alvo alcançável dentro do orçamento continua
   funcionando como antes (`Memory.claimTarget` setado). *(smoke, já
   existente)*
2. `claimRoom()` com alvo cuja estimativa de viagem excede
   `CREEP_CLAIM_LIFE_TIME - travelMargin` recusa: não seta
   `Memory.claimTarget`, loga o motivo. *(smoke)*

## Constitution check

- **§6 (config sobre hardcode):** os dois números (ticks/hop, margem) são
  `config.get()`, não literais.
- **§1 (CPU):** reaproveita `roomDistance()`, já cacheado por tick — sem
  custo novo de `Game.map.findRoute`.

## Outcome

Entregue. Gate em `claimRoom()` (`rooms/remotes.js`), tunables em
`config.js`, nota no `help()`. Validado pelo smoke (249 assertions no
total — 1 nova: recusa um alvo longe demais) + `npx grunt`.
