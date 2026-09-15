# 0078 — route-dead-end-false-blame-guard — Tasks

- [x] 1. `utils/routing.js`: `hasEarlierRoom(creep)` novo.
  - verify: `node --check src/utils/routing.js`
- [x] 2. `retreatFrom()`: delega pra `retreatWithoutBlame()` quando
      `_routeAvoid.length > 0 && !hasEarlierRoom(creep)`.
  - verify: `node --check src/utils/routing.js`
- [x] 3. `markDeadEnd()`: recusa marcar sala própria (`remotes.isMine`).
  - verify: `node --check src/utils/routing.js`
- [x] 4. `retreatFrom()`: pula o push no `_routeAvoid` por-creep pra sala
      própria, independente do guard do item 2.
  - verify: `node --check src/utils/routing.js`
- [x] 5. `test/smoke.js`: assertions AC1-AC4; confirmar que os testes
      mazeCreep/parkedCreep pré-existentes continuam verdes sem alteração.
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 6. `npx grunt` builda; `ROADMAP.md`/`ARCHITECTURE.md` atualizados.

## Notes

- Ação manual necessária em produção (fora do escopo do código): rodar
  `clearRouteDeadEnd("E1N47")` no console pra limpar a marca já gravada
  antes deste fix existir — o fix só previne recorrência, não limpa o
  Memory já corrompido.
- 794 assertions verdes no smoke, `npx grunt` builda sem erro.
- Causa raiz exata do `ERR_NO_PATH` repetido em E1N47 (se veio do
  `knownStructureMatrix` do ROADMAP 0077, que já estava no ar quando o bug
  apareceu, ou de outra fonte) não foi fechada — ver "Out of scope" no
  spec.md.
