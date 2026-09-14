# 0058 — moveToRoom() blacklista a sala-armadilha em vez de só repetir a rota

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-13

## Problem

O usuário esclareceu (depois do 0057, que tratava um caso diferente — sala
de **destino** hostil) que o problema real é numa sala **intermediária** no
caminho: o claimer (e, confirmado pelo usuário, o scout também — `roles/
scout.js`'s tarefas de `signRoom`/`planLayout`, que roteiam pelo mesmo
`utils/routing.js`'s `moveToRoom()`) fica entrando e saindo de uma sala com
inimigo que **nunca vai ficar limpa** (Source Keeper, Invader Core, ou
jogador permanentemente hostil). `moveToRoom()` recalcula `findRoute()` do
zero a cada tick, então a única memória de "essa sala é ruim" é o valor
*ao vivo* de `Memory.rooms[x].enemies` — que só existe enquanto alguém tem
visão da sala. Sem um jeito de dizer "essa sala específica provou ser uma
armadilha, para de tentar por um tempo", o creep pode: (a) entrar numa sala
nunca visitada (sem intel, `hasHostiles` = false, custo normal), descobrir
o hostil só depois de já estar lá dentro, recuar, e (b) no próximo tick,
recalcular do zero de novo — se a alternativa também não é obviamente
melhor, ou se a sala continua "a única opção conhecida", nada impede o
mesmo ciclo de se repetir. `roles/scout.js` já tem exatamente esse
problema resolvido pro caso da exploração livre (`isFlapping` +
`scoutBlacklistUntil`, ROADMAP 0009), mas isso é local ao scout e não
existe pra quem usa `moveToRoom()` rumo a um destino fixo (reserver:
reserve/claim/contest; scout: sign/layout).

## Desired outcome

Qualquer creep roteado via `moveToRoom()` (destino fixo, não a exploração
livre do scout) que fique entrando e saindo da mesma sala (padrão A,B,A,B
de trocas de sala — o mesmo princípio do `isFlapping` do scout) blacklista
essa sala automaticamente por um tempo (`routing.blacklistTicks`) e força o
próximo cálculo de rota a considerar **outras salas** pra chegar no mesmo
destino, em vez de repetir a mesma armadilha ou só ficar esperando. Uma
sala blacklistada é excluída de `findRoute()` incondicionalmente — mesmo
sem `blockHostiles`, mesmo que não esteja mais marcada como hostil no
momento (o motivo de estar na blacklist pode ser qualquer coisa que
impediu o avanço, não só hostilidade).

## In scope

- `src/utils/routing.js`: `isBlacklisted(roomName)`/`blacklistRoom(roomName)`
  (novo campo `Memory.rooms[x].routeBlacklistUntil`, TTL
  `routing.blacklistTicks` — default 5000, mesma ordem de grandeza do
  `scout.blacklistTicks` existente) e `isRouteFlapping(creep)` (mesma
  lógica reativa de trilha `[A,B,A,B]` do `roles/scout.js`'s `isFlapping`,
  só que numa chave de memory própria, `_routeTrail`, pra nunca interferir
  com a trilha de exploração do scout). `findRoute()`'s `routeCallback`
  passa a checar `isBlacklisted` primeiro, antes até do bypass do destino.
  `moveToRoom()` chama `isRouteFlapping` no início; se true, blacklista
  `creep.room.name` (a sala em que o creep está bem no tick em que o
  padrão ABAB fecha — sempre a armadilha, nunca o lado "de casa") e limpa a
  trilha, ANTES de calcular a rota daquele tick — então o próprio
  `findRoute()` logo em seguida já exclui a sala recém-blacklistada.

## Out of scope

- Mexer no `isFlapping`/`scoutBlacklistUntil` do `roles/scout.js` — mecanismo
  próprio, já funcional, pra um problema diferente (exploração sem destino
  fixo). Ficam intencionalmente separados (constitution nota no código).
- O caso de o próprio destino final ser a armadilha (sala adjacente sendo o
  próprio alvo, como na exploração do scout, ou missão `"claim"` do 0057) —
  `routeCostCallback` sempre permite entrar no destino final por design (é
  pra onde o creep tem que ir mesmo); blacklistar o destino não impede essa
  entrada direta quando ele é adjacente. Esse caso já tem soluções próprias
  (0009 pro scout, 0057 pro claim).
- Detecção proativa via `PathFinder.search` — tentada e revertida antes
  (ROADMAP, ver comentário em `moveToRoom()`); esse mecanismo continua
  1000% reativo (bookkeeping de tick/sala), nunca uma busca de caminho.

## Acceptance criteria

1. Uma sala com `routeBlacklistUntil` no futuro tem custo `Infinity` em
   `findRoute()`, mesmo sem `blockHostiles` e mesmo não-hostil —
   `test/smoke.js`: `"a blacklisted room is excluded outright, regardless
   of blockHostiles or hostile status"`.
2. Um `routeBlacklistUntil` expirado não exclui mais a sala —
   `test/smoke.js`: `"the blacklist expires - an old routeBlacklistUntil no
   longer excludes the room"`.
3. `moveToRoom()` chamado repetidamente com o padrão de sala A,B,A,B
   blacklista a sala B (a armadilha) e zera a trilha —
   `test/smoke.js`: `"A, B, A, B while heading to one fixed destination
   blacklists the trap room (W1N2)"` e `"the trail resets once the flap is
   caught, so it doesn't immediately re-trigger"`.
4. A própria chamada de `findRoute()` feita pelo `moveToRoom()` que
   detectou o flap já exclui a sala recém-blacklistada nesse mesmo tick —
   `test/smoke.js`: `"the same tick's findRoute() call already excludes the
   freshly blacklisted room"`.
5. A, B, A sozinho (3 trocas) não blacklista nada ainda — pode ser só um
   recuo normal — `test/smoke.js`: `"A, B, A alone doesn't blacklist
   anything yet - could just be normal backtracking"`.

## Constitution check

- **Memory:** um campo por sala (`routeBlacklistUntil`, timestamp) e um
  campo por creep (`_routeTrail`, array de até 4 nomes de sala) — mesma
  ordem de grandeza do que o scout já guarda pra exploração.
- **CPU:** nenhuma busca de caminho nova; a checagem é só comparação de
  `Game.time`, igual ao `isFlapping`/`stuckTicks`/`m.stuck` já existentes.
- **Fail-soft:** sem flap, o comportamento é idêntico ao anterior — a
  trilha só cresce em troca de sala, sem custo pra quem está parado ou
  progredindo normalmente.

## Open questions

Nenhuma.
