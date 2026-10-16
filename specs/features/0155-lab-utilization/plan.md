# 0155 — Utilização dos labs — Plan

## Approach

`labPolicyRuntime.assignments` já calcula, por lab e por tick, o motivo (`reasons[lab.id]`: `cooldown`, `input`,
`ready`, `capacity`, `switch`, `unavailable`) e o grava em `state.wait`. Basta acumular esses motivos no heap por
sala/lab e reportar. Nenhuma decisão de lab muda.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/labReport.js` | `add(room, labId, reason)` (O(1)), `snapshot()`, `print(n)`, auto-arme pós-boot, conclusão `reactionLimited`/`inputLimited` |
| `test/labReportCases.js` | sequência de estados roteirizada e os dois cenários de limiar |

### Changed

| Path | Change |
|------|--------|
| `src/utils/labPolicyRuntime.js` | após `state.wait = reasons`, `labReport.add` por lab de saída |
| `src/main.js` | `labReport(n)` global e `labReport.tick()` depois do `cpuMeter.endTick` |
| `src/utils/config.js` | `labs.reactionLimitedThreshold: 0.85`, `stats.autoLabReportTicks` |

## Data shapes

Heap: `{ room: { since, ticks, labs: { id: { cooldown, ready, input, capacity, switch, unavailable, total } } } }`. Sem Memory.

## How it satisfies the constitution

- **CPU:** O(labs) por `assignments` (já itera os labs). **Memory:** nenhuma. **Fail-soft:** `guard()`.
- **Offline test:** `labReportCases.js` alimenta `add` com sequências e checa o relatório.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Contar o lab errado (entrada x saída) | só labs com `phase.products.includes(desired)` (saída), como em `assignments` |
| Janela curta engana | exige janela mínima (~21.000 ticks) antes de concluir |
