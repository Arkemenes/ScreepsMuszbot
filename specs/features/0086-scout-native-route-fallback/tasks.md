# 0086 — Scout native-route fallback — Tasks

- [x] 1. Remover o opt-in `nativeRoute` de `signRoom` (AC1, AC2)
  - verify: `node --check src/roles/scout.js`
- [x] 2. Atualizar `test/smoke.js` para observar as opções de rota (AC1)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 3. Rodar build e atualizar documentação (AC3)
  - verify: `npx grunt`

## Notes

- Evidência ao vivo: `native-after.status === ERR_NO_PATH` repetiu nos ticks 83001885–83001893 sem mudança de posição.