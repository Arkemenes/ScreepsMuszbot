# 0020 — Remote mining

- **Status:** done
- **Depends on:** 0007 (plan store), 0009 (scout hardening) — implementado
  antes do 0012 (config); os tetos ficam literais em `remotes.js` até lá, ver
  Outcome.
- **Analysis refs:** ROADMAP "Later" → Remote mining

## Problem

A sala só extrai dos seus 2 sources locais. Salas adjacentes seguras (sem dono,
sem Source Keeper) têm 1–2 sources cada, ociosos. O `scout` já coleta a intel
(`Memory.rooms[x].sourceNumber`, `hasController`, `reservation`, `owner`) mas
nada age sobre ela.

## Desired outcome

Uma sala RCL ≥ 4 com CPU/spawn sobrando **reserva** uma sala adjacente elegível
e minera os sources dela: `reserver` mantém o controller reservado, `remoteMiner`
senta no source (container remoto), `remoteHauler` traz a energia pra sala mãe.
Estradas ligam a sala mãe às salas reservadas, roteadas **só por salas minhas /
reservadas por mim**. Sob ameaça na sala remota, os creeps remotos recuam pra
casa e a rota é pausada.

## In scope

- **Elegibilidade** (`rooms/remotes.js`): para cada saída da sala mãe, a sala
  adjacente entra na lista se — vista pelo scout, sem dono, sem Source Keeper,
  1+ sources, distância de path da mãe abaixo de um teto, e o total de remotes
  não passa de um limite por `Memory.settings` (0012). Cacheada por tick.
- **`Memory.rooms[mãe].remotes = ["W1N2", …]`** — pequeno, fica na Memory.
- **Roles novos:**
  - `reserver` — `CLAIM`/`MOVE`; vai pra sala remota, `reserveController`;
    conta 1 por remote com controller; corpo escala com o buffer de
    `reservationTicks` desejado.
  - `remoteMiner` — como o `miner` (assento em container/tile do source), mas
    `home` = sala mãe, `targetRoom` = remote; constrói/repara o próprio
    container; `takeCover` → recua pra casa se hostil na sala.
  - `remoteHauler` — como o `hauler` mas rota fixa remote-container → storage da
    mãe; corpo grande em `CARRY`; conta escala com round-trip × throughput do
    source.
- **`roomNeeds` (0015)**: adiciona `reserver`, `remoteMiner`, `remoteHauler`,
  todos 0 quando `remotes` está vazio ou sob ataque em casa.
- **Estradas inter-sala** (herda a mecânica da 0008): `getShortestPath`
  multi-sala da borda da mãe até cada source remoto, com a CostMatrix proibindo
  qualquer sala que não seja minha ou reservada por mim; `minimalRCL` 4; fora de
  `mincutBoundries`. Também guiada por tráfego onde a 0008 já tiver o contador.
- **Defesa remota mínima**: hostil visto numa sala remota → `Memory.rooms[mãe]`
  marca o remote como `unsafe`, `roomNeeds` zera os creeps daquele remote, eles
  voltam pra casa; opcionalmente 1 `defender` é despachado se o valor justificar
  (config).

## Out of scope

- Source Keeper rooms (precisam de esquadrão dedicado) — fase 2.
- Reservar sala pra depois `claim` (expansão de GCL) — feature própria.
- Mineral remoto / extractor remoto.
- Rebalancear energia entre salas mãe (logistics manager).

## Acceptance criteria

1. `remotes.eligible(room)` só devolve salas vistas, sem dono, sem SK, com
   sources, dentro do teto de distância e do limite de contagem. *(smoke)*
2. Com `Memory.rooms[mãe].remotes` populado, `roomNeeds` pede `reserver`,
   `remoteMiner`, `remoteHauler` > 0; com `remotes` vazio, todos 0. *(smoke)*
3. `remoteMiner.run` / `remoteHauler.run` / `reserver.run` não lançam fora da
   sala alvo (viajando) nem dentro dela. *(smoke, sala remota stub)*
4. Hostil numa sala remota → creeps daquele remote têm alvo de "voltar pra
   casa" e `roomNeeds` para de pedir novos. *(smoke)*
5. As estradas inter-sala nunca roteiam por uma sala com dono ≠ eu e não
   reservada por mim. *(smoke: CostMatrix bloqueia)*
6. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§1:** `remotes.eligible` cacheado por tick; roles remotos reusam `census` /
  `roomCache` (com chave por sala remota).
- **§2:** só `Memory.rooms[mãe].remotes` (lista curta de nomes) na Memory; rotas
  e matrizes no plan store / heap.
- **§3:** sala remota sem visão → tratada como `unsafe`, creeps seguram em casa;
  `reserveController` fora de alcance → `moveTo`, nunca lança.
- **§5:** a decisão de quais salas minerar mora em `rooms/`, não nos roles.
- **§6:** `roomNeeds` continua o único lugar que decide contagem.

## Open questions

- Alocar `reserver` empire-wide (como o scout) ou por sala mãe? → por sala mãe
  pra missão `reserve` (uma por remote); **empire-wide** (1 só, como o scout)
  pra missão `claim` — decisão do usuário, ver "Ajuste" abaixo.
- Container remoto: o `remoteMiner` constrói (como faz hoje o fluxo local) ou o
  planejador da mãe emite um mini-plano pra sala remota? → o miner constrói;
  sem rodar o `architect` inteiro numa sala que não é minha.
- Throughput alvo por source remoto (define corpo do hauler e contagem):
  10 energia/tick (source de sala neutra) → dimensionar a partir daí. Entregue
  como baseline simples (1 hauler/remote ativo); ajuste fino de throughput
  fica pra depois.

## Ajuste (pedido do usuário): um role só para reservar e dominar, `reserveRoom`/`claimRoom` no console

O rascunho original desenhava `reserver` (reserva) como o único role de
`CLAIM`. O usuário pediu duas coisas a mais: (1) uma função de console pra
marcar uma sala como alvo de reserva, que despacha a unidade sozinha; (2)
uma função separada pra **dominar** (`claimController`) uma sala — mas
**sem** criar um segundo role quase-duplicado, já que reservar e dominar são
a mesma mecânica de corpo/viagem, só o intent final muda.

Resolvido: `reserver.js` ganhou `memory.mission` (`"reserve"` | `"claim"`).
Reserva continua por sala mãe (uma unidade por remote pendente, corpo
`CLAIM×N` escalando o buffer de ticks — até `MAX_RESERVE_CLAIM_PARTS`, CLAIM
extra não ajuda em `claim`). Domínio é **sempre no máximo 1 no império**
(mesmo padrão de instância única do `scout`), corpo fixo `[CLAIM, MOVE]`.
`global.reserveRoom(roomName, motherRoomName?)` só grava
`Memory.rooms[mãe].remotes` (a unidade nasce sozinha no próximo
`roomNeeds`); `global.claimRoom(roomName, motherRoomName?)` grava
`Memory.claimTarget = {room, from}`; `global.unreserveRoom(roomName)` limpa
o remote de qualquer sala mãe. As três documentadas em `help()`.

## Outcome

Entregue.

- **`src/rooms/remotes.js`** (novo) — única porta pra decisão de "qual sala
  vale minerar" (constitution §6):
  - `myUsername()` (cacheada, tirada de qualquer sala própria),
    `isMine`/`isReservedByMe`/`hasHostiles` (reusa `Memory.rooms[x].my`/
    `.reservation`/`.enemies`, já preenchidos pelo `intel.js` — nenhum
    rastreamento novo em Memory pra "hostil visto"),
  - `roomDistance`/`nearestOwnedRoom` (via `Game.map.findRoute`, cacheados
    por tick),
  - `eligible(room)` — vizinha vista, sem dono (ou eu), com source, dentro
    de `MAX_REMOTE_DISTANCE` (2) e `MAX_REMOTES_PER_ROOM` (2) — literais até
    o 0012 existir,
  - `active(room)` — subconjunto de `.remotes` **reservado por mim e
    seguro** (implementa a restrição do usuário: reserva é pré-requisito
    pra minerar); casa sob ataque zera tudo,
  - `pendingReserves(room)` — remotes sem reserva saudável (< 3000 ticks
    restantes),
  - `roomCallback(allowRoomName)` — `costCallback` pra `moveTo`
    nativo/`PathFinder.search`: qualquer sala que não seja minha nem
    reservada por mim é intransitável, exceto o próprio alvo da missão
    (senão um `reserver` nunca conseguiria chegar a uma sala ainda não
    reservada) — restrição de **roteamento**, não só de elegibilidade,
    exatamente o pedido do usuário.
  - `global.reserveRoom`/`unreserveRoom`/`claimRoom` (ver "Ajuste" acima).
- **`src/roles/reserver.js`** (novo) — um role, duas missões
  (`memory.mission`). Corpo escalado (`CLAIM×N`) pra `reserve`, fixo
  `[CLAIM, MOVE]` pra `claim`.
- **`src/roles/remoteMiner.js`** (novo) — senta numa source da sala remota,
  constrói/repara o próprio container (sem rodar `architect` lá), recua pra
  casa se `remotes.hasHostiles` no local.
- **`src/roles/remoteHauler.js`** (novo) — rota fixa remote↔mãe, carrega de
  container/drop remoto, entrega em storage/spawn/ext da mãe.
- **`rooms/needs.js`**: `reserver` (soma reserva pendente + claim
  atribuído), `remoteMiner` (1 por source em `active()`), `remoteHauler` (1
  por remote ativo) — únicos donos da contagem, como todo o resto.
  `roles/index.js` ganha as 3 entradas (entre `builder` e `scout` na ordem
  de prioridade de spawn).
- `src/utils/console.js`: seção "Remote mining" no `help()`.
- Validado pelo smoke (170 assertions no total, 28 novas): `eligible`
  (scouted/não-scouted, dono, distância), reserva/`active`
  (outro dono, baixa reserva, hostil, casa sob ataque), `roomNeeds` com/sem
  remote ativo, os três comandos de console escrevendo a Memory certa,
  `roomCallback` bloqueando sala de fora, e os três roles novos não lançando
  nem viajando nem na sala alvo. Confirmado que os gates de `active()`
  (reserva) e `roomCallback` falham revertendo cada fix + `npx grunt` (47
  arquivos).

**Correção de harness encontrada no processo**: o mock de `controller` do
smoke não tinha `.owner` (só `.my`), então `myUsername()` nunca resolvia em
teste nenhum — corrigido adicionando `owner: {username: "me"}` ao fixture,
mais realista (Screeps real sempre popula `.owner` numa controller própria).
