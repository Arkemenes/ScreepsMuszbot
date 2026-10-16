# 0150 — Power — Plan

## Approach

Duas peças separáveis: **política** (`powerPolicy`: decisão dinâmica de processar/vender/pausar, pura e O(1)) e **execução**
(logística do power + power creep). A fase 0 (P1) reaproveita o que existe (`powerSpawn.run`, `powerFeedJob`,
`terminalOps.transfer`, `terminalOps.cancel`) e só acrescenta a política e a medição. O power creep é uma
fase posterior, atrás de `power.creep.enabled = false`, e só se o gate econômico (payback com `labReport`) fechar.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/powerPolicy.js` | `decide()` -> `{action: "process"/"pause"/"sell", paybackDays, prices, reason}`; custo restante, ganho diário, histerese; usa `market.snapshot()` e a confiança do preço; reavalia a cada `power.reviewTicks` |
| `src/utils/powerLogistics.js` | cancela listagens de power a processar, agenda `terminalOps.transfer` para a sala do power spawn, limita o que segue listado |
| `src/roles/powerOperator.js` | `run(powerCreep)` (fase 2): spawn, `enableRoom`, renew, `GENERATE_OPS`, `OPERATE_LAB`, reserva de ops |
| `test/powerCases.js` | oráculos de `decide`, logística sem criar ordem, power creep com stubs |

### Changed

| Path | Change |
|------|--------|
| `src/structures/powerSpawn.js` | respeitar `powerPolicy` (pausa) sem mudar `processPower` quando "process" |
| `src/roles/hauler.js` (`powerFeedJob`, `optionalConsumer`) | alimentar só quando a política manda processar; energia só do excedente (já é assim) |
| `src/main.js` | laço `Game.powerCreeps` sob `guard("powerCreep")` (fase 2); `powerStatus()` global |
| `src/utils/config.js` | `power: { sellOrProcess:"dynamic", maxPaybackDays:30, reviewTicks:1500, hysteresis:0.2, creep:{enabled:false, cpuCap:0.5} }` |
| `src/utils/console.js` | `powerStatus()`, `createPowerCreep(name)`, `upgradePowerCreep(name, power)` |

## Data shapes

- Memory: `Memory.power = { decision, since, lastReview }` (3 escalares); `Memory.settings.power.*`. Preços usados ficam no heap (últimas 20 decisões).
- Heap: cache do `decide`, fila de transferências do power.
- Power creep: referência por **nome** (`Game.powerCreeps[name]`), nunca objeto em Memory.

## How it satisfies the constitution

- **CPU:** `decide` O(1) a cada `reviewTicks`; power creep com teto de CPU e auto-desligamento (`shadowBudget`-style).
- **Memory:** ~3 escalares + config. **Fail-soft:** sem confiança de preço, mantém o estado anterior.
- **Offline test:** `powerCases.js` com `Game.market`, `Game.gpl`, `PowerCreep` stubados.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Processar consome energia que as salas precisam | só excedente (`optionalConsumer`) e pausa pelo payback |
| Cancelar listagem perde a taxa | afundada; a decisão futura ignora; documentar no log |
| Power creep morre/esquece renovar | renew a `ticksToLive < 300`; respawn automático (cooldown de 8 h reais) |
| Ganho do `OPERATE_LAB` = 0 | gate: `labReport` (0155) antes de criar o creep |
| Preço do power muda no meio | `decide` reavalia e pode pausar; nunca cancela o que já está no power spawn |
