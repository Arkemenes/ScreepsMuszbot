# 0126 — Hauler ignora energia caída sob containers

- **Status:** done
- **Owner:** Arkemenes / ARK-95
- **Created:** 2026-10-10

## Problem

`hauler.pickLoadNow` prioriza grandes drops mesmo quando estão na posição de
um container cheio de mineração. Isso manda o hauler até a source enquanto o
link receptor está cheio perto da base e poderia desobstruir a cadeia.
`biggestEnergyDrop` também considera essas pilhas e impede reutilizar um alvo
válido do cache de `pickLoad`.

## Desired outcome

Grandes pilhas só são elegíveis acima de 500 energia (default de
`hauler.bigDropLoad`, limite estrito, estimativa após deslocamento) e fora da
posição de qualquer container. Drops menores têm a mesma exclusão espacial.
Sem drop elegível, a cascata existente chega ao link receptor normalmente.
Preservar cache de alvos, filtragem de perigo e reservas de energia.

## In scope

- Índice de posições de todos os containers por sala/tick no heap.
- Exclusão na seleção das duas faixas de drops, no fast gate e na
  revalidação de pickups cacheados.
- Sem mudar thresholds, ordem dos outros alvos ou seleção de link/containers.

## Acceptance criteria

1. Smoke: `0126: overflow under a source container yields to the receiving link`.
2. Smoke: `0126: only uncovered drops above 500 enter the first tier`.
3. Smoke: `0126: small drops under any container are excluded`.
4. Smoke: `0126: a covered overflow does not invalidate a cached link`.
5. Smoke: `0126: a cached pickup covered by a container is reselected`.
6. Smoke: `0126: container positions are shared by haulers within a tick`.
7. Smoke: `0126: container position index refreshes next tick`.

## Constitution check

`roomCache.structuresByType` reaproveita a coleta única de estruturas;
construir um Set por sala/tick no `derived` já existente, com lookup O(1)
por drop. Sem `lookForAt`, `room.find` adicional, Memory ou varredura de creeps.
Nenhum subsistema novo. Spec segue o ajuste solicitado pelo usuário.
