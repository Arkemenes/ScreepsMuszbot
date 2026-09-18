# 0055 — Hauler floor bumps to 2 with an active mineral operation + storage

- **Status:** done
- **Owner:** usuário + Claude
- **Created:** 2026-09-13

## Problem

`rooms/needs.js`'s tier base de `hauler` numa sala com link network (o caso
comum de fim de jogo) é `1 + unlinkedSourceContainers(room)` — normalmente só
1, o "último quilômetro" do link até spawn/ext/storage. Mas
`roles/hauler.js`'s `pickMineralJob()` (ROADMAP 0051) reaproveita esse mesmo
creep pra escoar o container do mineral, reabastecer lab, drenar factory e
alimentar o power spawn — sempre na prioridade mais baixa, então nunca
atrapalha a energia, mas também nunca ganha um creep dedicado (decisão
original do 0051, constitution §7: um hauler de mineral ficaria ocioso quase
sempre). Com um único hauler, o errand de mineral disputa ciclos com a
própria vazão de energia da sala assim que o extractor está minerando de
verdade.

## Desired outcome

A pedido do usuário: quando a sala tem um extractor+container de mineral
ativos (mineral não esgotado) **e** storage pra receber o que for extraído, o
piso do tier base de `hauler` sobe pra 2 — um segundo par de mãos livre pra
absorver o errand de mineral sem tirar do orçamento da energia. Assim que o
depósito esgota (`mineralAmount <= 0`, "faltando recursos" — condição do
usuário), não há mais nada pra escoar e a sala volta ao piso normal (1, ou
mais se houver container de source sem link).

## In scope

- `src/utils/roomCache.js`: novo `minerals(room)`, cache de `FIND_MINERALS`
  por `(room, tick)` — reaproveitado por `roles/mineralMiner.js`'s
  `mineralSite()` e `roles/hauler.js`'s `mineralContainerJob()`, que antes
  cada um rodava seu próprio `room.find(FIND_MINERALS)` (constitution: um
  `find()` por tipo por tick).
- `src/rooms/needs.js`: `mineralOperationActive(room)` novo — mineral existe,
  `mineralAmount > 0`, extractor a alcance 0 e container a alcance 1 (mesmo
  critério de `roles/mineralMiner.js`'s `mineralSite()`, mantido separado por
  decisão de design já registrada naquele arquivo — nunca roteado por este
  módulo). `compute()`: com `room.storage` e `mineralOperationActive(room)`,
  `hauler = Math.max(hauler, hauler.minCountWithMineral)` depois das duas
  ramificações existentes (link/sem link).
- `src/utils/config.js`: `hauler.minCountWithMineral` (default 2).

## Out of scope

- `pickMineralJob()`'s cascata em si — inalterada (mesma decisão do 0054, que
  já deixou mineral/power/commodity de fora do framework de tiers de
  energia).
- Qualquer ajuste ao tier sem link network (`min(maxCountNoLinks, containers
  + 1)`) — na prática já tende a ficar >= 2 com pelo menos um source
  container; o piso novo só entra em jogo quando o cálculo original ficaria
  abaixo de 2.

## Acceptance criteria

1. Sala com link network + storage + extractor/container de mineral ativos
   (`mineralAmount > 0`): `roomNeeds(room).hauler === 2` (antes seria 1).
   *(smoke)*
2. Mesma sala com o depósito esgotado (`mineralAmount <= 0`): volta a 1 —
   "faltando recursos, mantemos 1" (decisão do usuário). *(smoke)*
3. Sem storage, o piso extra nunca se aplica (não há onde entregar o
   mineral).
4. `node --check` limpo em todo arquivo tocado; `node test/smoke.js` verde;
   `npx grunt` builda `dist/main.js`.

## Constitution check

- **§1 CPU:** `mineralOperationActive` é uma leitura O(1) de
  `mineral.mineralAmount` + dois `findInRange` já pagos por qualquer sala com
  mineral (mesmo custo que `mineralMiner.js`'s `mineralSite()` já tinha);
  `FIND_MINERALS` em si passa a rodar só uma vez por `(room, tick)` via
  `utils/roomCache.js` em vez de uma vez por chamador.
- **§3 Fail-soft:** sem mineral/extractor/container, `mineralOperationActive`
  retorna `false` e o tier base fica como estava — nunca lança.
- **§5 Roles thin:** a checagem mora em `rooms/needs.js` (a única fonte de
  contagem de roles); `roles/hauler.js` não ganhou lógica nova, só passou a
  ler `FIND_MINERALS` pelo cache compartilhado.
- **§6 Config over hardcode:** `hauler.minCountWithMineral` segue o padrão
  dot-path de `utils/config.js`.
- **§4 Testável offline:** os dois critérios de aceitação acima ganharam
  assertion em `test/smoke.js`.

## Decisão posterior implementada em 0095

[0095](../0095-hauler-non-energy-coordination/spec.md) mantém o piso de dois
haulers para operação mineral ativa e o generaliza, com histerese 75%/50%,
para output lab/factory sob pressão real. A população existente funcionará
como latch, sem novo estado persistente. A operação mineral descrita aqui
continua elevando o piso mesmo abaixo do threshold de pressão.

## Outcome

Entregue. `utils/roomCache.js` ganhou `minerals(room)`; `mineralMiner.js` e
`hauler.js`'s `mineralContainerJob()` migrados pra ele.
`needs.js`'s `mineralOperationActive(room)` + piso
`hauler.minCountWithMineral` (2, default). Validado pelo smoke (2 novas
assertions: piso de 2 com operação ativa, volta a 1 com depósito esgotado) +
`npx grunt`.
