"use strict";
// Two real terminalOps runs. Only the book-reuse switch differs; all decisions stay live.
module.exports = function (project, assert) {
    const path = require("path");
    const { compareSequences } = require("./equivalence/compare");
    const counts = { direct: [], shared: [] };
    const effects = [];
    const factory = (reuse) => (world) => {
        global.RESOURCES_ALL = ["energy", "O", "pixel"];
        const NativeDate = Date;
        global.Date = class extends NativeDate { static now() { return 1800000000000; } };
        const load = (name) => require(path.join(project, "src/utils", name));
        const market = load("market"), census = load("census"), book = load("orderBook");
        let ops = load("terminalOps");
        const store = (O, energy, capacity) => {
            const s = { O, energy };
            Object.defineProperties(s, { getCapacity: { value: () => capacity }, getUsedCapacity: { value: () => s.O + s.energy },
                getFreeCapacity: { value: () => capacity - s.O - s.energy } });
            return s;
        };
        const rooms = Array.from({ length: world.rooms }, (_, i) => ({ name: "R" + i, controller: { my: true }, find: () => [],
            storage: { id: "s" + i, store: store(0, 1000000, 2000000) }, terminal: { id: "t" + i, cooldown: 0, store: store(1000, 100000, 300000) } }));
        let pending = [], orderId = 0, fetches = 0;
        const calls = [], sourceBook = [
            { id: "ask", type: ORDER_SELL, resourceType: "O", price: 12, amount: 1000, remainingAmount: 1000, roomName: "Remote" },
            { id: "bid", type: ORDER_BUY, resourceType: "O", price: 8, amount: 1000, remainingAmount: 1000, roomName: "Remote" }];
        global.Memory = { settings: { listingPolicy: { enabled: true }, terminalOps: { reuseOrderBook: reuse, tickInterval: 1, operationRetentionTicks: 1000 },
            stockPolicy: { enabled: true, targets: { energy: 0 }, creditReserve: 0 }, terminalFuel: { enabled: false }, swing: { enabled: false } }, rooms: {},
            craft: { active: {}, stranded: {} }, marketFlip: { active: {}, committedCredits: 0 } };
        const fetch = (filter) => { fetches++; return sourceBook.filter((o) => !filter || o.type === filter.type && o.resourceType === filter.resourceType); };
        global.Game = { time: 40000, rooms: Object.fromEntries(rooms.map((r) => [r.name, r])), myRooms: rooms, creeps: {},
            getObjectById: (id) => rooms.flatMap((r) => [r.storage, r.terminal]).find((s) => s.id === id),
            cpu: { getUsed: () => 0, limit: 20, bucket: 10000 },
            market: { credits: 10000000, orders: {}, incomingTransactions: [], outgoingTransactions: [], calcTransactionCost: () => 0, getAllOrders: fetch,
                createOrder(request) {
                    calls.push(["create", request]); const id = "own" + ++orderId, tick = Game.time;
                    pending.push(() => { this.orders[id] = Object.assign({ id, created: tick, createdTimestamp: Date.now(), amount: request.totalAmount,
                        remainingAmount: request.totalAmount }, request); this.credits -= request.price * request.totalAmount * 0.05; }); return OK;
                },
                extendOrder(id, amount) { calls.push(["extend", id, amount]); pending.push(() => {
                    const o = this.orders[id]; this.credits -= o.price * amount * 0.05; o.totalAmount += amount; o.remainingAmount += amount; o.amount += amount;
                }); return OK; },
                changeOrderPrice(id, price) { calls.push(["reprice", id, price]); pending.push(() => { this.orders[id].price = price; }); return OK; },
                cancelOrder(id) { calls.push(["cancel", id]); pending.push(() => { delete this.orders[id]; }); return OK; },
            } };
        market.snapshot = () => ({ tick: Game.time, resources: { O: { buyPrice: 10, sellPrice: 20, fairPrice: 15 }, energy: { fairPrice: 1 } } });
        census.build();
        for (const room of rooms) {
            const sell = ops.sell(room.name, "O", 100, 10, true, true, { owner: { kind: "craft", id: room.name } });
            const buy = ops.buy(room.name, "O", 100, 5, true, true, { automaticPurchase: true });
            for (const response of [sell, buy]) {
                if (!response.ok) throw new Error(response.error);
                const op = ops.operation(response.id); op.state = "listing"; op.loadedAmount = 100;
            }
        }
        return (step) => {
            pending.splice(0).forEach((fn) => fn()); Game.time++;
            if (step === "grow") for (const op of Object.values(Memory.terminalOps.operations)) if (op.kind === "sell") {
                op.remaining += 20; op.amount += 20; op.loadedAmount += 20;
            }
            if (["create-reset", "off-reset", "cancel-reset"].includes(step)) {
                Memory.settings.listingPolicy.enabled = false;
                global.Memory = JSON.parse(JSON.stringify(Memory));
                delete require.cache[require.resolve(path.join(project, "src/utils/terminalOps"))];
                ops = load("terminalOps");
            }
            if (step === "bind") Memory.settings.listingPolicy.enabled = true;
            if (step === "manual") {
                Memory.settings.listingPolicy.enabled = true;
                sourceBook[0].price = 13;
                const first = Object.values(Memory.terminalOps.operations).find((o) => o.kind === "sell");
                Game.market.orders[first.marketOrderId].price = 50;
            }
            if (step === "provider") Game.market.getAllOrders = (filter) => fetch(filter);
            if (step === "deadline") for (const op of Object.values(Memory.terminalOps.operations)) if (op.listingLifecycle)
                op.listingLifecycle.createdAt -= 8 * 86400000;
            if (step === "empty") { Game.market.credits = 0; rooms.forEach((r) => { r.terminal.store.O = 0; }); }
            census.build(); ops.tick();
            world.observed = { operations: Memory.terminalOps, orders: Game.market.orders, credits: Game.market.credits, calls,
                stores: rooms.map((r) => ({ name: r.name, stock: { O: r.terminal.store.O, energy: r.terminal.store.energy } })) };
            if (step === "end") {
                counts[reuse ? "shared" : "direct"].push(fetches);
                effects.push({ rooms: world.rooms, creates: calls.filter((c) => c[0] === "create").length,
                    extends: calls.filter((c) => c[0] === "extend").length,
                    cancels: calls.filter((c) => c[0] === "cancel").length,
                    halted: Object.values(Memory.terminalOps.operations).filter((op) => op.listingLifecycle && op.listingLifecycle.halted === "manual-edit").length });
            }
        };
    };
    const scenarios = [3, 5, 10].map((rooms) => ({ createWorld: () => ({ rooms }),
        steps: ["start", "create-reset", "bind", "grow", "off-reset", "manual", "provider", "deadline", "cancel-reset", "empty", "end"] }));
    const out = compareSequences(factory(false), factory(true), scenarios, (_, world) => world.observed);
    assert(out.equal, "0156 listing live maintenance: real intents, fees, claims and pending match for 3/5/10 rooms (" + JSON.stringify(out.divergences) + ")");
    assert(counts.direct.length === 3 && counts.shared.every((n, i) => n < counts.direct[i]),
        "0156 listing live maintenance: shared book reduces native fetches including provider invalidation (" + JSON.stringify(counts) + ")");
    assert(effects.length === 6 && effects.every((e) => e.creates === e.rooms * 2 && e.extends === e.rooms && e.cancels === e.rooms - 1 && e.halted === 1),
        "0156 listing live maintenance: scenarios actually create, extend, cancel and preserve the edited generation");

    // Intra-tick state is live even when the same raw book is reused.
    const load = (name) => require(path.join(project, "src/utils", name));
    const saved = { game: global.Game, memory: global.Memory };
    try {
        let fetches = 0;
        const orders = [{ id: "x", type: ORDER_SELL, resourceType: "O", price: 12, amount: 100 }];
        global.Memory = { settings: {} };
        assert(load("config").get("terminalOps.reuseOrderBook") === true,
            "terminal book reuse: enabled by default without persisted settings");
        Memory.settings.terminalOps = { reuseOrderBook: false };
        assert(load("config").get("terminalOps.reuseOrderBook") === false,
            "terminal book reuse: explicit opt-out overrides the default");
        delete Memory.settings.terminalOps;
        global.Game = { time: 50000, cpu: { getUsed: () => 0 }, market: { getAllOrders: () => { fetches++; return orders; } } };
        const book = load("orderBook"); book.reset();
        const first = book.query(ORDER_SELL, "O"); book.query(ORDER_SELL, "O");
        assert(fetches === 1 && first.covered, "0156 cache off pending: raw book fetched once per tick");
        orders[0].price = 14;
        assert(book.query(ORDER_SELL, "O").orders[0].price === 14, "0156 cache off pending: shared order fields are not frozen decisions");
        Game.market.getAllOrders = () => { fetches++; return [{ id: "y", type: ORDER_SELL, resourceType: "O", price: 15 }]; };
        assert(book.query(ORDER_SELL, "O").orders[0].id === "y" && fetches === 2, "0156 cache off pending: same-tick provider replacement invalidates book");
        Game.time++;
        book.query(ORDER_SELL, "O");
        assert(fetches === 3, "0156 cache off pending: next tick fetches a fresh book");
        book.reset(); book.query(ORDER_SELL, "O");
        assert(fetches === 4, "0156 cache off pending: explicit reset does not retain a warm quote");
        let attempts = 0;
        Game.market.getAllOrders = () => { if (++attempts === 1) throw new Error("transient"); return orders; };
        assert(!book.query(ORDER_SELL, "O").covered && book.query(ORDER_SELL, "O").covered && attempts === 2,
            "0156 cache off pending: a failed raw fetch can recover in the same tick");
        const sameProvider = function () { return this.replacement; };
        Game.market = { getAllOrders: sameProvider, replacement: orders }; book.query(ORDER_SELL, "O");
        Game.market = { getAllOrders: sameProvider, replacement: [{ id: "new-market" }] };
        assert(book.query(ORDER_SELL, "O").orders[0].id === "new-market",
            "0156 cache off pending: market identity changes invalidate even with the same function");
        let fail = true;
        Game.market.getAllOrders = () => { if (fail) throw new Error("offline"); return orders; };
        assert(!book.quote(ORDER_SELL, "O").covered, "0156 cache off pending: failed filtered quote stays unknown");
        fail = false;
        book.query(ORDER_SELL, "O");
        const recovered = book.quote(ORDER_SELL, "O");
        assert(recovered.covered && recovered.orders.length === 1, "0156 cache off pending: recovered raw book invalidates the failed filtered view");
        const full = orders.slice(); Game.market.getAllOrders = () => full;
        book.byResource("O"); full.push({ id: "H", resourceType: "H", type: ORDER_SELL }); Game.time++;
        assert(book.byResource("H").length === 1, "0156 cache off pending: grouping resets next tick even when a provider reuses its array");
    } finally { global.Game = saved.game; global.Memory = saved.memory; load("orderBook").reset(); }
};
