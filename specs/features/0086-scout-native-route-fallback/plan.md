# 0086 — Scout native-route fallback — Plan

## Approach

O pré-cálculo de `_realRoute` já ocorre por padrão. Remover o opt-in
`nativeRoute` faz o scout atravessar cada hop usando o caminho principal de
`moveToRoom()`, que escolhe o mesmo `nextHop` para uma rota real e trata
`ERR_NO_PATH`.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| Nenhum | |

### Changed

| Path | Change |
|------|--------|
| `src/roles/scout.js` | Não passa mais `nativeRoute` para sign mission. |
| `test/smoke.js` | Observa as opções encaminhadas ao roteador. |

## Data shapes

Nenhuma mudança em `Memory`.

## How it satisfies the constitution

- **CPU:** reutiliza o fluxo de rota existente.
- **Memory:** sem novos dados persistidos.
- **Fail-soft:** restaura a recuperação normal de `ERR_NO_PATH`.
- **Offline test:** verifica a opção no boundary do role.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Caminho padrão divergir | `scoutTrace` permanece disponível para o teste ao vivo. |

## Rollback

Reintroduzir `nativeRoute: true` restaura o comportamento anterior.