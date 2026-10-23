# 0187 — Plan

## Módulos

- **Novo `src/rooms/lootRelay.js`**: planejamento da corrente, só no heap.
  - `enabled(loot)`: `loot.relay !== false && config loot.relay`.
  - `destination(loot)`: storage da mãe (`Game.rooms[loot.from]`), senão
    primeiro container via `roomCache.structures`. É o alvo do caminho.
  - `searchPath(loot, dest)`: `PathFinder.search` de `(25,25,loot.room)` até
    `{pos: dest.pos, range: 1}`, `plainCost` 2 / `swampCost` 10,
    `maxRooms` 64, `maxOps` `loot.relayMaxOps`, `roomCallback`
    `routing.avoidCostCallback([], {currentRoomName: loot.room})` (mesma
    política de sala: transitSafety, dead ends, estruturas conhecidas).
    Span `loot.relayPath`. `incomplete`/vazio → `null`.
  - `boundaries(path, n)`: `b[0]=0`, `b[n]=L-1`, `b[k]` perto de
    `round(k·L/n)` com `path[b]` e `path[b-1]` fora da borda (o giver fica em
    `b-1`, o receiver em `b`), estritamente crescente; impossível → `null`.
  - `link(loot, creep, members)`: cria/reaproveita o plano
    `{destId, tick, path, index: Map("sala:x:y"→i), byRoom, bounds, assign}`;
    refaz caminho quando muda `destId`, vence `loot.relayRepathTicks` ou o
    heap reseta; refaz `bounds`/`assign` quando muda o conjunto de nomes.
    Ordem por progresso: índice no caminho; fora dele, na sala alvo = −1,
    na mesma sala de algum tile = índice mais próximo, senão `L`.
    Retorna `{plan, seg, n, start, end}` ou `null` (fail-soft → 0184).
  - `walk(creep, plan, target)`: no caminho → `moveByPath` sobre a fatia
    (ida) ou fatia invertida (volta); fora dele → `moveTo` do tile do caminho
    mais próximo na sala, ou `routing.travelToRoom` até a sala do alvo.
  - `describe(loot)`: trechos, comprimento, pontos de troca `sala:x,y`,
    atribuição — usado por `lootStatus()`.
- **`src/roles/looter.js`**: `run()` tenta `lootRelay.link` antes do fluxo
  0184 (só com missão ativa e sem `memory.unloading`). Papéis:
  - trecho 0 vazio/parcial: volta ao índice 0 e coleta na sala alvo como hoje;
  - com carga e não último: vai a `end−1`, transfere ao dono do trecho
    seguinte quando adjacente; espera com teto `loot.relayWaitTicks`, depois
    marca `unloading` e cai na entrega 0184;
  - último com carga: vai a `L−1`, entrega no storage, senão container da
    mãe com espaço, senão espera;
  - vazio e não trecho 0: volta a `start` e espera.
- **`src/rooms/looting.js`**: exporta `looters`; `lootRoom(alvo, mãe, opts)`
  grava `relay:false`; `lootStatus` inclui `lootRelay.describe`.
- **`src/utils/config.js`**: `loot.relay` true, `relayRepathTicks` 1500,
  `relayWaitTicks` 50, `relayMaxOps` 20000.

## Dados

Heap: `plans: Map(lootId → plano)`, `waits: Map(nome → tick)`, limpos quando
a missão some ou o plano fica 100 ticks sem uso. Memory: só `loot.relay`
opcional.

## Riscos

- Tráfego em sentidos opostos no mesmo caminho: troca de posição entre
  creeps próprios é permitida pelo engine; o stall guard cobre o resto.
- `moveByPath` atravessa bordas porque o caminho do PathFinder inclui os
  tiles de saída e entrada.
