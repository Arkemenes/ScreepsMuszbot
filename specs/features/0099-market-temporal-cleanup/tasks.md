# 0099 — Limpeza do cálculo temporal de fair price — Tasks

- [x] 1. Remover helpers/exportações e defaults VWAP/histórico mortos.
  - verify: busca por seus identificadores não retorna call site ativo
- [x] 2. Atualizar o smoke e help para o contrato temporal `(AC1, AC3)`.
  - verify: assertion `"market exports only the active temporal fair-price API"`
- [ ] 3. Corrigir documentação de 0096 e fechar a feature `(AC2, AC4)`.
  - verify: `node --check` · `node test/smoke.js` · `npx grunt` num Node
    compatível com `grunt@1.0.1`
