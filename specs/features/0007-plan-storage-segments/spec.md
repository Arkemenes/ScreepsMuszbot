# 0007 — Plan storage → RawMemory.segments

- **Status:** done
- **Analysis refs:** item de planejamento D (item 9)

## Problem

`Memory.rooms[name].buildings` (~200–300 entradas de `{x, y, structureType,
minimalRCL, …}`) e `Memory.rooms[name].mincutBoundries` são guardados na
`Memory`, que é serializada (`RawMemory._parsed = Memory`) **todo tick**. Para
algumas salas planejadas isso é ~10–15 KB de stringify + parse por tick que só
é de fato lido durante o planejamento e por `plan.js` / `architect.js`.

## Desired outcome

Planos de cidade vivem em `RawMemory.segments`, carregados sob demanda e
cacheados no heap pelo tick. `Memory.rooms[name]` guarda só um marcador pequeno
de `planStep` / `planned` / `planVersion`. O tamanho de Memory por tick e o
custo de serialização caem de forma mensurável. Nada no comportamento dos roles
muda.

## In scope

- Um módulo `utils/planStore.js`: `getPlan(roomName)` (leitura do segment da
  sala, cacheada no heap), `setPlan(roomName, plan)` (write-through),
  `dropPlan`.
- `plan.js` (`isPlanned`, `planEntriesAt`) lê via `planStore`.
- `architect.js` lê/escreve `buildings` + `mincutBoundries` via `planStore`.
- `replanRoom` limpa o segment.
- Uma migração: na primeira leitura, se o segment está vazio mas
  `Memory.rooms[name].buildings` existe, mover para lá e apagar a cópia da
  Memory.

## Out of scope

- Mudar o formato do plano ou o algoritmo do planejador.
- Mover contadores de intel ou `exits` para fora da Memory (são pequenos).
- Coordenação de segment multi-shard.

## Acceptance criteria

1. Depois de planejar uma sala, `Memory.rooms[name]` não tem chave `buildings`
   nem `mincutBoundries`; o dado é recuperável via `planStore.getPlan`.
   *(smoke asserta)*
2. `isPlanned(structure)` e o targeting de reparo de `builder` / `tower` se
   comportam de forma idêntica ao de antes para uma sala planejada.
   *(as assertions existentes do smoke continuam verdes)*
3. Uma sala com `Memory.rooms[name].buildings` pré-existente (formato antigo) é
   migrada para um segment no próximo tick do planejador sem perder o plano.
   *(smoke: semear formato antigo, rodar, assertar migração)*
4. Leituras de segment são cacheadas por tick — no máximo um parse de
   `RawMemory.segments[…]` por sala por tick.
5. Só segments inteiros são usados; total de bytes de segment por sala < 100 KB
   (o limite por segment).

## Constitution check

- **Memory (§2):** este é o ponto — dado grande e persistente → segments.
- **CPU (§1):** o JSON do segment é parseado uma vez/sala/tick e cacheado no
  heap; ganho líquido vs parsear dentro do blob de Memory inteiro todo tick
  independente do uso.
- **Fail-soft (§3):** um segment ausente/corrompido retorna `null` → o
  planejador trata a sala como não-planejada e reconstrói; nunca lança.
- **Offline test (§4):** o smoke stuba `RawMemory.segments` como objeto simples
  e `RawMemory.setActiveSegments` como no-op.

## Open questions

- Alocação de id de segment: mapa fixo `roomName → id` numa chave de config, ou
  uma free-list? (O Screeps permite segments 0–99; um bot raramente tem > 20
  salas.) → `Memory.planSegments = { "W1N1": 10, … }` (chave própria, fora de
  `Memory.settings` — ver Outcome), atribuído preguiçosamente a partir de um
  offset base (ex.: 10) conforme as salas são planejadas.
- `RawMemory.setActiveSegments` só permite 10 ativos por tick. O planejamento
  toca uma sala por vez, então ativar o segment daquela sala no tick anterior
  ao necessário. Aceitável? → sim, o planejador já se espalha por vários ticks.

## Outcome

Entregue. Novo `src/utils/planStore.js` — única porta pro plano
(`getPlan`/`setPlan`/`mutate`/`dropPlan`/`activate`), cache no heap
(`{roomName: plan}`, invalidado só pelas próprias escritas), segment id
preguiçoso em `Memory.settings.planSegments` a partir de 10. `architect.js`
(todos os `case`, `addBuildings`, `findStampLocation`, `createConstructionSites`,
`getShortestPath`, `replanRoom`, `destroyUnplannedRoads`), `plan.js`
(`planIndex`) e `prototypes/room.js` (`floodFill`) passam a ler/escrever via
`planStore` em vez de `Memory.rooms[name].buildings`/`.mincutBoundries`. `main.js`
chama `planStore.activate()` todo tick. Migração automática do formato antigo no
primeiro `getPlan` de uma sala. Validado pelo smoke (98 assertions, incluindo
round-trip + migração) + `npx grunt`.

**Bug real encontrado depois, caçando "torres/links mudam de lugar a cada
replan"**: o mapa id→sala morava em `Memory.settings.planSegments`. Um
`Memory.settings = {...}` no console (exatamente o padrão que o comentário do
`main.js` sugere pra ligar o profiler) substitui `Memory.settings` por
inteiro, apagando esse mapa — mas `RawMemory.segments` continua com os dados
antigos. A próxima sala a pedir um id podia cair num slot **já ocupado** e
herdar silenciosamente o plano de outra sala. Corrigido: o mapa foi pra
`Memory.planSegments` (fora de `Memory.settings`, não é mais afetado por essa
reatribuição); e cada segment agora é marcado com o nome da sala
(`{room, buildings, mincutBoundries}`) — `getPlan` recusa um segment cuja tag
não bate, então uma colisão de id nunca mais devolve o plano errado (fica só
tratado como "sem plano ainda", refaz). Duas assertions de smoke cobrem
diretamente essa colisão + a sobrevivência a um `Memory.settings = {...}`.
