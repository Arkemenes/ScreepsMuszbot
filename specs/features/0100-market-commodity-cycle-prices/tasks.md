# 0100 — Preço direto para ciclos de commodities — Tasks

- [x] 1. Especificar a distinção entre receita reversível e commodity derivável.
  - verify: `spec.md` define `(AC1)` e `(AC2)`
- [x] 2. Detectar ciclos e preservar cotação temporal dos nós participantes.
  - verify: `node --check src/utils/market.js`
- [x] 3. Adicionar regressão para `energy`/`O` e commodity acíclica.
  - verify: smoke assertions `(AC1, AC2)`
- [ ] 4. Validar e fechar a feature.
  - verify: `node test/smoke.js` · `npx grunt`
