# 0159 — RoomVisual v2 — Plan

## Approach

Substituir `src/utils/visual-room.js` pelo asset Screeps oficial da v2.0.0,
verificado contra o SHA256 publicado na release. Acrescentar somente um banner
com origem/revisão e a licença MIT integral, para preservá-la no bundle.
O asset registra os métodos no prototype ao carregar; o require existente em
`utils/index.js` continua sendo a única porta de entrada.

## Modules

| Path | Change |
|------|--------|
| `src/utils/visual-room.js` | Build oficial v2.0.0 e banner de origem/licença. |
| `test/roomVisualCases.js` | Registro, estruturas/opacidade, estradas, recursos e símbolos. |
| `test/smoke.js` | Executar os casos 0159 no harness existente. |
| `specs/ARCHITECTURE.md` | Documentar versão e integração vendorizada. |
| `specs/ROADMAP.md` | Registrar entrega e validação local. |

## Data shapes

Sem chaves novas em Memory, segmentos ou config. O build usa caches de cores,
símbolos e estradas no heap; estradas são associadas ao visual por WeakMap.
Os testes isolam globals de símbolos em um contexto VM, sem tocar o runtime.

## How it satisfies the constitution

- **CPU:** nenhuma nova chamada por tick; gates do architect preservados.
- **Memory:** caches apenas no heap; nada serializado.
- **Fail-soft:** mesma inicialização e guards do fluxo atual.
- **Offline test:** primitivas de desenho gravadas pelo stub para verificar
  resultados da API e compatibilidade com a opacidade do planejador.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Importar o entry npm sem registro | Usar o asset Screeps que executa `install()`. |
| Referências a helpers privados removidos | Conferir consumidores; bot usa somente `structure()`. |
| Constantes sazonais ausentes | Testar recursos normais e símbolos sem `SYMBOLS`. |
| Empacotamento do build novo | Smoke e execução isolada de `dist/main.js` com stub de RoomVisual. |
| Publicar alterações anteriores junto | Build local com cópia para o cliente desabilitada no processo. |

## Rollback

Restaurar somente a cópia anterior de `src/utils/visual-room.js` e gerar o
bundle novamente. Nenhuma migração de estado precisa ser revertida.
