"use strict";
module.exports = function (project, assert) {
    const path = require("path");
    const load = (name) => require(path.join(project, "src/utils", name));
    const policy = load("listingPolicy"), book = load("orderBook"), market = load("market"), census = load("census"), ops = load("terminalOps");
    const saved = { game: global.Game, memory: global.Memory, resources: global.RESOURCES_ALL, snapshot: market.snapshot };
    const ask = (price, extra) => Object.assign({ id: "other", type: ORDER_SELL, resourceType: "O", price, amount: 1000, remainingAmount: 1000, roomName: "Remote" }, extra);
    const input = (orders, extra) => Object.assign({ orders, own: {}, covered: true, resource: "O", limit: 10, basis: "existing-policy-limit", step: 0.001 }, extra);
    let out = policy.sellQuote(input([ask(9)]));
    assert(!out.ok && out.reason === "floor-above-market", "0153 competitive create and extend: no floor clamp above the market");
    out = policy.sellQuote(input([ask(12), ask(1, { id: "mine" }), ask(2, { amount: 0 }), ask(3, { active: false })], { own: { mine: {} } }));
    assert(out.ok && out.price === 11.999 && out.best === 12, "0153 competitive create and extend: excludes own, inactive and unexecutable asks");
    assert(!policy.sellQuote(input([], { covered: false })).ok && !policy.sellQuote(input([])).ok,
        "0153 competitive create and extend: failed or empty book cannot justify a fee");
    assert(!policy.sellQuote(input([ask(12)], { basis: null })).ok && !policy.sellQuote(input([ask(12)], { limit: NaN })).ok,
        "0153 competitive create and extend: unknown basis is never zero cost");
    assert(policy.extension(out, 11) && !policy.extension(out, 12) && !policy.extension(out, 10),
        "0153 competitive create and extend: extension respects the live ask and net floor");
    assert(policy.incrementalFee("create", 12, 100) === 60 && policy.incrementalFee("extend", 12, 20) === 12 &&
        policy.incrementalFee("reprice", 13, 100, 12) === 5 && policy.incrementalFee("reprice", 11, 100, 12) === 0,
        "0153 incremental fees: create, extension, increase and decrease use only incremental amounts");
    assert(policy.incrementalFee("create", 0.001, 1) === 0.001, "0153 incremental fees: public engine mill-credit rounding");
    assert(policy.descent(out, 15, 11) === 11.999 && policy.descent(out, 11, 11) === null,
        "0153 descent: a descent never raises the current price");
    const now = 1800000000000;
    const age = policy.age({}, null, now);
    assert(age.createdAt === now && age.source === "observed-lower-bound" && policy.age({}, { createdAt: now, ageSource: age.source }, now + 100).createdAt === now,
        "0153 timestamps: unknown legacy age starts conservatively and survives reset");
    assert(policy.age({ createdTimestamp: now - 1000 }, null, now).createdAt === now - 1000,
        "0153 timestamps: server wall-clock timestamp is used without tick-rate conversion");
    const pixel = { held: 20, listings: [{ id: "pixel-order", price: 120, remainingAmount: 5 }], pending: 2,
        bids: [{ id: "bid", type: ORDER_BUY, resourceType: "pixel", price: 100, amount: 3 }], own: {}, minBid: 95,
        quote: { ok: true, price: 121, floor: 100 }, budget: 60, credits: 100 };
    out = policy.pixelPlan(pixel);
    assert(out.deals[0].quantity === 3 && out.extend === 10 && out.keep === 0 && out.orderId === "pixel-order",
        "0153 pixel exposure: bids precede extension and listed/pending pixels are never free");
    assert(policy.pixelPlan(Object.assign({}, pixel, { listings: [] })).extend === 0 &&
        policy.pixelPlan(Object.assign({}, pixel, { listings: pixel.listings.concat(pixel.listings) })).extend === 0,
        "0153 pixel exposure: no new or second listing is proposed");
    assert(policy.pixelPlan(Object.assign({}, pixel, { minBid: null })).deals.length === 0,
        "0153 pixel exposure: unknown reference blocks new spend/exposure");

    const store = (values, capacity) => {
        const s = Object.assign({}, values);
        Object.defineProperties(s, { getCapacity: { value: () => capacity }, getUsedCapacity: { value: () => Object.values(s).reduce((n, q) => n + q, 0) },
            getFreeCapacity: { value: () => capacity - s.getUsedCapacity() } });
        return s;
    };
    let pending, calls, orders, room, serial = 0;
    const reset = (enabled = true) => {
        pending = []; calls = { create: [], extend: [], reprice: [], cancel: [] }; orders = [ask(9)];
        room = { name: "PolicyRoom", controller: { my: true }, find: () => [],
            storage: { id: "ps", store: store({ O: 0, energy: 1000000 }, 2000000) },
            terminal: { id: "pt", cooldown: 0, store: store({ O: 1000, energy: 100000 }, 300000) } };
        global.Memory = { settings: { listingPolicy: { enabled }, terminalOps: { tickInterval: 1 }, terminalFuel: { enabled: false },
            stockPolicy: { enabled: true, targets: { energy: 0 }, creditReserve: 0 }, swing: { enabled: false } }, rooms: {},
            craft: { active: {}, stranded: {} }, marketFlip: { active: {}, committedCredits: 0 } };
        global.Game = Object.assign({}, saved.game, { time: saved.game.time + (++serial * 100), rooms: { [room.name]: room }, myRooms: [room], creeps: {},
            getObjectById: (id) => id === "ps" ? room.storage : id === "pt" ? room.terminal : null,
            market: { credits: 10000000, orders: {}, incomingTransactions: [], outgoingTransactions: [], calcTransactionCost: () => 0,
                getAllOrders: (filter) => orders.filter((o) => !filter || o.type === filter.type && o.resourceType === filter.resourceType),
                createOrder: (request) => { calls.create.push(request); const tick = Game.time; pending.push(() => {
                    Game.market.orders.created = Object.assign({ id: "created", created: tick, createdTimestamp: Date.now(), amount: request.totalAmount, remainingAmount: request.totalAmount }, request);
                    Game.market.credits -= request.price * request.totalAmount * 0.05;
                }); return OK; },
                extendOrder: (id, q) => { calls.extend.push({ id, q }); pending.push(() => { const o = Game.market.orders[id]; o.totalAmount += q; o.remainingAmount += q; o.amount += q; }); return OK; },
                changeOrderPrice: (id, price) => { calls.reprice.push({ id, price }); pending.push(() => { Game.market.orders[id].price = price; }); return OK; },
                cancelOrder: (id) => { calls.cancel.push(id); pending.push(() => { delete Game.market.orders[id]; }); return OK; },
            } });
        global.RESOURCES_ALL = saved.resources.concat("O");
        market.snapshot = () => ({ tick: Game.time, resources: { O: { buyPrice: 10, sellPrice: 20, fairPrice: 15 }, energy: { fairPrice: 1 } } });
        book.reset(); census.build();
    };
    const next = () => { pending.splice(0).forEach((fn) => fn()); Game.time++; book.reset(); census.build(); ops.tick(); };
    const sale = (limit = 10, options = {}) => ops.sell(room.name, "O", 100, limit, true, true,
        Object.assign({ owner: { kind: "craft", id: "policy" } }, options));
    const list = (op) => { op.state = "listing"; op.loadedAmount = op.remaining; ops.tick(); };
    try {
        reset();
        const rejected = sale(10, { fixedListing: true });
        assert(!rejected.ok && !Memory.terminalOps || !rejected.ok && Object.keys(Memory.terminalOps.operations).length === 0,
            "0153 competitive create and extend: rejects automatic fixed listing before staging or claims");
        reset(); orders = [ask(12)]; const accepted = sale(); const op = ops.operation(accepted.id); list(op);
        assert(calls.create.length === 1 && calls.create[0].price === 11.999, "0153 competitive create and extend: production creation uses direct competing ask");
        Memory.settings.listingPolicy.enabled = false; next();
        assert(op.marketOrderId === "created" && op.state === "listed", "0153 off pending: create binds after feature off");
        op.remaining += 20; op.amount += 20; op.loadedAmount += 20; next();
        assert(calls.extend.length === 0 && calls.reprice.length === 0 && calls.cancel.length === 0,
            "0153 off pending: off blocks new amendments while preserving the live order");
        Memory.settings.listingPolicy.enabled = true; orders = [ask(11)]; next();
        assert(calls.extend.length === 0, "0153 competitive create and extend: production blocks noncompetitive extension");
        orders = [ask(13)]; next();
        assert(calls.extend.length === 1 && calls.extend[0].q === 20, "0153 incremental fees: production extends only added stock");
        Memory.settings.listingPolicy.enabled = false; global.Memory = JSON.parse(JSON.stringify(Memory)); next();
        const restored = ops.operation(accepted.id);
        assert(!restored.pendingExtension && restored.listedAmount === 120 && calls.extend.length === 1,
            "0153 off pending: reset/off confirms extension without duplicate fee or phantom fill");
        Memory.settings.listingPolicy.enabled = true;
        Game.market.orders.created.price = 50; next();
        assert(restored.listingLifecycle && restored.listingLifecycle.halted === "manual-edit" && calls.reprice.length === 0,
            "0153 off pending: manual edit invalidates automatic generation before another decision");
        reset(); orders = [ask(12)]; const manual = sale(10, { owner: { kind: "manual", id: "manual" } }); list(ops.operation(manual.id));
        assert(!ops.operation(manual.id).listingPolicyManaged, "0153 protected cleanup: manual operation is not adopted by automatic policy");
        reset(false); const legacy = sale(10, { fixedListing: true }); list(ops.operation(legacy.id));
        assert(calls.create.length === 1 && !ops.operation(legacy.id).listingPolicyManaged,
            "0153 off pending: default off preserves legacy behavior until explicit activation");
        reset(); orders = [ask(12)]; const waiting = sale(); const awaiting = ops.operation(waiting.id); list(awaiting);
        Memory.settings.listingPolicy.enabled = false; pending = []; next();
        for (let i = 0; i < 15; i++) next();
        assert(calls.create.length === 1 && awaiting.listingLifecycle && awaiting.listingLifecycle.halted,
            "0153 off pending: unconfirmed create remains quarantined and never retries blindly");
        reset(); orders = [ask(12)]; const expiring = sale(); const expired = ops.operation(expiring.id); list(expired); next();
        const originalAge = expired.listingLifecycle.createdAt;
        expired.listingLifecycle.createdAt -= 8 * 86400000;
        next();
        assert(calls.cancel.length === 1 && expired.state !== "cancelled" && expired.listingLifecycle.pending.kind === "cancel",
            "0153 timestamps: managed real deadline submits one cancellation and waits for confirmation");
        Memory.settings.listingPolicy.enabled = false; global.Memory = JSON.parse(JSON.stringify(Memory)); next();
        const cancelled = ops.operation(expiring.id);
        assert(cancelled && cancelled.state === "cancelled" && cancelled.listingLifecycle.cancelConfirmed && calls.cancel.length === 1,
            "0153 off pending: deadline cancellation confirms after reset/off without duplicate cancellation");
        assert(originalAge > 0 && cancelled.listingLifecycle.createdAt === originalAge - 8 * 86400000,
            "0153 timestamps: cancellation does not reset the original age");
        reset(); orders = [ask(12)]; const depleted = sale(); const done = ops.operation(depleted.id); list(done); next();
        Game.market.orders.created.amount = 0; next();
        assert(calls.cancel.length === 0 && done.remaining === 100, "0153 protected cleanup: unexecutable amount zero is not depletion");
        Game.market.orders.created.remainingAmount = 0; next();
        assert(done.state === "completed" && calls.cancel.length === 1, "0153 protected cleanup: confirmed depletion is reconciled before cleanup");
        next();
        assert(!Game.market.orders.created && done.state === "completed" && done.listingLifecycle.cleanupConfirmed,
            "0153 protected cleanup: deferred cleanup preserves completion and confirms removal");
        reset(); orders = [ask(12)]; const missing = sale(); const lost = ops.operation(missing.id); list(lost); next();
        delete Game.market.orders.created; next();
        assert(lost.remaining === 100 && lost.listingLifecycle.halted === "missing-order-unknown" && calls.create.length === 1,
            "0153 cancellation versus expiry: missing order is unknown, never an invented fill/refund/retry");
        reset(); orders = [ask(15)]; const descending = sale(); const desc = ops.operation(descending.id); list(desc); next();
        desc.repriceTick = Game.time - 2000; orders = [ask(13)]; next();
        assert(calls.reprice.length === 0, "0153 descent: live paid listing keeps its price by default");
        Memory.settings.listingPolicy.descent = true; Memory.settings.listingPolicy.floors = { O: 11 }; next();
        assert(calls.reprice.length === 1 && calls.reprice[0].price === 12.999 && desc.marketFees === 74.995,
            "0153 descent: opt-in lowers the same ID without another fee");
        Memory.settings.listingPolicy.enabled = false; next();
        assert(!desc.listingLifecycle.pending && !desc.listingLifecycle.halted && calls.reprice.length === 1,
            "0153 off pending: repricing reconciles with decisions off");
        const audit = load("ordersAudit").audit();
        assert(audit.rows[0].ageSource === "createdTimestamp" && audit.rows[0].historicalFees === desc.marketFees &&
            audit.rows[0].potentialNaturalExpiryRefund > 0 && audit.rows[0].managedCancellationRefund === 0 && audit.rows[0].confirmedRefund === null,
            "0153 cancellation versus expiry: audit separates historical fees, potential expiry refund and no cancellation refund");
        delete Game.market.orders.created.createdTimestamp; delete Memory.terminalOps;
        assert(load("ordersAudit").audit().summary.unknownAge === 1, "0153 timestamps: audit does not invent wall-clock age from ticks");
        reset(); Game.market.getAllOrders = () => { throw new Error("unavailable"); }; book.reset();
        assert(book.quote(ORDER_SELL, "O").covered === false, "0153 competitive create and extend: book errors retain unknown coverage");
        Game.time++; Game.market.getAllOrders = () => []; book.reset();
        assert(book.quote(ORDER_SELL, "O").covered === true, "0153 competitive create and extend: known empty book differs from failed fetch");
        reset(); orders = [ask(12)]; const takeover = sale(); const transferred = ops.operation(takeover.id); list(transferred); next();
        transferred.owner.kind = "manual"; next();
        assert(transferred.listingLifecycle.halted === "manual-edit" && transferred.listingLifecycle.owner === "craft:policy",
            "0153 off pending: changing ownership in place revokes the automatic generation");
        const generation = transferred.listingLifecycle.generation; next();
        assert(transferred.listingLifecycle.generation === generation, "0153 off pending: quarantined generations do not churn every tick");
        reset(); orders = [ask(12)]; const scarce = sale(); const unfunded = ops.operation(scarce.id);
        room.terminal.store.O = 50; list(unfunded);
        assert(calls.create.length === 0, "0153 competitive create and extend: creation requires fully delivered backing even without another claimant");
        reset(); orders = [ask(12)]; Game.market.credits = 1;
        const poor = sale(); list(ops.operation(poor.id));
        assert(calls.create.length === 0, "0153 incremental fees: automatic creation cannot spend beyond live cash");
        reset(); orders = [ask(12)]; const changed = sale(); const conflict = ops.operation(changed.id); list(conflict); next();
        conflict.remaining += 20; conflict.amount += 20; conflict.loadedAmount += 20; next();
        pending.splice(0).forEach((fn) => fn()); Game.market.orders.created.totalAmount += 5; next();
        assert(conflict.listingLifecycle.halted === "manual-edit" && calls.extend.length === 1,
            "0153 off pending: concurrent manual extension is not mistaken for sole ownership of the added stock");
        reset(false); orders = [ask(12)]; const oldSale = sale(); const legacyOwner = ops.operation(oldSale.id); list(legacyOwner); next();
        delete legacyOwner.owner; legacyOwner.policy = "swing";
        Memory.settings.listingPolicy.enabled = true; next(); next();
        assert(legacyOwner.listingPolicyManaged && legacyOwner.owner.kind === "swing" && !legacyOwner.listingLifecycle.halted,
            "0153 timestamps: legacy ownership resolves canonically before first adoption");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory; global.RESOURCES_ALL = saved.resources; market.snapshot = saved.snapshot;
        book.reset(); census.build();
    }
};
