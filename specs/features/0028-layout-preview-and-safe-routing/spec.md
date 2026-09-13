# 0028 — Layout preview + highway-priority / hostile-aware routing

- **Status:** done
- **Depends on:** 0009 (scout hardening), 0018 (alliance & scout tasks), 0020
  (remote mining — `reserver`, `rooms/remotes.js`)

## Problem

Não havia como pedir uma prévia do layout de uma sala específica antes de
reivindicá-la — só dava pra planejar (`architect.planCity`) uma sala já
própria. E o scout (tarefas de destino fixo: assinar controller) e o
`reserver` viajavam com `moveTo` puro/`remotes.roomCallback`, sem nenhuma
noção de sala "highway" (grade x%10==0 / y%10==0 — corredor aberto,
geralmente sem dono) nem de sala com hostil visto — o `reserver` em
particular podia atravessar uma sala perigosa a caminho da missão.

## Desired outcome

1. `planLayout(roomName)` (console, análogo a `signRoom`) manda o scout até a
   sala e mantém uma prévia do plano de construção rodando lá (via
   `architect.planCity(room, {preview:true})`), sem precisar ser dona da
   sala e sem nunca criar um canteiro de verdade. `cancelLayout(roomName)` /
   `layoutQueue()` completam o trio, e tudo aparece no `help()`.
2. Sempre que um creep tem **uma sala específica de destino** — nunca a
   exploração round-robin do scout, que não tem destino fixo pra rotear —
   ele roteia priorizando sala highway e evitando sala com hostil visto:
   scout (assinar controller, prévia de layout) e `reserver` (`reserve` e
   `claim`). O `reserver` vai além: nunca atravessa uma sala com hostil
   visto, ponto final.

## In scope

- `utils/routing.js` (novo): `isHighwayRoom(roomName)`, `findRoute(from, to,
  opts)` (`Game.map.findRoute` com `routeCallback` — barateia highway,
  penaliza hostil, ou com `opts.blockHostiles` exclui de vez, custo
  `Infinity`), `routeCostCallback(route, current, to)`, `moveToRoom(creep,
  toRoomName, opts)`. Tunables em `config.get("routing.*")`
  (`hostilePenalty`=10, `nonHighwayPenalty`=2, `layoutWaitLimit`=500).
- `roles/scout.js`: tarefa de assinatura (`signRoom`) e nova tarefa de
  prévia de layout (`planLayout`/`cancelLayout`/`layoutQueue`,
  `Memory.layoutRequests`) — ambas usam `routing.moveToRoom`. A tarefa de
  layout fica parada na sala alimentando visão pro `architect` até
  `Memory.rooms[room].planned`, com stall guard (`routing.layoutWaitLimit`)
  pra desistir e logar em vez de acampar pra sempre se o plano nunca
  terminar (ex.: `Game.cpu.bucket` cronicamente abaixo de
  `planner.minBucket`).
- `roles/reserver.js`: troca `remotes.roomCallback` por
  `routing.moveToRoom(..., {blockHostiles:true})`.
- `rooms/architect.js`: `planCity(room, opts)` ganha `opts.preview` — pula o
  gate "só sala própria" e nunca chama `createConstructionSites`. Se a sala
  for reivindicada depois, o plano da prévia já é o plano real
  (`replanRoom()` descarta, se quiser recomeçar).
- `main.js`: roda `planCity(room, {preview:true})` pra toda sala visível,
  não-própria, com `Memory.layoutRequests[room]`.
- `utils/console.js` (`help()`): lista `planLayout`/`cancelLayout`/
  `layoutQueue`.

## Out of scope

- `remoteMiner`/`remoteHauler` continuam em `remotes.roomCallback` (rota
  confinada a sala minha/reservada) — não pedido, não mudado.
- Persistir a fila de layout além de `Memory.layoutRequests` — sem
  histórico, sem múltiplas salas em paralelo (uma prévia de cada vez, como
  a fila de assinatura).

## Acceptance criteria

1. `isHighwayRoom(roomName)` é `true` sse x%10==0 ou y%10==0. *(smoke)*
2. `findRoute`: sala highway custa o mínimo; sala com hostil visto soma
   `hostilePenalty` (sem `blockHostiles`) ou vira `Infinity` (com); sem rota
   possível, retorna `null`. *(smoke)*
3. `routeCostCallback`: só sala atual, destino, e sala da rota calculada
   ficam passáveis pro `moveTo`. *(smoke)*
4. `reserver.run` viaja com um `costCallback` assim — bloqueia sala fora da
   rota, sempre permite o alvo da missão. *(smoke)*
5. `planLayout(room)` enfileira em `Memory.layoutRequests`; o scout sem
   outra tarefa ruma pra lá. *(smoke)*
6. `architect.planCity(room)` sem `preview` continua recusando sala não
   própria; com `{preview:true}` completa o plano de uma sala não-própria e
   nunca cria canteiro real. *(smoke)*
7. O scout larga o pedido de layout quando `Memory.rooms[room].planned` fica
   `true`; se nunca terminar, desiste depois de `routing.layoutWaitLimit`
   ticks parado (stall guard) em vez de acampar pra sempre. *(smoke)*
8. `help()` lista `planLayout`/`cancelLayout`/`layoutQueue`. *(smoke)*

## Constitution check

- **§3 (fail soft):** loop de prévia em `main.js` passa por `guard`; stall
  guard do scout (`layoutWaitLimit`) evita a máquina de espera rodar pra
  sempre — mesmo espírito do stall guard já existente no `architect`.
- **§5 (roles finos):** o roteamento entre salas é um módulo de util
  (`routing.js`), chamado dos roles (scout, reserver) — não duplicado.
  Nome deliberadamente distinto de `utils/move.js`'s `travel()`: aquele é
  cache de caminho **dentro** de uma sala; `routing.js` decide **quais
  salas** cruzar.
- **§6 (config sobre hardcode):** penalidades de rota e o limite de espera
  do scout vivem em `config.get("routing.*")`, não em literais soltos.

## Outcome

Entregue. Novo `src/utils/routing.js` (`isHighwayRoom`, `findRoute`,
`routeCostCallback`, `moveToRoom`); `scout.js` ganha a tarefa de layout
(`planLayout`/`cancelLayout`/`layoutQueue`, prioridade logo abaixo de
`signRoom`, mesmo roteamento) com stall guard; `reserver.js` roteia via
`routing.moveToRoom({blockHostiles:true})`; `architect.js`'s `planCity`
ganha modo preview (dois gates a menos, nunca `createConstructionSites`);
`main.js` chama a prévia pra sala pedida e ainda não própria; `config.js`
ganha o bloco `routing.*`; `help()` atualizado. Validado pelo smoke (209
assertions no total — 28 novas cobrindo `routing.js`, o dispatch/roteamento
do reserver, e o ciclo completo de `planLayout` incl. o stall guard) +
`npx grunt`.
