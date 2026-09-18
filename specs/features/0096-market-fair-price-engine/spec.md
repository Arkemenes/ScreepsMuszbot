# 0096 — Market fair-price engine (fase 0: só cálculo, sem compra/venda)

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-18

## Problem

O bot não tem noção nenhuma de "preço justo" de mercado hoje — nenhum código
em `src/` chama `Game.market.getHistory()`, `getAllOrders()` ou `deal()`
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
- Uma chamada `Game.market.getHistory()` **sem argumento** por ciclo (a API
  devolve histórico de todos os recursos de uma vez — mais barato que uma
  chamada por recurso).
- Uma chamada `Game.market.getAllOrders()` **sem filtro** por ciclo, agrupada
  por `resourceType` no lado do JS (a alternativa — uma chamada filtrada por
  recurso, ~150+ chamadas — foi descartada por hipótese mas não medida; ver
  Open questions).
- Throttle interno (`config.get("market.scanInterval", 100)`, o próprio
  módulo decide quando recalcular, mesmo idioma de `planScanDue()` do
  [0079-adjacente] `rooms/architect.js`/`structures/observer.js` desta mesma
  sessão) — nunca roda todo tick.
- Fórmula do preço justo, por recurso:
  - **Histórico ponderado por volume**: `Σ(avgPrice_i × volume_i) / Σ(volume_i)`
    sobre os até 14 dias que `getHistory()` devolve — um dia com pouquíssimas
    transações pesa proporcionalmente menos que um dia líquido, sem inventar
    um segundo eixo de "confiança" ainda.
  - **VWAP do book em duas profundidades relativas ao volume do próprio
    recurso** (não um número fixo de unidades — 1.000 unidades é irrelevante
    pra energia, que negocia em ordens de até ~750.000, e pode ser gigante
    pra Power): a profundidade é uma fração do volume diário médio do
    recurso (`getHistory()`'s `volume`) — por exemplo 1% e 10% desse volume
    — computada tanto pro lado `sell` (quanto custaria comprar essa fatia)
    quanto pro lado `buy` (quanto renderia vender essa fatia).
  - Nenhuma detecção de manipulação, persistência de ordem, ou custo de
    produção ainda — ver Out of scope.
- Console: um comando novo (nome exato a decidir no `plan.md`) que imprime,
  para um `resourceType`, o histórico ponderado, o VWAP das duas
  profundidades (`sell` e `buy`), e os dados brutos usados (melhor
  sell/buy, volume do dia). Sem argumento, lista um resumo de todo o
  mercado (ou os recursos com volume > 0 — a decidir no `plan.md`, dado o
  limite de linha do console do Screeps).
- `src/utils/console.js` — nova seção "Mercado" com o(s) comando(s) novo(s).
- `Memory.stats.market.fairPrice` — snapshot esparso dos recursos com volume,
  para consumo pelo exporter/Grafana; não contém objetos do jogo.

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
- **Histórico próprio de snapshots** (a ideia mais forte da pesquisa prévia
  pra robustez contra manipulação) — decisão
  explícita do usuário: começar só com `getHistory()` (14 dias oficiais,
  zero infraestrutura nova), aceitando a divergência que isso pode causar
  frente a um histórico mais longo/granular. Documentado como risco
  conhecido abaixo, não um gap silencioso.
- **Detecção de manipulação, persistência de ordem, custo de produção
  (árvore `COMMODITIES`/`REACTIONS`), demanda derivada, bandas de
  confiança** — todo o resto do catálogo levantado na pesquisa prévia. Só
  entra numa fase futura se o preço justo desta fase se mostrar
  insuficiente na prática.
- **Transações de mercado/terminal em `Memory.stats`** — continuam fora de
  escopo porque o bot não executa `deal()`/`terminal.send()`. O snapshot
  observacional de preço justo em `Memory.stats.market.fairPrice` é a exceção
  adicionada para alimentar o Grafana sem instrumentar execução.
- **Qualquer resourceType não presente em `RESOURCES_ALL`/
  `INTERSHARD_RESOURCES`** — não deveria existir, mas se a API devolver algo
  fora dessas listas (fail-soft: ignora, não lança).

## Acceptance criteria

1. `utils/market.js`'s função de histórico ponderado por volume produz o
   valor esperado dado um mock de `getHistory()` com dias de volume
   desigual (um dia de volume alto puxa a média mais que um dia de volume
   baixo) — `test/smoke.js`.
2. A função de profundidade do VWAP calcula quantidade-alvo como fração do
   volume diário do próprio recurso (não um número fixo), dado dois mocks
   com volumes diários bem diferentes — `test/smoke.js`: a profundidade em
   unidades absolutas difere entre os dois casos.
3. O agrupamento de `getAllOrders()` por `resourceType` bate com um mock de
   ordens de recursos variados, incluindo pelo menos um `INTERSHARD_RESOURCES`
   (ex.: `pixel`) — `test/smoke.js`.
4. O throttle interno (`market.scanInterval`) só recalcula quando o
   intervalo configurado passou — `test/smoke.js`: duas chamadas no mesmo
   tick (ou dentro do intervalo) não disparam uma segunda leitura de
   `Game.market`.
5. Nenhuma chamada a `Game.market.deal()`/`createOrder()`/`cancelOrder()`
   existe em `utils/market.js` ou em qualquer código tocado por esta spec —
   checagem manual (grep) na revisão, já que é o próprio ponto da fase 0.
6. O comando de console novo imprime o resultado sem lançar, mesmo com
   `Game.market` ausente/incompleto (mock parcial) — `test/smoke.js`,
   mesmo padrão null-safe de `hauler.js`'s `terminalWithdrawable`.
7. `node --check` limpo nos arquivos tocados; `test/smoke.js` verde;
   `npx grunt` builda.
8. `Memory.stats.market.fairPrice` exporta os valores do snapshot para cada
  recurso com volume positivo, sem lançar quando o snapshot ainda não existe
  — `test/smoke.js`.

## Constitution check

- **CPU (§1):** a chamada a `Game.market` mais cara (`getAllOrders()` sem
  filtro, documentada como `// slow` pela própria Screeps) só roda a cada
  `market.scanInterval` ticks (default 100), nunca por tick — mesmo
  princípio de throttle que `rooms/architect.js`'s scan de canteiros e
  `structures/observer.js`'s exploração já usam (implementados na mesma
  sessão). Medir com `profile()` antes de considerar a spec fechada de
  verdade (o "measure before optimizing" do princípio já é hábito deste
  projeto).
- **Memory (§2):** o cálculo continua no heap e o snapshot é copiado de forma
  esparsa para `Memory.stats.market.fairPrice` apenas porque o Grafana precisa
  de uma série persistida; só números e strings de resource type são gravados,
  nunca objetos do jogo. O timestamp de coleta permanece no heap.
- **Fail-soft (§3):** toda leitura de `Game.market`/`getHistory`/
  `getAllOrders` é null-safe (mesmo padrão de `hauler.js`'s
  `terminalWithdrawable` guardando `Game.market` ausente) — um resultado
  vazio/parcial não lança, só produz um preço justo baseado em menos dado.
- **Testável offline (§4):** `test/smoke.js` precisa de um mock de
  `Game.market.getHistory`/`getAllOrders` — não existe ainda no harness,
  entra como parte desta feature.
- **Config over hardcode (§6):** `market.scanInterval` (100),
  `market.vwapDepthPercentLow`/`vwapDepthPercentHigh` (1%/10%) via
  `utils/config.js` — nunca literais espalhados.
- **Prefer the no-op (§7):** nenhum role/creep novo — puro cálculo em
  `utils/market.js`, chamado do loop do `main.js` como mais um `guard()`.
- **Spec before code (§8):** esta spec.

## Open questions

- `getAllOrders()` sem filtro vs. uma chamada filtrada por recurso (~150+
  chamadas) — decidido por hipótese ("uma chamada tende a ser mais barata
  que 150"), não por medição. Resolver com `profile()` assim que a
  implementação rodar em produção; se a hipótese estiver errada, trocar a
  estratégia é uma mudança isolada dentro de `utils/market.js`.
- Nome exato do(s) comando(s) de console e o formato exato do resumo
  "mercado inteiro" (cabe no limite de linha do console do Screeps listando
  ~150 recursos? Provavelmente não — decidir paginação/filtro no `plan.md`).
- Risco aceito e documentado: `getHistory()` (14 dias agregados, sem trade
  individual) pode divergir de um histórico próprio mais granular — aceito
  nesta fase, revisitar se a fase de compra/venda mostrar decisões ruins
  rastreáveis a essa limitação.

## Decisions for phase 0

- O comando será `marketPrice(resourceType?)`. Com argumento, imprime o
  snapshot completo do recurso; sem argumento, imprime uma linha resumida por
  recurso que tenha pelo menos um dia de histórico com volume positivo. O
  resumo evita estourar o limite de linhas do console com recursos sem
  liquidez, mas inclui recursos de `INTERSHARD_RESOURCES` quando houver dado.
- O ciclo de scan publica o snapshot mais recente no heap do módulo. O
  comando nunca chama `Game.market` diretamente nem força um scan fora do
  throttle; antes do primeiro scan, informa que ainda não há dados.
- Para o VWAP, o volume diário médio é a média aritmética dos dias válidos do
  histórico (volume numérico e maior que zero). A profundidade-alvo é essa
  média multiplicada por cada percentual configurado. Ordens são consumidas
  por preço (sell ascendente, buy descendente), com a última ordem parcial.
