# 0059 — Universal critical→healthy→optimal spending fallback — Plan

Derivado de `spec.md`.

## Approach

Duas mudanças independentes, sem dependência de ordem entre elas:

1. **Documentação**: um princípio novo (#9) na `constitution.md`, nomeando o
   padrão que `hauler`/`rampartRepair`/`link`/`tower`/`builder`/`spawning`
   já seguem, com a isenção explícita da coleta.
2. **Código**: `roles/remoteHauler.js`'s `pickDeliver()` ganha um terceiro
   `if` — mesma forma que o fallback de torre que `roles/hauler.js`'s
   `pickDeliver()` já tem (feature anterior, mesma sessão) — sem
   `isSourceDefenseTower` porque `remoteHauler` entrega na sala-mãe, cujas
   torres nunca são a torre de defesa de um source cluster remoto (esse
   conceito só existe na topologia da própria sala, `utils/plan.js`'s
   `sourceDefense`); ainda assim reaproveita o mesmo predicado de
   `getFreeCapacity` para não divergir do padrão.

## Modules

### New

Nenhum.

### Changed

| Path | Change |
|------|--------|
| `specs/constitution.md` | Princípio novo #9 (cascata de gasto + isenção da coleta) |
| `src/roles/remoteHauler.js` | `pickDeliver()` ganha fallback de torre |
| `test/smoke.js` | Assertion nova cobrindo o fallback |
| `specs/ROADMAP.md` | Linha `0059`, status `done` |

## Data shapes

Nenhuma chave de `Memory`/heap/config nova — reaproveita `FIND_MY_STRUCTURES`
e `getFreeCapacity(RESOURCE_ENERGY)`, já usados em todo o resto do arquivo.

## How it satisfies the constitution

- **CPU:** um `findClosestByPath` a mais, só quando os dois `if`s anteriores
  já falharam (creep parado, sem alvo) — mesmo custo marginal do fallback
  equivalente em `hauler.js`.
- **Memory:** nenhuma.
- **Fail-soft:** `pickDeliver()` continua podendo devolver `null`; o `run()`
  já trata isso (`if (!target) return;`).
- **Offline test:** smoke stuba um `remoteHauler` com `storage` cheio (ou
  ausente) e spawn/extension cheios, mais uma torre com espaço, e assert
  que o `transfer()` mira a torre.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Uma sala-mãe sem torre nenhuma continua sem fallback além do que já existe | Aceito — sem torre, não há mais nada barato pra tentar; o creep idle é o comportamento correto quando genuinamente nada precisa da energia |

## Rollback

Reverter o `if` novo em `pickDeliver()` (isolado, sem outras mudanças de
comportamento) e o princípio na constitution — nenhum dos dois tem
dependência de dado persistido em `Memory`.
