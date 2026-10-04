# 0117 — Miner esvazia container e store quando a source zera

**Status:** done

## Problema

Com o miner gordo (0114, W15) a source esgota em ~100 dos 300 ticks do ciclo;
nos ~200 restantes o miner fica parado esperando a regeneração. Nesse tempo a
energia que sobrou no container e no store do miner só sai por conta do hauler,
e o `distribute()` só puxava o container com backlog ≥ `miner.pullBacklog`
(500) e só enviava o store em carga cheia (batch).

## Resultado desejado

Source com `energy === 0` ("drenando"): o miner usa a janela ociosa para
esvaziar **o próprio store e o container** no que estiver adjacente.

- Puxa a energia do container sem o gate de backlog, **só se houver quem
  receba**: link coletor com espaço, ou torre que `hauler.shouldMinerFeedTower`
  aceita. Puxar do container para devolver a ele seria ruído.
- Envia o store na hora (ignora o batch "ainda cabe outro harvest").
- Mesma cascata de destino de sempre (torre até a reserva → link → container);
  o container só recebe a carga do próprio miner quando não há link/torre, nunca
  é preenchido a partir de si mesmo.
- Source com energia: comportamento inalterado (batch, backlog de 500).
- Sem flag nem config nova.

## Fora de escopo

Mineral container do `mineralMiner` (sem CARRY, não distribui).

## Riscos

- Compete com o hauler pela energia do container; a cascata respeita
  spawn/extensions (`shouldMinerFeedTower` é falso quando precisam de energia e
  a energia vai para o link, que a leva ao storage).
- Custo de CPU: ~2 intents/tick (withdraw + transfer) enquanto houver energia
  no container; esvazia 200 (C4) por tick.

## Critérios de aceitação (smoke)

- `0117: source empty -> a partial load is flushed to the link right away`
- `0117: source with energy -> unchanged, keeps filling for a full load`
- `0117: source empty -> a small container stock is drained too (no 500 backlog gate)`
- `0117: source with energy -> a small container stock is still left to the haulers`
- `0117: source empty and nothing to empty -> no actions`
- `0117: source empty but no link/tower to receive -> container is not touched`
- `0117: source empty, no link -> the carried load still goes to the container`
- `0117: source empty -> pull the container and flush the store in the same tick`
