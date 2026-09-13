# 0045 — Spawn creep renewal + CPU bucket pixel generation — Plan

## Approach

Two independent one-shot additions, same feature number for bookkeeping.
Renewal is a pre-pass in `rooms/spawning.js` that filters the already-computed
idle-spawn list before the existing request-building code runs, so it's a
pure insertion with no change to the existing spawn-picking logic. Pixel
generation is a single guarded call in `main.js`, next to the other
top-level per-tick guards.

## Modules

### New

None.

### Changed

| Path | Change |
|------|--------|
| `src/utils/census.js` | add `allInRoom(roomName)` — flattens `byRoomRole[roomName]`'s role buckets into one array, built from the existing per-tick cache |
| `src/rooms/spawning.js` | add `renewIdleSpawns(room, spawns)`, called before the request loop; returns the subset of `spawns` that did NOT renew this tick |
| `src/main.js` | add `guard("pixel", () => { ... })` calling `Game.cpu.generatePixel()` above the bucket threshold |
| `src/utils/config.js` | add `renew.*` (3 keys) and `pixel.*` (2 keys) defaults |

## Data shapes

No Memory/heap/segment changes — everything here is decided live from
`Game.creeps`/`Game.spawns`/`Game.cpu` each tick, nothing persisted.

## How it satisfies the constitution

- **CPU:** `allInRoom()` costs nothing extra over `census.build()`'s existing
  single pass. Renewal only evaluates spawns already known to be idle.
- **Memory:** none touched.
- **Fail-soft:** every native call (`renewCreep`, `generatePixel`) is a
  return-code call, never thrown; a bad result just means "skip this tick."
- **Offline test:** `test/smoke.js` mocks `spawn.renewCreep` (records the
  call + returns OK/ERR_FULL as the test needs) and `Game.cpu.generatePixel`
  (records call count) — see spec's acceptance criteria 1-6.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| A spawn calls `renewCreep()` AND `spawnCreep()` the same tick (unclear if the engine allows both spawn-related intents in one tick) | `renewIdleSpawns()` removes a spawn from the list the instant it successfully renews, so the rest of `spawnCreeps()` never sees it this tick — avoids the question entirely. |
| Renewal starves the normal spawn queue by constantly consuming energy | Gated behind `renew.minEnergyRatio` (default 0.8) — only fires when the room already has energy to spare, and it only ever touches a spawn that was already idle (nothing it could have spawned anyway with that spawn this tick, since renewal and the queue draw are mutually exclusive per spawn as above). |

## Rollback

Both additions are self-contained and guarded (`main.js`'s `guard("pixel", ...)`
already isolates the pixel call; the renewal pre-pass is a pure function that,
if it misbehaves, can be disabled by setting `Memory.settings.renew.minBodyCost`
to `Infinity` — no candidate will ever qualify — without a redeploy). A real
rollback is reverting the diff in `spawning.js`/`main.js`/`config.js`/`census.js`.
