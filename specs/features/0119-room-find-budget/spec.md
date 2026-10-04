# 0119 — Orçamento de `Room.find` por tick

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-10-03
- **Relacionadas:** 0118 (torre), 0120 (defesa), 0001 (`roomCache`)

## Problem

O profiler mostra ~**60 chamadas de `Room.find` por tick** em média. A
constituição (§1) manda **um `room.find(type)` por sala por tick** via
`utils/roomCache`. Inventário estático (grep de `.find(FIND_`), fora de
`roomCache.js`:

| Local | Problema |
|-------|----------|
| `utils/energy.js:18-24` (`energyPiles`) | 3 finds (dropped/tombstones/ruins) — `roomCache.droppedResources/tombstones/ruins` já existem |
| `rooms/needs.js:114-120` (`pickableEnergy`), `:350` | idem (3 finds) + `FIND_SOURCES` |
| `roles/miner.js:175,231,422,523,536,554` | `FIND_SOURCES`/`FIND_MY_SPAWNS`/`FIND_STRUCTURES` **por creep** (`roomCache.sources` existe) |
| `utils/move.js:102` | `FIND_CREEPS` a cada cálculo de caminho com `avoidCreeps` (por creep que replaneja) |
| `defender*.js`, `raider.js`, `utils/combat.js:137`, `hauler.js:716` | `FIND_MY_SPAWNS` por creep (ocioso/recuando) |
| `structures/tower.js:116` | `FIND_MY_CREEPS` (cura) |
| `structures/rampart.js:12` × `utils/hostiles.js:106` | duas finds de `FIND_HOSTILE_CREEPS` com filtros diferentes na mesma sala/tick |
| `rooms/spawning.js:101`, `rooms/intel.js`, `roles/pioneer.js`, `rooms/architect.js` (13) | a verificar cadência |

Não sabemos ainda quais desses sites contribuem mais para os 60: o profiler
conta `Room.find` mas não separa por chamador.

## Desired outcome

Um **orçamento explícito**: no estado estável, cada `(sala, tipo FIND_*)` é
consultado no máximo 1× por tick, e o total de `Room.find` por tick fica
dentro de uma meta (a definir após o levantamento por chamador). Os sites
acima passam a ler de `roomCache`/`census`, e um teste no smoke **falha** se
um novo `find` não cacheado reaparecer.

## In scope

- Contador de `Room.find` por chamador (`FIND_*` + linha do stack) ligado por
  `profile(N)`/flag, só para diagnóstico — sem custo quando desligado.
- Novas entradas no `roomCache` onde faltar (`mySpawns`, `hostileCreeps`
  unificado, `creeps`).
- Migrar os sites da tabela, começando pelos de maior frequência (por creep).
- Teste de orçamento no smoke (contador no stub de `Room.find`).

## Out of scope

- `pos.findClosestByRange`/`findInRange` (outro custo; avaliar depois).
- Reescrever `architect` (roda sob gate; só entra se o contador acusar).

## Acceptance criteria

1. Smoke: `main.loop()` com N salas/creeps stub chama cada `(room, FIND_*)` ≤ 1×
   por tick (assert por chave `FIND_*`).
2. Smoke: total de `Room.find` por tick ≤ `findBudget` (config), com a fixture
   de estado estável.
3. `roomCache` ganha `mySpawns(room)` e `hostileCreeps(room)`; `rampart.js` e
   `hostiles.js` compartilham a mesma lista.
4. Contador por chamador, ligado, imprime top-10 sites (para fechar o
   levantamento e validar a meta in-game).
5. `node --check` + smoke verde; `npx grunt` ok.

## Constitution check

- §1 é a própria feature. §4 o orçamento vira assertion offline. §6 o teto
  `findBudget` em config. Cuidado: cache por tick não pode vazar objetos entre
  ticks (reset por `Game.time`, mesmo padrão do `roomCache`).

## Open questions

- Meta numérica: <20? <10 por tick? Depende do levantamento por chamador.
- Os 60 contam `Room.find` de salas remotas/observadas também (via `intel`)?

## Investigação (2026-10-03) — instrumentação entregue

`profile(N)` agora imprime `[profile] Room.find callers`: chamadas/tick e CPU/tick por cadeia `caller<-caller` (as 2 primeiras frames de pilha fora do wrapper; inclui chamadas internas de `findClosestByPath`/`findClosestByRange`). Só durante a janela do profile (a captura de pilha não é grátis). Resolve a "Open question" sobre quem origina os ~60/tick; a meta numérica sai desse ranking.

## Resultado do levantamento (2026-10-03)

42,6 `Room.find`/tick por chamador; os 16 maiores somam < 0,25 CPU/tick: o número de chamadas superestima o custo. Sites reais migrados para `roomCache`: `FIND_MY_SPAWNS` (novo `roomCache.mySpawns`) em defender, defenderStriker, hauler (idle), miner, combat e spawning; `energyPiles` e `pickableEnergy` (dropped/tombstones/ruins) e `FIND_SOURCES` do `needs`. Asserção no smoke: 1 find por (sala, tipo) por tick. A meta numérica de chamadas/tick foi trocada por "sem find duplicado por (sala, tipo, tick)".
