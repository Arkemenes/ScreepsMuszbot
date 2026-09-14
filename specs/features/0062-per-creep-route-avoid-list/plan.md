# 0062 — Plan

## Approach

Remove the global, TTL-based, cross-creep room blacklist
(`Memory.rooms[x].routeBlacklistUntil`, `isBlacklisted`, `blacklistRoom`)
and the ABAB flap detector that fed it (`isRouteFlapping`, `_routeTrail`)
from `utils/routing.js`. Replace with a plain per-creep array
(`creep.memory._routeAvoid`) threaded through `findRoute`/
`routeCostCallback` as `opts.avoid`. `isStuck`/`isOnBorder`/
`borderNeighborRoom`/`nudgeAwayFromBorder` (the position-based detection
from 0060/0061) are kept as-is — only what happens once stuck is
confirmed changes. `nudgeAcrossBorder` (0061's directional fix) is removed
- it existed only to guess which side of a border is "the trap", a
question that no longer needs answering once both candidates just go on
the same creep-local avoid list.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | Remove `isBlacklisted`, `blacklistRoom`, `isRouteFlapping`, `nudgeAcrossBorder`. `findRoute`/`routeCostCallback` take `opts.avoid` instead of checking the global blacklist. `moveToRoom()` rewritten: on `isStuck`, push `creep.room.name` (+ `borderNeighborRoom` if on a border) onto `creep.memory._routeAvoid`, then fall through to the normal `findRoute`+`moveTo` call with that avoid list applied THIS tick. `nudgeAwayFromBorder` becomes a fallback only when `moveTo()` itself returns `ERR_NO_PATH` while on a border (0060's engine-snapback safety net), not the primary reaction. |
| `test/smoke.js` | Remove all blacklist/flap assertions for `utils/routing.js` (keep `roles/scout.js`'s own separate `scoutBlacklistUntil` tests untouched); add `_routeAvoid`/`opts.avoid` assertions. |

## Data shapes

- `Memory.creeps[x]._routeAvoid`: array of room names, no TTL, lives and
  dies with the creep. Replaces `Memory.rooms[x].routeBlacklistUntil` and
  `Memory.creeps[x]._routeTrail`.

## How it satisfies the constitution

- **CPU:** identical - no new PathFinder/findRoute calls beyond what
  already ran each tick.
- **Memory:** smaller and less coupled - a small per-creep array instead
  of a per-room field with TTL bookkeeping (`Game.time` comparisons on
  every `findRoute` call).
- **Fail-soft:** empty avoid list = identical to today's un-blacklisted
  behavior.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `_routeAvoid` never expires - a room avoided due to transient congestion stays avoided for the creep's whole life | Scoped to one creep only (never affects others); the creep's own trip is what matters, and a claim/reserve/scout task targets one fixed destination anyway, so over-caution here only ever lengthens THIS creep's own route, never blocks the fleet |
| Removing `isRouteFlapping` drops detection of a pure room-name-alternating bounce where position never freezes | Every live incident reported so far (0060, 0061 x2) actually showed position freezing at a single tile, not a clean alternation - `isStuck` already covers the confirmed real-world case |

## Rollback

Revert the commit - 0061's blacklist/flap mechanism returns exactly as it
was (already spec'd/tested independently).
