# 0108 — Estrada do plano é reparada sem exigir tráfego — Tasks

- [x] 1. `worthRepairing()` consulta o plano antes do gate de tráfego.
  - verify: `node --check src/utils/traffic.js`
- [x] 2. Regressões smoke dos quatro casos + ponta a ponta no builder.
  - verify: `node test/smoke.js "$(pwd)"`
- [x] 3. Atualizar `ARCHITECTURE.md` e `ROADMAP.md`.
  - verify: documentação descreve "plano dispensa tráfego, piso continua valendo"
- [x] 4. Validar entrega.
  - verify: `node --check`, `node test/smoke.js` e `npx grunt`

## Notes

W9N9 (sala do bloco de tráfego no smoke) precisa continuar sem plano — o teste
de `architect(room)` sem preview mais abaixo afirma que ela não tem plano — por
isso o caso planejado usa a sala própria W9N8.
