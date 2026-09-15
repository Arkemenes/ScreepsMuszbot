# 0077 — Roteamento multi-sala considera estrutura conhecida — Plan

Derivado de `spec.md`.

## Approach

`utils/move.js` já resolve "quais tiles desta sala são impassáveis por
estrutura" pra movimento intra-sala: `roomMatrix(room)` monta uma
`PathFinder.CostMatrix` a partir de `roomCache.structures(room)` +
`roomCache.constructionSites(room)` (estrada = custo 1; container e
rampart própria/pública = andável; qualquer outra estrutura/canteiro =
255 impassável), cacheada no heap por sala e só reconstruída quando a
contagem de estrutura+canteiro muda. É exatamente o dado que falta nas
três funções de passabilidade multi-sala de `utils/routing.js`.

A mudança é local a essas três funções: onde cada uma hoje decide "essa
sala está permitida, use terreno puro" (`computeRealRoute`'s
`roomCallback` devolvendo `undefined`; `routeCostCallback`/
`avoidCostCallback` devolvendo a `matrix` vazia recebida do engine sem
modificação), ela passa a checar `Game.rooms[roomName]` primeiro — se a
sala está em visão agora, devolve `move.roomMatrix(Game.rooms[roomName])`
em vez do fallback terreno-only. Nenhuma mudança em QUAIS salas entram no
`allowed`/passam nas checagens de avoid/hostil/dead-end — só o que a
função devolve pra uma sala já aceita. Um helper único,
`knownStructureMatrix(roomName)`, evita repetir o `Game.rooms[...] ?
move.roomMatrix(...) : null` três vezes.

## Modules

### New

Nenhum módulo novo.

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | `require("./move")` novo; helper `knownStructureMatrix(roomName)`; `computeRealRoute`'s `roomCallback`, `routeCostCallback`, `avoidCostCallback` passam a devolver a matrix de `move.roomMatrix()` pra sala em visão, em vez do fallback terreno-only atual |
| `test/smoke.js` | Novas assertions (AC1–AC4): sala visível com estrutura bloqueante fecha a busca/marca a tile impassável nas três funções; sala sem visão continua no comportamento de hoje (regressão) |

## Data shapes

Nenhum dado novo em `Memory` nem heap — `move.roomMatrix()` já é cacheada
(chave `room.name`, versão = contagem de estrutura + canteiro) dentro de
`utils/move.js`; este spec só reaproveita essa cache existente, não cria
outra.

## How it satisfies the constitution

- **CPU (§1):** `roomMatrix()` só roda (e só quando o cache de versão
  expira) pra sala já em `Game.rooms` — mesmo custo que já é pago hoje
  pro `travel()` intra-sala dessa sala, nenhum `room.find` novo
  introduzido pelas três funções de `routing.js`.
- **Memory (§2):** nenhuma mudança — a cache de `roomMatrix()` vive só no
  heap (`matrices` module-level em `move.js`), nunca em `Memory`.
- **Fail-soft (§3):** `knownStructureMatrix()` devolve `null`
  (fallback pro comportamento atual) pra qualquer sala sem
  `Game.rooms[roomName]` — sem exceção possível, sem `try/catch`
  necessário (mesma garantia que `move.roomMatrix()` já tem pra sala
  própria).
- **Offline test (§4):** `test/smoke.js` ganha um mock de sala visível
  (`Game.rooms[roomName]` com `.find`/`.name` reais, reaproveitando o
  padrão já usado pela sala de preview em `planLayout()`'s teste) com uma
  `STRUCTURE_WALL`/`STRUCTURE_RAMPART` (`my:false`, `isPublic:false`)
  bloqueando a única tile de passagem — AC1–AC4 verificam as três funções
  e o caso sem-visão.
- **§5 roles finos / utils dono do cross-cutting:** reuso entre dois
  utils (`routing.js` → `move.js`), nenhum role tocado; sem `require`
  circular (`move.js` só depende de `./roomCache` e `./excuseMe`).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `roomMatrix()` marca rampart/wall PRÓPRIA como impassável por engano, travando o próprio creep em sala nossa | Já não acontece — `roomMatrix()` trata `STRUCTURE_RAMPART` com `my \|\| isPublic` como andável; comportamento herdado, não nova lógica |
| Layering da matrix de estrutura sobre uma sala que TAMBÉM está em `opts.avoid`/dead-end reintroduz um caminho que devia estar bloqueado | Ordem preservada: os `return false` de avoid/hostil/dead-end/`allowRoom` continuam checados ANTES do `knownStructureMatrix()` nas três funções — a troca só se aplica à sala que já passou em todas as checagens existentes |
| `require("./move")` novo em `routing.js` introduz dependência circular | Verificado: `move.js` requer só `./roomCache` e `./excuseMe`, nenhum dos dois requer `routing.js` — sem ciclo |

## Rollback

Reverter o commit desta feature — as três funções voltam a devolver o
fallback terreno-only incondicionalmente, `require("./move")` removido.
Nenhuma migração de dado envolvida (nada em `Memory`), reversão é só
código.
