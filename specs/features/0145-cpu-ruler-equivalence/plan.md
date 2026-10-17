# 0145 — Régua de CPU e harness de equivalência — Plan

## Reparo ARK-145 — 2026-10-16

cpuReport.js mantém somente a solicitação no heap, com endpoints posteriores ao comando e flags de abertura. due() evita polling pesado; o main chama o fechamento em guard após endTick. cpuAccounting.range recorta o ring existente ao fechar, usando o mesmo formatter da janela rolling; nenhum dado novo por tick/Memory. printCpuTop recebe balanço opcional da solicitação, preservando seu comportamento manual e identificando a janela recente própria das tabelas. Cobertura/flags incompatíveis geram incomplete. Teste reproduz histórico74 + arm150 e impede impressão77ticks depois; rearm/gaps/bucket/rollover/reload e limites completam a validação. Sem deploy automático.

## Approach

Três peças pequenas, todas no heap ou em arquivos de teste, sem mudar nenhuma
decisão de jogo. (1) `profiler`: contar ticks efetivamente acumulados em vez de
derivar de `enabledTick`. (2) `cpuMeter`/`cpuAccounting`: registrar o tick de
boot do global (`bootTick`, identifica a instância de código: cada deploy
reinicia o global), marcar janelas que contêm a partida a frio, separar a
amostra fria da média "aquecida" e guardar o máximo por tick agregado.
(3) `shadowBudget` (opcional, off) e `test/equivalence/compare.js` como
oráculo offline. Decisão sobre hash do bundle: **não** carimbar o build
(Gruntfile fica intacto); `bootTick` já distingue instâncias e coincide com cada
deploy. Revisitar se for preciso distinguir dois deploys sem reset.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/shadowBudget.js` | `run(name, reference)`: roda a referência pura só com `shadow.enabled`, bucket > `shadow.minBucket`, 1 execução por nome por tick, teto `shadow.maxCpuPerTick`; ao exceder, desliga até o próximo reset |
| `test/equivalence/compare.js` | `compareImplementations(reference, candidate, worlds, projection)` → `{ equal, divergences[] }` |
| `test/equivalenceCases.js` | asserts do harness e do `shadowBudget`, chamado pelo smoke |

### Changed

| Path | Change |
|------|--------|
| `src/utils/profiler.js` | `Memory.profiler.ticks` incrementado em `endTick()`; `output()` usa-o (fallback: fórmula antiga) |
| `src/utils/cpuMeter.js` | `bootTick`, `includesReset`, `maxTick` (máximo do script por tick) em `build()` |
| `src/utils/cpuAccounting.js` | amostra `cold` (tick === bootTick), `coldUsed`, `warmUsed`, `maxUsed` no snapshot |
| `src/main.js` (`printCpuTop`) | imprime `boot`, `includesReset`, `warm`/`cold` |
| `src/utils/config.js` | `shadow: { enabled:false, minBucket:9000, maxCpuPerTick:0.5 }` |
| `test/smoke.js` | chama os novos casos e ajusta a assertion de profile |

## Data shapes

- Heap: `bootTick`, `acc.maxTick`, amostras de accounting com `cold`.
- Memory: só `Memory.profiler.ticks` (um inteiro, dura a sessão). `bootTick/includesReset/maxTick` entram em `Memory.stats.cpu.meter` (3 escalares).
- Config: `shadow.*`.

## How it satisfies the constitution

- **CPU:** contadores O(1) por tick; nenhum `Room.find`, nenhuma passada extra em `Game.creeps`.
- **Memory:** nenhum JSON por tick; 3 escalares publicados.
- **Fail-soft:** `shadowBudget` captura exceção da referência e nunca age.
- **Offline test:** `equivalenceCases.js` com `Game.cpu` falso.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Mudar formato de `meter` quebra o exporter | só adicionar campos; o exporter lê chaves nomeadas e escalares genéricos |
| `bootTick` errado em testes (módulo carregado antes de `Game.time`) | inicializar lazy no primeiro `endTick`/`begin`, não no load |
| Sombra consome CPU | off por padrão, teto duro, auto-desliga |
