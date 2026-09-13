# 0051 — Mineral/lab/factory/power spawn — Plan

## Approach

One new economy role (`mineralMiner`) plus one `rooms/refining.js` config
module (the "what to produce" decision point, mirroring `remotes.js`/
`raiding.js`). Non-energy logistics (mineral/lab/factory/power) is
deliberately **not** a new role - it was originally designed as one
(`mineralHauler.js`), but reviewing the design with the user surfaced two
better calls: (1) a link can only ever move `RESOURCE_ENERGY` (engine
restriction), so `architect.js` was quietly wasting a link slot on the
mineral cluster for a use it could never serve - fixed, no link there
anymore; (2) mineral/lab/factory throughput is slow enough that a
dedicated hauler-like creep would sit idle almost all the time
(constitution §7). Both led to folding the non-energy logistics into
`roles/hauler.js` itself as its lowest-priority fallback, reusing its
already-idle ticks instead of spawning anything new. Each `structures/*`
module only executes what `Memory.rooms[x]` already says to do - no
strategy lives in `structures/`. `REACTIONS`/`COMMODITIES` are read live
from the Screeps-provided globals, never duplicated into source.

## Modules

### New

| Path | Responsibility |
|------|-----------------|
| `src/roles/mineralMiner.js` | Sits on the mineral container, harvests while there's a deposit target |
| `src/structures/lab.js` | Output lab runs the configured reaction |
| `src/structures/factory.js` | Factory produces the configured level-0 commodity once stocked |
| `src/structures/powerSpawn.js` | Processes power whenever any is stored |
| `src/rooms/refining.js` | `setLabReaction`/`cancelLabReaction`/`boostCreep`/`setFactoryProduct`/`cancelFactoryProduct` console surface + validation |

### Changed

| Path | Change |
|------|--------|
| `src/rooms/architect.js` | mineral cluster no longer gets a primary link (only ever useful for a source) |
| `src/roles/index.js` | register `mineralMiner` |
| `src/rooms/index.js` | `require("./refining")` for its console-command side effects |
| `src/structures/index.js` | register `lab`, `factory`, `powerSpawn` |
| `src/roles/hauler.js` | `optionalConsumer()` also targets `STRUCTURE_FACTORY`/`STRUCTURE_POWER_SPAWN` for energy; new lowest-priority non-energy fallback (`pickMineralJob()`/`runMineralJob()`, `memory.mineralJob`) picked up only from the existing "load, nothing to load, tank empty" branch |
| `src/utils/config.js` | `mineralHauler.labBuffer` (500), `powerSpawn.enabled` (true) |
| `src/utils/console.js` | "Refino" section |
| `src/utils/names.js` | `mineralMiner` title pool |

## Data shapes

- `Memory.rooms[name].labReaction = { a, b, product, output, input1, input2 }` - all mineral-type strings / structure ids, no game objects.
- `Memory.rooms[name].factoryProduct = "<resourceType>"`.
- `creep.memory.mineralJob` (hauler, ROADMAP 0051): `{ resourceType, fromId, toId }` - set only from the idle branch, cleared on delivery/dead-end.

## How it satisfies the constitution

- **CPU:** see spec's Constitution check - no new `room.find`, `roomCache`/`Memory` only. `pickMineralJob()` is only ever evaluated when the hauler would otherwise call `waitForEnergy()` - strictly additional cost on an already-idle tick, never on a busy one.
- **Memory:** two small per-room objects, ids/strings only, plus one small per-hauler-creep job object.
- **Fail-soft:** every native call is return-code, guarded by a cheap precondition (cooldown, store contents) before calling - a wrong precondition just means "try again next tick", never an exception.
- **Config over hardcode:** `mineralHauler.labBuffer`/`powerSpawn.enabled`. Chemistry/commodity data is never hardcoded - read from `REACTIONS`/`COMMODITIES` at call time.
- **Prefer the no-op:** no new role for logistics - see Approach above.
- **Offline test:** `test/smoke.js` defines a small representative mock of `REACTIONS`/`COMMODITIES` (not the full real table - the real server supplies the authoritative one; the mock only needs to be internally consistent for exercising the code paths).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `setLabReaction`'s lab-triple-picking picks labs that don't actually satisfy `runReaction`'s real range-2 rule in some edge layout | Explicit range check (`output.pos.getRangeTo(candidate) <= 2`) before accepting a triple - refuses with a clear message instead of guessing. |
| A hauler mid-`mineralJob` stops contributing to the room's energy economy for the trip's duration | Accepted tradeoff, explicitly chosen by the user over spawning a dedicated (mostly-idle) role - the job is only ever picked up when the hauler had nothing energy-related to do anyway, and the cadence (mineral regen, lab/factory cooldowns) is slow enough that an occasional multi-tick detour is cheap. |
| Test mock `REACTIONS`/`COMMODITIES` diverges from the real server table | Explicitly documented as acceptable (spec's Constitution check) - the code never encodes chemistry, so a real-server mismatch can't happen; only the *test*'s coverage of code paths could be incomplete, not the *behavior*. |

## Rollback

Each phase is additive and independently revertible: delete the new role/
structure/room files, remove their `index.js` registration, revert
`hauler.js`'s fallback block, and the two `Memory.rooms[x]` keys are simply
never read again (harmless leftovers, same as any other feature's Memory
key after a revert). The `architect.js` link fix is a one-line change
(moving an early-return) and reverts just as easily, though there's no
reason to.
