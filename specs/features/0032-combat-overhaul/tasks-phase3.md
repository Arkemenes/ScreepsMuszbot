# 0032 — Combat overhaul — Tasks (Fase 3: O2 + O4)

Derivado de `plan-phase3.md`.

- [x] 1. `utils/hostiles.js`: `targetEnemies()`, `isTargetEnemy(username)`;
      console `addTargetEnemy`/`removeTargetEnemy`/`listTargetEnemies`.
  - verify: `node --check`
- [x] 2. `rooms/intel.js`: `mem.controllerLevel`, `mem.hasInvaderCore`
      (do `find()` de `enemyStructures` já existente).
  - verify: `node --check`
- [x] 3. `rooms/raiding.js` (novo): `isWeakEnemyRoom(roomName)`,
      `findWeakTarget()`, console `raidRoom(roomName, motherRoomName?)`.
  - verify: `node --check`
- [x] 4. `roles/raider.js` (novo): viaja via `utils/routing`; luta hostil
      (`combat.threats`/`shoot`/`kiteAwayFrom`) ou ataca a primeira
      `FIND_HOSTILE_STRUCTURES` a `KITE_RANGE`; sem alvo, limpa
      `Memory.raidTarget` e se aposenta.
  - verify: `node --check`
- [x] 5. `roles/index.js`, `rooms/needs.js` (`raider` count),
      `utils/config.js` (`raiding.maxTargetRcl`=3, `raiding.autoRaid`=false).
      `rooms/spawning.js`: `raider` tratado como o `scout` - só spawna
      quando nada mais (nem o scout) quer nada.
  - verify: `node --check`
- [x] 6. `src/main.js`: scan opcional (`raiding.autoRaid`) por sala
      própria; `rooms/index.js` requer `raiding.js` (registra `raidRoom`).
  - verify: `node --check`
- [x] 7. `test/smoke.js`: `STRUCTURE_INVADER_CORE` no stub; cobertura de
      `targetEnemies`, `isWeakEnemyRoom`, `raidRoom()` (O2 e O4),
      `raider.run()` (luta creep, ataca estrutura à distância e em
      alcance, se aposenta). `help()` atualizado.
  - verify: `node test/smoke.js` verde
- [x] 8. `npx grunt`; atualizar `specs/ARCHITECTURE.md`/`specs/ROADMAP.md`
      (Fase 3 done).

## Notes

Entregue como planejado, sem desvios do `plan-phase3.md`. `raider` ficou
mesmo como role separado de `defenderStriker`/`defenderMedic` (mais
simples - sem parceiro, sem tanque, sem mop-up), reaproveitando só os
primitivos de `utils/combat.js`. `raidRoom()` cobre O2 (sala neutra com
invader core, sem checar `targetEnemies`) e O4 (sala de um `targetEnemy`
que passa em `isWeakEnemyRoom`) com a mesma validação; `raiding.autoRaid`
fica `false` por padrão, então nada dispara sozinho até o usuário ligar de
propósito. `raider` entra na fila de spawn com a mesma prioridade baixa do
`scout` (só spawna quando mais nada quer nada).

Validado pelo smoke (293 assertions no total - 18 novas: `targetEnemies`
add/remove, `isWeakEnemyRoom` nos 4 critérios + caso positivo, `raidRoom`
recusando/aceitando nos casos O2 e O4, e `raider.run()` nos 4
comportamentos - luta creep, fecha em estrutura distante, ataca em
alcance, se aposenta) + `npx grunt`.
