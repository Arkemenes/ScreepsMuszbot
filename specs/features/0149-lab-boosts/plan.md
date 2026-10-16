# 0149 — Boosts de lab automáticos — Plan

## Approach

Três camadas independentes: (1) **decisão** pura e dinâmica (`boostPolicy`), testável offline sem jogo;
(2) **logística** do composto (lab reservado + haulers + compra só por `deal`); (3) **aplicação** no
creep (passo `boostSelf` antes do trabalho). Tudo atrás de `boost.enabled = false`; liga-se por
role/sala. A decisão é tomada **no spawn** (uma vez por creep, ~1500 ticks): custo de CPU desprezível.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/boostPolicy.js` | `worth(role, compound, ctx)` -> `{ok, ratio, E, Estar, cost, parts}`; tabela estática `PER_UNIT[action][tier]`; histerese; lê `BOOSTS` ao vivo (nunca literais); custo via `boostMarket.cost` |
| `src/utils/boostMarket.js` | `executableCost(compound, qty, room)`: ask na quantidade pelo `orderBook.byResource`, frete (`Game.market.calcTransactionCost`) x preço da energia, taxas (`purchaseCost.evaluate`); estoque próprio = bid líquido de taxa; **nunca cria ordem** |
| `src/utils/boostLogistics.js` | escolhe o lab (`labBoostReservations`), pede ao hauler o job `boostLoad` (reuso de `mineralJob`), libera o lab ao fim/stall |
| `test/boostCases.js` | oráculos de `worth` (energia 20/31,6/70), mercado (sem listagem), fallback sem boost, reserva de lab |

### Changed

| Path | Change |
|------|--------|
| `src/rooms/spawning.js` / `roles/*.spawnData` | `spawnData` pergunta `boostPolicy.worth`; se ok grava `memory.boost = {compound, parts, deadline}`; senão corpo normal |
| `src/roles/builder.js` (e upgrader/hauler nas fases seguintes) | passo `boostSelf(creep)` no início de `run`: vai ao lab, `lab.boostCreep`, expira por `deadline` (stall guard) |
| `src/roles/hauler.js` | job `boostLoad` (composto do storage/terminal -> lab) com prioridade baixa; nunca atrasa entrega urgente |
| `src/utils/labReactions.js` / `labPolicyRuntime.js` | respeitar `labBoostReservations` (já existe) e devolver o lab |
| `src/utils/config.js` | `boost: { enabled:false, hysteresis:0.2, reviewTicks:1500, roles:{...}, maxPartsPerCreep, deadlineTicks:150, minStockToKeep }` |
| `src/utils/console.js` | `boostStatus()` (decisões recentes com preços) |

## Data shapes

- Memory: `creep.memory.boost = {compound, parts, deadline}` (3 campos, só enquanto o creep não foi boostado);
  `Memory.rooms[r].labBoostReservations` (já existe). Log de decisões: **heap**, últimos 50.
- Heap: tabela `PER_UNIT`, cache da última decisão por role/sala (histerese).
- Config: `Memory.settings.boost.*`.

## How it satisfies the constitution

- **CPU:** O(1) por avaliação, no spawn; preço do snapshot em cache; sem `getAllOrders` novo.
- **Memory:** 3 campos por creep até boostar; resto no heap.
- **Fail-soft:** qualquer falha em `boostPolicy`/logística -> creep sai sem boost; `guard()` por subsistema.
- **Offline test:** `boostCases.js` com `Game.market`, labs e creeps stubados.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Comprar composto e deixar ordem parada | proibido: só `deal`; teste de que `createOrder` nunca é chamado |
| Lab reservado trava cadeia XLH2O | `deadline`, stall guard, invariante pós-deploy (produção por cadeia) |
| Preço oscila e a decisão pisca | histerese 20% e `reviewTicks`; preço suavizado do snapshot |
| `energyLedger` mede errado creeps boostados | já corrigido (energia base); teste fixa a fórmula do motor |
| Boost aplicado e creep morre cedo | custo por vida considera `ticksToLive` restante no spawn |
