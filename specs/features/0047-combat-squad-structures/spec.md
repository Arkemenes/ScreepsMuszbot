# 0047 — Combat squad clears hostile structures too, then goes home

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

`old_1/prototype.creep.role.defender.js` atacava `FIND_HOSTILE_STRUCTURES`
quando não havia creep hostil por perto. Hoje, defesa em casa via
`utils/combat.js` só mira creep hostil - mas o caso que o usuário achou
valer a pena é outro: um `raidSquad(room, "combat")` (`defenderStriker`+
`defenderMedic` em lockstep, ROADMAP 0032 Fase 4) que limpa todos os creeps
hostis de uma sala-alvo simplesmente **para** ali - nunca ataca a estrutura
hostil que sobrou (spawn/torre/rampart de outro jogador), e nunca sabe que
"terminou": o squad fica parado no centro da sala pra sempre, sem
`disband()`, prendendo o slot único de squad ativo (`Memory.squads` só
permite 1 por vez) e nunca liberando os dois creeps pra voltar pra casa.

## Desired outcome

Um squad `"combat"` que limpa os creeps hostis de uma sala continua a
missão: mira e ataca (`rangedAttack`) qualquer estrutura hostil que reste
(exceto `STRUCTURE_POWER_BANK`, mesma exclusão que `raider.js`/
`squadDismantler.js` já usam), a alcance de tiro. Quando a sala-alvo não
tem mais nem creep hostil nem estrutura hostil, o squad se considera com a
missão cumprida e volta pra casa sozinho, reaproveitando o mesmo caminho de
retreat/disband já existente (`utils/squad.js`) - sem ficar parado
esperando um comando manual.

## In scope

- `src/utils/squad.js`: `missionComplete(squad)` - lê só
  `Memory.rooms[squad.room].enemies`/`.enemyStructures` (campos que
  `rooms/intel.js` já preenche todo tick pra qualquer sala visível, sem
  `room.find` novo). Missão `"siege"` termina só com `enemyStructures`
  zerado (dismantler não luta contra creep, não faz sentido bloquear nisso);
  missão `"combat"` (e qualquer outra) exige os dois zerados. Ligado dentro
  de `advance()`, no mesmo bloco `if (squad.state === "advancing")` que já
  chama `maybeRetreat()` - reaproveita a transição pra `"retreating"` +
  `squad.target = {room: squad.from}` já testada (0032 Fase 4).
- `src/roles/defenderStriker.js`: no modo squad, quando `combat.threats()`
  não acha creep hostil, procura `FIND_HOSTILE_STRUCTURES` (exceto
  `STRUCTURE_POWER_BANK`) na sala e ataca (`rangedAttack` a alcance de
  `combat.KITE_RANGE`, sem mover - `squad.advance()` já decide onde o
  squad anda).

## Out of scope

- Mudar a posição de marcha do squad pra ir direto na estrutura (hoje o
  lockstep sempre marcha pro centro da sala quando `squad.target` não tem
  `.id` - mesma limitação que `squadDismantler` já tem desde o 0032; não é
  regressão nova, só não é resolvida aqui).
- `defenderMedic` atacar estrutura (não tem corpo pra isso - continua só
  curando).
- Repetir esse comportamento pra defesa **em casa** (o achado original do
  levantamento, defender solo vs. `FIND_HOSTILE_STRUCTURES`) - o usuário
  decidiu que só vale a pena pros squads de ataque.

## Acceptance criteria

1. Um `defenderStriker` em modo squad, sem creep hostil na sala mas com
   uma estrutura hostil a alcance, chama `rangedAttack()` nela —
   `test/smoke.js`: `"a combat squad striker attacks a hostile structure
   once no hostile creeps remain"`.
2. Sem creep hostil e sem estrutura hostil a alcance, o striker não chama
   `rangedAttack` nem `attack` — `test/smoke.js`: `"a combat squad striker
   holds fire with nothing hostile left to shoot"`.
3. `squad.missionComplete()` retorna `true` pra uma missão `"combat"` só
   quando `enemies` e `enemyStructures` estão zerados, `false` se qualquer
   um dos dois for > 0 — `test/smoke.js`: 3 casos.
4. `squad.missionComplete()` pra uma missão `"siege"` ignora `enemies`,
   olha só `enemyStructures` — `test/smoke.js`: 1 caso.
5. Um squad `"advancing"` cuja sala-alvo já não tem nada hostil transiciona
   pra `"retreating"` com `target.room = squad.from`, no mesmo tick —
   `test/smoke.js`: `"a squad with nothing left to fight heads home instead
   of idling"`.

## Constitution check

- **CPU:** `missionComplete()` só lê `Memory.rooms` (campos já mantidos por
  `rooms/intel.js`) - nenhum `room.find` novo em `squad.js`. O
  `FIND_HOSTILE_STRUCTURES` em `defenderStriker.js` é o mesmo padrão (1
  `room.find` por creep por tick) que `raider.js`/`squadDismantler.js` já
  usam - não pior do que o que já existe.
- **Memory:** nenhum estado novo - `missionComplete()` é derivado, não
  guardado.
- **Fail-soft:** `rangedAttack()` é chamada nativa por código de retorno;
  ausência de alvo simplesmente não dispara nada, sem exceção.
- **Offline test:** `test/smoke.js` cobre os 5 critérios acima.

## Open questions

Nenhuma.
