# 0113 — Tarefas

- [x] T1 `utils/cpuMeter.js` + testes unitários (acumular, janela, snapshot, span)
- [x] T2 `main.js`: guard/roles/structures via cpuMeter, `cpuTop` sobre ele, spans nomeados
- [x] T3 `stats.js`: `Memory.stats.cpu.meter`
- [x] T4 `profiler.js`: `disable()`/restauradores; `profile(N)` publica `fns` e desinstala
- [x] T5 `exporter.py`: label `span`
- [x] T6 dashboard: linha nova + `grafana.json`
- [x] T7 `help()`, ROADMAP, ARCHITECTURE; definição de pronto (check, smoke, grunt)

## Notas de execução (2026-10-02)

- `Memory.stats.cpu.meter` chega ao Prometheus com 1 tick de atraso (a janela fecha em
  `cpuMeter.endTick()`, depois do `stats()` do mesmo tick).
- Bug achado no caminho: `maybeAutoDisableProfiler` rodava antes do `memory.wrap` (ver
  tasks do 0111); aqui ele também desinstala os embrulhos e publica o L2.
- O dashboard foi acrescentado a `screeps-dashboard.json` (0079) e copiado para o
  `grafana.json` da raiz, que estava vazio.
- Os testes de torre do smoke foram corrigidos antes (eram falha dos mocks, não do jogo).

## Corte de CPU: cache do roomNeeds (2026-10-02)

- O profile mostrou `roomNeeds` (aparece como `bootstrap.wanted`/`upgrader.wanted`) com
  ~0,8-1 CPU/tick: `compute()` roda por sala a cada tick. Agora o resultado vale
  `needs.cacheTicks` (5) ticks; sala com `defenseActive` nunca usa o cache;
  `setWanted`/`clearWanted` invalidam na hora (`needs.invalidate`).
- O smoke fixa o padrao em 1 (`config.defaults`) porque os testes mudam estado e avancam
  1 tick; o cache tem teste proprio.
- Correcao de diagnostico: a queda do bucket das 17h as 19h NAO foi o pixel (grafico do
  usuario mostra os dois pixels as 22:45 e 12:00 como quedas bruscas): foi gasto real. O
  `pixel.headroomGate` e o `cpu.shedBucket` ficam como protecao, nao como causa.

## Corte de CPU: miner em lotes (2026-10-02)

- Medido: `role:miner.run` tem ~0,06 CPU/miner de logica propria; os ~3 CPU do role eram as
  acoes do jogo (`harvest` + `withdraw` do container + `transfer` ao link, ~0,2 cada) feitas
  TODO tick por miner. Nao era busca de container nem decisao torre x link.
- Agora (`miner.batchTransfer`, padrao ligado): envia ao link/torre so quando o proximo
  harvest nao cabe mais (carga de 50, ~1 transfer a cada 5 ticks) ou ao morrer
  (ticksToLive <= 2); puxa do container so com acumulo (`miner.pullBacklog` 500); pilha no
  chao continua sendo recolhida sempre. A busca de pilha usa `roomCache.droppedResources`.
- Efeito esperado: ~6 transfers/tick -> ~1,2 e a maior parte dos withdraws, ~1,5 CPU/tick.
- Efeito colateral: a energia chega ao link em pacotes de 50 a cada 5 ticks (mesma vazao);
  uma fonte sem energia deixa ate 50 retidos no miner ate regenerar.
