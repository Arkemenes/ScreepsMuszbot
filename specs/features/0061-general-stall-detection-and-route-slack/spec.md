# 0061 — detecção de stall por posição (não só borda) + slack na rota

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-13

## Problem

Depois de três correções ao vivo no mesmo dia (0058, 0060), o usuário
confirmou que o bug persiste **mesmo com a versão mais recente**
(`isBlacklisted(toRoomName)` + `travelStallLimit`, ainda não commitada) —
tanto em claimers (`roles/reserver.js`) quanto em scouts, sem diferença
aparente. `utils/routing.js`'s dois detectores reativos só cobrem padrões
específicos:

- `isRouteFlapping` só vê uma troca de **nome de sala** formando o padrão
  exato `[A,B,A,B]` — um creep que entra numa sala-armadilha e trava **lá
  dentro** (nunca volta pra sala anterior, só fica parado ou vagando sem
  progresso dentro dela) nunca produz uma troca de sala pra essa trilha
  enxergar.
- `isStuckAtBorder` só verifica posição-parada numa tile de borda
  (x/y 0 ou 49) — um creep travado numa tile **interna** (labirinto de
  paredes naturais, bolsão sem saída, corredor bloqueado por outro creep
  por várias ticks) nunca é detectado, porque a checagem descarta
  imediatamente qualquer posição fora da borda.
- `routeCostCallback` restringe o `PathFinder` de `creep.moveTo()` à lista
  **exata** de salas que `findRoute` escolheu (mais a atual e o destino) —
  sem nenhuma folga. Se o hop "oficial" tiver um obstáculo de terreno que
  o grafo de salas do `Game.map.findRoute` não vê (ele só conhece
  adjacência de salas, nunca o terreno interno), o `PathFinder` fica sem
  nenhuma sala vizinha pra contornar, e cada busca ao vivo custa mais CPU
  tentando (e falhando) repetidamente — motivo provável do "tá torrando
  toda CPU" reportado.

Pesquisa (a pedido do usuário): a lib
[screeps-cartographer](https://github.com/glitchassassin/screeps-cartographer)
(`src/lib/Movement/creepIsStuck.ts`, `src/lib/WorldMap/findRoute.ts`)
resolve os dois pontos de um jeito mais simples que o nosso:

1. **Um único detector de stall, sem distinção de borda**: posição igual
   (x, y, sala) por N ticks consecutivos **com `creep.fatigue === 0`** (uma
   fadiga normal de terreno/corpo não conta como travado — checagem que
   nosso código não tinha). Não há detector de borda separado do de
   "travado no meio da sala" — é a mesma checagem em qualquer tile.
2. **`findRoute` ganha folga**: depois do caminho mínimo entre salas, a lib
   adiciona salas vizinhas extras (até um teto) pra dar ao `PathFinder`
   alternativas dentro do "corredor" escolhido, em vez de travá-lo na
   sequência exata de hops.

Não vamos importar a lib (TypeScript, toolchain própria, incompatível com
o build `grunt`/CommonJS deste repo) — só adaptar os dois princípios,
mantendo a regra já estabelecida (0058/0060) de nunca rodar um
`PathFinder.search` proativo, só contabilidade de tick/posição.

## Desired outcome

Um creep que trava em **qualquer** tile (borda ou não) por
`routing.stuckTicks` ticks seguidos sem fadiga é detectado e reage no
mesmo tick — sem esperar um padrão de troca de sala que pode nunca
acontecer. `moveToRoom()`/a exploração livre do scout blacklistam a sala
certa (o vizinho do lado travado quando é borda; a própria sala quando é
travamento interno) e forçam o `creep.moveTo()` seguinte a recalcular do
zero (cache de path descartado) em vez de repetir a mesma busca. A busca
de rota entre salas (`routeCostCallback`) permite, além da sequência exata
de `findRoute`, os vizinhos conhecidos (`Memory.rooms[x].exits`) de cada
hop — quando essa sala tem hostil conhecido e o chamador pede
`blockHostiles`, o vizinho extra respeita a mesma exclusão. Sem intel de
`exits` pra um hop (sala nunca visitada), o comportamento cai pro exato de
hoje (nenhuma folga) — nunca um chute.

## In scope

- `src/utils/routing.js`: `isStuckAtBorder`/seu par de campos de memory
  vira `isStuck(creep, keyPrefix)` — mesma mecânica de posição+contador,
  mas (a) sem a restrição a tiles de borda, (b) reseta o contador (sem
  marcar travado) em qualquer tick com `creep.fatigue > 0`. Novo
  `isOnBorder(creep)` (x/y 0 ou 49) extraído da checagem antiga, usado
  pelos chamadores pra decidir a reação. `moveToRoom()` chama `isStuck`
  no lugar de `isStuckAtBorder`: se travado E na borda, mesma reação de
  hoje (`borderNeighborRoom` + blacklist + `nudgeAwayFromBorder`); se
  travado e NÃO na borda, blacklista `creep.room.name` (a sala em que
  travou, não tem vizinho "do lado" nesse caso) e descarta o cache de
  path do creep (`delete creep.memory._move`) pra forçar
  `creep.moveTo()` recalcular nesse mesmo tick em vez de repetir a busca
  presa.
- `src/roles/scout.js`: mesma troca na exploração livre (`isFlapping` +
  `routing.isStuckAtBorder(creep, "_exploreBorder")` → `routing.isStuck` +
  `routing.isOnBorder`), mesma reação de hoje na borda; travamento interno
  blacklista `targetRoom` (como já faz), limpa `_roomTrail`, descarta o
  cache de path.
- `src/utils/routing.js`'s `routeCostCallback`: recebe `opts` (pra saber
  `blockHostiles`); pra cada sala do `route`, soma ao conjunto permitido
  os vizinhos de `Memory.rooms[roomName].exits` que não estão
  blacklistados (e, com `blockHostiles`, sem hostil conhecido
  — `remotes.hasHostiles`). Sem intel de `exits` pra alguma sala do hop,
  simplesmente não soma nada por ela (fail-soft, igual ao resto do
  módulo).
- `src/utils/config.js`: novo `routing.stuckTicks` (default 4 — mesma
  ordem de grandeza do antigo threshold de borda, 3).
- `test/smoke.js`: reescreve as assertions do 0060 que testavam
  `isStuckAtBorder` puro pra `isStuck`/`isOnBorder`; novas assertions pro
  caso "travado no meio da sala" (não é borda) e pra folga do
  `routeCostCallback`.

## Out of scope

- Importar/portar a lib `screeps-cartographer` (TypeScript, toolchain
  própria) — só os dois princípios, adaptados ao CommonJS/`grunt` deste
  repo.
- `isRouteFlapping`/`isFlapping` (trilha `[A,B,A,B]` por nome de sala) —
  continuam existindo tal como estão; cobrem um padrão diferente (creep
  que **sai e volta** repetidamente, com posição mudando a cada tick, não
  travado numa tile só). Nenhuma mudança nesse mecanismo.
- Portais / múltiplos destinos / heurística de distância — o
  `Game.map.findRoute` nativo já resolve isso mais barato (é C++, não JS)
  que a busca A* própria da lib; só a fase de "dar folga ao PathFinder"
  depois do resultado é adaptada, não o algoritmo de busca de rota
  entre salas em si.
- Qualquer novo `PathFinder.search` proativo — o descarte de
  `creep.memory._move` só acontece **depois** de confirmado o stall
  (reativo), e o próximo `creep.moveTo()` já ia rodar de qualquer jeito
  nesse tick.

## Acceptance criteria

1. `isStuck(creep, keyPrefix)` fica `true` só na N-ésima tick seguida na
   mesma posição (mesmo x, y, sala) e reseta assim que a posição muda —
   igual ao comportamento herdado do `isStuckAtBorder`, agora em qualquer
   tile — `test/smoke.js`: mesmas asserções de "first/second/third tick"
   do 0060, sem exigir borda.
2. Uma tick com `creep.fatigue > 0` nunca conta pro contador, mesmo na
   mesma posição — `test/smoke.js`: `"a tick with fatigue never counts
   toward the stuck counter, even at the same position"`.
3. `isOnBorder(creep)` é `true` só com x/y em 0 ou 49 — `test/smoke.js`:
   reaproveita as asserções de borda existentes.
4. `moveToRoom()` travado **fora** da borda blacklista `creep.room.name` e
   descarta `creep.memory._move` antes do `creep.moveTo()` do mesmo tick —
   `test/smoke.js`: `"stuck in the middle of a room (not a border tile)
   blacklists the current room and drops the cached path"`.
5. `moveToRoom()` travado **na** borda continua com o comportamento do
   0060 inalterado (blacklista o vizinho via `exits`, nudge, sem segunda
   chamada de `moveTo()`) — `test/smoke.js`: reaproveita as asserções do
   0060 (renomeando a chamada pra `isStuck`/`isOnBorder`).
6. `routeCostCallback` com `opts.blockHostiles` nunca inclui um vizinho
   extra com hostil conhecido, mesmo que ele apareça em `exits` de um hop
   — `test/smoke.js`: `"routeCostCallback's slack never adds a
   known-hostile neighbor under blockHostiles"`.
7. `routeCostCallback` sem intel de `exits` pra um hop não adiciona nada
   por ele (comportamento idêntico a hoje) — `test/smoke.js`:
   `"routeCostCallback adds no slack for a hop with no exits intel yet"`.
8. `routeCostCallback` com intel de `exits` inclui o vizinho não-hostil,
   não-blacklistado de cada hop, além da sequência exata do `route` —
   `test/smoke.js`: `"routeCostCallback's allowed set includes a hop's
   known neighbor as slack, on top of the exact route"`.
9. Travado na borda de uma sala que já está tão perto (ou mais) do
   `toRoomName` quanto a vizinha identificada blacklista a sala **atual**
   (não a vizinha) e cruza de volta pra ela (`nudgeAcrossBorder`), em vez
   de tentar entrar mais fundo numa armadilha já cruzada —
   `test/smoke.js`: `"stuck at the border of a room already crossed INTO
   (closer to or equal distance from the destination than the neighbor)
   blacklists the current room, not the neighbor behind it, and nudges
   back across the border"`.
10. Travado na borda do lado seguro (vizinha genuinamente mais perto do
    destino) mantém o comportamento original do 0060 — blacklista a
    vizinha, `nudgeAwayFromBorder` pra dentro da sala atual —
    `test/smoke.js`: reaproveita as asserções existentes do 0060/0061.
11. `isRouteFlapping` fechando o padrão ABAB com o creep na sala SEGURA
    (mais longe de `toRoomName` que a outra sala da trilha) ainda
    blacklista a armadilha de verdade (mais perto), nunca a segura —
    `test/smoke.js`: `"the ABAB pattern closing on the SAFE room (W1N50)
    still blacklists the real trap (W1N49, closer to the destination),
    never the corridor the creep needs to retreat through"`.

## Constitution check

- **CPU:** nenhuma busca de `PathFinder`/`findRoute` nova além da que já
  rodava — o descarte de `_move` só faz o `creep.moveTo()` já-planejado
  desse tick recalcular em vez de reusar um path morto; a folga do
  `routeCostCallback` é só leitura de `Memory.rooms[x].exits` já cacheado,
  no máximo 4 vizinhos por hop do `route` (tipicamente <10 hops).
- **Memory:** mesmos campos por creep de antes (posição+contador), só
  sem a restrição de borda — nenhum campo novo por sala.
- **Fail-soft:** sem intel de `exits`, o comportamento é idêntico ao
  atual (sem folga). Sem stall, idêntico ao atual (contador só cresce
  quando a posição não muda, igual antes).

## Correção no mesmo dia: borda tem dois lados, `borderNeighborRoom` só sabia de um

Usuário testou ao vivo e reportou um caso novo: o claimer entrou numa sala
de um **aliado** (nunca penalizada por `findRoute` — não é hostil) cujo
interior está fechado (sem caminho da entrada até a saída — provável
rampart do aliado, não-nossa/não-pública). O creep ficou parado bem na
borda, e daí em diante **ficou indo e voltando entre essa sala e a
anterior, sem nunca recalcular por outra sala**.

Causa: o branch de borda do `moveToRoom()` (`isStuck` + `isOnBorder`)
assume sempre o mesmo cenário do 0060 original — o creep ainda está do
lado **seguro**, tentando cruzar pra dentro de um vizinho intransponível,
então `borderNeighborRoom(creep)` (lê `Memory.rooms[creep.room.name].exits`
do lado travado) devolve corretamente a armadilha. Mas aqui o creep **já
cruzou** pra dentro da sala-armadilha (o interior dela é que está
bloqueado, não a entrada) e travou bem na borda dela, do lado voltado pra
sala de onde veio — nesse caso `borderNeighborRoom` lê os `exits` da
própria armadilha e devolve a sala **anterior** (seguro), o lado errado.
Resultado: blacklista a sala segura (sem efeito nenhum — não é ela quem
bloqueia o avanço) e nunca blacklista a armadilha de verdade, então o
próximo `findRoute()` segue escolhendo o mesmo caminho.

Fix: `moveToRoom()` não confia mais cegamente na direção geométrica —
compara `Game.map.getRoomLinearDistance` da sala atual e da vizinha
identificada até `toRoomName` (o destino final, não o hop seguinte). Se a
sala atual já está tão perto (ou mais perto) do destino quanto a vizinha,
o creep já cruzou pra dentro da armadilha — blacklista `creep.room.name`
(não a vizinha), descarta o path em cache, e usa o novo
`nudgeAcrossBorder(creep)` (anda 1 tile **pra fora**, cruzando de volta pra
vizinha, em vez de mais pra dentro) em vez de `nudgeAwayFromBorder`. Só
quando a vizinha está genuinamente mais perto do destino (o cenário
original do 0060) é que o comportamento antigo se aplica (blacklista a
vizinha, `nudgeAwayFromBorder` pra dentro da sala atual, que aqui é o lado
seguro). `roles/scout.js`'s branch de exploração livre não precisa desse
fix — já blacklista `creep.memory.targetRoom` diretamente (o hop que ELE
mesmo escolheu, não inferido por geometria de borda), correto nos dois
cenários sem ambiguidade.

## Segunda correção no mesmo dia: `isRouteFlapping` blacklistava cara-ou-coroa

Usuário testou ao vivo a correção acima e reportou "o problema continuou
exatamente como estava desde o começo" — mandou um dump real de
`Memory.creeps`/`Memory.rooms` que revelou a causa verdadeira, diferente da
primeira correção: um claimer (missão `"claim"`, `targetRoom` `"E1N45"`)
bate entre a sala de um aliado (`W1N49` — nunca penalizada por `findRoute`,
não é hostil, mas o interior está fechado por rampart/muralha do próprio
aliado) e o corredor atrás dela (`W1N50`). O dump mostrou **as duas salas
blacklistadas** — `W1N49` (a armadilha de verdade) e `W1N50` (o corredor
seguro que o creep precisava pra recuar), com timestamps de expiração
diferentes.

Causa: `isRouteFlapping` (mecanismo original do 0058, intocado pela
primeira correção de hoje) sempre blacklistava `creep.room.name` — "a sala
em que o creep está no momento em que o padrão ABAB fecha" — sem nenhuma
noção de qual das duas salas é a armadilha. Isso é cara-ou-coroa: o padrão
pode fechar tanto com o creep na armadilha quanto no lado seguro,
dependendo só do timing de qual tick o script rodou. Quando fecha do lado
errado, o efeito é pior que não fazer nada: envenena a própria rota de
fuga (a sala segura fica blacklistada) enquanto a armadilha de verdade
segue livre pra ser tentada de novo.

Confirmado com a matemática real (`Game.map.getRoomLinearDistance`):
`W1N49` está a distância 4 de `E1N45`, `W1N50` está a distância 5 — `W1N49`
é a sala "adiante" (a armadilha), `W1N50` é "atrás" (segura). Fix: mesma
lógica direcional da correção anterior, aplicada aqui também — ao detectar
o flap, compara a distância das DUAS salas da trilha (`trail[len-1]`,
`trail[len-2]`) até `toRoomName` e blacklista a mais perto (ou empatada),
nunca "a que o creep calha de estar". `roles/scout.js`'s próprio
`isFlapping()` não precisa do fix — já blacklista `targetRoom` (o hop que
ele mesmo escolheu explicitamente), nunca "a sala atual", então nunca teve
essa ambiguidade.

Nota pro usuário: as duas salas já blacklistadas no dump (`W1N49` até
`82966184`, `W1N50` até `82965431`) continuam do jeito que estão até
expirar sozinhas — o fix vale pro próximo ciclo de flap, não desfaz um
blacklist já gravado. Pra liberar `W1N50` na hora, sem esperar expirar:
`delete Memory.rooms.W1N50.routeBlacklistUntil` no console do jogo.

## Open questions

Nenhuma.
