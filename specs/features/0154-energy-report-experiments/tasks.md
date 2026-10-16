# 0154 — `energyReport` e experimentos — Tasks

- [ ] 1. Acumuladores de janela longa no heap, alimentados por `energyLedger.record` (AC1, AC5)
  - verify: smoke `"0154: long-window totals match the 60-tick snapshot"`
- [ ] 2. `energyReport.print` (duty, RCL/ETA, Δ estoque) e auto-relatório pós-boot (AC2)
  - verify: smoke `"0154: energyReport prints by itself with duty, RCL pace and ETA"`
- [ ] 3. `experiment.js`: start/stop/tick, uma sala por experimento, relatório (AC3)
  - verify: smoke `"0154: an experiment applies to one room and restores at the end, on abort and after a reset"`
- [ ] 4. Guardas e rollback automático com motivo (AC4)
  - verify: smoke `"0154: the guard rolls the experiment back and records why"`
- [ ] 5. Console (`energyReport(n)`, `experimentStart/Stop`) e ajuda
  - verify: `node --check`; smoke da ajuda
- [ ] 6. DoD: `node --check`, smoke com caminho absoluto, `graphify update .`, `npx grunt`; deixar o auto-relatório rodar e registrar o primeiro relatório nas Notes (o duty real alimenta 0148 e 0149)

## Notes

- `energyLedger` já é exato (fórmula do motor, corrigido em 2026-10-15): repair = hits x 0,01; boost não soma energia.
