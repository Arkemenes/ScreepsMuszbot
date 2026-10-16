# 0147 — Estado estacionário do planejamento (labs, craft, terminalOps)

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15

## Problem

Medição `cpuTop` 2026-10-15 15:21 (96 intervalos pós-deploy, 5 salas, 3 cadeias
XLH2O `working`, 14 listings sem eventos). Custos recorrentes que não produzem
decisão nova na maior parte dos ticks:

| Span | CPU/tick | Chamadas/tick | Por chamada |
|---|---:|---:|---:|
| `craft.chains` | 0,96 | 1,0 | |
| `craft.startItem` | 0,74 | 2,1 | 0,35 |
| `labPolicy.assignments` | 0,36 | 2,0 | 0,18 |
| `labPolicy.resolve` | 0,145 | 2,0 | 0,07 |
| `labPolicy.confirm` | 0,07 | 2,0 | 0,04 |
| `terminalOps.op sell:listed` | 0,47 | 2,6 | 0,18 |
| `hauler.terminalFuel` | 0,42 | 2,8 | 0,15 |
| `hauler.stockPolicy` | 0,49 | 2,8 | 0,18 |

Evidência de código (lida em 2026-10-15):

- `startItem` em cadeia de política chama `labPolicyRuntime.tick` todo tick:
  `resolve` + `profile` + `confirm` + `assignments`. Quase todo o custo de
  `startItem` (0,74) é essa chamada; a parte própria é ~0,09.
- `labPolicyRuntime.activeLabs` já cacheia por assinatura, mas **monta a
  assinatura com `JSON.stringify` de todos os labs a cada chamada**;
  `labSlots.resolve` também monta `map/sort/join` de ids a cada chamada.
  Custo de alocação e string, não de decisão.
- `assignments` recalcula layout/razões/`labReactions` por tick a partir de
  estado que muda (cooldown, store). Se a decisão é igual na maioria dos ticks
  é **desconhecido**: precisa de probe antes de qualquer cache.
- `listResidual` (listings `sell:listed`) roda a cada `terminalOps.tickInterval`
  (5) por operação: checagem de estoque no terminal, `swingTrade.reference`,
  `candidateOrders`, janela de reprice. Sem evento, o resultado é "nada a fazer".

## Desired outcome

O mesmo comportamento de produção, listagem, reprice, claims e reações, com
menos CPU no regime em que nada mudou. Nenhuma cadência de jogo muda (reprice,
confirmação de reação, cooldown, `tickInterval`).

## In scope

1. **Probes** (heap, sem mudar decisão): para `labPolicy.assignments` e
   `listResidual`, contar por janela quantas chamadas teriam o mesmo resultado
   da anterior (assinatura de entradas igual) e publicar o hit-rate em
   `cpuTop`/meter. Sem probe, nenhum cache de decisão entra.
2. `labPolicy.resolve`/`activeLabs`/`labSlots.resolve`: assinatura sem
   alocação (comparação de ids/posições/flags por laço, sem `JSON.stringify`,
   `sort` ou `join`), mesma semântica.
3. Cache de decisão por assinatura **só onde o probe provar hit-rate alto** e
   onde a referência for pura: `assignments` e o caminho ocioso de
   `sell:listed`. Assinatura inclui tudo que a decisão lê (estoque,
   cooldown, preço/ordem viva, versão do mercado, config, desired/phase).
4. **Índice do livro de ordens por recurso** (`orderBook.byResource`): o scan do
   `swingTrade` (a cada `swing.scanInterval` = 120 ticks) passava o livro inteiro a
   cada cotação e cada cotação o filtrava por recurso: ~30 CPU por scan (pico de
   25–33 numa única chamada, vista em 3 de 5 janelas de `cpuTop`; ~0,25 CPU/tick
   de média). O índice entrega o mesmo conjunto, na mesma ordem relativa.
5. Spans temporários `claims.reserve.{ops,orders,craft}` em `physicalReservations`
   (desligam com `claimsSpans(false)`) para localizar o custo de cada listing.
6. Equivalência: oráculo offline (`test/equivalence/compare.js`) compara a
   implementação de referência com a candidata em mundos de 3/6/10 labs e
   0/5/20 listings, incluindo mutação entre ticks.

## Out of scope

- Mudar `tickInterval`, janela de reprice, `craft.policyReplanTicks`, ordem de
  prioridade das operações.
- `hauler.terminalFuel`/`stockPolicy` (spec própria depois; dependem do índice
  por sala de 0138/P1).
- Qualquer cache por TTL de saldo, preço ou estoque.

## Acceptance criteria

1. The smoke test asserts the allocation-free lab signature gives the same `resolve()` result as the reference for 3/6/10 labs, including a lab replaced, moved, unowned, and a controller level change.
2. The smoke test asserts the probes only count and never alter the decision (same outputs with the probe on/off).
3. After the probe deploy, `cpuTop` shows the hit-rate of `assignments` and `sell:listed`; a decision cache is only implemented where the rate is documented in the Notes.
4. The smoke/oracle asserts cached and reference decisions are identical (reactions, holds, desired, reasons; listing price/amount/fee/intents) across mutation between ticks (store change, cooldown flip, order filled, price move, config change, reset).
5. Paired CPU (`warmUsed`) after the package is lower than the 0145 baseline, in a comparable workload; no change in XLH2O production per cycle, orders opened/priced, credits, claims.

## Constitution check

Heap para assinaturas e contadores; nenhuma Memory nova por tick; caches com
tamanho limitado e invalidação por mudança de entrada, nunca TTL cego; cada
chamada continua sob `guard()`.

## Open questions

- Qual o hit-rate real de `assignments` com 10 labs em produção contínua
  (cooldown de 5–10 ticks por lab)? Decide se vale cache ou só otimização local.
