# 0085 — Scout route trace — Tasks

- [x] 1. Expor `scoutTrace(enabled?)` em `roles/scout.js` (AC1, AC2)
  - verify: `node --check src/roles/scout.js`
- [x] 2. Adicionar log opt-in em `utils/routing.js` (AC3)
  - verify: `node --check src/utils/routing.js`
- [x] 3. Atualizar `test/smoke.js` com assertions de `scoutTrace` (AC1, AC2)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 4. Atualizar documentação, rodar validação e build
  - verify: `npx grunt`

## Notes

- A investigação ao vivo usa o comando publicado, não monkey-patch no console.