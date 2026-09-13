# 0010 — Dead code & deprecated API sweep

- **Status:** done
- **Analysis refs:** M-tier / Baixo, itens de planejamento G, H, I, L

## Problem

Cruft acumulado aumenta o custo de leitura do código e o tamanho do bundle:

- **Código morto** (nunca `require`d ou nunca chamado):
  - `Room.prototype.distanceTransform` + `diagonalDistanceTransform`
    (`src/prototypes/room.js`, ~200 linhas)
  - `findFirstTowerLocation` (`src/rooms/architect.js`, ~55 linhas)
  - `getShortestPathToAdjacentRooms` (`src/rooms/architect.js`, caller
    comentado)
  - `runGotoRoom` / o `moveToRoom` indefinido que ele chama
    (`src/prototypes/creep.js`)
- **APIs depreciadas do Screeps:** `structure.energy` /
  `structure.energyCapacity` (bootstrap, harvester, upgrader) →
  `store.getUsedCapacity` / `store.getCapacity`.
- **`planCity` roda o corpo completo para toda sala própria todo tick** mesmo
  quando `planned` — a chamada de `visualizeStructures` e um scan de
  `Game.constructionSites`. Deveria fazer early-exit antes.
- Sobras de debug: `console.log` / `if (true)` de dump de visuais em
  `intel.js`, `mincut.js`.
- `@types/lodash@^4` no `package.json` vs o lodash 3 do runtime.

## Desired outcome

Todo símbolo morto removido. Nenhum accessor de store depreciado. `planCity`
faz o mínimo para uma sala terminada. As type defs casam com o runtime.

## Acceptance criteria

1. `grep` por cada símbolo morto retorna só a definição dele (removida) — ou
   seja, nada.
2. Nenhum `\.energy(Capacity)?\b` numa estrutura em `src/roles/`.
3. Para uma sala `planned`, `planCity` roda só `visualizeStructures` +
   `createConstructionSites` e retorna — sem `floodFill`, sem scan completo.
4. `package.json` fixa `@types/lodash` em `^3`.
5. O smoke completo continua verde; a contagem de arquivos do bundle cai.

## Constitution check

- Subtração pura / equivalência; nenhuma mudança de comportamento. Cada remoção
  é coberta por "nenhuma referência restante".
- **§4:** rodar o smoke após cada remoção, não só no fim.

## Notes

Manter esta feature pequena e mecânica. Se um símbolo "morto" acabar sendo
referenciado, separe-o — não conserte aqui.

## Outcome

Entregue.

- **Código morto removido**: `Room.prototype.distanceTransform` +
  `diagonalDistanceTransform` (`prototypes/room.js`, ~190 linhas — só
  `findPositionsInsideRect`, de fato usado pelo `floodFill`, ficou);
  `findFirstTowerLocation` (`architect.js`, ~55 linhas — só chamava a si
  mesma, nunca invocada de fora); `getShortestPathToAdjacentRooms`
  (`architect.js` — o caller já estava comentado) junto com o bloco de código
  comentado que a chamava; `runGotoRoom` + a dependência no `moveToRoom`
  indefinido (`prototypes/creep.js`; `runGoto`, que não está quebrado, ficou).
- **APIs depreciadas**: `structure.energy`/`.energyCapacity` só existiam em
  `bootstrap.js` (o resto do código já usava `store`) — trocadas por
  `store.getFreeCapacity(RESOURCE_ENERGY)`.
- **Early-exit do `planCity`**: já estava correto (o `if (planned) return`
  já vinha antes do `floodFill`/switch, de um trabalho anterior) — adicionada
  uma assertion de smoke pra travar isso como regressão.
- **Debug sempre ligado**: removido o bloco `if (true) { … 2500 visual.circle
  … }` de `mincut.js` (rodava a cada `create_graph`, nunca desligava).
  `intel.js` já estava limpo (resolvido em trabalho anterior).
- **`@types/lodash`**: `^4.14.153` → `^3.10.9`, casando com o lodash 3.10 do
  runtime do Screeps; `npm install` + `node_modules` atualizados.
- Achado extra ao validar (não fazia parte do escopo original, registrado em
  [0013](../0013-stamp-scoring/spec.md)): `getContainerLocations` reaproveita
  container já construído em vez de recalcular a cada replan.

Validado: `grep` de cada símbolo morto e de `\.energy(Capacity)?\b` em
`src/roles/` retorna vazio; `node --check` limpo; `node test/smoke.js` → **101
oks, 0 fails** (+2 assertions: planCity early-exit, mais as de 0013); `npx
grunt` reconstrói `dist/main.js` normalmente (41 arquivos, ~230 linhas a
menos).
