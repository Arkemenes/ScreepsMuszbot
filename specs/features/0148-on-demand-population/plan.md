# 0148 — População sob demanda — Plan

## Approach

Duas políticas pequenas em `needs.compute` atrás de flags por sala, validadas pelo framework de experimento
(0154): primeiro o builder (maior ganho de CPU), depois o upgrader com o dado do `energyReport`. O contador de
população (`census`) e o spawn já existem: só muda o número desejado e, para o builder já vivo sem demanda, o
comportamento (continua até morrer ou reciclar; **não** reciclar à força na primeira versão).

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/repairDemand.js` | `demand(room)`: existe estrutura que o builder repararia e a torre não cobre (tier `critical` ou abaixo do limiar); cache por tick |
| `test/populationCases.js` | demanda de obra/reparo, flag por sala, rollback do experimento, piso de downgrade |

### Changed

| Path | Change |
|------|--------|
| `src/rooms/needs.js` | `builder` = 0 quando `population.builderOnDemand` da sala e sem sites e sem `repairDemand`; upgrader por excedente atrás de flag |
| `src/utils/config.js` | `population: { builderOnDemand:{ rooms:[] }, builderSafety:{ container:0.4, road:0.3, criticalTicks:300 }, upgrader:{...} }` |
| `src/rooms/spawning.js` | nenhum (usa `wanted`) |

## Data shapes

Config em `Memory.settings.population.*`; métricas do experimento no heap (0154). Sem Memory nova por tick.

## How it satisfies the constitution

- **CPU:** `repairDemand` O(estruturas danificadas) com cache por tick (reusa `damagedStructures.sorted`).
- **Memory:** só config. **Fail-soft:** flag desligada = comportamento antigo; rollback automático.
- **Offline test:** `populationCases.js` com salas stubadas e o experimento de 0154.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Estruturas apodrecem sem builder | experimento com guarda e rollback automático; só uma sala por vez |
| Torre não cobre estrada/container | `repairDemand` usa o limiar real e o tier `critical` |
| Downgrade do controller | piso de upgrader preservado e teste de `ticksToDowngrade` |
