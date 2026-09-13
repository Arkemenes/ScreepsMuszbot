# 0045 — Spawn creep renewal + CPU bucket pixel generation — Tasks

- [x] 1. `utils/config.js`: add `renew.ticksToLiveThreshold` (300),
      `renew.minBodyCost` (1000), `renew.minEnergyRatio` (0.8),
      `pixel.bucketThreshold` (10000), `pixel.enabled` (true).
- [x] 2. `utils/census.js`: add `allInRoom(roomName)`.
- [x] 3. `rooms/spawning.js`: add `bodyCost(body)` + `renewIdleSpawns(room,
      spawns)`; wire it in before the request-building loop.
- [x] 4. `main.js`: add the `guard("pixel", ...)` call.
- [x] 5. `test/smoke.js`: mock `spawn.renewCreep`/`Game.cpu.generatePixel`;
      add assertions 1-6 from `spec.md`.
- [x] 6. `node --check` on every touched file; `node test/smoke.js` green;
      `npx grunt` builds.
- [x] 7. `ROADMAP.md` row added, status `done`.
