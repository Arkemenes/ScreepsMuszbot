# 0092 — Miner na cascata global de energia — Tasks

- [x] 1. Integrar `getEconomySnapshot()` à cascata de `miner.distribute()`.
  - verify: `node --check src/roles/miner.js`
- [x] 2. Atualizar `test/smoke.js` com os cenários de criticidade e fallback.
  - verify: assertions AC1–AC4 e `node test/smoke.js "$(pwd)"`
- [x] 3. Atualizar `ROADMAP.md` e `ARCHITECTURE.md` se a forma do sistema mudar.
  - verify: revisão documental
- [x] 4. Finalizar validação e marcar status como `done`.
  - verify: `node --check`, smoke verde e `npx grunt`

## Notes

O ajuste preserva a propriedade do miner sobre a torre de source, mas deixa a
política global decidir quando essa reserva deve vencer o fluxo compartilhado.
