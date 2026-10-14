# Tasks

- [x] Acumuladores econômicos duráveis, migração e GC protegido.
- [x] Saldos reais, intents de produção, claims e stranded reconciliado.
- [x] Recovery de cancelamento e identidade distinta para cadeias simultâneas.
- [x] Energia líquida, reposição/espera/margem/backoff e diagnóstico.
- [x] Smoke de partial/reset/fees/net energy/recovery/legacy e validações finais.
- [ ] Publicação e validação live (após publicação pelo usuário).

Smoke: 6545 assertions verdes, incluindo test/craftRecoveryCases.js. Fixtures
antigas de craft agora materializam os recebimentos físicos e publicam custos
duráveis, em vez de simular somente eventos temporários. Sem commit/deploy.
Custos históricos não demonstráveis permanecem estimados; a migração não
inventa lucro realizado. Ganho de CPU não foi alegado/medido em produção.
