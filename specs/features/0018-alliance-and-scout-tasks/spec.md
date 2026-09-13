# 0018 — Alliance list, ally ramparts, scout sign queue, single scout

- **Status:** done
- **Analysis refs:** M8 (parcial), M1 (parcial)

## Problem

- Não há lista de aliança. Aliados eram tratados como neutros só por não estarem
  na whitelist de inimigos.
- Aliados não conseguem passar pelos ramparts do perímetro.
- Não há como pedir para assinar o controller de uma sala.
- O bot spawna **vários scouts**: `scout.spawn` conta scouts *na sala de origem*,
  mas o scout sai para explorar → a contagem zera → spawna outro. Com 2 salas
  próprias, multiplica.

## Desired outcome

- Lista de aliados (`vlc6wsw0l`, `fR1dj`, `PhilipSchlump` por padrão,
  `Memory.settings.allies` sobrescreve). Aliados nunca são hostis (torre,
  defender, `takeCover` já leem `isHostile`).
- Qualquer rampart nosso **abre** (`setPublic(true)`) quando um creep aliado
  está a ≤ 1 tile, e **fecha** quando ele se afasta. Não abre se um inimigo de
  verdade também estiver a ≤ 2 tiles.
- Console: `signRoom("W1N1", "texto")` enfileira; `signRoom("W1N1")` limpa;
  `signQueue()` imprime. O scout, assim que puder, vai à sala e assina o
  controller, depois tira o pedido da fila. `Memory.signQueue` é o backlog.
- **No máximo 1 scout** no império. Extras se suicidam (`creep.suicide()`).

## In scope

- `utils/hostiles.js`: `allies()`, `isAlly(username)`, `isHostile` exclui
  aliados. `global.addAlly` / `global.removeAlly`.
- `utils/census.js`: `all(role)` e `total(role, minTtl)` — contagem
  império-wide.
- `structures/rampart.js` (novo, registrado em `structures/index.js`):
  `run(rampart)` — abre/fecha conforme aliados adjacentes; guard de inimigo.
- `roles/scout.js`: `global.signRoom` / `global.signQueue`; tarefa de assinatura
  tem prioridade sobre exploração; enforcement de scout único
  (`census.all`/`total` + `Game.spawns[*].spawning`); guard de
  `Object.values(exits || {})` e código negativo de `findExit` (M1).
- `rooms/needs.js`: `scout` também desejado (RCL ≥ 2) quando há pedido de
  assinatura pendente.
- `intel.js`: `numberOfScouts` via `census.total`.

## Out of scope

- Config completa de tunables via `Memory.settings` (0012).
- Reescrita completa do scout / chaves de memory (`home` agora setado, resto
  do M1 fica para 0009).
- Aliados poderem *usar* estruturas nossas (só passagem por rampart).
- Assinar controllers de salas próprias automaticamente / mensagens padrão.

## Acceptance criteria

1. `isAlly("vlc6wsw0l" / "fR1dj" / "PhilipSchlump")` → `true`; outros → `false`;
   `Memory.settings.allies` sobrescreve. *(smoke)*
2. `isHostile(ally)` → `false`; `isHostile(Invader)` → `true`. *(smoke)*
3. Rampart abre com aliado a ≤ 1; fecha quando ele sai; permanece fechado se um
   inimigo está a ≤ 2. *(smoke: 3 asserts)*
4. `census.total("scout")` conta scouts em qualquer sala; `scout.spawn` retorna
   `true` só com 0 scouts no império; um 2º scout se suicida. *(smoke)*
5. `signRoom(room, text)` grava `Memory.signQueue[room]`; o scout na sala assina
   o controller e limpa o pedido. *(smoke)*

## Constitution check

- **§1:** `alliesIn` / `getHostiles` são 1 `find` por sala por tick; `rampart.run`
  faz `findInRange` sobre listas pequenas; `setPublic` só na mudança de estado.
- **§3:** `pendingSignRoom` / `Object.values(exits || {})` / `findExit < 0` não
  lançam.
- **§6:** aliados default em constante, override em `Memory.settings.allies`.
- **§7:** scout único; extras retiram-se.
