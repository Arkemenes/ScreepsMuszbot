# 0150 — Power — Tasks

Antes de começar: ler a regra de mercado (§3b), rodar `JSON.stringify(Game.gpl)`, `marketPrice("power")`,
`marketPrice("energy")`, `ordersAudit()` (quais ordens de power existem e a taxa já paga).

**Fase 0 (P1)**
- [ ] 1. `powerPolicy.decide()` com custo restante, ganho diário configurável e histerese (AC1, AC4)
  - verify: smoke `"0150: decide processes/pauses by payback at E=20/31.6/70 with 20% hysteresis"`, `"0150: missing price confidence keeps the previous state"`
- [ ] 2. `config.power.*` e `powerStatus()` (AC6)
  - verify: smoke da leitura de config e da saída
- [ ] 3. `powerLogistics`: cancelar as listagens de power a processar; `terminalOps.transfer` para a sala do power spawn (AC2)
  - verify: smoke `"0150: processing cancels power listings, transfers the power and creates no order"`
- [ ] 4. `powerSpawn.run` e `powerFeedJob` respeitam a política (pausa/retomada), energia só do excedente (AC7)
  - verify: smoke `"0150: a paused policy stops feeding; resuming restarts"`
- [ ] 5. Excedente acima de GPL 3: venda só em bids existentes, sem listagem (AC3)
  - verify: smoke `"0150: surplus power is sold only through existing bids"`
- [ ] 6. DoD da fase 0: `node --check`, smoke, `graphify update .`, `npx grunt`; acompanhar `powerStatus()` por 1 dia e anotar GPL/dia nas Notes

**Fase 1 (gate)**
- [ ] 7. Ler `labReport` (0155): utilização >= limiar (`power.creep.minLabUtilization`) por >= 2 dias; calcular o `ganho_diário` real com preços executáveis; registrar nas Notes e decidir

**Fase 2 (PC1)**
- [ ] 8. `powerOperator.run`: spawn, `enableRoom`, renew, `GENERATE_OPS`, reserva de ops (AC5)
  - verify: smoke `"0150: power creep renews before expiring and never casts without ops"`
- [ ] 9. `OPERATE_LAB` nos labs de saída (10 ops por 1000 ticks por lab; 2 labs sustentados por `GENERATE_OPS` T1)
  - verify: smoke `"0150: OPERATE_LAB targets output labs with reagent and respects the ops budget"`
- [ ] 10. Teto de CPU e auto-desligamento; `guard()`; console `createPowerCreep`/`upgradePowerCreep` (GPL manual)
  - verify: smoke `"0150: the power creep is disabled past its CPU cap"`
- [ ] 11. DoD: smoke, `npx grunt`, custo de CPU do creep pelos spans do `cpuReport`, medir produção de XLH2O/dia antes e depois

## Notes

- Fórmula confirmada: custo cumulativo do nível N = `1000 x N²` (400/3000 no nível 1).
- `OPERATE_TERMINAL` e `OPERATE_FACTORY` custam 100 ops por uso; `GENERATE_OPS` T1 dá 20 ops/1000 ticks: inviáveis no T1.
