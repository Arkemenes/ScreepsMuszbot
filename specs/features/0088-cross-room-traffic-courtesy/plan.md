# 0088 — Cross-room traffic courtesy — Plan

## Approach

Após `creep.moveTo()` em `moveToRoom()`, ler o primeiro caractere de
`creep.memory._move.path`, como o código já faz para diagnóstico/validação.
Se a tile correspondente contém creep próprio, chamar `excuseMe.ask()`;
o protocolo existente decide se há uma cadeia válida e não move miner.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| Nenhum | |

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | Pede passagem no próximo passo de rota multi-sala ocupado. |
| `test/smoke.js` | Cobre ocupante e ausência de ocupante. |

## Data shapes

Nenhuma mudança em `Memory`.

## How it satisfies the constitution

- **CPU:** uma inspeção local de tile por movimento cross-room.
- **Memory:** somente cache nativo `_move` já existente.
- **Fail-soft:** `excuseMe.ask()` retorna `false` sem alterar a rota quando não pode liberar.
- **Offline test:** verifica a delegação e preservação do status.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Tirar creep de posto fixo | `excuseMe` já recusa miner e só age com saída segura. |
| Sobrescrever o intent do viajante | O pedido acontece depois do `moveTo`; o viajante mantém sua intenção. |

## Rollback

Remover a chamada de `requestCrossRoomClearance()` restaura o comportamento atual.