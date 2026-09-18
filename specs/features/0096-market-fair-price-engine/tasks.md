# 0096 — Market fair-price engine — Tasks

Ordenadas e verificáveis. Nenhuma tarefa chama `deal`, `createOrder` ou
`cancelOrder`.

- [x] 1. Adicionar os defaults de `market` e integrar `utils/market.js` ao índice e ao loop.
  - verify: `node --check src/utils/market.js src/main.js` · scan protegido por `guard`
- [x] 2. Implementar snapshots temporais e mediana ponderada por volumetria.
  - verify: smoke assertions para snapshots, mediana, pesos e throttle
- [x] 3. Registrar `marketPrice(resourceType?)` e a entrada de `help()`.
  - verify: smoke assertion para `(AC6)` e grep manual sem operações de ordem `(AC5)`
- [x] 4. Atualizar `test/smoke.js` com mock parcial e contadores do mercado.
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 5. Rodar checks finais e fechar a documentação.
  - verify: `node --check` nos arquivos tocados · `node test/smoke.js "$(pwd)"` · `npx grunt` · atualizar `ROADMAP.md`/`ARCHITECTURE.md` e marcar `done`
- [x] 6. Exportar o resultado temporal em `Memory.stats.market.fairPrice` e cobrir o contrato no smoke.
  - verify: assertion de `Memory.stats.market.fairPrice` com buy/sell/fair/sample/confidence

## Notes

- Decisão inicial: `marketPrice(resourceType?)`; sem argumento lista só recursos
  com volume histórico positivo ou book atual disponível.
- Decisão aprovada: não usar `getHistory()` nem transações próprias no preço
  final; capturar melhor BUY/SELL ao longo do tempo.
- Decisão aprovada: mediana temporal ponderada pelo volume do melhor nível,
  limite de peso de 1% por snapshot e midpoint somente com os dois lados.