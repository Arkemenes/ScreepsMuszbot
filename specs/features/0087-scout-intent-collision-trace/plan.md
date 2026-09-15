# 0087 — Scout intent collision trace — Plan

## Approach

`utils/traffic.js` manterá um mapa heap-only de tile → intents somente sob o
gate de debug. `prototypes/move.js` registra chamadas diretas de `move` e
extrai a próxima tile cacheada depois de `moveTo`. `routing.js` marca a próxima
tile do scout e `main.js` faz o flush depois que todos os roles tiveram chance
de declarar movimentos.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| Nenhum | |

### Changed

| Path | Change |
|------|--------|
| `src/utils/traffic.js` | Registro heap-only e flush de colisões da trace. |
| `src/prototypes/move.js` | Observa intenções por `move` e `moveTo`. |
| `src/utils/routing.js` | Marca a próxima tile do scout para relatório. |
| `src/main.js` | Faz flush após o loop de creeps. |
| `test/smoke.js` | Cobre o gate e o registro heap-only. |

## Data shapes

Heap: intents por tick, chaveados por `room:x:y`, e uma única tile observada
do scout. Não há formato novo em `Memory`.

## How it satisfies the constitution

- **CPU:** desligado por padrão; custo só durante diagnóstico manual.
- **Memory:** nada além da flag já existente.
- **Fail-soft:** o flush é envolvido por `guard()` no `main`.
- **Offline test:** valida o gate e o registro sem depender do motor.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Log excessivo | Um relatório de resolução por tick, só enquanto habilitado. |
| Observação interferir no movimento | Wrappers preservam o retorno das APIs nativas. |

## Rollback

`scoutTrace(false)` interrompe imediatamente a coleta e os logs.