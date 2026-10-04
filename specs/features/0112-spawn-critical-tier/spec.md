# 0112 — Tier crítico de spawn (bootstrap, 1º miner, 1º hauler)

**Status:** done

## Problema

`rooms/spawning.js` construía a primeira requisição que o spawn conseguia
pagar *agora* (`dryRun`). Com o hauler na frente da fila mas impagável (corpo
cheio dimensionado pela capacidade da sala), um `upgrader` mais barato passava
na frente e consumia a energia que o hauler esperava. Sem hauler, a energia
nunca é distribuída, então o hauler nunca é pago: deadlock.

## Resultado desejado

Ordem: `bootstrap` → 1º `miner` → 1º `hauler` → demais `miner` → resto (ordem de
`roles/index.js`). Sob ataque, nada muda (defensores + 1 bootstrap).

- Os quatro primeiros itens formam o tier **crítico**: se um não é pagável, o
  spawn **espera** acumular energia, sem cair para o tier seguinte.
- Anti-deadlock: role crítico com **0 creeps** cujo corpo cheio não é pagável
  usa o corpo mínimo (`hauler` `[CARRY,CARRY,MOVE]`, `miner` `[MOVE,WORK,WORK]`).
- **Upgrade do mini:** enquanto todo hauler vivo for menor que o corpo cheio
  que a sala paga hoje, um hauler cheio é enfileirado (bloqueante), mesmo com
  `wanted` já satisfeito. Evita ficar para sempre só com mini haulers.
- Só o **1º** hauler é crítico; haulers adicionais ficam no tier normal.
- "1º miner" = nenhuma source tem WORK vivo que sobreviva ao lead time
  (`miner.spawnTier(room) === "first"`).

## Critérios de aceitação (smoke)

- `0112: no hauler affordable -> upgrader does NOT jump the queue`
- `0112: zero haulers + full body unaffordable -> min-body hauler spawns`
- `0112: full hauler body spawns when affordable`
- `0112: mini hauler alive -> waits (no upgrader) for the full hauler`
- `0112: mini hauler alive, wanted met -> a full hauler is still spawned`
- `0112: full hauler alive -> no extra hauler, normal tier resumes`
