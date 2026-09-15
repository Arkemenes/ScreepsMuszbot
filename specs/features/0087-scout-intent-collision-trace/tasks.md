# 0087 — Scout intent collision trace — Tasks

- [x] 1. Implementar o registro heap-only em `utils/traffic.js` (AC1, AC2)
  - verify: `node --check src/utils/traffic.js`
- [x] 2. Instrumentar `move`/`moveTo`, roteador e flush do tick (AC2, AC3)
  - verify: `node --check src/prototypes/move.js src/utils/routing.js src/main.js`
- [x] 3. Adicionar assertions no smoke (AC1, AC2)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 4. Rodar build e atualizar documentação (AC4)
  - verify: `npx grunt`

## Notes

- Evidência de partida: `status: 0`, fadiga 0, mesma posição e `nextStep.creeps: []` em quatro ticks consecutivos.