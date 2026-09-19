# 0101 — Gates de storage para reparo defensivo — Tasks

- [x] 1. Adicionar os thresholds configuráveis de 10% e 70%.
  - verify: `node --check src/utils/config.js`
- [x] 2. Centralizar comparações inclusiva/exclusiva em `resourceTiers`.
  - verify: `node --check src/utils/resourceTiers.js`
- [x] 3. Aplicar os gates compartilhados a builder e tower.
  - verify: `node --check src/utils/rampartRepair.js`
- [x] 4. Atualizar regressões do smoke para crítico, saudável, hardening,
  builder, tower e prioridades.
  - verify: `node test/smoke.js`
- [x] 5. Atualizar `ARCHITECTURE.md` e `ROADMAP.md`.
  - verify: documentação referencia os gates 10%/70% sem alterar o threshold econômico de 50%
- [x] 6. Validar a entrega.
  - verify: `node --check`, `node test/smoke.js` e `npx grunt`

## Notes

O limite saudável é estritamente maior que 10%; o limite de hardening inclui
exatamente 70%, conforme a decisão do usuário.
