# 0089 — Passo cacheado em rota multi-sala

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

O trace confirmou que um scout parado tem `_move.path` válido, `moveTo()`
retorna `OK`, a próxima tile é caminhável e a intenção não é sobrescrita, mas
ele não anda. Quando outro creep o trata como bloqueador via `excuseMe`, a
chamada direta `creep.move(direction)` tira o scout da inércia. A correção
0088 só fazia essa chamada quando havia bloqueador à frente, mascarando o
problema inicial até alguém passar perto do scout.

## Desired outcome

Toda chamada bem-sucedida de `moveToRoom()` segue explicitamente a primeira
direção do cache nativo `_move.path` via `creep.move(direction)`. Quando há
um bloqueador próprio, `excuseMe` ainda recebe prioridade para abrir a cadeia
antes do mesmo passo direto.

## In scope

- Emitir o passo direto depois de `moveTo() === OK` em `moveToRoom()`.
- Reutilizar a direção cacheada e a cortesia de tráfego existentes.

## Out of scope

- Trocar o algoritmo de PathFinder ou a política de rotas.
- Alterar movimentos fora de `moveToRoom()`.

## Acceptance criteria

1. O smoke test assert que rota multi-sala com próximo passo livre chama `move()` na direção cacheada após `moveTo() === OK`.
2. O smoke test assert que rota com bloqueador ainda chama `excuseMe.ask()` e move o viajante na mesma direção.
3. `ERR_NO_PATH` não dispara passo direto.
4. Smoke e build permanecem verdes.

## Constitution check

- **CPU:** reaproveita a direção já calculada pelo motor, sem busca adicional.
- **Memory:** apenas lê `_move.path` nativo já existente.
- **Fail-soft:** status de `moveTo()` é preservado; sem direção cacheada não faz nada.
- **Offline test:** cobre caminho livre, ocupado e `ERR_NO_PATH`.

## Open questions

- Nenhuma.