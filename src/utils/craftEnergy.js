// Stage-local recovery: net energy, one request, bounded by the lot's economics.
const config = require("./config");
const ledger = require("./craftLedger");
const market = require("./market");
function ready(room, chain, item) {
    if (item.kind !== "factory") return true;
    const recipe = require("./marketPricing").recipeOf(item.product);
    const produced = Math.max(0, item.progress || 0);
    const needed = Math.max(0, Math.ceil((item.target - produced) / recipe.amount) * (recipe.components[RESOURCE_ENERGY] || 0));
    if (!needed) return true;
    const factory = require("./roomCache").structuresByType(room, STRUCTURE_FACTORY)[0];
    const held = factory && factory.store[RESOURCE_ENERGY] || 0;
    const claims = require("./terminalClaims"), owner = "craft:" + (chain.ownerId || chain.id);
    const pool = claims.physicalPool(room, RESOURCE_ENERGY, null, owner);
    const floor = room.storage.store.getCapacity ? require("./resourceTiers").reserveFloor(room) : 0;
    const deficit = Math.max(0, needed - held - Math.max(0, pool - floor));
    if (!deficit) {
        const inv = ledger.sync(chain);
        const allocate = Math.max(0, needed - (inv.balances[RESOURCE_ENERGY] || 0));
        if (allocate) {
            inv.balances[RESOURCE_ENERGY] = (inv.balances[RESOURCE_ENERGY] || 0) + allocate;
            const snap = market.snapshot();
            chain.ownCost += allocate * ((snap && snap.resources.energy && snap.resources.energy.currentBuy) || 0);
            inv.costs[RESOURCE_ENERGY] = (inv.costs[RESOURCE_ENERGY] || 0) + allocate * ((snap && snap.resources.energy && snap.resources.energy.currentBuy) || 0);
        }
        delete chain.energyWait;
        return true;
    }
    const ops = require("./terminalOps");
    const op = chain.energyOpId && ops.operation(chain.energyOpId);
    const previousWait = chain.energyWait;
    chain.energyWait = { reason: "energy-deficit", needed, held, available: Math.max(0, pool - floor), deficit,
        reserve: floor, since: chain.energyWait && chain.energyWait.since || Game.time };
    const replenishment = ops.activeForRoom(room.name).find((p) => p.resourceType === RESOURCE_ENERGY &&
        p.kind === "transfer" && p.targetRoom === room.name);
    if (replenishment) { chain.energyWait.reason = "energy-transfer-pending"; chain.energyWait.opId = replenishment.id; return false; }
    if (op && !["completed", "failed", "cancelled"].includes(op.state)) {
        chain.energyWait.reason = "energy-receipt-pending"; chain.energyWait.opId = op.id;
        if ((op.netBought || op.receivedAmount || 0) > (chain.energyProgress || 0)) {
            chain.energyProgress = op.netBought || op.receivedAmount; chain.stateTick = Game.time;
        }
        return false;
    }
    if (chain.energyCheckTick && Game.time - chain.energyCheckTick < config.get("craft.energyRetryTicks", 30)) {
        if (previousWait && ["energy-margin-budget", "energy-no-offer", "energy-no-quote", "energy-buy-refused"].includes(previousWait.reason)) {
            chain.energyWait.reason = previousWait.reason;
            if (previousWait.economics) chain.energyWait.economics = previousWait.economics;
            if (previousWait.detail) chain.energyWait.detail = previousWait.detail;
        }
        return false;
    }
    chain.energyCheckTick = Game.time;
    const snapshot = market.snapshot();
    if (!snapshot) { chain.energyWait.reason = "energy-no-quote"; return false; }
    const totals = ledger.totals(chain), energyPrice = snapshot.resources.energy && snapshot.resources.energy.currentSell || 0;
    const knownCost = totals.known ? totals.spent + totals.energy * energyPrice + chain.ownCost : chain.est.cost;
    const margin = config.get("craft.minSaleMargin", 0.01);
    const budget = Math.max(0, Math.min(chain.est.revenue / (1 + margin) - knownCost - chain.qty * energyPrice,
        config.get("craft.maxCashAbsolute", 1000000) - totals.spent,
        (Game.market.credits || 0) * config.get("craft.maxChainRatio", 0.05) - totals.spent,
        require("./marketAccounting").available()));
    // Preserve the room floor: funding only the recipe while the room is empty
    // would leave the factory blocked by the ordinary logistics reserve gate.
    const net = Math.ceil(deficit + Math.max(0, floor - pool));
    const economics = chain.energyWait.economics = { checkedTick: Game.time, recipeDeficit: deficit,
        reserveDeficit: Math.max(0, floor - pool), netNeeded: net, knownCost, known: totals.known,
        spent: totals.spent, energyPrice, budget, donors: [] };
    // An internal sender can bootstrap an empty receiver. Do not disturb
    // existing factory work or spend another owner's energy.
    const sources = Object.values(Game.rooms || {}).filter((r) => r.name !== room.name && r.controller && r.controller.my && r.storage && r.terminal && r.storage.store.getCapacity)
        .map((r) => {
            const available = claims.physicalFree(r, r.storage, RESOURCE_ENERGY) - require("./resourceTiers").reserveFloor(r);
            const freight = ops.txCost(net, r.name, room.name);
            return { room: r.name, available, freight, cost: (net + freight) * energyPrice };
        }).filter((s) => Number.isFinite(s.freight) && s.freight >= 0 && s.available >= net + s.freight)
        .sort((a, b) => a.cost - b.cost || a.room.localeCompare(b.room));
    for (const source of sources) {
        const diagnostic = { ...source, reason: !totals.known ? "unknown-cost" : !(energyPrice > 0) ? "no-energy-reference" : source.cost > budget ? "margin-budget" : "eligible" };
        economics.donors.push(diagnostic);
        if (diagnostic.reason !== "eligible") continue;
        const sent = ops.transfer(source.room, room.name, RESOURCE_ENERGY, net, { automatic: true, owner: { kind: "craft", id: (chain.ownerId || chain.id) }, reason: "craft-energy-recovery", recoveryUnitPrice: energyPrice });
        if (sent.ok) { chain.energyTransferId = sent.id; chain.energyWait.reason = "energy-transfer-pending"; chain.energyWait.opId = sent.id; return false; }
        diagnostic.reason = sent.error;
    }
    if (pool <= 0) {
        chain.energyWait.bootstrap = "await-local-energy-or-internal-transfer";
        chain.energyWait.batteries = room.storage.store.battery || 0;
        const conversion = typeof COMMODITIES !== "undefined" && COMMODITIES.energy;
        if (chain.energyWait.batteries && conversion) chain.energyWait.batteryBlock = item.started ? "factory-busy" :
            (conversion.components.energy || 0) > pool ? "conversion-bootstrap-energy" : "conversion-not-selected";
    }
    const quote = require("./craftPurchaseBook").create(snapshot).quoteNet(room.name, RESOURCE_ENERGY, net);
    economics.quote = { ok: quote.ok, reason: quote.reason, quantity: quote.quantity, netAmount: quote.netAmount,
        cost: quote.cost, effective: quote.unit, ceiling: quote.ceiling };
    const conversion = typeof COMMODITIES !== "undefined" && COMMODITIES.energy;
    if (!item.started && conversion && conversion.components && conversion.amount > (conversion.components.energy || 0) &&
        net <= conversion.amount - (conversion.components.energy || 0) && pool - floor >= (conversion.components.energy || 0)) {
        const inputs = Object.keys(conversion.components).filter((r) => r !== RESOURCE_ENERGY);
        const costs = {};
        const feasible = inputs.every((r) => {
            const data = snapshot.resources[r], quantity = conversion.components[r];
            const price = data && require("./marketPricing").conservativeBid(r, data.currentBuy);
            if (!(price > 0) || claims.physicalPool(room, r, null, owner) < quantity) return false;
            costs[r] = quantity * price; return true;
        });
        const cost = Object.values(costs).reduce((n, q) => n + q, 0) + (conversion.components.energy || 0) * energyPrice;
        if (totals.known && feasible && cost <= budget && (!quote.ok || cost <= quote.cost)) {
            const inv = ledger.sync(chain);
            inputs.forEach((r) => {
                const additional = Math.max(0, conversion.components[r] - (inv.balances[r] || 0));
                inv.balances[r] = (inv.balances[r] || 0) + additional;
                const basis = costs[r] * additional / conversion.components[r];
                inv.costs[r] = (inv.costs[r] || 0) + basis; chain.ownCost += basis;
            });
            chain.queue.splice(chain.qi || 0, 0, { kind: "factory", product: RESOURCE_ENERGY, target: conversion.amount,
                energy: conversion.components.energy || 0, bootstrap: true });
            chain.energyWait.reason = "battery-conversion-planned";
            return false;
        }
    }
    if (!quote.ok) { chain.energyWait.reason = "energy-no-offer"; return false; }
    if (!totals.known || quote.cost > budget) { chain.energyWait.reason = "energy-margin-budget"; return false; }
    const bought = ops.buy(room.name, RESOURCE_ENERGY, quote.quantity, Math.min(budget / net, quote.ceiling * (1 + config.get("craft.buySlack", 0.02))),
        false, true, { automaticPurchase: true, owner: { kind: "craft", id: (chain.ownerId || chain.id) } });
    if (bought.ok) { chain.energyOpId = bought.id; chain.energyProgress = 0; chain.energyWait.opId = bought.id; }
    else { chain.energyWait.reason = "energy-buy-refused"; chain.energyWait.detail = bought.error; }
    return false;
}
module.exports = { ready };
