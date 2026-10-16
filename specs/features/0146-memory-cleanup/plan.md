# 0146 — Limpeza de Memory e migrações encerradas — Plan

## Approach

Quatro mudanças independentes, cada uma com teste de equivalência:
(1) limpeza única de `walkMatrix`/`terrainMatrix`; (2) `exits` vira derivado
(`Game.map.describeExits` com cache no heap) e o campo é apagado; (3) intel
omite valores padrão; (4) remoção das migrações extintas. Nada de contabilidade
muda. O estado live foi verificado (cpuAuditLegacy, 2026-10-15): cadeias sem id
duplicado, `roomsBuildings = 0`, `settings.planSegments` ausente.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/mapExits.js` | `exits(roomName)` → objeto de `Game.map.describeExits`, cache no heap |
| `src/utils/memoryCleanup.js` | `run()` única e idempotente (versão em `Memory.settings.cleanupVersion`): apaga matrizes órfãs e `exits` legados de `Memory.rooms`; orçamento de salas por tick (stall guard) |
| `test/memoryCleanupCases.js` | casos de AC1–AC5 |

### Changed

| Path | Change |
|------|--------|
| `src/rooms/intel.js` | para de gravar `exits`; omite padrões provados; mantém stubs de vizinhos |
| `src/roles/scout.js`, `src/rooms/architect.js`, `src/rooms/remotes.js`, `src/utils/routing.js`, `src/utils/squad.js` | `Memory.rooms[x].exits` → `mapExits.exits(x)` |
| `src/utils/planStore.js` | remove migração de `settings.planSegments` e `migrateFromMemory` |
| `src/utils/craftLedger.js` | remove `migrateOwners` e a chamada em `tick()` |
| `src/main.js` | chama `memoryCleanup.run()` dentro de `guard()` |
| `test/smoke.js` | ajusta casos que exercitavam as migrações removidas |

## Data shapes

Campos de intel omitidos quando iguais ao padrão, **somente os que a auditoria
(tarefa 4) provar equivalentes**: candidatos `builds` (`{}`), `enemies` (0),
`enemyStructures` (0), `hasInvaderCore` (false). `hasController`, `mineral` e
`sourceNumber` **não** podem ser omitidos: `getIntel` usa `== undefined` como
gatilho de recálculo.

## How it satisfies the constitution

- **CPU:** limpeza com orçamento por tick; `mapExits` cacheado; menos bytes serializados.
- **Memory:** só diminui; `exits` passa para heap (dado derivado).
- **Fail-soft:** limpeza idempotente; erro não interrompe o tick (guard).
- **Offline test:** mundos com formatos antigos hidratados e comparados.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Leitor de `exits` não migrado | grep exaustivo + teste por leitor; o campo só é apagado depois |
| Omitir padrão muda um `== undefined` | auditoria campo a campo; só omitir quando todo leitor trata falsy |
| Remover migração ainda necessária | só as 3 provadas extintas; `reconcileLegacy`/`orderRetry` ficam |
| Limpeza demorada em 526 salas | orçamento por tick + stall guard |
