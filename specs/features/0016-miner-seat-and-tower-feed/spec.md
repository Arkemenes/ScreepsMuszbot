# 0016 — Miner seat & tower feeding

- **Status:** done

## Problem

- **Miners às vezes ficam fora do container.** Depois que `creep.memory.onContainer`
  vira `true` a lógica de assento é pulada. Se o miner é empurrado (invader,
  colisão, retreat de `takeCover`) para outra tile **adjacente à source**, o
  `harvest` continua funcionando (range 1), então o passo de re-seat
  (`harvest === ERR_NOT_IN_RANGE`) nunca dispara e o miner minera fora do
  container — a energia não vai para o container.
- **Miners não alimentam torres.** Sem CARRY o miner só derrama energia (que
  cai no container). Uma torre adjacente ao container/miner nunca é abastecida
  direto.

## Desired outcome

O miner verifica **todo tick** (barato) se está de fato sobre o seu container e
volta se saiu. A partir do RCL 3 o miner ganha 1 CARRY e distribui o que
minera. **A torre só é alimentada** quando não atrapalha a produção de creeps:
`room.energyAvailable >= room.energyCapacityAvailable` (todo spawn/extension
cheio) **ou** os buffers locais estão cheios (link coletor adjacente cheio +
container cheio — a energia seria desperdiçada). Nesse caso: torre até a
reserva (0.5, ou 0.9 sob ataque) → link → container → topo da torre.

## In scope

- `miner.memory.seat = [x, y]` — a tile do container. Cada tick: se
  `pos !== seat` ou não há container ali → limpa `onContainer` e volta ao
  assento (ou espera adjacente se outro miner o tomou).
- Se um creep **não-miner** está no assento, o miner o **empurra** ao chegar
  a ≤ 2 tiles (`shoveAway`) e entra com `creep.move` direto — sem isso o
  `travel` trataria o squatter como "parked" e daria a volta pra sempre.
- `minerBody`: `+CARRY` quando `hasLinkNetwork` **ou** `controller.level >= 3`.
- `distribute(creep)` — a cadeia torre-reserva → link → container → torre-topo.
- As tiles range-1 de cada container de source são alocadas em ordem de
  prioridade: **link 1 → torre → link 2** (todas radius-1, tile mais funda
  primeiro). O 2º link (RCL 8) **só é colocado se sobrar tile no raio 1** —
  a torre nunca é espremida pra fora. Se não sobra tile pra torre, o cluster
  fica só com as torres de perímetro. `pickTowerTile` foi removido (a
  alocação unificada substitui).

## Out of scope

- Mudar `pickTowerTile` para radius-1 estrito.
- Feeding de labs / power spawn / nuker pelo miner.
- Repriorizar o hauler (que já enche torres via `pickDeliver`).

## Acceptance criteria

1. Um miner com `onContainer === true` numa tile adjacente à source que **não**
   é o container caminha de volta ao `seat` e `onContainer` vira `false`.
   *(smoke: "a displaced miner walks back to its container seat")*
2. Com spawn/extensions cheios: um miner sentado com energia e uma torre
   adjacente abaixo da reserva → `transfer` para a torre. Sem estar cheios e
   sem excedente → a energia vai para o container, **não** para a torre.
   *(smoke asserta os dois)*
3. Com a torre acima da reserva → container primeiro; container cheio +
   link(s) cheio(s) → excedente vai para a torre (mesmo com spawn/ext ainda
   enchendo). *(smoke asserta)*
4. `minerBody` inclui `CARRY` a partir do RCL 3.
5. Um creep não-miner sobre o assento é empurrado quando o miner se aproxima.
   *(smoke: "a non-miner on the seat is shoved off when the miner arrives")*
6. Toda torre `sourceDefense` fica a Chebyshev 1 de um container.
   *(smoke: "every source-defense tower is range 1 from a container")*
7. Um cluster de source só ganha o 2º link se também tiver torre.
   *(smoke: "a source cluster only gets a second link if it also has a tower")*
8. Smoke inteiro verde.

## Constitution check

- **§1:** a checagem de assento é um `lookFor` por miner por tick; `distribute`
  são 2 `findInRange` de raio 1. Poucos miners.
- **§3:** `distribute` e a lógica de assento não lançam com `source`/container
  ausentes.
- **§7:** o miner continua estático — o fix garante que ele *fica* estático no
  lugar certo.

## Outcome

Entregue. `roles/miner.js`: helper `containerUnder`, `creep.memory.seat`,
re-seat por tick com shove de squatter não-miner, `distribute()` com gate
`consumersFull || surplus` para a torre, `+CARRY` no `minerBody` a partir do
RCL 3. `rooms/architect.js`: alocação unificada das tiles range-1 do container
(link 1 → torre → link 2), `pickTowerTile` removido.
