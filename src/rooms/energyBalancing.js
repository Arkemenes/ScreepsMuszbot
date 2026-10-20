// ROADMAP 0097: policy only. Physical terminal work belongs to terminalOps.
const config = require("../utils/config");
const tiers = require("../utils/resourceTiers");
const terminalOps = require("../utils/terminalOps");
const roomCache = require("../utils/roomCache");

function state() {
    if (!Memory.energyBalancing) Memory.energyBalancing = { lastRun: 0, pending: {}, observations: {} };
    const mem = Memory.energyBalancing;
    if (!mem.pending) mem.pending = {};
    if (!mem.observations) mem.observations = {};
    return mem;
}
function snapshot(room) {
    if (!room || !room.storage || !room.terminal) return null;
    const storageCap = room.storage.store.getCapacity(RESOURCE_ENERGY) || 0;
    const terminalCap = room.terminal.store.getCapacity(RESOURCE_ENERGY) || 0;
    const energy = store(room.storage, RESOURCE_ENERGY) + store(room.terminal, RESOURCE_ENERGY);
    const capacity = storageCap + terminalCap;
    const reserve = storageCap * config.get("logistics.reserveRatio", 0.01) + terminalCap * config.get("logistics.terminalReserveRatio", 0.1);
    return { room, energy, capacity, ratio: capacity ? energy / capacity : 0, reserve, excess: Math.max(0, energy - reserve), state: tiers.getEconomyState(room) };
}
function store(structure, resource) { return structure && structure.store && (structure.store[resource] || 0) || 0; }
function activeTransfer(targetName) {
    return terminalOps.activeForRoom(targetName).find((op) => op.kind === "transfer" && op.targetRoom === targetName && op.automatic);
}
function allActiveTransfers(roomName) {
    return terminalOps.activeForRoom(roomName).filter((op) => op.kind === "transfer" && op.resourceType === RESOURCE_ENERGY);
}
function pending(targetName) {
    return terminalOps.activeForRoom(targetName).find((op) => op.kind === "transfer" && op.targetRoom === targetName);
}
function routeQuote(source, target, amount, urgent) {
    return terminalOps.quoteTransfer(source.room.name, target.room.name, RESOURCE_ENERGY, amount, { urgent });
}
function routeEnergy(source, target, amount, urgent) {
    const quote = routeQuote(source, target, amount, urgent);
    if (!quote || !quote.ok) return amount + terminalOps.txCost(amount, source.room.name, target.room.name);
    return quote.route === "relay" ? quote.relay.totalEnergy : quote.direct.totalEnergy;
}
function maxSend(source, target, cap, urgent) {
    const budget = Math.min(source.excess, cap === undefined ? Infinity : cap);
    let low = 0, high = Math.min(budget, config.get("logistics.balanceMaxAmount", 50000));
    while (low < high) {
        const mid = Math.ceil((low + high + 1) / 2);
        if (routeEnergy(source, target, mid, urgent) <= budget) low = mid; else high = mid - 1;
    }
    return low;
}
function criticalNeed(target) {
    const room = target.room;
    const spawnNeed = roomCache.myStructures(room).filter((structure) =>
        (structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) &&
        structure.store && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    ).reduce((sum, structure) => sum + structure.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    return Math.max(0, target.reserve - target.energy, spawnNeed);
}
function distance(left, right) {
    if (Game.map && typeof Game.map.getRoomLinearDistance === "function") return Game.map.getRoomLinearDistance(left.room.name, right.room.name);
    return 0;
}
function observe(target, data) {
    const mem = state();
    mem.observations[target] = Object.assign({ room: target, updatedTick: Game.time }, data);
}
function clearStalePending(entries) {
    const mem = state();
    Object.keys(mem.pending).forEach((target) => {
        const op = terminalOps.operation(mem.pending[target]);
        if (!op || ["completed", "cancelled", "failed"].indexOf(op.state) >= 0) delete mem.pending[target];
    });
    entries.forEach((entry) => {
        const op = pending(entry.room.name);
        if (op && op.automatic) mem.pending[entry.room.name] = op.id;
    });
}
function cancelIfIneligible(target, entries) {
    const mem = state();
    const id = mem.pending[target.room.name];
    const op = id && terminalOps.operation(id);
    if (!op || !op.automatic || ["completed", "cancelled", "failed"].indexOf(op.state) >= 0) return false;
    if (op.loadedAmount > 0 || op.state === "atTerminal" || op.state === "executing" || op.state === "awaitingReceipt" || op.state === "unloading") return false;
    const source = entries.find((entry) => entry.room.name === op.sourceRoom);
    const stillEligible = source && source.state !== "critical" && source.excess > 0 &&
        (target.state === "critical" || source.ratio - target.ratio >= config.get("logistics.balanceGapRatio", 0.2));
    if (stillEligible) return false;
    const cancelled = terminalOps.cancel(op.id);
    if (cancelled.ok) {
        observe(target.room.name, { reason: "target-no-longer-eligible", source: op.sourceRoom, requestedAmount: op.amount, sentAmount: op.sentAmount || 0, state: "cancelled", lastError: null });
        delete mem.pending[target.room.name];
        return true;
    }
    observe(target.room.name, { reason: "cancel-failed", source: op.sourceRoom, requestedAmount: op.amount, sentAmount: op.sentAmount || 0, state: op.state, lastError: cancelled.error });
    return false;
}
// Non-critical rooms are pulled toward the empire-wide energy ratio. A room
// further than balanceGapRatio below it is a target, one further above it is a
// source. Each run plans every disjoint source->target pair at once, because
// terminalOps allows only one energy transfer per room at a time.
function run() {
    if (!config.get("logistics.balanceEnabled", true) || !Array.isArray(Game.myRooms)) return;
    const mem = state();
    // Gate on the cheap interval first: building every room's snapshot and
    // economy state each tick was the whole cost of this subsystem (~1.2 CPU).
    const sinceRun = mem.lastRun ? Game.time - mem.lastRun : Infinity;
    if (mem.lastCheck && Game.time - mem.lastCheck < config.get("logistics.balanceCriticalInterval", 20)) return;
    mem.lastCheck = Game.time;
    const entries = Game.myRooms.map(snapshot).filter(Boolean);
    clearStalePending(entries);
    const critical = entries.filter((entry) => entry.state === "critical");
    const due = sinceRun >= config.get("logistics.balanceInterval", 1000);
    if (!due && !critical.length) return;
    mem.lastRun = Game.time;
    const band = config.get("logistics.balanceGapRatio", 0.005);
    const totalCapacity = entries.reduce((sum, entry) => sum + entry.capacity, 0);
    const meanRatio = totalCapacity ? entries.reduce((sum, entry) => sum + entry.energy, 0) / totalCapacity : 0;
    entries.forEach((entry) => { entry.deficit = Math.max(0, Math.ceil(meanRatio * entry.capacity - entry.energy)); entry.surplus = Math.max(0, Math.floor(entry.energy - meanRatio * entry.capacity)); });
    // A target takes one inbound transfer and never also sends; a source may
    // feed several targets, so its surplus is spent down as transfers are planned.
    const receiving = {}, sending = {};
    entries.forEach((entry) => {
        allActiveTransfers(entry.room.name).forEach((op) => { if (op.targetRoom === entry.room.name) receiving[entry.room.name] = true; else sending[entry.room.name] = true; });
    });
    const targets = entries.slice().sort((a, b) => (b.state === "critical") - (a.state === "critical") || b.deficit - a.deficit);
    for (const target of targets) {
        const name = target.room.name;
        const existing = pending(name);
        if (existing) {
            if (target.state !== "critical") cancelIfIneligible(target, entries);
            else observe(name, { reason: "pending", source: existing.sourceRoom, requestedAmount: existing.amount, sentAmount: existing.sentAmount || 0, state: existing.state, lastError: existing.error || null });
            continue;
        }
        if (target.state !== "critical" && target.state !== "stable" && target.state !== "abundant") continue;
        const isCritical = target.state === "critical";
        if (!isCritical && meanRatio - target.ratio < band) continue;
        if (receiving[name] || sending[name]) { observe(name, { reason: "target-terminal-locked", source: null, requestedAmount: 0, sentAmount: 0, state: "blocked", lastError: null }); continue; }
        const sources = entries.filter((source) => source.room.name !== name && !receiving[source.room.name] && source.state !== "critical" && source.excess > 0 &&
            (isCritical || (source.ratio - meanRatio >= band && source.surplus > 0)))
            .map((source) => {
                const cap = isCritical ? undefined : source.surplus;
                const possible = Math.min(maxSend(source, target, cap, isCritical), isCritical ? Infinity : target.surplus || Infinity);
                const delivered = Math.min(possible, Math.max(0, isCritical ? criticalNeed(target) : Math.max(criticalNeed(target), target.deficit)));
                if (!(delivered > 0)) return null;
                return { source, delivered, energy: routeEnergy(source, target, delivered, isCritical), quote: routeQuote(source, target, delivered, isCritical) };
            }).filter(Boolean)
            .sort((a, b) => a.energy / a.delivered - b.energy / b.delivered || b.delivered - a.delivered ||
                distance(a.source, target) - distance(b.source, target) || a.source.room.name.localeCompare(b.source.room.name));
        const candidate = sources[0];
        const source = candidate && candidate.source;
        if (!source) {
            const lockedSource = entries.some((other) => other.room.name !== name && receiving[other.room.name] && other.state !== "critical" && other.excess > 0 && (isCritical || other.ratio - meanRatio >= band));
            observe(name, { reason: lockedSource ? "source-terminal-locked" : "no-eligible-source", source: null, requestedAmount: 0, sentAmount: 0, state: lockedSource ? "blocked" : "none", lastError: null });
            continue;
        }
        const desired = isCritical ? criticalNeed(target) : Math.max(criticalNeed(target), target.deficit);
        const value = Math.min(candidate.delivered, desired);
        if (value <= 0) { observe(name, { reason: "no-preservable-volume", source: source.room.name, requestedAmount: 0, sentAmount: 0, state: "blocked", lastError: null }); continue; }
        const quote = routeQuote(source, target, value, isCritical);
        const created = terminalOps.transfer(source.room.name, name, RESOURCE_ENERGY, value,
            { automatic: true, reason: target.state, urgent: isCritical });
        if (created.ok) {
            mem.pending[name] = created.id;
            receiving[name] = true; sending[source.room.name] = true;
            const spent = quote && quote.ok ? quote.route === "relay" ? quote.relay.totalEnergy : quote.direct.totalEnergy :
                value + terminalOps.txCost(value, source.room.name, name);
            source.excess = Math.max(0, source.excess - spent);
            source.surplus = Math.max(0, source.surplus - spent);
            const op = terminalOps.operation(created.id);
            observe(name, { reason: target.state, source: source.room.name, requestedAmount: value, sentAmount: 0, state: op.state, lastError: null });
        } else observe(name, { reason: "transfer-rejected", source: source.room.name, requestedAmount: value, sentAmount: 0, state: "rejected", lastError: created.error });
    }
}
function stats(roomName) {
    const observation = state().observations[roomName];
    if (!observation) return { state: "idle", pending: false, requestedAmount: 0, sentAmount: 0, lastError: null };
    const op = observation.source && state().pending[roomName] ? terminalOps.operation(state().pending[roomName]) : null;
    return { state: op ? op.state : observation.state, pending: !!op && op.state !== "completed" && op.state !== "cancelled" && op.state !== "failed", reason: observation.reason || null, source: observation.source || null, target: roomName, requestedAmount: observation.requestedAmount || 0, sentAmount: op ? op.sentAmount || 0 : observation.sentAmount || 0, lastError: (op && op.error) || observation.lastError || null, updatedTick: observation.updatedTick || Game.time };
}
module.exports = { run, snapshot, maxSend, distance, criticalNeed, stats };
