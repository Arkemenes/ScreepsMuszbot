# 0093 — Builder aguarda estabilidade econômica — Plan

Derivado de `spec.md`.

## Approach

Adicionar um gate compartilhado no `builder.js`: antes de executar trabalho
satisfatório em construction sites, consultar o snapshot econômico da sala.
`opportunisticWork()` continua procurando reparo crítico primeiro; só tenta um
site próximo quando a sala não está crítica. O ramo principal aplica a mesma
regra antes de escolher `targetConstructionSite`, mantendo reparo crítico e os
fallbacks já existentes.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/roles/builder.js` | Bloquear construção em estado `critical`. |
| `test/smoke.js` | Cobrir construção oportunística, construção principal e reparo crítico. |
| `specs/ROADMAP.md` | Registrar a feature. |

## Data shapes

Nenhuma chave nova em `Memory`; o builder lê o snapshot heap-cacheado de
`resourceTiers`.

## How it satisfies the constitution

- **CPU:** uma consulta ao snapshot por tick, reutilizada pela política global.
- **Memory:** nenhum dado persistente novo.
- **Fail-soft:** o gate só bloqueia construção; reparo e fallback permanecem.
- **Offline test:** o smoke captura chamadas a `build()` e `repair()`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Deixar uma estrutura crítica morrer | Reparo crítico é avaliado antes do gate de construção. |
| Builder ficar ocioso por estado stale | O snapshot expira por `Game.time`; smoke avança o tick entre cenários. |

## Rollback

Remover as duas condições `economy.state !== "critical"` restaura a seleção
anterior sem alterar estado persistente.
