# 0031 — Observer exploration weighs hostile presence

- **Status:** done
- **Depends on:** 0029 (observer takes over scouting — `structures/observer.js`'s
  idle-exploration branch)

## Problem

0029's idle exploration picked the plain least-recently-seen room in
range, ignoring what was last seen there. A room with heavy military
presence goes just as stale as an empty one between visits, even though
fresher intel there is worth more (a build-up, a raid staging, a border
push).

## Desired outcome

Idle exploration still eventually revisits every room in range (nothing
goes permanently unwatched), but a room with more hostiles last seen gets
re-observed proportionally more often than a merely stale quiet one.

## In scope

- `structures/observer.js`: `exploreLeastRecentlySeen` → `explorePriority`.
  Score per candidate room = `staleness * (1 + enemies * militaryWeight)`,
  where `staleness = Game.time - Memory.rooms[x].lastVisit` and `enemies =
  Memory.rooms[x].enemies || 0` (already tracked by `rooms/intel.js`'s
  `getHostiles`, no new data needed). Highest score wins. A never-visited
  room still short-circuits to an immediate pick, same as before - unknown
  is always the top priority, no score needed.
- `utils/config.js`: `observer.militaryWeight` (default 1) - `0` disables
  the bias entirely (back to 0029's plain staleness ordering).

## Out of scope

- A separate "military strength" metric beyond hostile creep count
  (`mem.enemies`) - e.g. weighting by body parts or player reputation.
  Nothing tracks that yet; `enemies` is the only signal `intel.js` already
  keeps, and re-deriving more from `getHostiles()` output is a separate
  concern for `rooms/intel.js` if it's ever wanted.
- Applying the same weighting to `planLayout()`/`observe()` request
  priority - those already have an explicit target, weighting doesn't
  apply.

## Acceptance criteria

1. Between two in-range rooms, the one with more hostiles wins even when
   its intel is fresher than the quiet one's, as long as its weighted
   score is higher. *(smoke)*
2. `Memory.settings.observer = { militaryWeight: 0 }` falls back to plain
   least-recently-seen, ignoring hostile count entirely. *(smoke)*
3. A quiet room stale enough still outscores - and wins over - a
   hostile-heavy but fresher one: nothing is starved forever by the bias.
   *(smoke)*

## Constitution check

- **§6 (config over hardcode):** the weight is a `config.get()` path, not
  a literal - tunable (or disable-able) from the console without a
  redeploy.
- **§1 (CPU is the budget):** no new data collected, no new pass over
  anything - reuses `mem.enemies`, already written every tick by
  `rooms/intel.js` for any room with vision. Same O(441) scan as before,
  one extra multiply per candidate.

## Outcome

Entregue. `explorePriority()` em `structures/observer.js` substitui
`exploreLeastRecentlySeen()`; `config.js` ganha `observer.militaryWeight`
(default 1). Validado pelo smoke (248 assertions no total — 3 novas:
hostil-pesado vence apesar de mais fresco, `militaryWeight=0` volta ao
comportamento antigo, e sala parada há muito tempo ainda vence uma
hostil-pesada) + `npx grunt`.
