# 0099 — Limpeza do cálculo temporal de fair price

- **Status:** in-progress
- **Owner:** usuário + assistente
- **Created:** 2026-09-19

## Problem

`src/utils/market.js` ainda expunha helpers de histórico oficial e VWAP que
não participam do algoritmo temporal ativo. Seus defaults, assertions e textos
de console/spec tornavam a fórmula vigente ambígua.

## Desired outcome

O módulo expõe apenas a API usada pelo cálculo temporal atual: snapshots do
topo BUY/SELL, medianas ponderadas por snapshot e derivação de commodities.
Nenhum default, teste ou help sugere que VWAP ou `getHistory()` participem do
fair price.

## In scope

- Remover helpers/exportações VWAP e histórico mortos de `utils/market.js`.
- Remover os defaults de configuração sem consumidor.
- Substituir assertions e documentação legadas pelo contrato temporal ativo.

## Out of scope

- Alterar a fórmula temporal, cadências ou derivação de commodities.
- Criar operações de mercado.

## Acceptance criteria

1. `market.js` não exporta `historyMetrics`, `vwap`, `vwapDepths` ou o helper
   legado `fairPrice`; o smoke testa esse contrato.
2. Não há uso de `vwapDepthPercentLow`/`vwapDepthPercentHigh` em `src/`,
   `test/` ou na documentação da feature 0096.
3. O smoke continua cobrindo a mediana temporal, midpoint por snapshot,
   throttle, exportação Grafana e commodities.
4. `node --check`, smoke e `npx grunt` terminam limpos.

## Constitution check

- **CPU/Memory:** a janela heap-only e a cadência não mudam.
- **Fail-soft:** a superfície removida não era chamada; os guards de mercado
  permanecem intactos.
- **Testável offline:** o smoke passa a verificar a ausência das APIs mortas
  junto ao comportamento temporal que permanece.

## Open questions

- O build precisa rodar sob um Node compatível com `grunt@1.0.1`, ou a feature
  0011 precisa modernizar essa dependência: no Node 24 instalado,
  `grunt-legacy-util` chama o removido `util.isError`.
