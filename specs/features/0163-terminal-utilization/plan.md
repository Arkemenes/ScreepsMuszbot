# 0163 — Utilização do terminal — Plan

- **Status:** in-progress — implementado e publicado em 2026-10-21.
- **Issue:** ARK-202. **Contrato:** [spec.md](spec.md).

## Approach / Modules

`utils/terminalReport.js` segue o desenho do `labReport`: contadores cumulativos em `Memory.terminalReport[sala]`, `report`/`summary`/`line` e console. Hooks em `utils/terminalOps.js`: `record()` chama `terminalReport.freight(op.sourceRoom, energia, quantidade)`, e os quatro pontos que estacionam uma op por cooldown chamam `terminalReport.blocked(sala)`. `main.js` chama `observe()` sob guard logo após o `labReport`; `stats.js` publica `summary()` por sala.

## Validation / Rollout

Smoke `0163 observation / freight / report / summary / console / off`. Ligado por padrão; aceite live após ≥ 48h, comparando busy/blocked/frete com o labReport.
