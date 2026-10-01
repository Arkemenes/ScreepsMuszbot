# 0110 — Market flip (arbitragem instantânea de mercado) — Plan

Derivado de `spec.md`. Se o plano revelar que a spec está errada, conserte a
spec primeiro.

## Approach

Um módulo novo, `src/utils/marketFlip.js`, com duas fases por tick:

1. **Avançar flips ativos** (todo tick, sem gate de intervalo): para cada
   `Memory.marketFlip.active[resourceType]`, inspeciona o estado da(s)
   operação(ões) `terminalOps` subjacente(s) via `terminalOps.operation(id)`
   (já exportado) e avança a máquina de estado do flip — `buying` → chama
   `terminalOps.sell()` assim que o `buy` chega a `completed` → `selling` →
   ao `completed`, credita `Memory.marketFlip.stats` e libera a exclusividade
   e o crédito reservado. Uma operação subjacente `failed` (ou o próprio flip
   excedendo `maxHoldingTicks` desde `openedTick`) cancela o flip pelo mesmo
   caminho (`terminalOps.cancel(id)` na perna ainda ativa), contabilizado em
   `stats.cancelled`.
2. **Scan** (gated por `marketFlip.scanInterval`, mesmo padrão de
   `lastCurrentScanTick` que `market.js` já usa): um único
   `Game.market.getAllOrders()`, agrupado por `resourceType` reusando
   `market.groupOrders()` (exportado, sem duplicar essa lógica). Só os
   `resourceType`s que aparecem no book são avaliados — um recurso sem ordem
   de compra ou de venda nunca pode formar um par, então isso já cobre "todo
   `resourceType`, incluindo commodities e `marketOnly`" sem precisar
   enumerar `RESOURCES_ALL` inteiro (CPU: zero trabalho por recurso sem
   oportunidade nenhuma).

   Para cada `resourceType` presente: pega a ORDER_SELL de menor preço (o que
   o flip compraria) e a ORDER_BUY de maior preço (o que o flip venderia) —
   **uma ordem específica cada, não um nível agregado** — assim cada perna já
   nasce escopada a um único `orderId`/preço, sem precisar caminhar o livro.
   `quantity = min(remainingAmount das duas ordens)`. Taxa de energia
   (recursos físicos, não `marketOnly`): `calcTransactionCost` para as duas
   viagens (nosso terminal ↔ sala da ordem de compra; nosso terminal ↔ sala
   da ordem de venda), convertida a créditos pela melhor ORDER_SELL de
   `RESOURCE_ENERGY` do mesmo scan (nunca `market.js`'s `fairPrice`/snapshot).
   Lucro líquido e `netProfitRatio` sobre o custo de aquisição
   (`quantity * buyPrice`, o capital em risco — a mesma base usada pelo teto
   de 5%).

   Candidatos que passam `minProfitRatio` são ordenados por `netProfitRatio`
   decrescente. Cada um, em ordem: pula se o `resourceType` já tem flip ativo
   (exclusividade); calcula o teto por
   `maxCreditRatioPerFlip * (Game.market.credits - Memory.marketFlip.committedCredits)`
   (créditos **já** reservados pelos candidatos anteriores deste mesmo scan
   contam contra o saldo disponível — é assim que a segunda oportunidade usa
   5% do que sobrou, não do saldo original); reduz `quantity` para caber no
   teto; se sobrar `quantity > 0`, é uma oportunidade "executável". Guardrail
   de `fairPrice` (contra `market.js`'s `snapshot()`) é avaliado por
   candidato: em modo live, reprova a oportunidade inteira (não some, só não
   executa e não reserva crédito); em modo teste, a oportunidade continua
   logada com `wouldBlockGuardrail: true` e **não** entra na simulação
   sequencial de consumo de crédito (não reserva `committedCredits`
   hipotético), evitando que uma oportunidade que nunca executaria em live
   "roube" orçamento simulado de uma oportunidade real seguinte.

   Cada oportunidade avaliada (aprovada ou não) é registrada em
   `Memory.marketFlip.lastOpportunities` (para `marketFlipStatus()`). Em modo
   teste, nada além do log acontece. Em modo live, uma oportunidade aprovada
   chama `terminalOps.buy(room, resourceType, quantity, buyPrice)`, reserva
   `committedCredits += quantity * buyPrice`, e grava a entrada em
   `Memory.marketFlip.active[resourceType]`.

A escolha de sala (`room`, físico) é o primeiro `Game.myRooms` (ordenado por
nome, determinístico) com `storage` e `terminal` — mesma checagem que
`terminalOps.owned()` já usa. `marketOnly` não precisa de terminal, só de
`controller.my`, então usa o primeiro `Game.myRooms` sem mais filtro. Isso
não está explícito na spec (que não fala de múltiplas salas), é a
interpretação mínima consistente com o resto do bot: um único ponto de
execução, sem lógica de escolha "melhor sala" que a spec nunca pediu.

O lucro contabilizado em `stats.netProfit` ao completar um flip é o valor
**estimado no momento do scan** (preço/quantidade fixados quando o flip
abriu), não uma reconciliação contra os eventos reais de
`Memory.terminalOps.events` — a spec já proíbe redimensionar a perna depois
de aberta ("cada perna é dimensionada uma vez"), então a estimativa de
lucro também fica fixa nesse momento; reconciliar contra o extrato real
adicionaria complexidade sem mudar nenhuma decisão do módulo.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/marketFlip.js` | Scan de arbitragem, máquina de estado dos flips ativos, sizing/guardrail, `global.marketFlipStatus()`/`global.marketFlipStats()`. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/config.js` | Novo namespace `marketFlip.*` em `defaults` (`test`, `scanInterval`, `minProfitRatio`, `guardrailFairPriceRatio`, `maxCreditRatioPerFlip`, `maxHoldingTicks`). |
| `src/utils/index.js` | `marketFlip: require("./marketFlip")`. |
| `src/main.js` | `guard("marketFlip", () => utils.marketFlip.tick());` logo depois de `guard("terminalOps", ...)`, para ler o estado das operações já avançado neste mesmo tick. |
| `test/smoke.js` | Cobertura das 12 acceptance criteria (mocks de `Game.market.getAllOrders`/`Game.market.credits`, `terminalOps.buy`/`sell`/`operation`, `market.js` snapshot). |

## Data shapes

- `Memory.marketFlip` (Memory):
  ```
  {
    lastScanTick: number|null,
    committedCredits: number,
    active: {
      [resourceType]: {
        resourceType, state: "buying"|"selling",
        buyOpId: string, sellOpId: string|null,
        quantity: number, buyPrice: number, sellPrice: number,
        reservedCredits: number, expectedNetProfit: number,
        openedTick: number,
      }
    },
    lastOpportunities: [
      { resourceType, buyPrice, sellPrice, quantity, netProfit,
        netProfitRatio, wouldBlockGuardrail: boolean, executed: boolean }
    ],
    stats: { completed: number, netProfit: number, cancelled: number, guardrailBlocked: number },
  }
  ```
  Só ids/números — nenhum objeto de jogo persistido (§2). `active`/
  `lastOpportunities`/`stats` são pequenos (um flip por `resourceType` no
  máximo, um log por scan).
- `marketFlip.*` (config, heap via `config.defaults`, overridável em
  `Memory.settings.marketFlip`): `test` (bool), `scanInterval`,
  `minProfitRatio`, `guardrailFairPriceRatio`, `maxCreditRatioPerFlip`,
  `maxHoldingTicks`.
- `lastCurrentScanTick`-style gate (heap, não Memory): módulo mantém uma
  variável de módulo (como `market.js`) só para decidir se o scan deste tick
  já rodou, redundante com `Memory.marketFlip.lastScanTick` mas evita reler
  Memory a cada checagem — segue o padrão já usado por `market.js`.

## How it satisfies the constitution

- **CPU:** um `getAllOrders()` por `scanInterval` ticks, iterando só
  `resourceType`s presentes no book; avanço de flips ativos é O(flips ativos),
  tipicamente 0-2 entradas.
- **Memory:** ledger pequeno, só ids e números, ver acima.
- **Fail-soft:** chamada única envolvida por `guard("marketFlip", fn)`;
  `maxHoldingTicks` garante que nenhum flip fica preso para sempre; uma
  operação `terminalOps` que falha (`failed`) cancela o flip pelo mesmo
  caminho do stall guard.
- **Offline test:** `Game.market.getAllOrders`/`credits`/`calcTransactionCost`
  e `terminalOps.buy`/`sell`/`operation`/`cancel` são todos mocáveis; nenhuma
  dependência de estado real do jogo.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Escolha de sala de execução não está na spec (múltiplas salas com terminal) | Interpretação mínima documentada acima (primeira sala própria com terminal, ordenada por nome) — revisitável numa spec futura se o usuário quiser lógica de escolha. |
| Lucro contabilizado em `stats.netProfit` é estimado no momento do scan, não reconciliado com o extrato real de `terminalOps.events` | Documentado acima; consistente com a regra "perna dimensionada uma vez" da spec. Uma feature futura pode reconciliar contra `terminalOps.marketTransactionStats()` se a estimativa se mostrar imprecisa em produção. |
| `terminalOps.sell()` pode falhar no primeiro tick após o `buy` completar (ex.: `priceData()` sem snapshot temporal pronto) | Módulo simplesmente retenta `sell()` todo tick enquanto o flip estiver em `buying` com o `buy` já `completed` e nenhum `sellOpId` ainda — sujeito ao mesmo `maxHoldingTicks` geral. |

## Rollback

`Memory.settings.marketFlip = { test: true }` volta ao modo observação sem
executar nada. Remover a linha `guard("marketFlip", ...)` do `main.js`
desliga o módulo por completo (nenhuma outra parte do bot depende dele).
