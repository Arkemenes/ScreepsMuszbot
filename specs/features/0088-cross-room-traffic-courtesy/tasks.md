# 0088 — Cross-room traffic courtesy — Tasks

- [x] 1. Reutilizar `excuseMe.ask()` em `routing.moveToRoom()` (AC1, AC2, AC3)
  - verify: `node --check src/utils/routing.js`
- [x] 2. Adicionar assertions de ocupante próprio e tile livre (AC1, AC2)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 3. Rodar build e atualizar documentação (AC4)
  - verify: `npx grunt`

## Notes

- Evidência ao vivo: scout em `E1N47:44,11`, intenção para `E1N47:45,12`, ocupado por `Marek Briarwood` (hauler, fadiga 0).