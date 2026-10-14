# Tasks

- [x] Reproduzir frete sem reserva e confirmação parcial no smoke.
- [x] Unificar claims de frete e proteger jobs/intents/reset/cancelamento.
- [x] Confirmar quantidade/frete reais e registrar evidência.
- [x] Retentar ofertas com suspensão limitada e migrar legado.
- [x] Smoke/check/build/diff/graphify/docs e evidência de entrega.
- [x] Confirmar execução live após publicação (shard3/tick83650615).

Smoke6558 anterior →6586 assertions verdes após28 regressões de intents/retry.
Testes reproduziram cinco falhas antes do fix e verificam jobs antigos, frete
preexistente/parcialmente staged, reset, cancelamento, ausência de efeito,
compra/venda/energia parciais, transação repetida, alternativas, expiração,
progressão/cap/migração e limites de preço/créditos/capacidade/cooldown.

Entrega2026-10-14: check dos8 JS tocados no workspace e dist limpo, smoke6586,
diff sem whitespace, grunt108 módulos copiados ao cliente com hash idêntico.
Graphify4417nodes/9145edges atualizado. Sem commit. Execução live do bundle
novo não é observável diretamente nesta sessão; confirmar quando houver snapshot.

Snapshot fornecido pelo usuário confirmou terminal-12441 completed:1460
comprados/recebidos, remaining0, execução885+575, créditos324420.76/frete1117.
accounting confirmed e última evidência transaction; energia1211→782,
UH2O885→1460. ARK-126 concluída com confirmação live.
