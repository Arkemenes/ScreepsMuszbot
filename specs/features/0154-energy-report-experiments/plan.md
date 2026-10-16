# 0154 — `energyReport` e experimentos — Plan

## Approach

Estender o `energyLedger` (já registra gasto por categoria por sala em `record()`) com acumuladores de janela
longa no heap, e construir `energyReport` e `experiment` em cima dele. O desenho de relatório automático,
restauração após reset e aborto limpo segue o `cpuReport` (já no bundle) e o padrão de `Memory.experiments`.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/energyReport.js` | acumula/lê a janela longa, calcula duty, RCL/ETA, Δ de estoque; `print()`; auto-arme pós-boot |
| `src/utils/experiment.js` | `start/stop/tick`, métricas e guardas por sala, rollback, relatório, `Memory.experiments` |
| `test/energyReportCases.js` | fixtures de ledger, RCL e experimento com guarda |

### Changed

| Path | Change |
|------|--------|
| `src/utils/energyLedger.js` | `record()` alimenta `energyReport.add(room, category, amount)` (O(1)) |
| `src/main.js` | `energyReport(n)` global; chamada de `energyReport.tick()` e `experiment.tick()` depois do `cpuMeter.endTick` |
| `src/utils/config.js` | `stats.autoEnergyReportTicks` (padrão 1500) |
| `src/utils/console.js` | ajuda de `energyReport`, `experimentStart/Stop` |

## Data shapes

Heap: `{ room: { since, ticks, sums:{cat}, active:{cat}, controller:{level, progress, tick}, stock:{storage, terminal} } }`.
Memory: `Memory.experiments = { [name]: { room, path, original, hadOriginal, since } }` (restaura após reset).

## How it satisfies the constitution

- **CPU:** O(1) por registro; relatório só ao fim da janela. **Memory:** só `Memory.experiments` enquanto ativo.
- **Fail-soft:** qualquer erro no relatório é capturado por `guard()` e não afeta o jogo.
- **Offline test:** `Game.time`/`Game.rooms` stubados, ledger alimentado por `record`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Experimento esquece de reverter após reset | `Memory.experiments` + restauração no primeiro tick |
| Duty mal definido | duty = ticks com gasto > 0 / ticks da janela; documentado no relatório |
| Dois experimentos na mesma sala | recusa (um por sala) |
