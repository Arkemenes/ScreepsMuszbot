# 0092 — Miner na cascata global de energia — Plan

Derivado de `spec.md`.

## Approach

`miner.distribute()` consulta o snapshot econômico já cacheado e separa a
reserva crítica da torre de source da distribuição normal. Se a sala estiver
crítica por uma causa não-defensiva, link/container recebem a energia primeiro,
porque são o caminho compartilhado para spawn/controller. Em `defenseActive`,
a torre conserva precedência até sua reserva. Se nenhum destino compartilhado
puder receber energia, a torre continua como fallback para evitar spill.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/roles/miner.js` | Consultar o snapshot global na escolha entre torre, link e container. |
| `test/smoke.js` | Cobrir spawn crítico, defesa ativa, sala estável e fallback sem buffer. |
| `specs/ROADMAP.md` | Registrar e concluir o follow-up 0092. |

## Data shapes

Nenhum novo dado em `Memory`. O miner lê `resourceTiers.getEconomySnapshot(room)`
e usa apenas o resultado heap-cacheado do tick.

## How it satisfies the constitution

- **CPU:** reutiliza o snapshot por sala/tick e as buscas locais já existentes.
- **Memory:** não grava estado novo.
- **Fail-soft:** ausência de tower/link/container mantém a cascata existente.
- **Offline test:** o smoke controla `energyAvailable`, `defenseActive`, buffers e
  captura o alvo de `transfer()`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Torre de source ficar sem energia durante defesa | `defenseActive` mantém a torre como prioridade. |
| Energia cair no chão quando buffers estão cheios | Torre continua como fallback se houver espaço. |
| Snapshot refletir estado anterior do fixture | Cada cenário altera `Game.time` antes de consultar o miner. |

## Rollback

Remover o gate de economia em `miner.distribute()` restaura a ordem anterior,
sem alterar `resourceTiers` nem dados persistentes.
