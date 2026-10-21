# 0164 — Critério econômico do mineral extractor — Plan

- **Status:** in-progress. **Issue:** ARK-199. **Contrato:** [spec.md](spec.md).

## Approach / Modules

- `utils/extractorEconomics.js`: `evaluate(sala)` (cálculo puro sobre `roomCache.minerals`, `mineralMiner.body`, `population.scaledBody`, `market.snapshot`, `resourcePolicy.used`, marginal de hauler do needs) e `admitted(sala)` (veredito em cache em `Memory.rooms[r].extractorEconomics`, revisto por prazo/mineral). Console `extractorEconomics(sala?)`.
- `rooms/needs.js`: registra no heap `mineralHaulerMarginal(sala)` = max(0, `hauler.minCountWithMineral` − haulers sem mineral). `mineralOperationActive` passa a exigir miner vivo ou veredito admitido.
- `roles/mineralMiner.wanted`: devolve 0 sem veredito admitido.
- Stats `rooms[sala].extractorEconomics` {admitted, profit, breakeven, price}; painel Grafana.

Sem recursão: `extractorEconomics` nunca chama `roomNeeds`; lê o marginal da última computação (fallback: o piso inteiro, conservador).

## Validation / Rollout

Smoke `0164 profitable / unprofitable / cache / price unknown / own use / hauler floor / flag off`. Ligado por padrão (decisão do usuário: features novas ligadas). Live: conferir o veredito por sala na primeira publicação de stats.
