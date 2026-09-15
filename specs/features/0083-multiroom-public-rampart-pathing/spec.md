# 0083 — Rampart pública no pathing multi-room

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

`utils/routing.js` reutiliza `utils/move.js`'s `roomMatrix()` no pathing
multi-room. Essa matriz foi desenhada para movimento intra-room e bloqueia
qualquer estrutura que não seja estrada, container ou rampart própria/pública.
No pathing entre salas, a regra desejada é mais estreita: apenas `wall` e
rampart privada devem bloquear a passagem; uma rampart pública de outro player
deve ser uma tile válida. O comportamento também precisa continuar isolado do
pathing intra-room.

## Desired outcome

Viagens multi-room atravessam ramparts públicas de outros players como caminho
válido, mas continuam evitando walls e ramparts privadas conhecidas em salas
com visão. O movimento dentro de uma sala mantém a política atual de
`roomMatrix()`.

## In scope

- Criar uma matriz estrutural específica de `utils/routing.js` para salas com
  visão, bloqueando somente `STRUCTURE_WALL` e ramparts não-públicas/não-
  próprias.
- Usar essa matriz em `computeRealRoute`, `routeCostCallback` e
  `avoidCostCallback`.
- Manter o fallback terrain-only para salas sem visão.
- Adicionar assertions no smoke para wall, rampart privada e rampart pública de
  terceiro.

## Out of scope

- Alterar `utils/move.js`'s `roomMatrix()` ou o movimento intra-room.
- Prever estruturas em salas sem visão.
- Alterar a escolha da sala no grafo de `Game.map.findRoute()`.

## Acceptance criteria

1. Uma wall conhecida marca sua tile como `255` nos três caminhos de routing
   multi-room.
2. Uma rampart privada conhecida de outro player marca sua tile como `255`.
3. Uma rampart pública conhecida de outro player não marca sua tile como
   `255`, portanto permanece caminho válido.
4. Uma sala sem visão mantém o fallback atual sem matriz estrutural.
5. `node --check src/utils/routing.js`, `node test/smoke.js "$(pwd)"` e
   `npx grunt` terminam com sucesso.

## Constitution check

- **§1 CPU is the budget:** a matriz continua cacheada no heap por sala e
  reutiliza `roomCache`, sem novas buscas por creep.
- **§4 Deterministic and testable offline:** o smoke testa as três decisões
  estruturais e o fallback sem visão.
- **§5 Roles are thin:** a regra permanece em `utils/routing.js`, sem lógica
  nos roles.

## Open questions

Nenhuma.
