# 0106 — Hauler recolhe qualquer recurso de tombstone/ruin

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-24

## Problem

`pickLoad()` em `src/roles/hauler.js` já buscava tombstones (creeps mortos,
ex.: invaders) e ruins (estruturas destruídas), mas só pela fatia de
`RESOURCE_ENERGY` (`hauler.js:447-459`). Qualquer outro recurso deixado numa
tombstone — compounds de boost de um invader morto, por exemplo — nunca era
coletado: `pickLoad`/`loadEnergy` e a máquina de estados `load`/`deliver` são
inteiramente amarradas a `RESOURCE_ENERGY` (comentário do próprio arquivo,
linhas 148-151), e a pilha ficava lá até a tombstone/ruin expirar e o recurso
se perder.

## Desired outcome

Um hauler ocioso (sem energia acionável em nenhum lugar da cascata normal)
recolhe qualquer recurso não-energético ainda presente numa tombstone ou
ruin da sala e entrega em storage/terminal, do mesmo jeito que já faz para
container de mineral / output de lab / output de factory (0051/0095).

## In scope

- Novo job `battlefieldLoot` na cascata não-energética de
  `pickMineralJob()`, primeiro na ordem (tombstone/ruin decaem — perdem o
  recurso pra sempre se ninguém pegar a tempo, ao contrário de container/
  lab/factory, que só ficam parados).
- `utils/roomCache.js` ganha `tombstones()`/`ruins()` (memoização por tick,
  mesmo padrão de `droppedResources()`), evitando outro `room.find()` cru
  por hauler ocioso.
- Piso configurável `hauler.minLootLoad` (padrão 50, mesmo estilo de
  `hauler.minDropLoad`/`minContainerLoad`: fallback inline em `config.get`,
  sem entrada obrigatória em `config.js`).

## Out of scope

- Mexer em `pickLoad()`/na fatia de energia de tombstone/ruin — já
  funcionava e continua exatamente igual.
- Fazer o job de loot competir por prioridade/pressão com spawn/extension/
  torre crítica: continua estritamente um fallback de hauler ocioso, como
  todo o resto de `pickMineralJob()` fora do override de pressão de 0095.
- Dropped resources (`FIND_DROPPED_RESOURCES`) — resultam da tombstone já
  ter expirado, não do creep morto diretamente; fora de escopo aqui.

## Acceptance criteria

1. Com um hauler sem energia acionável e uma tombstone carregando energia +
   um recurso não-energético, `pickMineralJob()` retorna o job de loot
   (recurso não-energético, origem a tombstone, destino storage/terminal)
   antes de qualquer job de mineral container/lab/factory:
   `"pickMineralJob() picks up a non-energy resource from a tombstone before the mineral container"`.
2. Sem loot pendente em nenhuma tombstone/ruin, `pickMineralJob()` volta a
   cair para o job de mineral container normalmente:
   `"pickMineralJob() falls back to the mineral container once no tombstone/ruin loot remains"`.
3. `node --check` limpo em todo arquivo tocado, `node test/smoke.js "$(pwd)"`
   verde, `npx grunt` builda `dist/main.js`.

## Constitution check

- **CPU:** `tombstones()`/`ruins()` seguem o mesmo cache por tick/sala que
  todo o resto de `utils/roomCache.js` — nenhum `room.find()` novo corre por
  creep.
- **Memory:** nada novo persiste; o job segue o mesmo formato heap-only
  `{kind, resourceType, from, to}` que os demais jobs de `pickMineralJob()`,
  materializado em `creep.memory.mineralJob` só como já acontecia antes.
- **Fail-soft:** sem tombstone/ruin com loot, ou sem storage/terminal pra
  receber, a função simplesmente retorna `null` e a cascata segue adiante —
  mesmo padrão de `mineralContainerJob`/`labOutputJob`.
- **Config over hardcode:** `hauler.minLootLoad` via `config.get`, não
  literal solto no meio da lógica.
- **Prefer the no-op:** reaproveita o hauler já ocioso e a cascata
  `pickMineralJob()` existente; nenhuma role nova, nenhum estado novo.

## Outcome

Entregue em `src/roles/hauler.js` (`battlefieldLootJob()`, primeiro item de
`pickMineralJob()`) e `src/utils/roomCache.js` (`tombstones()`/`ruins()`).
Smoke cobre a prioridade sobre o container de mineral e o fallback quando
não há loot.
