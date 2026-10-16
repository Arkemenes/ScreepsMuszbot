# 0147 — Estado estacionário do planejamento — Plan

## Approach

Três camadas, em ordem de risco crescente, cada uma com deploy e medição
próprios para atribuir o ganho:

1. **Assinatura sem alocação** (risco baixo): `activeLabs` e `labSlots.resolve`
   comparam ids/posições/flags por laço contra a assinatura guardada, sem
   construir strings. Semântica idêntica; o teste compara com a implementação
   de referência mantida em `test/`.
2. **Probes** (risco baixo, só leitura): contador de "mesma assinatura que a
   chamada anterior" para `assignments` e `listResidual`, no heap. Publicado
   no `cpuTop`. Decide a camada 3 com dado.
3. **Cache de decisão por assinatura** (risco médio, condicional ao probe):
   `assignments` e o caminho ocioso de `listResidual`. A referência permanece
   em `test/` como oráculo; modo sombra live só para a parte pura (assinatura
   → decisão), com o orçamento do 0145.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/probe.js` | `hit(name, signature)` / `snapshot()`: contador heap de repetição de assinatura por nome, com tamanho fixo |
| `test/steadyStateCases.js` | oráculo de resolve/activeLabs e dos probes |

### Changed

| Path | Change |
|------|--------|
| `src/utils/labPolicyRuntime.js` | `activeLabs` com assinatura sem alocação; probe em `assignments` |
| `src/utils/labSlots.js` | `resolve` compara ids sem `map/sort/join` |
| `src/utils/terminalOps.js` | probe no início de `listResidual` |
| `src/main.js` | `printCpuTop` imprime hit-rates |

## Data shapes

Heap: `probe` = `{ [name]: { calls, same, last } }` (`last` é uma string curta
ou hash numérico da assinatura). Nada em Memory.

## How it satisfies the constitution

- **CPU:** substitui construção de string por comparação; probe é O(entradas).
- **Memory:** nada novo.
- **Fail-soft:** probe dentro de `try/catch`; erro desliga o probe, não a decisão.
- **Offline test:** oráculo com mundos 3/6/10 labs e mutações.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Assinatura nova ignora uma entrada que a velha considerava | teste de mutação campo a campo (id, x, y, my, owner, controller.level) |
| Probe distorce a medição | custo medido e registrado; probe amostra por assinatura curta |
| Cache de decisão congela uma decisão | só após probe; assinatura inclui tudo que a decisão lê; nunca TTL |
