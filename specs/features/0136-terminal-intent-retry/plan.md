# Plano

1. Criar regressões de frete existente/job antigo e execução parcial antes do fix.
2. Centralizar claim energético de intent/fee em terminalClaims; usar nos
   consumidores, reconciliação de recibos e scan de saldo sem dupla contagem.
3. Confirmar quantidade observada por transação e frete correspondente à
   quantidade real; preservar fallback físico conservador e recursos de conta.
4. Adicionar suspensão temporária por ordem com backoff configurável/migração
   idempotente; seleção/diagnóstico compartilham a exclusão vigente.
5. Testar falhas/partial/reset/cancel/alternativas/limites; check/smoke/grunt,
   diff/graphify e documentação. Build normal copia ao cliente já autorizado.

Risco: o servidor pode executar parcial ou sofrer competição invisível. Usar
transações como evidência principal; registrar incerteza quando só saldo existe.
Não inferir gasto total do intent quando só parte executou.
