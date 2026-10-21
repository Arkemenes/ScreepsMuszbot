# 0162 — Tiers de prioridade por nível do CPU bucket — Plan

## Módulos

- **Novo `src/utils/cpuTier.js`:** `band()` (faixa do tick com histerese, estado no
  heap), `level()`, `runs(tier)`, `tierOf(label)`, `allows(label)`,
  `scaled(key, fallback)` (boost na faixa `full`), `skip(label)`/`skippedNow()`,
  `reset()` para testes.
- **`src/main.js`:**
  - `guard()` consulta `cpuTier.allows(meterKey(label))` antes de rodar; pulado = `cpuTier.skip()`.
  - Intel de salas não próprias passa por `intelRemote`; prévia de layout por `layoutPreview`.
  - `shedding()` (`cpu.shedBucket`) continua valendo.
- **`src/rooms/architect.js`:** prévia visual do plano sob `planPreview` (T2).
- **Boost via `cpuTier.scaled()`** no lugar de `config.get` em:
  - `observer.exploreInterval` (`structures/observer.js`);
  - `craft.scanInterval` (`craftPlanner.js`);
  - `craft.policyCpuPerTick` (`labPolicy.js`);
  - `terminalOps.tickInterval`;
  - `marketFlip.scanInterval`;
  - `builder.idleSpendRecheckTicks`;
  - `hauler.idleRecheckTicks`.
- **`src/utils/config.js`:** `cpu.bands`, `cpu.tiers`, `cpu.boost`.
  - Faixas e tiers são lidos chave a chave, para um override parcial em `Memory.settings` não apagar o resto.
  - `cpu.boost` é mesclado (as chaves são paths com ponto).
- **`src/utils/stats.js`:** `cpu.band`, `cpu.bandLevel`, `cpu.skipped` todo tick.
- **`grafana.json`:** painéis "Faixa do bucket" e "Subsistemas pulados pelo tier".

## Constituição

- **CPU:** uma faixa por tick (memoizada por `Game.time`) e um `config.get` por guard.
- **Memory:** só config e três campos de stats; histerese no heap.
- **Fail-soft:** um label fora da tabela roda (T0).

## Riscos

- Com bucket ≥ 9500, o boost aumenta o consumo de propósito. A histerese evita oscilar entre `full` e `normal`.
- Testes rodam com bucket 10000 (`full`). Os que verificam intervalos base passam a usar uma faixa `normal` explícita.
