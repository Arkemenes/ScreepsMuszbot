# 0163 — Utilização do terminal — Tasks

- **Status:** in-progress — T1 publicado em 2026-10-21; T2 (aceite live) pendente.
- **Issue:** ARK-202. **Contrato:** [spec.md](spec.md).

- [x] **T1 — Contadores, hooks de frete/cooldown, relatório e stats.** AC1–4. Feito 2026-10-21 (publicado): `utils/terminalReport`, hooks em `terminalOps.record` e nos quatro pontos "terminal em cooldown", `observe()` em `main.js`, `rooms[sala].terminalReport` e painéis Grafana (linha Energia e labs). Smoke `0163` (6).
- [ ] **T2 — Aceite live com ≥ 48h e comparação com o labReport para a 0150 T7.** AC5. Verificação: `LIVE-0163: busy/blocked/frete por sala`.
