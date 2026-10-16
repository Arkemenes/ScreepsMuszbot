"use strict";
// ROADMAP 0151 / O5: read-only audit of the bot's own market orders (console: ordersAudit()).
// For every own order: how much the creation fee cost (estimate), how old it is, how much is left,
// and where its price stands against the best competing order. Answers "which listings are
// sitting above the market, how much fee did they cost, how long have they been there".
// One market query (getAllOrders) - a console tool, not something that runs every tick.
const FEE = typeof MARKET_FEE === "number" ? MARKET_FEE : 0.05;
const SECONDS_PER_TICK = 4.1; // measured on shard3 (2026-10-15); only used to print days
const DEAD_AGE_DAYS = 7;

function bestCompetitor(book, own, order) {
    // a SELL order competes with the lowest other ask; a BUY order with the highest other bid
    let best = null;
    for (let i = 0; i < book.length; i++) {
        const o = book[i];
        if (!o || o.resourceType !== order.resourceType || o.type !== order.type || own[o.id]) continue;
        const left = o.remainingAmount === undefined ? o.amount : o.remainingAmount;
        if (!(left > 0) || !(o.price > 0)) continue;
        if (best === null || (order.type === ORDER_SELL ? o.price < best : o.price > best)) best = o.price;
    }
    return best;
}

function audit(options) {
    options = options || {};
    const own = Game.market && Game.market.orders || {};
    let book = [];
    try { book = Game.market.getAllOrders() || []; } catch (e) { book = []; }
    const rows = Object.keys(own).map((id) => {
        const o = own[id];
        const left = o.remainingAmount === undefined ? o.amount : o.remainingAmount;
        const total = o.totalAmount === undefined ? o.amount : o.totalAmount;
        const feeEstimate = Math.round(FEE * o.price * total);
        const ageTicks = Game.time - (o.created === undefined ? Game.time : o.created);
        const competitor = left > 0 ? bestCompetitor(book, own, o) : null;
        // gap > 0: a SELL priced above the best ask (or a BUY below the best bid) = not competitive
        const gap = competitor ? (o.type === ORDER_SELL ? o.price / competitor - 1 : 1 - o.price / competitor) : null;
        return { id, type: o.type, resource: o.resourceType, room: o.roomName, price: o.price, left, total, active: !!o.active && left > 0,
            ageDays: Math.round(ageTicks * SECONDS_PER_TICK / 86400 * 10) / 10, feeEstimate, competitor, gap,
            valueLeft: Math.round(left * o.price) };
    });
    const active = rows.filter((r) => r.left > 0);
    const dead = rows.filter((r) => r.left <= 0);
    const stale = active.filter((r) => r.gap !== null && r.gap > (options.gap || 0.05));
    const old = active.filter((r) => r.ageDays >= (options.days || DEAD_AGE_DAYS));
    const sum = (list, key) => list.reduce((n, r) => n + r[key], 0);
    const summary = {
        tick: Game.time, orders: rows.length, active: active.length, finished: dead.length,
        feeEstimateAll: sum(rows, "feeEstimate"), feeEstimateActive: sum(active, "feeEstimate"),
        aboveMarket: stale.length, feeOnAboveMarket: sum(stale, "feeEstimate"), valueOnAboveMarket: sum(stale, "valueLeft"),
        olderThanDays: old.length, feeOnOld: sum(old, "feeEstimate"),
        note: "fee = 5% x price x total amount at the CURRENT price (creation price and extensions are not recorded on the order): an estimate",
    };
    const worst = stale.slice().sort((a, b) => b.feeEstimate * (b.gap || 0) - a.feeEstimate * (a.gap || 0)).slice(0, options.top || 12)
        .map((r) => [r.type === ORDER_SELL ? "sell" : "buy", r.resource, r.room, r.price, r.competitor, Math.round(r.gap * 1000) / 10 + "%", r.left, r.ageDays + "d", r.feeEstimate]);
    return { summary, worstFields: ["type", "resource", "room", "price", "bestCompetitor", "gap", "left", "age", "feeEstimate"], worst };
}

function print(options) {
    const result = audit(options);
    console.log("[ordersAudit] " + JSON.stringify(result.summary));
    console.log("[ordersAudit] above the market (fields: " + result.worstFields.join(",") + "): " + JSON.stringify(result.worst));
    return undefined;
}

module.exports = { audit, print };
