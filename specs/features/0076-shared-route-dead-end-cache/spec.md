# 0076 — shared-route-dead-end-cache

- **Status:** done
- **Owner:** usuário (bug reportado ao vivo)
- **Created:** 2026-09-14

## Problem

Usuário reportou ao vivo: pioneers saindo de E1N47 rumo a E1N45 entram no
E1N46, descobrem que não tem caminho (rampart/wall de um **aliado** — o
mesmo gap que `ROADMAP.md`'s seção "Later" já documentava, "só volta a ser
trabalhada quando reaparecer ao vivo"), recuam pro E1N47 e só então seguem
pela rota certa (E0N47→E0N46→E0N45→E1N45). `computeRealRoute` (ROADMAP
0064) só valida **terreno** (`Game.map.getRoomTerrain`), nunca estrutura —
e sala de aliado é isenta de propósito do filtro de "perigosa"
(`isDangerousRoom`, ROADMAP 0064), então nada barra a rota na hora do
pré-cálculo.

O recuo reativo (`retreatFrom`, ROADMAP 0063) funciona certo — mas é
**por-creep** (`creep.memory._routeAvoid`, ROADMAP 0062): cada pioneer novo
mandado de E1N47 repete a mesma descoberta cara, porque nada do que o
primeiro pioneer aprendeu sobre o E1N46 sobrevive pra o segundo.

## Desired outcome

Uma vez que QUALQUER creep confirma que uma sala é um beco sem saída de
verdade (via `retreatFrom()` — `creep.room.name` no momento em que o
`ERR_NO_PATH` foi confirmado, nunca um chute), essa sala vira **conhecida**
pra todo mundo: `findRoute`/`computeRealRoute`/`routeCostCallback`/
`avoidCostCallback` todos excluem ela igual a `opts.avoid`, e
`moveToRoom()` recusa na hora se o próprio destino for a sala confirmada.
Isso não elimina o custo do PRIMEIRO creep que bate de frente (`terreno vs.
estrutura` continua sendo um blind spot genuíno sem visão), mas elimina a
repetição pra todo sibling que vem depois — o cenário real relatado (vários
pioneers da mesma sala-mãe, mesmo alvo).

A marca tem TTL (`routing.deadEndTicks`) — a obstrução pode mudar (aliado
abre o rampart, derruba a wall) — e um comando de console
(`clearRouteDeadEnd(roomName)`) pra resetar na mão sem esperar o TTL.

## In scope

- `utils/routing.js`: `isKnownDeadEnd(roomName)`/`markDeadEnd(roomName)`
  novos; `retreatFrom()` chama `markDeadEnd(creep.room.name)` além do
  `_routeAvoid` de sempre; `findRoute`/`computeRealRoute`/
  `routeCostCallback`/`avoidCostCallback` passam a checar
  `isKnownDeadEnd` do mesmo jeito que já checam `avoid`; `moveToRoom()`
  recusa outright (`ERR_NO_PATH`) se `isKnownDeadEnd(toRoomName)`, mesmo
  pra um creep que nunca tentou aquele destino.
- Console `clearRouteDeadEnd(roomName)`.
- `routing.deadEndTicks` (config, default 10000).

## Out of scope

- Validar ESTRUTURA visível no pré-cálculo (a frente 2 discutida com o
  usuário e explicitamente descartada por agora — só ajudaria quando já há
  visão da sala candidata no momento do cálculo, o que normalmente não é o
  caso).
- Mudar a política de `isDangerousRoom` pra deixar de isentar sala de
  aliado — decisão deliberada do ROADMAP 0064, intocada aqui.
- Persistir MAIS do que "esta sala é um beco" (ex.: qual tile exata bloqueia,
  quem é o dono do rampart) — só o suficiente pra rotear em volta.

## Acceptance criteria

1. `retreatFrom(creep)` marca `Memory.rooms[x].routeDeadEndUntil` no
   futuro pra `creep.room.name` — smoke assertion confirma via
   `routing.isKnownDeadEnd`.
2. `findRoute()` devolve custo `Infinity` pra uma sala marcada, mesmo sem
   `opts.avoid` conter ela.
3. `routeCostCallback`/`avoidCostCallback` excluem uma sala marcada
   (retornam `false`), mesmo que `Game.map.findRoute` já tivesse escolhido
   ela como parte da rota.
4. `moveToRoom(creep, toRoomName, opts)` devolve `ERR_NO_PATH` na hora
   (sem chamar `moveTo`/`move`) quando `toRoomName` em si já é uma sala
   marcada — mesmo pra um creep cuja própria `_routeAvoid` está vazia.
5. `clearRouteDeadEnd(roomName)` (console) remove a marca antes do TTL
   expirar; a marca também deixa de valer sozinha depois que
   `Game.time` passa de `routeDeadEndUntil`.
6. `node test/smoke.js "$(pwd)"` verde, `node --check` limpo, `npx grunt`
   builda.

## Constitution check

- **CPU (§1):** `isKnownDeadEnd` é um lookup direto em `Memory.rooms[x]`
  (já carregado por tick, sem `room.find`/scan novo) — custo desprezível,
  chamado nos mesmos pontos que já checam `avoid`.
- **Memory (§2):** uma chave nova (`routeDeadEndUntil`, um número) em
  `Memory.rooms[x]`, já existente pra toda sala com intel — não um objeto
  de jogo, não uma estrutura nova de árvore.
- **Fail-soft (§3):** sem marca (`undefined`), `isKnownDeadEnd` devolve
  `false` — nunca lança, nunca bloqueia sala nenhuma por acidente.
- **Config over hardcode (§6):** `routing.deadEndTicks` no config module,
  não um literal espalhado.
- **Testável offline (§4):** `test/smoke.js` cobre AC1-AC5 diretamente.

## Open questions

Nenhuma — usuário confirmou o diagnóstico (rampart de aliado, pioneer
spawnado após o deploy do 0075) e escolheu explicitamente só a frente 1
(cache compartilhado), descartando por ora a frente 2 (validação de
estrutura visível no pré-cálculo).
