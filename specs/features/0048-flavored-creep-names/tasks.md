# 0048 — Flavored creep names — Tasks

- [x] 1. `utils/names.js`: first-name pool, per-role/mission title pools,
      `generate(key)`.
- [x] 2. Sweep every `src/roles/*.js` `spawnData()` to use
      `names.generate()`; confirm `grep -rn "\" + Game.time" src/roles/`
      returns nothing left over from a bare role-name literal.
- [x] 3. `test/smoke.js`: add assertions 1-4 from `spec.md`.
- [x] 4. `node --check` on every touched file; `node test/smoke.js` green;
      `npx grunt` builds.
- [x] 5. `ROADMAP.md` row added, status `done`.
