# 0036 — Automatic safe mode (D6) + remote harassment (O3) — Tasks

Derivado de `plan.md`.

- [x] 1. `utils/hostiles.js`: `isHostile()` fora de sala própria também
      conta `isTargetEnemy(username)` (AC6).
  - verify: `node --check src/utils/hostiles.js`
- [x] 2. `utils/config.js`: `combat.safeModeSpawnHpRatio` (0.5).
- [x] 3. `rooms/defense.js` (novo): `checkSafeMode(room)` (AC1, AC2).
  - verify: `node --check src/rooms/defense.js`
- [x] 4. `rooms/index.js`: registra `checkSafeMode`. `main.js`: chama no
      loop de `Game.myRooms`, dentro de `guard()`.
- [x] 5. `rooms/raiding.js`: `isEnemyRemote`, `remoteRefusalReason`,
      console `raidRemote(roomName, motherRoomName?)` (AC3, AC4).
- [x] 6. `roles/raider.js`: `mission` em `spawnData()`; branch
      `mission==="harass"` em `run()` (AC5).
- [x] 7. `test/smoke.js`: fixture do spawn ganha `hits`/`hitsMax`; mock do
      controller ganha `safeMode`/`activateSafeMode`. Assertions novas
      pra AC1–AC6 (20 novas — 337 no total).
  - verify: `node test/smoke.js` verde
- [x] 8. `npx grunt`; atualizar `ROADMAP.md`/`ARCHITECTURE.md`.

## Notes

Um gap real encontrado (não estava no plano original, só apareceu ao
desenhar O3): `utils/hostiles.js`'s `isHostile()`, fora de sala própria, só
reconhecia `hostilePlayers()`/`systemHostiles` como hostil — um jogador só
em `targetEnemies` nunca aparecia em `getHostiles()`/`mem.enemies`/
`combat.threats()` numa sala que não é nossa. Isso já afetava O4
silenciosamente (uma "sala fraca" de um `targetEnemy` podia ter um defender
lá sem `mem.enemies` acusar) e afetaria O3 do mesmo jeito (um guarda
postado na remote não seria detectado no gate de dispatch). Corrigido como
task 1, antes do resto — pré-requisito real, não só limpeza.

`raidRemote()` reaproveita `roles/raider.js` inteiro (não um role novo) via
`memory.mission="harass"` — o raider já sabia viajar/lutar/se retirar, só
precisava de um branch que ataque `FIND_HOSTILE_CREEPS` sem filtrar por
armamento (reserver/miner são desarmados) em vez de `FIND_HOSTILE_STRUCTURES`
(O3 nunca deve tocar estrutura, por design).

Entregue como planejado, sem outros desvios. Validado pelo smoke (337
assertions no total — 20 novas: `isHostile()` com `targetEnemy` fora de
sala própria, `isEnemyRemote`/`raidRemote` nos 4 critérios de recusa + caso
positivo, `raider` em modo harass atacando um alvo desarmado e se
retirando sem tocar estrutura, `spawnData()` propagando `mission`, e
`checkSafeMode()` nos 4 cenários do gate (sem hostil em alcance, saudável +
defender vivo, hp baixo, zero defenders, já ativo, erro de
`activateSafeMode()` sem lançar)) + `npx grunt`.
