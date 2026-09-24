# 0108 — Estrada do plano é reparada sem exigir tráfego — Plan

## Changes

| Path | Change |
|------|--------|
| `src/utils/traffic.js` | `worthRepairing()` importa `planEntriesAt` de `utils/plan.js`; abaixo do piso, tile reservado para `STRUCTURE_ROAD` retorna `true` antes de consultar `isHot()`. |
| `test/smoke.js` | Regressões: planejada fria repara, planejada saudável não, não-planejada fria não, sala sem plano mantém a regra antiga; ponta a ponta no builder. |
| `specs/ARCHITECTURE.md` | Atualizar a descrição da política de repair de estrada em `traffic.js`. |
| `specs/ROADMAP.md` | Linha 0108. |

## Risks

| Risk | Mitigation |
|------|------------|
| Ciclo de `require` (`traffic → plan → planStore`) | `planStore` não importa nada do projeto; verificado com o smoke, que carrega `traffic` isolado. |
| Sala sem plano passar a reparar tudo | `planEntriesAt()` retorna `null` nesse caso e a regra antiga (`isHot()`) segue valendo — assertion dedicada. |
| Piso de reparo ser contornado | O teste de `roadRepairFloor` continua antes de qualquer consulta ao plano. |
| Custo de CPU por estrutura danificada | Índice `"x:y"` por sala já construído 1x/tick por `utils/plan.js`, e ambos os chamadores já rodam `isPlanned()` no mesmo filtro. |
