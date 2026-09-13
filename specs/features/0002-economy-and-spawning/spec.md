# 0002 — Economy roles & spawning

- **Status:** done
- **Analysis refs:** C4, A4, A5, A6, A7

## Problem

- `harvester.js` guardava um objeto de jogo vivo em `creep.memory.target`
  (refs circulares → falha de serialização), reimplementava targeting ad-hoc,
  usava APIs depreciadas.
- `miner.js` rodava `_.filter(Game.creeps, …)` várias vezes por creep por tick
  (~N²).
- `spawning.js` tentava só um tipo de creep por tick; um creep barato de
  prioridade baixa nunca era construído se o caro de prioridade alta não fosse
  pagável; `ERR_*` era engolido.
- Scouts (puro luxo) competiam com roles de economia por capacidade de spawn.

## Desired outcome

Harvester é uma máquina de estados limpa com alvos só por id. Miner lê seu
roster do `census` uma vez. Spawning é uma fila priorizada que constrói o maior
corpo pagável por spawn ocioso e loga falhas. Scouts só spawnam quando todo
outro role está satisfeito.

## Acceptance criteria

1. `typeof creep.memory.target === "string"` para um harvester em todo ramo.
2. Spawning, por spawn ocioso, pega o pedido de maior prioridade que
   `spawnCreep(…, {dryRun:true})` aceita.
3. Nenhum scout é enfileirado enquanto qualquer role de economia/defesa quer um
   creep. *(smoke asserta na fase 1)*
4. `spawn()` de miner/harvester/upgrader usam `census.count`, não
   `_.filter(Game.creeps)`.

## Outcome

Entregue. `harvester.js` reescrito (`GetEnergy` + novo estado `Deposit`, +
`Creep.prototype.runDeposit`). `spawning.js` refeito como fila priorizada.
`miner.js` usa `census.creepsByRole`. A ordem de `roles/index.js` é a ordem de
prioridade; scout tratado após uma lista de pedidos não-scout vazia.
