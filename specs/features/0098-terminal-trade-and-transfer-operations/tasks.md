# 0098 — Operações de compra, venda e transferência pelo terminal — Tasks

- [x] 1. Criar a base da API, validação e estado em `utils/terminalOps.js`. (AC1, AC9)
- [x] 2. Despachar o fluxo storage → terminal → `send()` pelos haulers. (AC2)
- [x] 3. Completar locks, recuperação e fluxo de transferência. (AC1, AC2, AC3, AC6, AC7, AC8, AC10)
- [x] 4. Completar compra, venda, ordens próprias e recebimentos deduplicados. (AC4, AC5, AC6)
- [x] 5. Adicionar stats de janela de 60 ticks e completar comandos/integração. (AC9, AC10)
- [x] 6. Atualizar `test/smoke.js` para os fluxos operacionais críticos.

## Notes

Concluído em 2026-09-19: `terminalOps` é chamado sob `guard`, expõe os cinco
comandos no `help()`, persiste apenas metadados, agenda `terminalJob` para
haulers, executa transferências e deals, controla carga parcial, cria e
reprecifica ordens próprias, mantém buffer SELL, detecta recebimentos com
baseline zero e deduplicação, recupera cargas após morte de hauler e exporta
métricas de 60 ticks. O smoke cobre locks, serialização, cancelamento,
transferência parcial, cooldown, recebimento retryable e stats.

`node test/smoke.js "$(pwd)"`, `node --check` nos arquivos tocados e `npx grunt`
permanecem verdes. A cópia opcional para a pasta externa do cliente Screeps
pode ser ignorada quando o Windows retornar `EPERM`.
