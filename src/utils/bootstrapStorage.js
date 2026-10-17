// Early central warehouse and its one-way migration into the real storage.
const roomCache = require("./roomCache");
const planStore = require("./planStore");
const census = require("./census");
const terminalClaims = require("./terminalClaims");
const reservations = require("./reservations");

function bufferId(room) {
    const mem = Memory.rooms && Memory.rooms[room.name];
    return mem && mem.bootstrapStorageId;
}

function isBuffer(room, structure) {
    return !!structure && structure.id === bufferId(room);
}

function terminalTile(room) {
    const plan = planStore.getPlan(room.name);
    return plan && plan.buildings.find((b) => b.structureType === STRUCTURE_TERMINAL);
}

function constructionBuildings(room, buildings) {
    if (!room.controller || !room.controller.my || room.controller.level > 3 ||
        room.storage && room.storage.structureType !== STRUCTURE_CONTAINER) return buildings;
    const tile = buildings.find((b) => b.structureType === STRUCTURE_TERMINAL);
    return tile ? buildings.concat({ x: tile.x, y: tile.y, structureType: STRUCTURE_CONTAINER, minimalRCL: 1 }) : buildings;
}

function prepareRoom(room) {
    if (!room.controller || !room.controller.my) return;
    const mem = Memory.rooms[room.name] || (Memory.rooms[room.name] = {});
    let buffer = mem.bootstrapStorageId && Game.getObjectById(mem.bootstrapStorageId);
    if (buffer && (buffer.structureType !== STRUCTURE_CONTAINER || buffer.pos.roomName !== room.name)) buffer = null;
    if (!buffer) delete mem.bootstrapStorageId;
    // Mature rooms without a migration do not need a plan lookup or scan.
    if (!buffer && room.storage && room.storage.structureType !== STRUCTURE_CONTAINER) return;
    if (!buffer) {
        const tile = terminalTile(room);
        if (tile) buffer = roomCache.structuresByType(room, STRUCTURE_CONTAINER)
            .find((s) => s.pos.x === tile.x && s.pos.y === tile.y);
        if (buffer) mem.bootstrapStorageId = buffer.id;
    }
    // The engine provides a fresh, writable room.storage every tick. Keep
    // the alias only on that live Room, never serialize the object.
    if (!room.storage || room.storage.structureType === STRUCTURE_CONTAINER) {
        room.storage = buffer || undefined;
        return;
    }
    if (!buffer || buffer.store.getUsedCapacity() > 0) return;
    const inTransit = census.all("hauler").some((creep) => {
        const job = creep.memory.bootstrapDrain;
        return job && job.fromId === buffer.id && creep.store.getUsedCapacity() > 0;
    });
    // Keep the ID for this tick: queued deliveries must still recognize the
    // retiring container even after an accepted destroy intent.
    if (!inTransit) buffer.destroy();
}

function cancelObsoleteSite(room) {
    if (!room.controller || !room.controller.my || room.controller.level <= 3) return;
    const sites = roomCache.constructionSites(room);
    if (!sites.some((s) => s.structureType === STRUCTURE_CONTAINER)) return;
    const tile = terminalTile(room);
    if (!tile) return;
    for (const site of sites) {
        if (site.structureType === STRUCTURE_CONTAINER && site.pos.x === tile.x && site.pos.y === tile.y)
            site.remove();
    }
}

function runHauler(creep, urgent) {
    const room = creep.room;
    let job = creep.memory.bootstrapDrain;
    if (!job) {
        const id = bufferId(room);
        if (!id || !room.storage || room.storage.structureType !== STRUCTURE_STORAGE ||
            creep.memory.mineralJob || creep.memory.lootJob || creep.store.getUsedCapacity() > 0) return false;
        const from = Game.getObjectById(id);
        if (!from) return false;
        const critical = urgent();
        const resourceType = Object.keys(from.store).find((r) =>
            // Seed a newly built, empty storage even under urgent demand:
            // otherwise that demand can prevent its only supply from moving.
            (!critical || r === RESOURCE_ENERGY && !(room.storage.store[RESOURCE_ENERGY] > 0)) &&
            from.store[r] > terminalClaims.withdrawn(from, r) && room.storage.store.getFreeCapacity(r) > 0);
        if (!resourceType) return false;
        job = creep.memory.bootstrapDrain = { fromId: id, toId: room.storage.id, resourceType, loaded: false };
        reservations.release(creep);
    }
    const resource = job.resourceType;
    const storage = room.storage;
    if (creep.store[resource] > 0) {
        job.loaded = true;
        // Always the real warehouse, including after a rebuild. Full or
        // absent storage preserves cargo and retries on the next tick.
        if (!storage || storage.structureType !== STRUCTURE_STORAGE) return true;
        job.toId = storage.id;
        const amount = Math.min(creep.store[resource], storage.store.getFreeCapacity(resource));
        if (amount > 0 && creep.transfer(storage, resource, amount) === ERR_NOT_IN_RANGE)
            creep.moveTo(storage, { range: 1, reusePath: 10 });
        return true;
    }
    const from = Game.getObjectById(job.fromId);
    if (job.loaded || !from || !isBuffer(room, from) || !storage ||
        storage.structureType !== STRUCTURE_STORAGE ||
        urgent() && (resource !== RESOURCE_ENERGY || storage.store[RESOURCE_ENERGY] > 0)) {
        delete creep.memory.bootstrapDrain;
        return false;
    }
    const amount = Math.min(Math.max(0, (from.store[resource] || 0) - terminalClaims.withdrawn(from, resource)),
        creep.store.getFreeCapacity(resource), storage.store.getFreeCapacity(resource));
    if (!(amount > 0)) { delete creep.memory.bootstrapDrain; return false; }
    const status = creep.withdraw(from, resource, amount);
    if (status === OK) terminalClaims.withdraw(from, resource, amount);
    else if (status === ERR_NOT_IN_RANGE) creep.moveTo(from, { range: 1, reusePath: 10 });
    else delete creep.memory.bootstrapDrain;
    return true;
}

module.exports = { prepareRoom, constructionBuildings, cancelObsoleteSite, isBuffer, runHauler };
