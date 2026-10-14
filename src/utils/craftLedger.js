// Durable lot counters; planned demand never becomes physical stock.
const cache = require("./roomCache");
const chains = () => Object.values(Memory.craft && Memory.craft.active || {});
const value = (s, r) => s && s.store && s.store[r] || 0;
function structures(room) { return cache.structuresByType(room, STRUCTURE_FACTORY).concat(cache.structuresByType(room, STRUCTURE_LAB)); }
function physical(room, r) { return value(room.storage, r) + value(room.terminal, r) + structures(room).reduce((n, s) => n + value(s, r), 0); }
function consume(c, r, q) {
    const recipe = require("./marketPricing").recipeOf(r);
    let basis = 0;
    if (recipe) Object.keys(recipe.components).forEach((k) => {
        const used = q / recipe.amount * recipe.components[k], balance = c.inventory.balances[k] || 0;
        const cost = balance > 0 ? (c.inventory.costs[k] || 0) * Math.min(1, used / balance) : 0;
        basis += cost; c.inventory.costs[k] = Math.max(0, (c.inventory.costs[k] || 0) - cost);
        c.inventory.balances[k] = balance - used;
    });
    return basis;
}
function ensure(c, owns) {
    if (c.inventory) return c.inventory;
    c.inventory = { version: 2, balances: Object.assign({}, owns || {}), costs: {}, costSeen: {}, soldBasis: 0,
        buys: {}, sales: {}, production: {}, pending: [], confidence: owns ? "confirmed" : "reconstructed" };
    const snapshot = require("./market").snapshot();
    let valued = 0;
    Object.entries(owns || {}).forEach(([r, q]) => {
        const resource = snapshot && snapshot.resources[r];
        const price = resource && require("./marketPricing").conservativeBid(r, resource.currentBuy) || 0;
        c.inventory.costs[r] = q * price; valued += q * price;
    });
    if (valued > 0) Object.keys(c.inventory.costs).forEach((r) => { c.inventory.costs[r] *= (c.ownCost || valued) / valued; });
    if (!owns) {
        if (c.state === "working") c.recoveryGraceUntil = Game.time + require("./config").get("craft.legacyRecoveryGraceTicks", 3000);
        (c.queue || []).forEach((i) => Object.entries(i.run && i.run.produced || { [i.product]: i.progress || 0 }).forEach(([r, q]) => {
            if (i.started && r === i.product) i.productionBase = c.inventory.production[r] || 0;
            c.inventory.production[r] = (c.inventory.production[r] || 0) + q;
            c.inventory.balances[r] = (c.inventory.balances[r] || 0) + q; consume(c, r, q);
        }));
    }
    return c.inventory;
}
function economic(op) {
    if (op.accounting) return op.accounting;
    const events = (Memory.terminalOps && Memory.terminalOps.events || []).filter((e) => e.operationId === op.id);
    op.accounting = { credits: events.reduce((n, e) => n + (e.credits || 0), 0), energy: op.transactionCost || 0,
        amount: op.dealtAmount || 0, confidence: events.reduce((n, e) => n + (e.amount || 0), 0) >= (op.dealtAmount || 0) ? "confirmed" : "incomplete" };
    if (op.kind === "buy" && typeof op.buyCredits === "number") {
        op.accounting.credits = -op.buyCredits; op.accounting.confidence = "reconstructed";
    }
    return op.accounting;
}
function record(op, q, credits, energy) {
    const a = economic(op); a.amount += q || 0; a.credits += credits || 0; a.energy += energy || 0;
    const owner = op.owner && typeof op.owner === "object" ? op.owner.kind + ":" + op.owner.id : op.owner;
    const c = chains().find((c) => owner === "craft:" + (c.ownerId || c.id));
    if (c && ["buy", "sell", "transfer"].includes(op.kind)) {
        if (!c.tradeIds) c.tradeIds = [];
        if (!c.tradeIds.includes(op.id)) c.tradeIds.push(op.id);
        sync(c);
    }
}
function reconcileLegacy(c, ops) {
    const inv = c.inventory;
    if (inv.confidence !== "reconstructed" || inv.legacyReconciled) return;
    const economics = c.economics.operations;
    const resource = (id) => economics[id] && economics[id].resource || ops[id] && ops[id].resourceType;
    const sold = Object.entries(inv.sales).filter(([id]) => resource(id) === c.product);
    const tracked = sold.reduce((n, [, q]) => n + q, 0);
    const retired = sold.filter(([id]) => id !== c.partialOpId && id !== c.sellOpId).reduce((n, [, q]) => n + q, 0);
    if (inv.version === 1) {
        // v1 debited soldBase before replaying the same historical sale. Infer
        // that initial debit from output conservation, never from room stock.
        const bought = Object.entries(inv.buys).filter(([id]) => resource(id) === c.product).reduce((n, [, q]) => n + q, 0);
        const initialDebit = Math.max(0, (inv.production[c.product] || 0) + bought - tracked - (inv.balances[c.product] || 0));
        inv.balances[c.product] = (inv.balances[c.product] || 0) + Math.min(c.soldBase || 0, initialDebit);
    }
    inv.legacyUntrackedSold = Math.max(0, (c.soldBase || 0) - retired);
    inv.balances[c.product] = (inv.balances[c.product] || 0) - inv.legacyUntrackedSold;
    // Production proves these inputs existed, but cannot prove their source or
    // historical price. Record the missing history without claiming new stock.
    inv.legacyUntrackedInputs = {};
    Object.entries(inv.balances).forEach(([r, q]) => {
        if (r !== c.product && q < 0) { inv.legacyUntrackedInputs[r] = -q; inv.balances[r] = 0; }
    });
    inv.version = 2; inv.legacyReconciled = true;
}
function sync(c) {
    const inv = ensure(c), ops = Memory.terminalOps && Memory.terminalOps.operations || {};
    if (!inv.costs) { inv.costs = {}; inv.costSeen = {}; inv.soldBasis = 0; inv.confidence = "reconstructed"; }
    const economicOps = (c.economics || (c.economics = { operations: {} })).operations;
    if (!c.tradeIds) c.tradeIds = Object.values(ops).filter((op) => {
        const owner = op.owner && typeof op.owner === "object" ? op.owner.kind + ":" + op.owner.id : op.owner;
        return owner === "craft:" + (c.ownerId || c.id) && ["buy", "sell", "transfer"].includes(op.kind);
    }).map((op) => op.id);
    const ids = new Set(Object.values(c.buys || {}).map((b) => b.opId).concat(c.sellOpId, c.partialOpId, c.energyOpId, c.energyTransferId, c.tradeIds).filter(Boolean));
    ids.forEach((id) => {
        const op = ops[id]; if (!op) return;
        const a = economic(op);
        economicOps[id] = { kind: op.kind, resource: op.resourceType, credits: a.credits, energy: a.energy,
            fees: op.marketFees || 0, amount: a.amount, confidence: op.feeHistoryEstimated ? "incomplete" : a.confidence };
        const q = op.kind === "buy" ? op.resourceType === RESOURCE_ENERGY ?
            op.netBought === undefined ? Math.max(0, (op.dealtAmount || 0) - (op.transactionCost || 0)) : op.netBought : op.dealtAmount || 0 : op.dealtAmount || 0;
        const seen = op.kind === "buy" ? inv.buys : inv.sales;
        if (op.kind === "transfer" && op.targetRoom === c.room) {
            const received = op.receivedAmount || 0, previous = inv.buys[id] || 0;
            inv.balances[op.resourceType] = (inv.balances[op.resourceType] || 0) + received - previous;
            c.ownCost = (c.ownCost || 0) + (received - previous) * (op.recoveryUnitPrice || 0);
            inv.costs[op.resourceType] = (inv.costs[op.resourceType] || 0) + (received - previous) * (op.recoveryUnitPrice || 0);
            inv.buys[id] = received;
            economicOps[id].energy = op.sentAmount > 0 ? op.transactionCost || 0 : 0;
        }
        if (["buy", "sell"].includes(op.kind)) {
            if (op.kind === "buy") {
                const cost = -a.credits + (op.marketFees || 0) + (op.resourceType === RESOURCE_ENERGY ? 0 : a.energy * (op.energyFairPrice || 0));
                inv.costs[op.resourceType] = (inv.costs[op.resourceType] || 0) + cost - (inv.costSeen[id] || 0);
                inv.costSeen[id] = cost;
            } else {
                const balance = inv.balances[op.resourceType] || 0;
                const basis = balance > 0 ? (inv.costs[op.resourceType] || 0) * Math.min(1, Math.max(0, q - (seen[id] || 0)) / balance) : 0;
                inv.soldBasis += basis; inv.costs[op.resourceType] = Math.max(0, (inv.costs[op.resourceType] || 0) - basis);
            }
            inv.balances[op.resourceType] = (inv.balances[op.resourceType] || 0) + (q - (seen[id] || 0)) * (op.kind === "buy" ? 1 : -1);
            seen[id] = q;
        }
    });
    reconcileLegacy(c, ops);
    return inv;
}
function totals(c) {
    sync(c); let spent = 0, revenue = 0, energy = 0, known = true, salesEnergy = 0, salesFees = 0;
    Object.values(c.economics.operations).forEach((a) => {
        if (a.kind === "buy") spent -= a.credits; else revenue += a.credits;
        spent += a.fees;
        if (a.resource !== RESOURCE_ENERGY || a.kind !== "buy") energy += a.energy;
        if (a.kind === "sell") { salesEnergy += a.energy; salesFees += a.fees; }
        if (a.confidence === "incomplete") known = false;
    });
    if (Object.values(c.buys || {}).some((b) => !c.economics.operations[b.opId])) known = false;
    const sold = Object.values(c.economics.operations).filter((a) => a.kind === "sell").reduce((n, a) => n + a.amount, 0);
    if (sold < (c.soldBase || 0)) known = false;
    return { spent, revenue, energy, known, salesEnergy, salesFees };
}
function production(s, r, q) {
    const c = chains().find((c) => c.room === s.room.name && c.state === "working" && (c.queue || []).slice(c.qi || 0)
        .some((i) => i.started && !i.finished && (i.product === r || i.policy && i.targets[r])));
    if (!c) return;
    const inv = sync(c);
    if (inv.production[r] === undefined) inv.production[r] = 0;
    const recipe = require("./marketPricing").recipeOf(r);
    const growth = q - (recipe && recipe.components[r] || 0) * q / (recipe && recipe.amount || q);
    if (!inv.pending.some((p) => p.id === s.id && p.tick === Game.time))
        inv.pending.push({ id: s.id, product: r, quantity: q, growth, before: value(s, r), tick: Game.time });
}
function settle(c) {
    const inv = sync(c);
    inv.pending = inv.pending.filter((p) => {
        if (p.tick >= Game.time) return true;
        const s = Game.getObjectById(p.id);
        if (s && value(s, p.product) >= p.before + (p.growth === undefined ? p.quantity : p.growth)) {
            const basis = consume(c, p.product, p.quantity);
            inv.balances[p.product] = (inv.balances[p.product] || 0) + p.quantity;
            inv.costs[p.product] = (inv.costs[p.product] || 0) + basis;
            inv.production[p.product] = (inv.production[p.product] || 0) + p.quantity;
        }
        return false;
    });
}
function canProduce(s, r, quantity) {
    const c = chains().find((c) => c.room === s.room.name && (c.queue || []).some((i) => i.kind === "factory" && i.started && !i.finished && i.product === r));
    if (!c) return true;
    if (c.state !== "working" || c.energyWait || c.materialWait) return false;
    const item = c.queue[c.qi || 0], inv = ensure(c);
    const produced = inv.production[r] === undefined ? item.progress || 0 : inv.production[r] - (item.productionBase || 0);
    const pending = inv.pending.filter((p) => p.product === r).reduce((n, p) => n + p.quantity, 0);
    return produced + pending + quantity <= item.target;
}
function migrateOwners() {
    const active = Memory.craft && Memory.craft.active || {}, counts = {};
    Object.values(active).forEach((c) => { counts[c.id] = (counts[c.id] || 0) + 1; });
    Object.entries(active).forEach(([key, c]) => {
        if (counts[c.id] <= 1 || c.ownerId) return;
        c.ownerId = c.id + ":" + key;
        Object.values(c.buys || {}).map((b) => b.opId).concat(c.sellOpId, c.partialOpId, c.energyOpId, c.energyTransferId).filter(Boolean).forEach((id) => {
            const op = Memory.terminalOps && Memory.terminalOps.operations && Memory.terminalOps.operations[id];
            if (op) op.owner = { kind: "craft", id: c.ownerId };
        });
    });
}
function tick() { migrateOwners(); chains().forEach(settle); }
function preempt(room, source, resource, quantity) {
    let left = quantity;
    chains().filter((c) => c.room === room.name).forEach((c) => {
        if (!left) return;
        const inv = sync(c), balance = Math.max(0, inv.balances[resource] || 0);
        const take = Math.min(left, warehouse(c, room, resource));
        if (!take || !balance) return;
        const basis = (inv.costs[resource] || 0) * take / balance;
        inv.balances[resource] -= take; inv.costs[resource] = Math.max(0, (inv.costs[resource] || 0) - basis);
        inv.preemptedBasis = (inv.preemptedBasis || 0) + basis; left -= take;
    });
}
function warehouse(c, room, r) {
    const q = Math.max(0, sync(c).balances[r] || 0);
    const ids = new Set(Object.keys(c.holds || {}));
    (c.queue || []).filter((i) => i.started && !i.finished).forEach((i) => {
        [i.input1, i.input2, i.output].concat(i.outputs || [], i.run && i.run.observation && i.run.observation.ids || [])
            .filter(Boolean).forEach((id) => ids.add(id));
    });
    const factoryOwned = (c.queue || []).some((i) => i.kind === "factory" && i.started);
    const held = structures(room).filter((s) => s.structureType === STRUCTURE_FACTORY ? factoryOwned : ids.has(s.id))
        .reduce((n, s) => n + value(s, r), 0);
    return Math.max(0, q - Math.min(q, held));
}
function reconcileStranded(room) {
    const entries = Memory.craft && Memory.craft.stranded || {}, occupied = {}, free = {};
    const add = (r, q) => { occupied[r] = (occupied[r] || 0) + Math.max(0, q || 0); };
    const local = chains().filter((c) => c.room === room.name);
    local.forEach((c) => Object.entries(sync(c).balances).forEach(([r, q]) => add(r, q)));
    Object.entries(Memory.marketFlip && Memory.marketFlip.active || {}).forEach(([r, f]) => {
        if (f.room === room.name) add(r, f.quantity);
    });
    const managed = new Set();
    Object.values(Memory.terminalOps && Memory.terminalOps.operations || {}).forEach((op) => {
        if (["completed", "failed", "cancelled"].includes(op.state)) return;
        if (op.marketOrderId) managed.add(op.marketOrderId);
        const linked = local.some((c) => c.sellOpId === op.id || c.partialOpId === op.id || c.energyOpId === op.id || Object.values(c.buys || {}).some((b) => b.opId === op.id));
        if (linked) return;
        if (op.sourceRoom === room.name && ["sell", "transfer"].includes(op.kind)) add(op.resourceType, op.remaining);
        if (op.sourceRoom === room.name && op.kind === "buy") add(op.resourceType, op.netBought === undefined ? op.dealtAmount : op.netBought);
        if (op.targetRoom === room.name && op.kind === "receipt") add(op.resourceType, (op.amount || 0) - (op.receivedAmount || 0));
    });
    Object.entries(Game.market && Game.market.orders || {}).forEach(([id, o]) => {
        if (!managed.has(id) && o.roomName === room.name && o.type === ORDER_SELL) add(o.resourceType, o.remainingAmount === undefined ? o.amount : o.remainingAmount);
    });
    Object.values(entries).filter((e) => e.room === room.name).sort((a, b) => (a.tick || 0) - (b.tick || 0)).forEach((e) => {
        Object.keys(e.items || {}).forEach((r) => {
            if (!(r in free)) free[r] = Math.max(0, physical(room, r) - (occupied[r] || 0));
            e.items[r] = Math.min(e.items[r] || 0, free[r]); free[r] -= e.items[r];
            if (!e.items[r]) delete e.items[r];
        }); e.inventoryVersion = 1;
    });
}
function releaseRecovered(room) {
    reconcileStranded(room);
    const recovered = Memory.craft && Memory.craft.recovered || (Memory.craft.recovered = {});
    Object.entries(Memory.craft.stranded || {}).forEach(([id, entry]) => {
        if (entry.room !== room.name || entry.released) return;
        // Transfer the reconciled balance to the room pool once; it no longer
        // blocks new chains. Retain provenance/cost instead of silently deleting it.
        recovered[id] = { room: entry.room, items: Object.assign({}, entry.items), spent: entry.spent,
            costs: entry.costs && Object.assign({}, entry.costs), confidence: entry.confidence || "estimated", tick: Game.time };
        entry.items = {}; entry.released = true;
    });
    const retained = Object.keys(recovered).sort((a, b) => recovered[b].tick - recovered[a].tick);
    const keep = require("./config").get("craft.recoveredKeep", 20);
    retained.slice(keep).forEach((id) => { if (!Object.values(recovered[id].items).some((q) => q > 0)) delete recovered[id]; });
}
function recoveredBasis(room, owns, adoptId) {
    let extra = 0, estimated = false;
    const remaining = Object.assign({}, owns || {});
    const snap = require("./market").snapshot();
    Object.values(Memory.craft && Memory.craft.recovered || {}).filter((e) => e.room === room.name).forEach((e) => {
        const quantities = Object.keys(remaining).filter((r) => (e.items[r] || 0) > 0 && remaining[r] > 0);
        if (!quantities.length) return;
        // Legacy entries cannot prove a per-resource basis. Carry their entire
        // unpaid basis conservatively to the first new lot rather than inventing
        // a historical unit price or counting it again in multiple lots.
        let basis = 0;
        quantities.forEach((r) => {
            const take = Math.min(remaining[r], e.items[r]); remaining[r] -= take;
            const resource = snap && snap.resources[r];
            const price = resource && require("./marketPricing").conservativeBid(r, resource.currentBuy) || 0;
            if (e.costs && e.confidence === "confirmed") {
                const cost = (e.costs[r] || 0) * take / e.items[r];
                extra += Math.max(0, cost - take * price); basis += cost;
                if (adoptId) e.costs[r] = Math.max(0, (e.costs[r] || 0) - cost);
            }
            if (adoptId) e.items[r] -= take;
        });
        if (!e.costs || e.confidence !== "confirmed") { extra += Math.max(0, e.spent || 0); estimated = true; }
        if (adoptId) {
            e.spent = estimated ? 0 : Math.max(0, (e.spent || 0) - basis); e.adoptedBy = adoptId;
        }
    });
    return { extra, estimated };
}
module.exports = { ensure, economic, record, sync, totals, production, canProduce, settle, tick, preempt, migrateOwners, warehouse, physical, reconcileStranded, releaseRecovered, recoveredBasis };
