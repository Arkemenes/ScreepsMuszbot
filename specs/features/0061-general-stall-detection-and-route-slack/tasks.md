# 0061 — Tasks

- [x] 1. `src/utils/config.js`: adicionar `routing.stuckTicks` (default 4)
  - verify: `node --check src/utils/config.js`
- [x] 2. `src/utils/routing.js`: extrair `isOnBorder(creep)` da checagem de
  borda que hoje vive dentro de `isStuckAtBorder`
  - verify: `node --check src/utils/routing.js`
- [x] 3. `src/utils/routing.js`: renomear `isStuckAtBorder` → `isStuck`,
  remover a restrição de borda (`if (!onBorder) return false`), adicionar
  guard de `creep.fatigue > 0` (reseta contador, não conta) (AC1, AC2)
  - verify: `node --check src/utils/routing.js`
- [x] 4. `src/utils/routing.js`: `moveToRoom()` troca a chamada por
  `isStuck` + `isOnBorder`; branch de borda mantém o comportamento atual
  (blacklist do vizinho + nudge); novo branch "travado, não é borda"
  blacklista `creep.room.name` e `delete creep.memory._move` (AC4, AC5)
  - verify: `node --check src/utils/routing.js`
- [x] 5. `src/roles/scout.js`: exploração livre troca
  `routing.isStuckAtBorder(creep, "_exploreBorder")` por
  `routing.isStuck(creep, "_exploreStuck")` + `routing.isOnBorder(creep)`,
  mesmo branch novo pro caso "travado, não é borda"
  - verify: `node --check src/roles/scout.js`
- [x] 6. `src/utils/routing.js`: `routeCostCallback` ganha parâmetro `opts`
  e soma vizinhos de `Memory.rooms[hop].exits` de cada hop do `route` ao
  `allowed`, pulando blacklistados e (com `opts.blockHostiles`) hostis
  conhecidos; `moveToRoom()` passa `opts` na chamada (AC6, AC7, AC8)
  - verify: `node --check src/utils/routing.js`
- [x] 7. `test/smoke.js`: atualizar as assertions do 0060 que chamavam
  `isStuckAtBorder`/campos `_routeBorder*`/`_exploreBorder*` diretamente
  pra `isStuck`/`isOnBorder`/campos `_routeStuck*`/`_exploreStuck*`;
  adicionar as novas assertions (AC1–AC8)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 8. `specs/ARCHITECTURE.md`: parágrafo novo sobre o detector
  unificado + slack de rota (referenciando ROADMAP 0061)
- [x] 9. `npx grunt` builda `dist/main.js`; `ROADMAP.md` status 0061 →
  `done`

- [x] 10. Correção no mesmo dia: `nudgeAcrossBorder(creep)` novo em
  `src/utils/routing.js`; `moveToRoom()`'s branch de borda compara
  `Game.map.getRoomLinearDistance` da sala atual vs. da vizinha até
  `toRoomName` pra decidir se a armadilha é a vizinha (comportamento
  original) ou a própria sala atual (creep já cruzou pra dentro dela)
  (AC9, AC10)
  - verify: `node --check src/utils/routing.js` · `node test/smoke.js
    "$(pwd)"` verde
- [x] 11. `test/smoke.js`: novas assertions (AC9); renomeadas duas salas
  fictícias (`WBorderStall2`→`E77N77`, `WBorderTrap`→`E77N78`) pro padrão
  `[EW]\d+[NS]\d+` que `Game.map.getRoomLinearDistance` exige; adicionadas
  constantes de direção (`TOP`/`RIGHT`/`BOTTOM`/`LEFT`/diagonais) que
  faltavam no harness
- [x] 12. `specs/ARCHITECTURE.md`/`ROADMAP.md`: parágrafo da correção no
  mesmo dia
- [x] 13. `npx grunt` builda de novo
- [x] 14. Segunda correção no mesmo dia (dump real de `Memory.creeps`/
  `Memory.rooms` do usuário revelou que a 1ª correção não resolveu):
  `isRouteFlapping`'s blacklist em `moveToRoom()` também vira comparação
  de `getRoomLinearDistance` entre as duas salas da trilha (`trail[len-1]`,
  `trail[len-2]`) até `toRoomName`, em vez de sempre `creep.room.name`
  (AC11)
  - verify: `node --check src/utils/routing.js` · `node test/smoke.js
    "$(pwd)"` verde (685 ok)
- [x] 15. `test/smoke.js`: nova assertion (AC11) usando a geometria real
  do incidente (`W1N49`/`W1N50`/`E1N45`)
- [x] 16. `specs/ARCHITECTURE.md`/`ROADMAP.md`/`spec.md`: seção da segunda
  correção
- [x] 17. `npx grunt` builda de novo

## Notes

- `isStuck()`'s threshold usa `config.get("routing.stuckTicks", 4) - 1`
  como comparação (contador começa em 0 na primeira ocorrência da posição,
  cresce 1 por tick igual seguinte) — com o default 4, fecha na 4ª tick
  seguida na mesma posição, uma tick mais tarde que o antigo hardcoded
  `>= 2` (3ª tick) do `isStuckAtBorder`. Todos os testes do 0060 que
  contavam ticks foram ajustados de 2/3 pra 3/4 chamadas.
- `roles/scout.js`'s branch novo reusa `nudgeAwayFromBorder`'s próprio
  retorno (`false` fora da borda) em vez de chamar `isOnBorder` de novo —
  mesma checagem, um call site a menos.
- Smoke test: `moveCalls`/`moveCalls2`/`moveCalls3` (contadores de
  chamada de `moveTo`/`move`) precisam ser zerados imediatamente antes da
  última chamada que dispara o stall — do contrário contam também as
  chamadas normais das ticks anteriores que não dispararam nada (bug de
  teste pego pelo próprio smoke, não pelo code review).
