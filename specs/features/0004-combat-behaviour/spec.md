# 0004 — Combat behaviour

- **Status:** done
- **Analysis refs:** M8 (parcial)

## Problem

- Defenders andavam direto no inimigo e trocavam golpes; o corpo tinha ratio
  de MOVE ruim, então o melee os alcançava.
- Sob ataque, creeps de economia continuavam trabalhando em campo aberto e se
  entregavam aos invaders.
- O spawn não priorizava defenders com força suficiente durante um cerco.

## Desired outcome

Defenders kitam: atiram + se curam todo tick, seguram alcance 3, fogem do melee
que fecha dentro de 3. O corpo é ~1:1 MOVE. Qualquer creep sem ATTACK /
RANGED_ATTACK, enquanto a sala está sob ataque, mantém distância segura (≥ 5
de hostis armados) ou se abriga num rampart, senão para de trabalhar e recua.
Enquanto há hostis, a sala spawna só defenders (mais um bootstrap como rede de
segurança da economia).

## Acceptance criteria

1. `defender.run` dispara um ranged attack e um heal no mesmo tick quando há
   alvo no alcance; foge quando um hostil melee está a ≤ 3.
2. O corpo do `defender` é ~1:1 MOVE (`RANGED_ATTACK MOVE RANGED_ATTACK MOVE
   HEAL MOVE` a ≥ 700).
3. `combat.takeCover(creep)` retorna `true` (e reposiciona) para um creep
   desarmado perto de uma ameaça, `false` quando seguro ou fora de ataque.
   *(smoke asserta ambos)*
4. Sob `defenseActive`, `spawning` enfileira só `defender` / `bootstrap`.
   *(smoke asserta)*

## Outcome

Entregue. Novo `utils/combat.js` (`takeCover`, `flee`, `blockingMatrix`,
`isArmed`, `hasMelee`, `threats`). `defender.js` reescrito. `takeCover`
adicionado no topo do `run` de harvester / builder / upgrader / miner /
bootstrap / scout. `spawning.js` restringe a lista de tipos sob ataque.
