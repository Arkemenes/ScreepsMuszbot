# 0164 — Critério econômico do mineral extractor — Tasks

- **Status:** in-progress — T1–T2 publicados em 2026-10-21; T3 com stats/console/Grafana publicados, verificação live pendente. **Issue:** ARK-199. **Contrato:** [spec.md](spec.md).

- [x] **T1 — `extractorEconomics` (cálculo + veredito em cache) e marginal de hauler no needs.** AC1–5, 7. Smoke `0164 cost / unprofitable / cache / profitable / own use / price unknown / flag off`. O custo do hauler é calculado no próprio módulo porque o `scaledBody` lê o needs (recursão).
- [x] **T2 — Gate em `mineralMiner.wanted` e no piso de haulers da operação mineral.** AC2, 6. Smoke `0164 hauler floor` (2).
- [ ] **T3 — Stats, console e Grafana; verificação live do veredito por sala.** AC2. Stats `rooms[sala].extractorEconomics`, console `extractorEconomics(sala)` e painel "Mineral extractor: cotação vs equilíbrio" publicados; falta conferir o veredito ao vivo.
