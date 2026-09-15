# 0075 — multiroom-route-precompute

- **Status:** done
- **Owner:** usuário (pedido direto)
- **Created:** 2026-09-14

## Problem

`utils/routing.js`'s `computeRealRoute`/`opts.realRoute` (ROADMAP 0064) já
valida a rota inteira contra terreno real **antes** de o creep andar, em vez
de descobrir reativamente que uma sala não tinha caminho (`retreatFrom`'s
backtrack). Mas isso é opt-in por chamada: cada role que atravessa sala
precisa lembrar de passar `realRoute: true`. Hoje só `scout` (sign/layout),
`reserver`, `raider`, `pioneer` e `squad` passam a flag — qualquer role nova
que esqueça de passá-la volta a sofrer o bug original (o creep anda até a
borda de uma sala sem caminho pra só então descobrir isso).

Pior: `roles/remoteHauler.js` e `roles/remoteMiner.js` nem usam
`utils/routing.moveToRoom()` — fazem `creep.moveTo()` cru com
`remotes.roomCallback()` (restringe a sala minha/reservada, sem mais nada).
Sem `computeRealRoute` nem o mecanismo de retreat/backtrack, se o interior da
sala remote tiver um labirinto de parede natural bloqueando o container a
partir da borda, o creep fica preso ali (`ERR_NO_PATH` todo tick), sem log,
sem recall, sem qualquer tentativa de correção.

## Desired outcome

Toda chamada a `utils/routing.moveToRoom()` valida a rota contra terreno real
no início da viagem **por padrão**, sem precisar passar `realRoute: true` —
uma role nova escrita amanhã já ganha isso de graça. A única exceção
deliberada é a exploração livre do `scout` (sem destino fixo, sempre o
vizinho conhecido mais antigo — validar terreno pra um hop que já É vizinho
não tem valor e custaria CPU a cada ciclo de exploração), que passa
`realRoute: false` explicitamente. `remoteHauler`/`remoteMiner` passam a
rotear por `utils/routing.moveToRoom()` como qualquer outro role multi-sala,
mantendo a mesma garantia de segurança que já tinham (nunca atravessar sala
que não seja minha/reservada/o próprio alvo), e ganhando de quebra a
validação prévia + retreat/backtrack que faltava.

## In scope

- `utils/routing.js`: `opts.realRoute` vira opt-**out** (`!== false`) em vez
  de opt-in, tanto em `tryComputeRealRoute` quanto no bump de
  `maxOps`/`maxRooms` do `moveTo()` nativo.
- `utils/routing.js`: novo `opts.allowRoom(roomName) => boolean` — filtro
  adicional (além de `avoid`/hostil) aplicado em `findRoute`,
  `computeRealRoute`, `routeCostCallback` e `avoidCostCallback`. Necessário
  pra `remoteHauler`/`remoteMiner` manterem a restrição "só sala
  minha/reservada" que `remotes.roomCallback` já impunha.
- `roles/scout.js`: as duas chamadas de exploração livre ganham
  `realRoute: false` explícito, preservando o comportamento atual.
- `roles/reserver.js`, `roles/raider.js`, `roles/pioneer.js`,
  `utils/squad.js`: removem o `realRoute: true` agora redundante (default já
  cobre).
- `roles/remoteHauler.js`, `roles/remoteMiner.js`: as chamadas de
  `creep.moveTo(...) + remotes.roomCallback(...)` viram
  `routing.moveToRoom(creep, dest, { allowRoom })`.

## Out of scope

- Mudar o mecanismo de retreat/backtrack em si (`retreatFrom` /
  `retreatWithoutBlame`) — já corrigido no mesmo dia (`avoidCostCallback`,
  ROADMAP 0064).
- Ampliar `remotes.maxDistance` além de vizinho direto (remotes continuam
  sempre 1 hop).
- Qualquer lógica nova de "o que é perigoso" — `allowRoom` só filtra por
  posse/reserva, reaproveita `isDangerousRoom` como já existe.

## Acceptance criteria

1. `routing.moveToRoom(creep, dest, {})` (sem passar `realRoute`) chama
   `computeRealRoute` no início da viagem — smoke assertion cobre isso
   isolando `tryComputeRealRoute`/o cache `_realRoute` resultante.
2. `routing.moveToRoom(creep, dest, {realRoute: false})` NÃO chama
   `computeRealRoute` — mantém a exploração livre do scout barata.
3. Com `opts.allowRoom` setado, `findRoute`/`computeRealRoute` só tratam como
   atravessável uma sala onde `allowRoom(roomName)` é `true` (além de já não
   estar em `avoid`/ser hostil sob `blockHostiles`).
4. `remoteHauler`/`remoteMiner` nunca produzem uma rota que atravesse sala
   que não seja minha, reservada por mim, ou o próprio alvo da viagem —
   equivalente ao que `remotes.roomCallback` já garantia.
5. `node test/smoke.js "$(pwd)"` verde, `node --check` limpo em todo arquivo
   tocado, `npx grunt` builda `dist/main.js`.

## Constitution check

- **CPU (§1):** `computeRealRoute` roda uma vez por perna da viagem (início +
  cada retreat concluído), nunca por tick — já era assim pros callers
  existentes. Virar padrão amplia o conjunto de chamadas que rodam isso, mas
  o único caller de alta frequência (exploração livre do scout, um hop por
  ciclo) opta explicitamente por `realRoute: false`. `remoteHauler`/
  `remoteMiner` são viagens de 1 hop — a busca real (distância curta) sempre
  termina bem abaixo do teto de ops, nunca perto do `realRouteMaxOps`.
- **Fail-soft (§3):** nada muda no fallback existente — `computeRealRoute`
  retornando `null` já cai pro fluxo `findRoute()`-based de sempre.
- **Config over hardcode (§6):** nenhum tunable novo; reaproveita
  `routing.realRouteMaxOps`/`realRouteMaxRooms`/`moveMaxOps`/`moveMaxRooms`
  já existentes.
- **Roles finos (§5):** o predicado `allowRoom` é montado inline nos roles
  usando `remotes.isMine`/`remotes.isReservedByMe` (já exportados) — nenhuma
  lógica de decisão nova sai de `utils/routing.js` ou `rooms/remotes.js`.
- **Testável offline (§4):** `test/smoke.js` ganha assertions pro default-on,
  pro opt-out do scout, e pro filtro `allowRoom`.

## Open questions

Nenhuma — escopo confirmado com o usuário (as duas frentes: default-on +
migração do remoteHauler/remoteMiner).
