# 0093 — Builder aguarda estabilidade econômica — Tasks

- [x] 1. Adicionar gate de estabilidade ao `builder.js`.
  - verify: `node --check src/roles/builder.js`
- [x] 2. Atualizar `test/smoke.js` com construção bloqueada/permitida e reparo crítico.
  - verify: assertions AC1–AC3 e `node test/smoke.js "$(pwd)"`
- [x] 3. Atualizar `ROADMAP.md`.
  - verify: revisão documental
- [x] 4. Rodar validação final e marcar a feature como `done`.
  - verify: `node --check`, smoke verde e `npx grunt`
