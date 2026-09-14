# 0062 — Tasks

- [x] 1. `src/utils/routing.js`: `findRoute`/`routeCostCallback` take
  `opts.avoid` (array), replacing the `isBlacklisted` checks (AC1, AC2)
  - verify: `node --check src/utils/routing.js`
- [x] 2. `src/utils/routing.js`: remove `isBlacklisted`, `blacklistRoom`,
  `isRouteFlapping`, `nudgeAcrossBorder` and their exports (AC7)
  - verify: `grep -n "isBlacklisted\|blacklistRoom\|isRouteFlapping\|nudgeAcrossBorder\|routeBlacklistUntil" src/utils/routing.js` empty
- [x] 3. `src/utils/routing.js`: `moveToRoom()` rewritten to push onto
  `creep.memory._routeAvoid` on `isStuck` (current room always, border
  neighbor when on a border) and recompute route the same tick;
  `nudgeAwayFromBorder` only as an `ERR_NO_PATH`-on-border fallback
  (AC3, AC4, AC5, AC6)
  - verify: `node --check src/utils/routing.js`
- [x] 4. `test/smoke.js`: remove routing.js blacklist/flap assertions,
  add `_routeAvoid`/`opts.avoid` assertions (AC1-AC6)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 5. `specs/ARCHITECTURE.md`/`ROADMAP.md`: atualizar o parágrafo do
  `routing.js` (remove menções a blacklist/flap, descreve `_routeAvoid`)
- [x] 6. `npx grunt` builda `dist/main.js`
- [x] 7. Correção no mesmo dia: `isBouncing(creep)` novo (trilha `[A,B,A,B]`
  por nome de sala, mesma mecânica do antigo `isRouteFlapping` mas só
  detecção, sem decisão embutida de qual sala é a armadilha) - cobre um
  creep que atravessa a borda pra frente e pra trás a cada ciclo (posição
  nunca congela, então `isStuck` nunca vê) - confirmado ao vivo pelo
  usuário. `moveToRoom()` chama antes de `isStuck`; ao disparar, empilha
  as duas salas da trilha em `_routeAvoid` (AC8, AC9)
  - verify: `node --check src/utils/routing.js` · `node test/smoke.js
    "$(pwd)"` verde (683 ok)
- [x] 8. `test/smoke.js`: nova assertion com a geometria real do incidente
  (W1N49/W1N50/E1N45), provando que o redirecionamento escolhe uma sala
  genuinamente diferente (W2N50), não só para de tentar
- [x] 9. `specs/ARCHITECTURE.md`/`ROADMAP.md`: seção da correção
- [x] 10. `npx grunt` builda de novo

## Notes

Log durante a implementação.
