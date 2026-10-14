# Plano

`craftLedger` concentra saldos físicos, confirmações de produção, acumuladores
econômicos e migração versionada. terminalOps publica acumuladores duráveis no
mesmo ponto de confirmação de trades; craft copia os acumuladores antes de GC.
Factory/lab registram intents por estrutura e confirmam no tick seguinte.
Claims distinguem consumidores de cada cadeia e demanda futura.

craftChain cancela em recovery antes de liberar saldo; legacy stranded é
reconciliado com estoque que sobra após proprietários ativos/listings/cargo.
Energia usa necessidade líquida, revalidação por etapa e reposição deduplicada
com limite derivado da margem e orçamento. Diagnósticos explícitos e backoff
evitam recriar a mesma cadeia abortada. APIs manuais permanecem compatíveis.

Sequência: ledger econômico → estoque/produção/recovery → energia → migração
e regressões integradas → check/smoke/build/diff/graphify/docs. Sem deploy.

Correção live: remover o débito inicial de soldBase; após sync, descontar
somente vendas históricas não cobertas pelas operações identificadas. Para
inventory v1 reconstructed, restaurar o débito duplicado demonstrável pela
conservação do produto, limitado a soldBase. Marcar a reconciliação em Memory
para aplicar uma vez; manter custos incompletos explicitamente incompletos.
Validar regressão antes do fix, smoke completo e publicar via grunt normal.

Diagnóstico: filtrar deadOrderIds em reportNoCandidate como candidateOrders;
separar excludedOrders de best. Invalidar diagnóstico ao rejeitar um intent
sem efeito e ao selecionar oferta nova. Atualizar error ao aguardar sem oferta,
preservando lastDeal* como histórico. Smoke reproduz ordem barata descartada,
alternativa acima do limite, todas descartadas e nova oferta executável.
