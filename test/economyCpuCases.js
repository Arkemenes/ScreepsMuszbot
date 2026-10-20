module.exports = function (project, assert) {
    const path = require("path");
    const load = (name) => require(path.join(project, name));
    const policy = load("src/utils/labPolicy"), stock = load("src/utils/resourcePolicy");
    const fuel = load("src/utils/terminalFuel"), slots = load("src/utils/labSlots");
    const research = load("docs/lab-search/recipes.cjs");
    const saved = { game: Game, memory: Memory, reactions: REACTIONS, times: REACTION_TIME,
        commitments: stock.commitments, consumer: stock.consumerAvailable, terminalFree: stock.terminalFree };
    try {
        global.Memory = { settings: { craft: { labPolicy: true, wideLabs: true, labStrategy: "auto" } },
            rooms: {}, craft: { active: {} }, terminalOps: { operations: {} } };
        global.Game = Object.assign({}, saved.game, { time: 199200000, creeps: {} });
        const terminal = load("src/utils/terminalOps"), prices = load("src/utils/market");
        {
            const previousMarket=Game.market, previousOps=Memory.terminalOps;
            let opScans=0, ownScans=0;
            const emptyRoom={name:"CpuConsumerBounds",storage:{id:"bound-storage",store:{O:0}},
                terminal:{id:"bound-terminal",store:{O:0}}};
            try {
                Memory.terminalOps={operations:new Proxy({reserved:{id:"reserved",kind:"sell",state:"waiting",
                    sourceRoom:emptyRoom.name,resourceType:"O",remaining:4,loadedAmount:0}},
                    {ownKeys:v=>{opScans++;return Reflect.ownKeys(v);}})};
                Game.market={orders:new Proxy({}, {ownKeys:v=>{ownScans++;return Reflect.ownKeys(v);}})};
                Game.time++;
                assert(stock.consumerAvailable(emptyRoom,emptyRoom.storage,"O")===0 &&
                    stock.consumerAvailable(emptyRoom,emptyRoom.terminal,"O")===0 && opScans===0 && ownScans===0,
                    "ARK-116: empty mineral sources skip reservation and market-order scans");
                emptyRoom.storage.store.O=6;
                assert(stock.consumerAvailable(emptyRoom,emptyRoom.storage,"O")===2 && opScans===1 && ownScans===1,
                    "ARK-116: same-tick stock arrival is checked against outgoing reservations");
                stock.recordConsumerWithdraw(emptyRoom.storage,"O",6);
                const beforePending=opScans;
                assert(stock.consumerAvailable(emptyRoom,emptyRoom.storage,"O")===0 && opScans===beforePending,
                    "ARK-116: pending withdrawals exhausting the source also skip reservation scans");
                Game.time++;
                assert(stock.consumerAvailable(emptyRoom,emptyRoom.storage,"O")===2 && opScans===beforePending+1,
                    "ARK-116: next-tick withdrawal ledger resets without retaining an empty-source result");
            } finally {Game.market=previousMarket;Memory.terminalOps=previousOps;}
        }
        const books=load("src/utils/orderBook");
        const savedBookMarket=Game.market;
        try {
            let bookReads=0, fullReads=0;
            const sampleOrders=[{id:"buyO",type:ORDER_BUY,resourceType:"O"},
                {id:"sellO",type:ORDER_SELL,resourceType:"O"},{id:"buyH",type:ORDER_BUY,resourceType:"H"}];
            Game.market={getAllOrders:(filter)=>{bookReads++;if(!filter)fullReads++;
                return filter?sampleOrders.filter(o=>o.type===filter.type && o.resourceType===filter.resourceType):sampleOrders;}};
            Game.time++;books.reset();
            const first=books.matching(ORDER_BUY,"O");
            books.matching(ORDER_BUY,"O");
            assert(first.length===1 && first[0].id==="buyO" && bookReads===1 && fullReads===0,
                "ARK-116: single-resource quotes fetch only their filtered book once per tick");
            books.matching(ORDER_SELL,"O");books.matching(ORDER_BUY,"H");
            assert(bookReads===3,"ARK-116: distinct resource and order sides use separate filtered books");
            Game.time++;books.all();const beforeReuse=bookReads;
            const matchingFull=books.matching(ORDER_BUY,"O");
            assert(bookReads===beforeReuse && fullReads===1 && matchingFull[0].id==="buyO",
                "ARK-116: quotes reuse a full market snapshot already fetched in the same tick");
            books.reset();books.matching(ORDER_BUY,"O");
            assert(bookReads===beforeReuse+1,"ARK-116: explicit book reset clears filtered snapshots");
            Game.market.getAllOrders=()=>[{id:"replacement",type:ORDER_BUY,resourceType:"O"}];
            assert(books.matching(ORDER_BUY,"O")[0].id==="replacement",
                "ARK-116: replacing the market source invalidates same-tick filtered snapshots");
        } finally {Game.market=savedBookMarket;books.reset();}
        const originalSnapshot = prices.snapshot;
        try {
            Memory.settings.terminalOps = { tickInterval: 1 };
            const tradeRoom = { name: "CpuOrderFilter", controller: { my: true },
                storage: { store: {} }, terminal: { cooldown: 1, store: { energy: 10000, O: 100 } } };
            Game.rooms = { [tradeRoom.name]: tradeRoom };
            let freightCalls = 0, orders = [];
            Game.market = { orders: {}, incomingTransactions: [], outgoingTransactions: [], credits: 100000,
                getAllOrders: () => orders, calcTransactionCost: () => { freightCalls++; return 1; } };
            prices.snapshot = () => ({ tick: Game.time, resources: {
                O: { fairPrice: 10, buyPrice: 10, sellPrice: 10 },
                energy: { fairPrice: 0.1, buyPrice: 0.1, sellPrice: 0.1 } } });
            const runTrade = (kind, extra = {}) => {
                freightCalls = 0; Game.time++;
                const op = { id: "cpu-order", kind, state: "atTerminal", sourceRoom: tradeRoom.name,
                    resourceType: "O", amount: 100, remaining: 100, loadedAmount: 100,
                    limit: 10, energyFairPrice: 0.1, createListing: false, ...extra };
                Memory.terminalOps = { operations: { [op.id]: op } };
                terminal.tick();
                return op;
            };
            for (const kind of ["buy", "sell"]) {
                orders = Array.from({ length: 99 }, (_, i) => ({ id: "rejected" + i,
                    roomName: "W1N1", price: kind === "buy" ? 11 : 9, remainingAmount: 100 }));
                orders.push({ id: "dead", roomName: "W1N1", price: 10, remainingAmount: 100 },
                    { id: "eligible", roomName: "W1N1", price: 10, remainingAmount: 100 });
                const op = runTrade(kind, { deadOrderIds: ["dead"], limit: kind === "buy" ? 10.001 : 10 });
                assert(op.fuelQuote && op.fuelQuote.cost === 1 && op.error === "terminal em cooldown",
                    "ARK-116: " + kind + " preserves the eligible order and execution state with its current price semantics");
                assert(freightCalls === 1,
                    "ARK-116: raw-price " + kind + " computes freight only for the eligible order");
            }
            orders = [{ id: "below-limit", roomName: "W1N1", price: 9, remainingAmount: 100 }];
            const absent = runTrade("sell");
            assert(absent.state === "waiting" && absent.noCandidate.best.price === 9 && freightCalls === 1,
                "ARK-116: no-candidate diagnostics still score the best price-rejected order");
            orders = [{ id: "effective", roomName: "W1N1", price: 10, remainingAmount: 100 },
                { id: "raw-rejected", roomName: "W1N1", price: 8, remainingAmount: 100 }];
            const effective = runTrade("sell", { effectiveLimit: true, limit: 9, skipFeeCap: true });
            assert(effective.fuelQuote && freightCalls === 1,
                "ARK-116: effective limits keep freight-dependent price evaluation");
            orders = Array.from({length:100},(_,i)=>({id:"shared-room-"+i,
                roomName:"W1N1",price:10+i/100,remainingAmount:100}));
            const sharedFreight=runTrade("sell",{skipFeeCap:true});
            assert(sharedFreight.fuelQuote.cost===1 && freightCalls===1,
                "ARK-116:100 eligible orders with the same shipment share one exact freight calculation");
            orders.push({id:"different-quantity",roomName:"W1N1",price:11,remainingAmount:50});
            Game.market.calcTransactionCost=(quantity)=>{freightCalls++;return quantity===50?5000:1;};
            const quantityRank=runTrade("sell",{skipFeeCap:true});
            assert(freightCalls===2 && quantityRank.fuelQuote.cost===1,
                "ARK-116: distinct shipment quantities never reuse another freight value");
            Game.market.calcTransactionCost=(quantity)=>{freightCalls++;return quantity===50?5000:2;};
            const refreshedFreight=runTrade("sell",{skipFeeCap:true});
            assert(freightCalls===2 && refreshedFreight.fuelQuote.cost===2,
                "ARK-116: each new order selection computes a fresh freight cache");
            orders = [{ id: "far", roomName: "W2N2", price: 12, remainingAmount: 100 },
                { id: "near", roomName: "W1N1", price: 11, remainingAmount: 100 }];
            Game.market.calcTransactionCost = (qty, from, to) => { freightCalls++; return to === "W2N2" ? 3000 : 1; };
            const ranked = runTrade("sell", { skipFeeCap: true });
            assert(ranked.fuelQuote.cost === 1 && freightCalls === 2,
                "ARK-116: eligible orders retain freight-adjusted ranking rather than raw-price ranking");
            const empty = runTrade("sell", { loadedAmount: 0,
                noCandidate: { tick: Game.time, best: null }, noCandidateLogTick: Game.time });
            assert(empty.state === "waiting" && freightCalls === 0,
                "ARK-116: zero cargo avoids freight scoring while respecting diagnostic cadence");
        } finally {
            prices.snapshot = originalSnapshot;
            delete Memory.settings.terminalOps;
            Memory.terminalOps = { operations: {} };
            Game.rooms = saved.game.rooms; Game.market = saved.game.market;
        }
        global.REACTIONS = {}; global.REACTION_TIME = {};
        for (const [p, recipe] of Object.entries(research.recipes)) {
            for (const [a, b] of [recipe.inputs, recipe.inputs.slice().reverse()]) (REACTIONS[a] ||= {})[b] = p;
            REACTION_TIME[p] = recipe.cooldown;
        }
        const item = policy.descriptor(research.order("XGH2O").map((p) => ({kind:"lab",product:p,batches:20})));
        const first = policy.planFor("wide-live", item, slots.SLOT_NUMBERS);
        const phaseSteps = research.order("XLH2O").map((p) => ({ kind: "lab", product: p, batches: 20 }));
        const phaseRecipe = (p) => ({ components: Object.fromEntries(research.recipes[p].inputs.map((r) => [r, 5])),
            cooldown: research.recipes[p].cooldown });
        slots.resetCache();
        const phaseTree = slots.treeFromSteps("XLH2O", phaseSteps, phaseRecipe);
        const rootInputs = phaseTree.inputs;
        let shapeReads = 0;
        Object.defineProperty(phaseTree, "inputs", { enumerable: true, get() { shapeReads++; return rootInputs; } });
        const smallPhases = slots.planPhases(phaseTree, slots.SLOT_NUMBERS,
            { work: slots.workFromSteps(phaseSteps, phaseRecipe) });
        const firstSearches = slots.perf.searches;
        shapeReads = 0;
        const resizedSteps = phaseSteps.map((s) => ({ ...s, batches: 40 }));
        const resizedPhases = slots.planPhases(phaseTree, slots.SLOT_NUMBERS,
            { work: slots.workFromSteps(resizedSteps, phaseRecipe) });
        assert(smallPhases.ok && resizedPhases.ok && resizedPhases.T > smallPhases.T && slots.perf.searches === firstSearches,
            "ARK-116: resizing a lab lot reuses geometric search while updating production time");
        const originalPhases = JSON.stringify(resizedPhases);
        resizedPhases.phases[0].inputs[0] = -99;
        const intact = slots.planPhases(phaseTree, slots.SLOT_NUMBERS,
            { work: slots.workFromSteps(resizedSteps, phaseRecipe) });
        assert(JSON.stringify(intact) === originalPhases,
            "ARK-116: consumer mutations cannot corrupt cached phase geometry");
        const resizedWork = slots.workFromSteps(resizedSteps, phaseRecipe);
        const slowerWork = Object.fromEntries(Object.entries(resizedWork).map(([p, w]) => [p, { ...w, cooldown: w.cooldown + 10 }]));
        assert(slots.planPhases(phaseTree, slots.SLOT_NUMBERS, { work: slowerWork }).T > intact.T,
            "ARK-116: cooldown changes still update timing with cached geometry");
        Memory.settings.craft.parallelLabs = false;
        const beforeSequential = slots.perf.searches;
        shapeReads = 0;
        const sequential = slots.planPhases(phaseTree, slots.SLOT_NUMBERS, { work: resizedWork, strategy: "waves" });
        assert(sequential.ok && !sequential.parallel && sequential.strategy === "waves" && slots.perf.searches > beforeSequential,
            "ARK-116: parallel settings invalidate search and explicit strategy remains live");
        delete Memory.settings.craft.parallelLabs;
        const partial = slots.planPhases(phaseTree, [1, 2, 3], { work: resizedWork });
        assert(partial.ok && partial.phases.every((p) => p.inputs.concat(p.out).every((s) => [1, 2, 3].includes(s))),
            "ARK-116: phase geometry cache respects partial RCL lab layouts");
        Memory.settings.craft.phaseCacheEntries = 1;
        slots.resetCache();
        slots.planPhases(phaseTree, slots.SLOT_NUMBERS, { work: resizedWork });
        slots.planPhases(phaseTree, [1, 2, 3], { work: resizedWork });
        shapeReads = 0;
        const beforeEvicted = slots.perf.searches;
        slots.planPhases(phaseTree, slots.SLOT_NUMBERS, { work: resizedWork });
        assert(slots.perf.searches > beforeEvicted, "ARK-116: phase geometry cache evicts at its configured bound");
        delete Memory.settings.craft.phaseCacheEntries;
        const core = load("src/utils/labPlanModel"), originalEvaluate = core.evaluate, originalCpu = Game.cpu;
        let virtualCpu = 0, modelSteps = 0;
        Game.time++;
        Game.cpu = { ...originalCpu, bucket: 10000, getUsed: () => virtualCpu };
        core.evaluate = function* () {
            for (let i = 0; i < 100; i++) { virtualCpu += 0.6; modelSteps++; yield null; }
            return { status: "invalid" };
        };
        try {
            const budgetScenario = { product: item.product, qty: 100, targets: item.targets, built: slots.SLOT_NUMBERS,
                labs: [], stock: { ...research.rawStock(item.product, 100), CPU_BUDGET_PROBE: Game.time },
                bandwidth: 4, delay: 50, buffer: 500, refillRatio: 0.5 };
            const budgetJob = policy.request(item, budgetScenario, false);
            const filter = Array.prototype.filter;
            let candidateFilters = 0;
            Array.prototype.filter = function (...args) {
                if (this[0] && typeof this[0] === "object" && "generator" in this[0]) candidateFilters++;
                return filter.apply(this, args);
            };
            try { policy.poll(budgetJob); }
            finally { Array.prototype.filter = filter; }
            assert(candidateFilters === 1,
                "ARK-128: a policy poll filters candidate generators once rather than once per simulation step");
            assert(modelSteps === 2 && virtualCpu < 1.3,
                "ARK-116: expensive simulation steps stop at the first exhausted per-tick CPU budget");
            policy.poll(budgetJob);
            assert(modelSteps === 2, "ARK-116: another poll cannot spend the same tick budget again");
            Game.time++; virtualCpu = 0;
            policy.poll(budgetJob);
            assert(modelSteps === 4, "ARK-116: budget-limited policy evaluation resumes next tick");
        } finally { core.evaluate = originalEvaluate; Game.cpu = originalCpu; }
        const timingLabs = Array.from({ length: 10 }, () => ({ role: null, amount: 0, next: 0, ready: 0 }));
        const timingPhase = { products: ["OH"], alternatives: [
            ["O", "H", ...Array(8).fill("OH")], ["O", "H", ...Array(7).fill("OH"), null] ] };
        const originalSort = Array.prototype.sort;
        let scheduleSorts = 0, timingChoice;
        Array.prototype.sort = function (...args) { scheduleSorts++; return originalSort.apply(this, args); };
        try { timingChoice = core.layoutFor(timingPhase, timingLabs, { OH: 3000 }, { OH: 0 }, { OH: { cooldown: 20 } }, 0, 4, 50); }
        finally { Array.prototype.sort = originalSort; }
        assert(JSON.stringify(timingChoice) === JSON.stringify(timingPhase.alternatives[0]) && scheduleSorts < 50,
            "ARK-116: layout scoring keeps the fastest layout without sorting once per reaction batch");
        for (const cooldown of [1, 7, 20, 0.5]) for (const amount of [5, 6, 25, 105]) {
            timingLabs.forEach((lab, i) => { lab.role = i % 2 ? "OH" : "H"; lab.amount = i * 3; lab.next = i * 7; lab.ready = i; });
            const phase = { products: ["OH"], alternatives: [
                Array.from({ length: 10 }, (_, i) => i < 4 ? "OH" : "H"),
                Array.from({ length: 10 }, (_, i) => i >= 4 ? "OH" : "H") ] };
            const rank = (layout) => {
                const count = Math.ceil(amount / 5), events = [];
                let movement = 0, changes = 0;
                timingLabs.forEach((lab, i) => {
                    if (lab.role !== layout[i]) { movement += lab.amount; if (lab.role && layout[i]) changes++; }
                    if (layout[i] === "OH") {
                        const start = Math.max(3, lab.next, lab.role && lab.role !== "OH" ? 3 + 13 : lab.ready);
                        for (let n = 0; n < count; n++) events.push(start + n * cooldown);
                    }
                });
                events.sort((a, b) => a - b);
                return { score: Math.max(3, events[count - 1]) + movement / 4 + (changes ? 13 : 0), movement };
            };
            const expected = phase.alternatives.slice().sort((a, b) => rank(a).score - rank(b).score || rank(a).movement - rank(b).movement)[0];
            assert(JSON.stringify(core.layoutFor(phase, timingLabs, { OH: amount }, { OH: 0 }, { OH: { cooldown } }, 3, 4, 13)) === JSON.stringify(expected),
                "ARK-116: layout choice matches independent event enumeration for staggered producers and cooldown " + cooldown + "/" + amount);
        }
        const initial = JSON.stringify(first);
        for (let i = 0; i < 100; i++) { Game.time++; policy.planFor("wide-live", item, slots.SLOT_NUMBERS); }
        assert(first === policy.planFor("wide-live", item, slots.SLOT_NUMBERS) && JSON.stringify(first) === initial,
            "fallback lab plan reuses immutable geometry across ticks without changing its layouts");
        const bigger = { ...item, targets: Object.fromEntries(item.order.map((p) => [p, 200])) };
        const bigPlan = policy.widePlan(bigger, slots.SLOT_NUMBERS);
        assert(bigPlan !== first && bigPlan.window === 200 && bigPlan.phases[0] === first.phases[0],
            "lot resizing updates the plan window while reusing quantity-independent lab phases");
        const reduced = { ...item, targets: { ...item.targets, [item.order[0]]: 0 } };
        assert(policy.widePlan(reduced, slots.SLOT_NUMBERS).phases.length === first.phases.length - 1,
            "zero targets remove phases even when fallback geometry is already cached");
        assert(policy.widePlan(item, [1, 2, 3]).phases.every((phase) => phase.layout.length === 3),
            "fallback cache respects the actual built lab geometry");
        for (let i = 0; i < 100; i++) {
            Game.time++;
            global.REACTIONS = JSON.parse(JSON.stringify(REACTIONS));
            global.REACTION_TIME = { ...REACTION_TIME };
            assert(policy.widePlan(item, slots.SLOT_NUMBERS) === first,
                "ARK-116: engine-style constant recreation preserves the fallback plan across ticks");
        }
        const oldReactions = REACTIONS, firstProduct = item.order[0];
        const beforeChange = policy.recipeMap()[firstProduct].inputs;
        global.REACTIONS = JSON.parse(JSON.stringify(REACTIONS));
        delete REACTIONS[beforeChange[0]][beforeChange[1]];
        delete REACTIONS[beforeChange[1]][beforeChange[0]];
        (REACTIONS.A ||= {}).B = firstProduct;
        assert(policy.widePlan(item, slots.SLOT_NUMBERS) !== first &&
            policy.recipeMap()[firstProduct].inputs.join(",") === "A,B",
            "ARK-116: an actual recipe change invalidates cached geometry");
        global.REACTIONS = oldReactions;
        const beforeCooldown = policy.widePlan(item, slots.SLOT_NUMBERS);
        REACTION_TIME[firstProduct]++;
        assert(policy.recipeMap()[firstProduct].cooldown === REACTION_TIME[firstProduct] &&
            policy.widePlan(item, slots.SLOT_NUMBERS) === beforeCooldown,
            "ARK-116: cooldown changes update timing without discarding geometry");
        Memory.settings.craft.policyCacheEntries = 1;
        const retained = policy.widePlan(item, slots.SLOT_NUMBERS);
        for (let i = 0; i < 8; i++) policy.widePlan({ ...item,
            targets: Object.fromEntries(item.order.map((p) => [p, 300 + i])) }, slots.SLOT_NUMBERS);
        assert(policy.widePlan(item, slots.SLOT_NUMBERS) !== retained,
            "fallback plan cache evicts entries at its configured bound");

        const room = { name: "CpuEconomy", storage: { store: { energy: 1 } }, terminal: { store: { energy: 1 } } };
        Memory.settings.stockPolicy = { targets: { energy: 100000, O: 50 }, rooms: { CpuEconomy: { targets: { energy: 0, O: -1 } } } };
        assert(stock.target(room, "energy") === 0 && !stock.used(room, "O") && stock.target(room,"missing") === undefined,
            "single-resource target lookup preserves zero, invalid override and absent resource semantics");
        Memory.settings.stockPolicy.rooms.CpuEconomy.targets.O = 100;
        assert(stock.used(room,"O") && stock.target(room,"O") === 100,
            "single-resource target lookup observes in-place config changes in the same tick");
        let enumerations = 0;
        Memory.settings.stockPolicy.targets = new Proxy({ energy: 100000, O: 50 }, {
            ownKeys(value) { enumerations++; return Reflect.ownKeys(value); }
        });
        for (let i = 0; i < 100; i++) stock.used(room, "O");
        assert(enumerations === 0, "resource membership checks do not enumerate the whole target map");
        delete Memory.settings.stockPolicy.rooms;
        Memory.terminalOps.operations = Object.fromEntries(Array.from({length:8}, (_,i) => ["op"+i,
            {id:"op"+i,kind:"sell",state:"waiting",sourceRoom:room.name,resourceType:"O",policy:"swing",
                remaining:10,fuelQuote:{tick:Game.time,cost:1}}]));
        let calls = 0;
        stock.commitments = () => { calls++; return {}; };
        assert(fuel.plan(room).forecast === 0 && calls === 1,
            "scarce fuel forecast computes optional reservations once for all sale candidates");
        room.terminal.store.energy = 100;
        assert(fuel.plan(room).forecast === 2 && calls === 2,
            "a fresh fuel forecast observes same-tick inventory changes without stale reservation caching");
        let forecastScans = 0;
        Memory.terminalOps.operations = new Proxy(Memory.terminalOps.operations, {
            ownKeys(value) { forecastScans++; return Reflect.ownKeys(value); }
        });
        const released = fuel.releasable(room);
        assert(released === 88 && forecastScans === 1,
            "ARK-116: fuel release shares one forecast for the reserve and keep floor");
        room.terminal.store.energy = 1;
        assert(fuel.releasable(room) === 0 && forecastScans === 2,
            "ARK-116: the next release decision observes same-tick balance changes");
        stock.commitments = saved.commitments;
        const hauler = load("src/roles/hauler");
        const originalKeep = fuel.keep;
        try {
            let fuelReads = 0, keepFloor = 0;
            fuel.keep = () => { fuelReads++; return keepFloor; };
            const pickupRoom = { name: "CpuTerminalPickup", find: () => [],
                storage: { id: "pickup-storage", store: { energy: 0 } },
                terminal: { id: "pickup-terminal", store: { energy: 50,
                    getCapacity: () => 300000 } } };
            Memory.rooms[pickupRoom.name] = {};
            const picker = { name: "CpuTerminalPicker", room: pickupRoom,
                memory: { role: "hauler" },
                store: { getFreeCapacity: () => 200 },
                pos: { findClosestByRange: () => null, findClosestByPath: () => null } };
            Game.time++;
            assert(hauler.pickLoad(picker) === null && fuelReads === 0 &&
                Memory.rooms[pickupRoom.name].terminalLedger.withdrawable === 50,
                "ARK-116: sub-minimum terminal pickup skips fuel forecast but still updates its ledger");
            Memory.rooms[pickupRoom.name].terminalLedger = { amount: 0, withdrawable: 0, sinceTick: Game.time };
            pickupRoom.terminal.store.energy = 500; Game.time++;
            assert(hauler.pickLoad(picker) === null && fuelReads === 0 &&
                Memory.rooms[pickupRoom.name].terminalLedger.amount === 500 &&
                Memory.rooms[pickupRoom.name].terminalLedger.withdrawable === 0,
                "ARK-116: uncredited terminal deposits skip fuel forecast without being made withdrawable");
            delete Memory.rooms[pickupRoom.name].terminalLedger;
            pickupRoom.terminal.store.energy = 100; keepFloor = 30; Game.time++;
            assert(hauler.pickLoad(picker) === null && fuelReads === 1,
                "ARK-116: pickup at the minimum still applies the current protected fuel floor");
            keepFloor = 0;
            const releasedPickup = hauler.pickLoad(picker);
            assert(releasedPickup && releasedPickup.id === pickupRoom.terminal.id &&
                releasedPickup.amount === 100 && releasedPickup.dest === "storage" && fuelReads === 2,
                "ARK-116: same-tick fuel changes remain visible when pickup can qualify");
            Game.time++; pickupRoom.terminal.store.energy = 200;
            Game.market = { incomingTransactions: [{ to: pickupRoom.name, resourceType: RESOURCE_ENERGY,
                amount: 100, time: Game.time }] };
            const incomingPickup = hauler.pickLoad(picker);
            assert(incomingPickup.amount === 200 && fuelReads === 3,
                "ARK-116: credited incoming energy is evaluated normally on the next tick");
        } finally { fuel.keep = originalKeep; Game.market = saved.game.market; }
        {
            const savedFuelKeep = fuel.keep, savedLookup = Game.getObjectById;
            let keepReads = 0, deliveryKeep = 60, delivery;
            const deliveryRoom = { name:"CpuFuelDelivery", find:()=>[],
                storage:{id:"fuel-storage",store:{energy:100,getFreeCapacity:()=>1000}},
                terminal:{id:"fuel-terminal",store:{energy:10,getFreeCapacity:()=>1000}} };
            Memory.rooms[deliveryRoom.name]={};
            const carrier={name:"CpuFuelCarrier",room:deliveryRoom,pos:new RoomPosition(25,25,deliveryRoom.name),
                body:[],getActiveBodyparts:()=>0,
                memory:{role:"hauler",mineralJob:{kind:"stockPolicy",resourceType:RESOURCE_ENERGY,
                    toId:deliveryRoom.terminal.id,loaded:true}},
                store:{energy:50,getUsedCapacity:()=>50,getFreeCapacity:()=>0},
                transfer:(target,resourceType,amount)=>{delivery={target,amount};return OK;}};
            try {
                fuel.keep=()=>{keepReads++;return deliveryKeep;};
                Game.getObjectById=(id)=>id===deliveryRoom.terminal.id?deliveryRoom.terminal:savedLookup(id);
                Game.time++;hauler.run(carrier);
                assert(keepReads===1 && delivery.target===deliveryRoom.terminal && delivery.amount===50,
                    "ARK-116: terminal energy delivery shares one fuel forecast for destination and amount");
                deliveryKeep=100;deliveryRoom.terminal.store.energy=60;hauler.run(carrier);
                assert(keepReads===2 && delivery.target===deliveryRoom.terminal && delivery.amount===40,
                    "ARK-116: next mineral execution sees a changed fuel floor and balance in the same tick");
                deliveryKeep=30;hauler.run(carrier);
                assert(keepReads===3 && delivery.target===deliveryRoom.storage && delivery.amount===50,
                    "ARK-116: newly funded terminal redirects its energy cargo to storage without duplicate forecasts");
            } finally {fuel.keep=savedFuelKeep;Game.getObjectById=savedLookup;}
        }
        const packedRoom = { name: "CpuPackedTerminal", storage: { id: "packed-storage",
            store: { energy: 0, ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => ["unused" + i, 10])) } },
            terminal: { id: "packed-terminal", store: { energy: 0 } } };
        Object.defineProperty(packedRoom.terminal.store, "getCapacity", { value: () => 300000 });
        Memory.rooms[packedRoom.name] = {};
        Memory.settings.stockPolicy = { enabled: true, targets: { energy: 0 } };
        let capacityReads = 0, freeCapacity = 0;
        stock.terminalFree = (selectedRoom, exclude, floor) => {
            capacityReads++;
            assert(selectedRoom === packedRoom && floor === 10,
                "ARK-116: stock selection supplies its existing fuel floor to capacity evaluation");
            return freeCapacity;
        };
        const scansBefore = forecastScans;
        assert(hauler.stockPolicyJob(packedRoom) === null && capacityReads === 1 && forecastScans - scansBefore <= 3,
            "ARK-116: twenty blocked resources share capacity and bound operation scans including terminal bookkeeping");
        freeCapacity = 100;
        const freshJob = hauler.stockPolicyJob(packedRoom);
        assert(freshJob && freshJob.resourceType === "unused0" && capacityReads === 2,
            "ARK-116: the next stock selection observes capacity restored within the same tick");
        stock.terminalFree = saved.terminalFree;
        const feedRoom = { name: "CpuReagentSelection", find: () => [],
            storage: { id: "feed-storage", store: {} }, terminal: { id: "feed-terminal", store: {} } };
        const labs = {};
        const reactions = Array.from({length:6}, (_,i) => {
            for (const id of ["a"+i,"b"+i,"out"+i]) labs[id] = { id, mineralType: null, store: {} };
            return {a:"O",b:"H",product:"OH",input1:"a"+i,input2:"b"+i,output:"out"+i};
        });
        Memory.settings.stockPolicy.enabled = true;
        Memory.rooms[feedRoom.name] = {labReactions:reactions};
        Memory.craft.active = {fixture:{room:feedRoom.name}};
        Game.rooms = { [feedRoom.name]: feedRoom }; Game.getObjectById = (id) => labs[id];
        let reads = 0;
        stock.consumerAvailable = () => { reads++; return 0; };
        assert(hauler.pickChainFeedJob(feedRoom) === null && reads === 4,
            "six lab reactions query unavailable stock once per resource and source during one job selection");
        Game.time++;
        assert(hauler.pickChainFeedJob(feedRoom) === null && reads === 8,
            "a new hauler job selection rechecks reagent stock rather than retaining an old missing-source result");
        Object.defineProperty(feedRoom.terminal.store,"getCapacity",{value:()=>300000});
        Object.defineProperty(feedRoom.storage.store,"getFreeCapacity",{value:()=>1000000});
        Game.time++;reads=0;
        assert(hauler.pickMineralJob(feedRoom)===null && reads===4,
            "ARK-116: one mineral decision does not rescan missing reagents after its fresh chain-feed scan");
        Game.time++;reads=0;
        hauler.pickChainFeedJob(feedRoom);
        stock.consumerAvailable=()=>{reads++;return 100;};
        feedRoom.storage.pos=new RoomPosition(20,20,feedRoom.name);
        Object.values(labs).forEach(lab=>{lab.pos=new RoomPosition(21,20,feedRoom.name);});
        const refreshedJob=hauler.pickMineralJob(feedRoom);
        assert(refreshedJob && refreshedJob.kind==="labReagent" && reads>4,
            "ARK-116: earlier cached chain absence does not suppress a later newly available reagent job");
        assert(!JSON.stringify(Memory).includes("wide-live"), "derived fallback geometry stays outside persistent Memory");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory;
        global.REACTIONS = saved.reactions; global.REACTION_TIME = saved.times;
        stock.commitments = saved.commitments; stock.consumerAvailable = saved.consumer;
        stock.terminalFree = saved.terminalFree;
    }
};
