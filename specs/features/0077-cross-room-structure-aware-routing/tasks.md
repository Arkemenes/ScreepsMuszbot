# 0077 — Roteamento multi-sala considera estrutura conhecida — Tasks

- [x] 1. `src/utils/routing.js`: `require("./move")` + helper
      `knownStructureMatrix(roomName)` (devolve `move.roomMatrix(Game.rooms[roomName])`
      se a sala está em visão, `null` caso contrário)
  - verify: `node --check src/utils/routing.js`
- [x] 2. `computeRealRoute`'s `roomCallback` usa `knownStructureMatrix()` pra
      sala em visão que passou nas checagens de avoid/hostil/allowRoom/dead-end (AC1, AC4)
  - verify: `node --check src/utils/routing.js`
- [x] 3. `routeCostCallback` usa `knownStructureMatrix()` pra sala dentro do
      `allowed` set (AC2, AC4)
  - verify: `node --check src/utils/routing.js`
- [x] 4. `avoidCostCallback` usa `knownStructureMatrix()` pra sala que passou
      nas checagens existentes (AC3, AC4)
  - verify: `node --check src/utils/routing.js`
- [x] 5. `test/smoke.js`: mock de sala visível com estrutura bloqueante
      (`STRUCTURE_WALL` ou `STRUCTURE_RAMPART` `my:false`/`isPublic:false`)
      na única tile de passagem — assertions pras três funções (AC1, AC2, AC3)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 6. `test/smoke.js`: assertion de regressão pra sala SEM
      `Game.rooms[roomName]` — as três funções devolvem exatamente o
      comportamento de hoje (AC4)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 7. `npx grunt` builda `dist/main.js`; `ROADMAP.md` status 0077 → `done`
      com resumo do fix

## Notes

- 4 assertions pré-existentes (`test/smoke.js`) quebraram de propósito ao
  implementar: elas checavam identidade (`=== matrix` recebida) pra
  "W1N1" (a sala principal do smoke, sempre em `Game.rooms`) como prova de
  "está permitida" — exatamente a suposição que este spec invalida (AC2/
  AC3: sala em visão agora recebe uma matrix DIFERENTE, com estrutura
  conhecida). Reescritas pra `!== false` (ainda permitida, sem exigir mais
  identidade de objeto), mesmo precedente já usado no ROADMAP 0064 quando
  `avoidCostCallback` invalidou a assertion antiga de lista-de-permissão.
- `move.roomMatrix(room)` exige só `.name` e `.find(type)` no objeto sala —
  o mock de sala do smoke test (`new Room(name)` + `.find` custom) já
  bastou, sem precisar estender a classe `Room` do harness.
- 789 assertions verdes (783 antes + 6 novas: AC1, AC2, AC3, e 3 de
  regressão AC4). `npx grunt` build limpo.

## Fechamento (2026-10-20, ARK-10)

A pendência do ROADMAP ("creep ainda pode ficar parado; reproduzir antes de fechar")
referia-se ao caminho nativo multi-sala anterior. Ele foi substituído pela navegação
incremental (`travelToRoom`/`moveToRoom` por salto, cache de grafo, `allowUnplannedHop`;
ARK-102/110/111/112/113 concluídas). Live tick ~83775740: nenhum creep com
`_m.stuck > 2`, nenhuma sala marcada como beco sem saída, último claim (E6N41) aceito.
Feature fechada; uma nova ocorrência de travamento vira bug próprio com reprodução.
