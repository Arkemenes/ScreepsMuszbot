# 0175 — Prioridade de alvo estrutural ofensivo

- **Status:** done
- **Owner:** a definir
- **Created:** 2026-10-22
- **Linear:** [ARK-223](https://linear.app/arkemenes/issue/ARK-223/0175-prioridade-de-alvo-estrutural-ofensivo-torre-spawn-nunca)

## Problem

Sem creep hostil armado, o raider (`raidRoom`) e os strikers de um squad `combat` atacavam o primeiro resultado de `room.find(FIND_HOSTILE_STRUCTURES)`, de qualquer tipo. Extensions e storage eram destruídos junto, e a ordem não priorizava o que atira de volta. O squad também andava só até o centro da sala, então uma torre longe dali nunca ficava ao alcance. E a missão `combat` só terminava sem nenhuma estrutura hostil, inclusive extensions.

## Desired outcome

Fora de creeps armados, o alvo estrutural segue a ordem: torre com energia para atirar (ou invader core), depois spawn, depois torre vazia. Extensions, storage e as demais estruturas nunca são alvo e ficam intactas.

## In scope

- `combat.structureTarget(room, fromPos)` com a ordem acima; dentro do nível, a mais próxima.
- Uso no raider (missão `raid`) e no striker em modo squad.
- Squad `combat`: o líder anda até o alvo prioritário (`leaderGoal`); com visão, a missão termina sem threats e sem alvo prioritário (`missionComplete`).

## Out of scope

- Squad `siege` (dismantlers abrem caminho por muros e ramparts; segue atacando qualquer estrutura).
- Claim da sala ou coleta de recursos depois do ataque.

## Acceptance criteria

1. "0175: a tower with energy is the first structure target, even farther than spawn/extension/storage"
2. "0175: with no tower able to fire, the spawn comes next (ahead of an empty tower)"
3. "0175: an empty tower is still a target after spawns"
4. "0175: extensions and storage are never structure targets"
5. "0175: with vision, a combat squad is done once only extensions/storage are left"
6. "0175: a combat squad keeps going while a spawn still stands"

## Constitution check

- **CPU:** um `room.find(FIND_HOSTILE_STRUCTURES)` por chamada, como antes.
- **Memory:** nada novo.
- **Offline test:** seis asserções; testes antigos de raider e `missionComplete` continuam verdes.
