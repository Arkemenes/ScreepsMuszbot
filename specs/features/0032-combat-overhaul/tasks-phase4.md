# 0032 — Combat overhaul — Tasks (Fase 4: O5, squad de verdade)

Derivado de `plan-phase4.md`.

- [x] 1. `utils/config.js`: `squad.retreatHpRatio` (0.3),
      `squad.stuckTicksLimit` (5), `squad.avoidTicks` (100).
- [x] 2. `utils/squad.js` (novo): `isDangerousRoom`, `advance(creep,
      squadId)` (algoritmo completo: prune/promoção de líder, viagem
      independente fora de sala perigosa, decisão de recuo, escolha de
      formatura block/column, reforma, lockstep, stall guard/avoid,
      desfazer squad), `registerPending(creep)`.
- [x] 3. `roles/squadDismantler.js` (novo): `WORK`:`MOVE` 1:1, sempre modo
      squad, desmonta a primeira `FIND_HOSTILE_STRUCTURES` adjacente.
- [x] 4. `roles/defenderStriker.js` / `roles/defenderMedic.js`: branch de
      `memory.squadId`/`memory.pendingSquad` no topo do `run()`, antes da
      lógica de defesa de casa existente.
- [x] 5. `roles/index.js`: registra `squadDismantler`.
- [x] 6. `rooms/raiding.js`: validação de alvo extraída pra
      `refusalReason()` compartilhada entre `raidRoom`/`raidSquad`;
      console `raidSquad(targetRoomName, mission, motherRoomName?)` monta
      `Memory.pendingSquad`; `spawnPendingSquad(room)` devolve os dados
      de spawn do próximo membro que falta.
- [x] 7. `rooms/spawning.js`: `Memory.pendingSquad` entra **primeiro** na
      fila (maior prioridade); `squadDismantler` pulado no loop genérico.
- [x] 8. `test/smoke.js`: cobertura de `utils/squad.js` (formatura
      block/column com parede de verdade, reforma, lockstep, recuo
      com/sem saída segura, desfazer squad, prune/promoção de líder),
      `raidSquad`/`spawnPendingSquad`/`registerPending`, `squadDismantler`.
  - verify: `node test/smoke.js` verde
- [x] 9. `npx grunt`; atualizar `specs/ARCHITECTURE.md`/`specs/ROADMAP.md`
      (Fase 4 done - fecha o `0032` inteiro).

## Notes

Dois bugs reais encontrados e corrigidos durante a implementação (nenhum
estava no plano):

- **`isDangerousRoom` não podia comparar com `squad.target.room`.**
  Durante o recuo, `target.room` vira a sala-mãe — comparar contra ela
  faria a própria casa contar como "perigosa" só por ser o destino do
  recuo, e o squad nunca conseguiria terminar de recuar. Corrigido pra
  comparar sempre com `squad.room` (a sala-alvo original da missão, que
  nunca muda) — `target.room` continua mutável e usado só pra decidir
  **pra onde** mover, não se a sala atual é perigosa.
- **Desfazer o squad só na sala segura mais próxima, não em casa, deixava
  striker/medic encalhados.** O plano original desfazia o squad assim que
  saía de sala perigosa; mas striker/medic sem `squadId` não têm lógica
  de "voltar pra casa" (o modo solo da Fase 2 assume que já estão em
  casa) - ficariam parados numa sala segura aleatória pra sempre. Corrigido:
  enquanto `state==="retreating"`, continua viajando (sozinho, sem
  lockstep) até chegar de fato em `squad.from`; só aí desfaz.

Fora isso, entregue como planejado: duas formas (`block`/`column`) com
teste de encaixe via `shapeFits` antes de cada avanço; stall guard
(`stuckTicks`→`avoid`) reaproveitando o mesmo princípio do `architect.js`;
o cálculo caro (`PathFinder`) roda 1×/tick por squad, gatilhado por
`Memory.squads[id].dirTick===Game.time` (qualquer um dos 4 pode disparar,
não só "o líder especificamente" — evita depender da ordem de iteração de
`Game.creeps`).

Validado pelo smoke (317 assertions no total - 23 novas: prune/promoção
de líder, `formed`/`shapeFits` com parede de verdade bloqueando `block`
mas não `column`, reforma, lockstep, recuo com/sem saída segura,
desfazer squad ao chegar em casa, o pipeline completo `raidSquad`→
`spawnPendingSquad`→`registerPending`→promoção, e `squadDismantler`) +
`npx grunt`.
