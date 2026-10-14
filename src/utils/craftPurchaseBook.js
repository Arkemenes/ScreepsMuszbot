// Scan-local quantities; never persist the order book or game objects.
const orderBook = require("./orderBook");
const purchaseCost = require("./purchaseCost");

function create(snapshot) {
    const pricing = require("./marketPricing");
    const balances = {}, books = {};
    const quotes = new Map();
    const energy = snapshot.resources[RESOURCE_ENERGY] || {};
    const energyPrice = energy.fairPrice || energy.currentSell || 0;
    function orders(resource) {
        if (!books[resource]) books[resource] = orderBook.matching(ORDER_SELL, resource).filter((o) =>
            (o.amount === undefined ? o.remainingAmount : o.amount) > 0 && o.price > 0 && o.roomName && !(Game.market.orders || {})[o.id]);
        return books[resource];
    }
    function amount(o) { return o.amount === undefined ? o.remainingAmount : o.amount; }
    function available(o) { return Math.max(0, amount(o) - (balances[o.id] || 0)); }
    function quote(room, resource, quantity, limit = Infinity, conservative = true) {
        const key = [room, resource, quantity, limit, conservative].join(":");
        if (quotes.has(key)) return quotes.get(key);
        const medianAsk = conservative ? pricing.conservativeAsk(resource,
            (snapshot.resources[resource] || {}).currentSell) : 0;
        if (conservative && !(medianAsk > 0)) return { ok: false, reason: "no-ask", quantity };
        const evaluate = (o, q) => {
            const freight = Game.market.calcTransactionCost(q, room, o.roomName);
            return purchaseCost.evaluate({ resourceType: resource, limit },
                conservative ? Math.max(o.price, medianAsk) : o.price, q, freight, energyPrice);
        };
        const sorted = orders(resource).map((o) => {
            const q = Math.min(quantity, available(o));
            return { o, q, evaluation: q > 0 ? evaluate(o, q) : null };
        }).filter((x) => x.evaluation && x.evaluation.ok)
            .sort((a, b) => a.evaluation.effective - b.evaluation.effective || a.o.id.localeCompare(b.o.id));
        let remaining = quantity, cost = 0, freight = 0, ceiling = 0, netAmount = 0;
        const allocations = [];
        for (const item of sorted) {
            const q = Math.min(remaining, available(item.o));
            if (!(q > 0)) continue;
            const ev = evaluate(item.o, q);
            if (!ev.ok) continue;
            allocations.push({ orderId: item.o.id, quantity: q, effective: ev.effective });
            cost += ev.effective * ev.netAmount;
            netAmount += ev.netAmount;
            freight += ev.cost;
            ceiling = Math.max(ceiling, ev.effective);
            remaining -= q;
            if (!remaining) break;
        }
        const result = { ok: remaining === 0, reason: remaining ? "liq-depth" : null,
            quantity, available: quantity - remaining, cost, unit: cost / quantity,
            ceiling, freight, netAmount, allocations };
        quotes.set(key, result);
        return result;
    }
    function reserve(q) {
        q.allocations.forEach((a) => { balances[a.orderId] = (balances[a.orderId] || 0) + a.quantity; });
        quotes.clear();
    }
    const operations = Object.values((Memory.terminalOps || {}).operations || {})
        .filter((op) => op.kind === "buy" && !["completed", "cancelled", "failed"].includes(op.state))
        .sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0));
    // Accepted deals are still visible in this tick's book. Pin their exact
    // quantity first, then reserve only what the operation still needs.
    operations.forEach((op) => {
        const pending = op.pendingDeal;
        if (pending && pending.tick === Game.time) {
            const id = pending.orderId;
            if (id) balances[id] = (balances[id] || 0) + pending.quantity;
        }
    });
    operations.forEach((op) => {
        const deal = op.pendingDeal;
        const order = deal && orders(op.resourceType).find((o) => o.id === deal.orderId);
        const confirmed = deal && (deal.tick === Game.time || order && amount(order) <= deal.orderRemaining - deal.quantity);
        const pending = confirmed ? deal.quantity || 0 : 0;
        const quantity = Math.max(0, (op.remaining || 0) - pending);
        if (quantity && op.sourceRoom) reserve(quote(op.sourceRoom, op.resourceType, quantity, op.limit, false));
    });
    function quoteNet(room, resource, needed) {
        if (resource !== RESOURCE_ENERGY) return quote(room, resource, needed);
        let low = needed, high = orders(resource).reduce((n, o) => n + available(o), 0);
        let result = quote(room, resource, high);
        if (!result.ok || result.netAmount < needed) return Object.assign({}, result, { ok: false, reason: "liq-depth" });
        for (let pass = 0; pass < 32 && low < high; pass++) {
            const middle = Math.floor((low + high) / 2), candidate = quote(room, resource, middle);
            if (candidate.ok && candidate.netAmount >= needed) high = middle;
            else low = middle + 1;
        }
        result = quote(room, resource, high);
        return Object.assign({}, result, { ok: result.ok && result.netAmount >= needed, neededNet: needed, unit: result.cost / needed });
    }
    return { quote, quoteNet, reserve };
}
module.exports = { create };
