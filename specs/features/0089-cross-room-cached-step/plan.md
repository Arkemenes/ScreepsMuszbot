# 0089 — Passo cacheado em rota multi-sala — Plan

## Approach

Transformar `requestCrossRoomClearance()` em um helper de execução da direção
cacheada: identifica a primeira direção de `_move.path`, chama `excuseMe.ask()`
se a tile interna estiver ocupada por creep próprio e, ao final, chama
`creep.move(direction)`. O helper só é chamado se o `moveTo()` retornou `OK`.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| Nenhum | |

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | Segue diretamente o primeiro passo cacheado após `moveTo()` bem-sucedido. |
| `test/smoke.js` | Cobre tile livre, ocupada e `ERR_NO_PATH`. |

## Data shapes

Nenhuma mudança em `Memory`.

## How it satisfies the constitution

- **CPU:** leitura de um caractere da rota já cacheada.
- **Memory:** nenhum dado adicional.
- **Fail-soft:** ausência de cache ou erro nativo não emite movimento extra.
- **Offline test:** verifica o boundary da chamada direta.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Direção inválida | Helper valida `TOP..TOP_LEFT`. |
| Caminho ocupado | Reutiliza `excuseMe` antes de emitir a intenção. |

## Rollback

Remover a chamada ao helper após `moveTo()` restaura o movimento nativo puro.