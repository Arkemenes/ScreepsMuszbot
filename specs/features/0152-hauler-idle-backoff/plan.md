# 0152 — Buscas repetidas — Plan (retroativo; implementado)

## Approach

Três regras no mesmo princípio: não repetir a busca inteira quando nada mudou. Estado só no heap, por criatura, com GC; cada regra
atrás de config (`1` restaura o comportamento antigo). Detalhes e prioridades de entrega na spec.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/roles/hauler.js` | `idleSkip`/`markIdle` (ocioso), `deliverPickValid` e cache de entrega por rank; spans `hauler.idleSkip`, `hauler.deliverKept` |
| `src/roles/builder.js` | `idleSkip`/`markIdle` para o builder vazio sem pile; span `builder.idleSkip` |
| `src/utils/config.js` | `hauler.idleRecheckTicks`, `hauler.deliverRepickTicks`, `builder.idleRecheckTicks` (5) |
| `test/steadyStateCases.js`, `test/idleRepickCases.js` | padrão de pulos, exceções, regras de prioridade |

## Data shapes

Heap: `idleChecks[name] = {tick, room}`, `deliverPicks[name] = {id, rank, tick, room}`; GC a cada 300 ticks. Sem Memory.

## Risks & mitigations

Spawn/extension com fome, torre crítica e storage abaixo da reserva sempre forçam a cascata completa; reset e troca de sala esquecem a marca;
`1` na config reverte sem deploy.
