# 0183 — Saque simultâneo em várias salas

- **Status:** done (local); smoke13105/check/build verdes, sem deploy
- **Created:** 2026-10-22
- **Linear:** ARK-232

## Problem

`lootRoom` sobrescreve o singleton `Memory.lootTarget`. Pedir um segundo
destino encerra o primeiro, ao contrário da intenção de saquear várias salas.

## Desired outcome

Missões independentes por dupla destino/mãe, cada uma com até
`loot.maxHaulers` (3). Repetir a mesma dupla mantém a missão existente;
pedir outra sala ou outra mãe adiciona uma missão. Contagem, reposição,
término por sala vazia e cancelamento por vida são isolados por ID.

## In scope

- `Memory.lootTargets[id] = {id, room, from}` e `memory.lootId` nos creeps.
- Migrar singleton e adotar seus looters sem comando adicional; pausas antigas
  não voltam. Looters com ID encerrado não podem cancelar uma missão nova.
- Spawn escolhe missão da mãe com menos looters (desempate por ordem de pedido),
  conta spawning e repõe mortes. Cota de 3 é por missão, não por império.
- ≤50% de HP cancela somente a missão daquele looter; sobreviventes daquela
  missão retornam/entregam, enquanto outros destinos continuam.
- `cancelLoot(room?, mother?)`: sem argumentos cancela todas; com sala,
  somente essa sala; mãe opcional restringe mais. `lootStatus(room?)` lista
  todas ou filtra por sala, com ID/mãe/população.
- Novo pedido acorda mãe marcada ociosa; política de defesa da mãe permanece.
- Missões perdidas por substituição antes do deploy não são recriadas por
  inferência. O usuário pode emitir novamente o comando.

## Acceptance criteria

1. `0183: a second loot room preserves the first mission`.
2. `0183: repeated target and mother is idempotent while a different mother stays independent`.
3. `0183: each mission has its own quota and spawn selection balances destinations`.
4. `0183: damage or completion in one room leaves other missions active`.
5. `0183: cancelLoot can cancel one room or all missions`.
6. `0183: legacy singleton and existing looters migrate without restarting`.
7. `0183: retired mission members cannot cancel a new mission with the same target`.
8. `0183: a new loot mission bypasses an idle spawn verdict`.

## Constitution check

Census para contar looters; nenhum objeto em Memory. IDs/cota são estado
operacional mínimo; decisões e contagens transitórias. Guards existentes
de spawn e roles cobrem a mudança. Smoke, sintaxe, build e grafo obrigatórios.
