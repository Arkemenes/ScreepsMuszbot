// ROADMAP 0124: usage replenishment and liquidation, simulated by default.
const config = require("./config");
const market = require("./market");
const book = require("./orderBook");
const policy = require("./resourcePolicy");
const accounting = require("./marketAccounting");
function memory() {
    if (!Memory.swing) Memory.swing = { observations: {}, pending: {}, noRelist: {} };
    const mem = Memory.swing;
    if (!mem.observations) mem.observations = {};
    if (!mem.pending) mem.pending = {};
    if (!mem.noRelist) mem.noRelist = {};
    return mem;
}
function reference(r, kind) {
    const side = kind === "buy" ? "sellPrice" : "buyPrice";
    const samples = market.samples(r);
    const rows = samples.filter((s) => s[side] > 0);
    const newest = rows.length ? rows[rows.length - 1].tick : null;
    const requiredSamples = config.get("swing.minSamples", 30);
    const maxSampleAge = config.get("swing.maxSampleAge", 7200);
    const details = { resourceType: r, kind, referenceSide: side, totalSamples: samples.length,
        validSamples: rows.length, requiredSamples, latestSampleTick: newest,
        sampleAge: newest === null ? null : Game.time - newest, maxSampleAge };
    if (!market.historyReady()) return Object.assign(details, { reason: "history-loading" });
    if (rows.length < requiredSamples) return Object.assign(details, { reason: "insufficient-history" });
    if (newest > Game.time || Game.time - newest > maxSampleAge) return Object.assign(details, { reason: "stale-history" });
    const snap = market.snapshot();
    const data = snap && snap.resources && snap.resources[r];
    if (!data || !(data[side] > 0)) return Object.assign(details, { reason: "missing-reference" });
    const energy = snap.resources[RESOURCE_ENERGY];
    if (!energy || !(energy.fairPrice > 0)) return Object.assign(details, { reason: "missing-energy-price" });
    const energyRows = market.samples(RESOURCE_ENERGY).filter((s) => s.sellPrice > 0);
    const lastEnergy = energyRows.length && energyRows[energyRows.length - 1].tick;
    details.energyValidSamples = energyRows.length;
    details.energySampleAge = energyRows.length ? Game.time - lastEnergy : null;
    if (energyRows.length < requiredSamples || lastEnergy > Game.time || Game.time - lastEnergy > maxSampleAge)
        return Object.assign(details, { reason: "invalid-energy-history" });
    return Object.assign(details, { price: data[side], energy: energy.fairPrice });
}
function effective(kind, r, price, quantity, cost, energy) {
    if (!(quantity > 0)) return kind === "buy" ? Infinity : -Infinity;
    if (kind === "buy" && r === RESOURCE_ENERGY) return quantity > cost ? price * quantity / (quantity - cost) : Infinity;
    return price + (kind === "buy" ? 1 : -1) * cost * energy / quantity;
}
function quote(room, kind, r, quantity, options) {
    options = options || {};
    const ref = reference(r, kind);
    if (ref.reason) return ref;
    const limit = ref.price * (1 + (kind === "buy" ? -1 : 1) * config.get("swing.margin", 0.01));
    let cap = Math.max(0, Math.floor(quantity));
    if (kind === "buy") cap = Math.min(cap, policy.terminalFree(room, options.excludeId));
    else cap = Math.min(cap, policy.available(room, r, options.excludeId));
    if (!cap) return { reason: kind === "buy" ? "no-receiving-space" : "reserved-stock", reference: ref.price, limit };
    const cash = accounting.available(options.excludeId);
    const orders = options.orders || book.matching(kind === "buy" ? ORDER_SELL : ORDER_BUY, r);
    const own = Game.market && Game.market.orders || {};
    const matches = [];
    let deficit;
    const freight = new Map();
    const transactionCost = (amount, destination) => {
        let quantities = freight.get(destination);
        if (!quantities) { quantities = new Map(); freight.set(destination, quantities); }
        if (!quantities.has(amount)) quantities.set(amount, Game.market.calcTransactionCost(amount, room.name, destination));
        return quantities.get(amount);
    };
    orders.forEach((order) => {
        if (!order || own[order.id] || (options.deadOrderIds || []).indexOf(order.id) >= 0 || order.type !== (kind === "buy" ? ORDER_SELL : ORDER_BUY) || order.resourceType !== r || !order.roomName || !(order.price > 0)) return;
        // Freight can only worsen the raw price on either side.
        if (kind === "buy" ? order.price >= limit : order.price <= limit) return;
        const remaining = order.remainingAmount === undefined ? order.amount : order.remainingAmount;
        let q = Math.floor(Math.min(cap, remaining || 0, kind === "buy" ? cash / order.price : Infinity));
        if (kind === "buy") {
            if (deficit === undefined) deficit = policy.deficit(room, r, options.excludeId);
            if (r !== RESOURCE_ENERGY) {
                // Freight consumes energy, not purchased mineral units.
                q = Math.min(q, Math.max(0, Math.floor(deficit)));
            } else {
                // Bound by net delivered energy, not nominal purchased units.
                let low = 0, high = q;
                for (let step = 0; low < high && step < 32; step++) {
                    const mid = Math.ceil((low + high) / 2);
                    const fee = transactionCost(mid, order.roomName);
                    if (mid - fee <= deficit) low = mid; else high = mid - 1;
                }
                q = low;
            }
        }
        if (!(q > 0)) return;
        const cost = transactionCost(q, order.roomName);
        const price = effective(kind, r, order.price, q, cost, ref.energy);
        if (kind === "buy" ? price >= limit : price <= limit) return;
        matches.push({ order, quantity: q, cost, effective: price, fee: cost * ref.energy / q,
            reference: ref.price, limit, energyFairPrice: ref.energy, netAmount: r === RESOURCE_ENERGY && kind === "buy" ? q - cost : q });
    });
    matches.sort((a, b) => kind === "buy" ? a.effective - b.effective : b.effective - a.effective);
    if (matches.length) return matches[0];
    return { reason: kind === "buy" && cash <= 0 ? "credit-reserve" : "no-good-price", reference: ref.price, limit };
}
function observe(room, r, kind, info) {
    memory().observations[room.name + ":" + r + ":" + kind] = Object.assign({ tick: Game.time, room: room.name,
        resourceType: r, kind, test: config.get("swing.test", true), freeAmount: policy.available(room, r),
        deficit: policy.deficit(room, r) }, info);
}
function internalSource(room, r, needed, rooms) {
    const ops = require("./terminalOps");
    const donors = rooms.filter((other) => other !== room && other.storage && other.terminal &&
        !ops.lockConflict("transfer", other.name, room.name, r, true));
    for (const donor of donors.sort((a, b) => policy.stock(b, r) - policy.stock(a, r))) {
        const target = policy.targets(donor)[r] || 0;
        const fuel = r === RESOURCE_ENERGY ? policy.terminalReserve(donor) : 0;
        const spare = Math.max(0, Math.min(policy.value(donor.storage, r) - target,
            policy.stock(donor, r) - target - fuel - (policy.commitments(donor)[r] || 0)));
        let low = 0, high = Math.floor(Math.min(needed, spare, policy.terminalFree(room), config.get("logistics.balanceMaxAmount", 50000)));
        for (let step = 0; low < high && step < 32; step++) {
            const mid = Math.ceil((low + high) / 2);
            const fee = ops.txCost(mid, donor.name, room.name);
            if (r === RESOURCE_ENERGY ? mid + fee <= spare : policy.stock(donor, RESOURCE_ENERGY) - policy.terminalReserve(donor) >= fee) low = mid;
            else high = mid - 1;
        }
        if (low > 0) return { source: donor.name, quantity: low };
    }
    return null;
}
function listingPrice(room, r, limit, orders) {
    const asks = orders.filter((o) => o && o.type === ORDER_SELL && o.resourceType === r && o.price > 0 &&
        (o.remainingAmount === undefined ? o.amount : o.remainingAmount) > 0 && !(Game.market.orders || {})[o.id]).map((o) => o.price);
    const step = config.get("terminalOps.marketPriceStep", 0.001);
    return Math.max(limit / 0.95 + step, asks.length ? Math.min.apply(null, asks) - step : limit / 0.95 + step);
}
function expire() {
    const ops = require("./terminalOps"), mem = memory();
    const all = Memory.terminalOps && Memory.terminalOps.operations || {};
    Object.keys(all).forEach((id) => {
        const op = all[id];
        if (!accounting.active(op) || op.policy !== "swing" || !op.fixedListing || !op.listedTick) return;
        if (Game.time - op.listedTick < config.get("swing.listingLifetime", 1209600)) return;
        const key = op.sourceRoom + ":" + op.resourceType;
        if (!op.expirationProtected) {
            mem.noRelist[key] = (mem.noRelist[key] || 0) + Math.max(0, op.remaining || 0);
            op.expirationProtected = true;
        }
        ops.cancel(id);
    });
}
let lastScan = null;
function tick() {
    if (!config.get("stockPolicy.enabled", true) || !config.get("swing.enabled", true)) return;
    expire();
    const historyReady = market.historyReady();
    if (historyReady && lastScan !== null && Game.time >= lastScan && Game.time - lastScan < config.get("swing.scanInterval", 120)) return;
    // Pending segment pages must not postpone the first hydrated evaluation.
    lastScan = historyReady ? Game.time : null;
    const ops = require("./terminalOps"), mem = memory();
    const rooms = (Game.myRooms || Object.keys(Game.rooms || {}).map((n) => Game.rooms[n])).filter((r) => r.controller && r.controller.my && r.storage && r.terminal);
    const orders = historyReady ? book.all() : [];
    const test = config.get("swing.test", true);
    mem.observations = {};
    rooms.forEach((room) => {
        Object.keys(policy.targets(room)).forEach((r) => {
            const need = policy.deficit(room, r);
            if (!need) { observe(room, r, "buy", { reason: "target-satisfied" }); return; }
            const source = internalSource(room, r, need, rooms);
            if (source) {
                observe(room, r, "buy", { reason: "internal-balance", source: source.source, quantity: source.quantity });
                if (!test) ops.transfer(source.source, room.name, r, source.quantity, { automatic: true, policy: "swing", reason: "usage-target" });
                return;
            }
            const q = quote(room, "buy", r, Infinity, { orders });
            observe(room, r, "buy", q.order ? { reason: "eligible", quantity: q.quantity, netAmount: q.netAmount,
                effective: q.effective, reference: q.reference, limit: q.limit, cost: q.cost, orderId: q.order.id } : q);
            if (!test && q.order) {
                const result = ops.buy(room.name, r, q.quantity, q.limit, false, true, { policy: "swing", effectiveLimit: true, automaticPurchase: true });
                if (result.ok) memory().observations[room.name + ":" + r + ":buy"].opId = result.id;
            }
        });
        const resources = Object.keys(room.storage.store).concat(Object.keys(room.terminal.store)).filter((r, i, all) => all.indexOf(r) === i);
        resources.forEach((r) => {
            if (policy.used(room, r) || typeof RESOURCES_ALL !== "undefined" && RESOURCES_ALL.indexOf(r) < 0) return;
            const free = Math.floor(policy.available(room, r));
            const pending = ops.activeForRoom(room.name).some((op) => op.resourceType === r);
            if (!free || pending) { observe(room, r, "sell", { reason: pending ? "pending-operation" : "reserved-stock" }); return; }
            const q = quote(room, "sell", r, free, { orders });
            if (q.order) {
                observe(room, r, "sell", { reason: "eligible", quantity: q.quantity, effective: q.effective, reference: q.reference, limit: q.limit, cost: q.cost, orderId: q.order.id });
                if (!test) {
                    const result = ops.sell(room.name, r, q.quantity, q.limit, false, true, { policy: "swing", effectiveLimit: true });
                    if (result.ok) memory().observations[room.name + ":" + r + ":sell"].opId = result.id;
                }
                return;
            }
            if (q.reason !== "no-good-price") { observe(room, r, "sell", q); return; }
            const key = room.name + ":" + r;
            const blocked = Math.min(free, mem.noRelist[key] || 0);
            const qty = Math.floor(Math.min(free - blocked, policy.value(room.terminal, r) + policy.terminalFree(room)));
            if (!qty) { observe(room, r, "sell", { reason: blocked ? "expired-lot" : "no-staging-space" }); return; }
            const price = listingPrice(room, r, q.limit, orders);
            if (price * qty * 0.05 > accounting.available()) { observe(room, r, "sell", { reason: "listing-fee-budget" }); return; }
            observe(room, r, "sell", { reason: "eligible-listing", quantity: qty, effective: price * 0.95, price, reference: q.reference, limit: q.limit });
            if (!test) ops.sell(room.name, r, qty, q.limit, true, true, { policy: "swing", effectiveLimit: true, fixedListing: true });
        });
    });
}
function status(roomName) {
    const observations = memory().observations;
    return Object.keys(observations).map((k) => observations[k]).filter((o) => !roomName || o.room === roomName);
}
function sold(roomName, r, quantity) {
    const key = roomName + ":" + r, mem = memory();
    if (mem.noRelist[key]) {
        mem.noRelist[key] = Math.max(0, mem.noRelist[key] - quantity);
        if (!mem.noRelist[key]) delete mem.noRelist[key];
    }
}
global.swingStatus = status;
// Read current references without scanning orders or waiting for the swing cadence.
global.swingReference = (resourceType, kind = "buy") => reference(resourceType, kind);
module.exports = { tick, quote, effective, reference, status, internalSource, listingPrice, expire, sold, resetScan() { lastScan = null; } };
