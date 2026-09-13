# 0012 — Config module

- **Status:** done
- **Analysis refs:** M8, Constitution §6

## Problem

Tunables são literais espalhados pelo código:

- `utils/hostiles.js` — `hostilePlayers = ["Warrobot10"]` hardcoded. Numa sala
  própria, *qualquer um* que não esteja numa lista de aliados deveria contar
  como hostil; a whitelist só faz sentido para salas neutras / remotas.
- Contagem de `defender` `min(3, …)`, frações de reserva de tower,
  `MAX_SITES_PER_ROOM`, caps de hauler, `SAFE_RANGE`, threshold de `bucket` do
  planejador — tudo inline.
- `Memory.settings` hoje guarda só `profiler`.

## Desired outcome

Um único `utils/config.js` que faz merge de defaults de compile-time com
overrides de `Memory.settings`, para que o comportamento seja ajustável pelo
console sem redeploy. Detecção de hostil vira "não é aliado" em salas próprias,
whitelist em outras.

## In scope

- `config.get(path, default)` lendo `Memory.settings` com uma árvore de
  defaults.
- `Memory.settings.allies = []` — usernames nunca tratados como hostis.
- `hostiles.js`: numa sala com `controller.my`, hostil = tem uma body part que
  pode causar dano **e** owner não está em `allies`. Fora disso, manter a
  whitelist (`Memory.settings.hostilePlayers`).
- Migrar os literais óbvios (contagem de defender, reservas de tower, cap de
  canteiros, safe range, threshold de bucket) para `config` com os valores de
  hoje como defaults.

## Out of scope

- Uma UI / dashboard de settings.
- Overrides de config por sala (só global por ora).
- Retrabalhar o que conta como "pode causar dano" (ATTACK / RANGED_ATTACK /
  HEAL / WORK num hostil perto de estruturas) — manter a definição atual de
  `combat.threats`.

## Acceptance criteria

1. `config.get("defender.maxCount", …)` retorna o valor de `Memory.settings`
   quando setado, o default caso contrário. *(smoke asserta ambos)*
2. Numa sala própria, um creep de um player desconhecido com body parts ATTACK
   é hostil; um de um nome em `Memory.settings.allies` não é. *(smoke asserta)*
3. Numa sala não-própria, só players whitelisted / do sistema são hostis
   (inalterado).
4. Todos os literais migrados ainda resolvem para os valores anteriores com
   `Memory.settings` vazio.

## Constitution check

- **§6:** este *é* o princípio.
- **§3:** `config.get` nunca lança — path ausente → default.
- **§1:** a árvore de defaults é uma constante de módulo; `config.get` é um
  walk barato.

## Outcome

Entregue.

- **`src/utils/config.js`** (novo) — `get(path, fallback)` anda por
  `Memory.settings` (dot-path, ex. `"defender.maxCount"`) primeiro, cai pra
  árvore `defaults` do módulo, cai pro `fallback` do chamador — nunca lança
  (path ausente/estrutura errada em qualquer nível → `undefined`, tratado).
- **Literais migrados** (todos resolvendo pro valor de hoje com
  `Memory.settings` vazio): `defender.maxCount` (3, `rooms/needs.js`),
  `hauler.maxCountNoLinks` (5), `hauler.minContainerLoad` (1000, ROADMAP
  0025), `hauler.deliverReserve`/`deliverReserveUnderAttack` (0.5/0.8),
  `hauler.toppingOffThreshold` (0.05, todos em `roles/hauler.js`),
  `miner.towerReserve`/`towerReserveUnderAttack` (0.5/0.9,
  `roles/miner.js`), `tower.repairEnergyRatio` (0.7),
  `tower.rampartCriticalLimit`/`...UnderAttack` (10000/100000, ambos em
  `structures/tower.js`), `combat.safeRange` (5, era `SAFE_RANGE` —
  `utils/combat.js` ganhou `safeRange()`, lida ao vivo em vez de cacheada
  no load do módulo, já que o objetivo é ajuste sem redeploy),
  `planner.minBucket` (500)/`maxSitesPerRoom` (8, ambos
  `rooms/architect.js`), `traffic.roadThreshold`/`decayInterval`/
  `decayFactor`/`roadRepairFloor` (`utils/traffic.js`, ROADMAP 0008),
  `remotes.maxDistance`/`maxPerRoom`/`reserveHealthyTicks`
  (`rooms/remotes.js`, ROADMAP 0020).
- **`utils/hostiles.js`**: `isHostile(creep, room)` ganhou o parâmetro
  `room` (opcional, retrocompatível). Numa sala própria
  (`room.controller.my`), hostil = tem `ATTACK`/`RANGED_ATTACK` (mesma
  definição de `combat.isArmed`, duplicada localmente — `combat.js` já
  importa `hostiles.js`, importar de volta criaria ciclo) **e** não está em
  `allies()` — a whitelist não entra em jogo aí. Fora disso (sala não-minha,
  ou sem `room` passado — retrocompatibilidade), mantém a whitelist de
  sempre, agora também com override (`hostilePlayers()` lê
  `Memory.settings.hostilePlayers`, mesmo padrão de `allies()`).
  `getHostiles`/`tower.js`'s `isHostile(rememberedTarget, tower.room)`
  passam a sala.
- Validado pelo smoke (179 assertions no total, 9 novas): `config.get`
  com/sem override/path inexistente; hostil desconhecido armado numa sala
  própria (com e sem override de `hostilePlayers`), desarmado não conta,
  aliado armado nunca conta, e fora de sala própria (ou sem `room`) o
  comportamento antigo (só whitelist) continua idêntico. Confirmado que a
  assertion do novo comportamento de sala própria falha revertendo o fix +
  `npx grunt` (48 arquivos).
