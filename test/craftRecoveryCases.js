module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils/" + name));
    const ledger = load("craftLedger"), claims = load("terminalClaims"), market = load("market"), ops = load("terminalOps"), book = load("orderBook");
    const saved = { craft: Memory.craft, ops: Memory.terminalOps, flip: Memory.marketFlip, settings: Memory.settings,
        rooms: Game.rooms, time: Game.time, get: Game.getObjectById, market: Game.market, snapshot: market.snapshot, samples: market.samples, energyRecipe: COMMODITIES.energy };
    const store = (values) => Object.assign({ getCapacity: () => 100000, getFreeCapacity: () => 90000 }, values);
    const factory = { id: "recovery-factory", structureType: STRUCTURE_FACTORY, store: store({}), room: { name: "Recovery" } };
    const room = { name: "Recovery", controller: { my: true }, storage: { id: "recovery-storage", store: store({ energy: 20000 }) },
        terminal: { id: "recovery-terminal", store: store({ utrium_bar: 300, energy: 0 }) }, find: () => [factory] };
    const reset = () => {
        Game.time += 20; Game.rooms = { Recovery: room }; factory.store = store({});
        room.storage.store = store({ energy: 20000 }); room.terminal.store = store({ utrium_bar: 300, energy: 0 });
        Memory.craft = { active: {}, stranded: {} }; Memory.marketFlip = { active: {}, committedCredits: 0 };
        Memory.terminalOps = { operations: {}, nextId: 1, events: [] };
        Game.market = { credits: 10000000, orders: {}, calcTransactionCost: (q) => Math.ceil(q * 0.5), getAllOrders: () => [] };
        Game.getObjectById = (id) => id === factory.id ? factory : null;
        book.reset();
    };
    const chain = () => ({ id: "lot", room: room.name, product: "utrium_bar", state: "working", qty: 300, qi: 0,
        queue: [], buys: {}, ownCost: 0, est: { cost: 10000, revenue: 1000000 }, reserved: 0 });
    try {
        Memory.settings = { stockPolicy: { creditReserve: 0 }, craft: { maxChainRatio: 1 }, logistics: { reserveRatio: 0.01 } };
        reset(); let c = chain(); ledger.ensure(c, { utrium_bar: 300 }); Memory.craft.active.Recovery = c;
        Memory.craft.stranded = { old: { room: room.name, tick: 1, items: { utrium_bar: 2700, nonexistent: 900 }, spent: 90000 } };
        ledger.reconcileStranded(room);
        assert(!Memory.craft.stranded.old.items.utrium_bar && !Memory.craft.stranded.old.items.nonexistent,
            "0135: legacy stranded2700 cannot steal a confirmed active product300 or reserve nonexistent output");
        assert(ops.saleAvailable(room, "utrium_bar", { kind: "craft", id: c.id }) === 300,
            "0135: W7N49 product already in terminal is sellable after reconciliation");
        assert(claims.physicalFree(room, room.terminal, "utrium_bar") === 0,
            "0135: another consumer cannot withdraw the active lot's sale cargo");
        c = chain(); ledger.ensure(c, {}); Memory.craft.active = {};
        Memory.craft.stranded.old.items = { utrium_bar: 2700 };
        Game.market.orders.manual = { roomName: room.name, type: ORDER_SELL, resourceType: "utrium_bar", remainingAmount: 300 };
        ledger.reconcileStranded(room);
        assert(!Memory.craft.stranded.old.items.utrium_bar, "0135: legacy migration protects all published manual listing cargo");
        reset(); c = chain(); c.buys.X = { opId: "buy", qty: 100 };
        Memory.terminalOps.operations.buy = { id: "buy", kind: "buy", resourceType: "X", dealtAmount: 40, remaining: 60,
            netBought: 40, buyCredits: 400, transactionCost: 10, state: "waiting", marketFees: 20 };
        ledger.ensure(c, {}); ledger.sync(c); ledger.sync(c);
        assert(c.inventory.balances.X === 40 && !c.inventory.balances.utrium_bar, "0135: partial buy adds confirmed units once, never planned product");
        let totals = ledger.totals(c);
        assert(totals.spent === 420 && totals.energy === 10 && totals.known, "0135: legacy buyCredits reconstructs cost plus fees");
        Memory.terminalOps.events = []; Game.time += 20000;
        assert(ledger.totals(c).spent === 420, "0135: expiring metrics and a reset-sized delay do not erase lot costs");
        delete Memory.terminalOps.operations.buy;
        assert(ledger.totals(c).spent === 420 && ledger.totals(c).known, "0135: copied economics survives operation garbage collection");
        reset(); c = chain(); c.buys.energy = { opId: "energy", qty: 800 };
        Memory.terminalOps.operations.energy = { id: "energy", kind: "buy", resourceType: "energy", dealtAmount: 800,
            netBought: 400, buyCredits: 8000, transactionCost: 400, state: "completed" };
        ledger.ensure(c, {}); ledger.sync(c);
        assert(c.inventory.balances.energy === 400 && ledger.totals(c).energy === 0 && ledger.totals(c).spent === 8000,
            "0135: energy inventory is net and its freight is not charged twice");
        reset(); c = chain(); c.buys.X = { opId: "missing", qty: 100 };
        assert(!ledger.totals(c).known, "0135: missing financial evidence remains unknown instead of becoming zero cost");
        reset(); room.terminal.cooldown = 0; room.terminal.store.energy = 10000;
        market.snapshot = () => ({ resources: { X: { currentSell: 10, currentBuy: 9, fairPrice: 10 }, energy: { fairPrice: 1 } } });
        let diagnosticOrders = [{ id: "excluded", resourceType: "X", type: ORDER_SELL, price: 10, amount: 100, roomName: "Far" },
            { id: "expensive", resourceType: "X", type: ORDER_SELL, price: 30, amount: 100, roomName: "Far" }];
        Game.market.getAllOrders = () => diagnosticOrders;
        let diagnosticDeals = 0; Game.market.deal = () => { diagnosticDeals++; return OK; };
        const diagnosticBuy = Memory.terminalOps.operations.diagnostic = { id: "diagnostic", kind: "buy", sourceRoom: room.name,
            resourceType: "X", amount: 100, remaining: 100, limit: 20, state: "waiting", createdTick: Game.time,
            updatedTick: Game.time, transactionCost: 0, createListing: false, skipFeeCap: true, deadOrderIds: ["excluded"],
            error: "terminal já usado neste tick" };
        ops.tick();
        assert(diagnosticBuy.noCandidate.best.id === "expensive" && diagnosticBuy.noCandidate.reason === "effective-price-limit",
            "0135: purchase diagnostic excludes the same rejected orders as execution");
        assert(diagnosticBuy.error === "effective-price-limit", "0135: current economic wait replaces stale execution error");
        diagnosticBuy.deadOrderIds.push("expensive"); delete diagnosticBuy.noCandidate;
        Game.time += 20; book.reset(); ops.tick();
        assert(diagnosticBuy.noCandidate.ok === false && diagnosticBuy.noCandidate.reason === "orders-without-confirmed-trade" &&
            diagnosticBuy.noCandidate.best === null && diagnosticDeals === 0,
            "0135: an entirely rejected book is not diagnosed as executable or traded");
        diagnosticOrders = [{ id: "fresh", resourceType: "X", type: ORDER_SELL, price: 10, amount: 100, roomName: "Far" }];
        Game.time += 20; book.reset(); ops.tick();
        assert(diagnosticBuy.state === "settling" && !diagnosticBuy.noCandidate && !diagnosticBuy.error && diagnosticDeals === 1,
            "0135: a newly selected offer clears prior no-candidate and execution errors");
        Game.time++; ops.tick();
        assert(!diagnosticBuy.dealtAmount && diagnosticBuy.remaining === 100 && !diagnosticBuy.accounting.amount,
            "0135: an accepted intent without receipt never creates purchased stock or expense");
        reset(); c = chain(); c.product = "XLH2O"; c.soldBase = 50; c.sold = 50;
        c.queue = [{ product: "XLH2O", started: true, progress: 360 }];
        Memory.craft.active.Recovery = c;
        Memory.terminalOps.operations.oldSale = { id: "oldSale", owner: { kind: "craft", id: c.id }, kind: "sell",
            resourceType: "XLH2O", dealtAmount: 50, state: "completed", accounting: { amount: 50, credits: 1000, energy: 0, confidence: "confirmed" } };
        ledger.sync(c);
        assert(c.inventory.balances.XLH2O === 310, "0135: legacy soldBase and its historical sale debit the same50 only once");
        c = JSON.parse(JSON.stringify(c)); Memory.craft.active.Recovery = c; ledger.sync(c);
        assert(c.inventory.balances.XLH2O === 310, "0135: reset preserves reconciled legacy sale inventory");
        c.partialOpId = "newSale";
        Memory.terminalOps.operations.newSale = { id: "newSale", kind: "sell", resourceType: "XLH2O", dealtAmount: 10,
            accounting: { amount: 10, credits: 200, energy: 0, confidence: "confirmed" } };
        ledger.sync(c);
        assert(c.inventory.balances.XLH2O === 300, "0135: a later sale still debits repaired legacy inventory once");
        reset(); c = chain(); c.product = "XLH2O"; c.soldBase = 50; c.queue = [{ product: "XLH2O", progress: 360 }];
        ledger.sync(c); ledger.sync(c);
        assert(c.inventory.balances.XLH2O === 310, "0135: retired legacy sales without operation history remain deducted once");
        reset(); c = chain(); c.product = "XLH2O"; c.soldBase = 50;
        c.inventory = { version: 1, confidence: "reconstructed", balances: { XLH2O: 260, O: -500 }, costs: {}, costSeen: {},
            production: { XLH2O: 360 }, buys: {}, sales: { oldSale: 50 }, pending: [], soldBasis: 0 };
        c.economics = { operations: { oldSale: { kind: "sell", resource: "XLH2O", amount: 50, credits: 1000, energy: 0, fees: 0, confidence: "incomplete" } } };
        ledger.sync(c); ledger.sync(c);
        assert(c.inventory.balances.XLH2O === 310, "0135: already migrated v1 ledger repairs its duplicate sale once even after operation GC");
        assert(c.inventory.balances.O === 0 && c.inventory.legacyUntrackedInputs.O === 500,
            "0135: untracked consumed legacy inputs create no negative physical balance or invented remaining stock");
        reset(); c = chain(); c.product = "XLH2O"; c.soldBase = 50;
        c.inventory = { version: 1, confidence: "reconstructed", balances: { XLH2O: 310 }, costs: {}, costSeen: {},
            production: { XLH2O: 360 }, buys: {}, sales: {}, pending: [], soldBasis: 0 };
        ledger.sync(c); ledger.sync(c);
        assert(c.inventory.balances.XLH2O === 310 && c.inventory.legacyUntrackedSold === 50,
            "0135: v1 repair preserves a retired sale whose operation history is absent");
        reset(); c = chain(); c.product = "XLH2O"; c.soldBase = 50; ledger.ensure(c, { XLH2O: 75 });
        ledger.sync(c);
        assert(c.inventory.balances.XLH2O === 75 && !c.inventory.legacyReconciled,
            "0135: legacy reconciliation never rebuilds confirmed lot inventory");
        reset(); c = chain(); c.product = "widgetA"; c.queue = [{ kind: "factory", product: "widgetA", started: true, target: 2 }];
        Memory.craft.active.Recovery = c; ledger.ensure(c, { Z: 40, energy: 40 });
        ledger.production(factory, "widgetA", 1); ledger.production(factory, "widgetA", 1);
        assert(c.inventory.pending.length === 1 && !c.inventory.balances.widgetA, "0135: production intent is idempotent and is not stock before confirmation");
        factory.store.widgetA = 1; Game.time++; ledger.settle(c); ledger.settle(c);
        assert(c.inventory.balances.widgetA === 1 && c.inventory.balances.Z === 20 && c.inventory.balances.energy === 20,
            "0135: confirmed production creates one product and consumes its recipe once");
        ledger.production(factory, "widgetA", 1); Game.time++; ledger.settle(c);
        assert(c.inventory.balances.widgetA === 1, "0135: accepted production that does not happen creates no inventory");
        market.samples = (r) => Array.from({ length: 72 }, (_, tick) => ({ tick, sellPrice: 10, buyPrice: 9, sellVolume: 100000, buyVolume: 100000 }));
        const snap = { resources: { energy: { currentSell: 10, currentBuy: 9, fairPrice: 10 } } };
        market.snapshot = () => snap;
        Game.market.getAllOrders = () => [{ id: "energy-order", type: ORDER_SELL, resourceType: "energy", amount: 10000, price: 10, roomName: "Far" }];
        book.reset(); const quote = load("craftPurchaseBook").create(snap).quoteNet(room.name, "energy", 800);
        assert(quote.ok && quote.quantity === 1600 && quote.netAmount === 800 && quote.cost === 16000,
            "0135: craft requirement800 buys gross1600 at 50% freight while manual quantity semantics stay gross");
        reset(); market.snapshot = () => ({ resources: { energy: { currentSell: 10, currentBuy: 9, fairPrice: 10, sellPrice: 10, buyPrice: 9 } } });
        Game.market.getAllOrders = () => [{ id: "energy-recovery", type: ORDER_SELL, resourceType: "energy", amount: 100000, price: 10, roomName: "Far" }];
        book.reset(); c = chain(); c.queue = [{ kind: "factory", product: "widgetA", target: 20, started: true }];
        Memory.craft.active.Recovery = c; ledger.ensure(c, {}); room.storage.store.energy = 0;
        const energy = load("craftEnergy");
        assert(!energy.ready(room, c, c.queue[0]) && c.energyOpId && c.energyWait.deficit === 400,
            "0135: empty factory enters explicit energy recovery without pretending production can start");
        const count = Object.keys(Memory.terminalOps.operations).length;
        energy.ready(room, c, c.queue[0]);
        assert(Object.keys(Memory.terminalOps.operations).length === count && c.energyWait.reason === "energy-receipt-pending",
            "0135: energy retries reuse pending recovery and do not duplicate purchases");
        const paid = Memory.terminalOps.operations[c.energyOpId];
        Object.assign(paid, { state: "completed", dealtAmount: 2800, netBought: 1400,
            accounting: { amount: 2800, credits: -28000, energy: 1400, confidence: "confirmed" } });
        room.storage.store.energy = 1400; Game.time++;
        assert(energy.ready(room, c, c.queue[0]) && !c.energyWait,
            "0135: arriving net energy funds the recipe while preserving the1000 room floor");
        assert(claims.physicalFree(room, room.storage, "energy") === 0,
            "0135: funded recipe energy cannot be offered to another lot");
        c.energyOpId = null; room.storage.store.energy = 0; c.est.revenue = 1;
        c.energyCheckTick = 0; Game.time += 50;
        assert(!energy.ready(room, c, c.queue[0]) && c.energyWait.reason === "energy-margin-budget",
            "0135: replenishment cannot spend beyond the lot's economic budget");
        reset(); c = chain(); c.buys.X = { opId: "recovering-buy", qty: 100 }; c.key = room.name;
        Memory.craft.active[room.name] = c; ledger.ensure(c, {}); room.terminal.store.X = 40;
        Memory.terminalOps.operations["recovering-buy"] = { id: "recovering-buy", kind: "buy", sourceRoom: room.name,
            resourceType: "X", state: "settling", amount: 100, remaining: 60, dealtAmount: 40, netBought: 40, buyCredits: 400,
            pendingDeal: { tick: Game.time, quantity: 10, orderId: "pending" } };
        const chainModule = load("craftChain"); chainModule.cancelRoom(room.name);
        assert(Memory.craft.active[room.name] && c.state === "recovering" && Memory.terminalOps.operations["recovering-buy"].cancelRequested,
            "0135: cancel waits for an accepted trade before releasing inventory");
        Object.assign(Memory.terminalOps.operations["recovering-buy"], { state: "cancelled", pendingDeal: null });
        chainModule.tick();
        assert(!Memory.craft.active[room.name] && Memory.craft.retryAfter[room.name + ":utrium_bar"] > Game.time,
            "0135: confirmed recovery closes the chain and prevents immediate reopen loops");
        const recovered = Memory.craft.recovered.lot;
        assert(recovered && recovered.items.X === 40 && !recovered.items.utrium_bar,
            "0135: abort retains only acquired input40, not requested100 or unproduced product300");
        ledger.releaseRecovered(room);
        assert(Memory.craft.recovered.lot.items.X === 40,
            "0135: repeated migration preserves the recovered balance instead of releasing it twice");
        reset(); c = chain(); c.product = "widgetA"; c.queue = [{ kind: "factory", product: "widgetA", started: true, target: 2 }];
        ledger.ensure(c, { Z: 40, energy: 40 }); c.inventory.costs = { Z: 400, energy: 40 };
        Memory.craft.active[room.name] = c;
        ledger.production(factory, "widgetA", 1); factory.store.widgetA = 1; Game.time++; ledger.settle(c);
        assert(c.inventory.costs.widgetA === 220 && c.inventory.costs.Z === 200 && c.inventory.costs.energy === 20,
            "0135: production transfers consumed input basis to output and preserves remaining input costs");
        c.sellOpId = "partial-sale";
        Memory.terminalOps.operations[c.sellOpId] = { id: c.sellOpId, kind: "sell", resourceType: "widgetA", dealtAmount: 1,
            accounting: { amount: 1, credits: 300, energy: 10, confidence: "confirmed" }, marketFees: 5 };
        ledger.sync(c); ledger.sync(c);
        assert(c.inventory.soldBasis === 220 && c.inventory.costs.widgetA === 0 && c.inventory.balances.widgetA === 0,
            "0135: partial sale removes product basis exactly once without erasing input leftovers");
        c.energyWait = { reason: "missing" };
        assert(!ledger.canProduce(factory, "widgetA", 1), "0135: factory pauses while its energy recovery is unresolved");
        delete c.energyWait; c.inventory.production.widgetA = 2;
        assert(!ledger.canProduce(factory, "widgetA", 1), "0135: factory quota includes confirmed production and blocks excess batches");
        reset(); const first = chain(), second = chain(); first.buys.X = { opId: "one", qty: 10 }; second.buys.X = { opId: "two", qty: 10 };
        Memory.craft.active = { Recovery: first, "Recovery:lab": second };
        Memory.terminalOps.operations = { one: { id: "one" }, two: { id: "two" } };
        ledger.migrateOwners(); const aliases = [first.ownerId, second.ownerId]; ledger.migrateOwners();
        assert(first.id === "lot" && second.id === "lot" && first.ownerId !== second.ownerId && first.ownerId === aliases[0] && second.ownerId === aliases[1],
            "0135: legacy duplicate IDs retain their identifiers but get distinct stable owner aliases");
        assert(Memory.terminalOps.operations.one.owner.id !== Memory.terminalOps.operations.two.owner.id,
            "0135: owner migration rebinds each purchase to its actual chain");
        reset(); c = chain(); ledger.ensure(c, { X: 40 }); Memory.craft.active[room.name] = c;
        room.terminal.store.X = 100;
        Memory.terminalOps.operations = {
            buy: { id: "buy", kind: "buy", sourceRoom: room.name, resourceType: "X", owner: { kind: "craft", id: c.id }, state: "awaitingReceipt", remaining: 0 },
            receipt: { id: "receipt", kind: "receipt", targetRoom: room.name, resourceType: "X", parentId: "buy", state: "waiting", amount: 40, receivedAmount: 0 },
        };
        assert(claims.physicalFree(room, room.terminal, "X") === 60,
            "0135: a parent buy receipt and its chain inventory reserve the same40 units only once");
        reset(); c = chain(); c.queue = [{ kind: "factory", product: "widgetA", target: 20 }];
        Memory.craft.active[room.name] = c; ledger.ensure(c, {});
        room.storage.store.energy = 1050; room.storage.store.battery = 550;
        COMMODITIES.energy = { amount: 500, cooldown: 10, components: { battery: 50, energy: 50 } };
        market.snapshot = () => ({ resources: { energy: { currentSell: 10, currentBuy: 9, fairPrice: 10, sellPrice: 10 },
            battery: { currentSell: 10, currentBuy: 9, fairPrice: 10 } } });
        Game.market.getAllOrders = () => [{ id: "bootstrap-energy", type: ORDER_SELL, resourceType: "energy", amount: 100000, price: 10, roomName: "Far" }];
        book.reset();
        assert(!energy.ready(room, c, c.queue[0]) && c.queue[0].bootstrap && c.queue[0].product === RESOURCE_ENERGY && !c.energyOpId,
            "0135: feasible cheaper battery conversion is scheduled before an unstarted factory stage");
        assert(c.inventory.balances.battery === 50 && c.inventory.costs.battery === 450,
            "0135: battery bootstrap owns only one batch and retains its opportunity cost");
        reset(); c = chain(); ledger.ensure(c, { energy: 100 }); c.inventory.costs.energy = 1000;
        Memory.craft.active[room.name] = c;
        ledger.preempt(room, room.storage, RESOURCE_ENERGY, 30);
        assert(c.inventory.balances.energy === 70 && c.inventory.costs.energy === 700 && c.inventory.preemptedBasis === 300,
            "0135: essential energy preemption removes real inventory and preserves its cost as a lot expense");
        reset(); c = chain(); c.key = room.name; c.product = "widgetA";
        c.queue = [{ kind: "factory", product: "widgetA", started: true, startTick: Game.time, base: 0, target: 20 }];
        c.stateTick = Game.time; c.holds = {}; Memory.craft.active[room.name] = c; ledger.ensure(c, {});
        chainModule.tick();
        assert(c.materialWait && c.materialWait.reason === "component-stock-deficit" && c.materialWait.missing[0].resource === "Z",
            "0135: each factory stage diagnoses physically missing non-energy components before executing");
        reset(); c = chain(); c.stateTick = Game.time - 10000;
        ledger.ensure(c); const grace = c.recoveryGraceUntil; Game.time++; ledger.ensure(c);
        assert(grace > Game.time && c.recoveryGraceUntil === grace && c.stateTick < Game.time - 3000,
            "0135: legacy working chain gets one recovery grace window without resetting its actual progress clock");
    } finally {
        Memory.craft = saved.craft; Memory.terminalOps = saved.ops; Memory.marketFlip = saved.flip; Memory.settings = saved.settings;
        Game.rooms = saved.rooms; Game.time = saved.time; Game.getObjectById = saved.get; Game.market = saved.market;
        market.snapshot = saved.snapshot; market.samples = saved.samples; book.reset();
        if (saved.energyRecipe === undefined) delete COMMODITIES.energy; else COMMODITIES.energy = saved.energyRecipe;
    }
};
