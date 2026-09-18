const census = require("./census");
const config = require("./config");
const roomCache = require("./roomCache");

let cacheTick = -1;
let pressureCache = {};
let ownerByRoom = {};

function ensureTick() {
    if (cacheTick === Game.time) return;
    cacheTick = Game.time;
    pressureCache = {};
    ownerByRoom = {};
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
    const container = mineral.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTAINER,
    })[0];
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
    const mem = Memory.rooms[room.name];
    const reaction = mem && mem.labReaction;
    if (!reaction) return null;
    const lab = Game.getObjectById(reaction.output);
    const resourceType = reaction.product;
    const amount =
        lab && lab.store && resourceType ? lab.store[resourceType] || 0 : 0;
    const cap = lab ? capacity(lab.store, resourceType) : 0;
    if (!lab || !amount || !cap) return null;
    return {
        kind: "labOutput",
        resourceType,
        sourceId: lab.id,
        ratio: amount / cap,
    };
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

function owner(room) {
    ensureTick();
    if (!Object.prototype.hasOwnProperty.call(ownerByRoom, room.name)) {
        const active = census
            .creepsByRole(room.name, "hauler")
            .filter((creep) => creep.memory.mineralJob)
            .sort((left, right) => creepKey(left).localeCompare(creepKey(right)));
        ownerByRoom[room.name] = active.length ? creepKey(active[0]) : null;
    }
    return ownerByRoom[room.name];
}

function claim(creep) {
    const current = owner(creep.room);
    const key = creepKey(creep);
    if (current && current !== key) return false;
    ownerByRoom[creep.room.name] = key;
    return true;
}

function release(creep) {
    if (owner(creep.room) === creepKey(creep)) {
        ownerByRoom[creep.room.name] = null;
    }
}

function isOwner(creep) {
    return owner(creep.room) === creepKey(creep);
}

module.exports = {
    outputs,
    pressuredOutput,
    claim,
    release,
    isOwner,
};