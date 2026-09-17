# 0094 — Energy structures mais próximas do anchor de spawn — Plan

## Approach

Criar um helper em `rooms/spawning.js` que derive todos os spawns e extensions
próprios via `roomCache.myStructures()`. Para cada spawn que vai tentar uma
request, usar `storage.pos` como anchor quando disponível; caso contrário,
usar `spawn.pos`. Passar a lista ordenada por distância nas opções de `dryRun`
e da criação real.

## Modules

### New

Nenhum.

### Changed

| Path | Change |
|------|--------|
| `src/rooms/spawning.js` | Criar e passar `energyStructures` ordenada. |
| `test/smoke.js` | Cobrir storage e ausência de storage. |
| `specs/ROADMAP.md` | Registrar a feature `0094`. |

## Data shapes

Nenhuma chave nova em `Memory`, cache de heap ou segment. A função recebe e
devolve uma lista de objetos de jogo somente durante o tick.

## How it satisfies the constitution

  pathfinding ou `room.find` adicional.
  os retornos `dryRun` e nativos existentes.
  ordem dos structures.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| opção não ser respeitada pelo motor | usar a mesma lista no `dryRun` e no spawn real. |
| storage ausente em salas novas | usar o spawn executor como anchor. |

## Rollback

Remover o helper e os campos `energyStructures`; nenhum estado persistente ou
migração é necessária.
