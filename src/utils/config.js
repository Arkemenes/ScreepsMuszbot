// Single source of tunable defaults, overridable per-path from the console
// without a redeploy: `Memory.settings.defender = { maxCount: 5 };`. Every
// literal migrated here keeps its pre-0012 value as the default, so behavior
// is unchanged until someone actually sets an override.
//
// get(path, fallback) walks Memory.settings by dot-path first, then this
// defaults tree, then `fallback` - never throws, a missing/malformed path at
// any level just falls through (constitution §3).

const defaults = {
    boost: {
        enabled: false,
        room: null,
        compound: "XLH2O",
        deadlineTicks: 100,
        drainTimeoutTicks: 300,
        quarantineWakeTicks: 25,
        energyReserve: 100000,
        minReturnRatio: 0.20,
        continueReturnRatio: 0.10,
    },
    market: {
        // base 60 (Grafana's sampling): the same grid as marketFlip.scanInterval, so both read
        // the order book on the same tick (utils/orderBook shares the fetch)
        currentInterval: 120,
        snapshotInterval: 3600,
        minBucket: 500,
        snapshotWindowTicks: 604800,
        snapshotWeightCap: 0.01,
    },
    // ROADMAP 0110: arbitragem instantânea (compra + venda no mesmo scan).
    marketFlip: {
        // live por padrão - pedido do usuário, 2026-09-29. false volta ao
        // modo log-only, via Memory.settings.marketFlip.test = true.
        test: false,
        scanInterval: 60,
        // 0.1% (pedido do usuário, 2026-09-30; era 1%).
        minProfitRatio: 0.001,
        // guardrail de preço: ver marketPricing.js (ROADMAP 0111) - substitui o
        // antigo ratio contra fairPrice (guardrailFairPriceRatio, removido).
        // teto por flip: no máximo esta fração do saldo de créditos
        // DISPONÍVEL (Game.market.credits - committedCredits) no momento em
        // que aquele flip específico é lançado - pedido do usuário,
        // 2026-09-29, como guardrail extra contra sobre-exposição/manipulação.
        maxCreditRatioPerFlip: 0.05,
        maxHoldingTicks: 1500,
        // pedido do usuário, 2026-09-30: se a perna de compra não negociou
        // NADA ainda (preço do livro saiu do limite antes da execução,
        // cooldown do terminal etc.), desiste bem mais cedo que
        // maxHoldingTicks - um flip é pra ser instantâneo, não uma ordem
        // de espera. 15 cobre confortavelmente um cooldown de terminal
        // (10 ticks fixos) com folga. Assim que algo é negociado
        // (dealtAmount > 0), essa checagem para de valer e o flip usa o
        // orçamento normal de maxHoldingTicks até fechar a venda.
        maxBuyWaitTicks: 15,
        // ROADMAP 0111: o flip compartilha marketPricing com o craft -
        // outlier só na perna de venda, margem de tempo com T curto.
        outlierSigma: 3,
        // T estimado de um flip (compra + venda), em ticks - cobre cooldown
        // de terminal e uma viagem de hauler.
        horizonTicks: 60,
    },
    // ROADMAP 0111: fabricação lucrativa (factory + lab), preço conservador.
    craft: {
        operatedStallTicks: 300,
        // chains advance on a grid of N ticks (utils/cadence): their states last hundreds of ticks
        tickInterval: 10,
        // test por padrão: só loga candidatos/descartes, nunca compra nem
        // produz. false liga a execução (Memory.settings.craft.test = false).
        test: true,
        scanInterval: 300,
        // nível de confiança unilateral -> z (0.95 = 1.645). A margem exigida
        // é floor + z * sigmaRel * sqrt(T / 3600).
        confidence: 0.95,
        floor: 0.01,
        // liquidez (histórico próprio de 7d, 1 amostra/h)
        minSamples: 48,
        minPresence: 0.9,
        depthLots: 2,
        // só valem na perna de VENDA do produto (os insumos são comprados de uma
        // vez, a custo fixo, e a receita já usa o bid): spread 2.0 (era 1.3) e
        // volatilidade 30% (era 15%) - pedido do usuário, 2026-10-02
        maxSpread: 2,
        maxSigma: 0.3,
        // capital em andamento (committedCredits é único entre flip e craft)
        maxCommittedRatio: 0.25,
        maxChainRatio: 0.05,
        // tempo (1 tick ~ 1 s): retenção de produto/insumo antes do fallback
        retentionTicks: 259200,
        suspendTicks: 86400,
        // disjuntores: execuções negativas seguidas por produto / janela global.
        // Desligados por padrão (pedido do usuário, 2026-10-05): travaram uma
        // flutuação temporária; o ledger continua registrando. true religa
        // (Memory.settings.craft.breakers = true).
        breakers: false,
        productLosses: 3,
        globalRuns: 10,
        // níveis de commodity habilitados (>= 1 exige operador, ver gate)
        maxLevel: 1,
        // logística estimada em ticks por drenagem/carga/estacionamento
        logisticsTicksPerMove: 50,
        // teto de ticks por estado da cadeia antes de abortar (stall guard)
        stallTicks: 3000,
        recoveryBackoffTicks: 3000,
        legacyRecoveryGraceTicks: 3000,
        recoveredKeep: 20,
        energyRetryTicks: 30,
        maxDepth: 6,
        // energia gasta para entregar/receber cada unidade negociada (taxa de
        // terminal) - estimativa, calibrada pelo ledger
        deliveryEnergyPerUnit: 0.3,
        // não escaneia com o bucket de CPU abaixo disto. 500 (pedido do usuário,
        // 2026-10-02; era 3000): gerar um pixel zera o bucket, e com 3000 o
        // planner ficava parado por muito tempo depois de cada um.
        minBucket: 500,
        // teto de unidades por lote (cada lab guarda 3000)
        maxLotUnits: 3000,
        // --- execução (fase 6): travas de segurança, conservadoras de propósito
        // cadeias simultâneas no total (todas as salas) - sobe só depois de
        // o ledger mostrar lucro real
        // 0 = sem teto global (pedido do usuário, 2026-10-02): o paralelismo é
        // limitado pelas estruturas (uma cadeia por tipo - factory, lab - por
        // sala) e pelo capital (maxCommittedRatio, maxCashAbsolute). > 0 volta a
        // impor um teto de cadeias no total.
        maxActive: 0,
        // teto absoluto de créditos gastos em compras por cadeia, além do % do saldo
        // 1000000 (pedido do usuário, 2026-10-02; era 500000)
        maxCashAbsolute: 1000000,
        // folga mínima sobre o ask conservador no limite de preço das compras
        buySlack: 0.02,
        // O limite de cada compra sobe até onde a cadeia ainda passa na margem
        // (receita / (1 + margem) - custo = folga da cadeia), dividido entre os
        // insumos comprados, usando só esta fração da folga e nunca passando de
        // maxBuyPremium acima do ask. Antes era só ask + 2%, e uma cadeia ainda
        // lucrativa ficava parada esperando um insumo 30% mais caro.
        buyHeadroomUse: 0.5,
        // O planner dimensiona o lote para gastar no máximo teto / (1 + este valor):
        // sem essa folga o lote consumia o teto inteiro e o limite de compra não
        // tinha como subir sem estourá-lo (a cadeia de 979 mil sob um teto de 1M
        // ficava com ~2 mil de folga). 0.15 = 15% do teto reservado para o preço subir.
        priceDriftReserve: 0.15,
        maxBuyPremium: 0.5,
        // compra que não negociou NADA em tantos ticks aborta a cadeia (libera os
        // créditos reservados) em vez de esperar o stall guard
        buyIdleAbortTicks: 900,
        // execuções guardadas por produto no ledger
        ledgerKeep: 20,
        // material de um flip ativo fica fora do estoque da cadeia por estes
        // ticks (contados da compra, ou de quando começou a tentar vender);
        // depois disso é estoque comum - um flip que não vendeu é estoque
        flipLockTicks: 100,
        // lucro absoluto mínimo de uma cadeia: sem isso, encolher o lote por
        // liquidez geraria cadeias minúsculas que ocupam a única vaga ativa
        minProfit: 5000,
        // tentativas de encolher o lote (cada uma divide por 2)
        sizePasses: 12,
        // compra preenchida só em parte (o livro acabou antes): a cadeia segue,
        // reduzida ao que chegou, se pelo menos esta fração do pedido veio;
        // abaixo disso aborta
        minPartialRatio: 0.3,
        // compra que já negociou algo e ficou parada (o livro acabou, ordem em
        // "waiting") este tanto de ticks sem novo negócio é cancelada e tratada
        // como parcial, em vez de segurar a cadeia até o stall guard (3000)
        buyPatienceTicks: 300,
        // A última etapa de lab de uma cadeia roda em vários labs de saída ao mesmo
        // tempo (todo lab que alcança os dois de entrada; só o lab que chama
        // runReaction entra em cooldown). false volta a um lab de saída só.
        wideLabs: true,
        // vende o produto final conforme sai (do storage/terminal), sem esperar o
        // lote inteiro: mesmas regras da venda final (instantânea, nunca abaixo do
        // piso de break-even, só abre ordem com o bid já no piso). Lote mínimo de
        // cada venda parcial = esta fração do alvo da etapa.
        partialSales: true,
        // piso de venda = custo real da operação (compras, energia, estoque próprio,
        // energia da própria venda) x (1 + esta margem): nunca se vende sem lucro.
        // Mantenha <= a margem mínima que o planner aceita (craft.floor + risco), senão
        // uma cadeia aprovada já nasce abaixo do próprio piso e fica segurando.
        minSaleMargin: 0.01,
        // ticks de espera antes de tentar de novo uma venda que o terminalOps recusou
        sellRetryTicks: 25,
        // pior caso de energia por unidade enviada numa venda (o terminal cobra no
        // máximo 1 por unidade, qualquer que seja a distância do comprador)
        saleEnergyPerUnit: 1,
        minPartialSellRatio: 0.1,
        // ROADMAP 0115: independent steps of a lab chain (same height of the reaction tree,
        // e.g. OH and LH of XLH2O) run at the same time in separate labs; the wave plan is
        // taken when it costs at most this many more lab moves than the sequential one
        parallelLabs: true,
        parallelExtraMoves: 4,
        // ROADMAP 0116: how a multi-step lab chain uses the labs. "waves" = intermediates stay
        // in place on one lab each (0115); "wide" = every step on all the labs that reach the
        // centre pair, one after the other through storage; "auto" = the planner takes the
        // faster by estimate, and "wide" only when it is wideMinGain (20%) faster
        labStrategy: "auto",
        // Research catalogue + bounded live evaluation. Never claims global optimality.
        labPolicy: true,
        policyCandidates: 8,
        policyWorkPerTick: 1000,
        policyCpuPerTick: 1,
        policyMaxIterations: 50000,
        policyPlanningTicks: 100,
        policyCacheEntries: 64,
        policyActiveCacheEntries: 64,
        phaseCacheEntries: 128,
        policyBuffer: 500,
        policyRefillRatio: 0.5,
        policyBandwidth: 0, // 0 = observed; "instant" = explicit offline-style override
        policySwitchDelay: null, // null = observed model cost, not an artificial wait
        policyInitialBandwidth: 4,
        policyInitialDelay: 50,
        policyAllowUnmeasuredPipeline: false,
        policyLogisticsSamples: 100,
        policyLogisticsWindow: 500,
        policyReplanTicks: 500,
        wideMinGain: 0.2,
        // log automático no console (candidatos, etapas, vendas, abortos)
        log: true,
        // a cada quantos scans repete o resumo de descartes
        logDiscardEvery: 12,
    },
    defender: {
        maxCount: 3,
        // room.energyCapacityAvailable at/above which a defenderStriker +
        // defenderMedic pair is spawned instead of the solo defender
        // (ROADMAP 0032 D2) - below this, the solo body is still the only
        // affordable option, so it stays the fallback rather than being
        // replaced outright.
        pairEnergyThreshold: 500,
        // defenderStriker: how far from the spawn a wounded target can be
        // and still get chased down to finish (range 1) instead of just
        // held at kite range (ROADMAP 0032 O1)
        mopUpRange: 10,
    },
    tower: {
        // ROADMAP 0072 (user-specified, unified tower/builder repair
        // tiering): how much of the TOWER'S OWN energy is required before
        // it'll spend on a repair target of a given tier - stricter for a
        // less urgent tier, since a tower reacts every tick with no
        // population cost to self-limit it (unlike roles/builder.js, always
        // unconditional for critical/satisfactory - ROADMAP 0069).
        //   critical target:            energyRatio >= repairEnergyRatio
        //   satisfactory OR optimal:    energyRatio >= satisfactoryRepairEnergyRatio
        //     (optimal also needs utils/resourceTiers.isStorageAbundant -
        //     see rampartCriticalRatio/rampartSatisfactoryRatio below)
        // repairEnergyRatio deliberately equals criticalRatio below
        // (ROADMAP 0067) - a gap above it left the tower holding energy
        // hauler.js had already stopped urgently delivering (no longer
        // "critical") that it still couldn't spend (below the old, higher
        // gate).
        repairEnergyRatio: 0.5,
        satisfactoryRepairEnergyRatio: 0.7,
        // rampart/wall repair tiers, as a FRACTION of the structure's own
        // hitsMax (ROADMAP 0032 D4 + follow-up, utils/rampartRepair.js).
        // RAMPART_HITS_MAX (300k) and WALL_HITS_MAX (300M) are fixed engine
        // constants - not RCL-scaled - but differ from each other by
        // 1000x, so a ratio of each structure's own ceiling stays
        // meaningful for both instead of picking one absolute number
        // that's trivial for a wall or unreachable for a rampart.
        // roles/builder.js and structures/tower.js share these two numbers
        // (utils/rampartRepair.js is the single source of truth), but NOT
        // the repair.normal* pair below - a normal structure's hitsMax is
        // small enough that a tenth-of-a-percent bar would basically never
        // fire, so it needs its own, much coarser pair (ROADMAP 0072).
        rampartCriticalRatio: 0.001,
        rampartSatisfactoryRatio: 0.01,
        // ROADMAP 0054, revised same-day by ROADMAP 0072 ("vamos matar essa
        // zona morta do hauler"): the tower's delivery threshold -
        // hauler.js's essentialConsumer pulls a critical tower (below this
        // ratio) from storage unconditionally, same urgency as spawn/ext.
        // Every OTHER tower (at/above this ratio) is a plain optional
        // consumer, same tier as a lab/controller-container
        // (resourceTiers.aboveReserve-gated) - there used to be a THIRD,
        // higher "satisfactory" bar in between, and a tower sitting between
        // the two matched neither: not essential, not yet "ideal", left
        // alone with no active delivery path except pickDeliver's very last
        // resort (only fires once literally nothing else in the room wants
        // the energy) - a real, admitted dead zone. Removed entirely:
        // critical vs optional is the same two-way split every other
        // consumer in this cascade already uses, and a tower never needed a
        // third state of its own. Shifts up under defenseActive - a tower
        // nearly full going into a fight is worth more than the same energy
        // idle in storage.
        criticalRatio: 0.5,
        criticalRatioUnderAttack: 0.8,
    },
    // ROADMAP 0072: repair-tier ratios for every structure that ISN'T a
    // rampart/wall (see tower.rampartCriticalRatio/rampartSatisfactoryRatio
    // above for those) - a container/spawn/extension/road's hitsMax is
    // small enough that the rampart/wall pair (0.1%/1%) would essentially
    // never fire, so this pair is deliberately much coarser. Shared by
    // structures/tower.js and roles/builder.js (utils/rampartRepair.js).
    repair: {
        normalCriticalRatio: 0.1,
        normalSatisfactoryRatio: 0.5,
    },
    upgrader: {
        // rooms/needs.js + utils/autoscale.js: ABSOLUTE ceiling on the
        // room's upgrader count, base tier + autoscale delta combined
        // (ROADMAP 0040/0049) - without it, a room stuck eligible for a
        // very long time would keep adding +1 upgrader every cooldown
        // window forever. The feedback loop is normally self-limiting
        // (more upgraders drain the surplus that made the room eligible in
        // the first place), this is just a safety net. RCL8 has its own,
        // stricter clamp (max 1) applied separately in rooms/needs.js.
        autoscaleMaxCount: 8,
        // rooms/needs.js's RCL8 branch: low-water mark (fraction of
        // CONTROLLER_DOWNGRADE[8]) below which the room wants its 1 upkeep
        // upgrader back. Deliberately wide (ROADMAP 0103 follow-up, real
        // bug): a SINGLE successful upgradeController() call resets
        // ticksToDowngrade straight to the max, not incrementally - a tight
        // "< max" trigger (the original rule this replaces) re-armed itself
        // within a tick of the upkeep upgrader's first and only upgrade,
        // converting it to a builder immediately, which then respawned and
        // reconverted every creep lifetime forever. A wide margin means the
        // post-upgrade reset buys tens of thousands of ticks - far longer
        // than any creep's lifespan - before the room needs another one.
        rcl8UpkeepRatio: 0.5,

        // roles/upgrader.js's isExcessUpgrader(): the *high* mark (fraction
        // of CONTROLLER_DOWNGRADE[8]) ticksToDowngrade must reach before an
        // existing RCL8 upkeep upgrader is allowed to demote to builder.
        // Deliberately separate from and higher than rcl8UpkeepRatio above
        // (user-reported real bug, 2026-09-24): reusing the same 50% mark to
        // demote meant a creep still short of the controller got benched the
        // instant ticksToDowngrade ticked back above 50% - e.g. another
        // creep's upgrade reset the timer to max while this one was still
        // en route, so it never got to do its own job. A creep now stays an
        // upgrader through the whole 50%-99% gap and only demotes once the
        // controller is genuinely near max, not merely "not urgent anymore".
        rcl8SafeRatio: 0.99,
    },
    autoscale: {
        // utils/autoscale.js: minimum ticks between two automatic +1/-1
        // adjustments IN THE SAME ROOM, shared across every registered
        // role (ROADMAP 0040) - not per role. Deliberately coarse: this is
        // meant to react to a room's settled state (nothing left to build,
        // energy piling up), not to tick-to-tick noise.
        cooldown: 30000,
    },
    terminalFuel: {
        enabled: true,
        minimumReserve: 10,
        transactions: 2,
        margin: 0.2,
        quoteMaxAge: 300,
        scarceStorageRatio: 0.1,
        scarceOptionalRatio: 0.1,
        releaseRatio: 0.25,
    },
    logistics: {
        // ROADMAP 0054: utils/resourceTiers.js's single reserve floor - a
        // fraction of the room's storage capacity kept off-limits to every
        // OPTIONAL energy spend (lab/factory/power spawn/controller
        // container, and - roles/builder.js only since ROADMAP 0072 split
        // the two workers apart - a rampart/wall past its satisfactory
        // tier). Replaces two independently-tuned pisos that used to
        // answer the same question differently (tower's old 50%
        // rampartStorageFillGate, hauler's old 5% storageReserveFloor).
        // Essential spends (spawn/extension, a critical tower) ignore this
        // entirely, same as before. structures/tower.js uses the much
        // higher storageSatisfactoryRatio bar below instead (via
        // utils/resourceTiers.isStorageAbundant) for the equivalent
        // optimal-tier rampart/wall spend - a tower has no population cost
        // to self-limit it the way a builder does, so it needs real
        // abundance, not just "not literally empty".
        reserveRatio: 0.01,
        // utils/resourceTiers.js's controllerCritical(room) - true once the
        // controller's ticksToDowngrade falls below this fraction of
        // CONTROLLER_DOWNGRADE[rcl]; risk of losing RCL always wins.
        // structures/link.js's collector: the controller link outranks the
        // storage link, even an empty one. roles/upgrader.js: the one
        // override that lets the upgrader spend room-wide storage/container
        // energy even while the room itself isn't stable yet (ROADMAP 0054
        // follow-up, real bug - see upgrader.js's own comment).
        controllerCriticalDowngradeRatio: 0.1,
        // structures/link.js's collector: once the storage is at/above this
        // fill ratio AND the controller isn't RCL8 yet (still has real RCL
        // to gain), the controller link wins by default over a storage
        // that's already comfortable. Reused by
        // utils/resourceTiers.isStorageAbundant (ROADMAP 0072) - the same
        // "storage is genuinely comfortable" bar, rather than inventing a
        // second, differently-tuned number that answers the same question.
        storageSatisfactoryRatio: 0.5,
        // Defensive repair gates (ROADMAP 0101): walls/ramparts in the
        // satisfactory tier need more than this storage fill, while their
        // unbounded optimal-tier hardening needs at least the stronger bar.
        // These are intentionally separate from storageSatisfactoryRatio,
        // which also drives controller-link/economy classification.
        rampartHealthyStorageRatio: 0.1,
        rampartHardeningStorageRatio: 0.7,
        // roles/hauler.js's terminalWithdrawable(): never let the
        // ledger-credited withdrawable slice drain the terminal below this
        // fraction of its own capacity - a floor on TOP of the ledger's own
        // "what's withdrawable in theory" bookkeeping (ROADMAP 0043), not a
        // replacement for it.
        // Legacy fallback when terminalFuel.enabled is false.
        terminalReserveRatio: 0.1,
        // ROADMAP 0097: normal rebalancing and its hard per-transfer cap.
        balanceEnabled: true,
        balanceInterval: 1200,
        // 0.005 of a ~1.3M storage+terminal capacity is ~6500 energy (pedido
        // do usuário, 2026-09-28: 0.2/260000 nunca disparava o gatilho normal
        // porque as salas operam na casa de 2-5% da capacidade agregada no
        // dia a dia, bem abaixo do que 20% de gap exige).
        balanceGapRatio: 0.005,
        balanceMaxAmount: 50000,
        // structures/link.js's collector: skip a non-collector link that's
        // already at/above this fill ratio, even with free capacity left -
        // avoids burning the collector's cooldown on a transfer that only
        // tops off a couple energy on an already-full target.
        linkReceiveFillRatio: 0.95,
    },
    terminalRelay: {
        // Quotes stay available, while relay intents remain opt-in until the
        // private key and the ally's RLY protocol are configured in Memory.
        enabled: true,
        transportEnabled: false,
        hub: "E2N46",
        freightMultiplier: 0.5,
        messageEnergy: 2,
        minSavingsEnergy: 0,
        minSavingsRatio: 0,
        fundingLeadTicks: 30,
        outcomeMaxTicks: 1500,
        maxEnergyInTransit: 50000,
    },
    terminalMessenger: {
        contacts: {},
        maxQueue: 20,
        historySize: 50,
    },
    stockPolicy: {
        enabled: true,
        targets: { energy: 100000 },
        rooms: {},
        terminalFreeRatio: 0.15,
        creditReserve: 100000,
    },
    energyReport: {
        // ROADMAP 0154-B (ARK-133): heap window of per-room samples, console line per room
        // every autoTicks (0 = off), and the coverage context() needs before it answers
        enabled: true,
        // a creep lives 1500 ticks: readiness needs evidence covering a whole lifetime (0157)
        windowTicks: 1500,
        // ticks folded into one heap block (stored/progress read once per block)
        sampleTicks: 10,
        autoTicks: 1500,
        minCoverage: 0.9,
    },
    labReport: {
        // ROADMAP 0155 (ARK-134): cumulative lab-utilization counters in Memory.labReport;
        // busy share at or above reactionLimited reads "reaction-limited" (descriptive)
        enabled: true,
        reactionLimited: 0.85,
    },
    readiness: {
        // ROADMAP 0157-A (ARK-140): safety margin on demand, and the energyReport coverage
        // a room needs before utils/readinessContext lets a plan through
        margin: 0.20,
        minCoverage: 0.9,
    },
    listingPolicy: {
        // ROADMAP 0153 (ARK-138): on by default since 2026-10-20 (user decision);
        // Memory.settings.listingPolicy.enabled = false turns it off
        enabled: true,
        cancelFinished: true,
        lifetimeMs: 7 * 24 * 60 * 60 * 1000,
        descent: false,
        descentInterval: 1200,
        floors: {},
    },
    swing: {
        enabled: true,
        test: true,
        scanInterval: 120,
        margin: 0.01,
        minSamples: 30, // Temporary validation threshold; restore 48 after validation.
        maxSampleAge: 7200,
        listingLifetime: 1209600,
    },
    terminalOps: {
        // User default (2026-10-17); an explicit Memory setting still overrides it.
        reuseOrderBook: true,
        sendConfirmationTicks: 2,
        // operations' state machines run every N ticks (a terminal cooldown is 10)
        tickInterval: 5,
        // ROADMAP 0098: a SELL stages its goods in the terminal in batches of
        // at most `buffer = min(saleBufferAmount, capacity * saleBufferCapacityRatio)`.
        // Raised to 85% of the terminal (2026-09-24): the old 10000/0.1 pair
        // forced a 10k batch with a hauler round trip plus a terminal cooldown
        // between each one, so a 50k sale crawled through five cycles. The
        // 15% left over is deliberate headroom - roughly 5% for the fee energy
        // the deal needs on top of the cargo, 10% so incoming transfers and
        // BUY deliveries still have somewhere to land. saleBufferAmount is now
        // the terminal's own capacity, i.e. the ratio is what actually binds.
        enabled: true,
        recoveryTicks: 10000,
        marketPriceStep: 0.001,
        repriceInterval: 1200,
        saleBufferAmount: 300000,
        saleBufferCapacityRatio: 0.85,
        statsWindowTicks: 60,
        // Keep final records only while referenced; optional diagnostic retention.
        operationRetentionTicks: 0,
        // tickTransfer()'s "atTerminal" check waits for loadedAmount to show up
        // in the source terminal's own store before calling send() - a stall
        // guard for whenever that mismatch never resolves (e.g. a bookkeeping
        // bug crediting loadedAmount the terminal never actually received).
        transferStallTicks: 1500,
        // pedido do usuário, 2026-09-30: candidateOrders() rejeita uma ordem
        // cuja taxa de entrega (convertida a créditos via energyFairPrice)
        // exceda esta fração do preço bruto da ordem - bug real, um SELL
        // fechou com preço bruto 38.717 mas efetivo 7.505 (taxa comeu ~81%
        // do valor) porque nada além do limite de preço bruto barrava o
        // deal(). Flips (marketFlip.js) passam skipFeeCap:true e ficam de
        // fora - já avaliam a mesma taxa como parte do próprio lucro
        // líquido, com seu próprio limiar (marketFlip.minProfitRatio).
        maxFeeRatio: 0.05,
        // Optional BUY guardrail; the effective price ceiling always applies.
        maxBuyFreightShare: null,
        orderConfirmationTicks: 10,
        // No observable trade suspends this order, never blacklists it forever.
        orderRetryBaseTicks: 25,
        orderRetryMaxTicks: 300,
        orderRetryHistory: 10,
    },
    hauler: {
        // a load pick is kept this many ticks while its target still holds 50+ energy
        // (roles/hauler.js pickLoad: no path search every tick on the way there)
        repickTicks: 5,
        // ROADMAP 0152: an idle hauler (empty, nothing to load, no mineral/chain job) searches again
        // only every this many ticks (the tick it goes idle always searches); 1 = every tick (old
        // behaviour). A hungry spawn/extension, or any load in the tank, keeps the per-tick search.
        idleRecheckTicks: 5,
        // ROADMAP 0152: a delivery pick is kept this many ticks while the target still takes energy and
        // nothing of higher priority (hungry spawn/extension, critical tower, storage below reserve)
        // appeared; 1 = pick again every tick (old behaviour)
        deliverRepickTicks: 5,
        // a source container needs more than this much energy before a
        // hauler bothers with the trip
        minContainerLoad: 1000,
        // headcount when there's no link network
        maxCountNoLinks: 5,
        // ROADMAP 0054: for any non-critical tower (see tower.criticalRatio
        // above), top it off further only while it still has more than this
        // fraction of free capacity - the practical cutoff for "already
        // close enough to full, not worth another trip".
        toppingOffThreshold: 0.05,
        // utils/autoscale.js (ROADMAP 0040/0049): ABSOLUTE ceiling on the
        // room's hauler count, base tier + autoscale delta combined (below
        // the base tier's own no-link ceiling of 5 - see
        // haulerBacklogEligible in rooms/needs.js, this can genuinely clamp
        // the base tier down, not just stop the autoscale adding more).
        autoscaleMaxCount: 3,
        // rooms/needs.js: floor on the base hauler tier once an active
        // mineral operation (extractor + container, deposit not depleted)
        // shares the room with a storage to deliver into - the mineral
        // errand (roles/hauler.js's pickMineralJob) competes with the
        // room's own energy loop for the same creep, so a solo hauler in a
        // link room (normally just 1, the link network's last mile) starves
        // one job or the other. Drops back to the room's normal count on
        // its own once the deposit runs dry - see mineralOperationActive.
        minCountWithMineral: 2,
    },
    builder: {
        // ROADMAP 0152: an empty builder that found no pile to take (dry room) searches again only every
        // this many ticks; 1 = every tick (old behaviour)
        idleRecheckTicks: 5,
        // ARK-116: a builder holding energy with nothing to build/repair/upgrade looks again
        // only every this many ticks; 1 = every tick (old behaviour)
        idleSpendRecheckTicks: 10,
        // utils/autoscale.js (ROADMAP 0040): pickableEnergy() thresholds
        // gating the incremental grow/shrink, set at the same boundaries
        // rooms/needs.js's own byEnergy tier already uses (>50000 -> its
        // top tier of 4; <1500 -> its bottom non-zero tier) - autoscale
        // only ever pushes past what that tier already decided, or backs
        // off before it would have dropped further anyway.
        autoscaleEnergyHigh: 50000,
        autoscaleEnergyLow: 1500,
        // ABSOLUTE ceiling on the room's builder count (ROADMAP 0049) -
        // below the base tier's own ceiling of 4 (byBacklog/byEnergy, see
        // rooms/needs.js), so this genuinely clamps the base tier down too,
        // not just the autoscale delta on top of it.
        autoscaleMaxCount: 2,
    },
    population: {
        // ROADMAP 0148 (ARK-135): on-demand builder. Opt-in per room (the spec's one-room
        // pilot, on by default for W7N49 only); every room keeps the emergency floor.
        onDemand: {
            enabled: true,
            rooms: ["W7N49"],
            // the room must stay without builder demand at least max(lead, minIdleTicks)
            minIdleTicks: 300,
            travelTicks: 50,
            marginTicks: 100,
            // needs is cached a few ticks: evaluations further apart than this break the idle run
            gapTicks: 20,
            // entering the pilot needs energyReport evidence: builders at or below this share
            maxBuilderUtilization: 0.1,
            // emergency floor marks (any room, policy on or off): with no builder alive or
            // spawning, a critical repair or one of these marks wants exactly one builder
            rescueContainerRatio: 0.4,
            rescueRoadRatio: 0.3,
        },
    },
    // ROADMAP 0154 T5-T6 (utils/experiments): temporary heap overlays on allowlisted settings
    experiments: {
        // off: reconcile still closes every running experiment (reason "off"), start refuses
        enabled: true,
        // a global reset closes running experiments (spec: reset removes the overlay); false
        // re-applies them from Memory.experiments on the first tick instead
        abortOnReset: true,
        // longest run start() accepts, and the closed records kept for experiment.status()
        maxTicks: 20000,
        keepClosed: 10,
    },
    miner: {
        // fraction of capacity the miner keeps its adjacent source-defense
        // tower topped up to (unconditional priority - see roles/miner.js)
        towerReserve: 0.5,
        towerReserveUnderAttack: 0.9,
        // ROADMAP 0113: forward the harvest to the link/tower in full loads instead of
        // every tick (each action costs ~0.2 CPU); false = the old every-tick loop
        batchTransfer: true,
        // container energy at which the miner also drains it into its store for the link
        pullBacklog: 500,
        // ARK-116: with the source dry, the store and the container empty, sleep until it regenerates
        sleepWhenDry: true,
    },
    combat: {
        // tiles a non-combat creep wants to stay from any armed hostile
        safeRange: 5,
        // rooms/defense.js's checkSafeMode() (ROADMAP 0032 D6, revised -
        // see "Bug real" in specs/features/0036-.../spec.md): projected
        // ticks until the most-endangered spawn's effective hp (its own
        // rampart's hits, if any, else its own hits) reaches zero at the
        // current incoming dps. Below this, activateSafeMode() fires -
        // conservative on purpose, a weak poke the normal defense handles
        // shouldn't burn the limited charges (a lone unboosted attacker
        // against a full-hp spawn projects to 100+ ticks; a real lethal
        // rush projects well under this even at full hp).
        safeModeTicksToKillThreshold: 20,
    },
    creep: {
        // creep speech on/off. say() is free (the driver's freeMethods: say, pull), so on by default
        say: true,
    },
    planner: {
        // planCity() won't spend a tick's CPU below this bucket
        minBucket: 500,
        maxSitesPerRoom: 8,
        // plan preview: shown every tick from a heap replay, redrawn on change or every N ticks
        visualizeRedrawInterval: 50,
    },
    traffic: {
        roadThreshold: 50,
        decayInterval: 100,
        decayFactor: 0.99,
        roadRepairFloor: 0.4,
    },
    remotes: {
        maxDistance: 2,
        maxPerRoom: 2,
        reserveHealthyTicks: 3000,
    },
    routing: {
        // Unsafe transit is learned dynamically, without changing diplomacy.
        avoidPlayers: [],
        learnAllyAttacks: true,
        allyAttackAvoidTicks: 10000,
        // extra room-level route cost (utils/routing) added per hostile
        // room crossed - on top of blocking it outright for creeps that opt
        // in (the reserver)
        hostilePenalty: 10,
        // extra route cost for a non-highway room, so a route through the
        // x%10==0 / y%10==0 "highway" grid is preferred when available
        nonHighwayPenalty: 2,
        // scout: ticks to wait, parked in a room, for its layout preview
        // plan (planLayout()) to finish before giving up
        layoutWaitLimit: 500,
        // reserver (reserve/claim/contest): ticks parked in the same spot
        // before logging a stall warning - e.g. blockHostiles finds no safe
        // route around a genuinely hostile chokepoint room, so the creep
        // correctly waits at its own room's border instead of crossing, but
        // silently forever isn't acceptable (constitution stall-guard rule)
        claimStallTicks: 50,
        // scout: ticks spent still travelling toward a signRoom()/
        // planLayout() destination (never arrived yet) before giving up on
        // that one-off request entirely - e.g. the destination turned out
        // to be an unreachable adjacent room (utils/routing.js's moveToRoom
        // now refuses it outright once blacklisted) and neither task checks
        // moveToRoom's return value, so without this it would camp on the
        // request forever with zero feedback. Same order of magnitude as
        // layoutWaitLimit (that one guards the SEPARATE post-arrival
        // waiting-for-plan phase, not getting there in the first place).
        travelStallLimit: 500,
        // ROADMAP 0061: consecutive ticks a travelling creep can hold the
        // exact same position (any tile, not just a room border) before
        // isStuck() calls it genuinely stuck rather than just fatigued/
        // momentarily blocked by traffic. Same order of magnitude as the
        // old border-only threshold (3) this replaces. Only used by
        // roles/scout.js's own free-roam exploration now - moveToRoom()'s
        // cross-room retreat trigger moved to noPathTicks below (ROADMAP
        // 0063), which reads native moveTo()'s own ERR_NO_PATH instead of
        // guessing "stuck" from a frozen position (traffic on the very
        // next tile freezes a creep just as well as a sealed room does,
        // but only the sealed room actually returns ERR_NO_PATH).
        stuckTicks: 4,
        // ROADMAP 0063: consecutive ticks moveToRoom()'s own moveTo() call
        // returns ERR_NO_PATH (never merely "hasn't moved") before
        // retreatFrom() backs the creep out to the previous room in its
        // own visited history and excludes this one. Small on purpose -
        // ERR_NO_PATH is the engine's own authoritative "no route exists
        // under these constraints", not a guess, so it doesn't need the
        // same margin as position-based stall detection.
        noPathTicks: 2,
        // Consecutive no-progress ticks with no fatigue before invalidating
        // the native move cache and forcing a fresh path search.
        noProgressTicks: 2,
        // ROADMAP 0076: once retreatFrom() confirms a room is a genuine
        // route dead end (creep physically standing there, native moveTo()
        // returned ERR_NO_PATH repeatedly), it's shared via
        // Memory.rooms[x].routeDeadEndUntil so every OTHER creep also
        // avoids it instead of independently rediscovering the same thing
        // (e.g. a second pioneer sent moments after the first hit an
        // ally's interior rampart neither computeRealRoute, terrain-only,
        // nor findRoute, ally-exempt from isDangerousRoom, could see
        // coming). TTL, not permanent - the obstruction can change (ally
        // opens a rampart, wall gets torn down); console clearRouteDeadEnd
        // resets one early without waiting it out. Order of magnitude
        // picked to comfortably outlast a single spawn cycle without
        // requiring the obstruction to be re-confirmed by every batch of
        // creeps sent that way.
        deadEndTicks: 10000,
        // ROADMAP 0064: computeRealRoute()'s PathFinder.search budget -
        // runs once per trip (opt-in, opts.realRoute), so it can afford a
        // much bigger ceiling than any per-tick search in this codebase.
        // maxRooms 64 is the engine's own hard cap; maxOps scaled up from
        // the 2000 default since a multi-room trip covers far more tiles
        // than a same-room search ever would.
        realRouteMaxRooms: 64,
        realRouteMaxOps: 20000,
        realRouteRetryTicks: 50,
        realRouteCacheTicks: 1500,
        realRouteCpuReserve: 5,
        realRouteMinCpu: 5,
        realRouteCpuBudget: 10,
        realRouteOpsPerCpu: 1000,
        // Delay full-trip planning until reserves recover; validated hops stay small.
        realRouteMinBucket: 1000,
        hopMaxOps: 20000,
        // Crossings should survive slow loaded movement; stalls still repath.
        crossRoomReusePathTicks: 1500,
        crossRoomMode: "incremental",
        graphRouteCacheTicks: 50,
        graphRouteCacheEntries: 128,
        // ROADMAP 0064 live follow-up: the native creep.moveTo() calls
        // moveToRoom() actually executes movement with never got this -
        // they silently used the engine's own default (2000), regardless of
        // how generous computeRealRoute()'s own budget was. Confirmed live:
        // a leg re-validated fine (computeRealRoute found a real 8-hop
        // detour, moveOpts already sensible) but the very next native
        // moveTo() call, given that exact validated route, still came back
        // ERR_NO_PATH twice and triggered another retreat anyway - the only
        // thing that differs between the two searches is the ops ceiling.
        // W1N50 (the room in that incident) has a fair amount of natural
        // wall scattered through it (confirmed by looking at its terrain
        // directly); routing around that from wherever the creep currently
        // stands can cost more than 2000 ops even when the room-level route
        // is already correct. Smaller than realRouteMaxOps on purpose -
        // this runs on every tick a fresh path is actually needed (not just
        // once per leg), so it stays a ceiling, not a routine expense.
        // maxOps alone didn't fix the live symptom - routeCostCallback's
        // "allowed" set (the route + each hop's known-exits neighbors as
        // slack) can also exceed the engine's own default maxRooms (16)
        // once a validated route runs 8+ hops; PathFinder caps total rooms
        // EXPLORED at maxRooms regardless of ops left. Both scoped to
        // opts.realRoute callers only (same-day follow-up, at the user's
        // request - "isso aumenta consumo de CPU? vale pra todo path?"): a
        // wider ceiling costs nothing for a search that already succeeds
        // within the old one, but only opts.realRoute callers (today, just
        // the claimer) have shown evidence of actually needing it -
        // scout/pioneer/raider/squad keep the engine's own defaults.
        //
        // ROADMAP 0064 same-day, third root cause: 20000 was sized back
        // when the native moveTo() search was still constrained by
        // routeCostCallback's narrow ALLOWLIST (route + one neighbor layer,
        // rarely more than ~20 rooms) - a small search space that 20000 ops
        // covered comfortably. Once avoidCostCallback replaced that with
        // the same open BLOCKLIST computeRealRoute() itself searches under
        // (every room open except avoid/hostile), the two became the SAME
        // kind of search - confirmed live: tryComputeRealRoute (200000 ops)
        // kept finding a valid route from the exact room native moveTo()
        // (20000 ops) then immediately failed ERR_NO_PATH from, every
        // single retreat, four legs in a row - a search that only ever
        // fails with a 10x smaller ops ceiling than an equivalent search
        // that succeeds is the signature of ops exhaustion, not a genuine
        // dead end (PathFinder.search's own `incomplete` when ops run out
        // surfaces through moveTo() as the identical ERR_NO_PATH, no way to
        // tell them apart from the return code alone). Raised to match
        // realRouteMaxOps - there's no longer a principled reason for the
        // two to differ, since avoidCostCallback is only ever in play (see
        // moveToRoom()'s usingRealRoute) in exactly the tick right after
        // computeRealRoute validated the same search under the same
        // constraints.
        moveMaxOps: 200000,
        moveMaxRooms: 64,
    },
    observer: {
        // exploration priority score = staleness * (1 + enemies *
        // militaryWeight) - higher means a room with hostiles gets
        // re-observed proportionally more often; 0 disables the bias
        // entirely (back to plain least-recently-seen)
        militaryWeight: 1,
    },
    claim: {
        // Claim can share a scout corridor through SK, while avoiding keeper zones.
        keeperTransit: true,
        keeperAvoidRange: 6,
        keeperIntelMaxAge: 200,
        keeperObserveTicks: 20,
        // rough travel-time estimate for claimRoom()'s reachability check:
        // room-hops (rooms/remotes.roomDistance) * this. A creep with any
        // CLAIM part is capped at CREEP_CLAIM_LIFE_TIME (600) total, not
        // the usual 1500 - claimRoom() refuses a target it can't reach in
        // time instead of wasting the spawn on a claimer that dies en route.
        ticksPerRoomHop: 50,
        // safety buffer subtracted from CREEP_CLAIM_LIFE_TIME before
        // comparing against the travel estimate above
        travelMargin: 10,
    },
    raiding: {
        // a targetEnemy room's controller.level must be at/below this to
        // count as "weak enough to raid" (rooms/raiding.js, ROADMAP 0032 O4)
        maxTargetRcl: 3,
        // opt-in: findWeakTarget() only runs automatically (main.js) when
        // this is true. Off by default - having players in targetEnemies
        // doesn't mean "raid them whenever possible" until asked for.
        autoRaid: false,
    },
    squad: {
        // average hits/hitsMax across living squad members below which a
        // retreat is considered (utils/squad.js, ROADMAP 0032 Fase 4) -
        // still only happens if a safe exit actually exists, otherwise the
        // squad keeps fighting regardless of this ratio
        retreatHpRatio: 0.3,
        // consecutive ticks a squad can fail to advance (blocked in both
        // formations) before the blocking tile gets added to `avoid`
        stuckTicksLimit: 5,
        // how long a tile stays in `avoid` before being reconsidered - the
        // blocker might have only been passing through
        avoidTicks: 100,
    },
    scout: {
        // roles/scout.js (ROADMAP 0009): a sala-alvo de exploração que
        // responde ERR_NO_PATH entra em Memory.rooms[room].scoutBlacklistUntil
        // por este tanto de ticks - sem isso a reseleção reescolhe a mesma
        // sala nunca visitada (lastVisit undefined sempre vence o tie-break)
        // e o scout fica retentando um bolsão inalcançável para sempre.
        blacklistTicks: 5000,
    },
    pioneer: {
        // an owned, spawnless room (rooms/pioneering.js, ROADMAP 0037) only
        // gets rescued by an owned room WITH a spawn within this many
        // room-hops (remotes.roomDistance) - too far and the round trip
        // never pays for itself
        maxDistance: 30,
        // pioneers a single mother room keeps in flight per spawnless
        // target room at once - caps how much of one disaster can eat a
        // sister room's own spawn queue
        maxConcurrent: 2,
        // utils/autoscale.js (ROADMAP 0040/0049): ABSOLUTE ceiling on the
        // room's total pioneer count, base tier + autoscale delta combined
        // - lets a mother room push past maxConcurrent while it still has a
        // pending target AND spare energy, without growing forever
        autoscaleMaxCount: 6,
    },
    excuseMe: {
        // utils/excuseMe.js (ROADMAP 0044): how many single-file parked
        // allies deep travel() will ask to step aside at once - a corridor
        // jam, not a general search, so this stays small on purpose
        maxChain: 4,
    },
    renew: {
        // rooms/spawning.js (ROADMAP 0045): an idle spawn only considers
        // renewing an adjacent creep below this many ticksToLive left -
        // same order of magnitude as old_1's parity mechanic (300)
        ticksToLiveThreshold: 300,
        // ... and only if the creep's body is worth the spawn energy
        // (BODYPART_COST sum) - a cheap creep is cheaper to just replace
        minBodyCost: 1000,
        // ... and only while the room has energy to spare - a fraction of
        // energyCapacityAvailable, not just "any energy at all"
        minEnergyRatio: 0.8,
        // ... and only while at least this fraction of the room's spawns
        // are already busy spawning - with most spawns idle there's no
        // spawn-cycle cost to save by renewing, so let the creep die and
        // replace it normally instead of burning energy on renew
        minBusySpawnRatio: 0.5,
    },
    pixel: {
        // main.js (ROADMAP 0045): converts a full CPU bucket into a Pixel
        // resource every tick it stays full - off switch for a shard/season
        // where Pixel doesn't matter. ARK-197 (2026-10-20): off by default while the pixel
        // logic is redesigned; Memory.settings.pixel.enabled = true turns the old behaviour back on
        enabled: false,
        bucketThreshold: 10000,
        // generatePixel() zeroes the bucket, and with a bucket at 0 any tick over the
        // limit is terminated ("CPU bucket is empty"). So a pixel is only made while the
        // published CPU average (cpuMeter window) leaves this much room under the limit
        // to refill it; with no window published yet (after a global reset) it waits.
        headroomGate: true,
        minHeadroom: 3,
    },
    needs: {
        // rooms/needs.js keeps a room's computed headcount this many ticks (1 = every tick);
        // never used while the room is under attack
        cacheTicks: 10,
    },
    cpu: {
        // below this bucket the optional modules (market scan, marketFlip) pause so the
        // bucket can refill; craftPlanner has its own craft.minBucket gate
        shedBucket: 2000,
        // ROADMAP 0162: bucket bands (utils/cpuTier). critical < critical, low < low,
        // full >= full, normal in between; hysteresis = margin to cross an edge
        bands: { critical: 1000, low: 3000, full: 9500, hysteresis: 250 },
        // tier per guard() label prefix: critical runs T0, low T0-1, normal T0-2, full T0-3.
        // A label missing here runs as T0 (never switched off by omission).
        tiers: {
            planStore: 0, memoryCleanup: 0, bootstrapStorage: 0, intel: 0, spawn: 0, defense: 0,
            creep: 0, traffic: 0, rampart: 0, structure: 0, energyLedger: 0, intentMeter: 0, stats: 0,
            plan: 1, terminalOps: 1, energyBalancing: 1, energyReport: 1, labReport: 1, boostLogistics: 1, craftLedger: 1, market: 1,
            intelRemote: 1,
            craftPlanner: 2, marketFlip: 2, swingTrade: 2, cpuReport: 2, planPreview: 2,
            pixel: 3, raiding: 3, layoutPreview: 3, labRefine: 3,
        },
        // full band only: existing intervals divided / budgets multiplied by factor
        boost: {
            "observer.exploreInterval": { factor: 10, kind: "interval" },
            "craft.scanInterval": { factor: 2, kind: "interval" },
            "craft.policyCpuPerTick": { factor: 2, kind: "budget" },
            "terminalOps.tickInterval": { factor: 5 / 3, kind: "interval" },
            "marketFlip.scanInterval": { factor: 2, kind: "interval" },
            "builder.idleSpendRecheckTicks": { factor: 2, kind: "interval" },
            "hauler.idleRecheckTicks": { factor: 2, kind: "interval" },
        },
    },
    mineralMiner: {
        // ROADMAP 0114: minimum deposit amount to spawn a mineralMiner, and the
        // WORK clamp / life budget of its body (never CARRY)
        minAmount: 2000,
        minWork: 4,
        maxWork: 12,
        lifeBudget: 1400,
    },
    // ROADMAP 0164 (utils/extractorEconomics): spawn a mineralMiner only while the deposit's value
    // beats the energy its team costs (energy and mineral at market fairPrice)
    extractorEconomics: {
        enabled: true,
        // verdict cache per room (also re-evaluated when the mineral type changes)
        checkTicks: 1000,
        // an unpriced verdict (market history still warming after a reset) is retried sooner
        unknownRecheckTicks: 100,
        // admitted when profit (credits) is above this
        minProfit: 0,
    },
    mineralHauler: {
        // roles/hauler.js (ROADMAP 0051/0095): minimum reagent stock to
        // keep topped up in a lab reaction's input labs before another trip
        // is worth it - avoids a hauler shuttling tiny amounts back and
        // forth every tick once the lab is nearly full
        labBuffer: 500,
        pressureHigh: 0.75,
        pressureLow: 0.5,
        deathDropTtl: 10,
    },
    powerSpawn: {
        // structures/powerSpawn.js (ROADMAP 0051): off switch - processPower()
        // is otherwise unconditional whenever any Power sits in the store
        enabled: true,
    },
    // ROADMAP 0145: optional live comparison of a pure reference decision with the
    // candidate that actually acts. Off by default; capped per tick (utils/shadowBudget.js).
    shadow: {
        enabled: false,
        minBucket: 9000,
        maxCpuPerTick: 0.5,
    },
    energyLedger: {
        windowTicks: 60,
        observeWork: true,
    },
    stats: {
        // main.js cpuReport: warm intervals after which the bot prints its own CPU report once
        // per global reset (0 turns the automatic report off; cpuReport(n) in the console still works)
        autoReportIntervals: 150,
        // utils/stats.js (ROADMAP 0079): rooms.<room>.avgBarrierHits iterates
        // every rampart/wall in the room (roomCache.myStructures, no new
        // room.find, but still real work on a big base) - throttled to once
        // per this many ticks instead of every tick, same value cached in
        // between (utils/stats.js's own heap-resident barrierHitsCache).
        barrierHitsInterval: 60,
        // Memory.stats is rebuilt every N ticks (Grafana samples it once a minute)
        publishInterval: 60,
        // ROADMAP 0113: the CPU meter folds its accumulators into the published
        // snapshot (Memory.stats.cpu.meter) every N ticks, as per-tick averages
        cpuWindowTicks: 60,
        // Rolling bucket-debit window, paired with the same prior script tick.
        cpuBalanceWindowTicks: 600,
        // how many functions profile(N) publishes (heaviest by self time)
        cpuTopFunctions: 15,
    },
    rampartGates: {
        // cost of walking over a rampart when looking for the route an ally needs through the
        // walls (high: cross as few as possible)
        rampartCost: 20,
        maxOps: 4000,
    },
    profile: {
        // profile(N) closes its window early below this bucket: wrapping every engine
        // call costs several times the normal CPU and one session drained 8500 -> 900
        // (2026-10-03)
        minBucket: 100,
    },
};

function walk(node, segments) {
    let cur = node;
    for (const seg of segments) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = cur[seg];
    }
    return cur;
}

// path -> its segments, split once (heap): get() runs thousands of times a tick and
// used to split the same few dozen strings on every call.
const segmentCache = {};

// ROADMAP 0154 T5: experiment overlays, heap only - path -> { global: entry, rooms: { name: entry } },
// entry = { value, owner, generation }. utils/experiments is the only writer; Memory.settings
// (the base) is never written by an overlay. A room-scoped overlay applies only when the reader
// passes that room as get()'s third argument.
const overlays = {};
let overlayCount = 0;

function setOverlay(path, roomName, entry) {
    const slot = overlays[path] || (overlays[path] = { global: null, rooms: {} });
    const had = roomName ? !!slot.rooms[roomName] : !!slot.global;
    if (roomName) slot.rooms[roomName] = entry;
    else slot.global = entry;
    if (!had) overlayCount++;
}

// removes the overlay only when owner and generation still match; true when it did
function clearOverlay(path, roomName, owner, generation) {
    const slot = overlays[path];
    const entry = slot && (roomName ? slot.rooms[roomName] : slot.global);
    if (!entry || entry.owner !== owner || entry.generation !== generation) return false;
    if (roomName) delete slot.rooms[roomName];
    else slot.global = null;
    if (!slot.global && !Object.keys(slot.rooms).length) delete overlays[path];
    overlayCount--;
    return true;
}

function overlayOf(path, roomName) {
    const slot = overlays[path];
    if (!slot) return null;
    return (roomName && slot.rooms[roomName]) || slot.global || null;
}

// every live overlay as { path, room (null = global), entry }; [] without any
function overlayEntries() {
    if (!overlayCount) return [];
    const out = [];
    for (const path of Object.keys(overlays)) {
        const slot = overlays[path];
        if (slot.global) out.push({ path, room: null, entry: slot.global });
        for (const room of Object.keys(slot.rooms)) out.push({ path, room, entry: slot.rooms[room] });
    }
    return out;
}

function get(path, fallback, roomName) {
    if (overlayCount) {
        const entry = overlayOf(path, roomName);
        if (entry) return entry.value;
    }
    const segments = segmentCache[path] || (segmentCache[path] = path.split("."));
    const override = walk(Memory.settings, segments);
    if (override !== undefined) return override;
    const def = walk(defaults, segments);
    if (def !== undefined) return def;
    return fallback;
}

// the base value (Memory.settings, else defaults) - what get() returns without any overlay
function base(path, fallback) {
    const segments = segmentCache[path] || (segmentCache[path] = path.split("."));
    const override = walk(Memory.settings, segments);
    if (override !== undefined) return override;
    const def = walk(defaults, segments);
    return def !== undefined ? def : fallback;
}

module.exports = { get, defaults, base, setOverlay, clearOverlay, overlayOf, overlayEntries };
