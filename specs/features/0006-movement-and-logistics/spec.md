# 0006 — Movement & logistics

- **Status:** done
- **Analysis refs:** item de planejamento A (movimento), item C (hauler)

## Problem

Todo role chamava `creep.moveTo` (com `reusePath` fraco) e vários rodavam
`findClosestByPath` todo tick — pathfinding era um custo de CPU de topo. Uma vez
que storage / containers de source existem, harvesters fazendo todo o transporte
é ineficiente.

## Desired outcome

Movimento é com cache de rota: caminho calculado uma vez, seguido de um cache
compacto, recalculado só em caso de falha. Casos cross-room e de erro caem no
`moveTo` nativo para que um bug do mover nunca deixe um creep preso. Um role
`hauler` dedicado move energia dos containers de mineração para os consumidores.

## Acceptance criteria

1. `travel(creep, target, {range})` cacheia o caminho em `creep.memory._m`,
   re-anda avançando os tiles alcançados, e limpa o cache na chegada.
   *(smoke asserta)*
2. Um creep que não consegue se mover dispara um re-path em poucos ticks.
   *(smoke: creep congelado → ≥ 2 chamadas de `PathFinder.search` / 6 ticks)*
3. `Creep.prototype.moveTo` delega para `travel`; qualquer throw ou alvo
   cross-room usa `nativeMoveTo`.
4. `CostMatrix` por sala é cacheada no heap, reconstruída só quando a contagem
   de estruturas/canteiros muda.
5. `hauler.wanted` é 0 sem container de source, 1 com link network, senão
   `min(4, containers+1)`. Os modos `load`/`deliver` do `hauler.run` só trocam
   nos extremos. *(smoke asserta wanted + no-throw nos dois modos)*

## Outcome

Entregue. Novo `utils/move.js` (`travel`, `roomMatrix`, `nativeMoveTo`) +
`prototypes/move.js` (override + fallback). Novo `roles/hauler.js`; registrado
após `miner`; adicionado a `ECONOMY_ROLES`; `harvester.wanted` cai para 2 com
miner + hauler; `intel.numberOfHaulers`.

## Follow-ups

- Um traffic resolver central de 1 tick deliberadamente **não** foi construído
  ainda — ver ROADMAP "Later". `travel` só faz swap-com-parado quando preso.

## Bug fixes (pós-entrega)

- **Workers parados estavam sendo empurrados.** O swap-quando-preso do `travel`
  movia *qualquer* creep nosso do tile seguinte, inclusive um miner no seu
  container. Corrigido: `isParked()` (role em `{miner, upgrader}`,
  `memory.onContainer`, ou em cima de um container/link) — creeps parados são
  contornados, nunca empurrados. *(smoke: "travel never shoves a parked worker
  off its tile")*
- **Builder / upgrader mineravam em vez de usar energia armazenada.** A ordem
  de "get energy" checava `findNearbyFullSource` (minerar uma source a 5 tiles)
  *antes* de links / containers / storage / energia caída. Reordenado: minerar
  é o último recurso.
- **Builder andava longe atrás de uma pilha no chão passando por um container
  próximo.** A ordem era drops → estruturas → source. Agora toda energia
  armazenada/caída (drops, tombstones, ruins, links, containers, storage) é
  **um pool único escolhido por menor caminho** (`builder.energyPiles`);
  minerar fica por último. `Creep.prototype.runGetEnergy` ganhou saque de
  `Tombstone`. *(smoke: "builder takes the closest energy … not the far dropped
  pile")*
- **Hauler ficava parado carregando energia.** O modo só trocava de `load`
  para `deliver` quando o `store` enchia **completamente** (`free === 0`). Com
  carga parcial e nada mais para pegar, o hauler ficava em `load`, `pickLoad`
  retornava `null`, e ele ia para `idleNear` (parado a alcance 3 do storage)
  segurando a energia. Corrigido: em `load` sem nada para pegar mas carregando
  algo → troca para `deliver` no mesmo tick. Thresholds de `pickLoad` baixados
  de 100 → 50. *(smoke: "hauler with a partial load and nothing to pick up
  switches to deliver")*
- **Links coletores são intocáveis para withdraw.** Só o miner os alimenta e
  eles despacham para os links da base. `builder.energyPiles` incluía qualquer
  link — agora filtra `!s.isCollector()` (hauler / upgrader / bootstrap já
  filtravam). *(smoke: "builder never withdraws from a collector link")*
