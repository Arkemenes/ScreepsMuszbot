"use strict";
// ROADMAP 0151 / O5: read-only audit of the bot's own market orders (console: ordersAudit()).
// For every own order: how much the creation fee cost (estimate), how old it is, how much is left,
// and where its price stands against the best competing order. Answers "which listings are
// sitting above the market, how much fee did they cost, how long have they been there".
// One market query (getAllOrders) - a console tool, not something that runs every tick.
const FEE = typeof MARKET_FEE === "number" ? MARKET_FEE : 0.05;
const DEAD_AGE_DAYS = 7;
const policy = require("./listingPolicy");

function bestCompetitor(book, own, order) {
    return policy.competitor(book, own, order.resourceType, order.type);
}

function audit(options) {
    options = options || {};
    const own = Game.market && Game.market.orders || {};
    let book = [], bookCovered = false;
    try { const value = Game.market.getAllOrders(); bookCovered = Array.isArray(value); if (bookCovered) book = value; } catch (e) { book = []; }
    const managed = new Map();
    Object.values(Memory.terminalOps && Memory.terminalOps.operations || {}).forEach((op) => {
        const id = op.marketOrderId || op.listingLifecycle && op.listingLifecycle.orderId;
        if (id) managed.set(id, op);
    });
    const now = Date.now();
    const rows = Object.keys(own).map((id) => {
        const o = own[id];
        const left = o.remainingAmount === undefined ? o.amount : o.remainingAmount;
        const total = o.totalAmount === undefined ? o.amount : o.totalAmount;
        const feeEstimate = Math.round(FEE * o.price * total);
        const op = managed.get(id), lifecycle = op && op.listingLifecycle;
        const age = o.createdTimestamp > 0 && o.createdTimestamp <= now ?
            { createdAt: o.createdTimestamp, source: "createdTimestamp" } : lifecycle && lifecycle.createdAt > 0 ?
                { createdAt: lifecycle.createdAt, source: lifecycle.ageSource } : null;
        const competitor = left > 0 && bookCovered ? bestCompetitor(book, own, o) : null;
        // gap > 0: a SELL priced above the best ask (or a BUY below the best bid) = not competitive
        const gap = competitor ? (o.type === ORDER_SELL ? o.price / competitor - 1 : 1 - o.price / competitor) : null;
        return { id, type: o.type, resource: o.resourceType, room: o.roomName, price: o.price, left, total, active: !!o.active && left > 0,
            ageDays: age ? Math.round(Math.max(0, now - age.createdAt) / 86400000 * 10) / 10 : null,
            ageSource: age ? age.source : "unknown", feeEstimate, competitor, gap,
            historicalFees: op && typeof op.marketFees === "number" ? op.marketFees : null,
            feeHistoryEstimated: !!(op && op.feeHistoryEstimated),
            potentialNaturalExpiryRefund: Math.max(0, left * o.price * FEE), confirmedRefund: null,
            managedCancellationRefund: 0, deadlineMs: lifecycle ? lifecycle.createdAt + require("./config").get("listingPolicy.lifetimeMs", 604800000) : null,
            pending: lifecycle && lifecycle.pending || null, halted: lifecycle && lifecycle.halted || null,
            nextUnitExtensionFee: policy.incrementalFee("extend", o.price, 1),
            valueLeft: Math.round(left * o.price) };
    });
    const active = rows.filter((r) => r.left > 0);
    const dead = rows.filter((r) => r.left <= 0);
    const stale = active.filter((r) => r.gap !== null && r.gap > (options.gap || 0.05));
    const old = active.filter((r) => r.ageDays !== null && r.ageDays >= (options.days || DEAD_AGE_DAYS));
    const sum = (list, key) => list.reduce((n, r) => n + r[key], 0);
    const summary = {
        tick: Game.time, orders: rows.length, active: active.length, finished: dead.length,
        feeEstimateAll: sum(rows, "feeEstimate"), feeEstimateActive: sum(active, "feeEstimate"),
        aboveMarket: stale.length, feeOnAboveMarket: sum(stale, "feeEstimate"), valueOnAboveMarket: sum(stale, "valueLeft"),
        olderThanDays: old.length, feeOnOld: sum(old, "feeEstimate"),
        unknownAge: active.filter((r) => r.ageDays === null).length, bookCovered,
        note: "fee = 5% x price x total amount at the CURRENT price (creation price and extensions are not recorded on the order): an estimate",
    };
    const worst = stale.slice().sort((a, b) => b.feeEstimate * (b.gap || 0) - a.feeEstimate * (a.gap || 0)).slice(0, options.top || 12)
        .map((r) => [r.type === ORDER_SELL ? "sell" : "buy", r.resource, r.room, r.price, r.competitor, Math.round(r.gap * 1000) / 10 + "%", r.left, r.ageDays + "d", r.feeEstimate]);
    return { summary, rows, worstFields: ["type", "resource", "room", "price", "bestCompetitor", "gap", "left", "age", "feeEstimate"], worst };
}

function print(options) {
    const result = audit(options);
    console.log("[ordersAudit] " + JSON.stringify(result.summary));
    console.log("[ordersAudit] above the market (fields: " + result.worstFields.join(",") + "): " + JSON.stringify(result.worst));
    console.log("[ordersAudit] lifecycle (potential refund is not current credit): " + JSON.stringify(result.rows.slice(0, options && options.top || 12)));
    return undefined;
}

module.exports = { audit, print };
