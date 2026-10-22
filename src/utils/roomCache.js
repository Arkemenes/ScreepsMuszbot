// Per-tick memoisation of room-wide find() calls. Many creeps in the same room
// were each running the same room.find() every tick; this collapses it to one.

let cacheTick = -1;
let cache = {};

function slot(room) {
    if (cacheTick !== Game.time) {
        cacheTick = Game.time;
        cache = {};
    }
    return cache[room.name] || (cache[room.name] = {});
}

function structures(room) {
    const s = slot(room);
    if (!s.structures) s.structures = room.find(FIND_STRUCTURES);
    return s.structures;
}

function hostileStructures(room) {
    const s = slot(room);
    if (!s.hostileStructures) s.hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
    return s.hostileStructures;
}

function myStructures(room) {
    const s = slot(room);
    if (!s.myStructures) s.myStructures = room.find(FIND_MY_STRUCTURES);
    return s.myStructures;
}

function constructionSites(room) {
    const s = slot(room);
    if (!s.sites) s.sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    return s.sites;
}

// A room has at most one mineral deposit, but several callers (roles/
// mineralMiner.js, roles/hauler.js's mineral job, rooms/needs.js's hauler
// count) each used to run their own FIND_MINERALS - collapsed to the same
// one-per-tick slot as every other find() here (constitution).
function minerals(room) {
    const s = slot(room);
    if (!s.minerals) s.minerals = room.find(FIND_MINERALS);
    return s.minerals;
}

function droppedResources(room) {
    const s = slot(room);
    if (!s.droppedResources) s.droppedResources = room.find(FIND_DROPPED_RESOURCES);
    return s.droppedResources;
}

// A dead creep's leftovers (tombstones) and a destroyed structure's
// leftovers (ruins) - roles/hauler.js's battlefieldLootJob wants both.
function tombstones(room) {
    const s = slot(room);
    if (!s.tombstones) s.tombstones = room.find(FIND_TOMBSTONES);
    return s.tombstones;
}

function ruins(room) {
    const s = slot(room);
    if (!s.ruins) s.ruins = room.find(FIND_RUINS);
    return s.ruins;
}

// Every creep in the room that is not ours (allies included), one find per tick: what
// utils/hostiles.getHostiles and structures/rampart each used to search for on their own.
function foreignCreeps(room) {
    const s = slot(room);
    if (!s.foreignCreeps) s.foreignCreeps = room.find(FIND_HOSTILE_CREEPS);
    return s.foreignCreeps;
}

// Own spawns in find() order (callers take [0]): defenders, the idle hauler, the miner,
// combat and spawning each ran their own FIND_MY_SPAWNS - per creep, per tick.
function mySpawns(room) {
    const s = slot(room);
    if (!s.mySpawns) s.mySpawns = room.find(FIND_MY_SPAWNS);
    return s.mySpawns;
}

// Structures of a given type, derived from the cached full list.
function structuresByType(room, structureType) {
    const s = slot(room);
    const byType = s.byType || (s.byType = {});
    if (!byType[structureType]) {
        byType[structureType] = _.filter(
            structures(room),
            (st) => st.structureType === structureType
        );
    }
    return byType[structureType];
}

// Energy sources of the room, one find per tick.
function sources(room) {
    const s = slot(room);
    if (!s.sources) s.sources = room.find(FIND_SOURCES);
    return s.sources;
}

// Structures of `structureType` within `range` of `pos` - the same answer as
// pos.findInRange(FIND_STRUCTURES, range, {filter: type}), but from the cached
// per-type list with a coordinate check. The native call scans EVERY structure
// of the room (and runs inRangeTo on each one) on every call: ~1500 inRangeTo a
// tick in the 2026-10-02 profile, most of it from mineral/source lookups that
// repeat per room, per hauler, per tick.
function structuresNear(room, pos, structureType, range) {
    const list = structuresByType(room, structureType);
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const p = list[i].pos;
        if (Math.abs(p.x - pos.x) <= range && Math.abs(p.y - pos.y) <= range) out.push(list[i]);
    }
    return out;
}

// Every structure within `range` of `pos` (any type), same answer as
// pos.findInRange(FIND_STRUCTURES, range) from the per-tick cached list.
function structuresInRange(room, pos, range) {
    const list = structures(room);
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const p = list[i].pos;
        if (Math.abs(p.x - pos.x) <= range && Math.abs(p.y - pos.y) <= range) out.push(list[i]);
    }
    return out;
}

module.exports = {
    sources,
    foreignCreeps,
    mySpawns,
    structuresInRange,
    structuresNear,
    structures,
    hostileStructures,
    myStructures,
    constructionSites,
    structuresByType,
    minerals,
    droppedResources,
    tombstones,
    ruins,
};
