# 0084 — Custo de rota baseado no corpo do creep — Tasks

- [x] 1. Implementar a derivação de custos plain/swamp a partir do body.
  - verify: `node --check src/utils/routing.js`
- [x] 2. Passar os custos derivados à busca de terreno da viagem.
  - verify: smoke assertion sobre custos rápidos/lentos.
- [x] 3. Atualizar `test/smoke.js` com assertions de fallback e propagação.
  - verify: `node test/smoke.js "$(pwd)"` verde.
- [x] 4. Atualizar arquitetura e roadmap; build final.
  - verify: `npx grunt` e `git diff --check`.

## Notes

- A fórmula segue a documentação oficial de Movement; `roles/miner.js` tem uma
  estimativa histórica separada e não é a fonte normativa.
