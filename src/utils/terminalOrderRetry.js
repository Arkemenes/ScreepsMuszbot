// Per-operation failures are temporary; an accepted intent is not a dead order.
const config = require("./config");
function base() { return Math.max(1, config.get("terminalOps.orderRetryBaseTicks", 25)); }
function excluded(op) {
    if (!op.orderRetries && !(op.deadOrderIds || []).length) return [];
    const retries = op.orderRetries || (op.orderRetries = {});
    // Preserve legacy exclusions for one bounded window, including across reset.
    (op.deadOrderIds || []).forEach((id) => {
        if (!retries[id]) retries[id] = { failures: 1, tick: Game.time, retryAfter: Game.time + base(), migrated: true };
    });
    op.deadOrderIds = Object.keys(retries).filter((id) => retries[id].retryAfter > Game.time);
    const next = op.deadOrderIds.map((id) => retries[id].retryAfter);
    if (next.length) op.nextOrderRetryTick = Math.min(...next); else delete op.nextOrderRetryTick;
    return op.deadOrderIds;
}
function failed(op, id) {
    excluded(op);
    const retries = op.orderRetries || (op.orderRetries = {}), failures = Math.min(30, (retries[id] && retries[id].failures || 0) + 1);
    const delay = Math.min(Math.max(base(), config.get("terminalOps.orderRetryMaxTicks", 300)), base() * Math.pow(2, failures - 1));
    retries[id] = { failures, tick: Game.time, retryAfter: Game.time + delay };
    const keep = Math.max(1, config.get("terminalOps.orderRetryHistory", 10));
    Object.keys(retries).sort((a, b) => retries[b].tick - retries[a].tick).slice(keep).forEach((key) => { delete retries[key]; });
    op.deadOrderIds = [];
    excluded(op);
}
function succeeded(op, id) {
    if (op.orderRetries) delete op.orderRetries[id];
    op.deadOrderIds = (op.deadOrderIds || []).filter((other) => other !== id);
    excluded(op);
}
module.exports = { excluded, failed, succeeded };
