# 0047 — Combat squad clears hostile structures too — Plan

## Approach

Two small, independent-but-related additions on top of the existing 0032
Fase 4 squad machinery: a pure-Memory "is there anything left to fight"
check in `utils/squad.js` wired into the existing retreat transition, and a
structure-attack fallback in `defenderStriker.js`'s already-existing squad
branch. Neither changes the lockstep movement algorithm itself.

## Modules

### New

None.

### Changed

| Path | Change |
|------|--------|
| `src/utils/squad.js` | add `missionComplete(squad)`; call it from `advance()`'s `state === "advancing"` block right after `maybeRetreat()` |
| `src/roles/defenderStriker.js` | squad-mode branch: attack a hostile structure when no hostile creep is present |

## Data shapes

None new - reads existing `Memory.rooms[name].enemies`/`.enemyStructures`
(set every tick by `rooms/intel.js` for any visible room) and the existing
`Memory.squads[id]` shape (`mission`, `room`, `state`, `target`, `from`).

## How it satisfies the constitution

- **CPU:** `missionComplete()` is two property reads - no `room.find`. The
  structure lookup in `defenderStriker.js` is exactly the pattern
  `raider.js`/`squadDismantler.js` already use (one `room.find` per creep
  per tick, only when it's actually shooting) - not introducing a new class
  of cost, just extending an existing role to the same idiom.
- **Memory:** none added.
- **Fail-soft:** `rangedAttack()` on `undefined` is never called (guarded by
  `if (structureTarget)`); `missionComplete()` defaults to `false` when
  `Memory.rooms[squad.room]` doesn't exist yet (no intel = don't assume
  done).
- **Offline test:** `test/smoke.js` extends the existing Fase 4 squad test
  block (around line 3524) and the existing `defenderStriker` squad-mode
  test (around line 2647).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `missionComplete()` fires `true` on stale/missing intel right after arriving (before `rooms/intel.js` has scanned the new room this tick) | `main.js` runs `getIntel()` before any creep's `run()` every tick, so by the time `defenderStriker.run()`/`squad.advance()` execute, `Memory.rooms[squad.room]` already reflects this tick's `room.find`. |
| A "combat" squad correctly clears creeps but a structure sits somewhere the block/column formation can never get in range of (lockstep still marches to room center, not the structure - see spec's Out of scope) | Accepted limitation, same one `squadDismantler` already ships with; not new. |

## Rollback

Revert the diff. `missionComplete()` is additive and only consulted from
one call site; removing that one line restores the previous "idle at room
center forever" behavior with no other side effects.
