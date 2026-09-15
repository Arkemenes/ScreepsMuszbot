# 0076 — shared-route-dead-end-cache — Tasks

- [x] 1. `utils/routing.js`: `isKnownDeadEnd(roomName)`/`markDeadEnd(roomName)`
      + `global.clearRouteDeadEnd(roomName)`.
  - verify: `node --check src/utils/routing.js`
- [x] 2. `retreatFrom()` chama `markDeadEnd(creep.room.name)`.
  - verify: `node --check src/utils/routing.js`
- [x] 3. `findRoute`/`computeRealRoute`/`routeCostCallback`/`avoidCostCallback`
      checam `isKnownDeadEnd` (mesmo tratamento que `avoid`).
  - verify: `node --check src/utils/routing.js`
- [x] 4. `moveToRoom()` recusa outright quando `isKnownDeadEnd(toRoomName)`.
  - verify: `node --check src/utils/routing.js`
- [x] 5. `config.js`: `routing.deadEndTicks` (default 10000).
  - verify: `node --check src/utils/config.js`
- [x] 6. `test/smoke.js`: assertions AC1-AC5.
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 7. `npx grunt` builda; `ROADMAP.md`/`ARCHITECTURE.md` atualizados,
      status → done.

## Notes

- `markDeadEnd` só loga (`console.log`) na PRIMEIRA vez que marca uma sala
  (não repete o log se já estava marcada) — deliberado, pra não virar log
  por-tick: só dispara quando `retreatFrom()` de fato confirma um beco novo.
- 783 assertions verdes no smoke (`test/smoke.js`), `npx grunt` builda sem
  erro.
