# 0032 — Combat overhaul — Tasks (Fase 1: D1 + D4)

Derivado de `plan.md`. Só a Fase 1.

- [x] 1. `roles/defender.js`'s `getBody(energy)`: reordenar as 3 variantes
      pra `MOVE` por último — `[RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE,
      MOVE, MOVE]` (≥700), `[RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE]`
      (≥400), `[RANGED_ATTACK, MOVE]` (resto, já sem mudança). Mesmas
      partes/contagens de hoje, só ordem.
  - verify: `node --check`; nova assertion no smoke checando a ordem
    exata do array nas 3 faixas
- [x] 2. `utils/config.js`: remover `tower.rampartCriticalLimit` /
      `tower.rampartCriticalLimitUnderAttack`; adicionar
      `tower.rampartTargetRatio` (0.02), `tower.rampartTargetRatioUnderAttack`
      (0.2), `tower.stockpileTrigger` (0.1).
  - verify: `node --check`
- [x] 3. `structures/tower.js`'s `findRepairTarget`: trocar a seleção de
      rampart crítico de limiar absoluto pra `structure.hits <
      structure.hitsMax * ratio`. `ratio` = agressivo
      (`rampartTargetRatioUnderAttack`) quando `defenseActive` **ou**
      `tower.room.storage` existe e sua capacidade livre de energia está
      abaixo de `stockpileTrigger`; normal (`rampartTargetRatio`) caso
      contrário. Tratar `storage` ausente sem lançar.
  - verify: `node --check`; novas assertions no smoke: rampart abaixo do
    ratio normal é escolhido; ratio agressivo dispara com `defenseActive`;
    ratio agressivo dispara com storage cheio mesmo sem `defenseActive`;
    sem storage não lança
- [x] 4. Conferir se o smoke mock de `storage`/`store()` já suporta
      `getFreeCapacity(RESOURCE_ENERGY)`/`getCapacity(RESOURCE_ENERGY)`
      pro fixture usado nas assertions da task 3 - ajustar o harness se
      faltar (não é mudança de produção).
  - verify: as assertions da task 3 rodam sem erro de fixture
- [x] 5. `npx grunt`; atualizar `specs/ARCHITECTURE.md` (linhas de
      `defender`/`tower.js`) e `specs/ROADMAP.md` (status da 0032 →
      `in-progress`, Fase 1 concluída, fases 2–4 seguem `ready`).

## Notes

Entregue. `defender.js`'s `getBody()` reordenado (`MOVE` por último nas 3
faixas de energia). `tower.js`'s `findRepairTarget` troca limiar absoluto
por `hits < hitsMax * ratio` (`stockpileFull()` novo helper, trata
`storage` ausente). `config.js`: `tower.rampartCriticalLimit*` removidos,
`tower.rampartTargetRatio`/`*UnderAttack`/`stockpileTrigger` adicionados.
Task 4: o mock `store()` já suportava `getFreeCapacity`/`getCapacity` -
nenhum ajuste de harness necessário além do fixture novo em si.
Validado pelo smoke (259 assertions no total - 7 novas: ordem do corpo
nas 3 faixas, seleção por ratio normal/agressivo (`defenseActive` e
storage cheio), e "nunca lança sem storage") + `npx grunt`.
