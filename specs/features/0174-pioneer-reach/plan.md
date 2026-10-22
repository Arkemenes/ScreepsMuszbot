# 0174 — Alcance de pioneers por tempo de viagem — Plan

## Approach

Tudo em `rooms/pioneering.js`, que já decide elegibilidade. `withinReach` substitui o teste de hops em `mothersFor`; `targetsFor` vira o espelho de `mothersFor` para respeitar a mesma folga. `divertTarget(creep, alvo)` decide em trânsito. `roles/pioneer.js` só executa: checa uma vez por sala e, se desviar, viaja até a sala escolhida e vira bootstrap (o bootstrap já constrói e faz upgrade, ARK-221).

A velocidade usa uma constante (2 ticks/tile) em vez de `routing.bodyTravelCosts`, porque o corpo do pioneer é sempre WORK/CARRY/MOVE balanceado e viaja carregado: a razão não muda com o tamanho.

## Modules

### Changed

| Path | Change |
|------|--------|
| src/rooms/pioneering.js | `ticksPerHop`, `travelTicks`, `withinReach`, `mothersFor`/`targetsFor` com folga, `divertTarget`, `pioneerStatus`. |
| src/roles/pioneer.js | Checagem por sala, `memory.divertTo`, conversão em bootstrap no destino. |
| test/smoke.js | AC1–AC7. |

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Estimativa otimista em sala com muito swamp. | `minWorkTicks` (500) e `minUsefulTicks` (150) dão margem; ambos são configuráveis. |
| Uma sala sem spawn sem mãe ao alcance fica sem resgate. | `pioneerStatus()` mostra o motivo; o usuário pode baixar `pioneer.minWorkTicks` para aquela situação. |

## Rollback

`Memory.settings.pioneer.minWorkTicks = -100000` e `motherSlackHops = 99` voltam ao comportamento por hops.
