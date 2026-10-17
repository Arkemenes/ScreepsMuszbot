# 0145 — Régua de CPU e harness de equivalência — Tasks

## Reparo ARK-145 — 2026-10-16

- [x] Reproduzir arm83690790 → fechamento83690867 com trecho real anterior do main.
- [x] Implementar janela relativa, recorte do ring existente, cobertura e flags sem nova coleta/Memory.
- [x] Integrar hook guardado, auto-report warm e ajuda do console; manter cpuTop/tabelas recentes identificados.
- [x] Vinte regressões no smoke para janela nova150, rearm, rollover, auto/off/reload, flags, gap, bucket, endTick, relógio, limite, cold/ausência, máximo/resíduo e custo de espera.
- [ ] Aceite live de duas janelas150 estáveis no bundle corrigido; objetivo CPU global e L2 permanecem abertos.

Entrega local e roteiro em [cpu-report-isolado-2026-10-16.md](../../../docs/cpu-report-isolado-2026-10-16.md). Resultados antigos abaixo são históricos e podem ter janela desde boot.

- [x] 1. `profiler.js`: contador efetivo de ticks e `output()` (AC1)
  - verify: `node --check src/utils/profiler.js` · smoke `"0145: profile output counts 100 ticks for a 100-tick session"`
- [x] 2. `cpuMeter.js`: `bootTick`, `includesReset`, `maxTick`, só heap (AC2, AC3)
  - verify: smoke `"0145: window containing the boot tick is flagged includesReset"`, `"0145: aggregate max stays out of Memory"`
- [x] 3. `cpuAccounting.js`: amostra fria, `coldUsed`, `warmUsed`, `maxUsed` (AC2)
  - verify: smoke `"0145: cold sample excluded from warmUsed"`
- [x] 4. `main.js printCpuTop`: imprimir boot/warm/cold (AC2)
  - verify: smoke (saída do cpuTop contém `includesReset`)
- [x] 5. `shadowBudget.js` + `config.shadow` (AC5)
  - verify: smoke `"0145: shadow off by default"`, `"0145: shadow stops past its CPU cap"`
- [x] 6. `test/equivalence/compare.js` + `test/equivalenceCases.js` (AC4)
  - verify: smoke `"0145: divergent candidate fails compareImplementations"`
- [x] 7. Medir overhead dos contadores (AC6) e registrar nas Notes
- [ ] 8. Definition of done: `node --check`, `node test/smoke.js "$(pwd)"`, `graphify update .`; `ROADMAP.md` → done só após o deploy conjunto com a 0146

## Notes

- 2026-10-15: implementado. Descoberta: o baseline "pós-reset" do `cpuBalance` começa no tick do reset, então **inclui o tick frio** (pico de dezenas/centenas de CPU diluído em ~600 intervalos). `warmUsed` passa a ser a régua; `coldUsed` mostra o custo da partida a frio.
- Decisão (autônoma): sem hash de bundle; `bootTick` identifica a instância (cada deploy reinicia o global). Revisitar se dois deploys sem reset precisarem ser distinguidos.
- Overhead (AC6): O(1) por tick, só somas/comparações no heap; sem `Room.find`, sem passada em `Game.creeps`, sem JSON. Três escalares extras em `Memory.stats.cpu.meter` (`maxTick`, `bootTick`, `includesReset`) e quatro em `cpu.accounting`.
- Console: `cpuReport(n=600)` (relatório único automático após n intervalos aquecidos), `cpuAuditMemory()` e `cpuAuditRoomFields()` viraram funções reais (o limite de 1024 caracteres do console não vale para funções do bundle).
- Medição pós-deploy 1: Memory 288.456 -> 204.254 chars (rooms 164.155 -> 81.137), serialização explícita 1,69 -> 1,32 CPU. Cold tick do deploy: 166 CPU.
- Pendente: ROADMAP -> done após a janela de 600 intervalos.
- Medição 2 (cpuReport(150), boot 83667350, 150 intervalos aquecidos, sem profile): `warm` **16,407**, resíduo **1,695**, cold tick 167. Baseline antiga sem o tick frio ~16,94 (derivada: 17,203 x 577, menos o frio de ~166). Queda ~0,53, coerente com a estimativa da 0146 (~0,5), **mas a carga não é controlada** (swingTrade 1,06 com pico de 33 CPU numa chamada; market.bookAll pico 6,4; hauler 4,07 contra 3,40 na janela anterior). `cpuReport` conta intervalos desde o boot, não desde o armamento.
