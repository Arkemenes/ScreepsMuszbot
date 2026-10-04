# 0113 — Plano

Quatro fases, com teste entre elas (smoke verde antes de seguir):

1. **cpuMeter + L0/L1.** `src/utils/cpuMeter.js`; `main.js` troca o medidor interno por
   ele; `guard(label, fn, sub)` registra também `roles`/`structures`; `span()` nos
   pontos críticos (`needs.compute`, `hauler.pickMineralJob`, `hauler.minerFeedTower`,
   `craft.scan`, `craft.chains`).
2. **Publicação.** `stats.js` copia `cpuMeter.snapshot()` para `Memory.stats.cpu.meter`.
3. **L2 sob demanda.** `profiler.js` guarda restauradores e ganha `disable()`;
   `maybeAutoDisableProfiler` publica o top de funções e desinstala os embrulhos
   (inclusive os registrados pelo `main.js`).
4. **Grafana.** `exporter.py` (label `span`), painéis em `screeps-dashboard.json` e cópia
   em `grafana.json`; `help()`, ROADMAP e ARCHITECTURE.

Riscos: desinstalar embrulhos enquanto há função embrulhada na pilha (o fechamento
acontece dentro do `memory.wrap`, onde nenhuma está); referências capturadas antes do
embrulho ficam embrulhadas mas inertes (`enabled=false`).
