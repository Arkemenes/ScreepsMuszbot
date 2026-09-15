# 0088 — Cross-room traffic courtesy

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

O trace ao vivo confirmou que o scout consegue mover diretamente, mas depois
fica com a próxima tile do path cross-room ocupada por um hauler próprio. O
movimento cross-room cai no `nativeMoveTo`, que não chama o protocolo
`utils/excuseMe.js` já usado pelo `utils/move.js` em trajetos dentro da sala.

## Desired outcome

Um creep em rota multi-sala pede passagem pelo mesmo `excuseMe.ask()` quando
a próxima direção cacheada está ocupada por creep próprio e reenvia sua própria
intenção nessa direção quando a cadeia abre. O bloqueador sai somente quando a
cadeia tem saída válida; miner permanece inamovível.

## In scope

- Reutilizar `excuseMe.ask()` para o próximo passo cacheado de `moveToRoom()`.
- Aplicar após `moveTo()` produzir/atualizar `_move.path`.

## Out of scope

- Mudar prioridades, rotas ou regras de saída de `excuseMe`.
- Forçar passagem por miner ou por uma cadeia sem tile livre.

## Acceptance criteria

1. O smoke test assert que uma rota multi-sala pede passagem e move o viajante quando a próxima tile cacheada está ocupada por creep próprio.
2. O smoke test assert que não pede passagem sem ocupante próprio na próxima tile.
3. O retorno original de `moveToRoom()` é preservado.
4. Smoke e build permanecem verdes.

## Constitution check

- **CPU:** olha uma única tile somente depois de um `moveTo()` já necessário.
- **Memory:** reutiliza `_move.path`; não cria estado persistente.
- **Fail-soft:** `ask()` falha fechada quando não existe saída e o status original é devolvido.
- **Offline test:** mocka `excuseMe.ask()` no boundary de `routing`.

## Open questions

- Nenhuma.