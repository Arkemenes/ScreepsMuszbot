# 0080 — Builder único por sala — Plan

## Approach

Aplicar o limite na fórmula base de `rooms/needs.js`, registrar o teto absoluto do builder como `1` no autoscale e reaplicar o clamp após `wantedOverride`. Atualizar as assertions existentes para cobrir zero, um, backlog, delta antigo e override.

## Modules

### New

Nenhum.

### Changed

| Path | Change |
|------|--------|
| `src/rooms/needs.js` | Limita a contagem automática, o autoscale e overrides do builder a `1`. |
| `test/smoke.js` | Atualiza assertions para o contrato `builder ∈ {0,1}`. |
| `specs/ARCHITECTURE.md` | Registra a regra vigente junto de `src/rooms/`. |

## Data shapes

Nenhuma chave nova. `Memory.rooms[name].autoscale.delta.builder` continua existindo, mas o valor exposto em `roomNeeds()` é limitado a `1`.

## How it satisfies the constitution

- **CPU:** somente operações escalares sobre valores já calculados.
- **Memory:** não cria objetos de jogo nem novos dados persistentes.
- **Fail-soft:** não altera os guards ou o tratamento de exceções existente.
- **Offline test:** smoke cobre a fórmula, autoscale, delta antigo e override.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Um override antigo pedir vários builders | Clamp final de `wantedOverride.builder` a `1`. |
| Assertions históricas esperarem teto `2` | Atualizar somente expectativas do comportamento atual; manter specs históricas como histórico. |

## Rollback

Remover os clamps específicos do builder e restaurar as assertions anteriores, caso a política populacional seja revertida.
