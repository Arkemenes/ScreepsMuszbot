// Quantitative physical claims shared by terminal operations and consumers.
const census = require("./census");
const operationIndex = require("./terminalIndex");
const FINAL = ["completed", "failed", "cancelled"];
let intentTick = -1, intents = {};
function key(owner) { return owner && typeof owner === "object" ? owner.kind + ":" + owner.id : owner || null; }
function owner(op) {
    if (!op) return null;
    if (op.kind === "receipt" && op.parentId) {
        const parent = Memory.terminalOps && Memory.terminalOps.operations && Memory.terminalOps.operations[op.parentId];
        if (parent && parent.kind !== "receipt") return owner(parent);
    }
    if (op.owner) return key(op.owner);
    const chains = Memory.craft && Memory.craft.active || {};
    for (const id in chains) {
        const c = chains[id];
        if (c.sellOpId === op.id || c.partialOpId === op.id || Object.keys(c.buys || {}).some((r) => c.buys[r].opId === op.id))
            return key(op.owner = { kind: "craft", id: c.ownerId || c.id || id });
    }
    const flips = Memory.marketFlip && Memory.marketFlip.active || {};
    for (const r in flips) {
        const f = flips[r];
        if (f.buyOpId === op.id || f.sellOpId === op.id)
            return key(op.owner = { kind: "flip", id: f.room + ":" + r + ":" + f.openedTick });
    }
    return key(op.owner = op.policy === "swing" ? { kind: "swing", id: op.sourceRoom + ":" + op.resourceType } : { kind: "manual", id: op.id });
}
function active(op) { return op && FINAL.indexOf(op.state) < 0; }
function feeClaim(op) { return Math.max(0, op.feeLoadedAmount || 0, op.pendingDeal && op.pendingDeal.cost || 0); }
function outgoing(op, room, resource) {
    return active(op) && op.sourceRoom === room.name && op.resourceType === resource &&
        (op.kind === "sell" || op.kind === "transfer" && !(op.sentAmount > 0));
}
function value(source, resource) { return source && source.store && Math.max(0, source.store[resource] || 0) || 0; }
function ledger(source, resource) {
    if (intentTick !== Game.time) { intentTick = Game.time; intents = {}; }
    return source.id + ":" + resource;
}
function withdrawn(source, resource) { const k = ledger(source, resource); return intents[k] || 0; }
function withdraw(source, resource, quantity) { const k = ledger(source, resource); intents[k] = (intents[k] || 0) + Math.max(0, quantity); }
function carried(op, room, resource) {
    return census.creepsByRole(room.name, "hauler").reduce((sum, c) => {
        const job = c.memory.terminalJob;
        return sum + (job && job.operationId === op.id && job.direction === "load" && job.resourceType === resource ? value(c, resource) : 0);
    }, 0);
}
// ROADMAP 0147 diagnostic (temporary): where does one reservation query spend its CPU?
// claimsSpans(false) in the console turns the three spans off; off costs three boolean checks.
let spansOn = false; // claimsSpans(true) turns the claims/fuel diagnostics on (ROADMAP 0147)
global.claimsSpansOn = false;
global.claimsSpans = function (on) { spansOn = on !== false; global.claimsSpansOn = spansOn; console.log("[claimsSpans] " + (spansOn ? "on" : "off")); };
function physicalReservations(room, resource, excludeId, excludeOwner) {
    const cpuMeter = spansOn ? require("./cpuMeter") : null;
    let mark = spansOn ? Game.cpu.getUsed() : 0;
    const lap = (name) => { const now = Game.cpu.getUsed(); cpuMeter.record("spans", name, now - mark); mark = now; };
    const ops = operationIndex.forRoom(room.name);
    const managed = new Set(ops.map((op) => op.marketOrderId).filter(Boolean));
    let terminal = 0, unstaged = 0;
    ops.forEach((op) => {
        if (!active(op)) return;
        // Accepted intents remain funded even against their own owner's jobs.
        const intentFee = op.sourceRoom === room.name && resource === RESOURCE_ENERGY ? Math.max(0, op.pendingDeal && op.pendingDeal.cost || 0) : 0;
        const intentCargo = op.sourceRoom === room.name && op.kind === "sell" && op.resourceType === resource ? Math.max(0, op.pendingDeal && op.pendingDeal.quantity || 0) : 0;
        terminal += intentFee + intentCargo;
        if (op.id === excludeId || excludeOwner && owner(op) === key(excludeOwner)) return;
        if (resource === RESOURCE_ENERGY && op.sourceRoom === room.name) terminal += Math.max(0, feeClaim(op) - intentFee);
        if (op.targetRoom === room.name && op.resourceType === resource && (op.kind === "receipt" || op.kind === "transfer" && op.sentAmount > 0)) {
            terminal += Math.max(0, op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0));
            return;
        }
        if (!outgoing(op, room, resource) || op.id === excludeId || excludeOwner && owner(op) === key(excludeOwner)) return;
        const left = Math.max(0, op.remaining || 0);
        const order = op.marketOrderId && Game.market && Game.market.orders && Game.market.orders[op.marketOrderId];
        const published = order ? Math.max(0, order.remainingAmount === undefined ? order.amount || 0 : order.remainingAmount) : 0;
        const staged = Math.min(left, Math.max(op.loadedAmount || 0, published));
        terminal += Math.max(0, staged - intentCargo);
        if (op.kind === "transfer" && resource === RESOURCE_ENERGY && op.loadedAmount > left) terminal += op.loadedAmount - left;
        unstaged += Math.max(0, left - staged - carried(op, room, resource));
    });
    if (spansOn) lap("claims.reserve.ops");
    Object.entries(Game.market && Game.market.orders || {}).forEach(([id, order]) => {
        if (!managed.has(id) && order.roomName === room.name && order.type === ORDER_SELL && order.resourceType === resource)
            terminal += Math.max(0, order.remainingAmount === undefined ? order.amount || 0 : order.remainingAmount);
    });
    if (spansOn) lap("claims.reserve.orders");
    // Existing physical storage backs unstaged cargo; excess spills into the terminal.
    Object.values(Memory.craft && Memory.craft.active || {}).forEach((c) => {
        if (c.room !== room.name || !c.inventory || excludeOwner && key(excludeOwner) === "craft:" + (c.ownerId || c.id)) return;
        const backed = ops.filter((op) => active(op) && owner(op) === "craft:" + (c.ownerId || c.id) && op.resourceType === resource)
            .reduce((n, op) => {
                if (outgoing(op, room, resource)) return n + Math.max(0, op.remaining || 0);
                const parent = op.parentId && Memory.terminalOps.operations[op.parentId];
                return n + (op.kind === "receipt" && parent && parent.kind === "buy" ? Math.max(0, op.amount - (op.receivedAmount || 0)) : 0);
            }, 0);
        unstaged += Math.max(0, require("./craftLedger").warehouse(c, room, resource) - backed);
    });
    if (spansOn) lap("claims.reserve.craft");
    const storage = Math.min(unstaged, value(room.storage, resource));
    terminal += unstaged - storage;
    return { storage, terminal };
}
function physicalFree(room, source, resource, excludeId, excludeOwner) {
    const pending = withdrawn(source, resource);
    if (value(source, resource) <= pending) return 0;
    if (source !== room.storage && source !== room.terminal) return Math.max(0, value(source, resource) - pending);
    const reserved = physicalReservations(room, resource, excludeId, excludeOwner);
    return Math.max(0, value(source, resource) - reserved[source === room.terminal ? "terminal" : "storage"] - pending);
}
// One decision only: never retain balances, reservations or ledger results.
function physicalPool(room, resource, excludeId, excludeOwner) {
    const storage = Math.max(0, value(room.storage, resource) - (room.storage ? withdrawn(room.storage, resource) : 0));
    const terminal = Math.max(0, value(room.terminal, resource) - (room.terminal ? withdrawn(room.terminal, resource) : 0));
    if (!storage && !terminal) return 0;
    const reserved = physicalReservations(room, resource, excludeId, excludeOwner);
    return Math.max(0, storage - reserved.storage) + Math.max(0, terminal - reserved.terminal);
}
module.exports = { key, owner, active, outgoing, feeClaim, physicalFree, physicalPool, withdrawn, withdraw, carried };
