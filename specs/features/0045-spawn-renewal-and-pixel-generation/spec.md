# 0045 — Spawn creep renewal + CPU bucket pixel generation

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

Um levantamento comparando o `src/` atual com dois códigos anteriores
abandonados (`old_1/`, `old_2/`) achou duas mecânicas de `old_1` sem
equivalente hoje:

1. **Renovação de creep no spawn** (`old_1/prototype.spawn.js`): quando um
   spawn está ocioso e a sala tem energia de sobra, `old_1` procurava um
   creep caro e perto de morrer parado do lado do spawn e chamava
   `renewCreep()` nele em vez de deixá-lo morrer — mais barato e mais rápido
   do que gastar um ciclo de spawn inteiro num substituto. Hoje `rooms/
   spawning.js` nunca chama `renewCreep()` — todo creep simplesmente morre
   no fim da vida e é substituído do zero.
2. **Geração de Pixel** (`old_1/main.js`): `Game.cpu.bucket == 10000 &&
   Game.cpu.generatePixel()`. Hoje nada em `src/main.js` chama
   `Game.cpu.generatePixel()` — um bucket cheio nunca é convertido em Pixel.

Nenhuma das duas depende da outra; agrupadas aqui só porque são as duas
mecânicas "de paridade com o old_1" desta rodada (mesmo padrão do 0018, que
agrupou vários itens pequenos pedidos pelo usuário).

## Desired outcome

Um spawn ocioso, numa sala com energia de sobra, que tenha um creep caro e
perto de morrer parado do seu lado, renova esse creep em vez de deixá-lo
morrer — sem competir com a fila normal de spawn (só acontece quando o
spawn já estaria ocioso mesmo). Separadamente, sempre que o bucket de CPU
está cheio, o bot converte automaticamente para Pixel em vez de deixar o
bucket saturado sem uso.

## In scope

- `src/rooms/spawning.js`: antes de montar a fila de pedidos normal, cada
  spawn ocioso tenta renovar um creep adjacente (`range 1`) que seja caro
  (`bodyCost(creep.body) >= renew.minBodyCost`) e esteja perto de morrer
  (`ticksToLive <= renew.ticksToLiveThreshold`), desde que a sala tenha
  energia disponível acima de `renew.minEnergyRatio` da capacidade. Um creep
  com `CLAIM` no corpo nunca é candidato (o motor do jogo já recusa
  renovação de corpo com `CLAIM`; filtrado aqui só pra não gastar a
  tentativa). Um spawn que renova neste tick não tenta também spawnar nesse
  mesmo tick (fica de fora do resto da fila daquele tick).
- `src/utils/census.js`: novo `allInRoom(roomName)` — todo creep da sala,
  de qualquer role, lendo do cache de `Game.creeps` já construído por
  `build()` (sem `room.find` novo).
- `src/main.js`: `guard("pixel", ...)` — quando `Game.cpu.bucket >=
  pixel.bucketThreshold` e `Game.cpu.generatePixel` existe (o servidor real
  sempre tem; o smoke test simula sob controle), chama
  `Game.cpu.generatePixel()`.
- `src/utils/config.js`: `renew.ticksToLiveThreshold` (300),
  `renew.minBodyCost` (1000), `renew.minEnergyRatio` (0.8),
  `pixel.bucketThreshold` (10000), `pixel.enabled` (true).

## Out of scope

- Mandar um creep se deslocar até o spawn pra ser renovado — é puramente
  oportunista, só quando o creep já está lá por outro motivo (entregando
  energia, de passagem). Isso é o mesmo espírito do `old_1`.
- Qualquer heurística mais sofisticada de "vale a pena renovar" (ex.:
  comparar custo de renovação vs. custo de um substituto do zero) — os
  thresholds de config já cobrem o caso de uso (creep caro, quase morrendo,
  sala com energia de sobra) sem precisar calcular o custo exato de
  `renewCreep()` (que depende do nível do creep e não é trivial de
  antecipar).
- Desabilitar Pixel quando a sala está sob ataque ou outro estado especial
  — bucket cheio significa CPU sobrando de qualquer forma; não há custo
  real em converter.

## Acceptance criteria

1. Um spawn ocioso com um creep caro (`bodyCost >= renew.minBodyCost`) e
   perto de morrer (`ticksToLive <= renew.ticksToLiveThreshold`) adjacente,
   numa sala com energia acima do piso, chama `renewCreep()` nele —
   `test/smoke.js`: `"an idle spawn renews an adjacent expensive dying
   creep instead of letting it die"`.
2. O mesmo spawn NÃO renova um creep barato (corpo abaixo de
   `renew.minBodyCost`) — `test/smoke.js`: `"a cheap creep next to an idle
   spawn is not renewed"`.
3. Nenhuma renovação acontece com a sala abaixo do piso de energia
   (`renew.minEnergyRatio`) — `test/smoke.js`: `"renewal never fires below
   the room's energy ratio floor"`.
4. Um spawn que renovou neste tick não aparece mais na lista de spawns
   disponíveis pro resto da função (não tenta também `spawnCreep` no mesmo
   tick) — `test/smoke.js`: `"a spawn that renews this tick is excluded
   from the same tick's spawn queue"`.
5. Com `Game.cpu.bucket >= pixel.bucketThreshold`, `main.loop()` chama
   `Game.cpu.generatePixel()` uma vez por tick — `test/smoke.js`: `"a full
   CPU bucket generates a pixel every tick"`.
6. Com o bucket abaixo do threshold, `generatePixel()` não é chamado —
   `test/smoke.js`: `"generatePixel() is not called below the bucket
   threshold"`.

## Constitution check

- **CPU:** `allInRoom()` reaproveita o cache de `census.build()` (uma
  varredura de `Game.creeps` por tick, já existente) — nenhum `room.find`
  novo. A checagem de renovação só roda pros spawns já ociosos
  (`!s.spawning`), que já eram varridos por `spawnCreeps()`.
- **Memory:** nenhum estado novo em `Memory` — renovação é decidida do zero
  todo tick a partir do estado ao vivo do jogo.
- **Fail-soft:** `renewCreep()`/`generatePixel()` são chamadas nativas que
  retornam código de erro sem lançar exceção; um resultado != OK só significa
  "não rolou este tick", sem efeito colateral.
- **Config over hardcode:** os 5 thresholds vivem em `utils/config.js`.
- **Offline test:** `test/smoke.js` cobre os 6 critérios acima com mocks de
  `spawn.renewCreep`/`Game.cpu.generatePixel`.

## Open questions

Nenhuma — escopo pequeno e paridade direta com uma mecânica já existente em
`old_1`.
