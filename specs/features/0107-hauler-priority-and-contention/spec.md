# 0107 — Hauler: prioridade de pilhas decadentes e anti-contenção de coleta/depósito

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-24

## Problem

Dois problemas relatados pelo usuário no mesmo dia de [0106](../0106-hauler-battlefield-loot/spec.md):

1. **Ordem de prioridade.** `pickLoad()` (`src/roles/hauler.js`) só considerava o
   terminal, `essentialConsumer` etc. antes de qualquer energia dropada, e um
   corpo (tombstone/ruin) só entregava a fatia de energia via `pickLoad`,
   deixando qualquer mineral pra trás numa corrida separada por
   `pickMineralJob()`. O usuário queria que uma pilha dropada grande e o
   loot de um corpo morto (que decaem/somem) vencessem tudo, inclusive spawn
   faminto — e, ao visitar um corpo, o hauler pegasse **tudo** que tivesse lá
   (energia + minerais) numa única viagem, direto pro storage, em vez de uma
   viagem de energia mais uma corrida de mineralJob por composto.
2. **Contenção.** Nada impedia dois haulers de mirar a mesma pilha de coleta
   (um já a caminho com capacidade suficiente pra esvaziá-la) ou o mesmo alvo
   de entrega quase cheio (dois haulers indo depositar 50 de energia numa
   extension que só tem 50 de capacidade livre). O lado de coleta já tinha
   `utils/reservations.js` (`available`/`claim`/`release`); o lado de entrega
   não tinha equivalente algum.

## Desired outcome

- Cascata de coleta (`pickLoad`, `run()`'s `load` branch) com um novo topo:
  1. `hauler.bigDropLoad` (500) de energia dropada — vence tudo, inclusive
     terminal/essentialConsumer/pressuredJob.
  2. Loot de tombstone/ruin (qualquer recurso, energia inclusa) — uma única
     viagem que esvazia o corpo inteiro e entrega tudo direto no storage.
  3. Resto da cascata existente, inalterado.
- Anti-contenção simétrica dos dois lados, com cache por tick (mesmo idioma
  de `utils/reservations.js`/`roomCache.js`):
  - Coleta: já existia (`reservations.available`/`claim`/`release`),
    reaproveitado como estava, mais o novo tier `bigDrop`.
  - Entrega: nova (`reservations.availableDeliver`/`claimDeliver`/
    `releaseDeliver`), mesmo padrão ledger-por-tick reconstruído de
    `creep.memory.deliverTarget`.

## In scope

- `pickLoad()`: novo tier `bigDrop` (`tier: "bigDrop"` no retorno) acima do
  terminal; remoção do antigo tier de energia de tombstone/ruin (substituído
  pelo lootJob abaixo).
- `battlefieldLootJob()` (de [0106](../0106-hauler-battlefield-loot/spec.md))
  reescrito: não segue mais o formato `{kind, resourceType, from, to}` de
  `pickMineralJob()` (múltiplos recursos, não um só) — vira
  `{kind, from, to}`, `to` é sempre `room.storage` (nunca terminal), e sai da
  cascata de `pickMineralJob()`.
- `assignLootJob()`/`clearLootJob()`/`runLootJob()`: par
  assign/clear no mesmo estilo de `assignMineralJob`/`clearMineralJob`, e um
  runner que itera um recurso por tick (pickup/withdraw/transfer só aceitam
  um `resourceType` por chamada) até a pilha esvaziar, depois entrega tudo
  que carrega, também um recurso por tick. `creep.memory.lootJob` é o novo
  campo de memória (`{fromId, toId}`, sem `resourceType`).
- `run()`: checagem de `creep.memory.lootJob` roda até completar, logo no
  topo (mesma prioridade do `mineralJob` em andamento); tier `bigDrop`
  vence tudo incondicionalmente (inclusive um `mineralJob` já em curso, mas
  ainda não carregado); loot de corpo é tentado (via `assignLootJob`) antes
  do resto da cascata sempre que o tanque está vazio.
- `utils/reservations.js`: `availableDeliver`/`usableDeliver`/
  `claimDeliver`/`releaseDeliver`, ledger próprio (`byDeliverTarget`,
  reconstruído por tick de `creep.memory.deliverTarget`), sem sistema de
  rank (diferente do lado de coleta — aqui é só capacidade restante).
- `pickDeliver()` e os helpers que ele usa
  (`toppableTower`/`optionalConsumer`/`fallbackTowers`): cada lista de
  candidatos filtrada por `reservations.availableDeliver(creep, s) > 0`
  antes do `findClosestByPath`/`findClosestByRange`.

## Out of scope

- Mudar a ordem do resto da cascata de `pickLoad`/`pickDeliver` além do
  necessário pra encaixar os dois novos tiers/filtros.
- Mexer em `pickMineralJob()`'s outros jobs (container/lab/factory/power) —
  só a remoção de `battlefieldLootJob` de dentro dele.
- Aplicar o filtro `availableDeliver` em storage/terminal como alvo de
  entrega — capacidade grande o bastante pra não ser o cenário descrito
  pelo usuário (extension de 50).

## Acceptance criteria

1. `"a >500 dropped energy pile wins outright, even over spawn/extension hunger and the receiving link (ROADMAP 0107...)"`.
2. `"a dropped pile at/below the bigDrop bar doesn't preempt essentialConsumer (only the >500 tier does...)"`.
3. `"battlefieldLootJob() targets a tombstone holding energy + a mineral compound, straight to storage, no single resourceType"`.
4. `"pickMineralJob() no longer includes battlefield loot - falls straight to the mineral container"`.
5. `"runLootJob() withdraws every resource type off the tombstone (one per tick) before delivering anything"`.
6. `"runLootJob() delivers every resource type it picked up into storage, one per tick"`.
7. `"runLootJob() clears memory.lootJob once fully delivered"`.
8. `"battlefieldLootJob() returns null once no tombstone/ruin loot remains"`.
9. `"availableDeliver() zeroes out a target another hauler already carries enough to fill"`.
10. `"availableDeliver() doesn't subtract the asking creep's own claim from itself"`.
11. `"releaseDeliver() frees the target back up for other haulers"`.
12. `node --check` limpo em todo arquivo tocado, `node test/smoke.js "$(pwd)"`
    verde, `npx grunt` builda `dist/main.js`.

## Constitution check

- **CPU:** `availableDeliver`/etc. seguem o mesmo cache por tick que
  `reservations.available` já usava (`byDeliverTarget`, reconstruído uma vez
  por tick a partir dos creeps vivos) — nenhum `room.find()` novo, nenhum
  recálculo redundante por hauler.
- **Memory:** só `creep.memory.deliverTarget` (id) e `creep.memory.lootJob`
  (`{fromId, toId}`, ids apenas) — nunca um objeto de jogo.
- **Fail-soft:** `battlefieldLootJob` retorna `null` sem corpo/loot/storage;
  `runLootJob` segura a carga perto do storage (sem soltar) se não houver
  onde entregar; `availableDeliver` nunca retorna negativo.
- **Config over hardcode:** `hauler.bigDropLoad` via `config.get`, mesmo
  estilo inline de `hauler.minDropLoad`/`minLootLoad`.
- **Prefer the no-op:** reaproveita `nonEnergyLogistics.claim/release` (dono
  único por sala) pro `lootJob`, e o mesmo idioma ledger-por-tick de
  `reservations.js` pro lado de entrega — nenhuma role nova, nenhum sistema
  de rank novo.

## Outcome

Entregue em `src/roles/hauler.js` (tier `bigDrop` em `pickLoad`,
`battlefieldLootJob`/`assignLootJob`/`clearLootJob`/`runLootJob`
reescritos, `pickDeliver` e helpers filtrados por `availableDeliver`) e
`src/utils/reservations.js` (`availableDeliver`/`usableDeliver`/
`claimDeliver`/`releaseDeliver`). Smoke cobre os dois tiers novos de
`pickLoad`, o loot multi-recurso de `runLootJob` e a contenção de entrega.
