# 0154 — `energyReport` e framework de experimentos funcionais

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15
- **Habilita:** 0148 (builder/upgrader sob demanda), 0149 (boosts: duty real por ação)

## Problem

Decisões de população e de boost dependem de **para onde a energia vai** e de **quanto tempo cada
ação realmente trabalha (duty)**, e hoje isso só aparece no Grafana, instantâneo (janela de 60 ticks do
`energyLedger`), sem relatório por sala, sem ritmo de RCL e sem duty. Além disso, testar uma mudança de
política (ex.: tirar o builder quando não há obra) exige olhar a tela e reverter à mão.

## Desired outcome

1. `energyReport` imprime, sozinho (como `cpuReport`), por sala numa janela longa: gasto de energia por
   categoria e por tick, duty por ação, variação de storage/terminal, ritmo de RCL e ETA.
2. Um **framework de experimento** (`experiment`) aplica uma política a **uma sala**, mede métricas
   funcionais, imprime um relatório ao fim e **reverte sozinho** se uma guarda disparar.

## In scope

- `energyLedger`: acumuladores heap de janela longa por sala/categoria (soma de energia, ticks com atividade).
- `energyReport(n=600)` e auto-relatório pós-boot (`stats.autoEnergyReportTicks`, 0 desliga).
- Por sala: `nível`, `progress/tick`, `ETA ao próximo RCL`, gasto/tick por categoria (spawn, renew, build,
  repairNormal/Rampart/Wall, upgrade, towerAttack/Heal/Repair), **duty** = ticks com gasto > 0 / ticks,
  `Δ storage` e `Δ terminal` de energia, nº de upgraders/builders e WORK total.
- `src/utils/experiment.js`: `start({name, room, setting, value, metrics, guard, ticks})`, relatório ao fim,
  rollback por guarda, estado mínimo em `Memory.experiments` para sobreviver a reset (restaura a configuração).
- Restauração após reset e relatório sozinho, no mesmo estilo do `cpuReport`.

## Out of scope

- Mudar qualquer política (0148 usa este framework); novos painéis do Grafana (o ledger já publica).

## Acceptance criteria

1. The smoke test asserts the long-window accumulators match the 60-tick snapshot totals over the same ticks, per room and category.
2. The smoke test asserts `energyReport` prints by itself once the window has enough ticks and reports duty, RCL pace and ETA correctly for a fixture.
3. The smoke test asserts `experiment` applies the setting to one room only, prints its report at the end, and restores the setting at the end, on abort and after a reset.
4. The smoke test asserts the experiment rolls back by itself when its guard fires and records the reason.
5. Overhead of the long-window accumulators is O(1) per ledger record (no new `find`, no per-tick JSON).

## Constitution check

Heap para acumuladores; Memory só `Memory.experiments` (setting, sala, início); sem varredura nova por tick;
`guard()` no relatório.

## Open questions

- Fonte de renda real (soma de harvest) além do gasto e do Δ de estoque: a estimativa por `Δstock + gasto` basta?
