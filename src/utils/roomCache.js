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

module.exports = {
    structures,
    myStructures,
    constructionSites,
    structuresByType,
};
