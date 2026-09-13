# NNNN — <short name> — Plan

Derivado de `spec.md`. Se o plano revelar que a spec está errada, conserte a
spec primeiro.

## Approach

Um ou dois parágrafos: a estratégia técnica.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/…` | … |

### Changed

| Path | Change |
|------|--------|
| `src/…` | … |

## Data shapes

Chaves de Memory, caches de heap, layouts de segment, chaves de config — com
tipos e onde vivem (Memory vs heap vs segment).

## How it satisfies the constitution

- **CPU:** …
- **Memory:** …
- **Fail-soft:** …
- **Offline test:** o que o smoke test vai stubar / assertar

## Risks & mitigations

| Risk | Mitigation |
|------|------------|

## Rollback

Como desativar / reverter se der problema em produção.
