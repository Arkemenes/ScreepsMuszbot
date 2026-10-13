# Comparação ampliada de labs — ARK-99

Data: 2026-10-11. Pesquisa offline; runtime e configurações do jogo preservados.

## Resultado

A regra de dois labs de entrada e todas as demais saídas é uma referência forte, mas não resolve todos os cenários. Reutilizar labs em cooldown como entradas e escolher novas saídas pode melhorar RCL6/7; pipelines parciais e buffers locais podem compensar transporte limitado. A estratégia deve minimizar tempo até o lote final, incluindo logística e trocas.

Matriz completa: **1.950 cenários**, dez compostos, três RCLs, cinco lotes e treze regimes de logística. Foram reexecutados 119.704 candidatos/referências; não são todos os escalonamentos possíveis.

Vencedores por classe: hybrid=1.408, wide=328, waves=91, pipeline=123. Classes identificam a origem do plano: híbrido inclui reutilização adaptativa, pipelines parciais e referências modificadas. Empates são resolvidos por movimento, trocas e identificador determinístico.

Referências indisponíveis: 390 cenários de XGH2O/XGHO2 não têm plano de ondas: o planejador existente retorna `no-phase-plan` nos três RCLs. O modo largo está presente em todos os cenários. A melhor referência usa apenas planos disponíveis; ausência de ondas não significa derrota simulada.

## Lotes de 3.000, transporte instantâneo

Tempo da melhor referência → melhor candidato, em ticks. Referências incluem ondas, largo e o pipeline completo conhecido quando aplicável.

| Produto | RCL6: 3 labs | RCL7: 6 labs | RCL8: 10 labs |
|---|---:|---:|---:|
| XUH2O | 56.918 → **18.973** (beam-adaptive) | 14.191 → **11.880** (beam) | 7.066 → **7.066** (beam-adaptive) |
| XUHO2 | 56.918 → **18.973** (beam-adaptive) | 14.191 → **11.880** (beam) | 7.066 → **6.995** (beam-adaptive) |
| XKH2O | 56.918 → **18.973** (beam-adaptive) | 14.191 → **11.456** (beam) | 7.066 → **7.066** (beam-adaptive) |
| XKHO2 | 56.918 → **18.973** (beam-adaptive) | 14.191 → **11.456** (beam) | 7.066 → **7.066** (beam-adaptive) |
| XLH2O | 65.908 → **21.971** (beam-adaptive) | 16.436 → **13.366** (beam-adaptive) | 8.186 → **8.186** (beam-adaptive) |
| XLHO2 | 56.918 → **18.973** (beam-adaptive) | 14.191 → **11.456** (beam) | 7.066 → **7.066** (wide-reassign) |
| XZH2O | 143.783 → **47.903** (beam-adaptive) | 35.841 → **29.881** (beam) | 17.841 → **17.841** (beam-adaptive) |
| XZHO2 | 56.918 → **18.973** (beam-adaptive) | 14.191 → **11.880** (beam) | 7.066 → **6.995** (beam-adaptive) |
| XGH2O | 83.921 → **27.963** (beam-adaptive) | 20.921 → **14.548** (beam-adaptive) | 10.421 → **9.026** (beam-adaptive) |
| XGHO2 | 134.851 → **44.915** (beam-adaptive) | 33.601 → **26.891** (beam-adaptive) | 16.726 → **14.886** (beam-adaptive) |

## Limites inferiores: quanto ainda poderia melhorar

Além da busca, há um limite válido para qualquer escalonamento deste modelo: `ceil(W/N) - maxCooldown + 1`, em que W é a soma de trabalho em cooldown de todas as reações e N o número de labs. Os intervalos de cooldown de cada lab não se sobrepõem; só suas caudas após a conclusão podem ficar fora do tempo medido. Esse limite permite labs em cooldown como entradas e mudanças arbitrárias de papel.

Com transporte finito, também vale `ceil((matérias-primas + produto final)/B)`. É um limite otimista, não um cronograma executável, e não inclui viagens ou barreiras. A diferença entre melhor resultado e limite inferior é um teto para a melhoria ainda possível, não prova de que ela existe.

| XLH2O, lote 3.000 | Limite inferior | Melhor encontrado | Melhoria restante, no máximo |
|---|---:|---:|---:|
| RCL6, logística instantânea | 21.936 | 21.971 | 35 ticks |
| RCL7, logística instantânea | 10.936 | 13.366 | 2.430 ticks |
| RCL8, logística instantânea | 6.536 | 8.186 | 1.650 ticks |

## XLH2O em RCL8: transporte e troca

B é o limite agregado de unidades carregadas/drenadas por tick nas interfaces dos labs. D é o atraso por lab ao mudar de papel, após dreno; mudanças podem ocorrer em paralelo. Não são tempos de viagem de creeps.

| B | D | Referência: ticks | Vencedor: ticks | Plano | Movimento | Pico de labs em dupla função |
|---:|---:|---:|---:|---|---:|---:|
| ∞ | 0 | 8.186 | **8.186** | beam-adaptive | 36.000 | 0 |
| 2 | 0 | 13.028 | **12.624** | pipeline-known-reassign | 18.000 | 3 |
| 2 | 50 | 13.028 | **12.638** | pipeline-known-reassign | 18.000 | 3 |
| 2 | 200 | 13.028 | **12.696** | pipeline-known-reassign | 18.000 | 3 |
| 4 | 0 | 11.592 | **10.724** | beam-adaptive | 32.750 | 0 |
| 4 | 50 | 11.737 | **10.923** | beam-adaptive | 32.710 | 0 |
| 4 | 200 | 12.187 | **11.258** | beam-adaptive | 32.780 | 0 |
| 8 | 0 | 8.597 | **8.597** | wide | 36.000 | 0 |
| 8 | 50 | 8.745 | **8.745** | wide | 36.000 | 0 |
| 8 | 200 | 9.195 | **9.195** | wide | 36.000 | 0 |
| 16 | 0 | 8.194 | **8.194** | wide | 36.000 | 0 |
| 16 | 50 | 8.323 | **8.323** | wide | 36.000 | 0 |
| 16 | 200 | 8.773 | **8.773** | wide | 36.000 | 0 |

## Comparação por produto, RCL e lote

Estas tabelas usam logística instantânea. Todos os 1.800 cenários de logística limitada estão no CSV, junto das 150 referências de logística instantânea.

### XUH2O

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 13 | 8 | exact |
| 6 | 20 | 298 | 71 | exact |
| 6 | 100 | 1.818 | 606 | beam-adaptive |
| 6 | 500 | 9.418 | 3.139 | beam-adaptive |
| 6 | 3.000 | 56.918 | 18.973 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves |
| 7 | 20 | 36 | 32 | beam |
| 7 | 100 | 416 | 353 | beam |
| 7 | 500 | 2.316 | 1.943 | beam |
| 7 | 3.000 | 14.191 | 11.880 | beam |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 16 | 16 | wide |
| 8 | 100 | 207 | 207 | wide-reassign |
| 8 | 500 | 1.157 | 1.157 | wide |
| 8 | 3.000 | 7.066 | 7.066 | beam-adaptive |

### XUHO2

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 13 | 8 | exact |
| 6 | 20 | 298 | 71 | exact |
| 6 | 100 | 1.818 | 606 | beam-adaptive |
| 6 | 500 | 9.418 | 3.139 | beam-adaptive |
| 6 | 3.000 | 56.918 | 18.973 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves-reassign |
| 7 | 20 | 36 | 32 | beam |
| 7 | 100 | 416 | 353 | beam |
| 7 | 500 | 2.316 | 1.943 | beam |
| 7 | 3.000 | 14.191 | 11.880 | beam |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 16 | 16 | wide |
| 8 | 100 | 207 | 207 | wide |
| 8 | 500 | 1.157 | 1.157 | wide |
| 8 | 3.000 | 7.066 | 6.995 | beam-adaptive |

### XKH2O

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 13 | 8 | exact |
| 6 | 20 | 298 | 71 | exact |
| 6 | 100 | 1.818 | 606 | beam-adaptive |
| 6 | 500 | 9.418 | 3.139 | beam-adaptive |
| 6 | 3.000 | 56.918 | 18.973 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves-reassign |
| 7 | 20 | 36 | 31 | beam-adaptive |
| 7 | 100 | 416 | 342 | beam |
| 7 | 500 | 2.316 | 1.873 | beam |
| 7 | 3.000 | 14.191 | 11.456 | beam |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 16 | 16 | wide |
| 8 | 100 | 207 | 207 | wide-reassign |
| 8 | 500 | 1.157 | 1.157 | wide-reassign |
| 8 | 3.000 | 7.066 | 7.066 | beam-adaptive |

### XKHO2

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 13 | 8 | exact |
| 6 | 20 | 298 | 71 | exact |
| 6 | 100 | 1.818 | 606 | beam-adaptive |
| 6 | 500 | 9.418 | 3.139 | beam-adaptive |
| 6 | 3.000 | 56.918 | 18.973 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves-reassign |
| 7 | 20 | 36 | 31 | beam |
| 7 | 100 | 416 | 342 | beam |
| 7 | 500 | 2.316 | 1.873 | beam |
| 7 | 3.000 | 14.191 | 11.456 | beam |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 16 | 16 | wide-reassign |
| 8 | 100 | 207 | 207 | wide-reassign |
| 8 | 500 | 1.157 | 1.157 | wide |
| 8 | 3.000 | 7.066 | 7.066 | beam-adaptive |

### XLH2O

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 18 | 13 | exact |
| 6 | 20 | 348 | 86 | exact |
| 6 | 100 | 2.108 | 704 | beam-adaptive |
| 6 | 500 | 10.908 | 3.638 | beam-adaptive |
| 6 | 3.000 | 65.908 | 21.971 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves-reassign |
| 7 | 20 | 46 | 46 | beam |
| 7 | 100 | 486 | 416 | beam |
| 7 | 500 | 2.686 | 2.216 | beam-adaptive |
| 7 | 3.000 | 16.436 | 13.366 | beam-adaptive |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 22 | 22 | wide |
| 8 | 100 | 242 | 242 | beam-adaptive |
| 8 | 500 | 1.342 | 1.342 | beam-adaptive |
| 8 | 3.000 | 8.186 | 8.186 | beam-adaptive |

### XLHO2

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 13 | 8 | exact |
| 6 | 20 | 298 | 71 | exact |
| 6 | 100 | 1.818 | 606 | beam-adaptive |
| 6 | 500 | 9.418 | 3.139 | beam-adaptive |
| 6 | 3.000 | 56.918 | 18.973 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves |
| 7 | 20 | 36 | 31 | beam |
| 7 | 100 | 416 | 342 | beam |
| 7 | 500 | 2.316 | 1.873 | beam |
| 7 | 3.000 | 14.191 | 11.456 | beam |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 16 | 16 | wide-reassign |
| 8 | 100 | 207 | 207 | wide-reassign |
| 8 | 500 | 1.157 | 1.157 | wide |
| 8 | 3.000 | 7.066 | 7.066 | wide-reassign |

### XZH2O

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 23 | 21 | beam-adaptive |
| 6 | 20 | 743 | 181 | exact |
| 6 | 100 | 4.583 | 1.503 | beam-adaptive |
| 6 | 500 | 23.783 | 7.903 | beam-adaptive |
| 6 | 3.000 | 143.783 | 47.903 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves |
| 7 | 20 | 81 | 81 | beam |
| 7 | 100 | 1.041 | 881 | beam |
| 7 | 500 | 5.841 | 4.881 | beam |
| 7 | 3.000 | 35.841 | 29.881 | beam |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 22 | 22 | wide |
| 8 | 100 | 502 | 502 | wide-reassign |
| 8 | 500 | 2.902 | 2.902 | wide |
| 8 | 3.000 | 17.841 | 17.841 | beam-adaptive |

### XZHO2

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 13 | 8 | exact |
| 6 | 20 | 298 | 71 | exact |
| 6 | 100 | 1.818 | 606 | beam-adaptive |
| 6 | 500 | 9.418 | 3.139 | beam-adaptive |
| 6 | 3.000 | 56.918 | 18.973 | beam-adaptive |
| 7 | 5 | 3 | 3 | waves |
| 7 | 20 | 36 | 32 | beam |
| 7 | 100 | 416 | 353 | beam |
| 7 | 500 | 2.316 | 1.943 | beam |
| 7 | 3.000 | 14.191 | 11.880 | beam |
| 8 | 5 | 3 | 3 | beam |
| 8 | 20 | 16 | 16 | wide |
| 8 | 100 | 207 | 207 | wide-reassign |
| 8 | 500 | 1.157 | 1.157 | wide |
| 8 | 3.000 | 7.066 | 6.995 | beam-adaptive |

### XGH2O

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 61 | 16 | exact |
| 6 | 20 | 481 | 150 | beam-adaptive |
| 6 | 100 | 2.721 | 896 | beam-adaptive |
| 6 | 500 | 13.921 | 4.630 | beam-adaptive |
| 6 | 3.000 | 83.921 | 27.963 | beam-adaptive |
| 7 | 5 | 8 | 8 | beam-adaptive |
| 7 | 20 | 61 | 56 | beam-adaptive |
| 7 | 100 | 621 | 483 | beam-adaptive |
| 7 | 500 | 3.421 | 2.423 | beam-adaptive |
| 7 | 3.000 | 20.921 | 14.548 | beam-adaptive |
| 8 | 5 | 7 | 7 | wide |
| 8 | 20 | 31 | 31 | beam-adaptive |
| 8 | 100 | 311 | 298 | beam-adaptive |
| 8 | 500 | 1.711 | 1.527 | beam-adaptive |
| 8 | 3.000 | 10.421 | 9.026 | beam-adaptive |

### XGHO2

| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |
|---:|---:|---:|---:|---|
| 6 | 5 | 76 | 16 | exact |
| 6 | 20 | 751 | 215 | beam-adaptive |
| 6 | 100 | 4.351 | 1.415 | beam-adaptive |
| 6 | 500 | 22.351 | 7.415 | beam-adaptive |
| 6 | 3.000 | 134.851 | 44.915 | beam-adaptive |
| 7 | 5 | 8 | 8 | wide-reassign |
| 7 | 20 | 76 | 71 | beam-adaptive |
| 7 | 100 | 976 | 791 | beam-adaptive |
| 7 | 500 | 5.476 | 4.391 | beam-adaptive |
| 7 | 3.000 | 33.601 | 26.891 | beam-adaptive |
| 8 | 5 | 7 | 7 | wide |
| 8 | 20 | 31 | 31 | wide |
| 8 | 100 | 481 | 438 | beam-adaptive |
| 8 | 500 | 2.731 | 2.374 | beam-adaptive |
| 8 | 3.000 | 16.726 | 14.886 | beam-adaptive |

## Busca exata pequena

18 casos com ótimo provado; 2 casos atingiram o limite sem prova. A prova vale apenas para o triângulo de três labs, lotes até 20, transporte instantâneo e as regras deste modelo. O solver exato é independente da busca de layouts/beam.

O candidato exato entra na comparação quando existe. A coluna guloso/beam mostra o melhor resultado antes dessa inclusão; uma vitória do exato não prova que a heurística encontrou o ótimo.

| Produto | Lote | Exato | Guloso/beam | Gap | Estados | Resultado |
|---|---:|---:|---:|---:|---:|---|
| XGH2O | 20 | — | 150 | — | 200.000 | state-limit |
| XGH2O | 5 | 16 | 20 | 4 | 150 | optimal-proved |
| XGHO2 | 20 | — | 215 | — | 200.000 | state-limit |
| XGHO2 | 5 | 16 | 20 | 4 | 150 | optimal-proved |
| XKH2O | 20 | 71 | 93 | 22 | 82.817 | optimal-proved |
| XKH2O | 5 | 8 | 9 | 1 | 10 | optimal-proved |
| XKHO2 | 20 | 71 | 93 | 22 | 82.817 | optimal-proved |
| XKHO2 | 5 | 8 | 9 | 1 | 10 | optimal-proved |
| XLH2O | 20 | 86 | 116 | 30 | 97.815 | optimal-proved |
| XLH2O | 5 | 13 | 14 | 1 | 10 | optimal-proved |
| XLHO2 | 20 | 71 | 93 | 22 | 82.817 | optimal-proved |
| XLHO2 | 5 | 8 | 9 | 1 | 10 | optimal-proved |
| XUH2O | 20 | 71 | 98 | 27 | 82.817 | optimal-proved |
| XUH2O | 5 | 8 | 9 | 1 | 10 | optimal-proved |
| XUHO2 | 20 | 71 | 98 | 27 | 82.817 | optimal-proved |
| XUHO2 | 5 | 8 | 9 | 1 | 10 | optimal-proved |
| XZH2O | 20 | 181 | 223 | 42 | 34.063 | optimal-proved |
| XZH2O | 5 | 21 | 21 | 0 | 12 | optimal-proved |
| XZHO2 | 20 | 71 | 98 | 27 | 82.817 | optimal-proved |
| XZHO2 | 5 | 8 | 9 | 1 | 10 | optimal-proved |

## Método e limites

- Todos os trios geometricamente válidos são enumerados. O beam de planos mantém até 64 estados, com limite de 100.000 expansões por caso ideal; os mesmos candidatos são reavaliados nos regimes de logística. Até 60.000 expansões são reservadas à construção de layouts, e o restante é repartido entre tamanhos de janela.
- As decisões são grupos conectados ou independentes de etapas, layouts e janelas 5/20/100/500/lote. Candidatos adaptativos escolhem um layout por cooldown/estoque a cada janela e reutilizam labs liberados durante um grupo. Não enumeram todos os possíveis intents, tamanhos de buffer ou trocas arbitrárias por tick.
- Score projetado prioriza tempo, depois movimento/trocas estimados; vencedor final usa o tempo efetivamente simulado, movimento/trocas medidos e desempate determinístico. Referências permanecem disponíveis mesmo quando a busca atinge limites.
- Resultados JSON informam `layoutTruncated`, `windowLimits`, `reason`, estados exatos e candidatos inviáveis/truncados. Candidatos que travam são descartados, nunca tratados como produção completa.
- Mineral único, capacidade 3.000, 5 unidades por reação, alcance Chebyshev<=2, saldo por etapa, cooldown individual e conservação dos átomos são verificados. Reservas impedem consumo duplo. Reagentes produzidos no tick atual não podem alimentar uma chamada downstream desse tick.
- Reposição usa buffer alvo max(40,10×N), dividido entre cópias; transporte finito atende jobs em rodízio, até B por tick, sem acumular crédito ocioso. Referências e candidatos usam esse mesmo serviço. Não é uma busca do melhor controlador de transporte.
- No modo instantâneo, produtos podem ser drenados ao final do tick; no modo finito, dreno usa orçamento do tick seguinte. O tempo termina com produto final no stock, sem esperar seu último cooldown.
- Estoque inicial contém só matérias-primas suficientes. Powers, boosts, CPU de jogo, compras e caminhos de creeps estão fora do modelo. Nenhum ganho de CPU ou resultado vivo é alegado.

## Reprodução

```powershell
node docs/lab-production-simulation.cjs --search --workers 4
node docs/lab-search/report.cjs
node docs/lab-production-simulation.cjs --search --self-test
node docs/lab-production-simulation.cjs --search --replay XLH2O-RCL6-Q3000-Binf-D0 --trace
```

O replay confere todas as métricas salvas e, com `--trace`, grava `docs/lab-search-trace.json`: atribuições por janela, mudanças com cooldown remanescente, reações e períodos de dupla função. Cada plano salvo inclui alternativas e política determinística para reproduzir sua sequência.

Artefatos: [JSON e planos](lab-search-results.json), [matriz CSV completa](lab-search-comparison.csv), [análise anterior e referências](lab-production-analysis.md).

Fontes: [constantes oficiais](https://github.com/screeps/common/blob/master/lib/constants.js), [API](https://docs.screeps.com/api/#StructureLab.runReaction), [engine](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/run-reaction.js).
