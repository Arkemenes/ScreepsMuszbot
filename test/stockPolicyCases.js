// Integrated into smoke.js: real policy/executor with a small intent-driven world.
module.exports = function (project, assert) {
    const path = require("path");
    const load = (name) => require(path.join(project, "src/utils/" + name));
    // Earlier smoke suites reload market/terminalOps; bind this fixture to those instances.
    ["swingTrade", "terminalOps"].forEach((name) => delete require.cache[require.resolve(path.join(project, "src/utils/" + name))]);
    const policy = load("resourcePolicy"), swing = load("swingTrade"), ops = load("terminalOps");
    const market = load("market"), accounting = load("marketAccounting"), census = load("census"), book = load("orderBook");
    const haul = require(path.join(project, "src/roles/hauler"));
    const saved = { rooms: Game.rooms, myRooms: Game.myRooms, market: Game.market, creeps: Game.creeps, time: Game.time,
        get: Game.getObjectById, settings: Memory.settings, memRooms: Memory.rooms, ops: Memory.terminalOps,
        flip: Memory.marketFlip, craft: Memory.craft, swing: Memory.swing, samples: market.samples, snapshot: market.snapshot, historyReady: market.historyReady, resources: RESOURCES_ALL };
    const store = (values, cap) => {
        const s = Object.assign({}, values);
        Object.defineProperties(s, {
            getUsedCapacity: { value: (r) => r ? s[r] || 0 : Object.keys(s).reduce((n, key) => n + s[key], 0) },
            getCapacity: { value: () => cap },
            getFreeCapacity: { value: () => cap - s.getUsedCapacity() },
        });
        return s;
    };
    const room = { name: "PolicyRoom", controller: { my: true }, find: () => [],
        storage: { id: "ps", pos: new RoomPosition(20, 20, "PolicyRoom"), store: store({ energy: 50000, O: 200, Z: 1000 }, 1000000) },
        terminal: { id: "pt", cooldown: 0, pos: new RoomPosition(21, 20, "PolicyRoom"), store: store({ energy: 30000, O: 300 }, 300000) } };
    let orders = [], deals = [], creates = [], cancelCalls = [], reprices = 0;
    const refs = { energy: { buyPrice: 9, sellPrice: 10, fairPrice: 10 }, O: { buyPrice: 10, sellPrice: 12, fairPrice: 11 }, Z: { buyPrice: 10, sellPrice: 12, fairPrice: 11 } };
    let samples = 30, age = 0;
    const fresh = () => {
        Game.time += 10;
        Memory.terminalOps = { nextId: 1, operations: {}, events: [], seenIncoming: {}, terminalBalance: {} };
        Memory.marketFlip = { committedCredits: 0, active: {} };
        Memory.craft = { active: {}, stranded: {} };
        Memory.swing = undefined;
        deals = []; creates = []; cancelCalls = []; orders = [];
        book.reset(); swing.resetScan(); census.build();
    };
    try {
        Game.time = 180000000;
        Game.rooms = { PolicyRoom: room }; Game.myRooms = [room]; Game.creeps = {};
        Memory.settings = { terminalFuel: { enabled: false }, stockPolicy: { enabled: true }, swing: { test: true, scanInterval: 1 }, terminalOps: { tickInterval: 1 }, logistics: { terminalReserveRatio: 0.1 } };
        Memory.rooms = {};
        RESOURCES_ALL = saved.resources.concat(["O", "Z", "widgetA"]);
        market.samples = (r) => refs[r] ? Array.from({ length: samples }, (_, i) => ({ tick: Game.time - age - (samples - i - 1) * 3600,
            buyPrice: refs[r].buyPrice, sellPrice: refs[r].sellPrice, buyVolume: 100000, sellVolume: 100000 })) : [];
        market.snapshot = () => ({ tick: Game.time, resources: refs });
        market.historyReady = () => true;
        Game.market = { credits: 1000000, orders: {}, incomingTransactions: [], calcTransactionCost: (q) => Math.ceil(q * 0.2),
            getAllOrders: (filter) => orders.filter((o) => !filter || o.type === filter.type && o.resourceType === filter.resourceType),
            deal: (id, qty) => { deals.push({ id, qty }); return OK; },
            createOrder: (o) => { creates.push(o); return OK; },
            cancelOrder: (id) => { cancelCalls.push(id); delete Game.market.orders[id]; return OK; },
            changeOrderPrice: () => { reprices++; return OK; } };
        Game.getObjectById = (id) => id === "ps" ? room.storage : id === "pt" ? room.terminal : null;
        fresh();
        assert(policy.targets(room).energy === 100000 && policy.deficit(room, "energy") === 50000, "0124: 100k storage target is separate from 30k terminal fuel");
        assert(policy.destination(room, "O") === room.terminal && policy.destination(room, "energy") === room.storage, "0124: destinations distinguish configured consumption and other materials");
        room.terminal.store.Z = 220000;
        assert(policy.terminalFree(room) === 4700, "0124: terminal keeps 45k free beyond physical inventory");
        Memory.terminalOps.operations.pending = { id: "pending", kind: "buy", sourceRoom: room.name, resourceType: "Z", remaining: 5000, limit: 1, state: "queued" };
        assert(policy.destination(room, "O") === room.storage, "0124: pending receipts count toward capacity and overflow goes to storage");
        delete room.terminal.store.Z; fresh();
        const q = (price, amount = 100000) => ({ id: "energy-sell", resourceType: "energy", type: ORDER_SELL, roomName: "Remote", price, remainingAmount: amount });
        orders = [q(7)];
        const quoteFetches = [], originalQuoteFetch = Game.market.getAllOrders;
        Game.market.getAllOrders = (filter) => { quoteFetches.push(filter); return originalQuoteFetch(filter); };
        let candidate = swing.quote(room, "buy", "energy", Infinity);
        assert(candidate.quantity === 62501 && candidate.netAmount === 50000 && candidate.effective === 7 * 62501 / 50000,
            "0124: energy purchase is capped by net gain and priced per net unit: " + JSON.stringify(candidate));
        assert(quoteFetches.length === 1 && quoteFetches[0] && quoteFetches[0].type === ORDER_SELL &&
            quoteFetches[0].resourceType === "energy",
            "ARK-116: real swing quote requests its filtered resource book while preserving net-energy pricing");
        Game.market.getAllOrders = originalQuoteFetch;
        {
            const originalCost = Game.market.calcTransactionCost, originalDeficit = policy.deficit;
            let costCalls = 0, deficitCalls = 0;
            const mineralOrders = Array.from({ length: 100 }, (_, i) => ({ id: "mineral-" + i,
                resourceType: "O", type: ORDER_SELL, roomName: "Remote" + i, price: 1, remainingAmount: 1000 }));
            try {
                Memory.settings.stockPolicy.targets = { energy: 100000, O: 600.5 };
                Game.market.calcTransactionCost = (...args) => { costCalls++; return originalCost(...args); };
                policy.deficit = (...args) => { deficitCalls++; return originalDeficit(...args); };
                const mineral = swing.quote(room, "buy", "O", Infinity, { orders: mineralOrders });
                assert(mineral.quantity === 100 && mineral.cost === 20 && mineral.effective === 3,
                    "ARK-116: mineral purchase keeps integer deficit cap and freight-adjusted price");
                assert(costCalls === 100 && deficitCalls === 1,
                    "ARK-116: mineral quote uses one final freight per order and one deficit per selection: " + costCalls + "/" + deficitCalls);
                Memory.settings.stockPolicy.targets.O = 550;
                assert(swing.quote(room, "buy", "O", Infinity, { orders: mineralOrders }).quantity === 50,
                    "ARK-116: a second quote sees changed targets in the same tick");
                Memory.settings.stockPolicy.targets.O = 500;
                costCalls = 0;
                assert(swing.quote(room, "buy", "O", Infinity, { orders: mineralOrders }).reason === "no-good-price" && costCalls === 0,
                    "ARK-116: satisfied mineral target needs no freight calculation");
            } finally {
                delete Memory.settings.stockPolicy.targets;
                Game.market.calcTransactionCost = originalCost;
                policy.deficit = originalDeficit;
            }
        }
        orders = [q(8)]; book.reset();
        assert(swing.quote(room, "buy", "energy", Infinity).reason === "no-good-price", "0124: raw discount cannot hide energy freight above the 99% ceiling");
        {
            const originalCost = Game.market.calcTransactionCost;
            let costCalls = 0;
            Game.market.calcTransactionCost = (...args) => { costCalls++; return originalCost(...args); };
            try {
                const rejectedBuys = Array.from({ length: 100 }, (_, i) => Object.assign({}, q(10), { id: "expensive-" + i }));
                assert(swing.quote(room, "buy", "energy", Infinity, { orders: rejectedBuys }).reason === "no-good-price" && costCalls === 0,
                    "ARK-116: raw buy prices above the ceiling skip quantity search and freight: " + costCalls);
                const rejectedSells = rejectedBuys.map((o) => Object.assign({}, o, { type: ORDER_BUY, resourceType: "O", price: 9 }));
                costCalls = 0;
                assert(swing.quote(room, "sell", "O", 100, { orders: rejectedSells }).reason === "no-good-price" && costCalls === 0,
                    "ARK-116: raw sell prices below the floor skip freight: " + costCalls);
                const mixed = swing.quote(room, "buy", "energy", Infinity, { orders: rejectedBuys.concat(q(7)) });
                assert(mixed.quantity === 62501 && mixed.order.id === "energy-sell" && mixed.effective === candidate.effective,
                    "ARK-116: raw-price pruning preserves the eligible net-energy winner");
                costCalls = 0;
                const singleEnergy = swing.quote(room, "buy", "energy", Infinity, { orders: [q(7)] });
                const singleCostCalls = costCalls;
                costCalls = 0;
                const sameFreightOrders = Array.from({ length: 100 }, (_, i) => Object.assign({}, q(7), { id: "same-freight-" + i }));
                const repeatedEnergy = swing.quote(room, "buy", "energy", Infinity, { orders: sameFreightOrders });
                assert(repeatedEnergy.quantity === singleEnergy.quantity && repeatedEnergy.effective === singleEnergy.effective &&
                    costCalls === singleCostCalls,
                    "ARK-116: repeated energy freight is calculated once per destination/quantity within a quote: " + costCalls + "/" + singleCostCalls);
                costCalls = 0;
                swing.quote(room, "buy", "energy", Infinity, { orders: [q(7)] });
                assert(costCalls === singleCostCalls,
                    "ARK-116: freight reuse does not escape into the next selection in the same tick");
            } finally { Game.market.calcTransactionCost = originalCost; }
        }
        assert(swing.effective("sell", "O", 13, 100, 20, 10) === 11, "0124: immediate sale subtracts freight rather than listing fee");
        orders = [q(7)]; book.reset();
        Memory.settings.swing.scanInterval = 120;
        market.historyReady = () => false;
        assert(swing.quote(room, "buy", "energy", 1000).reason === "history-loading",
            "0124: partial hydration cannot approve a trade even with enough heap samples");
        swing.tick();
        assert(swing.status(room.name).find((o) => o.kind === "buy" && o.resourceType === "energy").reason === "history-loading",
            "0124: loading references are reported separately from insufficient history");
        market.historyReady = () => true; Game.time++;
        swing.tick();
        const firstHydrated = swing.status(room.name).find((o) => o.kind === "buy" && o.resourceType === "energy");
        assert(firstHydrated.reason === "eligible" && firstHydrated.tick === Game.time,
            "0124: hydration recovery evaluates immediately without waiting the 120-tick scan interval");
        Game.time++; swing.tick();
        assert(swing.status(room.name).find((o) => o.kind === "buy" && o.resourceType === "energy").tick === firstHydrated.tick,
            "0124: hydrated scans retain their normal 120-tick cadence");
        Memory.settings.swing.scanInterval = 1; swing.resetScan();
        samples = 29;
        assert(swing.quote(room, "buy", "energy", 1000).reason === "insufficient-history", "0124: fewer than 30 valid observations blocks trading during validation");
        samples = 30;
        assert(!!swing.quote(room, "buy", "energy", 1000).order, "0124: 30 valid observations enable simulated candidates");
        Memory.settings.swing.minSamples = 48;
        assert(swing.quote(room, "buy", "energy", 1000).reason === "insufficient-history", "0124: configurable 48-sample threshold can be restored after validation");
        delete Memory.settings.swing.minSamples;
        const originalSamples = market.samples;
        market.samples = (r) => originalSamples(r).slice(0, 29).concat(Array.from({ length: 4 }, () =>
            ({ tick: Game.time, sellPrice: null, buyPrice: 10 })));
        const missingPrices = swing.quote(room, "buy", "energy", 1000);
        assert(missingPrices.reason === "insufficient-history" && missingPrices.totalSamples === 33 &&
            missingPrices.validSamples === 29 && missingPrices.requiredSamples === 30 &&
            missingPrices.referenceSide === "sellPrice",
            "0124: blocked candidate distinguishes total observations from valid side prices");
        const sellReference = global.swingReference("O", "sell");
        assert(sellReference.referenceSide === "buyPrice" && sellReference.validSamples === 33 &&
            sellReference.energyValidSamples === 29 && sellReference.reason === "invalid-energy-history",
            "0124: live reference diagnoses the correct side and independent energy history");
        market.samples = originalSamples;
        const liveReference = global.swingReference("energy");
        assert(liveReference.validSamples === 30 && liveReference.requiredSamples === 30 &&
            liveReference.sampleAge === 0 && !liveReference.reason,
            "0124: live reference reflects current settings without waiting for swing observations");
        market.samples = (r) => originalSamples(r).slice(0, r === "energy" ? 29 : 30);
        assert(swing.quote(room, "sell", "O", 100).reason === "invalid-energy-history", "0124: freight reference also requires at least 30 energy samples");
        market.samples = originalSamples;
        age = 7201;
        assert(swing.quote(room, "buy", "energy", 1000).reason === "stale-history", "0124: old historical reference blocks trading");
        age = 0;
        Game.market.credits = 100000;
        assert(swing.quote(room, "buy", "energy", 1000).reason === "credit-reserve", "0124: opportunistic purchase preserves 100k credits");
        Game.market.credits = 1000000;
        Memory.marketFlip.committedCredits = 800000;
        Memory.terminalOps.operations.manual = { id: "manual", kind: "buy", sourceRoom: room.name, resourceType: "Z", state: "queued", remaining: 5000, limit: 10 };
        assert(accounting.available() === 50000, "0124: shared cash excludes flip/craft ledger and unrelated pending buys");
        accounting.debit(20000, Game.market.credits);
        assert(accounting.available() === 30000, "0124: accepted intents reserve cash within the same tick");
        Game.market.credits -= 20000;
        assert(accounting.available() === 30000, "0124: reflected intent costs are not charged twice");
        Game.market.credits += 20000;
        fresh();
        Memory.terminalOps.operations.inbound = { id: "inbound", kind: "transfer", sourceRoom: "Other", targetRoom: room.name, resourceType: "energy", amount: 20000, remaining: 20000, state: "queued" };
        const c = { name: "cargo", room, memory: { role: "hauler" }, store: store({ energy: 1000 }, 1500) };
        Game.creeps.cargo = c; census.build();
        assert(policy.deficit(room, "energy") === 29000, "0124: inbound transfers and cargo in haulers prevent duplicate replenishment");
        Game.creeps = {}; fresh();
        Memory.marketFlip.active.O = { room: room.name, quantity: 100, buyOpId: "fb", sellOpId: "fs" };
        Memory.terminalOps.operations.fs = { id: "fs", sourceRoom: room.name, kind: "sell", resourceType: "O", remaining: 100, state: "queued" };
        assert(policy.available(room, "O") === 400, "0124: flip stock is protected without double-counting its sell operation");
        Game.market.orders.legacySale = { type: ORDER_SELL, roomName: room.name, resourceType: "O", remainingAmount: 50, price: 20 };
        assert(policy.available(room, "O") === 350, "0124: existing unmanaged sell orders reserve their remaining stock");
        delete Game.market.orders.legacySale;
        Memory.craft.active[room.name] = { room: room.name, product: "widgetA", qty: 10, qi: 0, buys: {}, queue: [{ kind: "factory", product: "widgetA", target: 10 }] };
        assert(policy.available(room, "Z") === 800, "0124: all future craft inputs have quantitative reservations");
        room.terminal.store.widgetA = 30;
        assert(policy.available(room, "widgetA") === 20, "0124: committed final product is protected while free excess remains sellable");
        Memory.craft.stranded.s = { room: room.name, tick: Game.time, items: { O: 150 } };
        assert(policy.available(room, "O") === 250, "0124: cancelled-chain retention protects its remaining materials");
        Memory.rooms[room.name] = { factoryProduct: "widgetA" };
        assert(policy.available(room, "Z") === 0, "0124: manual production also protects inputs");
        Memory.rooms = {}; delete room.terminal.store.widgetA; fresh();
        orders = [q(7), { id: "oxygen-bid", resourceType: "O", type: ORDER_BUY, roomName: "Remote", price: 13, remainingAmount: 500 }]; book.reset();
        swing.tick();
        assert(deals.length === 0 && creates.length === 0 && Object.keys(Memory.terminalOps.operations).length === 0,
            "0124: simulation creates neither trades, listings nor terminal operations");
        assert(swing.status().some((o) => o.kind === "buy" && o.reason === "eligible") && swing.status().some((o) => o.kind === "sell" && o.reason === "eligible"),
            "0124: simulation exposes net-price buy and sale candidates");
        assert(!swing.status().some((o) => o.kind === "sell" && o.resourceType === "energy"), "0124: energy is never offered even above its target");
        const donor = { name: "Donor", controller: { my: true }, storage: { store: store({ energy: 200000 }, 1000000) }, terminal: { store: store({ energy: 30000 }, 300000) } };
        Game.myRooms = [room, donor]; Game.rooms.Donor = donor; swing.resetScan(); Game.time++;
        swing.tick();
        assert(swing.status(room.name).some((o) => o.kind === "buy" && o.reason === "internal-balance"), "0124: internal surplus is considered before buying");
        Game.myRooms = [room]; delete Game.rooms.Donor; fresh();
        const job = haul.pickMineralJob(room);
        assert(job && job.kind === "stockPolicy" && job.to === room.terminal && job.resourceType !== "energy", "0124: haulers evacuate unused storage material to terminal");
        const firstBuy = ops.buy(room.name, "O", 200, 10, false, true);
        const op = ops.operation(firstBuy.id);
        op.state = "settling"; op.transactionCost = 0;
        op.pendingDeal = { quantity: 100, cost: 20, price: 8, tick: Game.time - 1, terminalBefore: 200, orderId: "one" };
        room.terminal.store.O = 300; ops.tick();
        assert(op.dealtAmount === 100 && op.remaining === 100 && op.state === "queued", "0124: a partial non-energy receipt cannot complete the remaining buy");
        Game.time++; op.state = "settling";
        op.pendingDeal = { quantity: 100, cost: 20, price: 8, tick: Game.time - 1, terminalBefore: 300, orderId: "two" };
        room.terminal.store.O = 400; ops.tick();
        assert(op.state === "completed" && op.receivedAmount === 200 && room.terminal.store.O === 400, "0124: completed unused purchase remains in terminal without unloading");
        Game.time++; ops.tick();
        assert(!Object.values(Memory.terminalOps.operations).some((o) => o.kind === "receipt" && o.resourceType === "O" && accounting.active(o)),
            "0124: retained stock causes no storage-terminal circulation");
        fresh(); orders = [q(7)]; book.reset();
        const effectiveBuy = ops.buy(room.name, "energy", 1000, 9.9, false, true, { policy: "swing", effectiveLimit: true, automaticPurchase: true });
        orders[0].price = 8; ops.tick();
        assert(deals.length === 0 && ops.operation(effectiveBuy.id).state === "cancelled", "0124: executor revalidates effective price and abandons an ineligible immediate buy");
        fresh(); room.storage.store.energy = 101000; orders = [q(7)]; book.reset();
        const satisfied = ops.buy(room.name, "energy", 1000, 9.9, false, true, { policy: "swing", effectiveLimit: true, automaticPurchase: true });
        ops.tick();
        assert(deals.length === 0 && ops.operation(satisfied.id).state === "cancelled", "0124: target filled by another path cannot trigger another purchase");
        room.storage.store.energy = 50000;
        fresh(); room.terminal.store.O = 400;
        const listing = ops.sell(room.name, "O", 100, 10.1, true, true, { policy: "swing", effectiveLimit: true, fixedListing: true });
        const sale = ops.operation(listing.id);
        sale.state = "listing"; sale.loadedAmount = 100;
        ops.tick();
        assert(creates.length === 1 && creates[0].price * 0.95 > 10.1 && sale.listingFee === creates[0].price * 100 * 0.05,
            "0124: listing price includes the upfront 5% fee and records it");
        const fixedPrice = sale.listedPrice;
        Game.market.orders.fixed = { id: "fixed", created: sale.listedTick, type: ORDER_SELL, resourceType: "O", roomName: room.name, price: fixedPrice, remainingAmount: 100 };
        Game.time += 1300; refs.O.buyPrice = 20; ops.tick();
        assert(sale.marketOrderId === "fixed" && sale.listedPrice === fixedPrice && reprices === 0 && creates.length === 1,
            "0124: fixed listing preserves its approved price when historical reference rises");
        refs.O.buyPrice = 10;
        Game.market.orders.fixed.remainingAmount = 60; room.terminal.store.O -= 40;
        Game.time++; ops.tick();
        assert(sale.remaining === 60 && sale.listedFilled === 40, "0124: partial own-order fills release only the sold quantity");
        Game.time = sale.listedTick + 1209600;
        const originalCancel = Game.market.cancelOrder;
        Game.market.cancelOrder = () => -6;
        swing.expire(); swing.expire();
        assert(sale.state !== "cancelled" && Memory.swing.noRelist[room.name + ":O"] === 60,
            "0124: failed expiration cancellation preserves the order and does not duplicate retention");
        Game.market.cancelOrder = originalCancel; swing.expire();
        assert(sale.state === "cancelled" && cancelCalls.includes("fixed") && Memory.swing.noRelist[room.name + ":O"] === 60,
            "0124: listing expires after 1209600 ticks and marks the remaining lot against relisting");
        room.storage.store.O = 0; room.terminal.store.O = 60; orders = []; book.reset(); swing.resetScan(); swing.tick();
        assert(swing.status(room.name).some((o) => o.resourceType === "O" && o.reason === "expired-lot"), "0124: an expired lot cannot repeatedly pay listing fees");
        Memory.craft.stranded.temporary = { room: room.name, tick: Game.time, items: { O: 30 } };
        Game.time++; swing.resetScan(); swing.tick();
        assert(Memory.swing.noRelist[room.name + ":O"] === 60, "0124: temporary commitments cannot erase expired-lot retention");
        delete Memory.craft.stranded.temporary;
        orders = [{ id: "later-bid", resourceType: "O", type: ORDER_BUY, roomName: "Remote", price: 13, remainingAmount: 60 }];
        Game.time++; book.reset(); swing.resetScan(); swing.tick();
        assert(swing.status(room.name).some((o) => o.resourceType === "O" && o.reason === "eligible"), "0124: expired lot can still be sold immediately at a good net price");
        swing.sold(room.name, "O", 60);
        assert(!Memory.swing.noRelist[room.name + ":O"], "0124: sold expired stock does not block listing a future lot");
        // Replenishment shares a resource with consumption; pending amounts, not
        // the presence of an operation, determine the remaining usage deficit.
        fresh(); orders = [q(7)]; book.reset(); refs.O.buyPrice = 10;
        room.storage.store.energy = 50000; room.terminal.store.energy = 30000;
        Memory.terminalOps.operations.inbound = { id: "inbound", kind: "transfer", sourceRoom: "Remote",
            targetRoom: room.name, resourceType: "energy", amount: 554, remaining: 554, state: "queued" };
        swing.tick();
        const residual = swing.status(room.name).find((o) => o.kind === "buy" && o.resourceType === "energy");
        assert(residual.reason === "eligible" && residual.deficit === 49446 && residual.netAmount === 49446,
            "0124: a 554-energy inbound transfer reduces the deficit instead of blocking replenishment");
        Memory.terminalOps.operations.inbound.remaining = 50000;
        Memory.terminalOps.operations.inbound.amount = 50000;
        Game.time++; swing.resetScan(); swing.tick();
        assert(swing.status(room.name).find((o) => o.kind === "buy" && o.resourceType === "energy").reason === "target-satisfied",
            "0124: incoming transfers covering the usage target prevent duplicate replenishment");

        fresh(); orders = [q(7)]; book.reset();
        const craftBuy = ops.buy(room.name, "energy", 1000, 9.9, false, true);
        Memory.craft.active[room.name] = { room: room.name, product: "XUH2O", qty: 100,
            queue: [], buys: { energy: { qty: 1000, opId: craftBuy.id } } };
        Memory.settings.swing.test = false; swing.tick();
        const buys = ops.activeForRoom(room.name).filter((o) => o.kind === "buy" && o.resourceType === "energy");
        assert(craftBuy.ok && buys.length === 2 && buys.some((o) => o.policy === "swing"),
            "0124: usage replenishment coexists with a craft purchase of the same energy");
        Game.time++; swing.resetScan(); swing.tick();
        assert(ops.activeForRoom(room.name).filter((o) => o.kind === "buy" && o.resourceType === "energy").length === 2,
            "0124: accepted concurrent purchases are counted before another replenishment scan");
        Memory.settings.swing.test = true;

        const concurrentTarget = { name: "ConcurrentTarget", controller: { my: true }, find: () => [],
            storage: { store: store({ energy: 0 }, 1000000) }, terminal: { store: store({ energy: 0 }, 300000) } };
        Game.rooms[concurrentTarget.name] = concurrentTarget;
        fresh(); orders = [q(7)]; book.reset();
        const outgoing = ops.transfer(room.name, concurrentTarget.name, "energy", 25000);
        assert(!ops.buy(room.name, "energy", 1000, 9.9, false, true).ok,
            "0124: legacy manual purchases retain their resource-conflict semantics");
        const fuelProtected = ops.buy(room.name, "energy", 1000, 9.9, false, true,
            { policy: "swing", effectiveLimit: true, automaticPurchase: true });
        const shipment = ops.operation(outgoing.id);
        shipment.state = "loading"; shipment.loadedAmount = 30000;
        ops.tick();
        assert(outgoing.ok && fuelProtected.ok && deals.length === 0,
            "0124: replenishment cannot spend energy physically staged for another transfer");

        fresh(); orders = [q(7)]; book.reset();
        const simultaneousBuy = ops.buy(room.name, "energy", 1000, 9.9, false, true,
            { policy: "swing", effectiveLimit: true, automaticPurchase: true });
        const simultaneousSend = ops.transfer(room.name, concurrentTarget.name, "energy", 1000);
        assert(simultaneousBuy.ok && simultaneousSend.ok,
            "0124: a transfer may also be created after a same-resource replenishment purchase");
        const send = ops.operation(simultaneousSend.id);
        send.state = "atTerminal"; send.loadedAmount = 1200;
        let sends = 0;
        const oldSend = room.terminal.send;
        room.terminal.send = () => { sends++; return OK; };
        try {
            ops.tick(); ops.tick();
            assert(deals.length === 1 && sends === 0 && ops.operation(simultaneousBuy.id).state === "settling",
                "0124: concurrent logical work accepts only one physical terminal intent in a tick");
            Game.market.incomingTransactions = [{ transactionId: "concurrent-buy", to: room.name,
                resourceType: "energy", amount: 1000, time: Game.time, order: { id: "energy-sell" } }];
            Game.time++; room.terminal.store.energy += 800;
            ops.tick();
            assert(sends === 1 && ops.operation(simultaneousBuy.id).dealtAmount === 1000,
                "0124: the queued transfer proceeds after the concurrent buy settles on the next tick");
    
        fresh(); Game.creeps = {}; census.build();
        Memory.settings.terminalFuel = { enabled: true };
        Memory.settings.stockPolicy.targets = { energy: 100000, O: 1000 };
        room.storage.store.energy = 50000; room.terminal.store.energy = 200; room.terminal.store.O = 0;
        orders = [{ id: "dynamic-O", resourceType: "O", type: ORDER_SELL, roomName: "Remote", price: 5, remainingAmount: 1000 }];
        const dynamicBuy = ops.buy(room.name, "O", 1000, 11.88, false, true, { policy: "swing", effectiveLimit: true });
        ops.tick();
        assert(dynamicBuy.ok && deals.length === 1 && deals[0].id === "dynamic-O",
            "0124 fuel: executor funds exact freight without adding the whole forecast reserve");
        fresh(); room.terminal.store.energy = 1000;
        orders = [{ id: "later-O", resourceType: "O", type: ORDER_SELL, roomName: "Remote", price: 5, remainingAmount: 1000 }, q(7, 1000)];
        const earlierO = ops.buy(room.name, "O", 1000, 11.88, false, true, { policy: "swing", effectiveLimit: true });
        const priorityEnergy = ops.buy(room.name, "energy", 1000, 9.9, false, true, { policy: "swing", effectiveLimit: true });
        ops.tick();
        assert(earlierO.ok && priorityEnergy.ok && deals.length === 1 && deals[0].id === "energy-sell",
            "0124 fuel: executor prioritizes energy replenishment over an earlier optional purchase");
        fresh(); Memory.settings.stockPolicy.targets = { energy: 100000 };
        room.energyAvailable = room.energyCapacityAvailable = 1000;
        room.terminal.store.energy = 1000;
        Memory.terminalOps.operations.fuel = { id: "fuel", kind: "buy", resourceType: "energy",
            sourceRoom: room.name, state: "queued", remaining: 1000, fuelQuote: { tick: Game.time, cost: 1000 } };
        let withdrawn = 0, deliveredTo = null;
        const staleHauler = { name: "staleFuel", room, pos: new RoomPosition(20, 20, room.name),
            memory: { role: "hauler", mineralJob: { kind: "stockPolicy", fromId: "pt", toId: "ps",
                resourceType: "energy", amount: 1000 } }, store: store({}, 1000),
            withdraw: (from, r, qty) => { withdrawn += qty; return OK; }, moveTo: () => OK };
        Game.creeps = { staleFuel: staleHauler }; census.build();
        haul.run(staleHauler);
        assert(withdrawn === 0, "0124 fuel: stale surplus job cannot withdraw newly protected freight");
        fresh(); room.terminal.store.energy = 0;
        staleHauler.store.energy = 500;
        staleHauler.memory.mineralJob = { kind: "stockPolicy", fromId: "ps", toId: "pt",
            resourceType: "energy", amount: 500, loaded: true };
        staleHauler.transfer = (to) => { deliveredTo = to.id; return OK; };
        census.build(); haul.run(staleHauler);
        assert(deliveredTo === "ps", "0124 fuel: obsolete preventive cargo returns to storage");
    } finally { room.terminal.send = oldSend; }
        delete Game.rooms[concurrentTarget.name];

        fresh(); room.terminal.store.energy = 30000;
        const oldBuy = ops.buy(room.name, "energy", 1000, 9.9, false, true);
        const newBuy = ops.buy(room.name, "energy", 1000, 9.9, false, true,
            { policy: "swing", effectiveLimit: true, automaticPurchase: true });
        const oldParent = ops.operation(oldBuy.id), newParent = ops.operation(newBuy.id);
        oldParent.state = "awaitingReceipt"; oldParent.remaining = 0; oldParent.dealtAmount = 1000;
        oldParent.lastDealOrderId = "older-order"; oldParent.lastDealTick = Game.time - 10;
        newParent.state = "settling";
        newParent.pendingDeal = { quantity: 1000, cost: 200, price: 7, tick: Game.time - 1,
            terminalBefore: 30000, orderId: "energy-sell" };
        Game.market.incomingTransactions = [{ transactionId: "identified-buy", to: room.name,
            resourceType: "energy", amount: 1000, time: Game.time - 1, order: { id: "energy-sell" } }];
        ops.tick();
        assert(newParent.dealtAmount === 1000 && newParent.remaining === 0 && oldParent.receivedAmount === 0,
            "0124: transaction evidence confirms the right concurrent purchase even after consumption masks its store delta");
        assert(Object.values(Memory.terminalOps.operations).some((o) => o.kind === "receipt" && o.parentId === newBuy.id),
            "0124: concurrent purchase receipts are linked by order and tick rather than the first resource match");
        // 0130: incoming craft material must not take a paid listing's stock.
        fresh(); Game.creeps = {}; census.build(); Memory.rooms = {};
        Memory.settings.stockPolicy.targets = { energy: 100000 };
        room.storage.store.O = 0; room.terminal.store.O = 22324; room.terminal.store.energy = 30000;
        const paidSale = { id: "paid-O", sourceRoom: room.name, targetRoom: null, kind: "sell",
            resourceType: "O", amount: 22324, remaining: 22324, loadedAmount: 22324,
            state: "listed", policy: "swing", fixedListing: true, createListing: true,
            limit: 44.22083, marketOrderId: "paid-order", listedTick: Game.time - 100,
            listedPrice: 46.549, listedAmount: 22324, listingFee: 51958.264 };
        Memory.terminalOps.operations[paidSale.id] = paidSale;
        Game.market.orders[paidSale.marketOrderId] = { id: paidSale.marketOrderId, type: ORDER_SELL,
            resourceType: "O", roomName: room.name, remainingAmount: 22324, price: paidSale.listedPrice };
        assert(!ops.lockConflict("buy", room.name, null, "O", false, { automaticPurchase: true }),
            "0130: an automatic purchase can coexist with a paid listing of the same resource");
        assert(ops.lockConflict("buy", room.name, null, "O"),
            "0130: legacy manual buys keep their explicit same-resource lock");
        assert(ops.lockConflict("sell", room.name, null, "O"),
            "0130: two outbound owners cannot claim the same listed resource");
        const bought = ops.buy(room.name, "O", 540, 13, false, true, { automaticPurchase: true });
        assert(bought.ok, "0130: a real automatic buy opens alongside the paid oxygen listing");
        delete Memory.terminalOps.operations[paidSale.id];
        assert(!ops.lockConflict("sell", room.name, null, "O") &&
            !ops.lockConflict("transfer", room.name, "Other", "O"),
            "0130: an automatic incoming purchase also permits a later reserved outgoing operation");
        Memory.terminalOps.operations[paidSale.id] = paidSale;
        assert(ops.lockConflict("buy", room.name, null, "O", false, { automaticPurchase: true }),
            "0130: duplicate ordinary automatic purchases remain locked");
        Memory.craft.active[room.name] = { id: "new-craft", room: room.name, product: "widgetA", qty: 10,
            state: "buying", qi: 0, buys: { O: { opId: bought.id, qty: 540 } }, queue: [] };
        assert(policy.commitments(room).O === 22324 && policy.available(room, "O", paidSale.id) === 22324,
            "0130: an owned pending buy does not reserve stock belonging to the existing listing");
        const purchased = ops.operation(bought.id);
        purchased.remaining = 340; purchased.dealtAmount = 200; room.terminal.store.O += 200;
        assert(policy.commitments(room).O === 22524 && policy.available(room, "O", paidSale.id) === 22324,
            "0130: only the received part of a purchase is reserved as physical craft stock");
        ops.tick();
        assert(paidSale.state === "listed" && paidSale.marketOrderId === "paid-order" &&
            paidSale.listingFee === 51958.264 && cancelCalls.length === 0 && creates.length === 0 && reprices === 0,
            "0130: partial incoming craft stock preserves the paid listing, price and fee");
        purchased.remaining = 0; purchased.dealtAmount = 540; purchased.state = "completed";
        room.terminal.store.O += 340;
        assert(policy.commitments(room).O === 22864 && policy.available(room, "O", paidSale.id) === 22324,
            "0130: the fully received lot is protected independently of the original sale");
        assert(policy.consumerAvailable(room, room.terminal, "O") === 540,
            "0130: consumers can withdraw the purchased excess but not the original listing");
        Memory.terminalOps.operations = { [paidSale.id]: paidSale, [purchased.id]: purchased };
        let consumerWithdrawal = 0;
        const consumer = { name: "productionConsumer", room, pos: new RoomPosition(21, 20, room.name),
            memory: { role: "hauler", mineralJob: { kind: "factoryComponent", fromId: "pt", toId: "factory",
                resourceType: "O", amount: 1500, chain: true } }, store: store({}, 1500),
            withdraw: (from, resource, quantity) => { consumerWithdrawal += quantity; return OK; }, moveTo: () => OK };
        Game.creeps = { productionConsumer: consumer }; census.build();
        load("nonEnergyLogistics").claim(consumer);
        haul.run(consumer);
        assert(consumerWithdrawal === 540,
            "0130: a real hauler caps input withdrawal to the purchased lot without taking listed stock (" + consumerWithdrawal + ", " + JSON.stringify(consumer.memory) + ")");
        assert(policy.consumerAvailable(room, room.terminal, "O") === 0,
            "0130: accepted withdrawal intents reserve the excess against other consumers in the same tick");
        Game.creeps = {}; census.build();
        room.terminal.store.O -= 540; Game.time++; ops.tick();
        assert(paidSale.state === "listed" && cancelCalls.length === 0 && policy.consumerAvailable(room, room.terminal, "O") === 0,
            "0130: consuming the purchased lot preserves the paid listing and leaves its cargo inaccessible");
        room.terminal.store.O += 540;
        assert(policy.consumerAvailable(room, room.terminal, "O") === 540,
            "0130: consumer withdrawal reservations reset on the next tick");
        delete Memory.craft.active[room.name];
        Memory.marketFlip.active.O = { room: room.name, quantity: 540, buyOpId: bought.id };
        purchased.remaining = 340; purchased.state = "queued";
        assert(policy.commitments(room).O === 22524,
            "0130: flip uses the same incoming versus physical reservation rule");
        purchased.sourceRoom = "UnrelatedRoom";
        assert(policy.commitments(room).O === 22864,
            "0130: another owner's incoming operation cannot fund a reservation");

        // Opening a real craft chain must also leave the original listing intact.
        fresh(); room.storage.store.O = 0; room.terminal.store.O = 22324;
        assert(policy.consumerAvailable(room, room.terminal, "O") === 0,
            "0130: an unmanaged live order also protects its terminal stock");
        delete Game.market.orders[paidSale.marketOrderId];
        Memory.terminalOps.operations[paidSale.id] = Object.assign({}, paidSale, { state: "queued", loadedAmount: 0 });
        assert(policy.consumerAvailable(room, room.terminal, "O") === 0,
            "0130: consumers also protect outgoing inventory before its staging bookkeeping runs");
        Game.market.orders[paidSale.marketOrderId] = { id: paidSale.marketOrderId, type: ORDER_SELL,
            resourceType: "O", roomName: room.name, remainingAmount: 22324, price: paidSale.listedPrice };
        Memory.terminalOps.operations[paidSale.id] = paidSale; paidSale.state = "listed";
        const craftPath = path.join(project, "src/utils/craftChain"), cachedCraft = require.cache[require.resolve(craftPath)];
        const originalCommodities = COMMODITIES;
        try {
            refs.O.currentSell = refs.O.sellPrice; refs.Z.currentSell = refs.Z.sellPrice;
            COMMODITIES = Object.assign({}, COMMODITIES, { coordination_product: { amount: 10, cooldown: 1, components: { O: 540 } } });
            delete require.cache[require.resolve(craftPath)];
            const chain = require(craftPath);
            const candidate = { product: "coordination_product", qty: 10, steps: [{ product: "coordination_product", kind: "factory", batches: 1 }],
                buys: { O: 540 }, owns: {}, spend: 6480, cost: 6480, cash: 6480, revenue: 20000, margin: 0.01, ratio: 2, profit: 13520, T: 1 };
            const opened = chain.open(room, candidate);
            assert(opened.ok && Memory.craft.active[room.name].state === "buying",
                "0130: craftChain opens a profitable production lot despite an existing input listing (" + JSON.stringify(opened) + ")");
            assert(policy.available(room, "O", paidSale.id) === 22324,
                "0130: craftChain's future ingredient demand does not encroach on the paid listing");
            ops.tick();
            assert(paidSale.state === "listed" && cancelCalls.length === 0,
                "0130: executing terminal work after craft open never cancels the existing listing");
            delete Memory.craft.active[room.name];
            const pendingOp = ops.operation(Object.values(Memory.terminalOps.operations).find(o => o.kind === "buy").id);
            pendingOp.state = "cancelled";
            const secondBlocker = ops.buy(room.name, "Z", 20, 13, false, true, { automaticPurchase: true });
            const countBefore = Object.keys(Memory.terminalOps.operations).length;
            const refused = chain.open(room, Object.assign({}, candidate, { buys: { O: 540, Z: 20 }, spend: 6720 }));
            assert(secondBlocker.ok && !refused.ok && refused.reason === "buy-refused:Z" &&
                refused.detail && Object.keys(Memory.terminalOps.operations).length === countBefore,
                "0130: craft preflights every purchase and reports its cause before creating partial operations");
        } finally {
            COMMODITIES = originalCommodities;
            if (cachedCraft) require.cache[require.resolve(craftPath)] = cachedCraft;
            else delete require.cache[require.resolve(craftPath)];
            delete Game.market.orders[paidSale.marketOrderId];
        }
    } finally {
        Game.rooms = saved.rooms; Game.myRooms = saved.myRooms; Game.market = saved.market; Game.creeps = saved.creeps; Game.time = saved.time; Game.getObjectById = saved.get;
        Memory.settings = saved.settings; Memory.rooms = saved.memRooms; Memory.terminalOps = saved.ops; Memory.marketFlip = saved.flip; Memory.craft = saved.craft; Memory.swing = saved.swing;
        market.samples = saved.samples; market.snapshot = saved.snapshot; market.historyReady = saved.historyReady; RESOURCES_ALL = saved.resources;
        book.reset(); swing.resetScan(); census.build();
    }
};
