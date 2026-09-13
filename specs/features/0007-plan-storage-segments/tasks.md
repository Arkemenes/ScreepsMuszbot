# 0007 — Plan storage → RawMemory.segments — Tasks

- [x] 1. `utils/planStore.js`: cache no heap chaveado por `Game.time`;
      `getPlan(roomName)` → `{ buildings, mincutBoundries }` ou `null`;
      `setPlan`, `dropPlan`. Id de segment de
      `Memory.settings.planSegments[roomName]`, atribuído preguiçosamente a
      partir do offset 10.
  - verify: `node --check`; assertion unitária get→set→get round-trip
- [x] 2. Migração no `getPlan`: se o segment está vazio e
      `Memory.rooms[roomName].buildings` presente → `setPlan` a partir dele,
      apagar as duas chaves de Memory, retornar o dado movido. (AC3)
  - verify: smoke semeia formato antigo, asserta migração
- [x] 3. `plan.js`: `planIndex` constrói de `planStore.getPlan(roomName)` em vez
      de `Memory.rooms[roomName].buildings`. (AC2)
  - verify: assertions de `isPlanned` do smoke verdes
- [x] 4. `architect.js`: substituir toda leitura & escrita de
      `Memory.rooms[roomName].buildings` / `.mincutBoundries` por `planStore`.
      `addBuildings`, `getContainerLocations`, `findStampLocation`,
      `createConstructionSites`, `visualizeStructures`, cada `case`,
      `replanRoom`, `destroyUnplannedRoads`. (AC1)
  - verify: smoke completo verde, plano ainda completa até `planned`
- [x] 5. Ativar o segment da sala um tick antes do planejador precisar
      (`RawMemory.setActiveSegments`), no `main` ou no `architect`. (AC4, open Q)
  - verify: nenhuma leitura "segment not active" num smoke multi-sala
- [x] 6. Atualizar `test/smoke.js`: stubar `RawMemory.segments` +
      `setActiveSegments`; assertar AC1, AC3; manter as assertions de AC2.
  - verify: `node test/smoke.js` verde
- [x] 7. `npx grunt`; atualizar `ARCHITECTURE.md` (tabela Persistence) e
      `ROADMAP.md` status → done.

## Notes

Entregue. `mutate` (get→muta→set) cobriu as tasks 3-4 de forma mais uniforme
que "toda leitura/escrita direta" — `addBuildings`, o `case 11` e a migração
passam por ele; os demais pontos de `architect.js`/`plan.js`/`room.js` (proto)
ficaram como leitura via `planBuildings`/`planBoundries`/`getPlan`. Segment
ids ficam em `Memory.settings.planSegments`, alocados a partir de 10.
`activate()` roda todo tick a partir do `main` (task 5), priorizando
`Game.myRooms` — como o bot tem poucas salas, nunca bate no teto de 10 ativos.
Validado pelo smoke (98 assertions: round-trip do `planStore`, migração do
formato antigo, ausência de `buildings`/`mincutBoundries` em `Memory.rooms`,
mais todas as assertions de plano que já existiam) + `npx grunt`.
