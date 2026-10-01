# 0110 — Market flip (arbitragem instantânea de mercado) — Tasks

Ordenadas. Cada tarefa é pequena, verificável de forma independente, e termina
num check. Referencie critérios de aceitação como `(AC#)`.

- [x] 1. `src/utils/config.js`: novo namespace `marketFlip.*` em `defaults`
      (`test:true`, `scanInterval:60`, `minProfitRatio:0.01`,
      `guardrailFairPriceRatio:1.05`, `maxCreditRatioPerFlip:0.05`,
      `maxHoldingTicks:1500`).
  - verify: `node --check src/utils/config.js`
- [x] 2. `src/utils/marketFlip.js`: scan — agrupar `getAllOrders()` (reusa
      `market.groupOrders`), achar melhor ORDER_SELL/ORDER_BUY por
      `resourceType`, taxa de energia via livro (não `energyFairPrice`),
      filtro `minProfitRatio`, guardrail de `fairPrice`/`confidence`. Exporta
      só a função de scan por enquanto, sem `tick()`/execução.
  - verify: `node --check src/utils/marketFlip.js`
- [x] 3. Sizing: teto `maxCreditRatioPerFlip` contra saldo disponível
      (`Game.market.credits - Memory.marketFlip.committedCredits`),
      consumo sequencial entre candidatos do mesmo scan (ranking por
      `netProfitRatio`), exclusividade por `resourceType`.
  - verify: `node --check src/utils/marketFlip.js`
- [x] 4. Modo teste vs live: teste só loga em
      `Memory.marketFlip.lastOpportunities`; live chama
      `terminalOps.buy()` e grava `Memory.marketFlip.active[resourceType]`.
      Máquina de estado `tick()`: avança flips ativos todo tick
      (`buying`→`terminalOps.sell()` ao `completed`→`selling`→`completed`
      credita `stats`), cancela por `failed` subjacente ou
      `maxHoldingTicks` (libera exclusividade e `committedCredits`).
  - verify: `node --check src/utils/marketFlip.js`
- [x] 5. `global.marketFlipStatus()` / `global.marketFlipStats()`
      (padrão `global.terminalOperations()`).
  - verify: `node --check src/utils/marketFlip.js`
- [x] 6. `src/utils/index.js` (`marketFlip: require("./marketFlip")`) e
      `src/main.js` (`guard("marketFlip", () => utils.marketFlip.tick());`
      logo após `guard("terminalOps", ...)`).
  - verify: `node --check src/main.js src/utils/index.js`
- [x] 7. `test/smoke.js` — assertar `(AC1)` a `(AC12)`: log-only em teste sem
      `deal()`/`buy()`/`sell()`; sequência buy→completed→sell em live;
      filtro de lucro mínimo; taxa de energia via livro (fairPrice
      divergente injetado); guardrail bloqueando só em live e sinalizando em
      teste; `marketOnly` e commodity aceitos quando lucrativos;
      exclusividade por `resourceType`; teto de 5% sequencial em duas
      oportunidades do mesmo scan; cancelamento por stall guard;
      `guard()` isolando uma exceção interna; `marketFlipStatus()`/
      `marketFlipStats()` refletindo um flip concluído com lucro conhecido.
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 8. `npx grunt` builda `dist/main.js`; `ROADMAP.md` status 0110
      `spec` → `done`.
  - verify: `npx grunt` sem erro; linha do 0110 em `ROADMAP.md` atualizada

## Notes

- Escolha de sala de execução (não coberta pela spec): primeira sala própria
  em `Game.rooms`, ordenada por nome, com `storage`+`terminal` para recursos
  físicos, ou só `controller.my` para `marketOnly` — ver `plan.md`.
- `stats.netProfit` acumula o lucro **estimado no momento do scan** (preço/
  quantidade fixados quando o flip abriu), não uma reconciliação contra
  `terminalOps.events` — ver `plan.md`.
- Uma operação `terminalOps.sell()` que falhar no primeiro tick após o `buy`
  completar (ex.: `priceData()` sem snapshot temporal pronto) é simplesmente
  retentada todo tick enquanto o flip ainda não tiver `sellOpId`, sujeita ao
  mesmo `maxHoldingTicks` geral.
- `node --check` em todos os arquivos tocados, `test/smoke.js` verde (12
  asserções novas, AC1–AC10 e AC12 — AC11 é a própria checagem de build) e
  `npx grunt` sem erro, todos confirmados antes de marcar `done`.
- Follow-up pós-implementação, mesmo dia (pedido do usuário): removida a
  exigência de `confidence === "ready"` do guardrail de `fairPrice` (só o
  ratio contra `fairPrice` continua valendo — ausência total de `fairPrice`
  ainda bloqueia) e `marketFlip.test` passou a ter default `false` (live
  desde o primeiro deploy, em vez de log-only). `spec.md`, `config.js`,
  `marketFlip.js` e `test/smoke.js` (nova asserção de regressão para o
  guardrail sem `confidence`) atualizados; `test/smoke.js` verde e
  `npx grunt` sem erro reconfirmados.
- Follow-up pós-implementação, mesmo dia (pedido do usuário): novo parâmetro
  `createListing` (default `false`) em `terminalOps.buy()`/`sell()` — única
  mudança feita em `terminalOps.js` por esta feature, documentada no
  ROADMAP 0098, não no 0110. O flip passa `createListing:false`
  explicitamente nas duas chamadas (AC13). Consequência tratada no mesmo
  follow-up: se a compra fechar `completed` tendo negociado menos que o
  planejado (livro esgotou, `createListing:false` nunca lista o resto), o
  flip vende `buyOp.dealtAmount` (o que foi de fato comprado), reescala
  `reservedCredits`/`expectedNetProfit` na mesma proporção, e libera sem
  vender se `dealtAmount` for zero. Ajustados também 3 testes pré-existentes
  do 0098 que dependiam do comportamento antigo (`createListing:true`
  explícito) e o mock da AC2 (precisa de `dealtAmount`). `test/smoke.js`
  verde (4 asserções novas) e `npx grunt` sem erro reconfirmados.
- Follow-up pós-implementação, 2026-09-30 (pedido do usuário), quatro itens:
  (1) `global.marketFlipStatus()`/`marketFlipStats()` e o `createListing` de
  `terminalBuy`/`terminalSell` faltavam no `help()` — adicionados em
  `src/utils/console.js`. (2) `marketFlip.minProfitRatio` `0.01` → `0.001`.
  (3) `marketFlip.guardrailFairPriceRatio` `1.05` → `2` (o pedido do
  usuário mencionou "1.1x para 2x" de um jeito ambíguo; interpretei como o
  valor final `2`, sinalizado na resposta pra confirmação). (4) Exclusividade
  ganhou uma segunda regra — 1 flip por sala/terminal, além do 1-por-
  `resourceType` já existente — permitindo salas diferentes flipar recursos
  diferentes em paralelo (`busyRooms()`/`pickRoom(marketOnly, busyRooms)`
  novos em `marketFlip.js`; cada `active[resourceType]` agora grava `.room`).
  Corrigido de brinde um bug latente exposto por essa mudança: a perna de
  venda chamava `pickRoom()` de novo em vez de reusar `entry.room`, o que
  com salas em paralelo poderia vender pela sala errada (sem o estoque). AC13
  → texto sem alteração de comportamento; AC14 novo cobre exclusividade por
  terminal + paralelismo. `test/smoke.js` verde (6 asserções novas/ajustadas,
  incluindo AC8 que ganhou uma segunda sala no fixture pra isolar o teste de
  sizing de crédito da nova restrição de terminal) e `npx grunt` sem erro
  reconfirmados.
- Follow-up pós-implementação, mesmo dia (usuário observou em produção): um
  buy de energia ficava retentando por muitos ticks depois que o preço do
  livro saiu do limite (`createListing:false` sem um corte curto próprio).
  O pedido inicial do usuário foi só sobre o log repetido, mas a causa real
  é a retentativa em si, não o log — corrigido com
  `marketFlip.maxBuyWaitTicks` (default `15`, AC15): se a perna de compra
  não negociou nada (`dealtAmount` zero/ausente) depois desse tanto de
  ticks, `advanceFlips()` cancela a compra de verdade (`terminalOps.cancel`,
  estado final), bem antes do `maxHoldingTicks` geral (1500) — uma vez que
  algo já foi negociado, o corte curto para de valer e o flip volta ao
  orçamento normal. `reportNoCandidate()` em `terminalOps.js` também passou
  a logar só na entrada em `waiting`, não a cada retry (melhoria secundária,
  não substitui o corte de `maxBuyWaitTicks` — deixado explícito pro
  usuário pra não parecer que só o log foi resolvido). `test/smoke.js`
  verde (3 asserções novas: dentro do prazo, prazo estourado sem negociar,
  prazo estourado mas já negociado parcialmente) e `npx grunt` sem erro
  reconfirmados.
- Follow-up pós-implementação, mesmo dia (pedido do usuário): toda operação
  automática de compra/venda (exceto flips) precisa respeitar um teto de
  taxa de entrega — no máximo 5% do valor bruto da ordem. Causa raiz: nada
  em `candidateOrders()` barrava um `deal()` cuja taxa comesse a maior parte
  do valor, contanto que o preço bruto clareasse `op.limit` (decisão
  original do 0098, "limite sempre é líquido" revertida em 2026-09-24).
  Novo `terminalOps.maxFeeRatio` (default `0.05`) e novo parâmetro
  `skipFeeCap` em `terminalBuy`/`terminalSell` (default `false`); `fee` (já
  calculado por `scoredOrders()`, antes descartado) agora vai junto no item
  retornado, pra `candidateOrders()` e `reportNoCandidate()` reusarem sem
  recalcular. `marketFlip.js` passa `skipFeeCap:true` nas suas duas chamadas
  (já calcula essa taxa como parte do próprio `netProfit`). Um teste
  pré-existente do 0098 (`rawGate`) precisou de números novos — o cenário
  original (fee ratio 20%) agora é rejeitado pelo teto por design; mantido o
  ensinamento original (preço bruto abre negócio mesmo com efetivo abaixo do
  limite antigo) com uma fee ratio de 4%, dentro do teto. `test/smoke.js`
  verde (2 asserções novas: teto rejeita, `skipFeeCap:true` restaura o
  comportamento antigo) e `npx grunt` sem erro reconfirmados.
