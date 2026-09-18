# 0095 — Coordenação de jobs não energéticos do hauler — Tasks

- [x] 1. Criar classificação de pressão e eleição heap por sala. `(AC3, AC6)`
  - verify: `node --check src/utils/nonEnergyLogistics.js`
- [x] 2. Integrar energia acionável, preempção e compromisso no `hauler`.
      `(AC1, AC2, AC4, AC5, AC8, AC9, AC10)`
  - verify: `node --check src/roles/hauler.js` · smoke focado da 0095
- [x] 3. Aplicar piso de dois haulers com histerese 75%/50%. `(AC7)`
  - verify: `node --check src/rooms/needs.js` · assertion
    `"hauler pressure population uses 75/50 hysteresis"`
- [x] 4. Atualizar `test/smoke.js` para os critérios AC1–AC10.
  - verify: `node --check test/smoke.js` · `node test/smoke.js "$(pwd)"`
- [x] 5. Atualizar arquitetura/outcomes, rodar `npx grunt` e marcar `done`.
  - verify: smoke verde · build gera `dist/main.js`

## Notes

- O comportamento anterior era A, não B: `criticalConsumers > 0` vetava o
  job mesmo quando `pickLoad()` não encontrava nenhuma energia utilizável.
- Implementado sem nova role e sem nova chave persistente por sala. A reserva
  do owner e a pressão derivada vivem somente no heap.
- Revisão pós-smoke adicionou guards contra carga mista, jobs legados
  duplicados e claim de energia residual no mesmo tick.