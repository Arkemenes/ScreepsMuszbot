# 0110 — Market flip (arbitragem instantânea de mercado)

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-09-29

## Problem

O bot hoje não detecta nem explora a assimetria natural do mercado do
Screeps: em qualquer instante pode existir um par comprar-na-melhor-ordem-de-venda
+ vender-na-melhor-ordem-de-compra do mesmo `resourceType`, em quantidade
suficiente, cujo lucro bruto supera a taxa de energia da entrega
(`Game.market.calcTransactionCost`, convertida a créditos pelo preço vigente
de compra de energia) — e isso simplesmente não é procurado. `utils/market.js`
mantém um snapshot temporal (`market.currentInterval`,
`market.snapshotWindowTicks`) que serve bem para preço-justo histórico, mas é
lento demais e, para commodities, sintético demais (`applyCommodityPrices()`
substitui `buyPrice`/`sellPrice`/`fairPrice` pelo custo derivado da receita,
não pelo livro de ordens real) para decidir uma operação que só existe
enquanto a foto do livro de ordens for a de agora.

## Desired outcome

A cada `marketFlip.scanInterval` ticks (default 60), um módulo novo lê
`Game.market.getAllOrders()` fresco, procura — para cada `resourceType`,
incluindo commodities e recursos `marketOnly` (pixel/accessKey/cpuUnlock) —
o par melhor-ordem-de-compra × melhor-ordem-de-venda cujo lucro líquido (já
descontada a taxa de entrega em energia, valorada ao preço instantâneo de
compra de energia) seja ≥ `marketFlip.minProfitRatio` (default `0.1%`,
revisado 2026-09-30 — era 1%) do valor
negociado. Com `marketFlip.test:false` (default, pedido do usuário,
2026-09-29), o módulo abre duas operações já existentes de `terminalOps`
(`buy()` seguida de `sell()`, sem tocar em `terminalOps.js`) para capturar o
par, respeitando um teto de 5% do saldo de créditos disponível por flip e um
guardrail contra preço manipulado. Com `marketFlip.test:true`, cada
oportunidade encontrada é só logada — nenhuma ordem é criada, nenhum crédito
é gasto.

## In scope

- Módulo novo `src/utils/marketFlip.js`, chamado do `main.js` dentro de
  `guard("marketFlip", ...)`.
- Scan próprio sobre `Game.market.getAllOrders()` a cada
  `marketFlip.scanInterval` ticks — não usa o snapshot cacheado de
  `market.js` para preço, só usa `market.js` (`snapshot().resources[type]`)
  para o guardrail de `fairPrice`.
- Para cada `resourceType` (todo `RESOURCES_ALL`/`INTERSHARD_RESOURCES`,
  incluindo commodities e `marketOnly`): melhor ordem de compra (a mais cara
  disponível, o que o bot venderia contra) e melhor ordem de venda (a mais
  barata disponível, o que o bot compraria) — **um único nível de preço por
  perna**, sem caminhar o livro (sem book-walking, sem venda parcial
  crescente).
- Custo da taxa de entrega em energia (`Game.market.calcTransactionCost`)
  convertido a créditos pelo preço instantâneo (mesmo scan) da melhor ordem
  de venda de `RESOURCE_ENERGY` — nunca por `energyFairPrice`/snapshot.
  Recursos `marketOnly` têm taxa de entrega zero (sem terminal físico).
- Filtro de lucro mínimo: lucro líquido ≥ `marketFlip.minProfitRatio` × valor
  negociado.
- Guardrail anti-manipulação: só considera o preço de compra elegível se
  `preço ≤ marketFlip.guardrailFairPriceRatio` (default `2` — revisado
  2026-09-30, era `1.05`) ×
  `market.js`'s `fairPrice` para aquele `resourceType` (sem exigir
  `confidence === "ready"` — removido a pedido do usuário, 2026-09-29; a
  ausência de qualquer `fairPrice`/snapshot ainda bloqueia, só o requisito de
  janela temporal madura foi retirado). Em modo teste, uma oportunidade que
  viola o guardrail ainda é logada (com `wouldBlockGuardrail: true`), só não
  é logada como executável. Em modo live, viola = descartada, não executa.
- Teto de tamanho por flip: no máximo `marketFlip.maxCreditRatioPerFlip`
  (default `0.05`) do saldo de créditos **disponível** no momento — recalculado
  a cada scan contra `Game.market.credits` menos os créditos já comprometidos
  por flips em andamento (`Memory.marketFlip.committedCredits`), nunca contra
  um saldo antigo cacheado. Quando várias oportunidades passam o filtro de
  lucro no mesmo scan, cada uma é avaliada e, se aprovada, lançada em ordem
  decrescente de lucratividade, consumindo o orçamento disponível
  sequencialmente — a segunda oportunidade lançada usa 5% do saldo que já
  restou depois de reservar a primeira, não do saldo original do tick.
- Exclusividade (revisado 2026-09-30, pedido do usuário): duas regras
  independentes, ambas sempre valem. (1) No máximo 1 flip ativo por
  `resourceType` ao mesmo tempo, em qualquer sala — impede que duas salas
  comprem o mesmo recurso ao mesmo tempo e disputem a mesma venda. (2) No
  máximo 1 flip ativo por sala/terminal ao mesmo tempo — um terminal nunca
  toca duas operações simultâneas. Como as duas regras são independentes,
  salas diferentes podem flipar recursos diferentes em paralelo; não há teto
  artificial de quantos flips de recursos diferentes podem estar ativos
  simultaneamente além dessas duas regras e do teto de crédito acima. A
  perna de venda sempre usa a MESMA sala que a de compra usou (nunca
  re-seleciona uma sala livre na hora de vender — o estoque comprado está no
  storage daquela sala específica).
- Execução (modo live) via `terminalOps.buy()`/`terminalOps.sell()`, sempre
  com `createListing:false` e `skipFeeCap:true` (pedido do usuário,
  2026-09-29 e 2026-09-30 — ver revisões do ROADMAP 0098 que introduziram
  esses dois parâmetros; `skipFeeCap:true` porque o flip já avalia a taxa de
  entrega como parte do próprio `netProfit`/`minProfitRatio`, então o teto
  genérico de `terminalOps.maxFeeRatio` seria redundante e mais restritivo):
  a etapa de compra roda como uma operação `buy` normal; assim que ela chega a `completed` (estoque já
  recebido em storage via o `receipt` que `terminalOps` já gera), o módulo
  abre a etapa de venda como uma operação `sell` normal, pelo tamanho
  **realmente negociado** (`buyOp.dealtAmount`), nunca pelo tamanho
  originalmente planejado — se o livro esgotar antes de cobrir a quantidade
  toda (`createListing:false` nunca lista o restante), o flip vende só o que
  foi de fato comprado, gerando lucro proporcional em vez de ficar preso
  esperando o resto. Se `dealtAmount` for zero (nada foi negociado), o flip é
  liberado sem tentar vender. Cada `deal()` roda contra exatamente 1
  `orderId` por vez — nunca duas ordens no mesmo nível de preço, nunca uma
  segunda tentativa na mesma perna no mesmo tick (mecânica de intents do
  Screeps: `deal()` só é aplicado pelo engine depois que o script termina;
  nada da troca — créditos, `remainingAmount`, store do terminal — é
  observável no mesmo tick).
- Stall guard: se um flip fica mais de `marketFlip.maxHoldingTicks` (default
  1500) sem fechar a perna de venda, ele é cancelado (as operações
  `terminalOps` subjacentes seguem seu próprio caminho de cancelamento/
  recuperação já existente) e liberado da exclusividade por `resourceType`.
- Observabilidade via console, seguindo o padrão já usado por
  `terminalOps.js` (`global.terminalOperations()`): `global.marketFlipStatus()`
  devolve JSON com o modo atual (`test`/live), o tick do último scan, as
  oportunidades encontradas nesse último scan (preço, quantidade, lucro,
  `wouldBlockGuardrail`) e os flips ativos (`resourceType`, `room`, `state`,
  ids das operações `terminalOps` subjacentes); `global.marketFlipStats()`
  devolve contadores acumulados desde o último reset de `Memory` (flips concluídos,
  lucro líquido total em créditos, flips cancelados por stall guard, flips
  bloqueados pelo guardrail).
- Config novo em `src/utils/config.js`, namespace `marketFlip.*`:
  `test` (default `false`, revisado 2026-09-29 — live por padrão),
  `scanInterval` (`60`), `minProfitRatio` (`0.001`, revisado 2026-09-30),
  `guardrailFairPriceRatio` (`2`, revisado 2026-09-30), `maxCreditRatioPerFlip` (`0.05`),
  `maxHoldingTicks` (`1500`), `maxBuyWaitTicks` (`15`, novo 2026-09-30).
- `test/smoke.js`: cobertura para detecção de par lucrativo, filtro de lucro
  mínimo, guardrail (bloqueando em live, só sinalizando em teste), teto de
  5% do saldo disponível (inclusive o caso de duas oportunidades no mesmo
  scan consumindo o orçamento em sequência), exclusividade por
  `resourceType`, e modo teste não chamando `Game.market.deal()`/
  `terminalOps.buy()`/`terminalOps.sell()`.

## Out of scope

- Qualquer modificação em `src/utils/terminalOps.js` que não seja o parâmetro
  `createListing` (revisão de 2026-09-29, pedido do usuário, documentada no
  ROADMAP 0098): a máquina de estado, `lockConflict()`, `settleDeal()`,
  `saleBuffer()` etc. permanecem exatamente como estavam — o flip só é mais
  um consumidor da API pública `buy()`/`sell()`, agora com um parâmetro
  explícito a mais.
- Book-walking / consumir múltiplos níveis de preço na mesma perna.
- Venda parcial crescente ("growable sell") ou qualquer forma de operação
  de venda que cresça de tamanho ao longo do tempo — cada perna é
  dimensionada uma vez, no momento em que é aberta.
- Ajuste automático de `marketFlip.scanInterval` por consumo de CPU — a
  validação inicial de custo é manual (usuário observa e ajusta o config se
  precisar).
- Ativação/desativação automática do modo live por histórico/confiança — não
  há lógica que decida isso por conta própria; o usuário controla via
  `Memory.settings.marketFlip.test` (default `false`, ou seja, live desde o
  primeiro deploy — revisado 2026-09-29, ver "Open questions").
- Qualquer UI/dashboard novo para o flip (fica para uma feature futura, se
  fizer sentido, análogo ao que 0079 fez para outras métricas).

## Acceptance criteria

1. Com `marketFlip.test:true`, o smoke test confirma que, dado um
   par de ordens lucrativo acima de `minProfitRatio`, o scan loga a
   oportunidade (preço de compra, preço de venda, quantidade, lucro líquido
   em créditos e em ratio) e **não** chama `Game.market.deal()` nem
   `terminalOps.buy()`/`terminalOps.sell()`.
2. Com `marketFlip.test:false`, o mesmo par lucrativo aciona exatamente uma
   chamada a `terminalOps.buy()` no tick do scan; a chamada a
   `terminalOps.sell()` só ocorre depois que a operação de compra atinge
   `state: "completed"` (smoke simula a progressão de estado).
3. Um par cujo lucro líquido (bruto menos taxa de entrega de energia
   convertida ao preço instantâneo de `RESOURCE_ENERGY`) fica abaixo de
   `marketFlip.minProfitRatio` × valor negociado nunca é logado como
   oportunidade executável.
4. A taxa de entrega em energia é sempre convertida usando o preço da melhor
   ordem de venda de `RESOURCE_ENERGY` do **mesmo scan** — o smoke test
   comprova isso injetando um `market.js`'s `energyFairPrice` divergente do
   livro de ordens e confirmando que o cálculo usa o valor do livro, não o
   snapshot.
5. Um par cujo preço de compra excede `guardrailFairPriceRatio` ×
   `market.js`'s `fairPrice` (ou para o qual não há `fairPrice` algum) nunca
   é executado em modo live; em modo teste, a mesma oportunidade ainda
   aparece no log, marcada com `wouldBlockGuardrail: true`. `confidence`
   deixou de ser exigido (removido a pedido do usuário, 2026-09-29).
6. Recursos `marketOnly` (pixel, accessKey, cpuUnlock) e commodities são
   avaliados pelo mesmo scan — o smoke test cobre ao menos um caso de cada
   categoria sendo aceito quando lucrativo.
7. Nenhum flip abre uma segunda operação de compra ou venda enquanto já
   existe uma ativa para o mesmo `resourceType` — o smoke test confirma que
   um segundo par lucrativo do mesmo recurso é ignorado até o primeiro flip
   terminar (`completed`, `failed` ou cancelado por stall guard).
8. O tamanho de cada flip nunca excede `maxCreditRatioPerFlip` do saldo de
   créditos disponível (`Game.market.credits` menos
   `Memory.marketFlip.committedCredits`) no momento em que aquele flip
   específico é lançado — o smoke test cobre o caso de duas oportunidades
   aprovadas no mesmo scan, confirmando que a segunda usa 5% do que restou
   depois de reservar a primeira, não do saldo original do tick.
9. Um flip que não fecha a perna de venda em até `maxHoldingTicks` ticks é
   cancelado e libera a exclusividade do `resourceType` — smoke test cobre
   o cancelamento por stall guard.
10. `marketFlip.tick()` é chamado do `main.js` dentro de
    `guard("marketFlip", fn)` — uma exceção interna do módulo não aborta o
    tick.
11. `node --check src/utils/marketFlip.js` limpo, `test/smoke.js` verde,
    `npx grunt` builda `dist/main.js` sem erro.
12. `global.marketFlipStatus()` reflete o último scan (modo, oportunidades,
    flips ativos) e `global.marketFlipStats()` acumula lucro líquido total e
    contadores de cancelamento/guardrail — smoke test cobre ambos após
    simular ao menos um flip concluído com lucro conhecido.
13. As chamadas de `terminalOps.buy()`/`terminalOps.sell()` do flip sempre
    passam `createListing:false`. Se a perna de compra fechar `completed`
    tendo negociado menos que o planejado (`buyOp.dealtAmount < quantity`,
    livro esgotado), o flip vende exatamente `dealtAmount` (não o valor
    original) e reescala `reservedCredits`/`expectedNetProfit` na mesma
    proporção; se `dealtAmount` for zero, o flip é liberado sem tentar
    vender. Smoke test cobre os dois casos (venda parcial reescalada; zero
    negociado, sem venda).
14. No máximo 1 flip ativo por sala/terminal ao mesmo tempo, além do teto de
    1 por `resourceType` já existente — smoke test cobre duas salas
    flipando dois `resourceType`s diferentes em paralelo no mesmo scan
    (ambas executam) e o caso de uma única sala disponível, onde a segunda
    oportunidade (outro `resourceType`, lucrativa, dentro do teto de
    crédito) fica só logada (`executed:false`), sem abrir, porque o único
    terminal já está ocupado pela primeira.
15. Uma perna de compra que ainda não negociou nada (`dealtAmount` zero/
    ausente) é cancelada após `marketFlip.maxBuyWaitTicks` (default `15`) —
    bem antes do `maxHoldingTicks` geral — porque um flip é pra ser
    instantâneo, não uma ordem de espera. Uma vez que algo já foi negociado
    (`dealtAmount > 0`), esse corte curto deixa de valer e o flip volta ao
    orçamento normal de `maxHoldingTicks`. Smoke test cobre os três casos:
    ainda dentro do prazo curto (não cancela), prazo curto estourado sem
    nada negociado (cancela, libera crédito/exclusividade), e prazo curto
    estourado mas já com `dealtAmount > 0` (não cancela por isso).

## Constitution check

- **CPU (§1):** um `getAllOrders()` por scan (não por tick — gate por
  `marketFlip.scanInterval`), iterado uma vez sobre `resourceTypes()`; nenhum
  `room.find`/`Game.creeps` novo. Se o custo medido (`Memory.settings.profiler`)
  for alto, o intervalo sobe via config, sem mudança de código.
- **Memory (§2):** só um ledger pequeno em `Memory.marketFlip`
  (`committedCredits`, e por flip ativo: `resourceType`, `state`,
  `terminalOps` op ids `.id`, `openedTick`) — nenhum objeto de jogo
  persistido, só ids.
- **Fail-soft (§3):** chamada única do `main.js` envolvida por
  `guard("marketFlip", fn)`; stall guard próprio (`maxHoldingTicks`) evita
  flip preso para sempre.
- **Testável offline (§4):** lógica de scan/decisão é pura função de um
  `getAllOrders()` mockável + `market.js`'s `snapshot()` mockável; toda
  mudança de comportamento ganha assertion em `test/smoke.js`.
- **Roles finos (§5):** não se aplica (não é role de creep); mora em
  `utils/`, chama a API pública de outro `utils/` (`terminalOps`), sem
  `require` circular.
- **Config over hardcode (§6):** todos os limiares em `marketFlip.*` via
  `config.get(...)`.
- **Prefer no-op (§7):** nenhuma oportunidade lucrativa acima do limiar =
  nenhuma chamada de API de mercado naquele scan.
- **Spec before code (§8):** esta spec.
- **Spending cascade (§9):** não se aplica diretamente — não é uma decisão
  de "onde gastar energia/reparo/spawn"; é geração de lucro, não consumo de
  recurso escasso da colônia. Documentado aqui só para constar que o
  princípio foi revisado.

## Open questions

Nenhuma — design fechado com o usuário (`/grill-me`, 2026-09-29), incluindo a
reversão de book-walking/venda-parcial-crescente para par único por perna e a
adição do guardrail de 5% do saldo por flip. Revisado pelo usuário após a
primeira implementação, mesmo dia: removida a exigência de
`confidence === "ready"` do guardrail de `fairPrice` (só o ratio contra
`fairPrice` continua valendo) e `marketFlip.test` passou a ter default
`false` (live desde o primeiro deploy, em vez de log-only). Revisado de novo
em 2026-09-30, pedido do usuário: `marketFlipStatus()`/`marketFlipStats()`
(e o `createListing` do `terminalBuy`/`terminalSell`) faltavam no
`help()` — corrigido em `src/utils/console.js`; `minProfitRatio` baixou pra
`0.1%` (era `1%`); `guardrailFairPriceRatio` subiu pra `2` (era `1.05`);
exclusividade ganhou a regra de 1-flip-por-terminal (AC14), permitindo
salas diferentes flipar recursos diferentes em paralelo. Revisado de novo no
mesmo dia: usuário observou um `terminalOps` buy de energia retentando por
muitos ticks depois que o preço do livro saiu do limite (efeito do
`createListing:false` sem um corte curto) — `marketFlip.maxBuyWaitTicks`
(AC15) cancela de verdade a compra (não só silencia o log) se nada foi
negociado em 15 ticks; `terminalOps.js`'s `reportNoCandidate()` também só
loga na entrada em `waiting`, não a cada retry, como melhoria secundária.
Revisado de novo no mesmo dia: usuário pediu um teto de taxa de entrega
(máximo 5% do valor) pra toda operação automática de compra/venda que NÃO
seja flip — flips já calculam essa taxa como parte do próprio lucro
líquido. Novo `terminalOps.maxFeeRatio` (default `0.05`) em
`candidateOrders()`; `marketFlip.js` passa `skipFeeCap:true` nas suas duas
chamadas pra ficar de fora dessa checagem genérica.

## Superseded em parte pelo 0111 (2026-10-01)

O guardrail `preço ≤ guardrailFairPriceRatio × fairPrice` (AC5 e correlatos) foi
substituído por `utils/marketPricing.js` ([0111](../0111-craft-flip/spec.md)):
compra barata (ask ≤ mediana 7d) sem guardrail; compra cara e a perna de venda
passam por liquidez e filtro de outlier; margem de tempo com `T` curto
(`marketFlip.horizonTicks`). `guardrailFairPriceRatio` foi removido do config.
