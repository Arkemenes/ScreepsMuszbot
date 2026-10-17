const census = require("./census");
const config = require("./config");
const roomCache = require("./roomCache");
const labReactions = require("./labReactions");
const labReservations = require("./labReservations");

let cacheTick = -1;
let pressureCache = {};

function ensureTick() {
    if (cacheTick === Game.time) return;
    cacheTick = Game.time;
    pressureCache = {};
}

function usedCapacity(store) {
    if (!store) return 0;
    if (typeof store.getUsedCapacity === "function") {
        const used = store.getUsedCapacity();
        if (typeof used === "number") return used;
    }
    return Object.keys(store).reduce(
        (sum, resourceType) =>
            sum + (typeof store[resourceType] === "number" ? store[resourceType] : 0),
        0
    );
}

function capacity(store, resourceType) {
    if (!store || typeof store.getCapacity !== "function") return 0;
    return store.getCapacity(resourceType) || store.getCapacity() || 0;
}

function mineralOutput(room) {
    const mineral = roomCache.minerals(room)[0];
    if (!mineral) return null;
    const container = roomCache.structuresNear(room, mineral.pos, STRUCTURE_CONTAINER, 1)[0];
    const resourceType = mineral.mineralType;
    const amount =
        container && container.store && resourceType
            ? container.store[resourceType] || 0
            : 0;
    const cap = container ? capacity(container.store, resourceType) : 0;
    if (!container || !amount || !cap) return null;
    return {
        kind: "mineralContainer",
        resourceType,
        sourceId: container.id,
        ratio: amount / cap,
    };
}

function labOutput(room) {
    // ROADMAP 0111: a wide reaction has several output labs; ROADMAP 0115: a room may run
    // several reactions - report the fullest output lab of all of them
    let best = null;
    labReactions.list(room.name).forEach((reaction) => {
        const resourceType = reaction.product;
        labReactions.outputsOf(reaction).forEach((id) => {
            if (labReservations.blocked(room.name, id)) return;
            const lab = Game.getObjectById(id);
            const amount = (lab && lab.store && resourceType && lab.store[resourceType]) || 0;
            const cap = lab ? capacity(lab.store, resourceType) : 0;
            if (!lab || !amount || !cap) return;
            if (!best || amount / cap > best.ratio) {
                best = { kind: "labOutput", resourceType, sourceId: lab.id, ratio: amount / cap };
            }
        });
    });
    return best;
}

function factoryOutput(room) {
    const mem = Memory.rooms[room.name];
    const resourceType = mem && mem.factoryProduct;
    if (!resourceType) return null;
    const factory = roomCache.structuresByType(room, STRUCTURE_FACTORY)[0];
    const amount =
        factory && factory.store ? factory.store[resourceType] || 0 : 0;
    const cap = factory ? capacity(factory.store) : 0;
    if (!factory || !amount || !cap) return null;
    return {
        kind: "factoryOutput",
        resourceType,
        sourceId: factory.id,
        ratio: usedCapacity(factory.store) / cap,
    };
}

function outputs(room) {
    ensureTick();
    if (!Object.prototype.hasOwnProperty.call(pressureCache, room.name)) {
        pressureCache[room.name] = [
            mineralOutput(room),
            labOutput(room),
            factoryOutput(room),
        ].filter(Boolean);
    }
    return pressureCache[room.name];
}

function pressuredOutput(room, threshold) {
    const floor =
        threshold === undefined
            ? config.get("mineralHauler.pressureHigh", 0.75)
            : threshold;
    return outputs(room).find((output) => output.ratio >= floor) || null;
}

function creepKey(creep) {
    return creep.name || creep.id;
}

// ROADMAP 0111 (user request, 2026-10-02): there is no longer ONE hauler per
// room allowed to do non-energy work. That exclusivity let a never-empty
// mineral container (always "the" job) keep the single owner busy while a craft
// chain's inputs waited in storage, and it also capped how many chains one room
// could feed at once. Jobs are deduplicated where it matters instead (one
// reagent/component per destination, see hauler.js feedTaken), and the two
// tiers that compete with energy ask keepsEnergyHauler() below.
// mineralHauler.maxConcurrent > 0 restores a hard cap if one is ever wanted.
function busyHaulers(room, exceptKey) {
    return census
        .creepsByRole(room.name, "hauler")
        .filter((creep) => (creep.memory.mineralJob || creep.memory.lootJob) && creepKey(creep) !== exceptKey);
}

function claim(creep) {
    const cap = config.get("mineralHauler.maxConcurrent", 0);
    return !(cap > 0) || busyHaulers(creep.room, creepKey(creep)).length < cap;
}

// Kept so every call site stays as it was: nothing to release any more.
function release() {}

// With no exclusive owner every hauler is "the owner" of its own job.
function isOwner() {
    return true;
}

// True while at least one hauler of the room is NOT on non-energy work. The
// null-energy path may use every hauler (there is nothing to carry anyway); the
// pressured and chain tiers outrank energy that is available, so they must
// always leave one hauler on it.
function keepsEnergyHauler(room) {
    const haulers = census.creepsByRole(room.name, "hauler").length;
    return busyHaulers(room).length < haulers - 1;
}

module.exports = {
    outputs,
    pressuredOutput,
    claim,
    release,
    isOwner,
    keepsEnergyHauler,
};
