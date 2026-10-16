# 0153 — Revisão da política de listagens — Plan

## Approach

Mudanças pequenas e separáveis no ponto onde a listagem de venda é decidida (`swingTrade.tick`, ramo `eligible-listing`, e
`terminalOps.listResidual`), todas atrás de flags em `Memory.settings`. Ordem de entrega: (1) listar só se competitiva,
(2) limpar ordens esgotadas, (3) prazo em tempo real, (4) descida de preço grátis, (5) pixel. A auditoria (`ordersAudit`) já está
publicada e mede o antes/depois. Nada muda em vendas imediatas por `deal` em bids existentes.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/listingPolicy.js` | decisões puras: `competitive(order, book, floor, step)`, `descentStep(listing, book, floor, cfg)`, `pixelPlan(stock, bids, order, cfg)` (bids/extend/hold); sem efeitos (quem chama executa) |
| `src/utils/tickRate.js` | estima segundos por tick no heap (`Date.now`, média móvel, fallback 4,1 s); `daysToTicks(days)` |
| `test/listingPolicyCases.js` | oráculos de `competitive`, `descentStep`, `pixelPlan`, taxa de aumento x redução, prazo em tempo real |

### Changed

| Path | Change |
|------|--------|
| `src/utils/swingTrade.js` | ramo de listagem usa `listingPolicy.competitive`; senão `observe(... "listing-not-competitive")` e mantém o estoque livre; `expire()` usa o prazo em tempo real |
| `src/utils/terminalOps.js` (`listResidual`) | mesma checagem antes de `createOrder`; descida de preço via `changeOrderPrice` (já grátis para baixo); pixel: `deal` em bids, `extendOrder` na ordem existente, nunca segunda ordem |
| `src/utils/ordersAudit.js` | `cancelFinished()` por flag; contadores `descended`/`cancelledFinished` |
| `src/utils/config.js` | `swing.listOnlyCompetitive:true`, `swing.listingLifetimeDays:7`, `swing.descent:{enabled:false, afterTicks, stepRatio:0.02, floor:{}}`, `pixel:{minBid, minPrice, listMargin:0.03}`, `market:{cancelFinished:true, listingFeeDailyBudget:null}` |

## Data shapes

Heap: tick-rate médio. Memory: nenhuma nova (`swing.noRelist` já existe). Config em `Memory.settings`. Preços do pixel vêm do
`market.snapshot()` e dos bids reais (`orderBook.byResource("pixel")` ou consulta de ordens intershard).

## How it satisfies the constitution

- **CPU:** a checagem usa `orderBook.byResource` (índice por tick já existente); sem varredura nova. **Memory:** nada novo.
- **Fail-soft:** flag desligada = comportamento antigo. **Offline test:** `listingPolicyCases.js` reaproveita o fixture de `stockPolicyCases`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Estoque fica parado sem listar | reavaliação a cada scan (120 ticks); entra quando o preço fica competitivo; `ordersAudit` mostra o estoque parado |
| Descida vende abaixo da política | **desligada por padrão**; só com piso por recurso definido pelo dono; nunca abaixo do piso |
| Pixel: `extendOrder` paga taxa em quantidade grande | só se `0,95 x P >= bid x (1 + listMargin)`; senão `deal` em bid ou estoque; nunca segunda ordem |
| Prazo em tempo real muda com o tick-rate | média móvel com piso/teto; fallback 4,1 s/tick |
| Cancelar a listagem de pixel por engano | teste fixa que a política nunca cancela listagem ativa de pixel |
