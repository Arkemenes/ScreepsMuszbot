// Integrated regressions for 0132. Uses the production evaluator and allocator.
module.exports = function (project, assert) {
    const path = require("path");
    const ops = require(path.join(project, "src/utils/terminalOps"));
    const energy = ops.evaluatePurchase({ resourceType: RESOURCE_ENERGY, limit: 60 }, 59, 100000, 90000, 30);
    assert(!energy.ok && energy.effective === 590 && energy.netAmount === 10000,
        "0132: energy at 59 with 90% freight exceeds the effective ceiling 60");
    const cheap = ops.evaluatePurchase({ resourceType: RESOURCE_ENERGY, limit: 25 }, 10, 1000, 600, 30);
    assert(cheap.ok && cheap.effective === 25, "0132: inclusive effective ceiling accepts high freight without an optional cap");
    assert(!ops.evaluatePurchase({ resourceType: RESOURCE_ENERGY, limit: 25, maxBuyFreightShare: 0.5 }, 10, 1000, 600, 30).ok,
        "0132: explicit freight share remains an independent guardrail");
    assert(!ops.evaluatePurchase({ resourceType: RESOURCE_ENERGY, limit: 100 }, 1, 1000, 1000, 30).ok,
        "0132: nonpositive net energy is never bought");
    assert(ops.evaluatePurchase({ resourceType: "O", limit: 22 }, 20, 100, 20, 10).ok,
        "0132: mineral ceiling includes freight and accepts equality");
    const load = (name) => require(path.join(project, "src/utils/" + name));
    const claims = load("terminalClaims"), policy = load("resourcePolicy"), market = load("market"), census = load("census"), book = load("orderBook");
    const saved = { rooms: Game.rooms, myRooms: Game.myRooms, creeps: Game.creeps, time: Game.time, market: Game.market, get: Game.getObjectById,
        settings: Memory.settings, ops: Memory.terminalOps, craft: Memory.craft, flip: Memory.marketFlip, roomsMem: Memory.rooms,
        snapshot: market.snapshot, samples: market.samples, ready: market.historyReady, resources: RESOURCES_ALL };
    const store = (values, capacity) => {
        const s = Object.assign({}, values);
        Object.defineProperties(s, {
            getCapacity: { value: () => capacity },
            getUsedCapacity: { value: (r) => r ? s[r] || 0 : Object.values(s).reduce((n, q) => n + q, 0) },
            getFreeCapacity: { value: () => capacity - s.getUsedCapacity() },
        });
        return s;
    };
    const room = { name: "LotRoom", controller: { my: true }, find: () => [],
        storage: { id: "lot-storage", store: store({ energy: 1000000, O: 0 }, 2000000) },
        terminal: { id: "lot-terminal", cooldown: 0, store: store({ energy: 100000, O: 0 }, 300000) } };
    let orders = [], pending = [], calls, freight = 0, orderIndex = 0;
    const owner = (id) => ({ kind: "craft", id });
    const next = () => { pending.splice(0).forEach((fn) => fn()); Game.time++; room.terminal.cooldown = 0; census.build(); book.reset(); };
    const reset = () => {
        Game.time += 20; pending = []; orders = []; freight = 0; calls = { deals: [], creates: [], extends: [], cancel: [], reprice: [] };
        room.storage.store.O = 0; room.terminal.store.O = 0; room.terminal.store.energy = 100000;
        Memory.terminalOps = { nextId: 1, operations: {}, events: [], terminalBalance: {}, seenIncoming: {} };
        Memory.craft = { active: {}, stranded: {} }; Memory.marketFlip = { active: {}, committedCredits: 0 };
        Game.market = { credits: 10000000, orders: {}, incomingTransactions: [], outgoingTransactions: [],
            getAllOrders: (filter) => orders.filter((o) => !filter || o.type === filter.type && o.resourceType === filter.resourceType),
            calcTransactionCost: (q) => typeof freight === "function" ? freight(q) : freight,
            createOrder: (request) => {
                calls.creates.push(request); const id = "listing-" + ++orderIndex, tick = Game.time;
                pending.push(() => { Game.market.orders[id] = { id, created: tick, price: request.price, type: request.type, resourceType: request.resourceType,
                    roomName: request.roomName, totalAmount: request.totalAmount, remainingAmount: request.totalAmount }; Game.market.credits -= request.price * request.totalAmount * 0.05; });
                return OK;
            },
            extendOrder: (id, q) => {
                calls.extends.push({ id, q }); pending.push(() => { const o = Game.market.orders[id]; o.remainingAmount += q; o.totalAmount += q; Game.market.credits -= o.price * q * 0.05; }); return OK;
            },
            changeOrderPrice: (id, p) => {
                calls.reprice.push({ id, p }); pending.push(() => { const o = Game.market.orders[id]; Game.market.credits -= Math.max(0, p - o.price) * o.remainingAmount * 0.05; o.price = p; }); return OK;
            },
            cancelOrder: (id) => { calls.cancel.push(id); pending.push(() => delete Game.market.orders[id]); return OK; },
            deal: (id, q) => {
                calls.deals.push({ id, q }); const o = orders.find((entry) => entry.id === id), tick = Game.time, cost = Game.market.calcTransactionCost(q);
                pending.push(() => {
                    const buy = o.type === ORDER_SELL;
                    room.terminal.store[o.resourceType] = (room.terminal.store[o.resourceType] || 0) + (buy ? q : -q);
                    room.terminal.store.energy -= cost;
                    Game.market.credits += (buy ? -1 : 1) * o.price * q; o.remainingAmount -= q;
                    Game.market[buy ? "incomingTransactions" : "outgoingTransactions"].push({ transactionId: "tx-" + tick + id, order: { id }, amount: q, time: tick, to: room.name, from: room.name, resourceType: o.resourceType });
                }); return OK;
            } };
        census.build(); book.reset();
    };
    const ask = (p, q = 1000, r = "O", id = "ask") => ({ id, price: p, remainingAmount: q, type: ORDER_SELL, resourceType: r, roomName: "Remote" });
    const bid = (p, q = 1000, r = "O", id = "bid") => Object.assign(ask(p, q, r, id), { type: ORDER_BUY });
    try {
        Game.rooms = { [room.name]: room }; Game.myRooms = [room]; Game.creeps = {}; Memory.rooms = {};
        Game.getObjectById = (id) => id === room.storage.id ? room.storage : id === room.terminal.id ? room.terminal : null;
        Memory.settings = { terminalOps: { tickInterval: 1 }, terminalFuel: { enabled: false }, stockPolicy: { enabled: true, targets: { energy: 0 }, creditReserve: 0 }, swing: { enabled: false },
            // 0132 listing lots predate the 0153 policy (on by default since 2026-10-20)
            listingPolicy: { enabled: false } };
        RESOURCES_ALL = saved.resources.concat(["O"]);
        market.snapshot = () => ({ tick: Game.time, resources: { O: { buyPrice: 100, sellPrice: 20, fairPrice: 30, currentBuy: 100, currentSell: 20 }, energy: { buyPrice: 30, sellPrice: 30, fairPrice: 30 } } });
        market.samples = () => Array.from({ length: 32 }, (_, i) => ({ tick: Game.time - i, buyPrice: 100, sellPrice: 20 })); market.historyReady = () => true;
        reset();
        room.terminal.store.O = 110;
        const swing = { id: "swing", kind: "sell", policy: "swing", fixedListing: true, createListing: true, resourceType: "O", sourceRoom: room.name,
            state: "listed", amount: 110, remaining: 110, loadedAmount: 110, marketOrderId: "swing-order", listedPrice: 200, listedAmount: 110, listingFee: 1100,
            listedTick: Game.time, repriceTick: Game.time, limit: 100, transactionCost: 0 };
        Memory.terminalOps.operations.swing = swing;
        Game.market.orders["swing-order"] = { id: "swing-order", roomName: room.name, resourceType: "O", type: ORDER_SELL, price: 200, totalAmount: 110, remainingAmount: 110 };
        Memory.craft.active[room.name] = { id: "new", room: room.name, product: "O", qty: 440, buys: {}, queue: [] };
        assert(ops.saleAvailable(room, "O", owner("new")) === 0 && !ops.sellLot(room.name, "O", 110, 20, false, true, { owner: owner("new"), lotId: "product" }).ok,
            "0132: output still in labs cannot authorize sale of the preexisting swing110");
        room.terminal.store.O += 440;
        const newSale = ops.sellLot(room.name, "O", 440, 20, false, true, { owner: owner("new"), lotId: "product" });
        assert(newSale.ok && ops.operation(newSale.id).remaining === 440, "0132: transported craft440 coexists with swing110");
        orders = [bid(100)]; ops.tick(); next(); ops.tick();
        assert(calls.deals.length === 1 && calls.deals[0].q === 440 && swing.remaining === 110 && swing.marketOrderId === "swing-order",
            "0132: instantaneous craft sale takes its own 440 without the swing floor or order cancellation");
        next(); ops.tick();
        assert(room.terminal.store.O === 110 && ops.operation(newSale.id).dealtAmount === 440 && swing.listingFee === 1100,
            "0132: confirmed craft sale leaves the paid swing cargo and fee untouched");
        assert(Memory.terminalOps.events.some((e) => e.owner === "craft:new" && e.amount === 440), "0132: market events attribute quantities and proceeds to their owner");
        reset(); room.terminal.store.O = 150;
        const lotA = { owner: owner("fifo"), lotId: "A" }, lotB = { owner: owner("fifo"), lotId: "B" };
        const a = ops.sellLot(room.name, "O", 100, 20, false, true, lotA);
        const b = ops.sellLot(room.name, "O", 50, 20, false, true, lotB);
        assert(a.id === b.id && ops.operation(a.id).lots.length === 2 && ops.operation(a.id).remaining === 150,
            "0132: distinct compatible lots share one execution without imposing a new owner lock");
        orders = [bid(30, 60)]; ops.tick(); next(); ops.tick(); next(); ops.tick();
        const fifo = ops.operation(a.id);
        assert(fifo.lots[0].dealtAmount === 60 && fifo.lots[1].remaining === 50 && fifo.remaining === 90,
            "0132: a partial fill is distributed to lots in inclusion order");
        ops.cancel(a.id);
        const resumed = ops.sellLot(room.name, "O", 50, 20, false, true, lotB);
        assert(resumed.ok && resumed.id !== a.id && ops.operation(resumed.id).remaining === 50,
            "0132: cancellation releases each lot's unfilled target so its own retry can resume");
        reset(); room.terminal.store.O = 100;
        Memory.craft.active[room.name] = { id: "legacy", room: room.name, product: "O", qty: 200, sold: 20, partialOpId: "old-sale", buys: {}, queue: [] };
        Memory.terminalOps.operations["old-sale"] = { id: "old-sale", sourceRoom: room.name, kind: "sell", resourceType: "O", state: "waiting", amount: 100, remaining: 80, loadedAmount: 80, dealtAmount: 20, limit: 20, createListing: false, skipFeeCap: true };
        const adopted = ops.sellLot(room.name, "O", 120, 20, false, true, { owner: owner("legacy"), lotId: "legacy:O" });
        assert(adopted.id === "old-sale" && ops.operation(adopted.id).remaining === 100 && ops.operation(adopted.id).amount === 120,
            "0132: migration adopts existing partial quantities and appends only the genuinely new material");
        reset(); room.terminal.store.O = 100;
        const options = { owner: owner("grow"), lotId: "product" };
        const first = ops.sellLot(room.name, "O", 100, 20, true, true, options);
        const again = ops.sellLot(room.name, "O", 100, 20, true, true, options);
        assert(first.id === again.id && ops.operation(first.id).amount === 100, "0132: repeated cumulative lot target does not duplicate a sale");
        room.terminal.store.O += 50;
        const more = ops.sellLot(room.name, "O", 150, 20, true, true, options);
        assert(more.id === first.id && ops.operation(first.id).remaining === 150 && Object.keys(Memory.terminalOps.operations).length === 1,
            "0132: new compatible material grows the existing operation");
        ops.tick(); next(); ops.tick(); next(); ops.tick(); next(); ops.tick();
        const listed = ops.operation(first.id), liveId = listed.marketOrderId;
        assert(liveId && calls.creates.length === 1 && listed.marketFees > 0, "0132: residual sale creates and binds one paid listing");
        room.terminal.store.O += 25; ops.sellLot(room.name, "O", 175, 20, true, true, options);
        next(); ops.tick();
        assert(calls.extends.length === 1 && calls.extends[0].q === 25 && calls.extends[0].id === liveId,
            "0132: listing extension charges only new quantity and preserves its ID");
        ops.tick(); assert(calls.extends.length === 1, "0132: pending extension is not issued twice in one tick");
        next(); ops.tick();
        assert(listed.listedAmount === 175 && listed.remaining === 175, "0132: extension confirmation never looks like a fill");
        room.terminal.store.O += 25; ops.sellLot(room.name, "O", 200, 20, true, true, options);
        orders = [bid(100, 25)]; next(); ops.tick();
        assert(calls.deals.length === 1 && calls.deals[0].q === 25 && calls.extends.length === 1,
            "0132: new unlisted sale cargo takes an immediate profitable bid before paying to extend");
        next(); ops.tick();
        assert(listed.state === "listed" && listed.remaining === 175 && Game.market.orders[liveId].remainingAmount === 175,
            "0132: instant sale of added cargo leaves the original published quantity fully backed");
        Memory.terminalOps = JSON.parse(JSON.stringify(Memory.terminalOps)); next();
        const afterReset = ops.sellLot(room.name, "O", 200, 20, true, true, options);
        assert(afterReset.id === first.id && ops.operation(first.id).remaining === 175, "0132: lot target is idempotent after memory hydration");
        const feesBefore = ops.operation(first.id).marketFees;
        ops.operation(first.id).repriceTick = Game.time - 2000;
        Game.market.changeOrderPrice = () => ERR_INVALID_ARGS;
        ops.tick();
        assert(ops.operation(first.id).marketOrderId === liveId && calls.cancel.length === 0 && calls.creates.length === 1 && ops.operation(first.id).marketFees === feesBefore,
            "0132: failed repricing preserves listing and never pays to recreate it");
        reset(); orders = [ask(59, 100000, "energy")]; freight = 90000;
        const denied = ops.buy(room.name, "energy", 100000, 60, false, true); ops.tick();
        assert(denied.ok && calls.deals.length === 0 && ops.operation(denied.id).noCandidate.effective === 590,
            "0132: real manual energy executor rejects raw59 at net590 despite skipFeeCap");
        reset(); orders = [ask(10, 1000, "energy")]; freight = 600;
        const allowed = ops.buy(room.name, "energy", 1000, 25); ops.tick();
        assert(allowed.ok && calls.deals.length === 1, "0132: real manual executor accepts 60% energy freight at the effective ceiling");
        next(); ops.tick();
        assert(ops.operation(allowed.id).netBought === 400, "0132: confirmed energy purchase reports the actual net gain");
        reset(); orders = [ask(20)];
        const immediate = ops.buy(room.name, "O", 100, 25, true); ops.tick();
        assert(immediate.ok && calls.deals.length === 1 && calls.creates.length === 0,
            "0132: valid immediate SELL is preferred even when a cheaper BUY listing could be posted");
        reset(); orders = [ask(40)];
        ops.buy(room.name, "O", 100, 25, false); ops.tick(); next(); ops.tick();
        assert(calls.deals.length === 0 && calls.creates.length === 0, "0132: createListing false waits without publishing a BUY");
        reset(); orders = [ask(40)];
        const fallback = ops.buy(room.name, "O", 100, 25, true); ops.tick(); next(); ops.tick();
        assert(calls.creates.length === 1 && calls.creates[0].price * 1.05 <= 25, "0132: BUY fallback respects the ceiling including the listing fee");
        next(); ops.tick();
        const purchase = ops.operation(fallback.id), buyOrderId = purchase.marketOrderId;
        assert(buyOrderId, "0132: BUY listing is bound to its own created order");
        orders = [ask(20)]; next(); ops.tick();
        assert(calls.cancel.length === 1 && calls.deals.length === 0 && purchase.state === "cancellingListing",
            "0132: cancellation of a live BUY must be confirmed before an instantaneous replacement");
        ops.tick(); assert(calls.cancel.length === 1 && calls.deals.length === 0, "0132: cancellation request is idempotent while awaiting the engine");
        next(); ops.tick(); next(); ops.tick();
        assert(calls.deals.length === 1 && !Game.market.orders[buyOrderId] && purchase.marketFees > 0,
            "0132: confirmed BUY cancellation permits a replacement and retains the sunk fee ledger");
        assert(!ops.evaluatePurchase({ resourceType: "O", limit: 25, cancelledListingFees: 600 }, 20, 100, 0, 30).ok,
            "0132: sunk listing fees can make an otherwise cheap replacement exceed the ceiling");
        reset();
        const repriced = ops.buy(room.name, "O", 100, 10, true);
        ops.tick(); next(); ops.tick(); next(); ops.tick();
        const repriceOp = ops.operation(repriced.id), repriceId = repriceOp.marketOrderId;
        const originalPrice = Game.market.orders[repriceId].price;
        orders = [bid(0.999)]; repriceOp.repriceTick = Game.time - 2000;
        ops.tick(); next();
        assert(Math.abs(Game.market.orders[repriceId].price - 1) < 1e-9,
            "ARK-124: lowering a BUY price preserves its paid fees without charging another fee");
        orders = [bid(originalPrice)]; repriceOp.repriceTick = Game.time - 2000;
        ops.tick(); next();
        const repriceEffective = Game.market.orders[repriceId].price + repriceOp.orderFeesRemaining / repriceOp.remaining;
        assert(repriceEffective <= repriceOp.limit + 1e-9 && Game.market.orders[repriceId].price < originalPrice,
            "ARK-124: raising a lowered BUY accounts for accumulated and incremental fees within its effective ceiling");
        assert(repriceOp.marketOrderId === repriceId && calls.creates.length === 1 && calls.cancel.length === 0,
            "ARK-124: fee-safe repricing preserves the original order identity");
        Game.market.orders[repriceId].remainingAmount -= 50;
        room.terminal.store.O += 50;
        next(); ops.tick();
        const residualFees = repriceOp.orderFeesRemaining;
        orders = [bid(0.999)]; repriceOp.repriceTick = Game.time - 2000;
        next(); ops.tick(); next();
        orders = [bid(originalPrice)]; repriceOp.repriceTick = Game.time - 2000;
        ops.tick(); next();
        assert(repriceOp.remaining === 50 && residualFees > 0 &&
            Game.market.orders[repriceId].price + repriceOp.orderFeesRemaining / 50 <= 10 + 1e-9,
            "ARK-124: partial fills allocate paid fees to the remaining BUY before further repricing");
        repriceOp.amount += 50; repriceOp.remaining += 50;
        next(); ops.tick(); next(); ops.tick();
        assert(calls.extends.length === 1 && Game.market.orders[repriceId].remainingAmount === 100 &&
            Game.market.orders[repriceId].price + repriceOp.orderFeesRemaining / 100 <= 10 + 1e-9,
            "ARK-124: extending a repriced BUY counts past fees and its incremental fee on the enlarged balance");
        // A legacy down/up sequence may already have paid more than the new ceiling allows.
        repriceOp.orderFeesRemaining += 1000; repriceOp.marketFees += 1000;
        const legacyFees = repriceOp.marketFees;
        repriceOp.amount += 25; repriceOp.remaining += 25;
        next(); ops.tick();
        assert(calls.extends.length === 1 && repriceOp.marketFees === legacyFees && repriceOp.marketOrderId === repriceId,
            "ARK-124: excessive legacy BUY fees prevent another paid extension without cancelling the order");
        reset();
        const manual = ops.buy(room.name, "energy", 200000, 60);
        const craftBuy = ops.buy(room.name, "energy", 600, 40, false, true, { automaticPurchase: true, owner: owner("input") });
        assert(manual.ok && craftBuy.ok && claims.owner(ops.operation(manual.id)) !== claims.owner(ops.operation(craftBuy.id)),
            "0132: manual energy200k and craft input600 hold independent incoming requests");
        assert(!ops.buy(room.name, "energy", 600, 40, false, true, { automaticPurchase: true, owner: owner("input") }).ok,
            "0132: duplicate request by the same buyer remains blocked");
        reset(); room.terminal.store.O = 100;
        ops.sellLot(room.name, "O", 100, 100, false, true, { owner: owner("high"), lotId: "product" });
        room.terminal.store.O += 50;
        const low = ops.sellLot(room.name, "O", 50, 20, false, true, { owner: owner("low"), lotId: "product" });
        orders = [bid(30)]; ops.tick(); next(); ops.tick();
        assert(low.ok && calls.deals.length === 1 && calls.deals[0].q === 50, "0132: an owner with a high floor cannot block a profitable independent lot");
        reset(); room.storage.store.O = 150;
        const reserved = ops.sellLot(room.name, "O", 100, 20, false, true, { owner: owner("protected"), lotId: "product" });
        const hauler = (id) => ({ name: id, room, memory: { role: "hauler", homeRoom: room.name, terminalJob: { operationId: "stale", fromId: room.storage.id, toId: room.terminal.id, resourceType: "O", direction: "load", amount: 100 } },
            store: store({}, 100), withdraw: (from, r, q) => { calls.withdrawn = (calls.withdrawn || 0) + q; return OK; } });
        Memory.terminalOps.operations.stale = { id: "stale", kind: "sell", sourceRoom: room.name, resourceType: "O", state: "loading", amount: 50, remaining: 50, loadedAmount: 0 };
        const h1 = hauler("h1"), h2 = hauler("h2"); Game.creeps = { h1, h2 }; census.build();
        ops.runHauler(h1); ops.runHauler(h2);
        assert(reserved.ok && calls.withdrawn === 50, "0132: two stale load jobs cannot withdraw cargo reserved by another owner");
        ops.cancel(reserved.id);
        assert(policy.consumerAvailable(room, room.storage, "O") === 50, "0132: cancelling one owner releases only its cargo and preserves accepted withdrawal intents");
        reset();
        const carrying = { name: "carrier", room, memory: { role: "hauler", terminalJob: { operationId: "carried", direction: "load", fromId: room.storage.id, toId: room.terminal.id, resourceType: "O", amount: 50 } },
            store: store({ O: 50 }, 100), transfer: (destination) => { calls.destination = destination.id; return OK; } };
        Game.creeps = { carrier: carrying }; census.build();
        Game.market.orders["carried-order"] = { id: "carried-order", price: 30, totalAmount: 100, remainingAmount: 100, roomName: room.name, resourceType: "O", type: ORDER_SELL };
        Memory.terminalOps.operations.carried = { id: "carried", kind: "sell", state: "loading", resourceType: "O", sourceRoom: room.name, haulerName: "carrier", amount: 100, remaining: 100, loadedAmount: 0, marketOrderId: "carried-order", listedAmount: 100, listedPrice: 30 };
        ops.cancel("carried"); ops.runHauler(carrying);
        assert(calls.destination === room.storage.id && calls.cancel.length === 1 && ops.operation("carried").state === "cancelled" && !carrying.memory.terminalJob,
            "0132: cancelled carried cargo returns to storage, cancels its listing and never revives the sale");
        assert(ops.operation("carried").marketFees === 150 && ops.operation("carried").feeHistoryEstimated,
            "0132: legacy manual fee reconstruction is explicitly marked as estimated");
    } finally {
        Game.rooms = saved.rooms; Game.myRooms = saved.myRooms; Game.creeps = saved.creeps; Game.time = saved.time; Game.market = saved.market; Game.getObjectById = saved.get;
        Memory.settings = saved.settings; Memory.terminalOps = saved.ops; Memory.craft = saved.craft; Memory.marketFlip = saved.flip; Memory.rooms = saved.roomsMem;
        market.snapshot = saved.snapshot; market.samples = saved.samples; market.historyReady = saved.ready; RESOURCES_ALL = saved.resources; census.build(); book.reset();
    }
};
