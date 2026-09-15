# 0090 — Passo cacheado só no stall — Plan

## Approach

Separar no helper a abertura de passagem e o passo de recuperação. O ramo
normal só chama `move(direction)` quando `excuseMe.ask()` abriu uma tile.
O bloco de progresso de `moveToRoom()` marca em variável local o tick que
atinge `routing.noProgressTicks`; depois de `moveTo()` recriar `_move`, só
esse tick emite o passo direto.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| Nenhum | |

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | Limita o passo cacheado à recuperação de stall. |
| `test/smoke.js` | Cobre percurso normal, bloqueado e stall. |

## Data shapes

Nenhuma mudança em `Memory`; o marcador de recuperação é variável local.

## How it satisfies the constitution

- **CPU:** não adiciona trabalho ao tick normal.
- **Memory:** sem persistência adicional.
- **Fail-soft:** recovery reutiliza o limite configurado e uma direção já validada pelo motor.
- **Offline test:** testa os três caminhos.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Inércia voltar | O passo direto continua no limiar de stall. |
| Percurso errático | Tick normal deixa de forçar a direção interna. |

## Rollback

Remover o passo de recuperação restaura `moveTo()` puro.