# 0096 — Market fair-price engine (fase 0: só cálculo, sem compra/venda)

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-18

## Problem

O bot não tem noção nenhuma de "preço justo" de mercado hoje — nenhum código
em `src/` chama `Game.market.getAllOrders()` ou `deal()`
(confirmado ao investigar o [0079](../0079-grafana-dashboard-stats/spec.md),
que por isso deixou `market.transactions`/`terminalNetwork.transfers` de fora
do `Memory.stats`). O usuário quer eventualmente automatizar compra/venda,
mas o mercado do Screeps é manipulável: qualquer jogador pode criar uma ordem
de qualquer tamanho sem intenção real de negociar (`createOrder`, sem custo
além dos 5% cobrados na criação), então olhar só o melhor `buy`/`sell` do
book é uma péssima estimativa de valor. Uma pesquisa prévia do usuário (fora
deste repo, já incorporada nas decisões desta spec) levantou um catálogo
grande de técnicas (VWAP por profundidade, persistência de ordem, detecção
de manipulação, custo de produção, bandas de confiança) — boa demais pra
implementar de uma vez dado o orçamento de CPU do projeto (~13-19 de 20/tick
com 3 salas, depois de uma rodada inteira de otimização na mesma sessão que
gerou esta spec).

Dado ao vivo durante a discussão (livecheck do usuário, ordens reais de
`energy` no shard): as ordens de `sell` (23-51 cr) e `buy` (58-63 cr) estavam
invertidas uma em relação à outra — o bid acima do ask, algo que numa bolsa
com casamento automático fecharia na hora. Isso só é possível porque o
mercado do Screeps **não casa ordens automaticamente**: `deal()` sempre mira
um `orderId` específico, então ordens sobrepostas ficam penduradas
indefinidamente sem ninguém arbitrar. Nenhum dos dois lados do book batia
perto do "~69" que o usuário tinha ouvido como preço médio de energia — a
confirmação viva de que o book bruto não é uma fonte de preço confiável.

## Desired outcome

Um comando de console mostra, para qualquer `resourceType` (incluindo
`INTERSHARD_RESOURCES` — pixel, cpu unlock, subscription token, access key,
que são recursos de mercado legítimos, só sem receita de produção associada),
uma estimativa de preço justo calculada a partir de dado real do mercado
(histórico oficial + book atual), lado a lado, para o usuário avaliar se os
números fazem sentido. Nenhuma ordem é criada, nenhum `deal()` é executado —
esta fase é 100% observação. O cálculo roda em heap, throttled, e nunca
compromete o orçamento de CPU do resto do bot.

## In scope

- `utils/market.js` (novo) — módulo dono do cálculo de preço justo. Não é um
  módulo `rooms/*`: preço de mercado é global, não por sala (mesmo raciocínio
  que já separa `utils/resourceTiers.js`/`utils/autoscale.js` de
  `rooms/needs.js`).
- Escaneia **todo o mercado**: `RESOURCES_ALL` (constante nativa) +
  `INTERSHARD_RESOURCES` (constante nativa) — nunca uma lista hardcoded.
- Uma chamada `Game.market.getAllOrders()` **sem filtro** por ciclo, agrupada
  por `resourceType` no lado do JS (a alternativa — uma chamada filtrada por
  recurso, ~150+ chamadas — foi descartada por hipótese mas não medida; ver
  Open questions).
- Throttle interno (`config.get("market.currentInterval", 100)`, o próprio
  módulo decide quando recalcular, mesmo idioma de `planScanDue()` do
  [0079-adjacente] `rooms/architect.js`/`structures/observer.js` desta mesma
  sessão) — nunca roda todo tick.
- Fórmula temporal do preço, por recurso:
  - A cada `market.snapshotInterval` ticks, captura somente o melhor SELL e o
    melhor BUY e soma o `remainingAmount` disponível naquele preço.
  - Mantém uma janela circular heap-only de `market.snapshotWindowTicks`
    (default 604800, aproximadamente 7 dias a 1 tick/segundo).
  - `sellPrice` e `buyPrice` são medianas temporais ponderadas pela volumetria
    do melhor nível de cada snapshot. Cada snapshot tem peso máximo de
    `market.snapshotWeightCap` (default 1% do peso bruto total).
  - Para recursos primários, `fairPrice` é a mediana ponderada dos midpoints
    de cada snapshot (`(bestBuy + bestSell) / 2`), e não o midpoint das duas
    medianas independentes. Fica `null` se não houver snapshots com ambos os
    lados; durante a janela incompleta, marca `confidence: "warming"`.
- Console: `marketPrice(resourceType)` imprime todas as componentes; sem
  argumento, lista somente `{resourceType, fairPrice}` dos recursos
  precificáveis.
- `src/utils/console.js` — nova seção "Mercado" com o(s) comando(s) novo(s).
- `Memory.stats.market.fairPrice` — snapshot esparso para o exporter/Grafana;
  não contém objetos do jogo.
- Cotações atuais: `currentBuy` (maior BUY) e `currentSell` (menor SELL),
  atualizadas a cada `market.currentInterval` ticks (default 100), sem alterar
  a cadência horária da amostragem temporal.
- Commodities: `buyPrice`, `sellPrice` e `fairPrice` são o custo derivado
  recursivo dos mesmos preços dos insumos da receita nativa `COMMODITIES`, por
  unidade produzida. Não há um segundo campo temporal da commodity que duplique
  esses valores; `currentBuy`/`currentSell` mostram o book próprio para a
  comparação contra fabricação.

## Out of scope

- **Compra e venda de verdade** (`Game.market.deal()`, `createOrder()`) —
  próxima fase, quando o preço justo desta fase já tiver sido validado pelo
  usuário observando os números na prática. Fica como item next-up de
  `ROADMAP.md`'s "Later" (substituindo a entrada genérica "Market / terminal"
  já existente lá).
- **Taxas na conta do preço justo** (a taxa de 5% de `createOrder`, cobrada
  na criação e não devolvida no cancelamento; o custo de energia de
  transferência de `calcTransactionCost`/`deal()`, sempre pago por quem
  chama `deal()`, independente do tipo da ordem). Decisão explícita do
  usuário: qual taxa se aplica depende de qual dos dois papéis (criar ordem
  vs. preencher ordem de terceiro) a decisão de execução escolher — isso é
  uma propriedade da decisão de compra/venda (fase seguinte), não do preço
  de mercado em si (mesma separação "fair value" vs. "execution price" já
  levantada na pesquisa que embasou esta spec). O preço justo desta fase é
  sempre o preço de mercado bruto, sem taxa nenhuma embutida.
- **Detecção de manipulação, persistência de ordem, custo de produção
  (árvore `COMMODITIES`/`REACTIONS`), demanda derivada, bandas de
  confiança** — todo o resto do catálogo levantado na pesquisa prévia. Só
  entra numa fase futura se o preço justo desta fase se mostrar
  insuficiente na prática.
- **Histórico oficial `getHistory()` e transações próprias** — não entram no
  fair price temporal; o primeiro é considerado manipulável e o segundo não
  representa o mercado global.
- **Qualquer resourceType não presente em `RESOURCES_ALL`/
  `INTERSHARD_RESOURCES`** — não deveria existir, mas se a API devolver algo
  fora dessas listas (fail-soft: ignora, não lança).

## Acceptance criteria

1. O agrupamento de `getAllOrders()` por `resourceType` bate com um mock de
   ordens de recursos variados, incluindo pelo menos um `INTERSHARD_RESOURCES`
   (ex.: `pixel`) — `test/smoke.js`.
2. O throttle interno (`market.currentInterval`) só recalcula quando o
   intervalo configurado passou — `test/smoke.js`: duas chamadas no mesmo
   tick (ou dentro do intervalo) não disparam uma segunda leitura de
  `Game.market`.
3. Nenhuma chamada a `Game.market.deal()`/`createOrder()`/`cancelOrder()`
   existe em `utils/market.js` ou em qualquer código tocado por esta spec —
   checagem manual (grep) na revisão, já que é o próprio ponto da fase 0.
4. O comando de console novo imprime o resultado sem lançar, mesmo com
   `Game.market` ausente/incompleto (mock parcial) — `test/smoke.js`,
   mesmo padrão null-safe de `hauler.js`'s `terminalWithdrawable`.
5. `node --check` limpo nos arquivos tocados; `test/smoke.js` verde;
   `npx grunt` builda.
6. `Memory.stats.market.fairPrice` exporta `buyPrice`, `sellPrice`,
   `fairPrice`, `currentBuy`, `currentSell`, `sampleCount`,
   `windowCoverageTicks` e `confidence`.
7. `marketPrice(resourceType)` imprime todas as componentes do recurso; sem
  argumento, imprime somente itens com `fairPrice` não nulo.

## Constitution check

- **CPU (§1):** `getAllOrders()` sem filtro só roda quando o intervalo do
  snapshot vence (default 100), nunca por tick. O book é percorrido uma vez
  por ciclo e a janela temporal é mantida em heap.
- **Memory (§2):** snapshots compactos ficam no heap; `Memory.stats` recebe
  apenas o resultado temporal atual, sem ordens brutas.
- **Fail-soft (§3):** toda leitura de `Game.market`/`getAllOrders` é null-safe
  (mesmo padrão de `hauler.js`'s
  `terminalWithdrawable` guardando `Game.market` ausente) — um resultado
  vazio/parcial não lança, só produz um preço justo baseado em menos dado.
- **Testável offline (§4):** `test/smoke.js` mocka `Game.market.getAllOrders`
  e constantes do mercado para cobrir a janela temporal.
- **Config over hardcode (§6):** cadências e janela temporal ficam em
  `Memory.settings.market`/`utils/config.js` — nunca em literais espalhados.
- **Prefer the no-op (§7):** nenhum role/creep novo — puro cálculo em
  `utils/market.js`, chamado do loop do `main.js` como mais um `guard()`.
- **Spec before code (§8):** esta spec.

## Open questions

- O intervalo padrão é 3600 ticks, aproximadamente uma hora a 1 tick/segundo;
  pode ser reduzido temporariamente via `Memory.settings.market` durante
  debug sem alterar a fórmula.
- Nome exato do(s) comando(s) de console e o formato exato do resumo
  "mercado inteiro" (cabe no limite de linha do console do Screeps listando
  ~150 recursos? Provavelmente não — decidir paginação/filtro no `plan.md`).
- Risco aceito e documentado: a janela heap-only recomeça num global reset;
  a confiança permanece `warming` até cobrir a janela configurada.

## Decisions for phase 0

- O comando será `marketPrice(resourceType?)`. Com argumento, imprime o
  único `fairPrice` do recurso; sem argumento, imprime uma linha resumida por
  recurso que tenha pelo menos um dia de histórico com volume positivo. O
  resumo evita estourar o limite de linhas do console com recursos sem
  liquidez, mas inclui recursos de `INTERSHARD_RESOURCES` quando houver
  histórico ou book atual.
- O ciclo de scan publica o snapshot mais recente no heap do módulo. O
  comando nunca chama `Game.market` diretamente nem força um scan fora do
  throttle; antes do primeiro scan, informa que ainda não há dados.
- A mediana temporal usa pesos de volumetria do melhor nível, limitados a 1%
  por snapshot. Para o fair primário, cada midpoint é calculado antes da
  mediana; para commodity, o fair é o custo recursivo dos fairs dos insumos.
- O book atual atualiza a cada 100 ticks, separado da amostra temporal a cada
  3600 ticks. Para uma commodity, os preços de referência vêm da soma
  recursiva de `recipe.components`, dividida por `recipe.amount`; somente os
  campos `current*` ficam atrelados ao book próprio da commodity.
