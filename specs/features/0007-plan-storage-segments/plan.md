# 0007 — Plan storage → RawMemory.segments — Plan

Derivado de `spec.md`.

## Approach

Um módulo `utils/planStore.js` vira a única porta para
`{ buildings, mincutBoundries }` de uma sala. O dado real fica em
`RawMemory.segments[id]` (string JSON); `planStore` mantém um cache no heap
(`{ [roomName]: plan }`) que sobrevive entre ticks e só é invalidado quando o
próprio `planStore` escreve. Assim, na prática, o parse do segment acontece uma
vez por global reset por sala, não uma vez por tick — e some do blob de Memory
que o servidor serializa todo tick.

O id do segment é alocado preguiçosamente em `Memory.settings.planSegments`
(`{ roomName: id }`) a partir do offset 10. `main` pede todos os segments de
plano ativos a cada tick (`RawMemory.setActiveSegments`, ≤ 10) — o bot raramente
tem mais que isso. `architect.js`, `plan.js` e o protótipo de `room` deixam de
tocar `Memory.rooms[name].buildings` e passam por `planStore`.

Migração transparente: no primeiro `getPlan` de uma sala cujo segment está
vazio mas que ainda tem `Memory.rooms[name].buildings` (formato antigo), o
`planStore` move o dado para o segment e apaga as duas chaves de Memory.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/planStore.js` | `getPlan(roomName)` → `{buildings, mincutBoundries}` \| `null` (heap-cached, migra formato antigo); `setPlan(roomName, plan)` write-through pro segment; `mutate(roomName, fn)` get→muta→set; `dropPlan(roomName)`; `activate()` (chama `setActiveSegments`); `segmentId(roomName)` (aloca preguiçoso). |

### Changed

| Path | Change |
|------|--------|
| `src/utils/plan.js` | `planIndex` lê de `planStore.getPlan(roomName)` em vez de `Memory.rooms[roomName].buildings`; invalida o índice por `buildings.length` **e** identidade do array. |
| `src/rooms/architect.js` | toda leitura/escrita de `.buildings` / `.mincutBoundries` → `planStore`. `case undefined` cria via `setPlan`; cada `case` que concatena → `mutate`; `addBuildings`, `findStampLocation`, `createConstructionSites`, `visualizeStructures`, `replanRoom`, `destroyUnplannedRoads`. |
| `src/prototypes/room.js` | `floodFill` (linha ~269) lê o plano via `planStore.getPlan` para o teste de "tile é estrada planejada". |
| `src/main.js` | `planStore.activate()` dentro de `memory.wrap`, antes do loop de `planCity`. |
| `test/smoke.js` | stub `RawMemory.segments` + `setActiveSegments`; ler o plano via `planStore.getPlan("W1N1")` nas ~8 assertions que hoje leem `Memory.rooms.W1N1.buildings`; nova assertion de migração + de "sem `buildings` na Memory". |

## Data shapes

| Chave | Onde | Forma |
|-------|------|-------|
| `RawMemory.segments[id]` | segment (string) | `JSON.stringify({ buildings: [{x,y,structureType,minimalRCL,sourceDefense?}], mincutBoundries: [{x1,y1,x2,y2}] })` |
| `Memory.settings.planSegments` | Memory (pequeno) | `{ [roomName]: number }` (id 10–99) |
| `Memory.rooms[name].planStep` / `.planned` / `.planStepSeen` / `.planStepTries` | Memory (pequeno) | inalterado |
| heap `planStore` cache | heap | `{ [roomName]: { buildings, mincutBoundries } }`, invalidado no `setPlan`/`dropPlan` |
| `Memory.rooms[name].buildings` / `.mincutBoundries` | **removidas** após migração | — |

## How it satisfies the constitution

- **CPU:** parse do segment 1×/global reset/sala (heap cache), não 1×/tick. O
  blob de Memory por tick encolhe ~11 KB/sala.
- **Memory:** dado grande e persistente → segments, exatamente o §2.
- **Fail-soft:** segment ausente/não-ativo/corrompido → `getPlan` retorna
  `null` → `isPlanned` devolve `true` pra tudo (default seguro atual) e
  `createConstructionSites` faz no-op por 1 tick até o segment carregar; nunca
  lança (JSON.parse em try/catch).
- **Offline test:** smoke stuba `RawMemory.segments` (objeto) e
  `setActiveSegments` (no-op); assertions de plano passam a ler via `planStore`;
  novo teste semeia formato antigo e verifica a migração.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| 1 tick sem canteiros após global reset (segment ainda não ativo) | `activate()` roda todo tick; planejador já é tolerante a atraso; `planned` continua na Memory então nada re-planeja |
| > 10 salas → nem todo segment ativo no mesmo tick | `activate()` prioriza as `Game.myRooms` do tick; raríssimo passar de 10 salas próprias |
| `JSON.parse` de segment corrompido | try/catch → `null` → replan |
| Escritas de segment a cada tick custam CPU de `stringify` | `setPlan` só é chamado quando o plano muda (durante o planejamento); depois de `planned`, nada escreve |
| smoke lê `Memory.rooms.W1N1.buildings` em 8 lugares | trocar por um helper local `plan()` que chama `planStore.getPlan` |

## Rollback

Reverter os 5 arquivos + apagar `planStore.js`. O dado migrado fica no segment;
um `replanRoom("W1N1")` em cada sala reconstrói na Memory no formato antigo.
Nenhuma mudança de comportamento de role, então o rollback é seguro a qualquer
momento.
