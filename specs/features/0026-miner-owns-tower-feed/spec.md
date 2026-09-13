# 0026 — Miner alone feeds the source-defense tower; hauler never does

- **Status:** done
- **Depends on:** 0016 (miner seat & tower feed), 0019 (hauler delivery priority)

## Problem

`hauler.js`'s `pickDeliver` tratava **qualquer** torre abaixo da reserva como
prioridade máxima, sem distinguir a torre da base da torre de defesa de
source (que já fica sentada ao lado do `miner`, alimentada por
`miner.js`'s `distribute()`). Isso fazia o hauler dar uma volta até o
cluster de source só pra completar uma torre que o miner já cuidava —
viagem redundante e cara.

## Desired outcome

O hauler nunca entrega energia numa torre de defesa de source (nem pra
reserva, nem pra completar). Só o miner alimenta essa torre — e agora sem
depender de "sobrar" energia: enche até a reserva sempre que possível
(prioridade), e só continua enchendo além da reserva quando há excedente de
verdade (container/link cheios, ou spawn/ext já supridos).

## In scope

- `hauler.js`: `isSourceDefenseTower(structure)` — lê o plano
  (`planEntriesAt`) e checa a tag `sourceDefense` (já existia, escrita pelo
  planejador desde a defesa por cluster). Exclui essas torres dos dois
  ramos de `pickDeliver` que miram torre (reserva e topo).
- `miner.js`'s `distribute()`: o preenchimento até a reserva (`branch 1`)
  deixa de ser condicionado a `mayFeedTower` (consumidores cheios OU
  excedente) — agora é prioridade incondicional, já que o hauler nunca mais
  ajuda. O topo além da reserva (`branch 4`) continua condicionado ao
  excedente — não rouba energia de spawn/ext só pra encher os últimos %.

## Out of scope

- Torres da base (não têm `sourceDefense`) — continuam podendo ser
  alimentadas pelo hauler normalmente.
- Mudar a ordem de prioridade geral de `pickDeliver`/`distribute` além do
  que já descrito.

## Acceptance criteria

1. Hauler com energia e uma torre da base abaixo da reserva entrega nela
   normalmente. *(smoke)*
2. Hauler nunca entrega numa torre marcada `sourceDefense`, mesmo abaixo da
   reserva. *(smoke)*
3. Miner continua enchendo a torre de source até a reserva mesmo com
   spawn/extension ainda querendo energia (antes: só enchia se os
   consumidores já estivessem cheios). *(smoke)*
4. Comportamento de excedente (`branch 4`) inalterado — só topa a torre além
   da reserva quando container/link estão cheios ou consumidores supridos.
   *(smoke já existente continua verde)*

## Constitution check

- **§1:** `isSourceDefenseTower` reusa `planEntriesAt` (já O(1), indexado por
  tick — 0001/A3).
- **§6:** a decisão de "quem alimenta qual torre" continua em um lugar por
  papel (hauler decide o que NÃO fazer, miner decide o que SEMPRE fazer),
  sem duplicar a regra.

## Outcome

Entregue. `hauler.js`: `isSourceDefenseTower` exclui torres com
`sourceDefense: true` dos dois ramos de torre em `pickDeliver`. `miner.js`:
`distribute()`'s branch de reserva não depende mais de `mayFeedTower` — vira
prioridade incondicional; branch de excedente mantém o gate. Validado pelo
smoke (142 assertions no total: 2 novas de exclusão do hauler + 1 assertion
existente do miner atualizada pro novo comportamento) + confirmado que as
assertions falham revertendo cada um dos dois fixes separadamente +
`npx grunt`.
