# 0048 — Flavored creep names — Plan

## Approach

One new, dependency-free module (`utils/names.js`) exporting a single
`generate(key)` function, consumed by every role's `spawnData()` in place
of the current `"<Role>" + Game.time` literal. No role logic changes -
this only touches the `name` field of the object each `spawnData()` already
returns.

## Modules

### New

| Path | Responsibility |
|------|-----------------|
| `src/utils/names.js` | first-name/surname pools + per-role/mission `{part1, part2}` title pools; `generate(key)` |

### Changed

| Path | Change |
|------|--------|
| `src/roles/bootstrap.js` | `name:` -> `names.generate("bootstrap")` |
| `src/roles/builder.js` | `name:` -> `names.generate("builder")` |
| `src/roles/defender.js` | `name:` -> `names.generate("defender")` |
| `src/roles/defenderMedic.js` | `name:` -> `names.generate("defenderMedic")` |
| `src/roles/defenderStriker.js` | `name:` -> `names.generate("defenderStriker")` |
| `src/roles/hauler.js` | `name:` -> `names.generate("hauler")` |
| `src/roles/miner.js` | `name:` -> `names.generate("miner")` |
| `src/roles/pioneer.js` | `name:` -> `names.generate("pioneer")` |
| `src/roles/raider.js` | `name:` -> `names.generate("raider")` |
| `src/roles/remoteHauler.js` | `name:` -> `names.generate("remoteHauler")` |
| `src/roles/remoteMiner.js` | `name:` -> `names.generate("remoteMiner")` |
| `src/roles/reserver.js` | 3 spots -> `names.generate("reserver:claim"/"reserver:contest"/"reserver:reserve")` |
| `src/roles/scout.js` | `name:` -> `names.generate("scout")` |
| `src/roles/squadDismantler.js` | `name:` -> `names.generate("squadDismantler")` |
| `src/roles/upgrader.js` | `name:` -> `names.generate("upgrader")` |

## Data shapes

None - `generate()` is a pure function of `Game.creeps` (read-only) and its
own static tables; nothing persisted.

## How it satisfies the constitution

- **CPU:** a handful of array lookups + up to 20 `Game.creeps[candidate]`
  checks, once per spawn attempt - negligible next to the rest of
  `spawnData()` (body sizing, `census` reads).
- **Memory:** untouched.
- **Fail-soft:** see spec's Constitution check - a residual collision is
  already handled by `rooms/spawning.js`'s existing `result !== OK` branch.
- **Config over hardcode:** N/A - this is flavor text, not a tunable.
- **Offline test:** `test/smoke.js` calls `names.generate()` directly for
  the format/uniqueness assertions, and lets the existing `main.loop()`
  runs exercise it end-to-end through real `spawnData()` calls.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| A role's `spawnData()` is missed during the rename sweep, left on the old `"<Role>"+Game.time` format | `grep -rn "\" + Game.time" src/roles/` after the edit pass must return nothing - checked as part of task 2. |
| Title list for a role reads as unrelated to what it does | Titles authored per-role specifically for this spec (see spec's "In scope") - not a mechanical reuse of old_1's generic adjective lists. |

## Rollback

Revert the diff; every `spawnData()` reverts to its old literal name with
no other code depending on the new format (names are never parsed back
into role/mission anywhere - `memory.role`/`memory.mission` remain the
source of truth, same as before this spec).
