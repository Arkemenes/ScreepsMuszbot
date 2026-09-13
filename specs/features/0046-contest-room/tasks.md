# 0046 — contestRoom() — Tasks

- [x] 1. `rooms/raiding.js`: import `isAlly` from `utils/hostiles`; add
      `contestRefusalReason(roomName)`.
- [x] 2. `rooms/raiding.js`: add `global.contestRoom()` (validation, travel
      budget check, `Memory.contestTarget`) and `global.cancelContest()`.
- [x] 3. `roles/reserver.js`: add the `"contest"` mission branch to `run()`
      and the contest-priority branch to `spawnData()`.
- [x] 4. `rooms/needs.js`: add `contestPending` to the reserver count.
- [x] 5. `utils/console.js`: document `contestRoom`/`cancelContest`.
- [x] 6. `test/smoke.js`: add assertions 1-6 from `spec.md`.
- [x] 7. `node --check` on every touched file; `node test/smoke.js` green;
      `npx grunt` builds.
- [x] 8. `ROADMAP.md` row added, status `done`.
