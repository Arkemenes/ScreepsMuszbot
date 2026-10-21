# 0162 — Tiers de prioridade por nível do CPU bucket — Tasks

- **Status:** done (publicado 2026-10-20); aceite ao vivo da faixa `normal` confirmado em 2026-10-20.
- **Issue:** ARK-198.

- [x] **T1 — `utils/cpuTier.js`** com faixas, histerese, tiers, boost e contagem de pulados. AC3–5.
  Verificação: `0162: band hysteresis`, `0162: full band enables tier 3 and boost`,
  `0162: no boost outside the full band`, `0162: tiers are configurable`.
- [x] **T2 — Gate em `guard()`**, intel remoto, prévia de layout e prévia do plano. AC1–2.
  Verificação: `0162: critical band runs only tier 0`,
  `0162: default tiers keep the legacy shed behaviour`, `0162: normal band runs tiers 0-2 like before`.
- [x] **T3 — Boost nos sete knobs**, observer explorando todo tick em `full`.
  Verificação: `0162: in the full band the observer explores every tick (exploreInterval boosted 10 -> 1)`.
- [x] **T4 — Stats e Grafana** (`cpu.band`, `cpu.bandLevel`, `cpu.skipped`; dois painéis). AC6.
- [x] **T5 — Aceite ao vivo:** com o bucket acima de 3000, nenhum subsistema de tier 0–2 é
  pulado. AC7. Live tick 83775577: bucket 8557, `band: normal`, `cpu.skipped = { pixel: 1 }`
  (pixel é tier 3, pulado por desenho fora de `full`). Observer explorando todo tick em `full`
  fica para verificação oportunista quando o bucket passar de 9500.
