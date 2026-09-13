# 0024 — Hauler loads from the closest source container, not the fullest

- **Status:** done
- **Depends on:** 0006 (hauler role), 0019 (energy pile contention)

## Problem

`hauler.js`'s `pickLoad`, no passo de container de source, escolhia via
`_.max(withEnergy, (c) => c.store[RESOURCE_ENERGY])` — o container com **mais
energia guardada**, ignorando completamente a distância. Num relato in-game:
o hauler atravessou a sala inteira até um container de source bem longe (que
por acaso tinha mais energia acumulada) enquanto um container bem mais perto,
com energia de sobra pra entregar, ficou ignorado. Viagem cara e sem sentido
— um trip mais curto já resolveria.

## Desired outcome

`pickLoad` escolhe o container de source alcançável mais **próximo** (por
path) entre os que têm energia suficiente (`>= 50` e não disputados por um
picker de maior prioridade), igual a todo o resto de `pickLoad`/`pickDeliver`
já faz (`findClosestByRange`/`findClosestByPath` em todo outro passo).

## In scope

- `src/roles/hauler.js`: `pickLoad`'s passo de container de source trocado de
  `_.max` (por energia) para `creep.pos.findClosestByPath` (por distância),
  com o mesmo filtro de energia mínima + `reservations.available`.

## Out of scope

- A ordem de prioridade entre TIPOS de pilha (link da base → drops → tumbas →
  ruínas → container de source → storage) — só a escolha **dentro** do passo
  de container de source.
- `pickDeliver` (entrega) — já usa `findClosestByRange`/`findClosestByPath`
  em todo passo, sem esse problema.

## Acceptance criteria

1. Com dois containers de source válidos, um perto com energia suficiente e
   um longe com mais energia guardada, o hauler carrega do perto. *(smoke)*

## Constitution check

- **§1:** mesmo custo — troca um `_.filter` + `_.max` por um
  `findClosestByPath` sobre a mesma lista já filtrada; nenhum find novo.

## Outcome

Entregue. `pickLoad` troca a seleção de container de source de "mais cheio"
pra "mais perto alcançável" (`findClosestByPath`), consistente com o resto do
módulo. Validado pelo smoke (125 assertions no total, 1 nova: dois
containers válidos, perto com menos energia vence o longe com mais) +
confirmado que a assertion falha revertendo pro `_.max` antigo + `npx grunt`.
