// IDs and assembly membership are independent of the destination room.
const census = require("./census");

function nextId() {
    Memory.squadSequence = (Memory.squadSequence || 0) + 1;
    return "squad" + Game.time + "-" + Memory.squadSequence;
}

function matches(creep, entry) {
    const tag = creep.memory.pendingSquad;
    return !creep.memory.squadId && (tag === entry.id || entry.legacyRoom && tag === entry.legacyRoom);
}

function pending() {
    const queue = Memory.pendingSquads || (Memory.pendingSquads = {});
    const legacy = Memory.pendingSquad;
    if (legacy) {
        legacy.id = nextId();
        legacy.legacyRoom = legacy.room;
        queue[legacy.id] = legacy;
        delete Memory.pendingSquad;
        // census includes creeps still spawning; a late old marker can also
        // resolve the alias when its role eventually calls registerPending.
        for (const c of census.allOwned()) {
            if (matches(c, legacy)) c.memory.pendingSquad = legacy.id;
        }
    }
    return queue;
}

function create(mission, room, from, need) {
    const queue = pending();
    const id = nextId();
    queue[id] = { id, mission, room, from, need: need.slice(), spawned: [] };
    return id;
}

function find(tag) {
    const queue = pending();
    return queue[tag] || Object.values(queue).find((entry) => entry.legacyRoom === tag);
}

function prune(entry) {
    entry.spawned = (entry.spawned || []).filter((id) => {
        const c = Game.getObjectById(id);
        return c && matches(c, entry);
    });
}

function population(entry) {
    prune(entry);
    const seen = new Set();
    const members = [];
    const add = (c) => {
        if (!c || !matches(c, entry) || seen.has(c.id || c.name)) return;
        seen.add(c.id || c.name);
        c.memory.pendingSquad = entry.id;
        members.push(c);
    };
    for (const id of entry.spawned) add(Game.getObjectById(id));
    for (const c of census.allOwned()) add(c);
    return members;
}

module.exports = { pending, create, find, prune, population };
