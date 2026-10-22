# 0173 — defendRoom — Tasks

- [x] 1. Criar ARK-220 e mover para In Progress.
- [x] 2. Console `defendRoom`/`cancelDefend` em raiding.js. (AC1, AC6)
  - verify: node --check src/rooms/raiding.js
- [x] 3. Missão `"defend"` no raider: run, spawnData e `defendPending`. (AC2, AC3, AC4)
  - verify: node --check src/roles/raider.js
- [x] 4. Contagem separada em needs.js e prioridade em spawning.js. (AC5)
  - verify: node --check nos dois arquivos.
- [x] 5. Smoke AC1–AC6, ajuda do console, ROADMAP/ARCHITECTURE, grunt.
  - verify: node test/smoke.js verde; npx grunt.
- [x] 6. Aceite live: `defendRoom("W9N49", "W7N49")` spawna o raider de defesa em W7N49 (confirmado pelo usuário em 2026-10-21). O invader morreu antes de o raider chegar, então o combate em si ficou coberto só pelo smoke.
