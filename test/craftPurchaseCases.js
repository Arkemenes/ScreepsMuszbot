module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils/" + name));
    const market = load("market"), pricing = load("marketPricing"), book = load("craftPurchaseBook"), cache = load("orderBook");
    const saved = { market: Game.market, time: Game.time, ops: Memory.terminalOps, settings: Memory.settings, samples: market.samples };
    const snapshot = { resources: { X: { currentSell: 10 }, energy: { currentSell: 2, fairPrice: 2 } } };
    let orders = [], freight = 0;
    const make = (quantity, price = 10, id = "cheap") => ({ id, type: ORDER_SELL, resourceType: "X", roomName: "Far", amount: quantity, price });
    const pending = (remaining, extra = {}) => Object.assign({ id: "pending", kind: "buy", resourceType: "X", sourceRoom: "E1N47",
        createdTick: 1, state: "waiting", remaining, limit: 15 }, extra);
    function reset(ops = []) {
        Game.time++;
        Memory.terminalOps = { operations: Object.fromEntries(ops.map((op) => [op.id, op])) };
        cache.reset();
        return book.create(snapshot);
    }
    try {
        Memory.settings = { terminalOps: { maxBuyFreightShare: null } };
        market.samples = (r) => Array.from({ length: 72 }, (_, tick) => ({ tick, sellPrice: r === "X" ? 10 : 2,
            buyPrice: r === "X" ? 9 : 1, sellVolume: 100000, buyVolume: 100000 }));
        Game.market = { orders: {}, getAllOrders: () => orders, calcTransactionCost: (q) => Math.ceil(q * freight) };
        orders = [make(2000)];
        let b = reset([pending(960)]), q = b.quote("W7N49", "X", 750);
        assert(q.ok && q.available === 750, "0134: pending X960 leaves room for a second X750 purchase");
        assert(!b.quote("W7N49", "X", 1500).ok, "0134: pending quantity is deducted from current depth");
        b.reserve(q);
        assert(b.quote("W7N49", "X", 290).ok && !b.quote("W7N49", "X", 291).ok,
            "0134: a new opening reserves its exact allocation in the same scan");
        for (const state of ["completed", "cancelled", "failed"]) {
            b = reset([pending(960, { state })]);
            assert(b.quote("W7N49", "X", 2000).ok, "0134: " + state + " purchase releases market depth");
        }
        b = reset([pending(100, { dealtAmount: 860, amount: 960 })]);
        assert(b.quote("W7N49", "X", 1900).ok, "0134: partial purchase reserves remaining units only");
        b = reset([pending(960, { limit: 9 })]);
        assert(b.quote("W7N49", "X", 2000).ok, "0134: ineligible pending budget does not reserve expensive supply");
        orders.push(make(1000, 30, "expensive"));
        b = reset([pending(2000)]);
        q = b.quote("W7N49", "X", 750);
        assert(q.ok && q.unit === 30 && q.ceiling === 30, "0134: residual expensive supply reprices the candidate");
        Game.market.orders.expensive = orders[1];
        b = reset([pending(2000)]);
        assert(!b.quote("W7N49", "X", 750).ok, "0134: own SELL listings cannot fund a new craft purchase");
        Game.market.orders = {};
        orders = [make(2000)]; freight = 0.6;
        b = reset(); q = b.quote("W7N49", "X", 1000);
        assert(q.ok && q.unit === 11.2 && q.ceiling === 11.2 && q.freight === 600,
            "0134: actual freight enters both predicted cost and effective purchase ceiling");
        const evaluated = load("purchaseCost").evaluate({ resourceType: "X", limit: q.ceiling }, 10, 1000, 600, 2);
        assert(evaluated.ok, "0134: a quoted distant supply executes at its inclusive effective ceiling");
        freight = 0;
        const intent = pending(500, { pendingDeal: { orderId: "cheap", quantity: 500, tick: Game.time + 1, orderRemaining: 2000 } });
        b = reset([intent]);
        assert(b.quote("W7N49", "X", 1500).ok && !b.quote("W7N49", "X", 1501).ok,
            "0134: same-tick accepted intent is reserved once against its exact order");
        orders = [make(1500)];
        b = reset([intent]);
        assert(b.quote("W7N49", "X", 1500).ok, "0134: reflected intent is not deducted twice on the next tick");
        orders = [make(2000)];
        b = reset([intent]);
        assert(!b.quote("W7N49", "X", 1501).ok, "0134: an unconfirmed old intent still reserves its purchase balance");
        orders = [make(900, 12)];
        b = reset();
        assert(b.quote("W7N49", "X", 900).unit === 12 && !b.quote("W7N49", "X", 901).ok,
            "0134: reset uses the new book price and quantity without stale reservations");
    } finally {
        Game.market = saved.market; Game.time = saved.time; Memory.terminalOps = saved.ops; Memory.settings = saved.settings;
        market.samples = saved.samples; pricing.resetCaches(); cache.reset();
    }
};
