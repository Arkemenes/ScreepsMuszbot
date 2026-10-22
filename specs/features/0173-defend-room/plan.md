# 0173 — defendRoom — Plan

## Approach

Reaproveitar o role `raider` com uma missão nova, `"defend"`, em vez de criar um role. O raider já viaja entre salas, luta com `combat.threats`/`shoot` e recua de melee. O pedido fica num slot próprio (`Memory.defendTarget`) para não competir com `Memory.raidTarget`.

## Modules

### Changed

| Path | Change |
|------|--------|
| src/rooms/raiding.js | `defendRefusalReason`, `nearestSpawnRoom`, console `defendRoom`/`cancelDefend`. |
| src/roles/raider.js | `defendPending(roomName)`; ramo `mission:"defend"` no `run`; `spawnData` prioriza defesa, corpo pela capacidade, `critical`. |
| src/rooms/needs.js | Conta raid e defesa separadamente (checagem inline: raider.js já depende de needs.js). |
| src/rooms/spawning.js | Defesa pendente entra logo após os papéis críticos, fora do gate de luxo. |
| src/utils/console.js | Ajuda dos dois comandos. |
| test/smoke.js | AC1–AC6. |

## Data shapes

- `Memory.defendTarget = {room, from}`.
- Creep: `memory.mission = "defend"`, `memory.targetRoom`, `memory.home`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| O pedido `critical` segura a fila da mãe enquanto a energia enche. | Só os papéis críticos da mãe (bootstrap, miner, hauler) passam na frente; com storage a espera é curta. |
| Invader grande (com heal) vence um raider sem heal, e a mãe repõe em loop. | `cancelDefend()`; para ameaças grandes, `raidSquad`. |
| Raider estacionado ocupa um tile perto do controller. | Alcance 3, não adjacente. |

## Rollback

`cancelDefend()` no jogo; no código, remover o ramo `"defend"` e o bloco em `spawning.js`.
