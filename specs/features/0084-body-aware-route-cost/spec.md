# 0084 — Custo de rota baseado no corpo do creep

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

`utils/routing.js` escolhe a rota de salas com `Game.map.findRoute()` e uma
penalidade fixa para salas que não são highway. Esse custo não recebe o creep,
não conhece sua proporção de `MOVE` e outras partes, e não representa o tempo
real de viagem em plain, swamp ou road. Um scout rápido e um creep pesado podem
receber a mesma rota mesmo quando a rota mais curta em salas é mais lenta em
ticks para o segundo.

## Desired outcome

Cada viagem multi-room calcula o custo de terreno usando o corpo e a carga atual
do creep que vai viajar. A escolha considera o tempo estimado por tile: cada
parte não-MOVE gera 2 de fadiga em plain e 10 em swamp, recuperados por
`2 * MOVE` por tick; uma parte `CARRY` só entra nessa conta quando está
carregada. Creeps rápidos e lentos podem escolher rotas diferentes; quando não
houver posição/body disponível, o comportamento atual continua sendo o fallback.

## In scope

- Derivar `plainCost` e `swampCost` de `creep.body` e `creep.store` em `utils/routing.js`.
- Usar o custo derivado na validação `computeRealRoute` e na escolha de rota
  específica de um creep.
- Manter fallback para `Game.map.findRoute()` e `nonHighwayPenalty` quando não
  houver body válido ou busca de terreno não puder produzir rota.
- Adicionar assertions offline para corpos rápido e lento.

## Out of scope

- Alterar o corpo, spawn ou movimento intra-room dos creeps.
- Persistir custos derivados em `Memory`.
- Fazer `Game.map.findRoute()` conhecer terreno interno sem `PathFinder`.

## Acceptance criteria

1. Um corpo `[MOVE, MOVE]` estima 1 tick por tile em road/plain/swamp.
2. Um corpo `[MOVE, WORK, WORK, WORK]` estima 2/3/15 ticks por tile em
road/plain/swamp; a road ainda gera somente 1 ponto de fadiga por parte.
3. Um corpo `[CARRY, WORK, MOVE]` estima 1/1/5 ticks vazio e 1/2/10 com 50
recursos em road/plain/swamp.
4. `computeRealRoute` recebe os custos do creep e o fallback sem body continua
funcionando.
5. O smoke testa que corpos com velocidades diferentes podem ordenar as rotas
de forma diferente e permanece verde.
6. `node --check`, `node test/smoke.js "$(pwd)"` e `npx grunt` passam.

## Constitution check

- **CPU:** um `PathFinder.search` já existente recebe dois números derivados;
não há `room.find` novo nem varredura adicional de creeps.
- **Memory:** custos vivem no heap/argumentos da chamada; nenhuma chave nova de
Memory é criada.
- **Fail-soft:** body inválido, PathFinder incompleto ou falta de terrain cai
no fallback atual.
- **Offline test:** o smoke usa corpos mockados e PathFinder já stubado.

## Open questions

Nenhuma.
