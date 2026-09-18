# 0096 — Market fair-price engine — Plan

Derivado de `spec.md`. A fase 0 apenas observa o mercado e publica um snapshot
calculado em heap; nenhum caminho de execução de ordens será introduzido.

## Approach

`utils/market.js` reúne o universo nativo de recursos, lê uma vez o book completo
quando o intervalo vence, captura o melhor nível de cada lado e mantém uma
janela temporal compacta por `resourceType`. A mediana ponderada dos snapshots
produz `buyPrice`/`sellPrice`, e a mediana dos midpoints por snapshot produz
um único `fairPrice` quando ambos os lados existem. O topo atual do book atualiza a cada 100 ticks, sem
criar uma amostra temporal nova; commodities substituem os preços de referência
pela soma recursiva dos insumos por unidade produzida. O módulo
mantém o último snapshot e o tick do scan em variáveis de módulo, permitindo que
o loop apenas atualize o dado no ritmo configurado e que o console leia sem
chamadas caras adicionais.

O loop chama `market.scan()` dentro de `guard("market", ...)`. O comando
`marketPrice(resourceType?)` vive em `utils/market.js`, mas é registrado por
efeito colateral ao carregar `utils/index.js`; ele exibe JSON compacto para um
recurso e um resumo filtrado por volume quando não recebe argumento. Todas as
leituras e formatações são tolerantes a constantes, métodos ou respostas
parciais ausentes.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/market.js` | Universo, agrupamento, histórico ponderado, VWAP, throttle, snapshot e comando `marketPrice`. |
| `specs/features/0096-market-fair-price-engine/plan.md` | Decisões técnicas da fase. |
| `specs/features/0096-market-fair-price-engine/tasks.md` | Sequência verificável de implementação. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/index.js` | Exporta o módulo de mercado. |
| `src/main.js` | Executa o scan throttled sob `guard`. |
| `src/utils/config.js` | Configura cadências atual/temporal e teto de peso. |
| `src/utils/console.js` | Documenta `marketPrice(resourceType?)` em Mercado. |
| `src/utils/stats.js` | Copia o snapshot esparso para `Memory.stats.market.fairPrice`. |
| `test/smoke.js` | Mocka o mercado e cobre cálculo, agrupamento, throttle e console. |
| `specs/ROADMAP.md` | Registra o item 0096 como concluído. |

## Data shapes

- Heap do módulo: `lastScanTick` e `lastSnapshot`.
- Snapshot heap: `{ tick, buyPrice, buyVolume, sellPrice, sellVolume }` por
  recurso, em uma janela circular de 604800 ticks.
- `Memory.stats.market.fairPrice`: `{ buyPrice, sellPrice, fairPrice,
  currentBuy, currentSell, sampleCount,
  windowCoverageTicks, confidence }`.
- `Memory.stats.market.fairPrice`: mapa esparso por resource type com os
  campos numéricos do snapshot; recursos sem volume positivo são omitidos.
- Config: `market.scanInterval` (100), `market.vwapDepthPercentLow` (0.01) e
  `market.vwapDepthPercentHigh` (0.1).

## How it satisfies the constitution

- **CPU:** `getAllOrders()` é executado a cada 100 ticks para as cotações
  atuais; a amostra temporal e a mediana só mudam a cada 3600 ticks.
- **Memory:** cálculo e timestamp ficam no heap; apenas o snapshot numérico
  esparso necessário ao Grafana é serializado em `Memory.stats`.
- **Fail-soft:** métodos ausentes, constantes incompletas, ordens inválidas e
  histórico parcial viram dados vazios; o loop ainda tem `guard`.
- **Offline test:** o smoke injeta `RESOURCES_ALL`, `INTERSHARD_RESOURCES`,
  `ORDER_BUY`/`ORDER_SELL` e um `Game.market` com contadores de chamadas.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `getAllOrders()` pode custar mais CPU que o esperado | Uma chamada é throttled e o custo fica explícito para profiling posterior. |
| Book manipulado ou sem liquidez | Histórico ponderado é exibido junto dos dois VWAPs; nenhuma decisão automática é tomada. |
| API ausente em shard/teste | Guardas locais retornam snapshot vazio e o console não lança. |

## Rollback

Remover a chamada `market.scan()` de `src/main.js` desliga a coleta; o módulo
continua inerte e pode ser removido junto com suas assertions sem tocar roles ou
Memory persistente.