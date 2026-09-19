# 0100 — Preço direto para ciclos de commodities

- **Status:** in-progress
- **Owner:** usuário + assistente
- **Created:** 2026-09-19

## Problem

`COMMODITIES` contém receitas reversíveis de compressão/descompressão para
recursos primários, como `energy` e `O`. `utils/market.js` tratava toda chave
desse mapa como produto derivável; ao detectar o ciclo, devolvia `null` e
sobrescrevia o preço temporal direto do recurso.

## Desired outcome

Recursos que participam de um ciclo de receita preservam `buyPrice`,
`sellPrice` e `fairPrice` temporais do book. Uma commodity cuja cadeia de
insumos é acíclica continua calculada pelo custo dos seus insumos, inclusive
quando um destes é um recurso primário cíclico.

## In scope

- Detectar participação do `resourceType` em ciclo no grafo de `COMMODITIES`.
- Usar a cotação temporal direta como folha para recursos cíclicos.
- Cobrir `energy`, `O` e uma commodity acíclica no smoke.

## Out of scope

- Alterar a janela temporal, o book atual ou as cadências de scan.
- Escolher custo derivado para commodities cuja cadeia acíclica tenha insumo
  sem preço suficiente.

## Acceptance criteria

1. Dadas receitas reversíveis para `energy` e `O`, o smoke mantém seus
   `buyPrice`, `sellPrice` e `fairPrice` temporais não nulos.
2. A commodity acíclica do mesmo cenário continua com custo derivado correto,
   usando o preço direto de `energy` como insumo.
3. `node --check`, `node test/smoke.js` e `npx grunt` passam.

## Constitution check

- **CPU:** a detecção percorre apenas o grafo estático `COMMODITIES` durante
  o scan throttled; não cria chamadas à API do jogo.
- **Memory:** memoização permanece no heap local ao scan; nada novo é
  serializado em `Memory`.
- **Fail-soft:** receita ausente ou malformada continua sem lançar.
- **Testável offline:** o smoke reproduz explicitamente ciclos reversíveis.
