# 0089 — Passo cacheado em rota multi-sala — Tasks

- [x] 1. Seguir `_move.path` após `moveTo() === OK` em `routing.js` (AC1, AC2, AC3)
  - verify: `node --check src/utils/routing.js`
- [x] 2. Atualizar smoke para caminho livre, ocupado e erro (AC1, AC2, AC3)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 3. Rodar build e atualizar documentação (AC4)
  - verify: `npx grunt`

## Notes

- Evidência ao vivo: um `move(4)` direto retornou `OK` e tirou o scout da inércia; 0088 só emitia esse passo quando `excuseMe` encontrava bloqueador.