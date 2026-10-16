// ROADMAP 0124: destinations and quantitative commitments shared by logistics/market.
const config = require("./config");
const census = require("./census");
const accounting = require("./marketAccounting");
const terminalClaims = require("./terminalClaims");
let withdrawalTick = -1;
let withdrawals = {};
function withdrawalKey(source, resource) {
    if (withdrawalTick !== Game.time) { withdrawalTick = Game.time; withdrawals = {}; }
    return source.id + ":" + resource;
}
function recordConsumerWithdraw(source, resource, quantity) {
    const key = withdrawalKey(source, resource);
    withdrawals[key] = (withdrawals[key] || 0) + quantity;
    terminalClaims.withdraw(source, resource, quantity);
}
function value(s, r) { return s && s.store && Math.max(0, s.store[r] || 0) || 0; }
function targets(room) {
    const result = Object.assign({}, config.get("stockPolicy.targets", { energy: 100000 }),
        config.get("stockPolicy.rooms." + room.name + ".targets", {}));
    Object.keys(result).forEach((r) => { if (!Number.isFinite(result[r]) || result[r] < 0) delete result[r]; });
    return result;
}
function target(room, r) {
    const local = config.get("stockPolicy.rooms." + room.name + ".targets", {}) || {};
    const global = config.get("stockPolicy.targets", { energy: 100000 }) || {};
    const value = Object.prototype.hasOwnProperty.call(local, r) ? local[r] :
        Object.prototype.hasOwnProperty.call(global, r) ? global[r] : undefined;
    return Number.isFinite(value) && value >= 0 ? value : undefined;
}
function used(room, r) { return target(room, r) !== undefined; }
function operations(room) {
    return require("./terminalIndex").forRoom(room.name);
}
function carried(room, r) { return census.creepsByRole(room.name, "hauler").reduce((n, c) => n + value(c, r), 0); }
function stock(room, r) { return value(room.storage, r) + value(room.terminal, r) + carried(room, r); }
function incoming(room, r, excludeId) {
    return operations(room).reduce((n, op) => {
        if (op.id === excludeId || op.resourceType !== r) return n;
        if (op.kind === "buy" && op.sourceRoom === room.name) return n + Math.max(0, op.remaining || 0);
        if (op.kind === "transfer" && op.targetRoom === room.name && !(op.sentAmount > 0)) return n + (op.remaining || op.amount || 0);
        return n;
    }, 0);
}
function terminalReserve(room) {
    return require("./terminalFuel").reserve(room);
}

function deficit(room, r, excludeId) {
    const wanted = target(room, r);
    if (wanted === undefined) return 0;
    return Math.max(0, wanted + (r === RESOURCE_ENERGY ? require("./terminalFuel").keep(room) : 0) - stock(room, r) - incoming(room, r, excludeId));
}
function terminalFree(room, excludeId, keepFloor) {
    if (!room.terminal) return 0;
    const s = room.terminal.store;
    const cap = s.getCapacity() || 0;
    let pending = 0;
    operations(room).forEach((op) => {
        if (op.id === excludeId) return;
        if (op.kind === "buy" && op.sourceRoom === room.name) pending += op.remaining || 0;
        else if (op.kind === "transfer" && op.targetRoom === room.name && !(op.sentAmount > 0)) pending += op.amount || 0;
        else if (op.sourceRoom === room.name && (op.kind === "sell" || op.kind === "transfer") && !(op.sentAmount > 0))
            pending += Math.max(0, (op.remaining || 0) - (op.loadedAmount || 0));
    });
    const fuel = Math.max(0, (keepFloor === undefined ? require("./terminalFuel").keep(room) : keepFloor) - value(room.terminal, RESOURCE_ENERGY));
    return Math.max(0, s.getFreeCapacity() - Math.ceil(cap * config.get("stockPolicy.terminalFreeRatio", 0.15)) - pending - fuel);
}
function destination(room, r) {
    if (config.get("stockPolicy.enabled", true) && r && !used(room, r) && terminalFree(room) > 0) return room.terminal;
    if (room.storage && room.storage.store.getFreeCapacity(r) > 0) return room.storage;
    if (room.terminal && terminalFree(room) > 0) return room.terminal;
    return null;
}
// Only an owner's own active BUY can fund a future stock reservation.
// Outstanding material is incoming inventory, not a claim on a paid sale.
function pendingPurchase(room, resource, id) {
    const op = id && Memory.terminalOps && Memory.terminalOps.operations && Memory.terminalOps.operations[id];
    return op && accounting.active(op) && op.kind === "buy" && op.sourceRoom === room.name &&
        op.resourceType === resource ? Math.max(0, op.remaining || 0) : 0;
}
// Consumers may use newly arrived excess, but never outgoing cargo. Allocate
// staged/listed stock to the terminal and the unstaged remainder to storage.
function consumerAvailable(room, source, resource, owner) {
    return terminalClaims.physicalFree(room, source, resource, null, owner);
}
function commitments(room, excludeId) {
    const sums = {}, coveredOps = {};
    const roomOps = operations(room);
    const excludedOp = Memory.terminalOps && Memory.terminalOps.operations && Memory.terminalOps.operations[excludeId];
    const excludedOwner = excludedOp ? terminalClaims.owner(excludedOp) : excludeId;
    const add = (r, q) => { if (r) sums[r] = (sums[r] || 0) + Math.max(0, q || 0); };
    const flips = Memory.marketFlip && Memory.marketFlip.active || {};
    Object.keys(flips).forEach((r) => {
        const f = flips[r];
        if (f.room !== room.name) return;
        if (excludeId && (f.buyOpId === excludeId || f.sellOpId === excludeId || excludedOwner === "flip:" + f.room + ":" + r + ":" + f.openedTick)) {
            coveredOps[f.buyOpId] = coveredOps[f.sellOpId] = true; return;
        }
        add(r, Math.max(0, f.quantity - pendingPurchase(room, r, f.buyOpId)));
        coveredOps[f.buyOpId] = coveredOps[f.sellOpId] = true;
    });
    const chains = Memory.craft && Memory.craft.active || {};
    Object.keys(chains).forEach((key) => {
        const c = chains[key];
        if ((c.room || key.split(":")[0]) !== room.name) return;
        if (excludeId && (c.id === excludeId || excludedOwner === "craft:" + (c.ownerId || c.id))) {
            Object.keys(c.buys || {}).forEach((r) => { coveredOps[c.buys[r].opId] = true; });
            coveredOps[c.sellOpId] = coveredOps[c.partialOpId] = true;
            return;
        }
        const local = {};
        if (c.inventory) {
            // one structure scan for every balance of the chain (ROADMAP 0147), same values as per-resource calls
            const resources = Object.keys(c.inventory.balances), held = require("./craftLedger").warehouseMany(c, room, resources);
            resources.forEach((r) => add(r, held[r]));
            Object.keys(c.buys || {}).forEach((r) => { coveredOps[c.buys[r].opId] = true; });
            coveredOps[c.sellOpId] = coveredOps[c.partialOpId] = coveredOps[c.energyOpId] = true;
            roomOps.forEach((op) => {
                const parent = op.parentId && Memory.terminalOps.operations[op.parentId];
                if (op.kind === "receipt" && parent && parent.kind === "buy" && terminalClaims.owner(op) === "craft:" + (c.ownerId || c.id)) coveredOps[op.id] = true;
            });
            return;
        }
        const protect = (r, q) => { if (r) local[r] = Math.max(local[r] || 0, q || 0); };
        protect(c.product, c.qty);
        Object.keys(c.buys || {}).forEach((r) => { protect(r, c.buys[r].qty); coveredOps[c.buys[r].opId] = true; });
        coveredOps[c.sellOpId] = coveredOps[c.partialOpId] = true;
        const demand = {};
        (c.queue || []).forEach((item, index) => {
            if (index < (c.qi || 0)) return;
            protect(item.product, item.target);
            if (item.policy) {
                (item.order || []).forEach((p) => {
                    const left = Math.max(0, (item.targets[p] || 0) - (item.run && item.run.produced[p] || 0));
                    protect(p, left);
                    const recipe = require("./marketPricing").recipeOf(p);
                    if (recipe) Object.keys(recipe.components).forEach((r) => {
                        demand[r] = (demand[r] || 0) + Math.ceil(left / recipe.amount) * recipe.components[r];
                    });
                });
                return;
            }
            const recipe = require("./marketPricing").recipeOf(item.product);
            if (recipe) Object.keys(recipe.components).forEach((r) => {
                demand[r] = (demand[r] || 0) + Math.ceil((item.target || 0) / recipe.amount) * recipe.components[r];
            });
            else { protect(item.a, Infinity); protect(item.b, Infinity); }
        });
        Object.keys(demand).forEach((r) => protect(r, demand[r]));
        Object.keys(c.holds || {}).forEach((id) => protect(c.holds[id], Infinity));
        Object.keys(local).forEach((r) => {
            const buy = c.buys && c.buys[r];
            add(r, Math.max(0, local[r] - Math.min(buy && buy.qty || 0,
                pendingPurchase(room, r, buy && buy.opId))));
        });
    });
    const stranded = Memory.craft && Memory.craft.stranded || {};
    Object.keys(stranded).forEach((key) => {
        const e = stranded[key];
        // Sweep releases these entries; retain until it has actually done so.
        if (e.room === room.name) Object.keys(e.items || {}).forEach((r) => add(r, e.items[r]));
    });
    roomOps.forEach((op) => {
        if (op.id === excludeId || coveredOps[op.id] || excludedOwner && terminalClaims.owner(op) === excludedOwner) return;
        if (op.sourceRoom === room.name && (op.kind === "sell" || op.kind === "transfer"))
            add(op.resourceType, op.kind === "transfer" && op.sentAmount > 0 ? 0 : op.remaining);
        if (op.sourceRoom === room.name && op.kind === "buy") add(op.resourceType, Math.max(0, op.dealtAmount || 0));
        if (op.targetRoom === room.name && op.kind === "receipt") add(op.resourceType, Math.max(0, op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0)));
    });
    // Legacy/manual market orders can exist without a terminalOps operation.
    const listed = Game.market && Game.market.orders || {};
    const managed = new Set(roomOps.map((op) => op.marketOrderId).filter(Boolean));
    Object.keys(listed).forEach((id) => {
        const order = listed[id];
        if (!managed.has(id) && order.roomName === room.name && order.type === ORDER_SELL)
            add(order.resourceType, order.remainingAmount === undefined ? order.amount : order.remainingAmount);
    });
    const mem = Memory.rooms && Memory.rooms[room.name] || {};
    if (mem.factoryProduct && !mem.factoryProductAuto) {
        add(mem.factoryProduct, Infinity);
        const recipe = require("./marketPricing").recipeOf(mem.factoryProduct);
        if (recipe) Object.keys(recipe.components).forEach((r) => add(r, Infinity));
    }
    const reactions = mem.labReactions || (mem.labReaction ? [mem.labReaction] : []);
    if (!mem.labReactionAuto) reactions.forEach((rx) => { add(rx.a, Infinity); add(rx.b, Infinity); add(rx.product, Infinity); });
    if (!mem.labLoadAuto) Object.keys(mem.labLoad || {}).forEach((id) => {
        const resources = mem.labLoad[id];
        (Array.isArray(resources) ? resources : [resources]).forEach((r) => add(r, Infinity));
    });
    // Cargo already assigned to a consumer is never available for liquidation.
    census.creepsByRole(room.name, "hauler").forEach((c) => {
        const job = c.memory.mineralJob;
        if (job) add(job.resourceType, value(c, job.resourceType));
    });
    return sums;
}
function available(room, r, excludeId) {
    if (used(room, r)) return 0;
    // Hauler cargo is counted for replenishment, never offered for sale.
    return Math.max(0, value(room.storage, r) + value(room.terminal, r) - (commitments(room, excludeId)[r] || 0));
}
module.exports = { targets, target, used, stock, incoming, deficit, terminalReserve, terminalFree, destination, commitments, available, consumerAvailable, recordConsumerWithdraw, value, operations };
