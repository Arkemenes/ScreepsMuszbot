# 0029 — Observer takes over scouting; `listAlly()`

- **Status:** done
- **Depends on:** 0027 (nuker/observer join the tower stamp — a
  `STRUCTURE_OBSERVER` is now buildable), 0028 (layout preview + safe
  routing — `Memory.layoutRequests`, `architect.planCity(room,
  {preview:true})`)

## Problem

0028's `planLayout()` always sent a scout to physically visit a room, even
when an owned observer could already see it for free (`observeRoom()`, no
travel, no risk, one tick of lead time). More generally, once an empire has
an observer, the scout's background exploratory wandering (round-robin of
adjacent rooms) is redundant — the observer can cover a much larger area
without a creep ever leaving the base. There was also no single command to
just print the current ally list (only `addAlly`/`removeAlly`, which log
the list as a side effect).

## Desired outcome

1. `planLayout(roomName)` prefers an owned observer in range
   (`OBSERVER_RANGE`, linear/Chebyshev distance) over dispatching a scout;
   falls back to the scout when no observer reaches that far.
2. By default, once any observer exists, the scout's background
   exploration stops — the observer takes over that job over its (much
   larger) range. Scouts are still spawned, but only reactively, for an
   on-demand task an observer cannot fully cover (signing a controller
   always needs a physical creep; a layout preview only needs one for a
   room outside every observer's range). An idle scout with nothing to do
   retires instead of wandering once an observer exists.
3. `listAlly()` prints the current ally list (default or
   `Memory.settings.allies` override).

## In scope

- `utils/observer.js` (new): `myObservers()`, `hasAnyObserver()`,
  `observerFor(roomName)` — the first owned observer within
  `OBSERVER_RANGE` of `roomName`, or `null`.
- `structures/observer.js` (new, registered in `structures/index.js`):
  `run(structure)` — one `observeRoom()` call per observer per tick.
  Priority: (a) a pending `Memory.layoutRequests[room]` in range that isn't
  `.planned` yet (also dequeues + logs once it is — the only place that
  does so for a room an observer, not a scout, is watching); (b) the
  least-recently-seen room in range (`Memory.rooms[x].lastVisit`), same
  idea as the scout's old round-robin but over every room in range instead
  of just adjacent exits. `roomNameToXY`/`xyToRoomName` convert between
  room names and signed world coordinates so the range scan is plain
  arithmetic instead of one `Game.map.getRoomLinearDistance` call per
  candidate room.
- `rooms/needs.js`: `scout` count — the background/exploratory branch
  (`rcl >= 3`) only fires when `!observer.hasAnyObserver()`; the on-demand
  branch (`rcl >= 2`) now also fires for a pending `Memory.layoutRequests`
  entry no observer covers, in addition to a pending sign request.
- `roles/scout.js`: `pendingLayoutRoom()` skips any room an observer
  already covers (leaves it to `structures/observer.js`); with no sign/
  layout task pending, the scout suicides instead of wandering once
  `observer.hasAnyObserver()` is true. `planLayout()`'s console log names
  which observer will handle it, when one does.
- `utils/hostiles.js`: `global.listAlly()`.
- `utils/console.js` (`help()`): `listAlly()`; `planLayout()`'s description
  updated to mention the observer.

## Out of scope

- Multiple observers coordinating so two never watch the same pending room
  the same tick — harmless overlap (`observeRoom` just "wins" per the
  engine), not worth the bookkeeping for how rare it is (1 observer per
  room, RCL8 only).
- A config toggle to opt back into scout-driven exploration with an
  observer present — not asked for; `replanRoom`-style escape hatches can
  be added later if it turns out to be wanted.

## Acceptance criteria

1. `observerFor(roomName)` returns the observer when linear distance ≤
   `OBSERVER_RANGE` (10), `null` at 11+. *(smoke)*
2. `structures/observer.js`'s `run()` observes a pending in-range layout
   request before exploring; dequeues it once `.planned`; never observes
   one outside range. *(smoke)*
3. With nothing pending, `run()` explores the least-recently-seen room in
   range - a never-visited one wins outright; with everything visited, the
   oldest `lastVisit` wins. *(smoke)*
4. `roomNeeds(room).scout`: 0 with an observer and nothing pending; 1 with
   a pending sign request even with an observer; 0 for a layout request the
   observer covers; 1 for one it doesn't. *(smoke)*
5. The scout skips an observer-covered layout room, picks one out of
   range instead; retires (`suicide()`) instead of wandering once an
   observer exists and nothing is pending. *(smoke)*
6. `listAlly()` exists on `global` and prints the current ally list,
   respecting a `Memory.settings.allies` override. *(smoke)*
7. `help()` lists `listAlly`. *(smoke)*

## Constitution check

- **§1 (CPU is the budget):** the exploration scan is 441 cheap property
  lookups (a 21×21 room square, `OBSERVER_RANGE` per axis) per observer per
  tick, with an early-return the instant a never-visited room turns up —
  the common case (an empire still being scouted out) is far cheaper than
  the worst case. No `room.find`/`Game.creeps` scan involved.
- **§5 (roles finos):** the range/coverage math lives in one place
  (`utils/observer.js`), read by `rooms/needs.js` and `roles/scout.js` —
  not duplicated. The observer's own decision logic is a `structures/*`
  module, same shape as `tower.js`/`link.js`/`rampart.js`.
- **§3 (fail soft):** `structures/observer.js` runs through `main.js`'s
  existing generic `guard(structure:id, ...)` wrapper — no bespoke plumbing
  needed in `main.js`.

## Outcome

Entregue. Novos `src/utils/observer.js` (range math) e
`src/structures/observer.js` (decisão de alvo por tick, registrado em
`structures/index.js`); `rooms/needs.js` e `roles/scout.js` atualizados
pra ceder a exploração ao observer e só spawnar/viajar sob demanda;
`global.listAlly()` em `utils/hostiles.js` + `help()`. Nenhuma mudança em
`main.js` — o loop genérico de estruturas já despachava por `structureType`.
Validado pelo smoke (234 assertions no total — 23 novas cobrindo
`utils/observer.js`, `structures/observer.js` (prioridade on-demand,
dequeue, exploração), `rooms/needs.js`, o desvio/aposentadoria do scout, e
`listAlly()`) + `npx grunt`.
