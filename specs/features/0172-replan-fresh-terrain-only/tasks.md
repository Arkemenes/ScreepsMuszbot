# 0172 — replanRoom fresh: plano só pelo terreno — Tasks

- [x] 1. Criar ARK-219 e mover para In Progress.
  - verify: issue no Linear vinculada a esta spec.
- [x] 2. `ignoresBuilt` e os quatro pontos de reaproveitamento em architect.js; opção `fresh` em `replanRoom`. (AC2, AC3, AC4)
  - verify: node --check src/rooms/architect.js
- [x] 3. Ajuda do console. 
  - verify: node --check src/utils/console.js
- [x] 4. Smoke AC1–AC4.
  - verify: node test/smoke.js verde.
- [x] 5. ROADMAP/ARCHITECTURE, grunt, Done no Linear.
- [x] 6. `firstSpawnAnchor`: spawn construído, senão construction site de spawn; ignorado no modo fresh. (AC5)
  - verify: smoke verde.
- [x] 7. Teste live em W9N49 mostrou que o fresh ignorava o site de spawn; agora o site vale também no modo fresh. (AC5)
  - verify: smoke verde; refazer replanRoom("W9N49", {fresh: true}) no jogo.
