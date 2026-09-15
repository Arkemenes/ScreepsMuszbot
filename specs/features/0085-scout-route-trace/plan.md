# 0085 — Scout route trace — Plan

## Approach

Registrar `global.scoutTrace(enabled?)` em `roles/scout.js`, onde os demais
comandos de scout já vivem. Sem argumento, ele encontra o scout e imprime um
snapshot compacto. Com booleano, ele configura o gate persistente de log.

`utils/routing.js` lê o gate imediatamente antes dos retornos que emitem uma
intenção de movimento. O helper registra também a próxima direção do cache
`_move` e os creeps na tile correspondente, e devolve o status original sem
mudar a rota ou a chamada ao motor.

Para distinguir o cache de `moveTo()` da resolução do motor, `scoutTrace("step")`
envia uma única direção já cacheada usando `creep.move()`. É uma ação manual,
não um fallback automático.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| Nenhum | |

### Changed

| Path | Change |
|------|--------|
| `src/roles/scout.js` | Expõe `scoutTrace(enabled?)` e o snapshot do scout. |
| `src/utils/routing.js` | Emite log opt-in antes/depois de movimentos do scout. |
| `test/smoke.js` | Cobre o comando e seu gate em `Memory.settings`. |

## Data shapes

`Memory.settings.debug.scoutTrace: boolean` controla logs transitórios. Não há
objetos de jogo nem cache novo em `Memory`.

## How it satisfies the constitution

- **CPU:** uma leitura booleana por chamada de rota do scout quando relevante.
- **Memory:** uma flag pequena em configuração existente.
- **Fail-soft:** log diagnóstico não interfere no status de movimento.
- **Offline test:** smoke valida o comando e alternância da flag.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Log excessivo | Desligado por padrão e limitado ao role `scout`. |
| Diagnóstico mudar movimento | Helper observa e devolve o mesmo status. |

## Rollback

Executar `scoutTrace(false)` desliga os logs sem redeploy.