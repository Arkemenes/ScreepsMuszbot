# 0153 — Revisão da política de listagens — Tasks

Antes de começar: ler a spec (mecânica de taxas e seção de pixel), `ordersAudit()` (já no bundle) e rodá-la para a linha de base.

- [x] 1. `ordersAudit()` (O5) e dados de 2026-10-15 23:06 registrados na spec (publicado)
- [ ] 2. **P1** `listingPolicy.competitive` e `swing.listOnlyCompetitive` no `swingTrade` e em `listResidual` (AC1, AC2)
  - verify: smoke `"0153: no listing above the best competing ask; stock stays free"`, `"0153: a competitive listing is created as before"`
- [ ] 3. **P2** `market.cancelFinished`: cancelar ordens com `remaining 0`; nunca listagens ativas (AC5)
  - verify: smoke `"0153: finished orders are cancelled; active listings are not"`
- [ ] 4. **P3** `tickRate.js` e `swing.listingLifetimeDays` (AC6)
  - verify: smoke `"0153: the listing lifetime is expressed in real time and overridable"`
- [ ] 5. Taxa de preço: teste fixando que reduzir não cobra e aumentar cobra 5% x aumento x restante (AC3)
  - verify: smoke `"0153: a price decrease is free and keeps the id; an increase charges 5% of the increase"`
- [ ] 6. **P4** descida de preço grátis (`swing.descent`, desligada por padrão), com piso por recurso e `afterTicks` (AC4)
  - verify: smoke `"0153: the descent respects the floor and only touches listings above the best ask for long enough"`
- [ ] 7. **P5 Pixel** `listingPolicy.pixelPlan`: `deal` em bids >= `pixel.minBid`; `extendOrder` na ordem existente só se `0,95 x P >= bid x (1 + listMargin)`; nunca segunda ordem; nunca cancelar a listagem existente (AC7, AC8)
  - verify: smoke `"0153: new pixels go to bids first, then extend the existing order only when it pays, never a second order"`, `"0153: the existing pixel listing is never cancelled"`
- [ ] 8. (condicional) orçamento diário de taxa de listagem
- [ ] 9. DoD: `node --check`, smoke com caminho absoluto, `graphify update .`, `npx grunt`; rodar `ordersAudit()` e comparar com a linha de base (AC9); um deploy por item (P1 primeiro)

## Notes

- Decisões do dono: **padrões propostos na spec** (tabela de 5 linhas, relativos ao mercado); ele ajusta depois, sem deploy. Não esperar resposta para começar.
- A taxa das ordens existentes é afundada: nunca entra em decisões futuras, mas **não se cancela sem necessidade** para não perdê-la.
