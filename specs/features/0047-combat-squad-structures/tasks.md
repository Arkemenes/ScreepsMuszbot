# 0047 — Combat squad clears hostile structures too — Tasks

- [x] 1. `utils/squad.js`: add `missionComplete(squad)`; wire into
      `advance()`'s advancing-state block.
- [x] 2. `roles/defenderStriker.js`: squad-mode branch attacks a hostile
      structure when no hostile creep is present.
- [x] 3. `test/smoke.js`: add assertions 1-5 from `spec.md`.
- [x] 4. `node --check` on every touched file; `node test/smoke.js` green;
      `npx grunt` builds.
- [x] 5. `ROADMAP.md` row added, status `done`.
