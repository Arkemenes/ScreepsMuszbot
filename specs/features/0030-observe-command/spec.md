# 0030 — `observe(roomName, ticks)` console command

- **Status:** done
- **Depends on:** 0029 (observer takes over scouting — `utils/observer.js`,
  `structures/observer.js`)

## Problem

0029 gave the observer two jobs (serve a `planLayout()` request, then
explore) but no way to just point it at a specific room for a while on
demand — e.g. to double-check a remote for hostiles, or watch a border room
without committing to a full layout preview or sending a scout.

## Desired outcome

`observe(roomName, ticks)` (default `ticks` = 10) keeps an owned observer
in range aimed at `roomName` for that many ticks, refreshing
`Memory.rooms[roomName]` via `rooms/intel.js` every tick it does. No
scout fallback — unlike `planLayout()`, this command is specifically about
exercising the observer; a room no observer reaches just sits queued (and
still expires on schedule) until one does.

## In scope

- `structures/observer.js`: `global.observe(roomName, ticks = 10)` — writes
  `Memory.observeRequests[roomName] = Game.time + ticks` (absolute expiry,
  not a countdown to decrement). `run(structure)` gains a second priority
  tier, `serveObserveRequests`, between the existing layout-request
  priority and exploration: serves the first in-range, not-yet-expired
  entry; expires (and deletes) any entry whose tick is up regardless of
  range, so a request nobody ever comes into range for still self-cleans
  instead of sitting in `Memory` forever.
- `utils/console.js` (`help()`): new "Observer" section.

## Out of scope

- `cancelObserve()` / `observeQueue()` — not asked for; `ticks` already
  bounds how long a stray request lingers, so there's no stuck-forever
  case to defend against the way `cancelLayout()` guards a `planLayout()`
  that will otherwise run until `.planned`.
- Scout fallback for a room no observer reaches (see Desired outcome).

## Acceptance criteria

1. `observe(roomName)` defaults to 10 ticks; `observe(roomName, n)` uses
   `n`. Both store `Game.time + ticks` in `Memory.observeRequests`. *(smoke)*
2. The observer serves a pending, in-range, unexpired `observe()` request;
   serving it does not consume it - only reaching its expiry does. *(smoke)*
3. A pending `planLayout()` request (even for a different room) wins the
   tick over a pending `observe()` request - the observer acts once per
   tick. *(smoke)*
4. An out-of-range `observe()` request is never served, but doesn't block
   an in-range one further down the same queue - and still expires on
   schedule even though it was never served. *(smoke)*
5. `help()` lists `observe`. *(smoke)*

## Constitution check

- **§2 (Memory is small):** expiry is checked before the range filter
  specifically so an unreachable request can't accumulate in `Memory`
  forever — it always self-cleans within `ticks` ticks of being queued.
- **§5 (roles finos):** lives entirely in `structures/observer.js`, next to
  the request type it most resembles (`planLayout()`'s queue) — no new
  module needed.

## Outcome

Entregue. `global.observe()` + `serveObserveRequests()` em
`structures/observer.js`, `help()` atualizado. Validado pelo smoke (245
assertions no total — 15 novas cobrindo o default de ticks, a prioridade
sobre exploração mas atrás de `planLayout()`, o comportamento em/fora de
alcance, e a expiração) + `npx grunt`.
