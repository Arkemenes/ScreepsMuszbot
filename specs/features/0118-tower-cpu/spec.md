# 0118 — CPU da torre: medir e cortar o custo por tick

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-10-03
- **Relacionadas:** 0119 (Room.find por tick), 0072 (reparo em 3 tiers), 0113 (cpuMeter)

## Problem

`structures/tower.js` consome em média **~1,5 CPU/tick** (medição do usuário,
grupo "estruturas" do `cpuMeter`, 0113). As demais estruturas ficam abaixo de
10% disso. Em tempo de paz a torre não ataca nem cura: o custo vem do ramo de
**reparo**. Dúvida do usuário: "não sei se está usando cache".

Leitura do código (hipóteses, ainda sem medição por trecho — ver Open questions):

1. **Ordenação a cada tick.** `computeRepairCandidates()` só rescaneia
   `FIND_STRUCTURES` a cada `REPAIR_SCAN_TICKS` (5), mas **toda tick** resolve
   os ids com `Game.getObjectById` e roda `_.sortBy(list, rampartRepair.priority)`.
   `priority()` chama `tier()`, que chama `config.get(...)` 2× por estrutura;
   `config.get` faz `path.split(".")` e percorre `Memory.settings` a cada
   chamada. Com centenas de ramparts/walls danificados, isso é N × (split +
   lookups) por tick.
2. **Elegibilidade por torre.** `findRepairTarget()` roda `candidates.find(...)`
   com `towerMayRepair()`, que chama `tier()` de novo (+2 `config.get`) e mais 2–4
   `config.get` por candidato — e isso se repete **por torre**.
3. **Intents.** `tower.repair()` custa 0,2 CPU de intent por chamada (custo fixo
   do motor). Reparo contínuo de tier "ótimo" (hardening) mantém todas as torres
   emitindo intent todo tick.
4. **Cura.** `findHealingTarget()` faz `room.find(FIND_MY_CREEPS, {filter})` uma
   vez por sala por tick quando não há hostil (cacheado por tick, mas é um
   `find` com filtro sobre todos os creeps; `census` já tem esses creeps).
5. `energyLedger.creditTower` e `getHostiles` são baratos/cacheados em paz.

## Desired outcome

CPU médio do grupo `tower` ≤ ~0,3/tick (meta a confirmar com a medição da
Task 1), **sem mudar nenhuma decisão** de ataque/cura/reparo (as políticas de
0067–0074 e 0101 são invariantes). Quem opera vê a queda no painel "CPU por
tipo de estrutura" do Grafana.

## In scope

- Spans do `cpuMeter` dentro de `tower.run` (hostil, cura, montar lista de
  reparo, escolher alvo, intent) — para a medição decidir o que cortar.
- Resolver `tier()` com limiares lidos **uma vez por tick** (não por estrutura).
- Lista de reparo ordenada reaproveitada entre ticks (re-sort só quando o scan
  muda ou a cada N ticks), mantendo o reparo de tier crítico responsivo.
- Cadência para reparo **não-crítico** (satisfatório/ótimo) — não precisa
  emitir intent todo tick; crítico continua todo tick.
- Alvo de cura vindo de uma passada única já existente (`census`/`roomCache`).

## Out of scope

- Mudar limiares (`tower.*`, `repair.*`, `logistics.*`) ou a política de ataque.
- O custo de `Room.find` em geral (é a 0119).

## Acceptance criteria

1. Smoke: com 3 torres e ≥200 estruturas danificadas, o nº de chamadas a
   `config.get` por tick no módulo da torre é ≤ constante pequena (contador no
   stub), independente do nº de estruturas.
2. Smoke: `_.sortBy`/ordenação da lista de reparo roda ≤ 1× por sala por janela
   de re-sort (não 1× por tick por torre).
3. Smoke: em cenário fixo, a versão nova escolhe **o mesmo alvo** que a antiga
   (teste de equivalência) para ataque, cura e reparo crítico/satisfatório/ótimo.
4. Smoke: alvo crítico novo é reparado no mesmo tick em que aparece, mesmo com a
   lista reaproveitada (sem regressão de latência no crítico).
5. In-game: `cpuMeter` grupo `tower` com média ≤ meta após 1 janela de 60 ticks.

## Constitution check

- §1 CPU: é o objetivo da feature. §6 Config: limiares continuam em
  `config.get`, só deixam de ser lidos por estrutura. §3: nenhum subsistema novo
  fora do `guard()`. §4: contador de `config.get`/sort no stub do smoke.

## Open questions

- **Medir antes de cortar:** quantas torres/salas, e qual fração do 1,5 vem de
  sort/config vs intents vs find? A Task 1 (spans) responde; o plano só é
  escrito depois.
- Meta de CPU: 0,3/tick é palpite — aceitar outra após a medição?
- Cadência do reparo não-crítico: a cada 2/5/10 ticks?

## Investigação (2026-10-03) — instrumentação entregue

`cpuTop()` (29 ticks): média 16,30/tick, guarded 12,61, **unguarded 3,69**; `tower` 1,573 (11 chamadas/tick), `builder` 2,327 (3 chamadas/tick).

Hipóteses a confirmar com `profile(100)` (agora imprime `[profile] config.get callers`):
1. `findRepairTarget` percorre a lista inteira quando nenhum candidato é elegível (torre < 70% de energia, sem alvo crítico), com `tier()` + `config.get` por candidato, por torre.
2. O sort por tick em `computeRepairCandidates` e os dois filter+sort do builder (`criticalRepairCandidates`, `builderRepairTargets`) refazem o mesmo trabalho sobre `roomCache.structures` — candidato a um módulo único por sala/tick.
3. `config.get` não tem cache de `split` por path.

Novo: grupo `tick` no `cpuMeter` (`entry`, `prelude`) e `cpuProbe()` (custo do próprio guard/getUsed).

## Resultado da medição e implementação (2026-10-03)

Linha de base `cpuTop()` sem profile: 16,30 CPU/tick, unguarded 3,69.

- **Causa maior (não era a torre):** `maybeEnableProfiler` lia `Memory.settings` antes do swap de `memory.wrap`, forçando um `JSON.parse` do `Memory` inteiro por tick. `memory.wrap` virou a camada externa → 13,65 CPU/tick, unguarded 0,90 (−2,65).
- **`config.get`:** 1819 chamadas/tick; ~70% em `towerMayRepair`/`tier`/`worthRepairing`/sort. Limiares e gates de storage lidos 1×/tick (`rampartRepair.limits()`), chave de ordenação numérica (`priorityKey`), a torre interrompe o laço quando só restam alvos não críticos e ela está abaixo de 70% de energia; `config.get` cacheia o `split` por path.
- `stats`: reconstruído a cada `stats.publishInterval` (60) ticks; janela do `cpuMeter` fecha na hora.
- Hauler: resposta nula de `pickMineralJob`/`pickChainFeedJob` lembrada no tick. `getIntel`: removidos `numberOfLinks`/`numberOfContainers` (ninguém lia) + spans.
- Guard-rail: `profile(N)` encerra sozinho abaixo de `profile.minBucket` (4000).

Pendente: medir o ganho no `cpuTop()` pós-deploy; decidir lista de reparo compartilhada torre/builder se o custo restante justificar.

### Rodada 2 (ARK-34 e correlatos, 2026-10-03)

- `hostiles.bodyInfo(creep)`: resumo do corpo (partes por tipo + boost) em cache de heap por id, relido a cada 25 ticks. `creep.body` é reconstruído pelo motor a cada leitura; `getHostiles`, as 3 leituras da torre e `defense.attackReach` passam a usar o resumo (intel.hostiles chegou a 2 CPU/tick com um hostil presente).
- `mineralMiner`: `mineralSite`/`run` usam `roomCache.structuresNear` em vez de `pos.findInRange` (maior caller de `Room.find`, 4 chamadas/tick).
- `getIntel`: removidos os 12 contadores `numberOf*` mortos (só `numberOfTowers` é lido, por `raiding.js`) com purga única das chaves antigas; sala observada não faz mais `FIND_STRUCTURES` (torres vêm do scan hostil). Preparação para a observação frequente (DEFCON, corredores).

### Rodada 3 (base 60, 2026-10-03)

`profile(50)` com bucket sadio (48 ticks): `getIntel` 0,96/tick, `Creep.move` 0,65 (intent, custo fixo do motor), `upgradeController` 0,57 (idem), `shouldMinerFeedTower` 0,43, `bootstrap.wanted` 0,30. `Room.find` 53/tick custa só ~0,15 CPU/tick no total.

- **Base 60:** `market.currentInterval` 100→120, `marketFlip.scanInterval` 60 (já), `stats.barrierHitsInterval` 50→60, `terminalOps` INDEX_REFRESH_TICKS 50→60. `utils/orderBook`: um único `getAllOrders()` por tick compartilhado; `orderBook.due()` alinha os jobs periódicos na grade do tick 0 (não "N ticks depois da última vez"), então market (120) e marketFlip (60) caem no mesmo tick.
- **Economia:** `computeEconomySnapshot` e `hauler.spawnExtNeedingEnergy` varriam todas as extensões (`store.getFreeCapacity`) de cada sala, todo tick, para achar "ninguém com fome". Com `energyAvailable >= energyCapacityAvailable` (`resourceTiers.spawnsAndExtensionsFull`) o scan é dispensado.

### Rodada 4 (cadência base 60, 2026-10-03)

`cpuTop()` pós-rodada 3: 10,83/tick com um scan de mercado na janela (`market` pico 26 CPU, `marketFlip` 8). Spans do hauler caíram (`minerFeedTower` 0,26-0,41 → 0,07; `pickMineralJob` 0,30 → 0,04) com o atalho de energia cheia.

- `utils/cadence.due(last, interval)`: grade fixa a partir do tick 0; é a regra de todo trabalho periódico (market 120, marketFlip 60, `craft.tickInterval` 10, `terminalOps.tickInterval` 5).
- `market.scan`: melhor nível do livro em 1 passada (antes 2 filter + sort por recurso/lado), agrupamento do livro memoizado e compartilhado com `marketFlip`, medianas temporais em cache até as amostras horárias mudarem. `marketFlip.bestOrder` também em 1 passada.
- `craftChain` a cada 10 ticks e `terminalOps` a cada 5 (intervalo ≤ 1 desliga a grade: o smoke dirige essas máquinas tick a tick).
- Intervalos raros na base 60: `terminalOps.repriceInterval` e `logistics.balanceInterval` 1000 → 1200, `needs.cacheTicks` 5 → 10. `traffic.decayInterval` não mudou: o decay é aplicado por intervalo, mudar o intervalo mudaria a retenção.

### Rodada 5 (2026-10-03)

`cpuTop()` pós-rodada 4: 10,61/tick incluindo o tick de reset do deploy (`entry` max 22,7) e o primeiro scan de mercado com caches frios (`market` max 25). `terminalOps` 0,83 → 0,31, `craftPlanner` 0,36 → 0,11. `link` subiu a 0,48 (era ~0,17).

- `StructureLink.isCollector()`: resposta em heap por id (a posição de uma estrutura não muda); era 2 getters do motor (`pos`, `memory`) por chamada, de 6 chamadores, em todo link todo tick.
- `energyPiles`: só storage/container/link receptor podem ser pile; usa as listas por tipo do `roomCache` em vez de `s.store` em todas as estruturas da sala.
- Spans novos para a próxima medição: `builder.opportunistic`, `builder.repairList`, `builder.pickPile`, `hauler.pickLoad`, `miner.distribute`.

### Rodada 6 (2026-10-03)

`cpuTop()` pós-rodada 5 (51 ticks, sem eventos de reset): **7,62 CPU/tick** (16,30 no início), unguarded 0,43. Spans: `builder.opportunistic` 0,84 de 1,61 do builder; `miner.distribute` 0,64 de 1,44 (0,33 é o `shouldMinerFeedTower` aninhado); `hauler.pickLoad` 0,26.

- `utils/damagedStructures`: uma lista de estruturas danificadas por sala, escaneada a cada `repair.scanTicks` (5; todo tick sob ataque) e ordenada 1×/tick, compartilhada por torre e builder. Antes: scan de 5 ticks da torre + 2 filter/tier sobre todas as estruturas da sala, por tick, no builder. Um dano novo é visto em até 5 ticks (o reparo crítico oportunista do builder herda isso, como a torre já tinha); estrutura reparada sai da lista no mesmo tick.
- `getEconomySnapshot`: torres via lista por tipo, teste de energia antes da consulta ao plano; `isSourceDefenseTower` em cache por id (60 ticks).

### Rodada 7 (2026-10-03)

`profile(50)` (48 ticks, bucket sadio, limite `profile.minBucket` 100): `findClosestByPath` 11,6 chamadas/tick (0,66 CPU/tick, maior custo de engine que não é intent); `pickLoad` 1,2 sob o profiler; `controllerContainerCandidates` dispara um `Room.find` por chamada via `findInRange`; `getIntel` ainda lidera o profile (0,23 por sala).

- `hauler.pickLoad`: `biggestEnergyDrop(room)` (1×/tick/sala, via `roomCache.droppedResources`) dispensa os dois `findClosestByPath(FIND_DROPPED_RESOURCES)` quando nenhuma pilha de energia passa do limite (a quantidade estimada nunca excede a real).
- `controllerContainerCandidates`: `roomCache.structuresNear` no lugar de `pos.findInRange`.
- `intel.controller`: span novo para decidir se o bloco de leitura do controller (`reservation`/`my`/`owner`/`level`) pesa no `getIntel`.

### Rodada 8 (2026-10-03)

`cpuTop()` pós-rodada 7: 8,11/tick (46 ticks). `intel.controller` 0,024, `intel.hostiles` 0,019, `intel.enemyScan` 0,008: o resto do `getIntel` é o primeiro `FIND_STRUCTURES` do tick (que o `roomCache` entrega a todos os módulos seguintes), não removível. Pico único de 13,9 no `intel`, fora dos spans (leitura de sala nova). `hauler.pickLoad` 0,84/tick com 3,6 chamadas/tick: o hauler em `job=load` refazia a cascata (path search até o mesmo container) a cada tick.

- `pickLoad` guarda a escolha por creep por `hauler.repickTicks` (5): reaproveita enquanto o alvo existe com 50+ de energia e nenhuma pilha acima de `hauler.bigDropLoad` aparece (a tier "bigDrop" continua ganhando no mesmo tick). Escolhas com `amount` fixo (terminal) nunca são reaproveitadas. Custo de comportamento: uma tier de prioridade mais alta que não seja pilha grande (link urgente, terminal) pode levar até 5 ticks para preemptar uma viagem em curso.

### Rodada 9 (2026-10-03)

`cpuTop()` pós-rodada 8: **7,40/tick** (32 ticks; 16,30 no início). `pickLoad` 0,84 → 0,62; `spawn` 0,62 (o maior módulo fora de `creep`): `spawn()`/`spawnData()` de todos os roles reavaliados a cada tick com spawn ocioso, mesmo sem nada a construir.

- `spawning`: veredito "nada desejado" por sala em heap; vale enquanto o objeto de `roomNeeds` (cache de `needs.cacheTicks`=10, recalculado a cada tick sob ataque ou após override do console) e a contagem de creeps da sala forem os mesmos. Sala com pedido pendente nunca é pulada (espera energia, reavaliada todo tick). Sob ataque nunca pula.

### Rodada 10 — ramparts por portão (2026-10-03)

`rampart.run` rodava 82x/tick (0,057 CPU/tick) com checagens de distância por rampart e duas buscas de `FIND_HOSTILE_CREEPS` por sala.

- `structures/rampart.js`: `runRoom(room)` por sala/tick. Aliado na sala e nenhuma ameaça (não aliado armado/WORK, Invader, ou com CLAIM) → os **portões** ficam públicos; senão fecham no mesmo tick. As demais ramparts ficam sempre fechadas (varredura de resíduos após reset, ao mudar o conjunto de portões e a cada 60 ticks).
- `utils/rampartGates.js`: portões = ramparts sobre o caminho mais barato entre cada par de saídas, só quando não há caminho que evite ramparts. Pode dar 0 portões (o aliado passa por fora). Console `rampartGates()` (no `help()`).
- `roomCache.foreignCreeps`: uma busca de creeps não próprios por sala/tick, base de `getHostiles` e do rampart.
- `main`: o laço por estrutura pula ramparts; uma chamada `rampart:<sala>` por sala.
- Medição: span `rampart.toggle` (só ticks com mudança de estado).
