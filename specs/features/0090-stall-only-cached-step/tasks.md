# 0090 — Passo cacheado só no stall — Tasks

- [x] 1. Separar cortesia e recovery pontual em `routing.js` (AC1, AC2, AC3)
  - verify: `node --check src/utils/routing.js`
- [x] 2. Atualizar as assertions de rota no smoke (AC1, AC2, AC3)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 3. Rodar build e atualizar documentação (AC4)
  - verify: `npx grunt`

## Notes

- 0089 corrigiu a inércia, mas o passo direto contínuo desviou o percurso normal.