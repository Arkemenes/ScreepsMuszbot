# 0080 — Builder único por sala — Tasks

- [x] 1. Limitar a fórmula base de `builder` a `0..1`.
  - verify: `test/smoke.js` confirma zero sem energia e um com backlog.
- [x] 2. Limitar o autoscale e o delta antigo a um builder.
  - verify: `test/smoke.js` confirma que `grow()` não passa do teto e que delta órfão é clampado.
- [x] 3. Limitar `wantedOverride.builder` a um.
  - verify: `test/smoke.js` confirma override acima do teto.
- [x] 4. Atualizar a documentação da arquitetura.
  - verify: regra documentada sob `src/rooms/`.
- [x] 5. Validar a entrega.
  - verify: `node --check src/rooms/needs.js` · `node --check test/smoke.js` · `node test/smoke.js "$(pwd)"` · `npx grunt`

## Notes

A feature foi formalizada retroativamente para registrar em SDD uma alteração já aplicada durante a conversa.
