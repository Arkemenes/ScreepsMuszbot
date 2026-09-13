# 0046 — contestRoom() — Plan

## Approach

Mirror `claimRoom()`'s validation/travel-budget shape (already in
`rooms/remotes.js`) but host it in `rooms/raiding.js` instead - this is an
offensive action against a player, same charter as `raidRoom`/`raidSquad`/
`raidRemote` (opt-in via `targetEnemies`, never against an ally), even
though it shares its creep body/travel plumbing with the claim mission. The
`reserver` role gains a third mission value; `rooms/needs.js` gains a third
small pending-count block next to `claimPending`, deliberately *not*
copying the abandon-on-death check (0035) since dying mid-siege is normal
here, not a dead end.

## Modules

### New

None.

### Changed

| Path | Change |
|------|--------|
| `src/utils/hostiles.js` | none (already exports `isAlly`/`isTargetEnemy`) - just imported by `raiding.js` |
| `src/rooms/raiding.js` | add `contestRefusalReason()`, `global.contestRoom()`, `global.cancelContest()` |
| `src/roles/reserver.js` | add the `"contest"` mission branch in `run()`; add the contest-priority check in `spawnData()` |
| `src/rooms/needs.js` | add `contestPending` to the `reserver` count |
| `src/utils/console.js` | document the two new commands |

## Data shapes

`Memory.contestTarget = { room: string, from: string }` - same shape as
the existing `Memory.claimTarget`, heap-free, no game object ever stored.

## How it satisfies the constitution

- **CPU:** reuses `remotes.roomDistance()` (already per-tick cached) and
  `census.all()` (already a single `Game.creeps` pass) - no new scans.
- **Memory:** one small object, same shape/lifecycle as `claimTarget`.
- **Fail-soft:** `attackController`/`claimController` are native
  return-code calls; the mission only ever ends on `OK` or a non-
  `ERR_NOT_IN_RANGE` result, same idiom as the existing `claim` branch.
- **Config over hardcode:** reuses `claim.ticksPerRoomHop`/`travelMargin`.
- **Offline test:** `test/smoke.js` mocks `attackController`/
  `claimController` on a fake creep and drives `reserver.run()` directly,
  same style as the existing claim-mission tests around line 3163.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| A siege against a well-defended/very high RCL room burns spawn energy forever with no real chance of success | Deliberately manual + opt-in (`targetEnemies`) + explicit `cancelContest()` - the player owns that judgment call, same as `raidRoom`/`raidSquad` already assume for O2/O4. |
| `attackController()` on an **owned** controller vs. a merely **reserved** one behaves differently in the real engine (downgrade timer vs. reservation ticks) | Not distinguished in code - `attackController(controller)` is called either way and the engine handles which counter it decrements; the role only checks "still owned or reserved by someone" as one boolean gate, not the two cases separately. |
| Two contest siege creeps in flight at once from a respawn race | Same single-instance-empire-wide guard as `claimTarget` (`if (Memory.contestTarget) { refuse }`). |

## Rollback

Revert the diff; `Memory.contestTarget` left over from an old build is
harmless (no live creep reads it without the mission code present) and can
be cleared manually with `delete Memory.contestTarget` from the console.
