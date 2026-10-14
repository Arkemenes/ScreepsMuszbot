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
