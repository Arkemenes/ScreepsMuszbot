# 0051 — Mineral/lab/factory/power spawn — Tasks

## Fase 0 — link never helps the mineral cluster

- [x] 1. `rooms/architect.js` — mineral cluster skips the primary link too (moved the `!isSource` early-return before link placement).
- [x] 2. `test/smoke.js` — assertion: no link is planned within range 1 of the mineral.

## Fase 1 — Mineral

- [x] 3. `roles/mineralMiner.js` — sit on container, harvest, self-contained wanted/spawn/spawnData.
- [x] 4. `roles/index.js` — register it.
- [x] 5. `roles/hauler.js` — `pickMineralJob()` (mineral container job), `runMineralJob()`, wired into the idle branch.
- [x] 6. `test/smoke.js` — assertions for criteria 1-2.

## Fase 2 — Lab

- [x] 7. `structures/lab.js` — output-lab-only `runReaction`.
- [x] 8. `structures/index.js` — register `lab`.
- [x] 9. `rooms/refining.js` — `setLabReaction`/`cancelLabReaction`/`boostCreep`.
- [x] 10. `roles/hauler.js` — extend `pickMineralJob()` with lab reagent/output jobs.
- [x] 11. `test/smoke.js` — assertions for criteria 3-6.

## Fase 3 — Factory

- [x] 12. `structures/factory.js` — gated `produce()`.
- [x] 13. `structures/index.js` — register `factory`.
- [x] 14. `rooms/refining.js` — `setFactoryProduct`/`cancelFactoryProduct`.
- [x] 15. `roles/hauler.js` — extend `pickMineralJob()` with factory component/output jobs.
- [x] 16. `test/smoke.js` — assertions for criteria 7-8.

## Fase 4 — Power spawn

- [x] 17. `structures/powerSpawn.js` — gated `processPower()`.
- [x] 18. `structures/index.js` — register `powerSpawn`.
- [x] 19. `roles/hauler.js` — extend `pickMineralJob()` with power-feed job.
- [x] 20. `test/smoke.js` — assertions for criterion 9.

## Transversal

- [x] 21. `roles/hauler.js` — `optionalConsumer()` gains factory/power spawn energy.
- [x] 22. `utils/config.js` — `mineralHauler.labBuffer`, `powerSpawn.enabled`.
- [x] 23. `utils/console.js` — "Refino" section.
- [x] 24. `utils/names.js` — `mineralMiner` title pool.
- [x] 25. `test/smoke.js` — assertion for criterion 10; mock `REACTIONS`/`COMMODITIES`.
- [x] 26. `node --check` every touched file; `node test/smoke.js` green; `npx grunt` builds.
- [x] 27. `ROADMAP.md` row (0051, status `done`) + `ARCHITECTURE.md` update + two new "Later" items (Power Creep/GPL, power bank raiding).
