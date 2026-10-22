# 0177 — lootRoom: esvaziar sala de outro jogador

- **Status:** done
- **Owner:** a definir
- **Created:** 2026-10-22
- **Linear:** [ARK-225](https://linear.app/arkemenes/issue/ARK-225/0177-lootroom-haulers-esvaziam-sala-de-outro-jogador-e-levam-tudo-para)

## Problem

Não havia como levar os recursos de uma sala de outro jogador para casa. O hauler só recupera loot em salas onde já trabalha (0169), e o raider e o squad nunca coletam nada.

## Desired outcome

`lootRoom(room, mother?)` faz a sala-mãe mandar haulers que levam todos os tipos de recurso da sala-alvo para o storage/terminal dela, ida e volta, até a sala ficar vazia.

## In scope

- Módulo `rooms/looting.js` (decisão) e role `looter` (execução).
- Lootável: drops de qualquer recurso, tombstones, ruins e stores de estruturas não minhas e não aliadas, exceto nuker, power bank e invader core, e nada sob rampart hostil.
- Ordem: chão primeiro (decai), depois tombstone/ruin, depois stores (`salvage.closestDecayFirst`).
- Entrega de todo tipo de recurso via `resourcePolicy.destination` (storage/terminal).
- Segurança (substituída pela 0182): presença de torre ou creep armado não pausa o saque; qualquer looter da missão com ≤ `loot.cancelHpRatio` (50%) de vida cancela o pedido. Sobreviventes voltam e entregam a carga.
- Fim: sala sem nada lootável apaga `Memory.lootTarget`; looters entregam o que carregam e são reciclados.
- Vida: o looter volta quando a vida restante mal cobre a viagem (`loot.ticksPerHop`, `loot.returnMargin`).
- Console: `lootRoom`, `cancelLoot`, `lootStatus`. Configuração: `loot.maxHaulers` (3), `loot.maxHops` (10).

## Out of scope

- Atacar a sala (isso é `raidRoom`/`raidSquad`).
- Saque em várias salas ao mesmo tempo (adicionado posteriormente pela 0183, com `Memory.lootTargets[id]` e término isolado por missão).

## Acceptance criteria

1. "0177: lootable = drops and foreign stores; never mine, a nuker, an empty store or a rampart-covered one"
2. Substituído pela 0182: "0182: towers and armed creeps do not stop a healthy looter".
3. "0177: lootRoom() refuses a room that hasn't been scouted" / "0177: lootRoom() refuses a mother with nowhere to deliver (no storage/terminal)" / "0177: lootRoom() records the loot from a mother with spawn + storage"
4. "0177: the mother wants loot.maxHaulers (3) looters while none is out"
5. "0177: a looter takes the decaying drop before the storage" / "0177: then it withdraws from the enemy storage"
6. Substituído pela 0182: 51% continua; ≤50% cancela toda a missão e interrompe reposição; sobreviventes entregam a carga.
7. "0177: at home a full looter unloads into the storage"
8. Atualizado pela 0183: "0177: an emptied room finishes its loot mission".

## Constitution check

- **CPU:** `roomCache` para drops, tombstones, ruins e estruturas; `census` para contar looters.
- **Memory:** `{room, from}` e flags primitivas no creep; `pausedUntil` legado ignorado/removido.
- **Fail-soft:** sem destino com espaço, o looter segura a carga; dano no limite cancela e retorna.
- **Offline test:** coleta/entrega e ciclo da missão na 0177; política de vida coberta na 0182.
