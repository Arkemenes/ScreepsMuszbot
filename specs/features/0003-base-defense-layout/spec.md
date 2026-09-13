# 0003 — Base defense layout

- **Status:** done

## Problem

O perímetro de ramparts do min-cut cercava a base inteira **mais** os
containers de source, os links coletores e as estradas que os conectam —
puxando a muralha para bem longe em direção às sources e inflando a contagem de
rampart / o custo de reparo. `findNextTowerLocation` podia recorrer para sempre
se não achasse um tile.

## Desired outcome

O perímetro envolve apenas a base planejada. O cluster de
container + link-coletor de cada energy source é seu próprio ponto fortificado:
ramparts on-tile mais uma torre adjacente. Minerais ganham os ramparts, sem
torre. O total de torres fica dentro do cap de 6 do RCL 8.

## Acceptance criteria

1. Containers/links/estradas de source **não** são adicionados a
   `mincutBoundries`.
2. Cada cluster de energy source ganha 1 torre (`minimalRCL` 5, 7, 8, …) +
   ramparts (`minimalRCL` 3) na torre, no container e em cada link.
3. Cluster de mineral ganha ramparts, sem torre.
4. A base mantém `6 - 1 core - nSourceTowers` torres de perímetro; total ≤ 6.
   *(smoke: 2 sources → base 4, source 2, total 6)*
5. `findNextTowerLocation` retorna `null` em vez de recorrer além de um teto de
   profundidade.

## Outcome

Entregue em `architect.js`: `getContainerLocations` emite torres + ramparts
`sourceDefense`; `case undefined` / `case 10` adicionam com
`shouldProtect=false`; `case 12` computa a contagem de torres de perímetro;
helper `pickTowerTile`; teto de recursão em `findNextTowerLocation`.

**0016** substituiu `pickTowerTile` por uma alocação unificada das tiles
range-1 do container na ordem **link 1 → torre → link 2** — a torre de source
é sempre alcançável pelo miner e nunca é espremida pelo 2º link.
