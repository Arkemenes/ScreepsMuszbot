# Plano

1. `craftPurchaseBook` mantém saldos locais do book e desconta operações
   pendentes por preço efetivo e ordem de criação. Pending intents reservam
   explicitamente a order atingida.
2. Hook opcional `ctx.buyQuote` em marketPricing precifica quantidade real e
   revalida a soma de insumos no root. Contextos existentes são preservados.
3. craftPlanner compartilha o book no scan, reavalia candidatos antes de abrir
   e reserva imediatamente novas compras. Frete de compra entra nas quotes;
   `feeCredits` conserva apenas a estimativa de frete da venda.
4. craftChain usa o maior custo efetivo das ofertas necessárias como base do
   limite e conta seu pior caso no orçamento, sem conceder slack sem margem.
5. Smoke, check, grunt sem cópia live, diff e graphify update.

Risco: ofertas podem mudar entre scan e deal. terminalOps mantém a revalidação
por quantidade real antes de executar. O book representa competição prevista,
não uma reserva no servidor. Validação live após publicação pelo usuário.
