// Shared cash budget. Flip's ledger also includes craft commitments.
const config = require("./config");
const FINAL = ["completed", "failed", "cancelled"];
let intentTick = -1, intentCredits = 0, intentSpent = 0;
function intentBudget(credits) {
    if (intentTick !== Game.time) { intentTick = Game.time; intentCredits = credits; intentSpent = 0; }
    // Some APIs expose intent effects immediately; never deduct those twice.
    return Math.max(0, intentSpent - Math.max(0, intentCredits - credits));
}
function debit(amount, beforeCredits) {
    intentBudget(beforeCredits);
    intentSpent += Math.max(0, amount);
}
function active(op) { return op && FINAL.indexOf(op.state) < 0; }
function owner(opId) {
    const flips = Memory.marketFlip && Memory.marketFlip.active || {};
    for (const key in flips) {
        const entry = flips[key];
        if (entry.buyOpId === opId) return { reserved: entry.reservedCredits || 0 };
    }
    const chains = Memory.craft && Memory.craft.active || {};
    for (const key in chains) {
        const chain = chains[key];
        if (Object.keys(chain.buys || {}).some((r) => chain.buys[r].opId === opId)) return chain;
    }
    return null;
}
function available(excludeId) {
    const ops = Memory.terminalOps && Memory.terminalOps.operations || {};
    const committed = Memory.marketFlip && Memory.marketFlip.committedCredits || 0;
    let reserved = committed;
    for (const id in ops) {
        const op = ops[id];
        if (!active(op) || op.kind !== "buy") continue;
        const allocation = owner(id);
        const cost = Math.max(0, op.remaining || 0) * (op.limit || 0);
        if (allocation) {
            if (id === excludeId) reserved -= Math.min(allocation.reserved || 0, cost);
        } else if (id !== excludeId) reserved += cost;
    }
    const credits = Game.market && Game.market.credits || 0;
    const orders = Game.market && Game.market.orders || {};
    const managed = new Set(Object.keys(ops).filter((id) => active(ops[id])).map((id) => ops[id].marketOrderId).filter(Boolean));
    Object.keys(orders).forEach((id) => {
        const order = orders[id];
        if (order.type === ORDER_BUY && !managed.has(id))
            reserved += Math.max(0, order.remainingAmount === undefined ? order.amount || 0 : order.remainingAmount) * order.price;
    });
    return Math.max(0, credits - intentBudget(credits) - config.get("stockPolicy.creditReserve", 100000) - Math.max(0, reserved));
}
function automatic(op) { return !!(op.automaticPurchase || op.policy === "swing" || owner(op.id)); }
module.exports = { available, automatic, active, debit };
