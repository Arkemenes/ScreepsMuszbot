# Tasks — 0083 Rampart pública no pathing multi-room

- [x] Criar a matriz estrutural específica do routing multi-room e cacheá-la no heap.
- [x] Fazer `computeRealRoute`, `routeCostCallback` e `avoidCostCallback` reutilizarem essa matriz.
- [x] Adicionar assertions de wall, rampart privada e rampart pública de terceiro.
- [x] Validar com `node --check`, `node test/smoke.js` e `npx grunt`.
- [x] Atualizar `ARCHITECTURE.md` e marcar a spec como `done` após a validação.
