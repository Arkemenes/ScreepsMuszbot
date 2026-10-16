// Fuel forecasts share no market scan: consumers publish their validated quotes.
const config = require("./config");
const accounting = require("./marketAccounting");
function enabled() { return config.get("terminalFuel.enabled", true); }
function value(s) { return s && s.store && Math.max(0, s.store[RESOURCE_ENERGY] || 0) || 0; }
function scarce(room) {
    const target = require("./resourcePolicy").target(room, RESOURCE_ENERGY) || 0;
    return value(room.storage) < target * config.get("terminalFuel.scarceStorageRatio", 0.1);
}
function optionalAllowed(room, cost) {
    if (!enabled() || !scarce(room)) return true;
    const committed = require("./resourcePolicy").commitments(room)[RESOURCE_ENERGY] || 0;
    const available = Math.max(0, value(room.storage) + value(room.terminal) - committed);
    return Number.isFinite(cost) && cost <= available * config.get("terminalFuel.scarceOptionalRatio", 0.1);
}
// ROADMAP 0147 diagnostic (temporary): which part of plan() costs its ~0,4 CPU per call?
// Spans fuel.plan.{scarce,ops,commit,obs}; they share claimsSpans(false) with the claims spans.
function plan(room) {
    const timed = global.claimsSpansOn ? require("./cpuMeter") : null;
    let mark = timed ? Game.cpu.getUsed() : 0;
    const lap = (name) => { if (!timed) return; const now = Game.cpu.getUsed(); timed.record("spans", name, now - mark); mark = now; };
    const low = scarce(room);
    lap("fuel.plan.scarce");
    let optionalLimit;
    const optional = (cost) => {
        if (!enabled() || !low) return true;
        if (optionalLimit === undefined) {
            const commitStart = timed ? Game.cpu.getUsed() : 0;
            const committed = require("./resourcePolicy").commitments(room)[RESOURCE_ENERGY] || 0;
            if (timed) { timed.record("spans", "fuel.plan.commit", Game.cpu.getUsed() - commitStart); mark += Game.cpu.getUsed() - commitStart; }
            optionalLimit = Math.max(0, value(room.storage) + value(room.terminal) - committed) *
                config.get("terminalFuel.scarceOptionalRatio", 0.1);
        }
        return Number.isFinite(cost) && cost <= optionalLimit;
    };
    const all = Memory.terminalOps && Memory.terminalOps.operations || {};
    const ops = Object.keys(all).map((id) => all[id]).filter((op) => accounting.active(op) && op.sourceRoom === room.name);
    let cargo = 0, funded = 0;
    const quotes = [], covered = new Set();
    const age = config.get("terminalFuel.quoteMaxAge", 300);
    ops.forEach((op) => {
        if (op.kind === "sell" || op.kind === "transfer" && (!(op.sentAmount > 0) || op.sentTick === Game.time)) {
            if (op.resourceType === RESOURCE_ENERGY) {
                const loaded = Math.max(0, op.loadedAmount || 0);
                const goods = Math.min(loaded, Math.max(0, op.remaining || op.amount || 0));
                cargo += goods;
                if (op.kind === "transfer") funded += Math.max(0, loaded - goods);
            }
        }
        funded += Math.max(0, op.feeLoadedAmount || 0);
        if (op.pendingDeal && op.pendingDeal.tick === Game.time)
            funded += Math.max(0, op.pendingDeal.cost - (op.feeLoadedAmount || 0));
        if (op.marketOnly || ["listing", "listed", "settling", "awaitingReceipt", "unloading", "recovering"].indexOf(op.state) >= 0) return;
        let cost = 0, paid = Math.max(0, op.feeLoadedAmount || 0);
        if (op.kind === "transfer" && !(op.sentAmount > 0) && op.waitingDirection !== "unload") {
            const quantity = op.remaining || op.amount || 0;
            const held = op.resourceType === RESOURCE_ENERGY ? value(room.storage) + value(room.terminal) :
                (room.storage.store[op.resourceType] || 0) + (room.terminal.store[op.resourceType] || 0);
            cost = Game.market && Game.market.calcTransactionCost ? Game.market.calcTransactionCost(quantity, room.name, op.targetRoom) : 0;
            if (!op.targetRoom || !Number.isFinite(cost) || held < quantity + (op.resourceType === RESOURCE_ENERGY ? cost : 0)) return;
            if (op.resourceType === RESOURCE_ENERGY) paid += Math.max(0, (op.loadedAmount || 0) - quantity);
        } else if (op.fuelQuote && Game.time >= op.fuelQuote.tick && Game.time - op.fuelQuote.tick <= age) cost = op.fuelQuote.cost;
        if (!Number.isFinite(cost) || !(cost > 0) || op.policy === "swing" && op.kind === "sell" && !optional(cost)) return;
        quotes.push({ cost, paid, priority: op.kind === "buy" && op.resourceType === RESOURCE_ENERGY ? 0 : 1, tick: op.createdTick || 0 });
        covered.add(op.id);
    });
    lap("fuel.plan.ops");
    const observations = Memory.swing && Memory.swing.observations || {};
    Object.keys(observations).forEach((key) => {
        const q = observations[key];
        if (q.room !== room.name || q.reason !== "eligible" || !(q.cost > 0) ||
            q.tick > Game.time || Game.time - q.tick > age || q.opId && covered.has(q.opId) ||
            q.opId ||
            q.kind === "sell" && !optional(q.cost)) return;
        quotes.push({ cost: q.cost, paid: 0, priority: q.kind === "buy" && q.resourceType === RESOURCE_ENERGY ? 0 : 1, tick: q.tick });
    });
    lap("fuel.plan.obs");
    quotes.sort((a, b) => a.priority - b.priority || a.tick - b.tick);
    const next = quotes.slice(0, Math.max(0, config.get("terminalFuel.transactions", 2)));
    const forecast = next.reduce((n, q) => n + q.cost, 0);
    const missing = next.reduce((n, q) => n + Math.max(0, q.cost - q.paid), 0);
    const margin = low ? 0 : Math.ceil(forecast * config.get("terminalFuel.margin", 0.2));
    return { forecast, funded, cargo, margin, unfunded: missing + margin,
        reserve: funded + missing + margin, keep: cargo + funded + missing + margin, transactions: next.length, scarce: low };
}
function reserve(room) {
    if (!enabled()) return Math.floor((room.terminal && room.terminal.store.getCapacity(RESOURCE_ENERGY) || 0) * config.get("logistics.terminalReserveRatio", 0.1));
    return plan(room).reserve;
}
function keep(room) { return enabled() ? plan(room).keep : reserve(room); }
function unfunded(room) { return enabled() ? plan(room).unfunded : reserve(room); }
// A decision-local budget: callers may share it within one synchronous
// selection, but each later selection must observe current operations/stock.
function budget(room) {
    if (enabled()) return plan(room);
    const floor = reserve(room);
    return { keep: floor, reserve: floor };
}
function transit(room, intoTerminal, excludeName) {
    return require("./census").creepsByRole(room.name, "hauler").reduce((sum, creep) => {
        if (creep.name === excludeName) return sum;
        const job = creep.memory.terminalJob || creep.memory.mineralJob;
        if (!job || job.resourceType !== RESOURCE_ENERGY ||
            (intoTerminal ? job.toId : job.fromId) !== room.terminal.id) return sum;
        const carrying = value(creep);
        const quantity = carrying || Math.min(job.amount === undefined ? Infinity : job.amount, creep.store.getFreeCapacity(RESOURCE_ENERGY));
        return sum + Math.max(0, quantity);
    }, 0);
}
function releasable(room, forecast) {
    const current = forecast || budget(room);
    const excess = Math.max(0, value(room.terminal) - current.keep);
    return excess > Math.ceil(current.reserve * config.get("terminalFuel.releaseRatio", 0.25)) ? excess : 0;
}
global.terminalFuelStatus = (name) => {
    const rooms = name ? [Game.rooms[name]] : Object.values(Game.rooms || {}).filter((r) => r.controller && r.controller.my);
    return rooms.filter((r) => r && r.storage && r.terminal).map((r) => Object.assign({ room: r.name, enabled: enabled() }, plan(r)));
};
module.exports = { enabled, plan, reserve, keep, unfunded, budget, releasable, optionalAllowed, transit };
