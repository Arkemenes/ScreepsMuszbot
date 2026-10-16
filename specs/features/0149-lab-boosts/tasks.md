# 0149 — Boosts de lab automáticos — Tasks

Pré-requisitos: 0154 entregue (`energyReport` com duty por ação). Ler a regra de mercado (§3b do roadmap).

- [ ] 1. `boostPolicy.js`: tabela `PER_UNIT`, `worth()`, histerese, leitura de `BOOSTS` ao vivo (AC1)
  - verify: smoke `"0149: worth flips at E* with hysteresis for build/repair/upgrade at E=20/31.6/70"`
- [ ] 2. `boostMarket.js`: custo executável (ask na quantidade + frete x E + taxas), bid líquido para estoque próprio (AC2)
  - verify: smoke `"0149: compound purchase uses existing orders only and never lists"`, `"0149: missing depth aborts without a listing"`
- [ ] 3. `config.boost.*` (`enabled:false`) e `boostStatus()` no console
  - verify: `node --check`; smoke da leitura de config
- [ ] 4. `spawnData`: decisão no spawn + `memory.boost`; fallback sem boost (AC3)
  - verify: smoke `"0149: spawns unboosted when compound or depth is missing; never waits"`
- [ ] 5. `boostLogistics.js` + job `boostLoad` do hauler + reserva/liberação de lab (AC5)
  - verify: smoke `"0149: reserved lab leaves production and returns after the deadline"`
- [ ] 6. Passo `boostSelf` no builder (fase 1) com `deadline`
  - verify: smoke `"0149: builder boosts once and works; expires without the compound"`
- [ ] 7. Teste de `energyLedger` (AC4) — já coberto por `energyLedgerEngineCases.js`; só referenciar
- [ ] 8. Definition of done: `node --check`, smoke com caminho absoluto, `graphify update .`, `npx grunt` (publica), `cpuReport` sem regressão; ligar `boost.enabled` **numa sala** e acompanhar 1 vida de creep; invariantes (AC6, AC7)
- [ ] 9. Fases 2 (upgrader) e 3 (hauler CARRY) só depois de revisar os números reais da fase 1

## Notes

- Regra do dono: preços flutuam; nenhuma conclusão fixa. Tabela de `E*` do roadmap §2.3 é só ilustrativa.
- Compostos de mercado raso (GH, GH2O, LH): ask muito acima do fair; só estoque próprio ou compra com profundidade.
