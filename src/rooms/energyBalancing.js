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
    return terminalOps.activeForRoom(roomName).filter((op) => op.kind === "transfer");
}
function pending(targetName) {
    return terminalOps.activeForRoom(targetName).find((op) => op.kind === "transfer" && op.targetRoom === targetName);
}
function maxSend(source, target) {
    let low = 0, high = Math.min(source.excess, config.get("logistics.balanceMaxAmount", 50000));
    while (low < high) {
        const mid = Math.ceil((low + high + 1) / 2);
        const cost = terminalOps.txCost(mid, source.room.name, target.room.name);
        if (mid + cost <= source.excess) low = mid; else high = mid - 1;
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
function run() {
    if (!config.get("logistics.balanceEnabled", true) || !Array.isArray(Game.myRooms)) return;
    const mem = state();
    const entries = Game.myRooms.map(snapshot).filter(Boolean);
    clearStalePending(entries);
    const critical = entries.filter((entry) => entry.state === "critical");
    const due = !mem.lastRun || Game.time - mem.lastRun >= config.get("logistics.balanceInterval", 1000);
    if (!critical.length && !due) return;
    mem.lastRun = Game.time;
    for (const target of entries) {
        const existing = pending(target.room.name);
        if (existing) {
            if (target.state !== "critical") cancelIfIneligible(target, entries);
            else observe(target.room.name, { reason: "pending", source: existing.sourceRoom, requestedAmount: existing.amount, sentAmount: existing.sentAmount || 0, state: existing.state, lastError: existing.error || null });
            continue;
        }
        if (target.state !== "critical" && target.state !== "stable" && target.state !== "abundant") continue;
        const sources = entries.filter((source) => source.room.name !== target.room.name && source.state !== "critical" && source.excess > 0 &&
            (target.state === "critical" || source.ratio - target.ratio >= config.get("logistics.balanceGapRatio", 0.2)))
            .sort((a, b) => b.excess - a.excess || distance(a, target) - distance(b, target) || a.room.name.localeCompare(b.room.name));
        const source = sources[0];
        if (!source) { observe(target.room.name, { reason: "no-eligible-source", source: null, requestedAmount: 0, sentAmount: 0, state: "none", lastError: null }); continue; }
        if (allActiveTransfers(source.room.name).some((op) => op.sourceRoom === source.room.name)) {
            observe(target.room.name, { reason: "source-terminal-locked", source: source.room.name, requestedAmount: 0, sentAmount: 0, state: "blocked", lastError: null });
            continue;
        }
        const ratioNeed = Math.max(0, Math.ceil(target.capacity * config.get("logistics.balanceGapRatio", 0.2) - target.energy));
        const desired = target.state === "critical" ? criticalNeed(target) : Math.max(criticalNeed(target), ratioNeed);
        const value = Math.min(maxSend(source, target), desired);
        if (value <= 0) { observe(target.room.name, { reason: "no-preservable-volume", source: source.room.name, requestedAmount: 0, sentAmount: 0, state: "blocked", lastError: null }); continue; }
        const created = terminalOps.transfer(source.room.name, target.room.name, RESOURCE_ENERGY, value, { automatic: true, reason: target.state });
        if (created.ok) {
            mem.pending[target.room.name] = created.id;
            const op = terminalOps.operation(created.id);
            observe(target.room.name, { reason: target.state, source: source.room.name, requestedAmount: value, sentAmount: 0, state: op.state, lastError: null });
        } else observe(target.room.name, { reason: "transfer-rejected", source: source.room.name, requestedAmount: value, sentAmount: 0, state: "rejected", lastError: created.error });
        return;
    }
}
function stats(roomName) {
    const observation = state().observations[roomName];
    if (!observation) return { state: "idle", pending: false, requestedAmount: 0, sentAmount: 0, lastError: null };
    const op = observation.source && state().pending[roomName] ? terminalOps.operation(state().pending[roomName]) : null;
    return { state: op ? op.state : observation.state, pending: !!op && op.state !== "completed" && op.state !== "cancelled" && op.state !== "failed", reason: observation.reason || null, source: observation.source || null, target: roomName, requestedAmount: observation.requestedAmount || 0, sentAmount: op ? op.sentAmount || 0 : observation.sentAmount || 0, lastError: (op && op.error) || observation.lastError || null, updatedTick: observation.updatedTick || Game.time };
}
module.exports = { run, snapshot, maxSend, distance, criticalNeed, stats };
