# 0148 — População sob demanda — Tasks

Pré-requisito: 0154 entregue. Ler a seção 2.2 do roadmap (números de CPU por role).

- [ ] 1. `repairDemand.demand(room)` com cache por tick (AC1)
  - verify: smoke `"0148: repair demand appears for a critical-tier structure the tower does not cover"`
- [ ] 2. `needs.compute`: builder sob demanda atrás de `population.builderOnDemand.rooms` (AC1, AC5)
  - verify: smoke `"0148: no sites and no repair demand -> builder 0; demand appears -> builder returns"`
- [ ] 3. Experimento do builder (framework 0154): métricas e guardas da spec (AC2)
  - verify: smoke `"0148: the experiment rolls back by itself when a structure crosses the safety mark"`
- [ ] 4. Ligar em UMA sala de baixo risco, deixar o experimento rodar uma vida de creep e anotar o relatório nas Notes; medir `warmUsed` pelo `cpuReport` (AC4)
- [ ] 5. Com o `energyReport` (0154): política de upgrader por excedente atrás de flag por sala; piso de downgrade (AC3)
  - verify: smoke `"0148: no controller reaches the downgrade safety mark"`
- [ ] 6. Avaliar fusão builder+upgrader com os mesmos experimentos (opcional)
- [ ] 7. DoD: `node --check`, smoke, `graphify update .`, `npx grunt`; ampliar para outras salas só se o relatório for limpo

## Notes

- Não reciclar creeps vivos na primeira versão; o ganho vem de não repor o builder ao morrer.
