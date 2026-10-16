# 0155 — Utilização dos labs — Tasks

- [ ] 1. Contadores heap por sala/lab em `labPolicyRuntime.assignments` (onde `state.wait = reasons`) (AC1)
  - verify: smoke `"0155: counters reproduce the scripted lab states"`
- [ ] 2. `labReport` (`reactionLimited`/`inputLimited`, unidades/dia estimadas, comparação com a produção da cadeia) (AC2)
  - verify: smoke `"0155: reactionLimited true at ~95% productive ticks; inputLimited true at ~50%"`
- [ ] 3. Auto-relatório pós-boot (`stats.autoLabReportTicks`) e console `labReport(n)` (AC3)
  - verify: smoke `"0155: the report prints by itself and changes no lab decision"`
- [ ] 4. Conferir `REACTION_TIME` real no jogo e registrar nas Notes
- [ ] 5. DoD: `node --check`, smoke, `graphify update .`, `npx grunt`; medir overhead pelos spans do `cpuReport` (AC4); deixar >= 1 dia e registrar a conclusão (alimenta 0150 fase 1)

## Notes

- A conclusão `reactionLimited = false` encerra a ideia do `OPERATE_LAB` (ganho ~0); o melhor ganho passa a ser transporte/reagente.
