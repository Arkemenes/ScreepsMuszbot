# 0075 — multiroom-route-precompute — Tasks

- [x] 1. `utils/routing.js`: `opts.allowRoom` em `findRoute` (`routeCallback`
      retorna `Infinity` quando `allowRoom` existe e recusa a sala).
  - verify: `node --check src/utils/routing.js`
- [x] 2. `utils/routing.js`: `opts.allowRoom` em `computeRealRoute`
      (`roomCallback` retorna `false` na mesma condição).
  - verify: `node --check src/utils/routing.js`
- [x] 3. `utils/routing.js`: `opts.allowRoom` em `routeCostCallback` (tanto ao
      montar `allowed` a partir de `route` quanto ao adicionar vizinhos de
      folga) e em `avoidCostCallback`.
  - verify: `node --check src/utils/routing.js`
- [x] 4. `utils/routing.js`: `opts.realRoute` vira opt-out (`!== false`) em
      `tryComputeRealRoute` e no bump de `maxOps`/`maxRooms` de
      `moveToRoom`.
  - verify: `node --check src/utils/routing.js`
- [x] 5. `roles/scout.js`: `realRoute: false` explícito nas 2 chamadas de
      exploração livre (linhas ~287 e ~345 antes da mudança).
  - verify: `node --check src/roles/scout.js`
- [x] 6. Remover `realRoute: true` redundante de `roles/reserver.js`,
      `roles/raider.js`, `roles/pioneer.js` (3x), `utils/squad.js` (2x).
  - verify: `node --check` em cada arquivo tocado
- [x] 7. `roles/remoteHauler.js`: as 2 chamadas de `creep.moveTo(...) +
      remotes.roomCallback` viram `routing.moveToRoom(creep, dest, {range:
      20, reusePath: 30, allowRoom})`; `require("../utils/routing")`
      adicionado.
  - verify: `node --check src/roles/remoteHauler.js`
- [x] 8. `roles/remoteMiner.js`: idem (2 chamadas).
  - verify: `node --check src/roles/remoteMiner.js`
- [x] 9. `test/smoke.js`: assertions pra (AC1) default-on populando
      `_realRoute`, (AC2) `realRoute: false` não populando, (AC3)
      `allowRoom` restringindo `findRoute`/`computeRealRoute`.
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 10. `npx grunt` builda `dist/main.js`; `ROADMAP.md` ganha a linha da
      0075 (status → done); `ARCHITECTURE.md` atualizado (nota em
      `utils/routing.js`'s entry sobre o default-on + `allowRoom`).

## Notes

- `remotes.roomCallback` ficou sem chamador de verdade (só o teste unitário
  próprio dele em `test/smoke.js`) depois da migração do `remoteHauler`/
  `remoteMiner` — mantido em vez de removido: função pequena, comportamento
  ainda testado, e uma limpeza de "código morto" não fazia parte do escopo
  pedido.
- `allowRoom` acabou virando `rooms/remotes.js`'s `allowRoom(destRoomName)`
  em vez de um helper duplicado em `remoteHauler.js`/`remoteMiner.js` —
  `remotes.js` já é "a única porta" pras regras de sala de remote
  (constitution §5), então a regra "só minha/reservada/alvo" pertence lá,
  não copiada em dois roles.
- `node test/smoke.js` verde (929+ assertions), `npx grunt` builda sem erro.
