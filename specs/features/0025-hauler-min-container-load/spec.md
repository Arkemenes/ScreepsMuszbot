# 0025 — Hauler only loads from a source container above a minimum

- **Status:** done
- **Depends on:** 0024 (hauler loads from the closest source container)

## Problem

`pickLoad` pegava qualquer container de source com `>= 50` de energia. Isso
manda o hauler numa viagem por uma quantidade pequena, quando esperar o
container encher mais teria rendido uma viagem só maior (e mais eficiente
por tick de trajeto).

## Desired outcome

O hauler só considera um container de source como fonte de carga quando ele
tem **mais de 1000** de energia guardada. Abaixo disso, o container continua
enchendo sem ninguém vir buscar.

## In scope

- `src/roles/hauler.js`: novo `MIN_CONTAINER_LOAD = 1000`; o filtro do passo
  de container de source em `pickLoad` troca `>= 50` por `> MIN_CONTAINER_LOAD`.

## Out of scope

- Os outros passos de `pickLoad` (link da base, drops, tumbas, ruínas,
  storage) — o mínimo de 50 já existente ali não muda.
- `pickDeliver` — inalterado.

## Acceptance criteria

1. Um container de source com 1000 de energia ou menos nunca é escolhido
   como fonte de carga. *(smoke)*
2. Um container de source com mais de 1000 continua sendo escolhido
   normalmente (e o mais perto entre vários qualificados ainda vence — 0024).
   *(smoke)*

## Constitution check

- **§1:** mesmo custo — só muda o valor de comparação no filtro já existente.

## Outcome

Entregue. `MIN_CONTAINER_LOAD = 1000` em `hauler.js`; o filtro do container
de source em `pickLoad` exige `store[RESOURCE_ENERGY] > MIN_CONTAINER_LOAD`.
Validado pelo smoke (126 assertions no total, 1 nova: container com 900 de
energia nunca é escolhido; o teste de 0024 ajustado pra usar valores acima do
novo mínimo) + confirmado que a assertion falha revertendo pro limiar antigo
(`>= 50`) + `npx grunt`.
