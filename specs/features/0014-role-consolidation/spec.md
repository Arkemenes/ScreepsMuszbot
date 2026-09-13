# 0014 — Role consolidation

- **Status:** done

## Problem

`harvester` e `hauler` fazem trabalhos que se sobrepõem: os dois "pegam energia
num ponto, entregam noutro". Com link network o `harvester` é, na prática, o
**distribuidor do link da base** (`pickLoad` do `hauler` nem sabe puxar do link
não-coletor). Isso confunde e duplica lógica.

`bootstrap` quer **1 sempre** (`!_.some(role === bootstrap)` +
`energyAvailable ≥ 200`), então uma sala madura carrega para sempre um creep de
200 de energia com prioridade de spawn #1.

## Desired outcome

Um único role de transporte, `hauler`, adaptativo: puxa do link da base →
drop/tombstone/ruína → container de source → storage (só quando há consumidor
que precisa). Entrega em torres (reserva) → spawn/ext → torres 95% → storage →
container do controller. `harvester` deixa de existir; creeps `harvester` vivos
rodam como `hauler` até morrer. `bootstrap` só é desejado quando a economia não
se sustenta (sem miner, ou sem carrier e sem link).

## In scope

- `roles/hauler.js` absorve as fontes/destinos do `harvester`.
- Deletar `roles/harvester.js`; remover de `roles/index.js` e de
  `ECONOMY_ROLES`.
- `main.js`: `role === "harvester"` → renomeia para `"hauler"` e roteia.
- `bootstrap.wanted(room)`: 0 quando `miner > 0 && (hauler > 0 || linkNetwork)`,
  senão 1.

## Out of scope

- Split posterior `hauler` + `filler` estático (ROADMAP "Later").
- Contagens dinâmicas dos outros roles — isso é 0015.
- Mudar corpo do `hauler` (segue `CARRY×2 MOVE`; o fallback de minerar do
  `harvester` some — quem cobre o pré-container é o `bootstrap`).

## Acceptance criteria

1. Não existe `roles/harvester.js`; `require("./roles").harvester` é
   indefinido (ou aponta para `hauler` como alias legado).
2. Um creep com `memory.role === "harvester"` tem `memory.role === "hauler"`
   após um tick e roda a lógica do `hauler`. *(smoke asserta)*
3. `hauler.pickLoad` retorna o link não-coletor com energia quando há um.
   *(smoke asserta)*
4. `hauler` só puxa do `room.storage` quando existe spawn/ext/tower com espaço.
   *(smoke asserta que não puxa do storage sem consumidor)*
5. `bootstrap.wanted` é 0 numa sala com miner + hauler; 1 quando não há miner.
   *(smoke asserta ambos)*
6. Smoke inteiro continua verde.

## Constitution check

- **§5:** menos roles, sem lógica duplicada.
- **§7:** `bootstrap` para de spawnar de graça numa sala madura.
- **§1:** `pickLoad` usa `roomCache` / `findClosest*` como já fazia.

## Outcome

Entregue. `roles/harvester.js` deletado; `main.js` renomeia
`role === "harvester"` → `"hauler"`. `hauler.js` reescrito com `pickLoad`
(link da base → drop/tombstone/ruína → container de source → storage só com
consumidor) e `pickDeliver` (torre-reserva → spawn/ext → torre-95% → storage →
container do controller). `bootstrap.wanted` via `roomNeeds` (0014 usa a
fórmula, 0015 a moveu para `rooms/needs.js`). Validado pelo smoke.
