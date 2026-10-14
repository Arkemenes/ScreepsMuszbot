# Architecture — estado atual

Uma foto de como o bot está montado hoje. Atualize sempre que uma feature mudar
a forma do sistema.

## Build

`src/main.js` é a entrada. O `grunt` (`grunt-scripts/mergeFiles.js`,
`module-concat`) empacota o grafo de `require` em `dist/main.js`, que é o que o
Screeps roda. `dist/main.js` é git-ignored e reconstruído a cada mudança.

## Tick flow (`src/main.js`)

```
profiler.wrap →
  memory.wrap →                         (pula o Memory JSON.parse em ticks consecutivos)
    Game.myRooms = salas próprias
    guard → planStore.activate()          (ativa os RawMemory.segments dos planos p/ o próximo tick)
    para cada sala visível:   guard → roomLogic.getIntel(room)
    para cada sala própria:   guard → roomLogic.planCity(room)
    para sala c/ Memory.layoutRequests[x] e visível, não própria:
                              guard → roomLogic.planCity(room, {preview:true})
    para cada sala própria:   guard → roomLogic.spawning(room)
    para cada creep:          guard → roleLogic[role].run(creep)
    GC de Memory.creeps dos mortos
    para cada estrutura própria: guard → structureLogic[type].run(structure)
    GC de Memory.structures das mortas
    guard → pixel (Game.cpu.bucket cheio → Game.cpu.generatePixel(), ROADMAP 0045)
    guard → market (scan throttled de histórico/book, ROADMAP 0096)
    guard → utils.stats()
```

`guard(label, fn)` faz try/catch para que uma falha nunca aborte o tick. O
profiler só carrega quando `Memory.settings.profiler` está setado.

## Modules

### Atribuição de CPU de movimento (0113 / ARK-116)

Todos os roles que fazem trânsito por salas usam `routing.travelToRoom`:
pioneer, raider, scout, remoteMiner, remoteHauler, reserver e trânsito
independente do squad. A API normaliza a política e delega a única máquina
`moveToRoom`. Default `routing.crossRoomMode=incremental` resolve somente
próximo hop (2salas/hopMaxOps), sem realSearch. Missão claim passa
`realRoute:true` para preservar validação antecipada/Keepers. `allowRoom`
dinâmico dos remotes continua vivo, sem cache de grafo.

`routing.crossRoomReusePathTicks=1500` permite reaproveitar a travessia
durante fadiga; destino/sala/desvio do path e stall continuam invalidando.
Cache incremental verifica somente salas escolhidas: mudança numa
alternativa descartada afeta preferência após TTL50, segurança das salas
escolhidas é revalidada imediatamente. API legada `moveToRoom` mantém sua
semântica para integrações; formação tática do squad conserva coordenadas
exatas/range0 e não usa alvo de centro da navegação.

Pioneers expõem `pioneer.pickLoad` para seleção da fonte em casa e
`pioneer.travel` para o fluxo completo de viagem. Este inclui os spans
de routing e movimento; não somar pai e filhos.

`routing.graphRoute` cobre a escolha do grafo inclusive revalidação do
cache; `routing.graphSearch` mede só a busca do engine. `routing.clearance`
mede próximo passo e liberação entre creeps. Ambos permitem atribuir custo
de viagem que antes ficava fora dos spans de busca/moveTo.

No cache de grafo de viagens allowUnplannedHop sem allowRoom dinâmico,
snapshots escalares validam as entradas de política de todas as salas
observadas. A chave inclui aliados/usuário e os bloqueios já existentes;
mudanças de intel/controller e vencimento de dead end invalidam o reuso.
Source Keepers mantém callbacks completos com observação viva. Planejamento
completo desses travelers respeita o menor de limit/tickLimit; falta de
orçamento de planejamento ou slot ocupado não para o hop limitado quando
há headroom real. Callers sem essa permissão mantêm os gates anteriores.

Correção de CPU (0127/0124, 2026-10-13): fallback `wide-live` usa caches
limitados de planos/fases no heap, com invalidação por receita e chaves de
slots/produtos/janela. Membership de alvos consulta um recurso diretamente;
reagentes reutilizam respostas só dentro de uma seleção de job, e combustível
calcula limite opcional uma vez por previsão. Produção e confirmação
continuam por tick. Perfil/benchmarks: `docs/cpu-regression-2026-10-13.md`.


Spans inclusivos no medidor existente distinguem buscas completas de rota
(`routing.realSearch`), buscas locais (`move.localSearch`), chamadas nativas
de movimento (`move.native`) e as duas observações novas do intel
(`intel.transitSafety`, `intel.keeperTransit`). Sem novas buscas/scans nem
logs automáticos. O perfil live define os cortes; a meta <9 CPU ainda aguarda
validação em jogo.


### Diagnóstico de claim (0035 / ARK-109)

`utils/claimDiagnostics.js` preserva um snapshot compacto em
`Memory.claimTarget.lastSeen` e apenas um encerramento em `Memory.lastClaimResult`.
O role registra posição/TTL/hits/fadiga/bucket, fase e retorno observado; `needs`
registra desaparecimento antes de apagar a ordem; `remotes` registra cancelamento
e expõe `claimStatus()`. Nenhum scan ou pathfinding novo. Erros de
`claimController` mostram código/nome; `OK` significa intent aceito. A ausência
do creep não atribui ataque nem expiração. Registros sobrevivem ao GC do creep.

### Claim: travessias validadas e orçamento de busca (0064 / ARK-102)

`computeRealRoute` busca qualquer entrada conectada ao interior do destino
(centro, range 24). Além da sequência compacta de salas em `Memory`, mantém
as coordenadas reais de cada entrada em `WeakMap` no heap. `moveToRoom` normal
e nativo usam essas entradas e limitam os hops validados a duas salas e
`routing.hopMaxOps` (20000). Após deserialização/reset do heap, recompõem as
entradas uma vez; se a validação falhar, preservam o fallback legado sem repetir
a reconstrução a cada tick. Nova busca completa aguarda
`routing.realRouteMinBucket` (1000), retornando `ERR_BUSY` sem falso dead end.
Isso corrige a seleção de uma saída central livre porém desconectada do caminho
já validado, reproduzida offline após relato de claim para E5N41.

### Segurança dinâmica de trânsito (ROADMAP 0129)

Os callbacks de `moveTo` representam exclusão com uma `CostMatrix` inteira
em 255 (template no heap, retorno clonado); o motor ignora `false` nessa API.
Somente `PathFinder.roomCallback` usa `false` para excluir salas. Esta regra
vale para scout/claimer, fallback, modo nativo e recuo.

`utils/transitSafety.js` separa trânsito de diplomacia: a lista manual
`routing.avoidPlayers` começa vazia; `rooms/intel.js`, dentro do guard de
intel existente, coleta `EVENT_ATTACK` com dano positivo a creep próprio e
autor aliado resolvido. Um snapshot de ids próprios via census, no heap,
reconhece vítimas mortas no tick anterior enquanto há visão/evento disponível.
`Memory.routingAggressors[autor] = {room, tick}` guarda somente a evidência;
novos ataques renovam o prazo `routing.allyAttackAvoidTicks` (10000 ticks).
Expiração permite tentar trânsito normal novamente, sem despachar probes.

`routing.js` exclui propriedade/reserva conhecida desses autores em todos os
callbacks e nas buscas de rota, inclusive destinos e modo nativo. A origem
atual continua disponível para escape; recuos também respeitam o bloqueio.
Uma chave da política invalida paths/rotas cacheadas após inclusão, liberação,
expiração ou troca de propriedade observada. `avoidPlayer`, `allowPlayer` e
`routeAvoidStatus` permitem controle/inspeção sem mudar aliados/alvos ofensivos.
Sem visão, autor resolvido ou evidência da vítima, não se atribui uma morte.


### Craft flip - preço conservador, labs e factory transitórios (ROADMAP 0111)

- `utils/marketPricing.js` é o modelo de preço/risco compartilhado (puro). Lê
  só o histórico próprio de 7 dias de `market.samples()`: receita =
  `min(bid mediano, bid atual)`, custo = `max(ask mediano, ask atual)`, margem =
  `piso + z·σ_rel·√(T/3600)` com `z` derivado de `craft.confidence`, guardrails
  de liquidez, custo recursivo por nó (fabricar × comprar × estoque próprio ao
  bid) e a decisão vender-ou-processar. `marketFlip` usa o mesmo módulo (outlier
  só na perna de venda; compra barata nunca é barrada).
- `utils/labSlots.js` guarda os 10 slots fixos do stamp de labs (offsets;
  o stamp não rotaciona), a ordem de construção por RCL (3/6/10) e o plano de
  fases que mapeia uma árvore de reações nos labs construídos, com o menor número
  de remanejamentos: árvore > reutilização de lab > estacionamento no storage.
- `utils/transientStock.js` é a política de lab/factory transitórios: meta de
  energia (factory = energia do produto ativo; lab = 0, opt-in por
  `craft.labEnergyTarget`) e o que sobra a drenar. `roles/hauler.js` só consulta:
  não entrega além da meta e `transientDrainJob` devolve o resto ao storage.
- `utils/craftPlanner.js` decide *o quê* e *onde* (portão de viabilidade por
  sala, pré-voo, lote pelo teto de 5% por cadeia sobre os créditos livres
  descontado `marketFlip.committed()`). Roda em `guard("craftPlanner")`; em
  `craft.test` (padrão) só registra candidatos e motivos de descarte
  (`craftStatus()`).
- `utils/craftChain.js` executa UMA cadeia por sala (máquina de estados
  `buying → working → selling`, com stall guard): compra os insumos de uma vez,
  configura `factoryProduct`/`labReaction` (marcados `*Auto`, nunca sobrescreve
  pin manual), mede o progresso pelo estoque, vende no piso de lucro (custo real da operação + `craft.minSaleMargin`, `craftChain.saleFloor`)
  (retém até `craft.retentionTicks`, depois lista no piso, nunca no prejuízo),
  grava o ledger (realizado × estimado) e aplica os disjuntores. Um `abort` nunca
  perde material: os insumos ficam como estoque próprio. Travas:
  `craft.maxCashAbsolute`, `craftCancel(sala)` (`craft.maxActive` > 0 é um teto
  global opcional; por padrão o paralelismo é limitado por estrutura: uma cadeia
  por tipo - factory, lab - por sala, flags separadas por tipo). Em lab, um
  intermediário que a fase seguinte consome fica no lugar (`reaction.keep` +
  `labLoad`); etapas de lab independentes (mesma altura da árvore, ex. `OH` e `LH` de
  XLH2O) rodam **ao mesmo tempo** em "ondas" (ROADMAP 0115): `labSlots.planPhases` dá
  slots exclusivos dentro de cada onda (e guarda os labs centrais 1 e 2 para a etapa
  final), cai no plano sequencial se faltam labs ou passa de `craft.parallelExtraMoves`
  remanejamentos a mais, e cada fase carrega sua `wave`; `craftChain.groupAt` inicia a
  onda inteira junto (barreira de dreno sobre todos os labs), fecha cada etapa quando o
  produto dela chega (ela sai de `labReactions` na hora) e só passa à onda seguinte quando
  todas terminam; `Memory.rooms[r].labReactions` (lista) é lida por `utils/labReactions.js`
  em `structures/lab.js`, hauler, `nonEnergyLogistics` e `transientStock` (o singular
  `labReaction` segue valendo para reação manual e etapa única); **estratégia de lab**
  (ROADMAP 0116, `craft.labStrategy`): `labSlots.planPhases(tree, built, {work})` compara o
  tempo estimado de "waves" (acima) com o de "wide" (`planWide`: TODAS as etapas com os labs
  centrais 1 e 2 como entradas e saída em todos os labs que alcançam as duas, uma etapa após
  a outra; o produto de cada uma vai ao storage pelo dreno e a seguinte o recebe como
  reagente) e escolhe a "wide" só se for `craft.wideMinGain` (20%) mais rápida (10 labs:
  XLH2O ~7900 contra ~22500 ticks); o `T` do candidato vem de `ctx.labTime(steps)` (tempo da
  estratégia escolhida) e `craftChain.buildQueue` chama a mesma função com os mesmos
  `work` (`craftReplan(sala?)` no console refaz, com o plano atual, as etapas ainda não
  iniciadas de cadeias já em andamento, sem tocar na que roda); a última etapa de lab roda em vários labs de saída (`reaction.outputs`,
  `craft.wideLabs`) e o produto final é vendido conforme sai, do storage
  (`craft.partialSales`); a cadeia não liga mais `directToTerminal`. Os
  eventos saem no console como `[craft] ...`.

### Terminal operations and energy balancing (ROADMAP 0098/0097 done)

**Reservas por direção (0130 / ARK-108).** Compras com `automaticPurchase`
convivem com vendas/transferências do mesmo recurso; duas saídas e compras
duplicadas continuam protegidas pelos locks. `resourcePolicy.commitments`
desconta somente entradas pendentes vinculadas ao dono da cadeia/flip.
Listings fixas integralmente financiadas preservam sua carga, ID e taxa mesmo
quando há demanda futura de produção. `consumerAvailable` distribui as reservas
de saída entre storage/terminal (incluindo ordens manuais não gerenciadas), e o
hauler limita retiradas de minerais ao excedente, com ledger de intents no heap.
`craftChain.open` verifica todos os locks antes de criar compras; recusas incluem
a causa em `craftStatus` e no log. Não há cancelamento/relistagem automática para
dar prioridade à fabricação; recebimentos e cooldown físico seguem em terminalOps.

**Cotação de relay (ROADMAP 0125, transporte planejado).**
`utils/terminalRouting.js` compara envio direto com origem → hub E2N46 → destino,
incluindo frete do financiamento e a mensagem de 2 energia. `terminalRelayQuote`
é registrado por `terminalOps` e documentado no `help`; não emite intents nem
grava Memory. A quantidade é sempre a entrega desejada: energia embarca também
o frete que o hub desconta. A seleção avalia o hub por padrão; `urgent: true` força direto.
Empate, urgência crítica, rota indisponível ou
limiares de economia não atingidos mantêm direto. Config em
`Memory.settings.terminalRelay`; defaults de cotação habilitados, sem ativar
transporte. Power ativo dos terminais próprios entra no custo. A fase B irá
integrar o protocolo ao balanceamento não crítico e às operações de terminal.


`utils/terminalOps.js` is already the single entry point for terminal work:
it owns persisted operation metadata, console commands, hauler `terminalJob`s,
incoming-terminal detection and the current market/transfer state machine.
`rooms/energyBalancing.js` is policy-only and calls that API rather than
`Terminal.send()` directly. `terminalOps` owns locks, active recovery, partial
receipts, BUY parent links, operation retention and market repricing. Recovery
searches use `utils/roomCache.droppedResources()` and balancing state is exposed
through `Memory.stats.rooms.<room>.energyBalancing`.

`terminalOps` garbage-collects finalized operations after the configured
retention window, retries partial receipts and aggregates concurrent incoming
transactions. Recovery searches use `utils/roomCache.droppedResources()` so
the one-`room.find`-per-tick rule remains intact. `energyBalancing` exposes its
decision and operation state through `Memory.stats.rooms.<room>.energyBalancing`.

`rooms/energyBalancing.js` (0097) pulls non-critical rooms toward the
empire-wide energy ratio: a room more than `logistics.balanceGapRatio` below it
is a target, more than that above it a source, and the amount is the target's
deficit capped by the source's surplus. One run plans several transfers at once,
spending each source's surplus as it goes: a source may feed many targets, a
target takes one inbound transfer and never also sends (`lockConflict()`'s
automatic-transfer branch). The old
`capacity*gap - energy` need was ~0 for any room above ~6500 energy, so
E1N47 (19.6k) was never served (bug real, 2026-10-01).

terminalOps walks an `activeIds()` index instead of every stored operation
(finished ones are kept `operationRetentionTicks`): rebuilt, with garbage
collection, when `nextId` changes or every 50 ticks. `global.cpuTop(n)`
(main.js) reports CPU per `guard()`ed subsystem plus `terminalOps.perf`
phases and per kind:state.

Diagnóstico ARK-116 (13/10): spans fixos `craft.chain.*`, `craft.startItem`,
`craft.partialSales`, `craft.strandedSweep` e `labPolicy.*` separam estados,
seleção de planos e execução dos labs. `hauler.stockPolicy` e
`hauler.terminalFuel` isolam decisões de estoque e combustível. Todos são
inclusivos e usam o medidor existente; não alteram produção nem scans.

Na fronteira de publicação, cpuTop mostra o último snapshot fechado quando
a janela corrente está vazia, identificando seu tick. Fases/estados de
terminalOps alimentam spans do mesmo cpuMeter; o acumulador legado perf
não é dividido pelos ticks de outra janela na tabela.

`labPolicy.recipeMap` compara conteúdo canônico de REACTIONS quando a
referência muda: constantes recriadas pelo engine preservam geometria;
mudanças reais de receita invalidam planos/fases. Cooldowns ficam vivos.

`terminalFuel.budget` é local a uma decisão síncrona: stockPolicyJob
compartilha previsão com capacidade, histerese e retirada. Lista de operações
e capacidade são consultadas uma vez por seleção, sem cache entre haulers;
as próximas seleções continuam observando reservas/estoque do mesmo tick.

`labSlots.planPhases` mantém geometria no heap (`craft.phaseCacheEntries`),
por árvore/slots/paralelismo. Quantidade/cooldown/estratégia recalculam T e
escolha a cada consulta; cópias isolam consumidores. `craft.phasePlan` e
`craft.evaluate` separam o custo geométrico do econômico no scan.

`labPolicy.poll` verifica orçamento antes de cada avanço do generator.
`labPlanModel.layoutFor` usa contagem de eventos/busca binária para horários
inteiros, mantendo ranking; timing fracionário segue referência. Preparação
e simulação do preflight são spans craft.policyRequest/craft.policyPoll.

**CPU meter (ROADMAP 0113, `utils/cpuMeter.js`).** One meter, three
granularities over a `{cpu, calls, max}` record per key: L0 `modules` (the
`guard()` label prefix), L1 `roles` (creep role), `structures` (structure type)
and `spans` (named hot points, inclusive of their children: `needs.compute`,
`hauler.pickMineralJob`, `hauler.minerFeedTower`, `hauler.chainFeed`,
`craft.scan`, `craft.chains`), all always on; L2 `fns` (per function) only
through `profile(N)`. Accumulators are heap-only; every
`stats.cpuWindowTicks` (60) ticks they fold into per-tick averages that
`stats.js` publishes as `Memory.stats.cpu.meter` (`window`, `ticks`, `used`,
`modules`, `roles`, `structures`, `spans`, `fns`), carried over a global reset
until the next window closes. `profile(N)` publishes the top
`stats.cpuTopFunctions` (15) by self time when the session ends and then
**uninstalls every wrapper** (`profiler.disable()`; the registered roomLogic
functions are restored by `main.js`): before 0113 they stayed wrapped until
the next global reset. `exporter.py` turns the keys under `cpu.meter.*` into
the `span` label of `screeps_stat_value`, and the "CPU por módulo / role /
função" dashboard row (`specs/features/0079-.../screeps-dashboard.json`)
charts them.

`reconcileClaims()` (called from `scanTerminalBalances()`) is the opposite
check: what target-side claims (receipts and already-sent transfers) still owe
must be physically in the terminal on top of what SELL/source-side ops staged
(market ops are funded first). A claim the stock cannot cover for
`terminalOps.deficitConfirmTicks` (3) is credited as consumed elsewhere and
closed, so a transfer drained by another actor never blocks
`energyBalancing.pending` (bug real, 2026-10-01: terminal-232). Skipped while
a hauler or recovery is in flight. `incomingReceipt()` only merges into a
receipt with the same `parentId`.

`scanTerminalBalances()` keeps the terminal holding only what pending
operations actually need — the invariant is absolute surplus (current stock
minus what active ops/receipts have staged or claimed), not tick-over-tick
delta, so stock parked in the terminal before any operation existed (e.g. a
hauler's mineral-storage-full fallback, `roles/hauler.js`'s
`mineralDeliveryTarget()`) is swept back to storage as a `receipt` even
without a prior "seen" baseline (bug real, usuário reportou em produção,
2026-09-24: 10000 O paradas no terminal, 0 energia pra taxa, ordem de venda
de 1000 nunca executava). A SELL's `queued`/`waiting` branch also reconciles
`loadedAmount` against whatever the terminal already holds up to the staging
buffer — `lockConflict()` guarantees exclusive ownership of the
resource/room pair, so pre-existing stock is safe to treat as this
operation's cargo; without that credit, `loadedAmount` stayed at zero
whenever the terminal already met the buffer, permanently zeroing
`candidateOrders()`'s cargo cap and blocking every deal (and the energy-fee
loading that only runs once a deal executes) forever.

O tamanho desse lote é
`buffer = min(terminalOps.saleBufferAmount, capacidade × terminalOps.saleBufferCapacityRatio)`.
Os defaults foram `10000`/`0.1` até 2026-09-24, o que dava 10000 fixos num
terminal de 300000: uma venda de 50k virava cinco ciclos, cada um com ida e
volta de hauler mais o cooldown do terminal, e o usuário via a operação
parada em 10k "esperando vender pra pegar mais". Agora são `300000`/`0.85` —
o `saleBufferAmount` é a própria capacidade do terminal, então quem manda é a
razão. Os 15% restantes são folga deliberada: ~5% pra energia da taxa que o
`deal()` precisa **além** da carga (`executeDeal()` só descobre o custo
depois de escolher a ordem, e o job `fee` não passa por checagem de
capacidade) e ~10% pra transferências de entrada e entregas de BUY ainda
terem onde cair. O lote em si é protegido por `assign()`, que recusa um
`load` maior que o espaço livre do terminal e devolve a operação pra
`waiting` em vez de estourar.

### Uma ordem listada continua sendo abastecida e reprecifica de graça (ROADMAP 0098)

Uma venda que não acha ordem de compra dentro do limite cai em `listing`/`listed`
e publica a própria ordem com `totalAmount: op.remaining`. Dois problemas reais
apareceram em produção em 2026-09-24 (`terminal-180`, 62751 O anunciadas a
62.445 contra um terminal com 10000 O):

- **Sem lastro físico.** O comprador só consegue retirar o que está fisicamente
  no terminal, e `listResidual()` nunca designava hauler: a ordem anunciava
  62751 e entregava no máximo 10000. Agora o ramo `listing`/`listed` de uma
  SELL chama `stageSaleCargo()` antes de reprecificar, repondo até
  `min(saleBuffer(), op.remaining)` — estoque vale mais que preço. Quando
  `assign()` não consegue despachar (sem hauler, sem capacidade), a operação
  volta pro estado em que estava em vez de reiniciar o fluxo de listagem: a
  ordem continua viva e `syncManagedOrders()` segue contabilizando preenchimentos
  normalmente, porque só exige `active(op) && op.marketOrderId`.
- **Reprecificação cara.** A cada `terminalOps.repriceInterval` (1000) o código
  fazia `cancelOrder` + `createOrder`. `createOrder` cobra 5% de
  `preço × quantidade` e `cancelOrder` não devolve nada, então cada
  reprecificação pagava a taxa inteira de novo — ~196k créditos no caso acima.
  Agora usa `Game.market.changeOrderPrice(id, preço)`, que preserva a ordem e
  cobra só `(novo − antigo) × remainingAmount × 0,05`, ou seja **zero quando o
  preço cai** — o caso normal de uma venda. Recriar virou fallback para quando
  `changeOrderPrice` falha ou não existe.

Dois efeitos colaterais do desenho antigo sumiram junto. O `cancelOrder` rodava
**antes** da checagem de crédito, então uma operação sem saldo perdia a listagem
que já tinha pago e ia direto pra `failed`; a checagem agora vem primeiro e,
havendo ordem viva, o estado final é `listed`, não `failed`. E como o id da
ordem é preservado, o `bindCreatedOrders()` deixa de precisar readotar a ordem
por heurística (sala + recurso + tipo + `created`) a cada ciclo — ele só atua na
primeira listagem, que é o único momento em que `createOrder` roda sem devolver
o id.

Um terceiro bug do mesmo lote, achado ao vivo no mesmo dia: `lockConflict()`
tratava qualquer recurso `marketOnly` (pixel, cpuUnlock, accessKey — vive em
`Game.resources`, nunca num terminal) como se disputasse a regra "uma operação
deste tipo por sala" pensada pra proteger espaço/cooldown de terminal; uma
venda de O ativa em `W7N49` bloqueava `terminalSell(..., "pixel", ...)` na
mesma sala mesmo sem overlap nenhum de recurso físico. `lockConflict()` agora
isola `marketOnlyResource(resourceType) || marketOnlyResource(op.resourceType)`
num ramo próprio que só conflita com outra operação do **mesmo** recurso —
independente de sala, já que o estoque de `Game.resources` é da conta inteira,
não de uma sala específica.

### Transações de mercado e transferências de terminal no Grafana (ROADMAP 0079 follow-up)

A spec 0079 original deixava `market.transactions`/`terminalNetwork.transfers`
fora de escopo porque o bot nunca chamava `Game.market.deal()`/`terminal.send()`
— agora chama (ROADMAP 0098), então os dois passam a ser reais. `record(op,
value, credits, energy)` (chamado por `settleDeal()`, `syncManagedOrders()` e
`tickTransfer()` — os três únicos pontos que de fato movem crédito ou recurso
entre salas) ganhou `resourceType`/`from`/`to` além do `room` que a agregação
por-sala de `stats(roomName)` já usava; sem isso não dava pra separar uma
compra de O de uma venda de energia, nem saber os dois lados de uma
transferência (só `sourceRoom||targetRoom` colapsado num campo). Duas funções
novas, globais (não por sala — um deal de mercado não tem "sala dona"
significativa, `competitivePrice()` escolhe a ordem mais barata em qualquer
lugar do mapa), lêem a mesma janela de `terminalOps.statsWindowTicks`:
`marketTransactionStats()` agrega `{bought, sold}` por `resourceType`
(`credits` sempre como magnitude positiva, embora `record()` grave negativo
pra `buy` — o nome do balde já carrega o sinal); `terminalTransferStats()`
agrega eventos `kind: "transfer"` por `from/to/resourceType` (2026-09-24:
antes era só `from/to`, então dois recursos diferentes transferidos entre
o mesmo par de salas na mesma janela colapsavam num `amount` só, perdendo
qual recurso realmente moveu — mesmo par **e** mesmo recurso ainda somam
numa entrada só). `exporter.py`'s `screeps_terminal_transfer_energy` ganhou
o label `resource` correspondente. `stats.js` grava os dois em
`Memory.stats.market.transactions`/`Memory.stats.terminalNetwork.transfers`
incondicionalmente (vazio, não ausente, quando não há evento na janela).

The surplus reservation must also recognize `assign()`'s no-hauler fallback:
the instant no hauler is free, `assign()` demotes an in-flight unload attempt
straight from `awaitingReceipt`/`unloading` to plain `waiting` (with
`waitingDirection: "unload"`), even though the cargo already physically
landed in the terminal. `scanTerminalBalances()`'s reserved-stock filter
treats that `waiting` state the same as `awaitingReceipt`/`unloading` -
matching the state list `awaitingReceiptFor()` already used for the same
reason - otherwise the same already-delivered stock looks unclaimed on every
following tick and gets minted into a duplicate receipt again and again (bug
real, usuário reportou em produção, 2026-09-24: a stuck transfer's energy
receipt ballooned from 10000 to 103000 within a handful of ticks; an older,
long-stuck receipt for the same reason had reached 8034000 over several
days).

Operation failures used to be silent — visible only by polling
`terminalOperations()` — which made a dead SELL/BUY look, from the console,
like nothing had been attempted at all. `touch()` is now the single choke
point for every state transition, so it logs to console whenever an
operation reaches the final `failed` state, with the operation id, kind,
resource, rooms and `op.error`, without any call site needing its own log
line. `executeDeal()`'s no-candidate branch (falling back from a direct
`deal()` match to listing its own order) also logs the best order it found
in the book even though it missed `op.limit`, including the raw price and
the delivery-cost estimate (`calcTransactionCost()`-based, converted to
currency via `op.energyFairPrice`) that was netted against it — this is the
concrete data needed to tell apart "the delivery fee to a distant room ate
the whole margin" from an actual matching bug, instead of guessing from the
outside. That distinction turned out to matter immediately: a live report
the same day showed a SELL with limit 43 skipping a buy order at 43.925
because delivery cost to a distant room netted the effective price to
32.113. `candidateOrders()`'s original design (0098 review: "limite sempre é
líquido") gated `deal()` eligibility on that net effective price on purpose,
but the user sets `op.limit` by reading the market's raw price
(`marketPrice()`/order book), not some hidden delivery-adjusted number —
confirmed live via `marketPrice("O")` showing the raw `sellPrice` matched
what they'd used to pick the limit. `candidateOrders()` now filters on the
order's own raw price against `op.limit`; `effective` (net of delivery cost)
is still used to rank/sort the orders that clear that raw bar, so a
cheaper-to-deliver order still wins over a pricier-to-reach one at the same
raw price. `reportNoCandidate()`'s "best" pick follows the same raw-price
criterion now, for the same reason.

`managedTerminalIncrease()` (used by both `scanTerminalBalances()`'s surplus
check and `tickReceipt()`'s withdraw amount) used to gate `feeLoadedAmount`
behind the same `op.resourceType !== resourceType` check that guards
`loadedAmount`, even though a market fee is always paid in energy no matter
what the operation is selling. A SELL of "O" staging energy in the terminal
for its own fee therefore looked invisible under an "energy" query: the
resourceType mismatch ("O" vs "energy") returned early before the
`feeLoadedAmount` line ever ran. Two symptoms followed from the same root
cause (bug real, usuário reportou em produção, 2026-09-24: "o terminal está
com O, mas o hauler está colocando e tirando [energia] sem parar"): (1)
`scanTerminalBalances()` treated the staged fee energy as unclaimed surplus
every tick and folded it into an unrelated energy `receipt`'s `amount` again
and again — the same growth pattern as the transfer/`waiting` bug above, this
time an O-SELL's fee energy inflating a receipt that had nothing to do with
it; (2) that receipt's `tickReceipt()` then withdrew the exact same
fee-staged energy straight back to storage the instant it landed in the
terminal, so the SELL's fee job never accumulated enough to pay for its
`deal()` and kept restaging the same amount — a hauler looping the same
~3400 energy in and out of the terminal forever. Fix: `feeLoadedAmount` is
now added independently of `op.resourceType`, gated only on the *queried*
resourceType being energy and `op.sourceRoom` matching; the `loadedAmount`
check keeps its own `op.resourceType === resourceType` guard, since that one
genuinely is denominated in the operation's own commodity.

### Deal settlement is a tick late, on purpose (ROADMAP 0098)

`Game.market.deal()` apenas **registra um intent**: o motor só executa a troca
depois que o script retorna. Dentro do tick que chamou `deal()`, portanto,
*nada* da troca é observável — nem `Game.market.credits`, nem o
`remainingAmount` da ordem, nem o store do próprio terminal. `executeDeal()`
tratava o `OK` de retorno como prova de que a venda já tinha acontecido e
liquidava a operação na hora: zerava `loadedAmount`/`feeLoadedAmount` e
marcava `completed`. Com isso a operação abria mão da posse sobre carga que
ainda estava fisicamente no terminal, e `scanTerminalBalances()` — que roda no
**fim desse mesmo `tick()`** — via essa carga e a energia da taxa como
superávit não reclamado, criava receipts para as duas e despachava haulers
para levá-las de volta ao storage. Esses intents de `withdraw` caem na mesma
leva de fim de tick do `deal()`, esvaziando o terminal por baixo da troca
pendente: `deal()` tinha retornado `OK` e nada acontecia — nenhuma transação
no histórico, créditos congelados, `remainingAmount` intacto — enquanto o
hauler girava o mesmo estoque para dentro e para fora do terminal sem parar.
Essa foi a causa raiz do "nenhuma ordem foi efetivada" (usuário reportou em
produção, 2026-09-24), e também explica os receipts órfãos que falhavam com
`withdraw retornou -6`: eram receipts criados para carga fantasma que a troca
levou embora.

Corrigido com um estado novo, `settling`: depois de um `status === OK`,
`executeDeal()` grava `op.pendingDeal` (id da ordem, quantidade, custo, preço,
tick e o saldo do terminal antes) e para por ali, **sem tocar em nenhum
bookkeeping** — todas as posses continuam de pé, então `managedTerminalIncrease()`
segue protegendo a carga e a taxa, e nenhum receipt é criado. No tick seguinte
`settleDeal()` liquida contra evidência real: `dealTraded()` compara o store do
terminal com `pendingDeal.terminalBefore` (sinal local, exato e imune a outros
jogadores negociando contra a mesma ordem no meio-tempo). Operações
`marketOnly` (pixel/CPU unlock) não têm terminal, então caem no livro de
ordens — uma troca só pode baixar `remainingAmount`, e uma ordem consumida
por inteiro simplesmente some. Confirmada a troca, o bookkeeping normal roda
(`remaining`, `dealtAmount`, `transactionCost`, liberação de
`loadedAmount`/`feeLoadedAmount`, `record()`, estado final). Não confirmada, a
operação volta para `atTerminal` (ou `waiting`, sem terminal) sem mutar nada,
e o id da ordem entra em `op.deadOrderIds` (capado nas últimas 10) para que
`candidateOrders()` a exclua e a próxima tentativa use outra ordem em vez de
repetir o mesmo `deal()` sem efeito para sempre. Diagnóstico
(`op.lastDealOrderId/-Room/-Price/-Quantity/-Status` e um `console.log` por
tentativa) segue no código.

Consequência para os testes, e o motivo de o bug ter sobrevivido tanto tempo:
todo mock de `deal()` em `test/smoke.js` retornava `OK` sem mexer no store do
terminal nem em créditos — ou seja, modelava exatamente um deal que não faz
nada, e por construção nunca poderia detectar o que acontece depois de uma
troca real. Os mocks agora movem o estoque entre os ticks, como o motor faz.

**Investigação separada, ainda pendente:** um receipt de energia
(`terminal-174` no relato do usuário) apareceu já criado com `amount:
103000`, `remaining: 10000`, falhando com `withdraw retornou -6` —
hipótese não confirmada é que seja energia física remanescente de uma
transferência antiga cancelada por falta de hauler (`terminal-153`,
`amount: 8034000`, tick 83126163) que `scanTerminalBalances()` continua
detectando como superávit legítimo, mas cuja quantidade física real na
execução é menor que a do snapshot usado para dimensionar o job. Não
investigado a fundo; requer nova sessão de debug ao vivo.

### Energy-role guards (ROADMAP 0102/0103)

`roles/builder.js` e `roles/upgrader.js` revalidam um estado persistido
`GetEnergy` antes de executá-lo: links não-coletores só podem ser retirados
quando spawn/extensions estão estáveis. Esse é o papel principal dos
limiares de "criticidade" (`upgrader.rcl8UpkeepRatio` 50%,
`upgrader.rcl8SafeRatio` 99%, `resourceTiers`/`reservations.economyStable`)
— decidir **quem é desejado** (`rooms/needs.js`), **quando converter role**
(`isExcessUpgrader()`) e gatear a *aquisição* de energia de uma fonte que a
economia da sala ainda precisa (link não-coletor, storage/container). Um
gate de *gasto* é diferente por natureza (nunca desperdiça energia que o
creep já carrega), mas um teto **literal** de "controller no máximo" não
funciona na prática: `ticksToDowngrade` fica pinado exatamente no teto assim
que qualquer creep completa um `upgradeController()` e fica ali por muito
tempo, então "teto literal" na prática virou "nunca parar de upgradar" (dois
follow-ups do ROADMAP 0103, bugs reais reportados em produção, 2026-09-24).
O fallback de `upgradeController` em `roles/builder.js` por isso reusa
`upgrader.rcl8SafeRatio` (99%) — a mesma marca que `isExcessUpgrader()` já
trata como "seguro pra converter" — em vez de um teto literal ou do limiar
de demanda mais baixo (`rcl8UpkeepRatio`, 50%): abaixo dela ainda há espaço
real pra receber progresso, nela ou acima o controller não está genuinamente
em risco e um builder com energia na mão deve procurar obra/reparo de
verdade. "Seguro pra parar de gastar" e "seguro pra converter role" acabam
sendo a mesma pergunta feita por dois creeps diferentes. Ver "upgrader"
abaixo para o mecanismo completo de want/convert.

### `src/utils/`

| Module | Responsibility |
|--------|----------------|
| `memory.js` | Referência de Memory em escopo de módulo → pula `JSON.parse` em ticks consecutivos. Accessor de `.memory` de estrutura + GC. |
| `census.js` | **Uma** varredura de `Game.creeps` por tick. `creepsByRole` / `count` (por sala), `all` / `total` (império-wide, para roles que vagueiam como o scout), `allInRoom(roomName)` (todo creep de qualquer role numa sala — ROADMAP 0045, usado por `rooms/spawning.js`'s renovação de creep no spawn). |
| `names.js` | Nomes cosméticos de creep (ROADMAP 0048, paridade com `old_1` mas revisado a pedido do usuário) — `generate(key)` monta `"Nome Sobrenome,\nTítuloParte1 TítuloParte2"` (4 partes, mesmo formato do `old_1`); nome/sobrenome vêm de listas genéricas, mas as **duas** partes do título sempre vêm de um pool específico do role (`TITLE_POOLS[role]`, ou `TITLE_POOLS["role:mission"]` pro `reserver` — `reserve`/`claim`/`contest` têm pools diferentes) — nunca um vocativo genérico desconectado do que o creep faz, ao contrário do `old_1`. Tenta até 20 combinações livres contra `Game.creeps` antes de aceitar uma colisão residual (fail-soft já existente em `rooms/spawning.js`). Puramente cosmético — `Math.random()` nunca influencia corpo/role/alvo/contagem. Toda `spawnData()` de `src/roles/*.js` usa isso em vez de `"<Role>" + Game.time`. |
| `roomCache.js` | Memo por tick de `room.find`: `structures`, `myStructures`, `constructionSites`, `structuresByType`, `mySpawns`, `minerals` (ROADMAP 0055 — antes `roles/mineralMiner.js` e `roles/hauler.js` cada um rodava seu próprio `FIND_MINERALS`), `droppedResources`, `tombstones`/`ruins` (ROADMAP 0106 — `roles/hauler.js`'s `battlefieldLootJob`). |
| `nonEnergyLogistics.js` | Coordenação dos jobs não energéticos do `hauler` (ROADMAP 0095). Classifica pressão por sala/tick em ordem `mineralContainer → labOutput → factoryOutput`; mineral/lab usam ocupação do recurso e factory usa ocupação total. Um ledger mutável no heap, semeado de `census`, elege no máximo um owner por sala. |
| `terrain.js` | `number[50][50]` de terreno por sala, cacheado no heap. Nunca na Memory. |
| `planStore.js` | **Única porta** pro plano da cidade (`{buildings, mincutBoundries}`). Mora em `RawMemory.segments[id]` (id preguiçoso em `Memory.planSegments`, cada segment marcado com o nome da sala), cacheado no heap — parse do segment só 1×/sala/global-reset, não 1×/tick. `getPlan`/`setPlan`/`mutate`/`dropPlan`/`activate` (pede os segments ativos no `main`). Migra sozinho o formato antigo (`Memory.rooms[x].buildings`). `getPlan` recusa um segment cuja tag de sala não bate — uma colisão de id (ex.: depois de um `Memory.settings = {...}` no console) nunca devolve o plano de outra sala. |
| `plan.js` | Índice `"x:y"` do plano da cidade (via `planStore`), por tick. `isPlanned(structure)`, `planEntriesAt`. |
| `population.js` | `ECONOMY_ROLES`, `idealPopulation`, `currentPopulation` (via census), `isRoomStable`, `scaledBody`. |
| `energy.js` | `findNearbyFullSource`, `hasLinkNetwork`, `receivingLink` (link não-coletor onde creeps esperam energia), `energyPiles(room)` (drops/tombstones/ruins/containers/storage/link receptor de uma sala — extraído de `roles/builder.js` quando `roles/pioneer.js` (ROADMAP 0037) passou a precisar da mesma lista, constitution §5). |
| `reservations.js` | Resolve disputa por pilha de energia. Ledger por tick (`creep.memory.loadTarget`). `available(creep, pile)` = energia livre p/ o creep depois de descontar quem tem prioridade — 3 ranks (`pickerRank`, maior ganha): **pioneer (2)** > hauler/bootstrap (1) > todo mundo (0). Cedendo a pilha **inteira** num drop/tombstone/ruína (descartável, único) vs. só o quanto o ranking mais alto ainda precisa num container/storage/link (`isReplenishing`, tem `structureType`) — mesma regra pra qualquer par de ranks. A diferença entre os dois ranks de cima: hauler/bootstrap só ganha de rank 0 **enquanto** spawn/ext não estão cheios (`economyStable`) — uma vez cheios, rank deixa de importar entre eles; **pioneer sempre ganha de todo mundo, sala estável ou não** (ROADMAP 0037 follow-up — resgatar sala sem spawn é trabalho pontual e já limitado em quantidade por `rooms/pioneering.js`, não devia perder pilha pra tráfego rotineiro só porque a sala-mãe já está com spawn/ext cheios). Peers do mesmo rank (incluindo dois pioneers) dividem por nome, `claim`/`release`. Espelho do lado de entrega (ROADMAP 0107 — `roles/hauler.js`'s `pickDeliver`): `availableDeliver`/`claimDeliver`/`releaseDeliver`, ledger próprio (`byDeliverTarget`, de `creep.memory.deliverTarget`) sem sistema de rank — só desconta o que outros haulers já carregam rumo ao mesmo alvo, evitando dois haulers mirarem a mesma extension/torre quase cheia. |
| `hostiles.js` | Cache de hostis por tick. `isHostile(creep, room)`: numa sala própria, armado (`ATTACK`/`RANGED_ATTACK`) + não-aliado = hostil, sem whitelist; fora disso (ou sem `room`), whitelist (`hostilePlayers()`, `Memory.settings.hostilePlayers` sobrescreve) + `Invader`/`Source Keeper` **+ `isTargetEnemy(username)`** (ROADMAP 0036 — sem isso, um jogador só em `targetEnemies` era invisível pra `getHostiles()`/`mem.enemies`/`combat.threats()` fora de sala própria; um guarda que ele postasse na própria sala fraca (O4) ou numa remote (O3) nunca contava como ameaça no gate de dispatch, mesmo o jogador já estando na lista de alvo — só muda **detecção**, a política de "quando atacar" continua isolada em `rooms/raiding.js`) — ROADMAP 0012. `allies()` / `isAlly()` — lista de aliança (`Memory.settings.allies` sobrescreve o default); console `addAlly`/`removeAlly`/`listAlly` (ROADMAP 0029). `targetEnemies()` / `isTargetEnemy()` — lista **opt-in** de alvo ofensivo (`Memory.settings.targetEnemies`, vazia por padrão — ser hostil nunca torna um jogador alvo válido sozinho); console `addTargetEnemy`/`removeTargetEnemy`/`listTargetEnemies` (ROADMAP 0032 Fase 3). |
| `observer.js` | Alcance de observer: `myObservers()`, `hasAnyObserver()`, `observerFor(roomName)` (primeiro observer meu dentro de `OBSERVER_RANGE`, distância linear/Chebyshev — `Game.map.getRoomLinearDistance`, não path). Lido por `rooms/needs.js` (contagem de scout), `roles/scout.js` (pula sala já coberta por observer) e `structures/observer.js` (coordenação entre 2+ observers — ROADMAP 0056). ROADMAP 0029. |
| `config.js` | `get(path, fallback)` — único lugar de tunables: anda por `Memory.settings` (dot-path) → árvore `defaults` do módulo → `fallback` do chamador; nunca lança. ROADMAP 0012. |
| `market.js` | Book atual heap-only a cada 100 ticks (`currentBuy`/`currentSell`) e snapshots temporais horários do melhor BUY/SELL; mediana ponderada por volumetria, fair midpoint e custo recursivo de commodities via `COMMODITIES`. Receita reversível (um ciclo, como compressão/descompressão de `energy`/minerais) preserva a cotação temporal direta do recurso; commodity acíclica pode usá-la como insumo (ROADMAP 0096/0100). |
| `autoscale.js` | Ajuste incremental genérico de contagem-alvo, por sala (ROADMAP 0040/0049). `register(role, {grow?, shrink?, maxCount?})` — `grow`/`shrink` recebem `(room, wanted, delta)` e devolvem uma pontuação de pressão (`0`/falsy = não elegível, `> 0` = elegível, maior = mais urgente); `maxCount(room)` devolve o teto **absoluto** desse role (fórmula base + delta combinados). `apply(room, wanted)` — muta `wanted` com o delta acumulado da sala (`Memory.rooms[name].autoscale.delta[role]`, nunca deixa o total abaixo de 0) e, só quando o cooldown **da sala** abriu (`Game.time - lastAdjustTick >= autoscale.cooldown`, default 30000 — compartilhado entre **todos** os roles registrados, não por role), escolhe o maior `grow` entre os elegíveis (crescer tem prioridade) ou, faltando isso, o maior `shrink` entre quem tem delta positivo pra devolver, aplica ±1 só nesse role, e reinicia o cooldown da sala. Por fim, **incondicional** (não depende do cooldown ter aberto): pra todo role com `maxCount` definido, `wanted[role] = Math.min(wanted[role], maxCount(room))` — cobre o caso em que a fórmula base **sozinha** já ultrapassa o teto (`builder` até 4, `hauler` até 5 sem link, ambos acima dos tetos atuais de 2/3), onde só bloquear o `grow()` não bastaria (ROADMAP 0049, generaliza o clamp manual de RCL8 que 0041 tinha só pro `upgrader`). Cada predicate (`grow`/`shrink`/`maxCount`) roda em `try/catch` próprio — uma que lançar é ignorada naquele tick, não derruba o resto (constitution §3). `rooms/needs.js`'s `upgrader` é o primeiro consumidor, seguido de `hauler`/`builder`/`pioneer`. |
| `combat.js` | `takeCover(creep)` (creeps não-combatentes se abrigam sob ataque), `isDangerous(pos, room)` (mesma regra de segurança do `takeCover`, mas para uma posição qualquer — extraída pra ser reusada por um job picker antes de escolher o alvo, não só reagir depois) e `excludeDangerZone(candidates, room)` (filtra uma lista `{pos}` pela `isDangerous`, no-op — mesmo array — fora de `defenseActive`; ROADMAP 0107 follow-up, aplicada em `hauler.js`/`utils/energy.js`/`upgrader.js`/`bootstrap.js` pra nenhum picker de coleta/depósito escolher um alvo dentro da zona de ataque), `flee`, `blockingMatrix`, `isArmed`, `hasMelee`, `threats`, `incomingDps(hostiles)` (ROADMAP 0036 revisão — dano/tick somado por composição de corpo, boost lido ao vivo de `BOOSTS[part.type][part.boost]`, nunca hardcoded; usado por `rooms/defense.js`'s `checkSafeMode()`), `safeRange()` (lida ao vivo de `config.get("combat.safeRange")`, não cacheada — ajustável sem redeploy). Primitivos de combate compartilhados entre `defender`/`defenderStriker`/`defenderMedic` (ROADMAP 0032 Fase 2, migrados do antigo `defender.js` — constitution §5): `KITE_RANGE`, `threatPriority`, `pickTarget`, `shoot`, `patch`, `kiteAwayFrom`, `ensurePartner(creep, partnerRole)` (pareamento via `memory.partnerId` nos dois lados), `nearestOwnRampart`. `silenceAttackAlerts(creep)` (ROADMAP 0052, paridade com `old_1`) — `creep.notifyWhenAttacked(false)`; chamado incondicionalmente por `scout`/`raider`/`squadDismantler`/`pioneer` (entrar em território hostil/estrangeiro é o próprio trabalho deles) e por `reserver` só em missão `"contest"`. |
| `squad.js` | Movimento/coordenação de squad em lockstep de verdade (ROADMAP 0032 Fase 4, O5) — `advance(creep, squadId)`, chamado por `defenderStriker`/`defenderMedic`/`squadDismantler` quando `memory.squadId` está setado; nenhum dos três sabe de `Memory.squads` por conta própria (constitution §5). Por tick: poda membro morto e promove novo líder se preciso (`pruneDeadMembers`); fora de sala perigosa (`isDangerousRoom` — sala-alvo original **fixa**, `squad.room`, não `squad.target.room`, que muda durante o recuo, **ou** qualquer sala com `enemies>0`), viaja sozinho via `routing.moveToRoom` como o `raider`; decide recuar (`squad.state`) se a média de hp cai abaixo de `squad.retreatHpRatio` **e** existe saída sem hostil conhecido, senão luta até morrer; escolhe formatura (`block` 2x2 ou `column` fileira única, testando se as 4 próximas tiles cabem — `shapeFits`, via `combat.blockingMatrix` — `tileWalkable` também rejeita exit tiles e parede de terreno, e `avoidMatrix` bloqueia as 4 bordas pro `PathFinder` do líder, pra um squad nunca pisar numa borda e sair da sala ao fechar num alvo colado nela; ARK-82) e só um dos 4 roda `PathFinder` por tick (`ensureDecision`, gatilhado por `Memory.squads[id].dirTick===Game.time`, não por "só o líder pode calcular" — evita depender de ordem de iteração do `Game.creeps`); bloqueio persistente vira `avoid` temporário depois de `stuckTicksLimit` ticks (mesmo princípio de stall guard do `architect.js`). `disband()` — limpa `squadId` de todo mundo só quando um squad recuando chega de fato em `squad.from` (não em "qualquer sala segura" — striker/medic não têm lógica de volta-pra-casa fora do modo squad). `registerPending(creep)` — promove `Memory.pendingSquad` pra `Memory.squads` assim que os 4 membros necessários existem. `missionComplete(squad)` (ROADMAP 0047) — lê só `Memory.rooms[squad.room].enemies`/`.enemyStructures` (já mantido por `rooms/intel.js`, sem `room.find` novo); `"siege"` só olha `enemyStructures` (dismantler não luta contra creep), qualquer outra missão exige os dois zerados. Chamado dentro do bloco `state==="advancing"` de `advance()`, logo depois de `maybeRetreat()` — quando verdadeiro, dispara a mesma transição pra `"retreating"`/`target={room:from}` já testada pelo recuo por HP, então um squad `"combat"` que limpa tudo (creeps + `defenderStriker`'s mop-up de estrutura, ver `roles/`) volta pra casa sozinho em vez de ficar parado pra sempre no centro da sala. |
| `move.js` | `travel(creep, target, opts)` — cache de rota em `creep.memory._m`, repath quando preso, swap-com-parado (creep móvel), pedido de licença via `utils/excuseMe.js` (creep parado — ROADMAP 0044), `CostMatrix` por sala no heap. `nativeMoveTo` capturado para fallback. Só same-room; alvo em sala diferente cai direto pro `nativeMoveTo` (`costCallback` passa intacto). |
| `excuseMe.js` | Cortesia de tráfego (ROADMAP 0044) — `ask(mover, nx, ny)`, chamado por `move.js`'s `travel()` quando a próxima tile do caminho tem um creep aliado parado (`isParked`). Caminha em linha reta a partir de `(nx, ny)` coletando qualquer fila de creeps parados na mesma direção (até `excuseMe.maxChain`, default 4 — corredor de 1 tile, não busca geral; `NEVER_ASKED = {miner: true}` para a coleta ali mesmo, sem incluí-lo — o miner nunca negocia sua seat do container, `roles/miner.js`'s próprio re-seat é quem decide onde ele fica, e um miner mais à frente na fila também nunca é "atravessado", só quem vem antes dele pode sair sozinho pro lado), escolhe uma tile de saída pro último da fila (`pickExitTile`, entre reto-à-frente e as 8 tiles adjacentes a ele) e move a fila **inteira** nesse tick (`mover.say("Excuse-me")` + `blocker.say("Ok!")` por bloqueador) — o motor do Screeps resolve nativamente o encadeamento "todo mundo anda uma casa" quando o último pousa numa tile vazia, sem swap 1:1 escrito à mão nem estado em Memory. A tile de saída prefere ficar dentro de uma "âncora" de trabalho do bloqueador (`anchorsFor`, follow-up a pedido do usuário) — controller a alcance 3 pra um upgrader, ou o container/link debaixo dele agora (qualquer role, mesma checagem que `isParked` já usa) — só cai pra "qualquer tile livre" (reta à frente primeiro) se nenhuma candidata bater com nenhuma âncora; essa preferência só vale pro último da fila, quem vem antes dele é sempre forçado a ocupar a tile vagada pelo de trás. Sem creep elegível na fila (ex.: o próprio bloqueador imediato já é um miner) ou sem tile válida pra ninguém nela, devolve `false` e `travel()` volta a rodear (comportamento anterior). |
| `routing.js` | Roteamento **entre salas** pra um destino específico (não a exploração do scout): `isHighwayRoom(roomName)` (x%10==0 ou y%10==0 — corredor aberto/sem dono); `isDangerousRoom(roomName)` (ROADMAP 0064 live follow-up — `rooms/remotes.hasHostiles(roomName) || rooms/remotes.isForeignOwned(roomName)`; achado ao vivo: um claimer entrou numa sala de outro jogador com zero creeps hostis vistos e travou nos muros/ramparts que o dono já tinha construído — `hasHostiles` sozinho só enxergava creep hostil visto, nunca posse de sala; `isForeignOwned` isenta sala de aliado de propósito, o obstáculo interno de aliado é assunto do backtrack reativo, não desse gate); `findRoute(from, to, opts)` (`Game.map.findRoute` com `routeCallback` que exclui toda sala em `opts.avoid` incondicionalmente, barateia sala highway, penaliza sala perigosa (`isDangerousRoom`), ou — `opts.blockHostiles` — exclui de vez, custo `Infinity`); `routeCostCallback(route, current, to, opts)` (`costCallback` pro `moveTo` nativo — sala atual/destino/rota calculada, mais os vizinhos conhecidos de cada hop via `Memory.rooms[x].exits` como folga pro `PathFinder` contornar um obstáculo de terreno interno que `Game.map.findRoute`, só ciente de adjacência de salas, nunca vê — filtrados por `opts.avoid`/hostil; sem intel de `exits`, sem folga, nunca um chute — ROADMAP 0061, pesquisa na lib externa `screeps-cartographer`; é uma lista de **permissão** — só a sequência calculada + a folga de vizinho fica andável, todo o resto custa `Infinity`); `avoidCostCallback(avoid, opts)` (ROADMAP 0064 same-day, a causa raiz de verdade — `costCallback` espelhando o `roomCallback` que `computeRealRoute` já usa: lista de **bloqueio**, só exclui `opts.avoid`/hostil sob `blockHostiles`, todo o resto aberto a custo de terreno puro; achado ao vivo com um `PathFinder.search` cru do usuário no console, a partir da posição real do creep, excluindo só a sala genuinamente fechada — achou em 1313 ops o caminho exato que `routeCostCallback` vinha recusando: a validação por terreno do 0064 e a execução nativa do `moveTo` nunca enxergavam o mesmo espaço de busca, permissão vs. bloqueio, então uma rota real e já validada podia ser rejeitada na hora de andar; `moveToRoom` usa essa em vez de `routeCostCallback` sempre que a viagem está sendo guiada por uma `_realRoute` já validada, `routeCostCallback` sobra só pro caminho puramente reativo sem `_realRoute`; ROADMAP 0064 same-day, segunda metade da mesma causa raiz — sair da sequência de salas GRAVADA em `_realRoute` (`idx === -1` no lookup de `creep.room.name`) não pode mais descartar a validação inteira, porque a liberdade de bloqueio do `avoidCostCallback` faz o `PathFinder` nativo escolher rotineiramente um caminho diferente da sequência exata gravada — confirmado ao vivo, `_routeStack` divergindo do `_realRoute` já nos 2 primeiros saltos; `idx === -1` agora recebe o mesmo tratamento que "ainda na sala de origem da busca", mantendo `_realRoute`/`usingRealRoute` intactos, já que `avoidCostCallback` nunca lê a sequência gravada, só `avoid`); `isBouncing(creep)` (trilha `[A,B,A,B]` por nome de sala — pega um creep que atravessa a borda pra frente e pra trás a cada ciclo, posição nunca congela; só detecção); `isStuck(creep, keyPrefix)` (mesma posição — x/y/sala, qualquer tile, não só borda — por `routing.stuckTicks` ticks seguidos, ignorando tick com `creep.fatigue>0` — só usado hoje por `roles/scout.js`'s exploração livre; `moveToRoom` abaixo não usa mais essa detecção pra si mesmo, ROADMAP 0063 follow-up); `isOnBorder(creep)` (x/y 0 ou 49, só pro fallback de nudge — ROADMAP 0063 tirou `borderNeighborRoom`, que só existia pra alimentar a parte insegura do 0060/0061); `nudgeAwayFromBorder(creep)` (anda 1 tile pra dentro via `creep.move()` direto); `computeRealRoute(fromPos, toRoomName, opts)` (ROADMAP 0064 — um único `PathFinder.search` de terreno real via `Game.map.getRoomTerrain`, disponível mesmo sem visão; `roomCallback` só exclui `opts.avoid`/hostil sob `blockHostiles`, toda outra sala fica a custo de terreno puro, sem estruturas; reduz o `path` de tiles pra uma sequência de nomes de sala deduplicada, excluindo a sala de origem — `null` se a busca vier incompleta/vazia). `moveToRoom(creep, toRoomName, opts)` amarra tudo: destino já presente em `creep.memory._routeAvoid` devolve `ERR_NO_PATH` na hora; grava cada sala realmente visitada nesta viagem em `creep.memory._routeStack` (zerado quando `toRoomName` muda, junto com qualquer `_realRoute` cacheado); com `opts.realRoute` (opt-in), `tryComputeRealRoute(creep, toRoomName, opts)` chama `computeRealRoute` e cacheia o resultado em `creep.memory._realRoute`/`_realRouteDest`/`_realRouteFrom` — não só uma vez no início da viagem, mas de novo toda vez que um recuo termina (ROADMAP 0064 same-day follow-up — confirmado ao vivo: deixar a validação só pro início significava que, depois do primeiro beco sem saída, o resto da viagem inteira ficava presa no `findRoute` estreito de sempre, reproduzindo o mesmo bug que motivou o 0064; cada recuo concluído é uma nova perna partindo de chão bom, com a sala causadora já em `_routeAvoid` — limitado ao número de becos sem saída de verdade, não uma busca por tick). Gatilho de recuo: **não** é mais posição congelada (`isStuck`) — é `creep.memory._routeNoPathTicks`, sequência de ticks consecutivos em que o `creep.moveTo()` do próprio `moveToRoom` devolveu `ERR_NO_PATH` de verdade (`routing.noPathTicks`, default 2; achado ao vivo no mesmo dia do 0063: tráfego/creep parado na frente também congela a posição, mas só uma sala genuinamente sem caminho faz o `moveTo` nativo devolver `ERR_NO_PATH`) — ou `isBouncing` (padrão que nunca congela, `ERR_NO_PATH` não pega). Ao disparar, `retreatFrom(creep)` (ROADMAP 0063) empilha só a sala atual em `creep.memory._routeAvoid` (por-creep, sem TTL — ROADMAP 0062), descarta qualquer `_realRoute` cacheado (uma rota validada que ainda assim falhou não é remendada — a próxima é recalculada do zero, não um patch), tira do topo de `_routeStack` e, se sobrar uma sala anterior na pilha, manda o creep andar direto pra lá (`creep.moveTo` simples, sem restrição de rota — é uma sala adjacente por onde ele acabou de passar, sempre andável) antes de tentar de novo o destino real; só quando o creep chega de fato lá — o mesmo ponto onde `tryComputeRealRoute` roda de novo — o próximo `route` (do `_realRoute` recém-revalidado, se `opts.realRoute` e a busca achou algo, senão `findRoute`) parte dessa sala — onde o beco sem saída finalmente é avaliado como candidato de verdade (`Game.map.findRoute`'s `routeCallback` nunca é chamado pra sala de onde a busca PARTE, só pras que ela considera entrar — por isso `_routeAvoid` conter a própria sala do creep nunca tinha efeito nenhum antes do 0063). Sem sala anterior no histórico (a origem da viagem já é o beco sem saída), cai no mesmo fail-soft de sempre. Antes de cada `moveTo` normal, compara o tamanho de `creep.memory._routeAvoid` contra `creep.memory._routeAvoidSeenLen` (o tamanho na última sincronização) e descarta `_move` se cresceu (ROADMAP 0063 live follow-up via 0064 — confirmado ao vivo: o cache de path **nativo** do motor, controlado por `reusePath`, não é invalidado só por trocar a `costCallback` a cada tick, só quando o destino muda/o cache expira/a próxima tile fica bloqueada — um path calculado antes de uma sala entrar em `_routeAvoid` podia continuar sendo andado através dela; `retreatFrom()` já limpava `_move` no momento em que disparava, mas essa não era a única forma de `_routeAvoid` crescer em relação ao path em uso). `nudgeAwayFromBorder` só entra como fallback se `moveTo()` devolver `ERR_NO_PATH` estando na borda (ROADMAP 0060). Nunca chama `PathFinder.search` **por tick** (a tentativa revertida de antes rodava por sala entrada); `computeRealRoute` roda **uma vez por perna da viagem** (início + cada recuo concluído), opt-in — custo completamente diferente, ainda limitado por evento real, nunca por tick. Com `opts.realRoute` (hoje só a missão `"claim"`), toda chamada nativa de `moveTo` dentro de `moveToRoom` (a principal e as de recuo, via `moveOpts`) leva `maxOps: routing.moveMaxOps` (default 20000) e `maxRooms: routing.moveMaxRooms` (default 64) em vez do default do motor (2000 ops / 16 salas — ROADMAP 0064 same-day: confirmado ao vivo com log de diagnóstico que `computeRealRoute` validava uma rota real e o `moveTo` nativo que a executava de verdade ainda assim devolvia `ERR_NO_PATH`, porque nunca herdava esse orçamento). Escopado só a `opts.realRoute` (outra correção no mesmo dia, a pedido do usuário — "isso aumenta consumo de CPU? vale pra todo path?"): sem evidência de que `scout`/`pioneer`/`raider`/`squad` precisassem de mais orçamento, eles continuam exatamente no default do motor, sem mudança nenhuma. `global.routeCheck(fromRoomName, toRoomName)` (console) — diagnóstico manual: rota sem restrição vs. `blockHostiles`, e qual sala hostil da rota direta está bloqueando quando `blockHostiles` não acha nada. Usado por `signRoom`/`planLayout` do scout e pelo `reserver` (`blockHostiles: true`; `realRoute: true` só na missão `"claim"`, ROADMAP 0064). ROADMAP 0028/0058/0060/0061/0062/0063/**0064** (histórico: 0058 blacklist global com TTL; 0060 detecção por posição-parada; 0061 duas tentativas de "qual sala é a armadilha" via distância linear, nenhuma resolveu; 0062 lista por-creep `_routeAvoid`, mas sua reação a um bounce podia sacrificar o corredor de recuo; 0063 achou a causa raiz — `avoid` conter a sala em que o creep ESTÁ nunca tem efeito, porque `findRoute` sempre recalcula a partir dela — corrigido com recuo físico até a sala anterior no próprio histórico, e no mesmo dia trocou o gatilho de posição-congelada por sequência de `ERR_NO_PATH` real depois de outro falso positivo ao vivo; **0064 achou o limite seguinte**: mesmo com o gatilho e o recuo certos, `routeCostCallback`'s recorte do espaço de busca (0061) pode bloquear um caminho que existe de verdade — resolvido validando contra terreno real antes de andar, pro caso que menos pode se dar ao luxo de descobrir isso na marra: o claimer; mesmo dia, `isForeignOwned` fechou o buraco de sala de dono estrangeiro sem creep hostil visto, `_routeAvoidSeenLen` fechou o buraco do cache de path nativo não respeitar `_routeAvoid`, e a validação de terreno passou de "uma vez no início" pra "uma vez por perna" depois que só validar no início provou devolver o resto da viagem pro mesmo mecanismo estreito assim que o primeiro beco sem saída aparecesse; **a causa raiz de verdade só apareceu depois**, quando salas confirmadas limpas por inspeção visual continuavam sendo culpadas por `retreatFrom` — `routeCostCallback` sendo lista de permissão em vez de bloqueio como o `computeRealRoute` que validou a rota; corrigida com `avoidCostCallback`, usada no lugar de `routeCostCallback` sempre que a execução segue uma `_realRoute` validada). **ROADMAP 0075** (usuário: quer o pré-cálculo funcionando "pra todos os caminhos multi-sala", não só quem lembra de passar a flag) — `opts.realRoute` vira opt-**out** (`!== false`) em vez de opt-in, tanto em `tryComputeRealRoute` quanto no bump de `maxOps`/`maxRooms`; `roles/scout.js`'s exploração livre (sem destino fixo, sempre vizinho direto, alvo re-escolhido a cada ciclo — validar terreno pra um hop que já é vizinho não compensa o custo) é a única exceção deliberada, com `realRoute: false` explícito; todo outro chamador existente (`reserver`/`raider`/`pioneer`/`squad`, já passavam `true`) perde a flag agora redundante. Novo `opts.allowRoom(roomName) => boolean` — filtro extra (E lógico, não substitui `avoid`/hostil) aplicado em `findRoute`, `computeRealRoute`, `routeCostCallback` e `avoidCostCallback`, usado por `roles/remoteHauler.js`/`roles/remoteMiner.js` (ver `remotes.js`'s `allowRoom` abaixo) pra manterem a restrição "só sala minha/reservada" que só tinham antes via `remotes.roomCallback`'s `costCallback` isolado — sem validação prévia nem retreat/backtrack nenhum, o que deixava um creep preso em `ERR_NO_PATH` pra sempre numa sala remote com labirinto de parede natural. **Fechamento da task (2026-09-14, mesmo dia do 0075)** — usuário pediu a limpeza dos `console.log` de diagnóstico que a investigação ao vivo do 0064 tinha deixado no módulo (o log por-tick de `ERR_NO_PATH`, o dump de structures/creeps da sala em `retreatFrom`, e mais 5 outros — incluindo dois marcados "deliberately permanent" por uma sessão anterior, removidos mesmo assim por pedido explícito): todos removidos, `routeCostCallback` não expõe mais `allowedRooms` (só existia pra alimentar um desses logs), `moveToRoom` não envolve mais o `costCallback` numa closure de `queriedRooms`. Só sobra `global.routeCheck()` — comando manual de console, não log automático. **ROADMAP 0076** (usuário reportou ao vivo, mesmo dia: pioneers de E1N47→E1N45 entrando no E1N46 e batendo num rampart/wall de **aliado** — exatamente o gap "Later" acima, terreno vs. estrutura, reaparecendo; cada pioneer novo repetia a mesma descoberta cara porque `_routeAvoid` é por-creep) — `isKnownDeadEnd(roomName)`/`markDeadEnd(roomName)` novos: `retreatFrom()` (que só confirma um beco com `creep.room.name` como ground truth desde o 0063, nunca mais um chute) chama `markDeadEnd` além do `_routeAvoid` de sempre, gravando `Memory.rooms[x].routeDeadEndUntil` (TTL, `routing.deadEndTicks`=10000); `findRoute`/`computeRealRoute`/`routeCostCallback`/`avoidCostCallback` passam a checar `isKnownDeadEnd` do mesmo jeito que já checam `avoid`; `moveToRoom()` recusa outright se o próprio destino já é um beco confirmado, mesmo pra um creep sem nenhuma tentativa própria. Revive o espírito do blacklist global do ROADMAP 0058 (morto pelo 0062 por adivinhar errado qual sala era a armadilha) — seguro agora porque o 0063 já eliminou o chute. Console `clearRouteDeadEnd(roomName)` reseta a marca antes do TTL. Escopo deliberadamente restrito a isso — usuário descartou por ora validar estrutura visível no pré-cálculo (só ajudaria com visão já disponível na hora do cálculo, raro nesse cenário). **ROADMAP 0077** fecha esse mesmo gap "Later": `computeRealRoute`'s `roomCallback`, `routeCostCallback` e `avoidCostCallback` passam a devolver `utils/move.js`'s `roomMatrix(room)` (já cacheada por sala/estrutura+canteiro, zero `room.find` novo) em vez do fallback terreno-only, pra qualquer sala com `Game.rooms[roomName]` presente no tick — rampart/wall de terceiro (inclusive de aliado, `isDangerousRoom` continua isentando a posse) numa sala já em visão agora é respeitado direto na CostMatrix, sem esperar o creep colidir fisicamente com `ERR_NO_PATH` pra disparar o backtrack (0063)/dead-end compartilhado (0076). Sala sem visão continua idêntica a antes — prever estrutura sem visão prévia (scouting antecipado) segue de fora, fora de escopo por decisão já tomada. **ROADMAP 0078** — **bug real em produção, reportado ao vivo mesmo dia**: `Memory.rooms['E1N47']` (sala própria, com spawn) confirmou `routeDeadEndUntil` setado — o cache compartilhado do 0076 tinha marcado a sala-mãe do usuário como beco-sem-saída, bloqueando roteamento de/pra ela pra todo creep. Causa raiz: quando `retreatWithoutBlame()` (0064) recua e não sobra sala anterior, `moveToRoom()` cai no fallback "tenta de novo pelo fluxo normal, a partir da MESMA sala" — se esse fluxo também falhar por `noPathTicks` ticks, `retreatFrom()` dispara de novo culpando `creep.room.name`, que já não é mais o beco original e sim a sala de recuo — o mesmo padrão "search-space constrangido" que `retreatWithoutBlame()` existe pra não culpar, um nível abaixo do alcance daquela proteção. Fix, dois guards: `hasEarlierRoom(creep)` novo — `retreatFrom()` delega pra `retreatWithoutBlame()` só quando `_routeAvoid` já tem uma entrada de beco anterior confirmado **e** não sobra sala mais antiga agora (ciclo de recuo SEGUNDO-ou-posterior); nunca no primeiro travamento genuíno de uma viagem (`_routeAvoid` vazio, preserva a culpa normal do 0063 e os testes mazeCreep/parkedCreep pré-existentes). `markDeadEnd()` e o push no `_routeAvoid` por-creep de `retreatFrom()` recusam sala própria (`remotes.isMine`) incondicionalmente, independente do guard anterior — `architect.js` sempre planeja estrada até toda saída, uma sala própria nunca é um beco de verdade. Causa exata do `ERR_NO_PATH` repetido em E1N47 (se veio do `knownStructureMatrix` do 0077, que já estava no ar, ou de outra fonte transitória) fica investigação futura — os dois guards tornam a CONSEQUÊNCIA impossível independente da causa. |
| `mincut.js` | Min-cut de Dinic para posicionar ramparts (vendored). |
| `stats.js` | Escreve `Memory.stats` para o Grafana, incluindo `market.fairPrice` esparso do snapshot de `utils/market.js` (ROADMAP 0096). ROADMAP 0079 follow-up (2026-09-24): `market.transactions.{bought,sold}.<resourceType>` (`{amount, credits}`) e `terminalNetwork.transfers` (`[{from, to, amount}]`), lidos de `terminalOps.marketTransactionStats()`/`terminalTransferStats()` — a spec original marcava os dois como "não faz sentido popular" porque o bot nunca chamava `Game.market.deal()`/`terminal.send()`; ROADMAP 0098 passou a chamar os dois de verdade, então os painéis "Mercado"/"Terminal Network" do dashboard deixam de ficar sempre vazios. |
| `profiler.js` | screeps-profiler (vendored). |
| `visual-room.js` | `RoomVisual.prototype.structure` etc (vendored). |
| `console.js` | Registra `global.help()` — imprime a lista de comandos de console conhecidos (mantida à mão), agrupada por assunto. `require`ido por efeito colateral em `utils/index.js`. |
| `traffic.js` | Contador de tráfego por tile, 100% heap. `record(creep)` (chamado 1×/creep/tick pelo `main`), `decay()` (1×/100 ticks, −1%), `hot(roomName, threshold)`, `isHot(roomName, x, y, threshold)`, `worthRepairing(structure)` — política de repair de estrada (0108: só repara abaixo de `ROAD_REPAIR_FLOOR`=0.4; abaixo do piso, estrada reservada pelo plano (`utils/plan.js`'s `planEntriesAt`) vale sempre, e só onde o plano não diz nada — sala sem plano ou tile não reservado — ainda exige tráfego recente; qualquer outra estrutura sempre vale reparar). |
| `rampartGates.js` | Quais ramparts uma sala deixa um aliado atravessar (portões). Para cada par de saídas: caminho com ramparts bloqueadas; se existe, nada a abrir; senão, caminho com rampart a custo alto (`rampartGates.rampartCost`) e as ramparts sobre ele são portões. Cache de heap por sala, recalculado quando muda o nº de ramparts e a cada 600 ticks. Console `rampartGates()` lista os portões por sala. |
| `cadence.js` | `due(last, interval)`: trabalho periódico numa grade fixa a partir do tick 0 (base 60), para jobs de intervalos múltiplos caírem no mesmo tick. |
| `orderBook.js` | Um `Game.market.getAllOrders()` por tick compartilhado por `market` e `marketFlip`. |
| `damagedStructures.js` | Lista de estruturas danificadas por sala (scan a cada `repair.scanTicks`=5, todo tick sob ataque; ordenada 1x/tick), compartilhada por tower e builder. |
| `rampartRepair.js` | Fonte única de classificação e prioridade de reparo usada por tower e builder. `tier()` usa 0,1%/1% para rampart/wall e 10%/50% para estruturas normais; `priority()` ordena tier → tipo → ratio. `builderMayRepair()` e `towerMayRepair()` mantêm crítico sem gate de storage, exigem storage `>10%` para rampart/wall saudáveis e `>=70%` para hardening. A tower ainda exige 50%/70% de energia própria conforme o tier. |
| `resourceTiers.js` | Políticas econômicas e gates de storage. `reserveFloor()`/`aboveReserve()` mantêm a reserva geral de 1%; `isStorageAbundant()` continua usando `logistics.storageSatisfactoryRatio` de 50% para economia/link; `isStorageAbove()` e `isStorageAtLeast()` fornecem os gates específicos de reparo defensivo de 10% e 70% sem alterar o balanceamento intersalas. |
| `energyLedger.js` | Contabilidade de "pra onde a energia foi" por sala (ROADMAP 0081 — a constituição já cita "contabilidade de energia" como responsabilidade de `utils/*`, este módulo formaliza isso). 100% heap. `record(roomName, category, amount)` (ignora `amount<=0`), `recordRepair(roomName, structureType, amount)` (mapeia `STRUCTURE_RAMPART`→`repairRampart`, `STRUCTURE_WALL`→`repairWall`, resto→`repairNormal`), `snapshot(roomName)` (as 10 categorias sempre presentes, default 0 — sem esparsidade, pra série temporal do Grafana não ter buraco). `snapshot()` devolve a **soma de uma janela deslizante** de `energyLedger.windowTicks` ticks (default 60 — "últimos 60 segundos", aproximação de 1 tick ≈ 1 segundo, sem sinal de relógio real disponível; ROADMAP 0081 follow-up, usuário pediu — sem isso uma leitura do Grafana a cada poucos ticks perdia gasto inteiro entre leituras), não só o tick corrente: cada tick fechado é arquivado num histórico por sala (`history[roomName]`), podado a cada `ensureTick()`/`snapshot()` pra nunca crescer sem limite; o tick ainda em andamento sempre entra na soma. **Medição por estimativa, não diff** (ROADMAP 0081 bug real, mesmo dia — usuário reportou em produção: "torres reparando, creeps construindo, spawns spawnando, mas os valores estão sempre retornando 0"; a primeira versão comparava `store[RESOURCE_ENERGY]` antes/depois do intent, o que só "funciona" nos mocks do smoke test — no motor real todo intent de creep é só enfileirado durante o script e aplicado pelo servidor depois que **todos** os jogadores terminam a tick, então o `store` lido logo após chamar `build()`/`repair()`/`upgradeController()` ainda reflete o valor de antes, diff sempre 0): `creditBuild(creep, site)`/`creditRepair(creep, target)`/`creditUpgrade(creep, controller)` estimam o gasto via WORK parts vivas (`part.hits>0`) × `BUILD_POWER`/`REPAIR_POWER`/`UPGRADE_CONTROLLER_POWER`, boost lido ao vivo de `BOOSTS[WORK][part.boost]` (nunca hardcoded — mesmo princípio de `utils/combat.js`'s `incomingDps`), limitado pela energia que o creep tinha antes de agir e pelo trabalho restante do alvo (`progressTotal-progress`/`hitsMax-hits`); só creditam quando o intent devolveu `OK`. `creditTower(tower, category)` usa `TOWER_ENERGY_COST` fixo (custo determinístico por ação, não depende de diff). `renewCost(body)` usa a fórmula nativa de `renewCreep` (`bodyCost/2.5/tamanho do corpo`). Instrumentado em `prototypes/creep.js`'s `runBuild` (`creditBuild`/`creditRepair`) e `runUpgrade` (`creditUpgrade`), nos `creep.build`/`creep.repair` diretos de `roles/builder.js`'s `opportunisticWork()` e de `roles/pioneer.js` (fora da state machine), em `structures/tower.js`'s `attack`/`rangedMassAttack` (`towerAttack`)/`heal` (`towerHeal`)/`repair` (`towerRepair`) via `creditTower`, e em `rooms/spawning.js` (`spawn` via `bodyCost(body)` no `spawnCreep` real — não o `dryRun` — porque o custo sai de spawn+extensions juntos, não só do store do spawn; `renew` via `renewCost(candidate.body)`). `utils/stats.js` grava o snapshot em `Memory.stats.rooms[name].energySpent`. Fora de escopo (decisão do usuário): waste/decay (drop/tombstone expirando, `link.transfer` loss) e o build/repair de container do `roles/remoteMiner.js` (sala remota, auto-financiado pelo próprio harvest local, nunca aparece em `Memory.stats.rooms`). |

#### Routing cost model

`routing.bodyTravelCosts(body, carriedAmount)` derives road/plain/swamp costs
from active `MOVE` and non-`MOVE` parts. `computeRealRoute()` and `moveToRoom()`
pass those costs to `PathFinder`; empty `CARRY` parts do not generate fatigue,
while loaded CARRY capacity contributes according to the current store load.
Invalid or missing bodies use the existing fallback costs.

### Economy policy snapshot

`resourceTiers.getEconomySnapshot(room)` calcula uma vez por sala/tick os
estados `critical`, `stable` ou `abundant`, a razão dominante e a quantidade
de consumidores críticos. `stats`, `hauler`, `remoteHauler` e `bootstrap`
reutilizam esse snapshot; terminal e transferências intersalas continuam fora
do escopo do 0091. `miner.distribute()` também consulta o snapshot para
decidir entre a reserva da torre de source e os buffers compartilhados, usando
os thresholds globais `tower.criticalRatio*`. `builder` usa o mesmo snapshot
para bloquear construção satisfatória em estado `critical`, mas preserva
reparos críticos.

`nonEnergyLogistics` separa demanda crítica de energia acionável (ROADMAP
0095). Sem fonte retornada por `hauler.pickLoad`, um owner por sala pode fazer
um job não energético preemptível. Com pelo menos dois haulers, output em 75%
reserva um deles mesmo com energia acionável; o outro continua na energia.
Output lab/factory pressionado eleva o piso para 2, mantido até cair abaixo de
50%. Carga já retirada sempre é entregue; sem destino, espera e só dropa perto
da morte.

### `src/prototypes/`

`index.js` os requer por efeito colateral: `roomObject` (pilha de estados:
`pushState`/`invokeState`/`popState`), `room` (`floodFill`), `creep` (handlers
de estado `runGetEnergy`/`runDeposit`/`runUpgrade`/`runBuild`), `move`
(sobrescreve `Creep.prototype.moveTo` → `utils/move.travel`, com fallback
nativo), `link` (`isCollector`).

### `src/rooms/`

`needs.js` mantém a contagem automática de `builder` entre `0` e `1`: a
fórmula base, o autoscale e `wantedOverride` não permitem mais de um builder
por sala. O teto `builder=2` descrito no ROADMAP 0049 é histórico e não vale
para o estado atual.

| Module | Papel |
|--------|-------|
| `intel.js` | Preenche `Memory.rooms[name]` a cada tick a partir de census + roomCache. Exits, sources, minerals, `defenseActive`, `numberOfTowers` (sala própria: `roomCache`; observada: scan de estruturas hostis, sem `FIND_STRUCTURES`), `controllerLevel` (RCL de qualquer sala vista, não só própria) e `hasInvaderCore` (do mesmo `find()` de `enemyStructures` — ROADMAP 0032 Fase 3, usados por `rooms/raiding.js`). |
| `needs.js` | `roomNeeds(room)` — **decide a contagem-alvo de todos os roles** a partir do estado da sala (RCL, sources, containers, link network, storage, backlog de canteiros, hostis). Cacheado por tick. Todo `role.wanted` lê daqui. **Cuidado ao adicionar um role aqui**: `compute()` calcula a variável local e precisa dela **também** no `return {...}` final — um bug real (ROADMAP 0037 follow-up) computou `pioneer` mas esqueceu de incluir no `return`, deixando `roomNeeds(room).pioneer` sempre `undefined` e `pioneer.spawn()` sempre falso (`0 < undefined` é `false` em JS) sem nenhum erro/exceção pra denunciar — só um role que nunca spawnava. Descoberto em produção, não pelo smoke (nenhuma assertion até então passava pelo caminho `roomNeeds → wanted() → spawn()` de verdade, só testava o cálculo isolado). `applyOverride()` (ROADMAP 0038) aplica `Memory.rooms[name].wantedOverride` por cima do `return` de `compute()`, role por role — chave desconhecida ou valor não-número é ignorada em silêncio (constitution §3), nunca corrompe os outros roles. Sem expiração automática: um override fica valendo até `clearWanted` remover — alavanca manual pra qualquer caso que a fórmula/o autoscale abaixo não cubram. Console `setWanted(roomName, role, count)`/`clearWanted(roomName, role?)`/`listWanted(roomName?)`. **Autoscale registrado aqui** (ROADMAP 0039 → 0040 → 0041 → 0042 → 0049) — quatro roles, cada um com seu próprio `grow`/`shrink`/`maxCount` (`<role>.autoscaleMaxCount` — **teto absoluto** desde 0049, não só um freio de crescimento: `upgrader`=8, `hauler`=3, `builder`=2, `pioneer`=6), todos competindo pelo mesmo passo de ±1 por sala/cooldown do `utils/autoscale.js` (crescer > encolher; empate decide pela ordem de `register()`, deliberada: **pioneer > hauler > builder > upgrader** — resgatar sala-irmã sem spawn vence a vazão desta sala, que vence terminar a própria construção, que vence banco de upgrade que ninguém pediu, ROADMAP 0042): `roomEnergySurplus(room)` (sem canteiro pendente, spawn/ext no teto, e todo source container ou o storage, se existir, cheio — "a sala não tem pra onde mandar energia") é a base compartilhada de duas: **upgrader** (`upgraderSurplusEligible` = `roomEnergySurplus` + RCL < 8) e **pioneer** (`pioneerSurplusEligible` = `pioneering.hasPendingTarget(room)`, alvo spawnless em alcance SEM o teto de `maxConcurrent` que `pioneersWanted()` já aplicaria, **e** `roomEnergySurplus` — cresce além do teto normal enquanto a sala-mãe tiver excedente e um alvo de verdade pra ajudar). **hauler** (`haulerBacklogEligible`/`haulerIdleEligible`) é o espelho de upgrader: container cheio **mas** spawn/ext (e storage, se existir) ainda com espaço = gargalo de vazão, não de destino — cresce; nenhum container passa de `hauler.minContainerLoad` = encolhe. **builder** (`builderSurplusEligible`/`builderScarceEligible`): canteiro pendente + `pickableEnergy` acima do mesmo teto do tier `byEnergy` (50000, `builder.autoscaleEnergyHigh`) = cresce além do tier; energia abaixo do piso (1500, `builder.autoscaleEnergyLow`) ou sem canteiro nenhum = encolhe — na prática hoje `builder` quase nunca chega a crescer de verdade (o próprio tier já bate o teto de 2 sozinho na maioria dos cenários elegíveis), o `maxCount` é quem garante o teto nesse caso, não o `grow()`. Depois do `autoscale.apply(room, wanted)`, um clamp incondicional **adicional** fecha a garantia de RCL8 pro upgrader: `rcl >= 8 → wanted.upgrader = Math.min(wanted.upgrader, 1)` — mais estrito que o `maxCount` genérico (8), específico de RCL8. `applyOverride()` (ROADMAP 0038) continua sendo o último passo, por cima de tudo isso. |
| `architect.js` (`planCity`) | Planejador de stamps de 13 passos. Stall guard força progresso. `stampStep()` tenta de novo com profundidade de floodfill mais frouxa e depois pula + loga. `createConstructionSites` — fila priorizada, ≤ 8 canteiros/sala, respeitando o cap do RCL. Clusters de source ganham uma torre + ramparts on-tile *fora* do perímetro do mincut. `findStampLocation` pontua cada posição pela soma da profundidade de flood-fill de cada célula coberta (não só a origem). `getContainerLocations` reaproveita container/link/torre **já construídos OU já em canteiro** perto da source/mineral (`existingBuiltNear` — junta `FIND_STRUCTURES` + `FIND_MY_CONSTRUCTION_SITES`) em vez de recalcular — sem isso, cada `replanRoom` fazia essas peças "andarem" de lugar; torres de perímetro (passo 12) reaproveitam do mesmo jeito (`unclaimedBuiltTowers`) antes de calcular uma posição nova. Sources/minerais são ordenados canonicamente (`byPosition`) antes de processar, já que `room.find()` não garante a mesma ordem entre ticks. Passo 3 (torre) também planeja o único nuker + observer do jogo (RCL8, teto de 1 cada — ROADMAP 0027), no lugar de 2 extensions do stamp original. Passo 10 (estradas): `roadAnchor()` (primeiro tile de estrada adjacente ao spawn, fallback pro spawn) → source containers → controller (alcance 3) → extras guiados por `traffic.hot()` → borda do mapa **só** pra sala vizinha `my` ou em `Memory.rooms[x].remotes` (`closestExitTile()`). `planCity(room, {preview:true})` — pula o gate "só sala própria" e nunca chama `createConstructionSites`; roda o mesmo algoritmo numa sala só vista (`planLayout()` console, ROADMAP 0028) pra prévia de layout; se a sala for reivindicada depois, o plano da prévia já vira o plano real. O cluster de mineral nunca ganha link (ROADMAP 0051 — `StructureLink` só move `RESOURCE_ENERGY`, restrição do motor; só o cluster de source ganha link/torre/segundo link) — continua ganhando rampart no container, igual antes. |
| `spawning.js` **Tier crítico (ROADMAP 0112):** bootstrap → 1º miner (`miner.spawnTier`) → 1º hauler → demais miners; bloqueante (não cai pro tier normal se impagável), com corpo mínimo (`FALLBACK_BODIES`) quando o role tem 0 creeps. | Fila de spawn priorizada. **Antes** de montar a fila (ROADMAP 0045, paridade com `old_1`): `renewIdleSpawns()` — cada spawn ocioso numa sala com energia acima de `renew.minEnergyRatio` (80%) tenta `renewCreep()` num creep adjacente caro (`bodyCost >= renew.minBodyCost`, sem `CLAIM`) e perto de morrer (`ticksToLive <= renew.ticksToLiveThreshold`); um spawn que renova sai da lista pro resto da função (nunca também spawna no mesmo tick). Sob ataque → `["defender", "defenderStriker", "defenderMedic", "bootstrap"]` — **precisa cobrir as duas formas de defesa** que `rooms/needs.js` pode querer: acima de `defender.pairEnergyThreshold` (500, alcançável já no RCL2 com poucas extensions) ele zera `defender` e passa a querer o par `defenderStriker`/`defenderMedic` (ROADMAP 0032 D2) — uma lista que checasse só `"defender"`/`"bootstrap"` deixava a sala sem enfileirar **nada** de defesa assim que cruzasse esse limiar, mesmo sob ataque real (bug real relatado em produção: sala não spawnava nada com invasor presente). `Memory.pendingSquad` (ROADMAP 0032 Fase 4) entra **primeiro** na fila fora de ataque — um squad pela metade parado esperando o resto é pior que atrasar algo substituível. Scouts/raiders só quando nada mais é desejado; `squadDismantler` nunca spawna pelo loop genérico (só via `raiding.spawnPendingSquad`). `dryRun` escolhe o maior corpo pagável por spawn ocioso. |
| `remotes.js` | Única porta pra "qual sala vale minerar remotamente" (ROADMAP 0020). `eligible(room)` (vista, sem dono, com source, dentro do teto de distância/contagem), `active(room)` (subconjunto **reservado por mim e seguro** de `Memory.rooms[x].remotes` — reserva é pré-requisito pra minerar, não paralelo), `pendingReserves`, `isMine`/`isReservedByMe`/`hasHostiles` (reusam intel já existente); `isForeignOwned(roomName)` (ROADMAP 0064 live follow-up — `Memory.rooms[x].owner` existe, não é o próprio jogador e não está em `utils/hostiles.isAlly` — `hasHostiles` sozinho só enxerga creep hostil **visto**, nunca posse de sala; uma sala de outro jogador já murada bloqueia igual, com zero creeps precisando estar lá; ally é isento — ver `utils/routing.js`'s `isDangerousRoom`); `roomCallback(allowRoomName)` (`costCallback` pro `moveTo` nativo — bloqueia qualquer sala que não seja minha/reservada, exceto o próprio alvo da missão); `allowRoom(destRoomName)` (ROADMAP 0075 — a mesma regra, mas como predicado booleano puro `(roomName) => boolean`, o formato que `utils/routing.js`'s `moveToRoom`/`opts.allowRoom` espera; `roles/remoteHauler.js`/`roles/remoteMiner.js` usam essa em vez de `roomCallback` agora, pra rotear pelo módulo de rota completo em vez de um `costCallback` isolado sem retreat/backtrack). Console: `reserveRoom`/`unreserveRoom`/`claimRoom`. `claimRoom` recusa: sala não escaneada, já minha, já dona de outro jogador (paridade com `reserveRoom`), sem controller (`hasController===false` — highway/SK/center room), bloqueada por zona de novato/respawn (`Game.map.getRoomStatus` — `isRoomAvailable` era deprecated, ROADMAP 0034), claim já pendente, sem sala-mãe própria, ou viagem estimada (`roomDistance × claim.ticksPerRoomHop`) não cabendo em `CREEP_CLAIM_LIFE_TIME` (600, não 1500 — qualquer corpo com `CLAIM` é limitado a isso) menos `claim.travelMargin` de folga (ROADMAP 0033) — GCL insuficiente continua só aviso (pode se resolver sozinho até o claimer chegar). `cancelClaim()` (ROADMAP 0053, espelha `cancelContest()`) apaga `Memory.claimTarget` na hora — não recolhe um claimer já em trânsito, só impede `rooms/needs.js` de spawnar reposição. |
| `raiding.js` | Única porta pra "vale a pena invadir" (ROADMAP 0032 Fase 3/4, mesmo papel do `remotes.js` só que pra ofensiva). `isWeakEnemyRoom(roomName)` — sala de um `targetEnemy` (`utils/hostiles.isTargetEnemy`), sem torre/hostil visto, RCL até `raiding.maxTargetRcl`; `findWeakTarget()` varre `Memory.rooms` (sem `room.find` novo). `refusalReason(roomName)` — validação de alvo compartilhada entre `raidRoom`/`raidSquad`: cobre O2 (sala sem dono com `hasInvaderCore`/hostil, PvE, nunca checa `targetEnemies`) e O4 (sala de um `targetEnemy` que passa em `isWeakEnemyRoom`). Console `raidRoom(roomName, motherRoomName?)` — 1 `raider` solo. Console `raidSquad(roomName, mission, motherRoomName?)` — monta `Memory.pendingSquad` (receita de 4 papéis por `mission`: `"combat"` = 2×`defenderStriker`+2×`defenderMedic`, `"siege"` = 2×`squadDismantler`+2×`defenderMedic`); `spawnPendingSquad(room)` devolve o próximo membro faltante pro `spawning.js`. Scan automático opcional (só pro `raidRoom` solo) em `main.js` via `raiding.autoRaid` (`Memory.settings`, default `false` — opt-in explícito). **O3 (ROADMAP 0036, gate próprio, forma diferente do de cima)**: `isEnemyRemote(roomName)`/`remoteRefusalReason(roomName)` — sala escaneada, **sem dono** (isso é trabalho do `raidRoom`, não deste), reservada por um `targetEnemy`, sem hostil visto (`mem.enemies`, agora correto fora de sala própria — ver `utils/hostiles.js`). Console `raidRemote(roomName, motherRoomName?)` — 1 `raider` em `mission:"harass"`. **`contestRoom`/`cancelContest`** (ROADMAP 0046, paridade com `old_1`, sempre manual — nunca via `autoRaid`): `contestRefusalReason(roomName)` — a única situação em que "já é de outro jogador" é o **requisito**, não motivo de recusa: escaneada, não minha, dona/reservada por alguém (senão "use claimRoom/reserveRoom"), esse alguém nunca aliado (`isAlly`), sempre em `targetEnemies` (`isTargetEnemy` — mesmo opt-in de O2/O4), com controller, sem bloqueio de `Game.map.getRoomStatus`; mesma checagem de viagem×`CREEP_CLAIM_LIFE_TIME` do `claimRoom` (0033). Grava `Memory.contestTarget={room,from}` (1 no império, como `claimTarget`); `cancelContest()` apaga a qualquer momento — decisão do jogador, não automática. |
| `defense.js` | `checkSafeMode(room)` (ROADMAP 0032/0036 D6, **revisado** — ver "Bug real" no `spec.md` do 0036) — gatilho automático de safe mode, conservador de propósito. Sem estado novo em Memory — cada tick decide do zero: sala própria, sem safe mode já ativo, um hostil armado (`combat.threats`) a alcance de ataque de algum spawn (`RANGED_ATTACK`→3, senão 1) **e** o pior `ticksToKill` entre os spawns próprios ≤ `combat.safeModeTicksToKillThreshold` (default 20) → `room.controller.activateSafeMode()`. `ticksToKill(room, spawn, dangers) = effectiveHp(room, spawn) / combat.incomingDps(hostis a alcance)`; `effectiveHp` usa o `hits` do rampart própria na mesma tile do spawn se houver uma viva (rampart absorve todo o dano antes da estrutura embaixo, mecânica nativa), senão o `hits` do próprio spawn; `incomingDps` soma dano por parte do corpo (`ATTACK_POWER`/`RANGED_ATTACK_POWER`), multiplicador de boost lido ao vivo de `BOOSTS[part.type][part.boost]` (nunca hardcoded). Substitui o gate original (`hp_ratio ≤ 0.5` **ou** zero `defender`+`defenderStriker` vivos via census) — a perna de "zero defenders" provou-se falso-positivo em produção porque defender só nasce reativamente, ficando trivialmente ausente nos primeiros ticks de qualquer incursão fraca; `ticksToKill` cobre os dois casos reais (burst letal mesmo com hp cheio, e cerco sustentado que já corroeu o hp de verdade) sem esse sinal. Nunca lança se `activateSafeMode()` devolver erro (cooldown, sem carga) — só loga quando não é `ERR_TIRED`/`ERR_BUSY` (esses dois não valem log a cada tick). Chamado do `main.js` no loop de `Game.myRooms`, dentro de `guard()`, logo depois de `spawning`. |
| `pioneering.js` | Única porta pra "qual sala própria sem spawn precisa de resgate, e quem ajuda" (ROADMAP 0037, mesmo papel do `remotes.js`/`raiding.js` pro próprio domínio). `isSpawnless(room)` — própria, zero `STRUCTURE_SPAWN` (`roomCache.structuresByType`, sem `room.find` novo). `spawnlessRooms()` — filtra `Game.myRooms`, excluindo qualquer sala com hostil visto (`mem.enemies`, gate de segurança — não manda `WORK`/`CARRY` desarmado pra zona de guerra). `candidateMothers()` — salas próprias **com** spawn (uma sala sem spawn não pode ajudar outra). `mothersFor(targetRoomName)` — **toda** candidata dentro de `pioneer.maxDistance` (default 30, `remotes.roomDistance`, hops de rota), não só a mais próxima — cada sala em alcance manda sua própria dupla de pioneers (ROADMAP 0037 follow-up: "cada sala próxima envia 2 pioneers"). `assignedBy(motherRoom, targetRoomName)` — quantos pioneers **essa** mãe especificamente já tem naquele alvo (`census.all("pioneer")`, filtrado por `memory.targetRoom` **e** `memory.home` juntos — o teto de `pioneer.maxConcurrent` é por par mãe-alvo, não por alvo sozinho, senão a primeira mãe a mandar 2 travaria todas as outras). `pioneersWanted(motherRoom)`/`nextTarget(motherRoom)` — soma/escolhe entre as salas-alvo em alcance dessa mãe, respeitando o teto **da própria mãe**; zero quando a sala-mãe está sob ataque (mesma cautela de `reserver`/`raider` em `rooms/needs.js` — checada duas vezes, aqui **e** lá, mesmo princípio de defesa em profundidade). `hasPendingTarget(motherRoom)` (ROADMAP 0041) — o mesmo `targetsFor` de `pioneersWanted`, mas sem o teto de `maxConcurrent`: "existe alvo de verdade em alcance", puro, é o sinal que o `grow` do autoscale (`rooms/needs.js`) precisa pra decidir se vale empurrar `pioneer` além do teto normal. Nenhuma atribuição persistida em Memory — tudo recalculado do zero por tick, mesmo princípio de `raiding.findWeakTarget()`. Console `pioneerStatus()` — traço read-only da cadeia inteira (sala spawnless → lista de resgatadoras em alcance, cada uma com sua própria contagem atribuído/faltando), adicionado depois que um relato em produção de "não spawna" não dava pra depurar de fora sem inspecionar o resultado de `pioneersWanted` de dentro do jogo rodando. |
| `refining.js` | Única porta pra "que reação de lab / commodity de factory" (ROADMAP 0051, mesmo papel do `remotes.js`/`raiding.js`/`pioneering.js` pro próprio domínio). Console `setLabReaction(roomName, mineral1, mineral2)` — valida via `REACTIONS[mineral1][mineral2]` (constante nativa do Screeps, nunca copiada pro código), acha 3 labs na sala tal que a de saída fique a alcance 2 das outras duas (requisito real do `runReaction`), grava `Memory.rooms[x].labReaction={a,b,product,output,input1,input2}` (ids fixos, resolvidos uma vez); `cancelLabReaction(roomName)` apaga. Console `boostCreep(creepName, compoundType)` — acha uma lab na sala do creep com o composto certo a alcance 1 e chama `lab.boostCreep(creep)`; sempre manual, mesma filosofia do `contestRoom` (0046). Console `setFactoryProduct(roomName, resourceType)` — valida `COMMODITIES[resourceType]` (idem, nunca hardcoded) existe **e** `.level===0` (nível 1-5 precisa de Power Creep/GPL, fora de escopo — recusa com o motivo), grava `Memory.rooms[x].factoryProduct`; `cancelFactoryProduct(roomName)` apaga. Nenhum ponto de entrada por tick — `structures/lab.js`/`factory.js` leem `Memory.rooms[x]` direto. |

### `src/roles/` (ordem de prioridade no `index.js`)

`bootstrap` → `defender` → `defenderStriker` → `defenderMedic` → `miner` →
`hauler` → `pioneer` → `upgrader` → `builder` → `reserver` → `remoteMiner` →
`remoteHauler` → `mineralMiner` → `scout` → `raider` → `squadDismantler`.
`mineralMiner` (ROADMAP 0051; 0114: só spawna com `mineralMiner.minAmount` ≥ 2000 restantes, corpo `W=clamp(5·amount/1400, 4, 12)` sem CARRY) tem `wanted()`/`spawn()` self-contidos, não
passa por `rooms/needs.js` (sem disputa de recurso com a economia de
energia). Contagens de todos os outros
vêm de `rooms/needs.js`; `scout`/`raider` são pulados no loop principal do
`spawning.js` e só entram no fim, se mais nada (nem o outro dos dois)
quiser nada — puro oportunismo. `squadDismantler` nunca aparece nesse loop
— `wanted()`/`spawn()` sempre devolvem 0/`false`, ele só nasce via
`raiding.spawnPendingSquad` (ROADMAP 0032 Fase 4).

- **bootstrap** — faz-tudo de emergência (`WORK CARRY MOVE`). `wanted` = 0 quando há miner + hauler (ou link network); 1 senão. Cobre o pré-container e a recuperação pós-ataque. Entrega: spawn/extension empatados no topo (o mais perto por range — ROADMAP 0043, antes era spawn incondicional primeiro e extension só empatava com link coletor/container no segundo nível) → link coletor/container → dropa no chão se não tiver pra onde.
- **defender** — kiter RANGED solo, generalista (tiro+cura no mesmo corpo). Fallback quando `room.energyCapacityAvailable` ainda não cobre `defenderStriker`+`defenderMedic` (`defender.pairEnergyThreshold`, default 500 — ROADMAP 0032 Fase 2); acima disso `rooms/needs.js` zera sua contagem e passa a querer o par. Atira + se cura todo tick; foge de melee a alcance ≤ 3; corpo ~1:1 MOVE, `MOVE` sempre por **último** no array (dano ataca por índice — proteger a fuga vale mais que proteger a arma pra um kiter; ROADMAP 0032 D1). Alvo/tiro/cura/fuga vêm de `utils/combat.js`, compartilhados com os dois roles abaixo.
- **defenderStriker** — metade `RANGED_ATTACK` da dupla (ROADMAP 0032 D2), corpo 1:1 `RANGED_ATTACK`:`MOVE` sem `HEAL` (`MOVE` por último). **Modo casa** (sem `memory.squadId`): pareia com um `defenderMedic` via `combat.ensurePartner` (`memory.partnerId` nos dois lados). Postura de tanque (D3): segura na rampart própria mais perto — nega melee de vez (rampart bloqueia movimento, não dano — só protege enquanto o hostil não consegue chegar a alcance 1) sem prever de antemão se a tile está "selada"; uma brecha aparece como "melee ainda no alcance" no mesmo tick e cai pro kite de sempre. Sem rampart por perto ou sem parceiro, kita igual ao `defender` solo (sem self-heal — não tem `HEAL`). Mop-up (O1): sem ameaça de melee, fecha em alcance 1 num alvo **ferido** dentro de `defender.mopUpRange` (10 tiles da spawn) pra terminar, em vez de só segurar `KITE_RANGE`. **Modo squad** (`memory.squadId` setado, ROADMAP 0032 Fase 4): pula a postura de casa inteira, posicionamento vem de `utils/squad.advance` — só atira no que estiver a alcance. Sem creep hostil (mas ainda com estrutura hostil na sala), ataca `FIND_HOSTILE_STRUCTURES` a `combat.KITE_RANGE` em vez de ficar parado (ROADMAP 0047, mesma exclusão de `STRUCTURE_POWER_BANK` que `raider`/`squadDismantler`) — junto com `squad.missionComplete()` (ver `utils/squad.js`), é isso que faz um squad `"combat"` de fato terminar a limpeza da sala e voltar pra casa.
- **defenderMedic** — metade `HEAL` da dupla, corpo 1:1 `HEAL`:`MOVE` sem armas (`MOVE` por último). **Modo casa:** segue o parceiro a alcance `KITE_RANGE-1`, cura via `combat.patch` (self primeiro, depois aliado ferido mais perto). Sem parceiro, ainda cura quem estiver por perto. **Não** usa `utils/combat.takeCover()` (esse dá um raio de segurança de `safeRange`, 5 tiles, de qualquer ameaça — brigaria com o próprio trabalho do medic de ficar perto o bastante pra curar em combate); só foge quando um melee está **adjacente** a ele mesmo (perigo real e imediato). **Modo squad:** posicionamento vem de `utils/squad.advance`, continua curando via `combat.patch` (já cura "o aliado ferido mais perto", normalmente um companheiro de squad).
- **miner** — estático sobre um container de source (re-seat por tick via `memory.seat`; empurra squatter não-miner do assento). **Container destruído/ainda não construído** (ROADMAP 0066, bug real — containers quebrados em combate deixavam o miner "errando" tile todo tick, escolhida pelo `moveTo`'s `ERR_NOT_IN_RANGE` fallback em vez de fixa): `plannedContainerPos()` acha a entrada `STRUCTURE_CONTAINER` do plano da sala (`utils/planStore`) a alcance 1 da source e o miner senta nela do mesmo jeito (`moveToSeat`, compartilhado com o ramo de container real, inclui o shove de squatter não-miner) — sem plano nenhum pra essa source, minera de onde o fallback puser. Só harvesta se tiver pra onde mandar (`hasDepositTarget`): container com espaço, ou (container cheio) link coletor/torre com espaço; sem nenhum dos dois, para de minerar naquele tick em vez de espalhar energia no chão pra decair à toa. **Corpo (ROADMAP 0114):** `BODY_LADDER` W15/M3/C4 → W5/M1/C1 escolhido por `bodyForBudget(energyCapacityAvailable)` (a curva segue a capacidade real da sala, não o RCL; sem miner vivo usa `energyAvailable`); sala instável ou < 5 extensions → corpo mini. CARRY só com link network ou RCL ≥ 3. **Dreno (ROADMAP 0117):** com a source zerada (`energy === 0`) o `distribute()` esvazia container e store no link/torre adjacente sem esperar batch nem backlog (só se há quem receba) → `distribute()`: enche a torre de source até a reserva **sempre** (prioridade incondicional — o hauler nunca ajuda nessa torre, ROADMAP 0026), senão link coletor, senão container, e só topa a torre **além** da reserva se houver excedente de verdade (spawn/ext cheios ou buffers locais cheios). Substituição cronometrada por spawn + viagem ciente de fadiga; `spawn()` decide por source.
- **hauler** — único role de transporte (absorveu o `harvester`). `CARRY×2 MOVE`, modos `load`/`deliver`. **Carrega** (ROADMAP 0043 reordenou, adicionou o piso de decaimento e o terminal; ROADMAP 0107 acrescentou o tier `bigDrop` no topo): uma pilha de energia dropada acima de `hauler.bigDropLoad` (500, `tier: "bigDrop"` no retorno de `pickLoad`) vence **tudo** incondicionalmente — terminal, `essentialConsumer`, qualquer `pressuredJob`, até um `mineralJob` já em andamento mas ainda não carregado — reaproveitando `reservations.available(creep, r) >= 50` pra não duplicar picker; só então **terminal** primeiro — mas só a fatia que o `terminalLedger` (`Memory.rooms[x].terminalLedger`, `{amount, withdrawable, sinceTick}`) credita como retirável (`utils/hauler.terminalWithdrawable`, recalculado 1×/tick/sala): o saldo que já está lá na **primeira vez** que o código observa o terminal vira baseline **e já liberado** pra retirada (sem histórico não dá pra saber a origem, e proteger pra sempre deixava um saldo pré-existente preso indefinidamente — bug real de produção, ROADMAP 0043 follow-up); a partir daí, um aumento só vira `withdrawable` se tiver uma transação de entrada registrada explicando (`Game.market.incomingTransactions` — cobre tanto `Terminal.send` de sala-irmã quanto ordem de mercado liquidada a favor da sala, filtradas por `to === room.name`, `resourceType === RESOURCE_ENERGY` e `time` mais novo que o do último check, pra nunca contar a mesma transação duas vezes); um aumento **sem** transação correspondente (depósito manual pela UI) fica de fora — o jogador já decidiu o que fazer com aquilo. Console `resetTerminalLedger(roomName)` reseta um ledger preso (ex.: salvo por um build anterior a essa correção) — o próximo tick trata o saldo atual como baseline nova, já liberado. Reduções (retirada do próprio hauler, `Terminal.send` de saída, venda no mercado) encolhem o piso credenciado no mesmo tanto, nunca deixando o ledger reivindicar mais do que existe fisicamente. `Game.market` ausente (bot sem terminal configurado, ou stub de teste) nunca lança — trata como zero transações. **Piso do terminal** (ROADMAP 0054, em cima do ledger, não no lugar dele): `terminalWithdrawable()` nunca devolve mais do que deixaria o terminal acima de `logistics.terminalReserveRatio` (10%) da própria capacidade — aplicado na leitura (`current − floor`, sem persistir em Memory), então o ledger continua controlando *o que é retirável em teoria* e esse piso controla só *quanto disso pode ser sacado agora*. Withdraw do terminal é **marcado (`dest:"storage"`)** pra ir direto pro storage na entrega, pulando toda a cascata normal — em seguida, **se um container de source estiver "empatado" (`containersBackedUp`, ROADMAP 0065 follow-up: 1000+ de energia num container junto de uma fonte, `hauler.containerBackedUpThreshold` — sintoma de vazão, o miner não descarrega no link coletor rápido o bastante)**, o hauler puxa do **link receptor** e marca `dest:"storage"` também — nunca pro spawn/extension mesmo com fome, porque alimentá-los em vez de esvaziar o link receptor deixaria o link coletor entupido e o mesmo container voltaria a encher; checado **antes** até do próximo ponto (`essentialConsumer`, logo abaixo) por decisão do usuário — desengasgar o cano da sala vale mais que um ciclo de entrega ao spawn; sem link com energia pra puxar, cai sem erro na cascata seguinte — depois, **se `essentialConsumer` for verdadeiro** (spawn/ext com espaço livre, ou uma torre crítica — mesma checagem usada na entrega), o hauler tenta primeiro o **link receptor** e depois o **storage** (ambos incondicionais, sem gate de reserva — ROADMAP 0065: pedido do usuário, energia caída podia desviar o hauler pra uma pilha longe enquanto o spawn ficava sem energia; sem esse gatilho urgente, nada muda — energia caída continua vencendo storage, ver abaixo) — só cai na cascata de sempre se nenhum dos dois tiver energia — depois: drop **decay-aware** acima de `hauler.minDropLoad` (100) **na chegada** (`estimatedDropAmount` — `amount − ⌈amount/hauler.dropDecayDivisor⌉ × alcance` até a pilha; alcance é proxy barato de ETA, não PathFinder por candidato — mesma troca que o `pioneer.js` já faz pra minerar local) → tombstone/ruína (mesmo piso, sem decaimento por tick) → link da base → **storage**: incondicional quando spawn/ext/uma torre **crítica** precisam (`essentialConsumer` — manter a sala apta a spawnar/defender vale mais que a reserva; sala jovem raramente chega nem perto de 1% de um storage de 1M, e travar isso nessa conta faria a sala morrer de fome por causa de um buffer que ninguém pediu pra proteger tanto — bug real do follow-up do 0043, corrigido; torre `sourceDefense` **não** conta como essencial — só o miner a alimenta, o `pickDeliver` nunca mira nela), ou, só acima da reserva (`utils/resourceTiers.aboveReserve`, 1% — ROADMAP 0054, substituiu o antigo `hauler.storageReserveFloor` de 5%), quando qualquer consumidor opcional precisa (`satisfactoryConsumer`, ROADMAP 0074 — uma torre não-crítica via `toppableTower`/`towerDeliverable` (`!isTowerCritical(s, room)` **e** `freeCapacity > hauler.toppingOffThreshold`, sem piso adicional) sempre primeiro, **depois** lab/factory/power spawn/container do controller via `optionalConsumer` — prontidão de defesa pesa mais que um errand de lab mesmo com a torre mais longe; não é comparação por proximidade, é prioridade fixa da torre, confirmado pelo usuário no mesmo dia depois de uma primeira versão por distância) — nunca storage→storage em nenhum dos casos. Não existe mais uma faixa intermediária pra torre: até o ROADMAP 0072 uma torre entre `tower.criticalRatio` e um antigo `satisfactoryRatio` (50–80%/70% conforme a versão) não contava pra nada — nem crítica, nem vale topar — ficando de fora sem nenhum caminho ativo de entrega além do último recurso da cascata; usuário pediu pra matar essa zona morta de vez (ROADMAP 0073) e depois pra garantir que a torre segue prioritária dentro do tier satisfatório (ROADMAP 0074) → container de source **mais próximo com mais de `MIN_CONTAINER_LOAD` (1000) de energia** (não o que tem mais energia guardada; container vem **depois** de storage, não antes). Pula pilha já reservada por outro picker de maior prioridade (`utils/reservations`). **Entrega** (ROADMAP 0107 filtrou cada lista de candidatos — torre tocável, `optionalConsumer`, fallback towers — por `reservations.availableDeliver(creep, s) > 0`, o par simétrico do lado de coleta, antes de escolher o mais próximo, pra dois haulers não mirarem a mesma extension/torre quase cheia): torre **crítica** (`< tower.criticalRatio`, 0.5 — ou `criticalRatioUnderAttack`, 0.8, sob `defenseActive`) → spawn/ext → **storage abaixo da reserva de 1%** (buffer de emergência vale mais que topar torre/lab) → qualquer torre **não-crítica** (ROADMAP 0073, sem piso extra) ainda com mais de `hauler.toppingOffThreshold` (5%) livre → **lab** com espaço → storage (geral, o que sobrar) → container do controller — **nunca** numa torre de defesa de source (`sourceDefense` no plano, `isSourceDefenseTower`), essa é só do miner (ROADMAP 0026); um load marcado `forcedDeliver:"storage"` (terminal) ignora essa cascata inteira e mira o storage direto enquanto ele existir e tiver espaço, só caindo de volta pra cascata normal se não tiver storage ou ele estiver cheio — a marca só some quando o tanque esvazia de novo (`job` volta pra `"load"`). `pioneer` continua vencendo o hauler em qualquer disputa por pilha (`utils/reservations`, rank 2 > 1, sempre — não mudou). Contagem: `1 + sources sem link coletor` com link network, `min(5, containers+1)` sem — piso sobe pra `hauler.minCountWithMineral` (2) quando há extractor+container de mineral ativos (`mineralAmount > 0`) e storage pra receber (ROADMAP 0055: o errand de mineral abaixo compete por ciclos com a vazão de energia; volta ao piso normal com o depósito esgotado). **Loot de tombstone/ruína** (ROADMAP 0106, reescrito no 0107 por pedido do usuário — "se pegar de um corpo, pega tudo e leva direto pro storage"): checado logo depois do tier `bigDrop`, sempre que o tanque está vazio, antes do resto da cascata de energia — `battlefieldLootJob()` acha uma tombstone/ruína com qualquer recurso acima de `hauler.minLootLoad` (50) e devolve `{kind: "battlefieldLoot", from, to: room.storage}` (nunca terminal; sem storage ou sem espaço, `null`); `assignLootJob()` reserva a sala inteira pro hauler via `nonEnergyLogistics.claim` (dono único, mesmo mecanismo do `mineralJob`) e grava `memory.lootJob = {fromId, toId}` (sem `resourceType` — ao contrário do `mineralJob`, essa viagem não é de um recurso só). `runLootJob()` roda até completar (mesma prioridade de um `mineralJob` em andamento, logo no topo do `run()`, só perdendo pro tier `bigDrop`): itera um `withdraw` por tick — pickup/withdraw/transfer só aceitam um `resourceType` por chamada — até a pilha esvaziar (energia inclusa, unificando o que antes eram duas corridas separadas), depois um `transfer` por tick até o próprio `store` esvaziar no storage; sem espaço no storage, segura a carga parado perto dele em vez de soltar. **Fallback de mineral/lab/factory/power** (ROADMAP 0051, menor prioridade possível — decisão do usuário, revisando um `mineralHauler` role dedicado que teria ficado ocioso quase sempre; `battlefieldLootJob` saiu dessa cascata no ROADMAP 0107, não segue mais o formato `{resourceType}` dela): só quando `pickLoad()` não acha nada de energia, não há loot de corpo pra pegar, **e** o tanque está vazio, tenta `pickMineralJob()` — esvazia o container do mineral pro storage/terminal, escoa a lab de saída de uma reação ativa, reabastece a lab de entrada mais vazia, escoa/reabastece o factory de uma produção ativa, alimenta o power spawn com Power — nessa ordem de prioridade. Uma vez aceito (`memory.mineralJob = {resourceType, fromId, toId}`), o hauler termina esse job (pickup → deliver) antes de voltar pra lógica de energia, nunca abandona um recurso pela metade no próprio `store`. `optionalConsumer()` (energia pro lab/factory/power spawn, não os recursos não-energia) ganhou `STRUCTURE_FACTORY`/`STRUCTURE_POWER_SPAWN` na mesma lista que já tinha `STRUCTURE_LAB`.
- **pioneer** — resgata uma sala própria sem spawn nenhum (recém-claimada, ou que perdeu o último num ataque — ROADMAP 0037, `rooms/pioneering.js` decide elegibilidade, mesmo papel de `remotes.js`/`raiding.js` pro próprio domínio). Corpo `WORK`:`CARRY`:`MOVE` 1:1:1 (`scaledBody`, mesma proporção do `builder`). Na sala-mãe, enche a `CARRY` antes de sair (`utils/energy.energyPiles`, compartilhado com o `builder` — constitution §5) — o ponto é chegar com o tanque cheio, não gotejar energia em várias viagens pela metade. Prioridade **máxima** em qualquer disputa por pilha — `utils/reservations.js`'s `pickerRank` dá ao pioneer o rank mais alto (2, acima até de hauler/bootstrap), e diferente deles, essa prioridade vale **sempre**, sala estável ou não (ROADMAP 0037 follow-up). Na sala-alvo, constrói **só** o construction site do spawn que o `architect.js` já planta sozinho assim que a sala vira `my` até ele ficar pronto; a partir daí, se sobrar qualquer outro canteiro (extension, container, estrada, ...), continua construindo — o mais perto por range, sem heurística de "mais perto de terminar" como o `builder` (ROADMAP 0043: uma sala com spawn e mais nada ainda não consegue spawnar seu próprio builder por um tempo, então esse WORK vale mais terminando a base do que virando bootstrap cedo). Esvaziou com o trabalho ainda por fazer: compara minerar uma source local (`FIND_SOURCES` com `energy>0` na própria sala-alvo, tempo de viagem em range + tempo de encher `store.getCapacity/(`WORK`×`HARVEST_POWER`)`) contra a viagem redonda pra sala-mãe (`remotes.roomDistance × claim.ticksPerRoomHop` × 2, mesmo orçamento que o `claimRoom` já usa pra distância) e commita na opção mais rápida (`memory.miningLocal`, sticky feito `memory.returning`, pra não ficar recalculando toda hora); nenhuma das duas dá margem suficiente e ele já tem WORK — ainda assim decide (nunca fica ocioso). Só quando **não sobra nenhum canteiro** — spawn e resto da base prontos — é que, em vez de se aposentar, **vira um `bootstrap`** ali mesmo (`creep.memory.role = "bootstrap"`, limpa `targetRoom`/`home`, delega pro `bootstrap.run(creep)` na hora — mesmo princípio da migração `harvester`→`hauler` que o `main.js` já faz, ROADMAP 0014, só que aqui dentro do próprio role porque depende de estado específico do pioneer que o `main.js` não tem por quê saber). Corpo do pioneer (escalado pela sala-mãe) tende a ser maior que o de um bootstrap normal (`[WORK,CARRY,MOVE]` fixo) — ganho de graça, não desperdício de um creep já carregado e já lá. Nunca despachado pra sala-alvo com hostil visto, nem enquanto a sala-mãe está sob ataque (mesma cautela de `reserver`/`raider` em `rooms/needs.js`). `mothersFor` inclui **toda** sala própria **com spawn** dentro de `pioneer.maxDistance` (default 30, `remotes.roomDistance`, hops de rota) — não só a mais próxima: cada uma manda sua própria dupla (`pioneer.maxConcurrent`, default 2, é um teto **por sala-mãe**, não compartilhado entre elas). Prioridade na fila de spawn fica logo depois de `hauler` — a sala-mãe nunca sacrifica a própria sobrevivência básica pra ajudar outra, mas ajuda vem antes das melhorias (upgrader/builder/scout).
- **upgrader** — máquina de estados. Vira builder quando o controller está no máximo e seguro. Em RCL8 (`rooms/needs.js`, ROADMAP 0103 follow-up), a demanda não é mais um zero incondicional: mantém exatamente 1 upgrader de "manutenção" sempre que `ticksToDowngrade` cai abaixo de `upgrader.rcl8UpkeepRatio` (50% de `CONTROLLER_DOWNGRADE[8]`) e converte esse único creep em builder assim que `ticksToDowngrade` sobe até um segundo limiar, mais alto e separado do primeiro: `upgrader.rcl8SafeRatio` (99%), checado direto em `isExcessUpgrader()` — não reusa o mesmo 50% que aciona a demanda, senão um upgrader ainda a caminho do controller seria convertido assim que o timer ticasse de volta acima de 50% (ex.: outro creep resetou o timer enquanto este ainda estava em trânsito), mesmo sem nunca ter feito seu próprio upgrade (bug real, mesma sessão). Já a margem larga do 50% em si existe porque um único upgrade já reseta o timer inteiro (não incrementalmente), então um limiar apertado (`< max`, a regra original) reconvertia o creep na tick seguinte ao seu primeiro upgrade e reproduzia o mesmo spawn→conversão a cada tempo de vida de creep, pra sempre (o bug real que motivou zerar tudo em 0103, jogando fora o piso de segurança contra downgrade de verdade). Excedentes (mais de 1 upgrader na sala) convertem mesmo dentro da faixa 50%-99%, já que um só upgrader sempre basta. Esses dois limiares (50%/99%) decidem quem é desejado/quando converter role — o próprio `upgradeController()` do upgrader nunca é gateado por eles: uma vez com energia na mão, o upgrader sempre gasta, porque `isExcessUpgrader()` já converte o creep pra builder assim que `ticksToDowngrade` cruza `rcl8SafeRatio`, então nunca sobra um upgrader tentando gastar além desse ponto (ver `roles/builder.js` no bullet abaixo pro caso do builder, que **reusa** `rcl8SafeRatio` pra decidir gasto por um motivo diferente — bugs reais reportados em produção, mesma sessão do ROADMAP 0103). Cede pilha de energia a hauler/bootstrap enquanto spawn/ext não estão cheios (`utils/reservations`) **quando outro creep de rank maior disputa a mesma pilha nesse tick** — isso sozinho não bastava (bug real relatado em produção, ROADMAP 0054 follow-up): storage/container é estoque da sala inteira pensado pra spawn/ext primeiro, e nenhum hauler precisa estar mirando aquele pote especificamente pro upgrader esvaziá-lo (ex.: um source container que acabou de encher de novo depois da sala secar). Por isso o saque de storage/container (não o link — esse já vem pré-aprovado pelas próprias tiers do `structures/link.js`) só acontece quando `reservations.economyStable(room)` (spawn/ext já cheios) **ou** `utils/resourceTiers.controllerCritical(room)` (controller genuinely perto do downgrade) — caso contrário cai nos fallbacks que não competem com o estoque da sala (minerar uma source por perto, ou esperar parado perto do link receptor). Caso real que motivou o fix: RCL8, `ticksToDowngrade` 194864 de um teto de 200000 (sem risco algum) e o upgrader ainda assim drenando tudo que aparecia. Contagem escala com energia no storage.
 - **builder** — build oportunista de canteiros + repair oportunista só de críticos em alcance 3. O repair principal usa um pool único ordenado por `utils/rampartRepair.priority` (tier → tipo → ratio) e filtrado por `builderMayRepair`: crítico não exige storage; rampart/wall saudável exige storage `> logistics.rampartHealthyStorageRatio` (10%); hardening ótimo exige storage `>= logistics.rampartHardeningStorageRatio` (70%); estruturas normais mantêm o comportamento anterior. O pool preserva o fallback de último recurso e a prioridade normal → rampart → wall dentro de cada tier. Sem nada pra construir/reparar, o fallback de `upgradeController` em RCL8 bloqueia quando `ticksToDowngrade` atinge `upgrader.rcl8SafeRatio` (99%) — a mesma marca que `isExcessUpgrader()` trata como "seguro pra converter" (ROADMAP 0103, quinto follow-up, bugs reais reportados em produção, 2026-09-24). Passou por duas versões erradas antes dessa: reusar o limiar de demanda mais baixo (`rcl8UpkeepRatio`, 50%) pro gasto deixava um builder com energia carregada em "zzz" em toda a faixa 50%-99%, mesmo com o controller genuinamente com espaço pra receber; corrigir pra um teto **literal** (`ticksToDowngrade >= CONTROLLER_DOWNGRADE[8]`) soava certo mas na prática nunca disparava, porque o timer fica pinado exatamente no teto assim que qualquer creep completa um upgrade — "teto literal" virou "nunca parar de gastar" ali, deixando o builder pendurado num controller já seguro em vez de procurar obra/reparo de verdade. `rcl8SafeRatio` é o ponto de equilíbrio: abaixo dele ainda há espaço real pra progresso, nele ou acima o controller não está genuinamente em risco. Os limiares de criticidade continuam gateando só **aquisição** de energia em outros pontos (`abandonUnsafeLinkLoad`, `reservations.economyStable`) — esse fallback é a única exceção deliberada, porque "seguro pra parar de gastar" e "seguro pra converter role" acabam sendo a mesma pergunta.
- **reserver** — role único com três missões (`memory.mission`, ROADMAP 0020 + 0046). `"reserve"` (uma por remote pendente em `Memory.rooms[mãe].remotes`, corpo `CLAIM×N` escalado) mantém o controller remoto reservado (`reserveController`); `"claim"` (**1 só no império**, como o `scout`, corpo fixo `[CLAIM, MOVE]`) domina a sala de vez (`claimController`), disparada por `Memory.claimTarget`. **`"contest"`** (ROADMAP 0046, corpo `CLAIM×N` escalado como `"reserve"` — mais `CLAIM` = cerco mais rápido) — enquanto o controller ainda tem dono ou reserva de outro jogador, martela `attackController()` todo tick; assim que fica neutro, muda pra `claimController()` igual à missão `"claim"`. Diferente do `"claim"`, morrer no meio do cerco **não** é beco sem saída — é o resultado esperado de um `attackController()` de longo prazo (corpo com `CLAIM` só vive 600 ticks) — `rooms/needs.js` só respawna enquanto `Memory.contestTarget` existir, sem checagem de abandono por morte. Viaja com `routing.moveToRoom` (`blockHostiles: true` — nunca atravessa sala com hostil visto, prioriza sala highway — ROADMAP 0028). Marca `Memory.claimTarget.creepSeen=true` a cada tick vivo (só a missão `"claim"`) — se o creep sumir sem nunca ter limpado `Memory.claimTarget` sozinho (sucesso ou beco sem saída), `rooms/needs.js` percebe que morreu em trânsito e desiste em vez de spawnar outro pra sempre (ROADMAP 0035).
- **remoteMiner** — como o `miner`, mas numa sala remota (`memory.home`/`memory.targetRoom`); só conta em `remotes.active()`. Constrói/repara o próprio container (sem rodar `architect` — a sala não é minha); hostil na sala remota → recua pra casa. Viaja via `utils/routing.moveToRoom()` com `remotes.allowRoom` (ROADMAP 0075 — antes um `creep.moveTo` cru + `remotes.roomCallback`, sem pré-cálculo de rota nem retreat/backtrack; mesma restrição de sempre, só sala minha/reservada + alvo).
- **remoteHauler** — como o `hauler`, mas rota fixa remote↔mãe; carrega de container/drop na sala remota, entrega em storage/spawn/ext da mãe; recua vazio se a sala remota ficar hostil. Mesma migração pro `utils/routing.moveToRoom()`/`remotes.allowRoom` do `remoteMiner` (ROADMAP 0075).
- **mineralMiner** (ROADMAP 0051) — senta no container do mineral (já plantado pelo `architect.js`), minera (`WORK`-heavy, sem `CARRY` — overflow cai automaticamente no container por baixo, mesmo mecanismo nativo que o `miner` já usa pra energy) enquanto `mineral.mineralAmount > 0` e o container tem espaço. `wanted()`/`spawn()` self-contidos (não passa por `rooms/needs.js`).
- **scout** — **1 por império** (extras se suicidam). Duas tarefas com destino fixo, prioridade nessa ordem, ambas via `routing.moveToRoom` (prioriza sala highway, penaliza — sem bloquear — sala com hostil visto, ROADMAP 0028): assina o controller de uma sala em `Memory.signQueue` (console `signRoom(room, text, fromRoomName?)`); quando há `fromRoomName`, somente essa sala pode criar o scout da missão, que retorna primeiro a ela antes de seguir ao destino; prévia de layout de uma sala em `Memory.layoutRequests` que nenhum observer cubra (console `planLayout(room)`/`cancelLayout(room)`/`layoutQueue()` — pula sala já coberta por `utils/observer.observerFor`; fica parado na sala alimentando `architect.planCity(room, {preview:true})` via `main.js` até `Memory.rooms[room].planned`, com stall guard `routing.layoutWaitLimit` — desiste e loga em vez de acampar pra sempre). Nenhuma das duas tarefas lia o retorno de `moveToRoom` durante a viagem até chegar (ROADMAP 0060, terceira correção no mesmo dia) — sem isso, um destino que vira blacklistado (`moveToRoom` agora recusa de cara, ver `routing.js`) travava a tarefa em silêncio pelo resto do TTL do blacklist; `signTravelSince`/`signTravelTarget` e `layoutTravelSince`/`layoutTravelTarget` — contador de ticks separado do `layoutWaitSince` acima (esse só começa depois de já ter chegado) — desistem e limpam `Memory.signQueue`/`Memory.layoutRequests` após `routing.travelStallLimit` ticks ainda viajando sem chegar, logando o motivo. `signRoom` usa o fluxo padrão de `moveToRoom()` (ROADMAP 0086), preservando o hop de `_realRoute` e a recuperação de `ERR_NO_PATH`; o ramo `nativeRoute` não é selecionado. Console `scoutTrace()` imprime o snapshot do único scout; `scoutTrace(true|false)` liga/desliga logs de `routing.moveToRoom()` em `Memory.settings.debug.scoutTrace` para diagnóstico de rota (ROADMAP 0085). Sem nenhuma das duas tarefas: se existe algum observer (`utils/observer.hasAnyObserver()`), se aposenta (`suicide`) em vez de vagar — a exploração é dele agora (ROADMAP 0029); senão, round-robin de salas adjacentes não vistas (exploração — não usa `routing`, sem destino fixo pra rotear). Resto do M1 → ROADMAP 0009.
- **raider** — despachado em `Memory.raidTarget` (console `raidRoom`/`raidRemote`, `rooms/raiding.js` — ROADMAP 0032 Fase 3, O2/O4, e 0036, O3). Corpo `RANGED_ATTACK`+`MOVE` puro (sem `HEAL` — raid é pra ser rápido e barato, não sustentado). Viaja via `routing.moveToRoom`; luta hostil armado se houver (`combat.threats`/`shoot`, recua só de melee realmente adjacente). `memory.mission` (default `"raid"`, do `Memory.raidTarget.mission`): **`"raid"`** — sem hostil armado, ataca a primeira `FIND_HOSTILE_STRUCTURES` (o invader core, tipicamente) a `KITE_RANGE` via `rangedAttack` — funciona em estrutura tanto quanto em creep, não precisa de `ATTACK`/alcance 1; sem mais nada, limpa `Memory.raidTarget` e se aposenta (`suicide`) — sucesso, não erro. **`"harass"`** (O3) — sem hostil armado, ataca `FIND_HOSTILE_CREEPS` sem filtrar por armamento (reserver/miner são desarmados de propósito, nunca aparecem em `combat.threats`), **nunca** toca `FIND_HOSTILE_STRUCTURES` (a missão é negar economia, não invadir); sem nenhum hostil (armado ou não) agora, se aposenta sem revisitar — baixo compromisso de propósito, não fica acampado numa remote esperando um respawn. Role separado de `defenderStriker`/`defenderMedic` de propósito (mais simples — sem parceiro, sem tanque, sem mop-up), só reaproveita os primitivos de `utils/combat.js`.
- **squadDismantler** — metade `WORK` de um squad de cerco (`mission:"siege"`, ROADMAP 0032 Fase 4), corpo 1:1 `WORK`:`MOVE`. Sempre modo squad — sem `memory.squadId`/`memory.pendingSquad` ele se aposenta (`suicide`) na hora, nunca vaga sozinho. Posicionamento inteiro vem de `utils/squad.advance`; a única lógica própria é `dismantle` na primeira `FIND_HOSTILE_STRUCTURES` adjacente (fila/rampart inimiga tipicamente). Não ataca creep — isso é trabalho do `defenderMedic`+outro membro do squad ou, na composição `"combat"`, de dois `defenderStriker`.

### `src/structures/`

#### Defensive repair storage gates (ROADMAP 0101)

#### Link economy gate and upgrader conversion (ROADMAP 0102)

`builder` e `upgrader` só retiram energia de links não-coletores quando
`reservations.economyStable(room)` é verdadeiro; links coletores e os demais
fallbacks permanecem inalterados. Quando um upgrader é convertido em builder,
`memory.convertedFrom = "upgrader"` identifica a origem e `rooms/needs.js`
desconta esse builder da demanda final de upgraders, depois de autoscale e do
clamp de RCL8.

`utils/rampartRepair.js` mantém a prioridade `critical → satisfactory →
optimal` e o desempate `normal → rampart → wall`. Para ramparts/walls, o
builder e a tower agora compartilham gates específicos: a faixa satisfatória
exige storage `> logistics.rampartHealthyStorageRatio` (10%) e hardening exige
storage `>= logistics.rampartHardeningStorageRatio` (70%). A faixa crítica
continua sem gate de storage. `logistics.storageSatisfactoryRatio` permanece
em 50% para a política geral de economia/link e não é alterado por esse
reparo. A torre ainda exige sua própria energia mínima por tier.

 - **tower** — prioridade de alvo, combate, cura e repair de estruturas planejadas. `findRepairTarget` usa o pool único de `utils/rampartRepair.priority`, com crítico → saudável → ótimo e normal → rampart → wall dentro do tier. `towerMayRepair` exige energia própria de 50% para crítico e 70% para saudável/ótimo; para rampart/wall, exige também storage `>10%` no saudável e `>=70%` no hardening. Estruturas normais não recebem esses gates de storage. O threshold geral `logistics.storageSatisfactoryRatio` de 50% continua separado e inalterado.
- **link** — o link coletor decide entre o link do controller e o do storage por proximidade + urgência, não mais "quem tem mais capacidade livre" (ROADMAP 0054, "Link tiers"). Classifica cada link não-coletor em runtime (`findInRange`/`inRangeTo(controller, 3)` = link do controller; o outro = link do storage — mesmo padrão geométrico de `utils/energy.receivingLink()`); com só um dos dois construído (RCL baixo) ou mais de dois links não-coletores, cai no fallback antigo (mais capacidade livre). Com os dois presentes, em ordem: (1) `utils/resourceTiers.controllerCritical(room)` (`ticksToDowngrade` abaixo de `logistics.controllerCriticalDowngradeRatio`, 10%, de `CONTROLLER_DOWNGRADE[rcl]` — mesma função reaproveitada por `roles/upgrader.js`, ROADMAP 0054 follow-up) → sempre pro link do controller, mesmo com o do storage vazio; (2) fill do storage abaixo de `logistics.reserveRatio` (1%, via `utils/resourceTiers.aboveReserve`) → link do storage (emergência simétrica); (3) storage `>= logistics.storageSatisfactoryRatio` (50%) **e** `rcl < 8` → link do controller (controller ainda tem RCL de verdade pra ganhar, não faz sentido inchar um storage já confortável); (4) default → link do storage.
- **rampart** — abre (`setPublic`) para um creep aliado a ≤ 1 tile, fecha quando ele sai; não abre se um inimigo está a ≤ 2 tiles.
- **observer** — 1 `observeRoom()` por tick (`utils/observer.js` pro alcance). Prioridade: (1) uma entrada de `Memory.layoutRequests` dentro do alcance e ainda não `planned` (e limpa/loga qualquer uma já `planned` que encontrar — é o único lugar que desenfileira pro caso de uma sala vista por observer, não por scout); (2) uma entrada de `Memory.observeRequests` dentro do alcance e ainda não expirada (console `observe(roomName, ticks=10)` — ROADMAP 0030; expira (`Game.time >= prazo`) **antes** de checar alcance, então uma sala fora do alcance de todo observer ainda assim se limpa sozinha, nunca fica presa na Memory); (3) sem nada pendente, `explorePriority` — mesma ideia do round-robin antigo do scout (toda sala alcançável, não só saídas adjacentes), mas por score em vez de puro "menos visto": `staleness * (1 + enemies * config.get("observer.militaryWeight", 1))`, `staleness = Game.time - lastVisit`, `enemies = Memory.rooms[x].enemies || 0` — sala com mais hostil visto é revisitada mais, mas o score de qualquer sala cresce sem limite com o tempo, então nada fica sem visita pra sempre (`militaryWeight=0` volta ao critério antigo). Sala nunca vista ainda vence tudo de cara (nem entra no score). `roomNameToXY`/`xyToRoomName` convertem nome de sala em coordenada de mundo com sinal, pra varrer o quadrado de alcance por aritmética em vez de chamar `getRoomLinearDistance` por sala candidata. ROADMAP 0029/0030/0031.
- **lab** (ROADMAP 0051) — só a lab de saída (`Memory.rooms[x].labReaction.output`, decidido por `rooms/refining.js`'s `setLabReaction()`) age: chama `runReaction(input1, input2)` quando as duas labs de entrada existem e `cooldown===0`. As labs de entrada em si são no-op (`run()` confere o id e sai) — a reação roda exatamente 1x por sala por tick, mesmo padrão do `tower`/`link`.
- **factory** (ROADMAP 0051) — com `Memory.rooms[x].factoryProduct` setado (`setFactoryProduct()`), `cooldown===0`, e todo componente da receita (`COMMODITIES[product].components` — constante nativa do Screeps, nunca hardcoded) já estocado, chama `produce(product)`. Estocar/escoar é `roles/hauler.js`'s `pickMineralJob()` (não-energia) + `optionalConsumer()` (energia).
- **powerSpawn** (ROADMAP 0051) — com `store[RESOURCE_POWER] >= 1`, chama `processPower()` incondicionalmente (sem checar energia própria — o motor recusa sozinho, fail-soft, se faltar); `powerSpawn.enabled` (`config.js`) desliga se preciso. Conseguir Power em primeiro lugar (invasão de power bank, ou mercado) é fora de escopo — ver ROADMAP "Later".

### Scout trace

`scoutTrace(true)` também ativa um registro heap-only de intenções de
movimento. `utils/traffic.flushScoutTrace()` roda depois de todos os roles e
reporta os creeps que disputaram a próxima tile do scout naquele tick; é apenas
diagnóstico e não altera os intents (ROADMAP 0087).

`utils/routing.moveToRoom()` também reaproveita `utils/excuseMe.ask()` quando
a próxima tile cacheada de uma viagem multi-sala está ocupada por creep próprio.
As proteções existentes de cadeia, saída válida e miner inamovível permanecem
as mesmas (ROADMAP 0088).

Depois de `moveTo() === OK`, `utils/routing.moveToRoom()` emite explicitamente
o primeiro `move(direction)` de `_move.path`, com ou sem bloqueador (ROADMAP
0089). Isso preserva a busca/cache nativos, mas evita uma rota multi-sala ficar
inerte até outro creep mover o viajante por `excuseMe`.

O passo direto de 0089 só é usado na recuperação após `routing.noProgressTicks`
ou quando `excuseMe` efetivamente abriu a próxima tile; no percurso normal,
`moveTo()` mantém o controle da rota para não forçar direções internas do cache
a cada tick (ROADMAP 0090).

### Investigação aberta: `nativeMoveTo()` sem deslocamento

Há uma reprodução em produção documentada em
`specs/features/0090-stall-only-cached-step/notes.md`: depois de o scout sair
de `spawning`, `nativeMoveTo()` retorna `OK` com `fatigue === 0`, sem contender
observado e sem deslocamento por dois ticks; um `move(direction)` direto é
aceito e o creep anda no tick seguinte. O trace opt-in (`scoutTrace(true)`) é
diagnóstico, não prova que `_move.path` seja a intenção efetivamente aplicada
pelo motor. A causa raiz permanece aberta; a próxima investigação deve
comparar `reusePath:30` com `reusePath:0` no mesmo alvo antes de alterar o
algoritmo de movimento novamente.

## Persistence

| Onde | O quê |
|------|-------|
| `Memory.rooms[name]` | contadores de intel, `exits`, `defenseActive`, `planStep`/`planned` (o plano em si — `buildings`/`mincutBoundries` — mora em `RawMemory.segments`, ROADMAP 0007, **done**), `remotes` (lista de nomes de sala — ROADMAP 0020, `rooms/remotes.js`), `wantedOverride` (`{role: count}` — override manual da contagem-alvo de um role nessa sala, console `setWanted`/`clearWanted`/`listWanted`, ROADMAP 0038), `autoscale` (`{delta: {role: n}, lastAdjustTick}` — ajuste incremental automático por role e cooldown da sala, `utils/autoscale.js`, ROADMAP 0040), `terminalLedger` (`{amount, withdrawable, sinceTick}` — quanto do terminal o `hauler` pode retirar; cresce só com a fatia de um aumento que uma transação de entrada registrada (`Game.market.incomingTransactions`) explica, encolhe com qualquer redução, `roles/hauler.js`, ROADMAP 0043 follow-up), `scoutBlacklistUntil` (`Game.time` até quando a exploração livre do scout pula essa sala — só escrito/lido por `roles/scout.js` após um `ERR_NO_PATH`, ROADMAP 0009) |
| `Memory.creeps[name]` | `role`, `_m` (cache de rota), pilha de estados, alvos de role (por id), `loadTarget` (pilha de energia reservada — `utils/reservations`), `mission`/`targetRoom`/`home` (`reserver`/`remoteMiner`/`remoteHauler`, ROADMAP 0020) |
| `Memory.structures[id]` | flag `isCollector` do link |
| `Memory.settings` | flag `profiler`, `allies` (override da lista de aliança), `hostilePlayers` (override da whitelist fora de sala própria), `targetEnemies` (lista opt-in de alvo ofensivo, vazia por padrão — ROADMAP 0032 Fase 3), `buildPriority` (ids de construction site, console `prioritizeBuild`/`clearBuildPriority`, `roles/builder.js`), e qualquer path lido por `utils/config.get` (`defender.maxCount`/`pairEnergyThreshold`/`mopUpRange`, `hauler.*`, `miner.*`, `tower.*` (inclui `rampartCriticalRatio`/`rampartSatisfactoryRatio` e `repairEnergyRatio`/`satisfactoryRepairEnergyRatio`, lidos só por `utils/rampartRepair.js` — ROADMAP 0072, e `criticalRatio`/`criticalRatioUnderAttack`, lidos só por `roles/hauler.js` — ROADMAP 0054, sem par `satisfactoryRatio` desde o ROADMAP 0073), `repair.*` (`normalCriticalRatio`/`normalSatisfactoryRatio`, ROADMAP 0072 — `utils/rampartRepair.js`, tiers de qualquer estrutura que não seja rampart/wall), `logistics.*` (`reserveRatio`/`terminalReserveRatio`/`controllerCriticalDowngradeRatio`/`storageSatisfactoryRatio`, ROADMAP 0054 — `utils/resourceTiers.js`, `roles/hauler.js`, `structures/link.js`, `roles/upgrader.js`), `combat.safeRange`/`safeModeSpawnHpRatio`, `planner.*`, `traffic.*`, `remotes.*`, `routing.*`, `claim.*`, `observer.*`, `raiding.maxTargetRcl`/`autoRaid`, `squad.retreatHpRatio`/
`stuckTicksLimit`/`avoidTicks`, `pioneer.maxDistance`/`maxConcurrent`/`autoscaleMaxCount`, `upgrader.autoscaleMaxCount`, `hauler.autoscaleMaxCount`, `builder.autoscaleMaxCount`/`autoscaleEnergyHigh`/`autoscaleEnergyLow`, `autoscale.cooldown`, `excuseMe.maxChain` — ROADMAP 0012, 0028, 0032, 0036, 0037, 0040, 0041, 0044) |
| `Memory.layoutRequests` | `{ roomName: true }` — pedidos de prévia de layout pendentes/em andamento (console `planLayout`/`cancelLayout`/`layoutQueue`, ROADMAP 0028); o scout ou o observer (o que cobrir a sala) consome, `main.js` roda `planCity(room, {preview:true})` enquanto durar |
| `Memory.observeRequests` | `{ roomName: prazo }` — prazo é um `Game.time` absoluto (não contador regressivo); console `observe(roomName, ticks=10)`, consumido só pelo observer (`structures/observer.js`), sem fallback de scout. ROADMAP 0030 |
| `Memory.planSegments` | `{roomName: segmentId}` — **fora** de `Memory.settings` de propósito: um `Memory.settings = {...}` no console (padrão sugerido pelo próprio comentário do `main.js`) não pode mais apagar o mapeamento. `utils/planStore` |
| `Memory.signQueue` | `{ roomName: text }` para pedidos legados, ou `{ roomName: {text, from} }` quando `signRoom(roomName, text, fromRoomName?)` define uma origem; o scout retorna à origem antes de viajar ao destino |
| `Memory.claimTarget` | `{room, from, creepSeen?}` — missão de `claimController` pendente (console `claimRoom`), no máximo 1 por vez. `creepSeen` marca que um claimer já rodou pelo menos 1 tick — usado pra detectar morte em trânsito e desistir em vez de respawnar pra sempre. ROADMAP 0020/0035 |
| `Memory.raidTarget` | `{room, from}` — missão de `raider` pendente (console `raidRoom`, ou o scan automático opcional de `raiding.autoRaid`), no máximo 1 por vez. Um raider que morre em trânsito não trava nada — sem mecanismo de `creepSeen` como o claim (ROADMAP 0035); o próximo `raidRoom()`/scan simplesmente decide de novo. ROADMAP 0032 Fase 3 |
| `Memory.pendingSquad` | `{mission, room, from, need: [role...], spawned: [creepId...]}` — squad em formação (console `raidSquad`), `need` é a receita fixa da missão (`SQUAD_RECIPES`), `spawned` cresce a cada membro que nasce via `raiding.spawnPendingSquad`; `squad.registerPending` promove pra `Memory.squads` assim que `spawned.length === need.length` e apaga esta entrada. No máximo 1 pendente por vez. ROADMAP 0032 Fase 4 |
| `Memory.squads[id]` | `{mission, room, from, target: {room, id?}, state, leader, members, shape, dir, dirTick, avoid, stuckTicks}` — squad formado, dono de `utils/squad.js`; nenhum role lê isso diretamente além de `advance`/`registerPending`/`disband`. `room` é a sala-alvo original, fixa (não confundir com `target.room`, que muda pra sala-mãe durante o recuo). ROADMAP 0032 Fase 4 |
| `RawMemory.segments[id]` | plano da cidade de uma sala, **marcado com o nome da sala** (`{room, buildings, mincutBoundries}`, JSON) — `getPlan` recusa um segment cuja tag não bate com a sala pedida, então uma colisão de id nunca devolve o plano errado. `utils/planStore` |
| heap | terrain matrices, cost matrices por sala, census, roomCache, plano da cidade cacheado (`planStore`) |

## Offline test

**Pesquisa de labs (ROADMAP 0128).** O harness docs/lab-production-simulation.cjs --search mantém beam64/100k, busca exata pequena/200k e replay. Receitas, resultados e tabelas estão em docs/lab-search/, docs/lab-search-results.json e docs/lab-search-report.md. Runner e resultados completos ficam fora do bundle; o motor físico puro foi extraído para utils/labPlanModel.js e agora também avalia candidatos no jogo. test/labResearchCases.js preserva a reprodução das referências.

**Política de labs (ROADMAP 0127, ARK-98).** utils/labPolicyData.js publica 596 planos e índices dos 1.950 cenários, gerados por docs/lab-search/generate-policy.cjs. utils/labPolicy.js cacheia catálogo/geometria e generators de avaliação limitada no heap. utils/labPolicyRuntime.js executa targets individuais com papéis locais, buffers, logística observada e confirmação de intents pelo cooldown no tick seguinte. craftChain mantém item lab compacto e migra sufixos legados após a onda iniciada; craftPlanner avança políticas a cada tick e usa estimativa avaliada ou referência conservadora identificada. labReactions centraliza snapshot/reservas, quota e limites de entrega; structures/lab delega; hauler drena conflitos e limita buffers/cargas. Memory guarda IDs/saldos/cursores/observações, nunca catálogo ou objetos de jogo. craftStatus expõe escolha, espera, avaliação e logística. Modos wide/waves e reações manuais são preservados; pipelines exigem logística medida ou override. Documentação: docs/lab-policy.md; testes: test/labPolicyCases.js.

### Hauler: drops sob containers (ROADMAP 0126)

`roles/hauler.js` exclui energia caída na posição de qualquer container nas
duas faixas de pickup. O limite da primeira faixa continua estrito: estimativa
maior que `hauler.bigDropLoad` (500 por padrão). Um Set de posições é montado
lazy por sala/tick em `derived`, a partir de `roomCache.structuresByType`.
O fast gate de grandes drops ignora essas pilhas, preservando picks cacheados
de links; pickups cacheados são revalidados contra o índice. Sem nova coleta
de estruturas, sem `lookForAt` e sem Memory. A ordem restante é preservada.

## Estoque de uso e mercado oportunista (0124 / ARK-32)

Compras de reposição (`policy: swing`) compartilham o recurso com operações de consumo; as entradas pendentes reduzem o déficit e a capacidade reservada. Outras saídas do mesmo recurso mantêm exclusividade. O executor serializa intents físicos por terminal/tick, desconta energia carregada por outras operações e associa recebimentos pelo pedido/tick ou descrição da transferência. Deals podem ser confirmados pela transação exata quando o consumo concorrente mascara o delta físico.

O guard `market` roda antes dos consumidores de mercado. `market.historyReady()` exige histórico hidratado e snapshot disponível; swing bloqueia referências parciais com `history-loading` e inicia a cadência apenas após prontidão. A conclusão da hidratação força o recálculo do resumo temporal no mesmo tick.

`global.swingReference(resourceType, kind = "buy")` expõe a referência atual, contagens totais/válidas, mínimo e idade sem aguardar o scan. Bloqueios de referência em `swingStatus()` carregam esses diagnósticos; a contagem total de `marketPrice()` pode incluir preços ausentes.

`utils/resourcePolicy` centraliza alvos por sala, destinos, déficit, capacidade útil do terminal e reservas por quantidade. Energia de consumo (100k no storage) e combustível do terminal (30k padrão) são separados; materiais não usados ficam no terminal, com 15% de folga e overflow temporário no storage. Haulers e receipts usam a mesma política, inclusive para loot e produtos de processamento.

`utils/marketAccounting` calcula créditos livres após piso global de 100k e compromissos de flip/craft, compras pendentes e ordens legadas. Custos aceitos no tick ficam em heap até o estado de créditos refletir os intents. `craftPlanner` desconta reservas compartilhadas; cancelamentos de craft retêm insumos, intermediários e produtos durante a janela stranded.

`utils/swingTrade` consulta o orderBook compartilhado e referências históricas de marketPricing (30 amostras durante validação; alvo final 48, idade máxima 7200 ticks). Balanceamento interno precede compra; custo efetivo considera frete e ganho líquido de energia. Compra abaixo de 99% sellPrice e venda acima de 101% buyPrice; recursos de uso não são liquidados. Começa com `swing.test=true`; `swingStatus(roomName?)` lê candidatos e bloqueios persistidos, sem enfileirar negócios no modo simulado.

`terminalOps` mantém a API anterior e aceita options com `effectiveLimit` e `policy:"swing"`. Antes de deal/listagem, revalida preço, frete, crédito, reservas e capacidade; confirms e receipts mantêm contabilidade parcial. Ordens swing cobram 5% na criação, preservam preço e expiram em 1209600 ticks. `Memory.swing.noRelist` retém saldo por sala/recurso após expiração; vendas imediatas continuam permitidas. Ordens existentes sem operação gerenciada também reservam saldo. A chamada em main passa por `guard` e shedding.

Ordens cujo preço bruto já viola a margem são rejeitadas antes do cálculo
de quantidade e frete, tanto na compra quanto na venda. Candidatos restantes
mantêm a avaliação pelo preço efetivo e ganho líquido de energia.

Na cotação de compra, o déficit é consultado uma vez por seleção. Recursos
diferentes de energia usam diretamente o déficit inteiro como teto; só o
frete da quantidade final é calculado por ordem. Energia mantém busca
binária pelo ganho líquido. Nenhum déficit é reutilizado entre cotações.

Fretes idênticos por destino/quantidade usam um Map local à cotação, com
origem fixa. A busca de ganho líquido de energia continua exata. Outra
cotação, inclusive no mesmo tick, começa sem esse cache.

`marketHistoryFlush()` persiste as temporalSnapshots já hidratadas em `utils/market`, permitindo migração imediata sem esperar a próxima coleta. Não consulta o orderBook nem altera o período de amostragem; bloqueia gravação antes da mesclagem do histórico persistido.

O coletor de market possui gate próprio `market.minBucket=500`, independente do shedding geral. `main` sempre chama scan via guard; abaixo do piso ele retorna sem coleta. Amostras históricas vencidas bypassam a cadência atual do book ao recuperar o bucket. O histórico persiste `scheduledTick` opcional junto ao tick real; essa âncora mantém os próximos vencimentos no horário original inclusive após reset. Múltiplos slots perdidos são coalescidos em uma observação real, sem preenchimento artificial.

### Reserva dinâmica de energia do terminal (0124 / ARK-32)

`utils/terminalFuel` centraliza a energia protegida: carga de saída e frete já carregado, mais o frete ainda não coberto das próximas duas transações executáveis e margem de 20%. Quotes publicados por `terminalOps` e observações elegíveis de `swingTrade` expiram em 300 ticks; listings e operações em settlement não projetam um novo frete. Intents aceitos continuam protegidos até o engine aplicá-los. Transferências usam o custo recalculado. Reposição de energia tem prioridade no forecast e no executor.

Sem operações elegíveis, a reserva preventiva é zero. Quando o storage tem menos de 10% do alvo de energia, a margem fica em zero e vendas automáticas com frete superior a 10% do estoque livre de compromissos aguardam. Compromissos existentes continuam protegidos. `resourcePolicy`, abastecimento e retirada de haulers, receipts e executor compartilham a política; o executor exige o frete exato, sem somar novamente a reserva inteira. Haulers em trânsito são descontados da necessidade, e jobs são revalidados antes da coleta/descarga. O excesso só retorna ao storage quando supera 25% da reserva, evitando pequenas viagens inversas.

Configuração em `Memory.settings.terminalFuel`; `enabled:false` preserva o piso legado de `logistics.terminalReserveRatio`. Diagnóstico: `terminalFuelStatus(roomName?)`. O mercado continua em simulação por padrão no código; nenhuma configuração de execução existente em Memory é sobrescrita.

### Claim: trânsito SK (0131)

ARK-115: routing usa restrictionKey (bans) e checa segurança das salas reais da rota/path, evitando invalidar todos os viajantes por intel distante do observer. Buscas completas têm teto default20000 ops e limite adaptado ao tick; no máximo uma por tick. Tentativas falhas têm backoff50, cache no heap por ID/nome estável e retenção1500 ticks. Reconstrução reaproveita validação do mesmo tick. Rotas validadas continuam com bucket baixo; espera sem orçamento retorna ERR_BUSY. claimStatus inclui routePlan compacto com motivo, tick, CPU, maxOps e próxima tentativa. A estimativa ops/CPU é configurável; não é garantia de tempo de execução de PathFinder nem medição de ganho real.

utils/nativePath centraliza a leitura do próximo passo de _move.path: primeiro x/y do primeiro passo, depois direções. Resolve o passo pela posição atual, sem cache adicional, e rejeita paths de outra sala/posição. routing, move, traffic e keeperTransit compartilham o leitor para evitar comandos que confundem coordenadas com direções (ARK-113).

Invader Core isolado não exclui sala do trânsito; routingStructureMatrix bloqueia somente seu tile. O filtro de creeps hostis e proprietário continua ativo (ARK-112).

utils/keeperTransit mantém geometria de lairs/recursos e máscaras no heap, classifica keepers versus outros hostis e solicita visão pela fila existente de observer. rooms/intel atualiza o cache com roomCache/getHostiles. Apenas claim ativa a opção em roles/reserver; utils/routing aplica a máscara em planejamento, execução, fallback e recuo, preservando bans. Versão escalar revalida rota após nova informação/expiração; movimento do keeper não dispara busca completa. Próximo passo perigoso é invalidado e escape aparece como evading_keeper em claimStatus. Configuração em Memory.settings.claim; sem novo gate de spawn.
### Fallback de viagem limitado ao próximo hop (0064 / ARK-116)

Sem rota validada, fluxo padrão de `routing.moveToRoom` usa `findRoute`
apenas para escolher a próxima sala; a busca nativa limita maxRooms a2 e
hopMaxOps. Goal centro/range24 admite qualquer entrada conectada. Mantém
validação completa em backoff, recuo e opt-out realRoute:false. Perfil e
limitações em `docs/cpu-regression-2026-10-13.md`; ganho live pendente.
Pioneers optam por `allowUnplannedHop` em ida/retorno: bucket baixo mantém
busca completa adiada, mas libera apenas travessia limitada com folga no
tick. Claimer e demais callers preservam exigência anterior de planejamento.
Nas viagens com `allowUnplannedHop`, fadiga retorna ERR_TIRED antes de
calcular a rota de salas ou alterar os contadores de recuperação. O primeiro
tick sem fadiga revalida trânsito normalmente. `routing.graphSearch` mede
Game.map.findRoute separadamente de realSearch e movimento nativo.
findRoute de viagens allowUnplannedHop usa cache no heap (TTL50/limite128,
configuráveis). Chave inclui origem/destino/avoid/políticas/penalties;
custos de todas as salas consultadas e retornadas são revalidados antes
do reuso. Falhas e callbacks allowRoom dinâmicos não entram no cache.
Medição do hauler cobre também segurança (`hauler.cover`), execução do
terminal job, execução do mineral job e escolha da entrega. Spans são
inclusivos, sem alterar ordem de prioridades ou intenções.
Seleção de entrega do hauler mantém produção como primeira faixa: alvo
elegível já adjacente evita a busca de caminho; lista vazia também. Alvos
distantes conservam findClosestByPath antes das faixas de torre/storage.
Execução do mineral job stockPolicy de energia ao terminal compartilha a
previsão de reserva entre decisão de destino e limite de transferência;
execuções seguintes sempre recalculam para observar mudanças no mesmo tick.
Seleção de ordens do terminal compartilha frete dentro da chamada por
destino/quantidade, com origem fixa da operação; nenhum cache de preço ou
volume entre seleções. orderBook/scoreOrders medem consulta e avaliação.
orderBook.matching(type,resourceType) compartilha livro filtrado somente no
tick, ou reutiliza a cópia completa existente. Swing.quote usa matching;
mercado/flip preservam all. Reset/fonte/tick invalidam as duas visões.
LabPolicyRuntime.resolve mantém cache de isActive no heap por assinatura
de controlador/topologia/dono/métodos, com limite64 configurável. RCL e lab
ausente invalidam; boost reservations e labLoad são filtrados ao vivo.
Sem contexto completo de controlador próprio, mantém verificações diretas.
Assignments compartilha profile de forma lazy apenas dentro da execução,
para bandwidth/buffer/refillRatio; próxima execução recalcula. Estoques,
cooldowns e decisões de produção não entram nesse cache local.
resourcePolicy.consumerAvailable usa saldo físico menos withdrawals como
limite superior antes de varrer reservas, retornando zero para fontes
storage/terminal esgotadas. Saldo positivo mantém todas as proteções ao vivo.
Seleção mineral mantém Set local de seletores negativos avaliados afresh
pela busca da cadeia, evitando repeti-los no fallback da mesma decisão.
Ausência cacheada de chamada anterior não é reutilizada nesse Set.
marketHistoryStore.save confere a união de segmentos presentes e páginas
da geração antes de escrever. Em segment-write-budget adia sem payload
parcial e prioriza writeSegments na ativação; market.scan retenta com
historyDirty antes da cadência. Sucesso/reset limpam prioridade temporária.
