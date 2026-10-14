# Tasks

- [x] Acumuladores econômicos duráveis, migração e GC protegido.
- [x] Saldos reais, intents de produção, claims e stranded reconciliado.
- [x] Recovery de cancelamento e identidade distinta para cadeias simultâneas.
- [x] Energia líquida, reposição/espera/margem/backoff e diagnóstico.
- [x] Smoke de partial/reset/fees/net energy/recovery/legacy e validações finais.
- [x] Publicação via grunt e validação live inicial: W7N49 vendeu barras300 e abriu venda XLH2O915.
- [x] Regressão e reparo idempotente de soldBase duplicado na migração live.
- [x] Validação live de inventory v2/E1N45 e recuperação/backoff de E1N47.
- [x] Diagnóstico compartilhado de ordens descartadas e remoção de erros antigos.
- [x] Verificação live dos novos diagnósticos (83650403); próxima compra confirmada tratada na0136/ARK-126.

Smoke: 6545 assertions verdes, incluindo test/craftRecoveryCases.js. Fixtures
antigas de craft agora materializam os recebimentos físicos e publicam custos
duráveis, em vez de simular somente eventos temporários. Sem commit/deploy.
Custos históricos não demonstráveis permanecem estimados; a migração não
inventa lucro realizado. Ganho de CPU não foi alegado/medido em produção.

Correção live: 6553 assertions verdes, check dos dois JS e dist, diff limpo,
grunt107 módulos com cópia habilitada e hash do cliente idêntico ao dist.
Graphify atualizado:4392 nodes/9096 edges. Publicação local confirmada; falta
verificar execução do reparo no servidor e motivos de espera das duas compras.

Live83650297/83650325: E1N45 com365 produzidos/sold50/saldo315, depois370/50/320.
E1N47 recuperou U1500/X1500 com spent19936.5/403500 e retryAfter83653271.
UH2O de W7N49 sem incoming/estoque após intentOK: não foi confirmado, sem
quantidade/custo fictício. Regressão de diagnóstico reproduzida e corrigida;
6558 assertions verdes. Ainda não foi demonstrada a causa externa da não execução.
