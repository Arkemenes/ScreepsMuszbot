# 0099 — Limpeza do cálculo temporal de fair price — Plan

## Approach

Apagar somente os helpers sem call site e seus defaults/exportações. O teste
troca as expectativas de comportamento morto por uma assertion da superfície
pública ativa. A documentação de 0096 passa a descrever snapshots temporais
do book, que é o algoritmo entregue.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/utils/market.js` | Remove helpers legados de VWAP/histórico e exports. |
| `src/utils/config.js` | Remove defaults sem consumidor. |
| `test/smoke.js` | Troca assertions legadas por contrato da API temporal. |
| `src/utils/console.js` | Descreve o comando segundo o algoritmo vigente. |
| `specs/features/0096-*` | Corrige referências históricas/VWAP obsoletas. |

## How it satisfies the constitution

- **CPU/Memory:** nenhuma estrutura ou frequência do algoritmo ativo muda.
- **Fail-soft:** não há novo caminho de execução.
- **Offline test:** o smoke protege o contrato público reduzido.

## Rollback

Reverter esta mudança restaura apenas APIs mortas; não há estado persistente
ou migração para desfazer.
