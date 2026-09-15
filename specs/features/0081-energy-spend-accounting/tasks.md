# 0081 — Energy spend accounting — Tasks

- [x] 1. Criar `src/utils/energyLedger.js` (`record`, `recordRepair`,
      `snapshot`, reset preguiçoso por tick).
  - verify: `node --check src/utils/energyLedger.js`.
- [x] 2. Instrumentar `src/prototypes/creep.js`'s `runBuild`
      (`ConstructionSite` → `build`, `Structure` → `recordRepair`) e
      `runUpgrade` (→ `upgrade`).
  - verify: `node --check src/prototypes/creep.js`.
- [x] 3. Instrumentar `src/roles/builder.js`'s `opportunisticWork()` (repair
      + build diretos).
  - verify: `node --check src/roles/builder.js`.
- [x] 4. Instrumentar `src/roles/pioneer.js`'s `creep.build(site)` direto.
  - verify: `node --check src/roles/pioneer.js`.
- [x] 5. Instrumentar `src/structures/tower.js`'s `run()` (attack/
      rangedMassAttack/heal/repair).
  - verify: `node --check src/structures/tower.js`.
- [x] 6. Instrumentar `src/rooms/spawning.js` (`spawnCreep` real → `spawn`,
      `renewIdleSpawns()` → `renew`).
  - verify: `node --check src/rooms/spawning.js`.
- [x] 7. Ligar `src/utils/stats.js`'s `exportStats()` ao
      `energyLedger.snapshot(roomName)`.
  - verify: `node --check src/utils/stats.js`.
- [x] 8. Assertions novas em `test/smoke.js`: acumulação/isolamento por sala,
      reset por tick, shape completo, mapeamento de `recordRepair`, e um
      cenário roteirizado (build + repair rampart + upgrade + tower repair +
      spawn) batendo os números esperados em `Memory.stats.rooms[x]
      .energySpent` depois de `exportStats()`.
  - verify: `node --check test/smoke.js`.
- [x] 9. Validar a entrega.
  - verify: `node test/smoke.js "$(pwd)"` · `npx grunt`.
- [x] 10. Atualizar `specs/ARCHITECTURE.md` (linha de `energyLedger.js` na
      tabela de utils + nota em `Memory.stats.rooms[name]`) e `ROADMAP.md`
      (status → `done`).
  - verify: revisão manual das duas seções.
- [x] 11. Follow-up (mesmo dia, usuário pediu soma dos últimos 60 segundos):
      `energyLedger.snapshot()` passa a somar uma janela deslizante de
      `energyLedger.windowTicks` ticks (default 60, override via
      `Memory.settings.energyLedger.windowTicks`) em vez de só o tick
      corrente — histórico por sala, podado a cada tick.
  - verify: `node --check src/utils/energyLedger.js` ·
      `node test/smoke.js "$(pwd)"` · `npx grunt`.
- [x] 12. Bug real corrigido (mesmo dia, usuário reportou em produção:
      "torres reparando, creeps construindo, spawns spawnando, mas os
      valores estão sempre retornando 0"): diff de
      `store[RESOURCE_ENERGY]` antes/depois do intent nunca observa mudança
      no motor real (intents só aplicam depois que todos os scripts da
      tick terminam). `energyLedger.js` ganha `creditBuild`/`creditRepair`/
      `creditUpgrade` (estimativa por WORK power, boost-aware, capada por
      energia/trabalho restante), `creditTower` (`TOWER_ENERGY_COST` fixo)
      e `renewCost` (fórmula nativa de `renewCreep`) — nenhum depende de
      ler o `store` depois do intent. Todos os call sites
      (`prototypes/creep.js`, `roles/builder.js`, `roles/pioneer.js`,
      `structures/tower.js`, `rooms/spawning.js`) migrados.
  - verify: `node --check` nos arquivos tocados ·
      `node test/smoke.js "$(pwd)"` · `npx grunt`.

## Notes

Medição original por diff de `store[RESOURCE_ENERGY]` ao redor de cada
intent existente — **substituída** (task 12) por estimativa via WORK power/
TOWER_ENERGY_COST/fórmula de renew, porque o diff nunca funciona no motor
real (só nos mocks do smoke test, que mutam o store sincronamente por
conveniência).

Follow-up mesmo dia: a métrica original só refletia o gasto do tick em que
`exportStats()` rodou — uma amostra do Grafana lida uma vez a cada alguns
ticks podia perder gasto inteiro entre leituras. `snapshot()` agora soma os
últimos `energyLedger.windowTicks` ticks (default 60 — aproximação de
1 tick ≈ 1 segundo, sem sinal de relógio real disponível).
