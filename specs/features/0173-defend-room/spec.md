# 0173 — defendRoom: defender sala própria fraca a partir da sala-mãe

- **Status:** done
- **Owner:** a definir
- **Created:** 2026-10-21
- **Linear:** [ARK-220](https://linear.app/arkemenes/issue/ARK-220/0173-defendroom-sala-mae-manda-raider-para-defender-sala-propria-fraca)

## Problem

Uma sala recém-conquistada (W9N49, RCL 1) só consegue spawnar defensores simbólicos (1 RANGED + 1 MOVE) e perde para um invader comum. Não há comando para outra sala própria mandar ajuda: `raidRoom` recusa sala que já é minha, e os pioneers só atendem sala sem spawn e pulam qualquer sala com hostil.

## Desired outcome

`defendRoom(room, mother?)` faz a sala-mãe spawnar, com prioridade, um raider dimensionado pela capacidade de energia dela, que vai até a sala e mata os creeps hostis. Depois fica de guarda lá até morrer.

## In scope

- Console `defendRoom(roomName, motherRoomName?)` e `cancelDefend()`.
- `Memory.defendTarget = {room, from}`: um por vez; um novo `defendRoom` substitui o pendente.
- Mãe padrão: a sala própria com spawn mais perto, excluindo o alvo.
- Raider `mission: "defend"`: luta só contra creep hostil armado (`combat.threats`) e nunca ataca estrutura. Com a sala limpa, apaga o pedido e estaciona a alcance 3 do controller.
- Reposição enquanto o pedido existir; raid e defesa não se bloqueiam em `needs.js`.
- Spawn fora do gate de luxo: logo após os papéis críticos da mãe, com corpo pela `energyCapacityAvailable` e pedido `critical` (bloqueia a fila até haver energia).

## Out of scope

- Disparo automático quando uma sala fraca é atacada.
- Squads com medic/heal (`raidSquad` continua para isso).
- Defesa de remotes ou de salas que não são minhas.

## Acceptance criteria

1. Recusa sala que não é minha e mãe igual ao alvo; aceita sala minha com mãe que tem spawn ("0173: defendRoom() refuses a room that isn't mine", "0173: defendRoom() refuses the target room as its own mother", "0173: defendRoom() records the defense for an owned room from a mother with a spawn").
2. `spawnData` manda `mission:"defend"` com o pedido pendente, à frente de um raid ("0173: spawnData() sends a mission:'defend' raider while a defense is pending", "0173: a pending defense outranks a pending raid in spawnData()").
3. Corpo pela capacidade e pedido crítico ("0173: the defending raider is sized by energy capacity (10 RANGED_ATTACK at 2000) and blocks the queue until affordable").
4. O raider de defesa luta contra creep hostil; sem creep hostil, ignora estruturas, apaga o pedido e estaciona sem se aposentar ("0173: a defending raider fights a hostile creep and keeps the request open meanwhile", "0173: with no hostile creep left, a defending raider ignores structures, clears Memory.defendTarget and parks by the controller instead of retiring").
5. Spawna antes de papéis comuns como o upgrader ("0173: a pending defendRoom() raider spawns ahead of ordinary roles like the upgrader").
6. `cancelDefend()` apaga o pedido ("0173: cancelDefend() drops the pending defense").

## Constitution check

- **CPU:** `census.all("raider")` (já cacheado); `room.find(FIND_MY_SPAWNS)` só no comando de console.
- **Memory:** `{room, from}` com nomes; nenhum objeto do jogo.
- **Fail-soft:** sob ataque na própria mãe (`defenseActive`) a defesa externa não é pedida; `cancelDefend()` interrompe a reposição.
- **Offline test:** onze asserções no smoke.

## Open questions

Nenhuma.
