# AGENTS.md

Guidance for AI assistants working in this repo.

## This project is spec-driven

Before any non-trivial change, read:

1. [`specs/constitution.md`](specs/constitution.md) — non-negotiable principles
2. [`specs/ARCHITECTURE.md`](specs/ARCHITECTURE.md) — current system shape
3. [`specs/ROADMAP.md`](specs/ROADMAP.md) — the backlog

The specs use Portuguese prose with English/code technical anchors (file
paths, identifiers, section headers, smoke-assertion strings). Match that
style when writing new specs. Conversation with the user is in Portuguese;
code comments stay English.

For a new feature, follow [`specs/README.md`](specs/README.md):
`spec.md` → review → `plan.md` → `tasks.md` → implement task-by-task.
Create `specs/features/NNNN-name/` (next free number) and a `ROADMAP.md` row.

## Definition of done (every code change)

- `node --check` on every touched file — clean
- `node test/smoke.js "$(pwd)"` — green (add/adjust assertions for the
  change)
- `npx grunt` — builds `dist/main.js`
- `ROADMAP.md` / `ARCHITECTURE.md` updated if status or shape changed

## Hard rules (from the constitution — do not violate)

- One pass over `Game.creeps` per tick → use `utils/census`.
  One `room.find(type)` per tick → use `utils/roomCache`.
- Never put a game object in `Memory` — store `.id`, resolve with
  `Game.getObjectById`.
- Static/derived data (terrain, cost matrices, routes) → heap, not `Memory`.
- Every subsystem call in `main.js` is wrapped by `guard()`.
- Loops / step machines need a stall guard, not `while (true)`.
- Config (enemy list, counts, flags) → `Memory.settings` / a config module,
  not literals.

## Build

`grunt` (`grunt-scripts/mergeFiles.js` + `module-concat`) bundles the `require`
graph from `src/main.js` into `dist/main.js`. `dist/` is git-ignored.

## Offline testing

`test/smoke.js` stubs `Game` / `Memory` / Screeps constants and runs
`main.loop()` across several phases plus unit checks. It is the only test
harness — keep it green and extend it.
