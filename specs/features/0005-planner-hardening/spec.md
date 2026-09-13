# 0005 — Planner hardening

- **Status:** done
- **Analysis refs:** M2, M3, M4, itens de planejamento 1–4

## Problem

- `findStampLocation` varria o array `buildings` inteiro 3× por célula de stamp
  — O(50·50 · células · buildings), o maior custo do planejador.
- Os passos 8/9 rodavam para sempre se nenhum stamp de extension pudesse ser
  colocado (`countExtensions` nunca atingia o threshold).
- Passos de stamp avançavam mesmo sem nada colocado → base sem o core.
- `createConstructionSites` colocava uma estrutura por tick, só quando a sala
  tinha zero canteiros, na ordem do array do plano (roads antes de extensions).
- `visualizeStructures` redesenhava toda estrutura planejada todo tick, para
  sempre.

## Desired outcome

O planejador sempre termina. A colocação de stamp é tentada de novo com uma
restrição mais frouxa antes de ser pulada-com-log. Construção é uma fila
priorizada. O overlay do plano só desenha o que não está construído.

## Acceptance criteria

1. `findStampLocation` usa um índice `"x:y"`; nenhum `buildings.find`/`.some`
   dentro dos loops de colocação.
2. Um stamp que nunca pode ser colocado é pulado após ≤ 12 tentativas com um
   log `stamp could not be placed`; qualquer passo travado é forçado a avançar
   após 15 ticks. O plano atinge `planned = true`. *(smoke: run com
   todos-os-stamps-impossíveis)*
3. `createConstructionSites` mantém ≤ 8 canteiros/sala, ordenados spawn >
   extension > tower > storage > container > … > road > rampart > wall, depois
   por `minimalRCL`, respeitando os caps de `CONTROLLER_STRUCTURES`.
   *(smoke asserta ordem + cap de spawn)*
4. Construção começa em `planStep >= 3`, não só depois do plano completo.
5. `visualizeStructures` pula entradas do plano cuja estrutura real existe.

## Outcome

Entregue em `architect.js`: índice `byTile`/`at()`, helper `stampStep()` +
stall guard no topo de `planCity`, fila `BUILD_PRIORITY` + `MAX_SITES_PER_ROOM`,
`visualizeStructures` fazendo diff contra `roomCache.structures`.
