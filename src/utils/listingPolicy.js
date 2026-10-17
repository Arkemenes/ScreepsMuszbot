"use strict";
// ROADMAP 0153: decisions only. Callers own budgets, stock, intents and recovery.
const FEE = 0.05;
const positive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
function executable(order) {
    if (!order || order.active === false) return 0;
    const remaining = order.remainingAmount === undefined ? order.amount : order.remainingAmount;
    const amount = order.amount === undefined ? remaining : Math.min(remaining, order.amount);
    return positive(amount) ? Math.floor(amount) : 0;
}
function competitor(orders, own, resource, type) {
    let best = null;
    for (const order of orders) {
        if (!order || own[order.id] || order.resourceType !== resource || order.type !== type || !positive(order.price) || !executable(order)) continue;
        if (best === null || (type === "sell" ? order.price < best : order.price > best)) best = order.price;
    }
    return best;
}
function sellQuote(input) {
    if (!input.covered || !Array.isArray(input.orders)) return { ok: false, reason: "book-unavailable" };
    if (!positive(input.limit) || !input.basis) return { ok: false, reason: "unknown-basis" };
    const best = competitor(input.orders, input.own || {}, input.resource, "sell");
    if (best === null) return { ok: false, reason: "no-executable-ask" };
    const step = positive(input.step) ? Math.max(0.001, input.step) : 0.001;
    // Market prices have mill precision. Never round an ask upwards into a competitor.
    const price = Math.floor((best - step + 1e-10) * 1000) / 1000;
    const floor = input.limit / (1 - FEE);
    if (!positive(price) || price + 1e-10 < floor) return { ok: false, reason: "floor-above-market", best, floor };
    return { ok: true, price, floor, best };
}
function incrementalFee(kind, price, quantity, oldPrice) {
    if (!positive(price) || !positive(quantity)) return 0;
    const base = kind === "reprice" ? Math.max(0, price - oldPrice) : price;
    // Public engine keeps money in thousandths and rounds fees up in that unit.
    return Math.ceil((base * quantity * FEE) * 1000) / 1000;
}
function extension(quote, price) {
    return !!(quote.ok && positive(price) && price <= quote.price + 1e-10 && price + 1e-10 >= quote.floor);
}
function descent(quote, price, floor) {
    return quote.ok && positive(floor) && quote.price < price && quote.price >= floor ? quote.price : null;
}
function age(order, saved, now) {
    if (saved && positive(saved.createdAt)) return { createdAt: saved.createdAt, source: saved.ageSource };
    if (order && positive(order.createdTimestamp) && order.createdTimestamp <= now)
        return { createdAt: order.createdTimestamp, source: "createdTimestamp" };
    return { createdAt: now, source: "observed-lower-bound" };
}
// Plan only free account resources. Listed and pending quantities remain exposed.
function pixelPlan(input) {
    const held = Math.max(0, Math.floor(input.held || 0));
    const listed = (input.listings || []).reduce((n, o) => n + Math.max(0, o.remainingAmount || 0), 0);
    let free = Math.max(0, held - listed - Math.max(0, input.pending || 0));
    const deals = [];
    if (!positive(input.minBid)) return { deals, extend: 0, keep: free, reason: "unknown-reference" };
    const bids = (input.bids || []).filter((o) => o && !(input.own || {})[o.id] && o.type === "buy" &&
        o.resourceType === "pixel" && positive(o.price) && o.price >= input.minBid && executable(o)).slice().sort((a, b) => b.price - a.price);
    for (const order of bids) {
        const quantity = Math.min(free, executable(order));
        if (quantity) deals.push({ id: order.id, quantity, price: order.price });
        free -= quantity;
        if (!free) break;
    }
    const existing = input.listings && input.listings.length === 1 && input.listings[0];
    const quote = input.quote || {};
    const bestBid = bids.length ? bids[0].price : input.minBid;
    const margin = Number.isFinite(input.margin) && input.margin >= 0 ? input.margin : 0.03;
    const eligible = existing && extension(quote, existing.price) &&
        existing.price * (1 - FEE) >= bestBid * (1 + margin);
    const feeBudget = Math.max(0, Math.min(input.credits || 0, input.budget || 0));
    let extend = eligible ? Math.min(free, Math.floor(feeBudget / (existing.price * FEE))) : 0;
    if (incrementalFee("extend", existing && existing.price, extend) > feeBudget) extend = Math.max(0, extend - 1);
    return { deals, extend, orderId: extend ? existing.id : null, keep: free - extend };
}
module.exports = { executable, competitor, sellQuote, incrementalFee, extension, descent, age, pixelPlan };
