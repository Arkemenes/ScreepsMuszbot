# 0048 — Flavored creep names (random name, role-relevant title)

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

`old_1/prototype.spawn.js`'s `getCreepName()` dava a cada creep um nome de
**4 partes**: `"Nome Sobrenome,\n{Título parte 1} {Título parte 2}"`
(ex.: `"Carmine Voss,\nLord of the Damned"`), sorteado de listas de ~300
entradas cada. Hoje todo creep spawnado no `src/` atual recebe só
`"<Role>" + Game.time` (ex.: `"Hauler1234567"`) — funcional, mas sem graça.
O usuário quer de volta as 4 partes do formato antigo, mas com uma regra
melhor: **nome e sobrenome podem ser aleatórios, as duas partes do título
têm que sempre refletir o que o creep faz** (no esquema antigo, o título
vocativo (parte 1: "Lord"/"Captain"/"Queen"...) e o adjunto (parte 2: "of
the Damned"/"of Fire"...) eram genéricos e não tinham relação nenhuma com
o role real do creep).

## Desired outcome

Todo creep spawnado ganha um nome de 4 partes: `"<PrimeiroNome>
<Sobrenome>,\n<TítuloParte1> <TítuloParte2>"` (ex.:
`"Wren Kestrel,\nExcavator of the Deep Vein"` pro miner, `"Corvin
Ashford,\nSentinel of the Wall"` pro defender). Primeiro nome e sobrenome
são sorteados de listas genéricas grandes (sem relação com o role).
**Ambas** as partes do título são sorteadas de pools **específicas do
role** (e, pro `reserver`, da missão - `reserve`/`claim`/`contest` têm
pools de título diferentes, já que fazem coisas bem diferentes) — ao
contrário do old_1, nenhuma das duas partes é um vocativo genérico
desconectado do que o creep faz. Nomes se repetem entre creeps diferentes
(aceitável - é só flavor), mas o gerador nunca produz um nome já em uso por
um creep vivo (`Game.creeps`), então nunca colide de propósito.

## In scope

- Novo módulo `src/utils/names.js`: `generate(key)` — `key` é o nome do
  role (`"miner"`) ou `"role:mission"` (`"reserver:claim"`). Monta
  `"<primeiro nome> <sobrenome>,\n<título parte 1> <título parte 2>"` -
  primeiro nome/sobrenome de listas genéricas grandes; parte 1 e parte 2
  cada uma sorteada independentemente do pool `{part1, part2}` do `key`
  (ou do pool base do role se `key` tiver mission mas não houver pool
  específico, ou um pool genérico de 1 entrada capitalizado a partir do
  role se não houver pool nenhum); tenta até 20 combinações únicas contra
  `Game.creeps` antes de aceitar uma colisão (nesse caso extremo,
  `rooms/spawning.js` já trata `spawnCreep()` retornando erro sem crashar
  - fail-soft existente, não precisa de garantia 100% aqui).
- Pools de título (`part1`/`part2`) por role, cobrindo todo role que
  spawna hoje: `builder`, `bootstrap`, `defender`, `defenderMedic`,
  `defenderStriker`, `hauler`, `miner`, `pioneer`, `raider`,
  `remoteHauler`, `remoteMiner`, `scout`, `squadDismantler`, `upgrader`, e
  `reserver:reserve`/`reserver:claim`/`reserver:contest`.
- Toda `spawnData()` de `src/roles/*.js` troca `"<Role>" + Game.time` por
  `names.generate(key)`.

## Out of scope

- Variar o título por corpo/tamanho do creep (o que old_1 fazia) — o
  usuário pediu título ligado ao **role**, não ao tamanho.
- Casar a primeira letra do sobrenome com a do role (old_1 fazia isso, de
  forma um tanto arbitrária) — o usuário pediu pra revisar a lógica, não
  replicá-la; sobrenome é livre.
- Persistir nomes usados em Memory pra evitar repetição entre gerações
  distantes — repetição entre creeps que nunca coexistem é inofensiva e
  não vale o custo de Memory.

## Acceptance criteria

1. `names.generate("miner")` devolve uma string de 4 partes no formato
   `"<Nome> <Sobrenome>,\n<Parte1> <Parte2>"` onde `<Parte1>` está em
   `TITLE_POOLS.miner.part1` e `<Parte2>` em `TITLE_POOLS.miner.part2` —
   `test/smoke.js`: roda a geração N vezes e checa o formato/pools.
2. `names.generate("reserver:claim")` usa o pool específico de
   `reserver:claim`, diferente do pool de `reserver:reserve` —
   `test/smoke.js`: `"reserver mission-specific titles differ by
   mission"`.
3. `names.generate()` nunca devolve um nome já em `Game.creeps` quando
   existe pelo menos uma combinação livre — `test/smoke.js`: preenche
   `Game.creeps` com todas as combinações de um pool de 1x1 e 1 nome/
   sobrenome, checa que uma segunda chamada com um nome extra disponível
   ainda acha algo livre.
4. Toda `spawnData()` de role usa `names.generate` — `test/smoke.js`: roda
   `main.loop()` (já cobre spawn de vários roles) e checa que nenhum nome
   gerado é `"<Role><number>"` (o formato antigo) e que todo nome gerado
   contém a quebra de linha das 4 partes.

## Constitution check

- **CPU:** `generate()` roda só na hora de montar `spawnData()` (já
  acontece no máximo 1x por spawn ocioso por tick) - custo desprezível
  (algumas escolhas de array + no máximo 20 checagens em `Game.creeps`,
  que já é um objeto no heap, sem `room.find`).
- **Memory:** nenhuma - nomes não são persistidos além do que
  `Game.creeps`/`Memory.creeps` já fazem nativamente.
- **Fail-soft:** uma colisão residual (extremamente rara, só com centenas
  de creeps vivos com o mesmo role/mission) já cai no tratamento de erro
  existente de `spawnCreep()` em `rooms/spawning.js`.
- **Determinismo:** a escolha em si usa `Math.random()` - puramente
  cosmético, nunca influencia uma decisão de jogo (corpo, role, alvo,
  contagem) - só o texto exibido. O smoke test verifica formato/
  propriedades (título pertence à lista certa, nunca colide), não uma
  string exata.

## Open questions

Nenhuma - decisão já fechada com o usuário (nomes aleatórios, títulos
sempre ligados ao role, lógica nova em vez de portar a do old_1).
