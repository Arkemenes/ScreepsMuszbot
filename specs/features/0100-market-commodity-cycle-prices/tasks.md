# 0100 — Preço direto para ciclos de commodities — Tasks

- [x] 1. Especificar a distinção entre receita reversível e commodity derivável.
  - verify: `spec.md` define `(AC1)` e `(AC2)`
- [x] 2. Detectar ciclos e preservar cotação temporal dos nós participantes.
  - verify: `node --check src/utils/market.js`
- [x] 3. Adicionar regressão para `energy`/`O` e commodity acíclica.
  - verify: smoke assertions `(AC1, AC2)`
- [x] 4. Validar e fechar a feature. Live 2026-10-20: `Memory.stats.market.fairPrice` com energy 32,56 e O 32,21 (buy/sell/fair não nulos) e commodities (oxidant, battery, utrium_bar) com preço.
  - verify: `node test/smoke.js` · `npx grunt`
