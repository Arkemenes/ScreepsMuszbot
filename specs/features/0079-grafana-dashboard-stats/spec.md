# 0079 — Expandir `Memory.stats` para o dashboard Grafana

- **Status:** in-progress (Fácil + Médio entregues; Complexo pendente,
  `defcon` retirado do escopo — ver Outcome)
- **Owner:** usuário + assistente
- **Created:** 2026-09-15

## Problem

Servidor: **screeps.com oficial, shard3**, bot como código do jogador (sem
Overmind). `src/utils/stats.js` (`exportStats()`) grava hoje em
`Memory.stats` só GCL, um resumo raso por sala (energia de
storage/terminal, energia disponível/capacidade, progresso e nível do
controller), CPU (`bucket`/`limit`/`used`) e `Game.time` — chamado a cada
tick via `guard("stats", () => utils.stats())` em `main.js` (não a cada 10
ticks; não existe throttle nenhum hoje, ao contrário do que uma nota
anterior supunha). Um exportador Python externo (`exporter.py`, fora deste
repo) lê `Memory.stats` pela API oficial
(`GET /api/user/memory?path=stats&shard=shard3`, header `X-Token`), expõe
como métricas Prometheus na porta `9101`; Prometheus faz scrape, Grafana lê
do Prometheus.

O usuário já tem um **dashboard Grafana pré-configurado**, copiado pra
[`screeps-dashboard.json`](screeps-dashboard.json) nesta pasta (achado em
`~/Downloads/screeps-dashboard.json`) — não é mais "inspirado no Overmind
em abstrato", é um contrato concreto: cada painel tem uma query PromQL
fixa (`expr`) e, nos painéis que dependem de campo novo, uma `description`
que já nomeia o caminho exato de `Memory.stats` esperado (ex.: *"Requer
`rooms.<room>.defcon` no `Memory.stats`"*). Os nomes de métrica/campo do
dashboard batem com os da spec original do usuário — ele foi montado a
partir dela. `Memory.stats` de hoje não tem dado suficiente pra 4 das 8
seções do dashboard (`CPU / Memória — Avançado`, `Salas — Avançado`,
`Minerais e Compostos`, `Mercado`, `Terminal Network`) — os painéis dessas
seções mostram "sem dados" até os campos existirem.

## Desired outcome

`Memory.stats` passa a carregar, além de tudo que já grava hoje (sem
remover nem renomear nada existente), todo campo que o dashboard
pré-configurado espera — cada um mapeado 1:1 pra uma métrica/painel
específico do JSON (tabela abaixo). Depois desta spec implementada, o
dashboard mostra dado real em toda seção **exceto** "Mercado" (painéis de
transação) e "Terminal Network" — essas continuam de propósito com "sem
dados", porque não há chamada real a `Game.market.deal()`/`terminal.send()`
no bot hoje pra gerar o dado (ver "Out of scope"); os outros dois painéis
de Mercado (`Créditos` e `Δ Créditos/24h`) já ficam com dado real, só os
de "Transações" que dependem de instrumentação futura.

## Classificação por dificuldade

Fonte de cada linha: leitura direta do jogo já cacheada (`utils/roomCache`)
vs. heurística nova vs. detecção sem sinal direto do motor. Nome de campo e
label seguem exatamente o que [`screeps-dashboard.json`](screeps-dashboard.json)
já espera (não é negociável sem editar o dashboard também).

### Fácil — leitura O(1) ou soma trivial de campo já coletado

| `Memory.stats` | Métrica Prometheus (painel) | Fonte |
|---|---|---|
| `memory.used` | `screeps_memory_used_bytes` ("Uso de Memória") | `RawMemory.get().length` |
| `cpu.heap.total_heap_size` | `screeps_heap_total_bytes` ("Heap Statistics") | `Game.cpu.getHeapStatistics().total_heap_size` |
| `cpu.heap.heap_size_limit` | `screeps_heap_limit_bytes` ("Heap Statistics") | `Game.cpu.getHeapStatistics().heap_size_limit` |
| `cpu.heap.used_heap_size` | `screeps_heap_used_bytes` ("Heap Statistics") | `Game.cpu.getHeapStatistics().used_heap_size` |
| `market.credits` | `screeps_market_credits` ("Créditos" + "Δ Créditos/24h", derivado sem campo extra) | `Game.market.credits` |
| `rooms.<room>.totalEnergyAssets` | `screeps_room_total_energy_assets` ("Energia total por sala") | `storageEnergy + terminalEnergy`, já coletados |

`total_available_size`/`does_zap_garbage` de `getHeapStatistics()` **não**
são gravados — nenhum painel do dashboard os lê, e Memory pequena é
princípio (constitution §2).

### Médio — lógica nova, mas sem heurística de classificação nem sinal ambíguo

| `Memory.stats` | Métrica Prometheus (painel) | Fonte |
|---|---|---|
| `rooms.<room>.hatcheryUptime` | `screeps_room_hatchery_uptime` ("Hatchery Uptime por sala") | fração de spawns com `.spawning` truthy, via `utils/roomCache.myStructures(room)` — sem `room.find` novo |
| `rooms.<room>.avgBarrierHits` | `screeps_room_avg_barrier_hits` ("Média de hits em ramparts/walls") | média de `.hits` rampart/wall via `roomCache.myStructures(room)`, **throttlado** (`stats.barrierHitsInterval`, constitution §1/§6) |
| `persistent.lastGlobalReset` | `screeps_last_global_reset_tick` ("Ticks desde último Global Reset") | sinal em heap global (fora de `Memory`) ausente no início do loop |
| `rooms.<room>.minerals.<H\|O\|U\|K\|L\|Z\|X>` | `screeps_room_mineral{mineral="..."}` ("Minerais base por sala") | soma `storage.store[X] + terminal.store[X]`, 7 chaves fixas conhecidas |

### Complexo — heurística nova ou detecção sem sinal direto do motor

Ainda **não implementado** nesta rodada (só Fácil + Médio entraram, ver
Outcome) — fica como continuação em aberto desta mesma spec, sem status
`ready` até as Open questions abaixo serem resolvidas.

| `Memory.stats` | Métrica Prometheus (painel) | Por que é complexo |
|---|---|---|
| `persistent.lastMemoryReset` | `screeps_last_memory_reset_tick` ("Ticks desde último Memory Reset") | motor não sinaliza reset de `Memory` de forma explícita; precisa de um campo canário desenhado com cuidado pra não dar falso positivo (ex. `Memory` grande demorando a reidratar) |
| `rooms.<room>.compoundsT3.<composto>` | `screeps_room_compound_t3{compound="..."}` ("Compostos T3 por sala") | conjunto de chaves **dinâmico** (depende de quais T3 a sala realmente tem, ao contrário dos 7 minerais base fixos) — precisa decidir lista fixa vs. dinâmica (ver Open questions) |

`rooms.<room>.defcon` **saiu desta tabela e desta spec** — ver "Out of
scope" abaixo: o usuário decidiu tratá-lo como uma feature própria no
backlog, não um campo de stats a mais.

### Não faz sentido popular agora

| `Memory.stats` | Métrica Prometheus (painel) | Por quê |
|---|---|---|
| `market.transactions` | `screeps_market_bought_amount`/`sold_amount`/`bought_credits`/`sold_credits` ("Transações — Quantidade"/"— Créditos") | o bot nunca chama `Game.market.deal()` em lugar nenhum do código hoje (confirmado por busca no repo) — não existe transação real pra registrar; popular isso agora seria ou inventar dado, ou deixar um campo sempre vazio por trás de instrumentação que nunca dispara |
| `terminalNetwork.transfers` | `screeps_terminal_transfer_energy` ("Transferência de energia entre salas") | mesmo caso — o bot nunca chama `terminal.send()` em lugar nenhum do código hoje (o único uso de terminal existente é passivo, `hauler.js`'s ledger via `Game.market.incomingTransactions`, ROADMAP 0043) |

Os dois ficam amarrados à feature **Market/terminal** de `ROADMAP.md`'s
"Later" — quando ela existir e o bot passar a chamar `deal()`/`send()` de
verdade, a instrumentação entra nas tasks dela, não como retrabalho aqui
(já registrado na entrada "Later" do roadmap). Os painéis correspondentes
do dashboard continuam no ar, só mostrando "sem dados" até lá — não é um
defeito do dashboard, é o estado real do bot.

## In scope

- Todo campo da tabela **Fácil** e **Médio** acima — **entregue** (ver
  Outcome).
- Todo campo da tabela **Complexo** acima (`persistent.lastMemoryReset`,
  `rooms.<room>.compoundsT3`) — continuação em aberto da mesma spec, não
  implementada ainda.
- Todo campo novo coberto em `test/smoke.js`; comentário de uma linha em
  `stats.js` de onde vem quando a origem não for óbvia pelo nome do campo.
- `screeps-dashboard.json` (cópia versionada) como referência de contrato
  — qualquer rename de campo nesta spec exige atualizar o `expr`/label do
  painel correspondente no dashboard também (fora deste repo).
- O `exporter.py` mantém as métricas nomeadas do dashboard e também expõe
  escalares novos automaticamente em `screeps_stat_value` (numéricos) e
  `screeps_stat_info` (textuais), usando `path` e labels de contexto como
  `room`, `mineral`, `compound`, `category` e `direction`. Isso não cria
  painéis automaticamente, mas evita alterar o exporter a cada novo campo.

## Out of scope

- **`rooms.<room>.defcon`** — o usuário decidiu que classificar nível de
  ameaça por sala vale mais como uma feature própria no backlog (ligada a
  decisão automática de defesa/ataque, não só a um número pro dashboard
  ler) do que como mais um campo desta spec de coleta de stats. Ver a nova
  entrada em `ROADMAP.md`'s "Later". O painel "DEFCON por sala" do
  dashboard fica com "sem dados" até essa feature existir — decisão
  deliberada, não uma lacuna.
- **Expansion Ranking** — não existe painel pra isso no dashboard
  pré-configurado (confirmado lendo o JSON); dependia de um serviço de
  ranking global proprietário da ScreepsPlus, sem equivalente via API
  pública do Screeps.
- **`market.transactions`** e **`terminalNetwork.transfers`** — ver tabela
  "Não faz sentido popular agora". Os painéis existem no dashboard mas
  ficam com "sem dados" até a feature Market/terminal (`ROADMAP.md`,
  "Later") existir de verdade.
- Mudar o formato ou a cadência dos campos já existentes em
  `Memory.stats` (`gcl`, `rooms.<room>.storageEnergy` etc., `cpu.bucket`
  etc., `time`) — só adição; o dashboard já lê esses direto
  (`screeps_gcl_level`, `screeps_room_energy_available` etc.).
- Qualquer mudança no próprio `screeps-dashboard.json`/Prometheus/exporter —
  fora deste repo; esta spec só garante que os campos existem em
  `Memory.stats` pro exporter consumir depois.

## Outcome (parcial)

Entregue nesta rodada — **Fácil** + **Médio** completos, a pedido do
usuário ("vamos adicionar os itens fáceis e médios"):

- `src/utils/stats.js`: `memory.used` (`RawMemory.get().length`),
  `cpu.heap` (3 campos de `getHeapStatistics()`, guardado por
  `typeof === "function"`), `market.credits` (guardado contra
  `Game.market` ausente), `rooms.<room>.totalEnergyAssets` (soma trivial),
  `rooms.<room>.hatcheryUptime` (via `utils/roomCache.myStructures`),
  `rooms.<room>.avgBarrierHits` (throttlado, cache heap-resident
  `barrierHitsCache`, sobrevive a um reset global recomputando fresco em
  vez de zerar), `persistent.lastGlobalReset` (flag de módulo
  `globalResetSeen`, `Memory.stats.persistent` preservado através do
  reset completo de `Memory.stats` a cada tick), `rooms.<room>.minerals`
  (soma storage+terminal por mineral base, `RESOURCE_*` nativo nunca
  hardcoded, só chaves com total > 0 gravadas).
- `src/utils/config.js`: `stats.barrierHitsInterval` (default 50).
- `test/smoke.js`: mocks novos (`RawMemory.get`,
  `Game.cpu.getHeapStatistics`) + bloco de asserts dedicado pros campos
  que precisam de estado de sala/estrutura que o fixture padrão não tem
  (market/storage+terminal+minerais/spawn spawnando/rampart). **Bug real
  achado no processo** (pré-existente, não introduzido por esta spec):
  dois blocos de teste anteriores (Fase 2/3 do ROADMAP 0051,
  LabRoom/FactoryRoom) restauravam `Game.rooms.<Room>` fazendo
  `= undefined` em vez de `delete` — deixava uma chave enumerable com
  valor `undefined` em `Game.rooms`, que só quebra um
  `for...in Game.rooms` rodado depois desse ponto no arquivo.
  `utils/stats.js` é o primeiro código do smoke a chamar isso fora do
  loop principal (que roda inteiro antes de qualquer bloco de teste),
  então foi o primeiro a expor o bug — corrigido nos dois pontos.
- 807 assertions verdes, `node test/smoke.js` `EXIT:0`, `npx grunt` limpo.

Pendente (Complexo, não fechado): `persistent.lastMemoryReset`,
`rooms.<room>.compoundsT3` — ver tabela acima e Open questions.
`rooms.<room>.defcon` saiu do escopo desta spec por completo (ver Out of
scope).

## Acceptance criteria

Itens 1-8 e 10-12: **feitos** (Fácil + Médio, incluindo `minerals`).
Item 9 (Complexo, `persistent.lastMemoryReset`): **pendente**, não
implementado nesta rodada. O critério de `compoundsT3` foi retirado
daqui (Complexo, também pendente — não tem um número de acceptance
criterion próprio até a spec resolver as Open questions e sair de
`in-progress`). O critério de `defcon` foi removido — o campo saiu do
escopo desta spec (ver Out of scope).

1. Depois de um tick de `main.loop()` no smoke test, `Memory.stats.memory.used`
   é um número maior que zero. *(smoke — feito)*
2. `Memory.stats.cpu.heap` existe com `total_heap_size`, `heap_size_limit`,
   `used_heap_size` — sem `total_available_size` nem `does_zap_garbage`.
   *(smoke — feito)*
3. `Memory.stats.market.credits` reflete `Game.market.credits` (mockado no
   smoke); nenhum campo `market.transactions` é gravado. *(smoke — feito)*
4. Para uma sala própria com `storageEnergy` e `terminalEnergy` não-zero,
   `Memory.stats.rooms.<room>.totalEnergyAssets` é exatamente a soma dos
   dois. *(smoke — feito)*
5. Com um spawn `.spawning` truthy na sala,
   `Memory.stats.rooms.<room>.hatcheryUptime` reflete isso (>0); com nenhum
   spawn spawnando, é 0. *(smoke — feito)*
6. `Memory.stats.rooms.<room>.avgBarrierHits` só é recalculado a cada
   `config.get("stats.barrierHitsInterval", …)` ticks — entre execuções,
   mantém o último valor gravado em vez de sumir ou zerar. *(smoke — feito)*
7. Num tick simulado como reset de VM global (sinal de heap ausente),
   `Memory.stats.persistent.lastGlobalReset` é gravado com `Game.time`
   daquele tick; num tick seguinte sem reset, o valor não muda. *(smoke —
   feito, via o único "reset" que um processo de teste consegue simular: a
   primeira chamada depois do module load)*
8. Para uma sala com minerais base no storage/terminal,
   `Memory.stats.rooms.<room>.minerals.<X>` reflete a soma dos dois, só
   com chaves de total > 0. *(smoke — feito)*
9. Simulando a ausência do campo canário de memory ao início do loop,
   `Memory.stats.persistent.lastMemoryReset` é gravado com `Game.time`
   daquele tick; num tick seguinte sem simular ausência, o valor não muda.
   *(smoke — pendente, Complexo, sem critério próprio ainda pra
   `compoundsT3` pelo mesmo motivo — ver Open questions)*
10. Todos os campos já existentes em `Memory.stats` antes desta spec
    continuam presentes e com o mesmo significado (sem regressão). *(smoke,
    assertions existentes — feito)*
11. `node test/smoke.js "$(pwd)"` verde. *(feito — 807 assertions, EXIT:0)*
12. `npx grunt` builda `dist/main.js` sem erro. *(feito)*

## Constitution check

- **CPU (§1):** campos "Fácil" são leituras O(1). `hatcheryUptime`/
  `avgBarrierHits` reaproveitam `utils/roomCache.myStructures(room)` —
  nenhum `room.find` novo. `minerals` é leitura direta de `.store`, sem
  `find`. `avgBarrierHits` ganha throttle explícito (itera todo
  rampart/wall da sala).
- **Memory (§2):** todo campo novo é dado numérico/objeto pequeno, nunca um
  objeto de jogo. `persistent.lastGlobalReset`/`lastMemoryReset` são os
  únicos que *dependem* de sobreviver a um reset — ficam em `Memory` de
  propósito. O campo canário de `lastMemoryReset` (pendente) deve ser o
  mínimo possível (ex. um único número), não um objeto novo. `minerals`
  só grava chaves com total > 0, não os 7 minerais sempre.
- **Fail soft (§3):** `stats()` já roda dentro de `guard("stats", …)` em
  `main.js` — nenhum guard novo necessário; `minerals` é defensivo (sala
  sem storage nem terminal devolve `{}`, nunca lança).
- **Testável offline (§4):** `test/smoke.js` ganhou os mocks que
  faltavam — `RawMemory.get()` (hoje o mock só tem
  `segments`/`setActiveSegments`) e `Game.cpu.getHeapStatistics()` — e um
  bloco de asserts dedicado cobrindo `market.credits`,
  `totalEnergyAssets`, `minerals`, `hatcheryUptime` e o throttle de
  `avgBarrierHits`. `compoundsT3`/`persistent.lastMemoryReset` (Complexo,
  pendente) precisarão de mocks próprios quando forem implementados.
- **Config over hardcode (§6):** `stats.barrierHitsInterval` entrou em
  `utils/config.js` (default 50), nunca literal solto em `stats.js`.

## Open questions

- **Design do canário de `persistent.lastMemoryReset`** — que campo serve
  de canário (um contador incremental? um valor fixo conhecido?), onde
  fica gravado, e como evitar falso positivo (ex. o campo ainda não
  existir no primeiro deploy desta spec, sem isso ser um reset de
  verdade).
- **Lista de compostos T3**: fixa (os que `refining.js` já sabe produzir)
  ou dinâmica (qualquer chave de `RESOURCES_ALL` com prefixo `X`
  encontrada no storage/terminal da sala)? Afeta a forma de
  `compoundsT3`.
- Vale gravar `rooms.<room>.compoundsT3` só nas salas com storage/terminal
  e labs configurados (`Memory.rooms[room].labReaction` já existente), ou
  em toda sala própria com storage/terminal mesmo sem lab (mesmo critério
  que `minerals` já usa — sparse, sem gate extra)?
