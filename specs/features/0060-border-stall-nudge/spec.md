# 0060 — creep parado numa exit tile: detecção por posição + nudge pra fora da borda

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-13

## Problem

Depois do 0058 (blacklist de sala-armadilha via trilha `[A,B,A,B]` de
`creep.room.name`), o usuário reportou ao vivo que o creep continuava
"parado na borda", e que ficar parado numa exit tile **teleporta o creep de
volta pro mapa anterior** — o motor do Screeps não deixa um creep descansar
numa exit tile sem uma intenção de movimento fresca naquele tick; sem ela,
ele é empurrado de volta. Isso pode acontecer **antes** do script do
próximo tick sequer ler a posição do creep, então do ponto de vista de
`Memory`/`creep.room.name`, às vezes nada muda — a trilha `[A,B,A,B]` do
0058 (e o `isFlapping` do scout, 0009) só enxergam TROCA de `room.name`, e
esse caso pode nunca produzir uma. Resultado: o creep fica genuinely preso,
mas nenhum dos dois mecanismos de blacklist dispara, porque nenhum vê
evidência de ida-e-volta.

## Desired outcome

Detectar diretamente por **posição**, não por nome de sala: um creep que
fica parado (mesmo x, mesmo y, mesma sala) por várias ticks seguidas
exatamente numa coordenada de borda (x/y igual a 0 ou 49) é tratado como
travado ali, mesmo que `creep.room.name` nunca tenha mudado. Resposta:
blacklista a sala em que está (mesmo mecanismo do 0058,
`Memory.rooms[x].routeBlacklistUntil`) e empurra o creep pra dentro da sala
(1 tile pra longe da borda) **nesse mesmo tick**, em vez de deixar outra
chamada de `moveTo()` propor o mesmo passo condenado de novo — o bloqueio
de verdade (hostil parado na saída, parede) não muda só porque a sala foi
blacklistada.

## In scope

- `src/utils/routing.js`: `isStuckAtBorder(creep, keyPrefix)` — está o creep
  numa tile de borda (x/y 0 ou 49)? Se sim, compara com a última posição
  registrada sob esse `keyPrefix` (`creep.memory[keyPrefix+"Pos"]` /
  `[keyPrefix+"Ticks"]`); mesma posição por 3 ticks seguidos (contador chega
  a 2) = travado. `keyPrefix` existe pra `routing.moveToRoom()`'s própria
  checagem (`"_routeBorder"`) nunca colidir com a do scout na exploração
  livre (`"_exploreBorder"`) — o mesmo creep pode fazer as duas coisas em
  momentos diferentes. `nudgeAwayFromBorder(creep)` — anda 1 tile pra dentro
  a partir de qualquer eixo que esteja em 0/49 (`creep.pos.getDirectionTo` +
  `creep.move()` direto, não `moveTo()`); devolve `false` só se o creep nem
  está numa borda. `borderNeighborRoom(creep)` — dado o eixo em que o creep
  está travado (x/y 0 ou 49), lê `Memory.rooms[creep.room.name].exits` (mesmo
  formato que a exploração do scout já usa) e devolve o nome da sala vizinha
  *daquele lado específico* — a armadilha de verdade. `null` sem intel de
  `exits` ainda, nunca um chute. `moveToRoom()` chama `isStuckAtBorder` logo
  depois do `isRouteFlapping` do 0058; se travado, blacklista
  `borderNeighborRoom(creep) || creep.room.name` (a vizinha identificada, só
  caindo pra sala atual como último recurso sem intel) — blacklistar
  `creep.room.name` sozinho não muda nada, porque `routeCostCallback` sempre
  permite a sala em que o creep já está, não importa o blacklist (é preciso
  poder se mover dentro dela); zera o contador, e chama
  `nudgeAwayFromBorder` — se o nudge realmente mover o creep, retorna `OK`
  na hora, sem chamar `moveTo()` no mesmo tick (as duas intenções de
  movimento conflitariam).
- `src/roles/scout.js`: a mesma checagem, via `routing.isStuckAtBorder(creep,
  "_exploreBorder")` + `routing.nudgeAwayFromBorder(creep)`, no mesmo lugar
  onde o `isFlapping()` do 0009 já intercepta antes das chamadas de
  `moveToRoom()` da exploração livre — blacklista `creep.memory.targetRoom`
  (não `creep.room.name`; a exploração usa a sala-alvo como identidade,
  igual ao `isFlapping` já fazia) e limpa `targetRoom`/`_roomTrail` do mesmo
  jeito que o flap por nome de sala já fazia.

## Out of scope

- Confirmar a mecânica exata do motor (não há acesso a um ambiente Screeps
  ao vivo pra instrumentar isso); a correção reage ao **sintoma observado**
  (creep parado, mesma posição, borda) em vez de depender de entender o
  mecanismo interno do motor.
- Qualquer busca de caminho nova (`PathFinder.search`) — mesmo princípio dos
  0058/0009, só contabilidade de tick/posição.

## Acceptance criteria

1. `isStuckAtBorder()` só fica `true` na 3ª tick seguida na mesma posição de
   borda, nunca antes, e reseta assim que a posição muda —
   `test/smoke.js`: `"first/second/third tick..."`,
   `"moving off the border tile resets the stall count immediately"`.
2. `keyPrefix`es diferentes no mesmo creep não compartilham contador —
   `test/smoke.js`: `"a different key prefix on the same creep/tick starts
   its own count from zero"`.
3. `nudgeAwayFromBorder()` só chama `move()` quando o creep está numa borda
   — `test/smoke.js`: `"...move() is never called"` pro caso fora da borda.
4. `moveToRoom()` blacklista a sala e chama `move()` uma única vez (não
   `moveTo()` de novo) no tick em que o stall completa 3 —
   `test/smoke.js`: `"parked unmoving on the border for 3 ticks..."`,
   `"...not a second moveTo() call"`.
5. `borderNeighborRoom()` lê a sala certa de cada um dos 4 lados a partir de
   `exits`, devolve `null` no centro da sala e `null` sem intel —
   `test/smoke.js`: `"the top/right/bottom/left edge leads to..."`,
   `"the room center isn't any edge..."`, `"no exits intel for the room
   yet..."`.
6. Com intel de `exits` disponível, `moveToRoom()` blacklista a vizinha de
   verdade, não a sala em que o creep ainda está parado —
   `test/smoke.js`: `"with exits intel available, the actual neighbor room
   is blacklisted, not the room the creep is still standing in"`.

## Constitution check

- **Memory:** dois campos por creep por `keyPrefix` (posição + contador,
  mesma ordem de grandeza do `_routeTrail`/`_roomTrail` já existentes).
- **CPU:** nenhuma busca de caminho nova — só comparação de posição/tick,
  mesmo princípio do `isRouteFlapping` (0058) e do `isFlapping` (0009).
- **Fail-soft:** sem stall, o comportamento é idêntico ao anterior — o
  contador só é tocado enquanto o creep está numa tile de borda.

## Open questions

Nenhuma.
