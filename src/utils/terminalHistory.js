// Final records are temporary dependencies, not a permanent transaction archive.
const config = require("./config");
const census = require("./census");
const claims = require("./terminalClaims");
const final = (op) => ["completed", "cancelled", "failed"].includes(op.state);
function prune(mem) {
    const ops = mem.operations || {}, ids = Object.keys(ops), keep = new Set(), queue = [], owners = new Set();
    const retention = Math.max(0, config.get("terminalOps.operationRetentionTicks", 0));
    const protect = (id) => { if (ops[id] && !keep.has(id)) { keep.add(id); queue.push(id); } };
    Object.values(Memory.craft && Memory.craft.active || {}).forEach((c) => {
        owners.add("craft:" + (c.ownerId || c.id));
        (c.tradeIds || []).concat(c.sellOpId, c.partialOpId, c.energyOpId, c.energyTransferId,
            Object.values(c.buys || {}).map((b) => b.opId), Object.keys(c.economics && c.economics.operations || {})).forEach(protect);
    });
    Object.entries(Memory.marketFlip && Memory.marketFlip.active || {}).forEach(([r, f]) => {
        owners.add("flip:" + f.room + ":" + r + ":" + f.openedTick);
        protect(f.buyOpId); protect(f.sellOpId);
    });
    census.allOwned().forEach((creep) => { if (creep.memory.terminalJob) protect(creep.memory.terminalJob.operationId); });
    ids.forEach((id) => {
        const op = ops[id], listing = op.marketOrderId && Game.market && Game.market.orders && Game.market.orders[op.marketOrderId];
        const age = Game.time - (op.updatedTick === undefined ? op.createdTick === undefined ? Game.time : op.createdTick : op.updatedTick);
        if (!final(op) || age < retention || owners.has(claims.key(op.owner)) ||
            op.pendingDeal || op.pendingExtension || op.pendingListingCancel ||
            listing && (listing.remainingAmount === undefined ? listing.amount : listing.remainingAmount) > 0) protect(id);
    });
    // Each ID is queued at most once, including malformed cyclic parent links.
    for (let i = 0; i < queue.length && i < ids.length; i++) protect(ops[queue[i]].parentId);
    ids.forEach((id) => {
        if (!keep.has(id)) delete ops[id];
        else owners.add(claims.owner(ops[id]));
    });
    const ownerList = Array.from(owners).filter(Boolean);
    Object.entries(mem.lotTargets || {}).forEach(([key, target]) => {
        if (Game.time - target.updatedTick >= retention && !ownerList.some((owner) => key.startsWith(owner + ":"))) delete mem.lotTargets[key];
    });
}
module.exports = { prune };
