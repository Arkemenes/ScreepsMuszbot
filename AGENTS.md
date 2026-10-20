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

## Fluxo de trabalho (Linear + graphify)

- **Tarefas:** o projeto `ScreepsMuszbot` no Linear (workspace e time `Arkemenes`, chave `ARK`) é a fonte de verdade. Antes de começar um trabalho, garanta que exista uma issue; mova-a para *In Progress* ao iniciar e para *Done* ao concluir. Issues criadas por agentes entram no *Backlog* para revisão do usuário. Convenção completa: `90-AI/convencao-projetos-linear.md` no vault Obsidian.
- **Estrutura do código:** quando existir `graphify-out/graph.json`, use `graphify query "<pergunta>"` (relações: `graphify path "A" "B"`; conceitos: `graphify explain "X"`) antes de varrer arquivos. Leia `graphify-out/GRAPH_REPORT.md` só para revisão ampla de arquitetura. Após alterar código, rode `graphify update .` (só AST, sem custo de API).
- **Contexto e decisões:** ficam no vault Obsidian (`90-AI/<agente>/projetos/`); a continuidade entre sessões fica no ai-memory. Nunca grave segredos em issues, notas, grafo ou commits.

## Live game data (Screeps API)

The token in `.env` is **read-only** (query only). `tools/screeps-api.js` is a
GET-only client that reads it (`SCREEPS_TOKEN`, `SCREEPS_HOST`,
`SCREEPS_SHARD`; template in `.env.example`; `.env` is git-ignored). Never
print, log or commit the token.

**When to query:** whenever live evidence matters — measuring CPU before and
after a change, checking the bucket, confirming a deploy behaves as expected,
or when offline tests and the live game disagree. Prefer live data over
guessing.

**Query sparingly.** `/api/user/memory` is rate-limited (~1440 calls/day per
token) and the same budget is consumed by `exporter.py`, which feeds the
Grafana dashboard (one call every `POLL_INTERVAL`=120s, ~720/day). Every call
an agent makes is taken from the dashboard's budget, and an HTTP 429 blocks
both for hours. Rules of thumb:

- One query per question; reuse the output instead of re-fetching.
- Never poll in a loop. After a deploy, wait at least one meter window
  (`stats.cpuWindowTicks`, 60 ticks ≈ 3–4 min) before measuring again.
- Fetch the narrowest path you need (`stats.cpu`, not all of `Memory`).
- On HTTP 429, stop and tell the user; do not retry.

Commands:

- `node tools/screeps-api.js cpu [n]` — bucket, limit, CPU meter window
  (modules / roles / structures / spans) and bucket balance from
  `Memory.stats.cpu`. Use it first for any CPU question.
- `node tools/screeps-api.js memory <path>` — e.g. `stats`, `settings`,
  `rooms.W1N1` (`gz:` payloads are decoded).
- `node tools/screeps-api.js segment <id>` — one RawMemory segment.
- `node tools/screeps-api.js get <endpoint> [k=v ...]` — any GET endpoint,
  e.g. `get /api/user/overview interval=8`.
