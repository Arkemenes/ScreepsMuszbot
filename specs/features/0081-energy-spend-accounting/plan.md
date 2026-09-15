# 0081 — Energy spend accounting — Plan

## Approach

Novo módulo heap-resident `utils/energyLedger.js`, mesmo padrão de reset
preguiçoso por tick que `utils/traffic.js`/`census` já usam. Cada call site
que já gasta energia de creep/torre/spawn passa a medir o gasto por diff de
`store[RESOURCE_ENERGY]` ao redor do intent existente (não fórmula nova) e
grava no ledger só quando o intent retorna `OK`. `utils/stats.js` lê o
snapshot do tick e grava em `Memory.stats.rooms[name].energySpent`.

**Follow-up (mesmo dia):** `snapshot()` deixou de refletir só o tick
corrente e passou a somar uma **janela deslizante** de
`energyLedger.windowTicks` ticks (default 60, config-overridable) — cada
tick fechado é arquivado num histórico por sala (`history[roomName]`), podado
a cada `ensureTick()`/`snapshot()` pra nunca crescer sem limite. O tick ainda
em andamento (`byRoom`) sempre entra na soma, mesmo antes de ser arquivado.

**Bug real corrigido (mesmo dia, usuário reportou em produção):** o diff de
`store[RESOURCE_ENERGY]` antes/depois do intent nunca observa mudança
nenhuma no motor real — todo intent de creep (`build`/`repair`/
`upgradeController`) é só enfileirado durante o script e aplicado pelo
servidor depois que todos os jogadores terminam a tick, então o `store`
lido logo após chamar o intent ainda reflete o valor de antes. Os call
sites de creep passaram a **estimar** o gasto (WORK parts vivas ×
`BUILD_POWER`/`REPAIR_POWER`/`UPGRADE_CONTROLLER_POWER`, boost lido ao vivo
de `BOOSTS[WORK][part.boost]`, limitado pela energia do creep e pelo
trabalho restante do alvo) em vez de diff — `energyLedger.creditBuild`/
`creditRepair`/`creditUpgrade`, centralizados no próprio módulo. Torre
(`creditTower`) usa `TOWER_ENERGY_COST` fixo por ação; `renewCreep`
(`renewCost`) usa a fórmula nativa (`bodyCost/2.5/tamanho do corpo`) — nenhum
dos dois depende de observar o `store` depois do intent.

## Modules

### New

| Path | Responsibility |
|------|-----------------|
| `src/utils/energyLedger.js` | Acumulador heap-resident por sala. `record(roomName, category, amount)`, `recordRepair(roomName, structureType, amount)` (mapeia rampart/wall/normal), `creditBuild(creep, site)`/`creditRepair(creep, target)`/`creditUpgrade(creep, controller)` (estimativa por WORK power, boost-aware, capada por energia/trabalho restante — não diff), `creditTower(tower, category)` (`TOWER_ENERGY_COST` fixo), `renewCost(body)` (fórmula nativa de `renewCreep`), `snapshot(roomName)` (10 categorias, sempre presentes, default 0 — soma dos últimos `energyLedger.windowTicks` ticks, não só o corrente). Reset/arquivamento preguiçoso via guard de `Game.time`, mesmo princípio de `traffic.js`. |

### Changed

| Path | Change |
|------|--------|
| `src/prototypes/creep.js` | `runBuild` (branches `ConstructionSite`/`Structure`) e `runUpgrade` medem o gasto por diff de `store[RESOURCE_ENERGY]` ao redor do intent e chamam `energyLedger.record`/`recordRepair` só quando `status===OK`. |
| `src/roles/builder.js` | `opportunisticWork()`'s `creep.repair`/`creep.build` diretos (fora da state machine) ganham o mesmo diff+record. |
| `src/roles/pioneer.js` | O `creep.build(site)` direto ganha o mesmo diff+record (categoria `build`). |
| `src/structures/tower.js` | `run()` mede diff de `tower.store[RESOURCE_ENERGY]` ao redor de `attack`/`rangedMassAttack` (`towerAttack`), `heal` (`towerHeal`), `repair` (`towerRepair`). |
| `src/rooms/spawning.js` | Após o `spawn.spawnCreep(...)` real (não `dryRun`) devolver `OK`, grava `bodyCost(picked.body)` em `"spawn"`. `renewIdleSpawns()` mede diff de `spawn.store[RESOURCE_ENERGY]` ao redor de `spawn.renewCreep(candidate)`, grava em `"renew"` só se `OK`. |
| `src/utils/stats.js` | `exportStats()` grava `roomStats.energySpent = energyLedger.snapshot(roomName)`, mesmo bloco que já seta `minerals`/`avgBarrierHits`. |
| `test/smoke.js` | Novas assertions (ver `tasks.md`). |
| `specs/ARCHITECTURE.md` | Nova linha na tabela de `src/utils/` + nota em `Memory.stats.rooms[name]` na seção Persistence. |

## Data shapes

`Memory.stats.rooms[name].energySpent`:

```js
{
  spawn: number,
  renew: number,
  build: number,
  repairNormal: number,
  repairRampart: number,
  repairWall: number,
  upgrade: number,
  towerAttack: number,
  towerHeal: number,
  towerRepair: number,
}
```

Todas as 10 chaves sempre presentes (default `0`) — sem esparsidade, pra
série temporal do Grafana não ter buraco quando uma categoria fica zerada
por um tick.

Cada valor é a **soma dos últimos `energyLedger.windowTicks` ticks**
(default `60`, override via `Memory.settings.energyLedger.windowTicks`), não
só o tick em que `exportStats()` rodou.

## How it satisfies the constitution

- **CPU:** sem `room.find` novo; diffs de valores já lidos pelos call sites
  existentes, um objeto pequeno por sala no heap.
- **Memory:** só números por sala própria; o acumulador do tick vive no heap.
- **Fail-soft:** `record`/`recordRepair` nunca lançam (ignoram `amount`
  inválido); não é um subsistema `guard()`-wrapped, só lido dentro do
  `stats()` já guardado no `main.js`.
- **Offline test:** cada categoria nova ganha assertion no smoke.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Diff de `store` capturar gasto de uma ação errada se duas ações tocarem o mesmo `store` no mesmo statement | Diff sempre tomado imediatamente antes/depois do intent específico, sem nenhuma outra chamada de creep/torre entre as duas leituras. |
| Ledger do tick anterior vazar pro próximo (heap não é limpo automaticamente) | Guard de `Game.time` em `record`/`snapshot`, mesmo padrão de `traffic.js`/`census`. |
| `spawnCreep` bem-sucedido mas com corpo diferente do esperado | Usa `bodyCost(picked.body)` do corpo realmente enviado ao `spawnCreep`, não um valor cacheado. |

## Rollback

Reverter os call sites instrumentados para o estado anterior (só o intent,
sem diff/record) e remover `src/utils/energyLedger.js` e a leitura em
`stats.js`. Nenhum dado em `Memory` precisa de migração — `energySpent` é
recalculado do zero a cada tick.
