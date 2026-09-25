// Every stored / dropped energy source in a room, all equal priority - the
// caller just takes whichever is closest by path. Shared by builder.js and
// pioneer.js (ROADMAP 0037) - was a local copy in builder.js, extracted here
// once a second role needed the exact same list (constitution §5). Cached
// per tick per room (roomCache.js's own idiom) - every builder/pioneer in
// the room used to rebuild this same list from scratch.
let energyPilesTick = -1;
let energyPilesCache = {};
function energyPiles(room) {
    if (energyPilesTick !== Game.time) {
        energyPilesTick = Game.time;
        energyPilesCache = {};
    }
    if (energyPilesCache[room.name]) return energyPilesCache[room.name];

    const piles = [];

    for (const r of room.find(FIND_DROPPED_RESOURCES)) {
        if (r.resourceType === RESOURCE_ENERGY && r.amount >= 50) piles.push(r);
    }
    for (const t of room.find(FIND_TOMBSTONES)) {
        if (t.store[RESOURCE_ENERGY] >= 50) piles.push(t);
    }
    for (const ruin of room.find(FIND_RUINS)) {
        if (ruin.store[RESOURCE_ENERGY] >= 50) piles.push(ruin);
    }
    for (const s of roomCache.structures(room)) {
        if (!s.store || s.store[RESOURCE_ENERGY] < 50) continue;
        const isStore =
            s.structureType === STRUCTURE_STORAGE ||
            s.structureType === STRUCTURE_CONTAINER;
        // never drain a collector link - only the miner feeds it, and it feeds
        // the base link network
        const isReceivingLink =
            s.structureType === STRUCTURE_LINK && !s.isCollector();
        if (isStore || isReceivingLink) piles.push(s);
    }

    // A pile sitting in the attack zone isn't a valid target for a
    // non-combat creep (utils/combat.js's excludeDangerZone, ROADMAP 0107
    // follow-up, user request) - filtered here, once, so both callers
    // (builder.js, pioneer.js) inherit it for free instead of each
    // re-checking. No-op outside our own rooms under attack (pioneer's
    // foreign/spawnless-room case: mem.defenseActive is only ever set for a
    // room we own, so this never touches pioneer's own separate
    // hostile-avoidance gate in rooms/pioneering.js).
    energyPilesCache[room.name] = combat.excludeDangerZone(piles, room);
    return energyPilesCache[room.name];
}

const roomCache = require("./roomCache");
const combat = require("./combat");

function findNearbyFullSource(creep) {
    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    if (!freeCapacity) return null;

    return creep.pos.findClosestByRange(FIND_SOURCES, {
        filter: (source) =>
            creep.pos.getRangeTo(source) <= 5 &&
            source.energy >= freeCapacity &&
            !combat.isDangerous(source.pos, creep.room),
    });
}

// true when the room runs both collector links (next to a source) and
// non-collector links (the receiving end of the link network)
function hasLinkNetwork(room) {
    const links = _.filter(
        roomCache.myStructures(room),
        (s) => s.structureType === STRUCTURE_LINK
    );
    if (links.length < 2) return false;

    const collectors = links.filter((link) => link.isCollector()).length;
    return collectors > 0 && collectors < links.length;
}

// A non-collector (receiving) link - where energy arrives from the source
// collector links. Creeps that can pull from it wait next to one when the
// room is otherwise dry. `opts.awayFromController` skips the controller link
// so hungry haulers/builders don't steal the upgrader's supply.
function receivingLink(room, pos, opts) {
    opts = opts || {};
    let links = _.filter(
        roomCache.myStructures(room),
        (l) => l.structureType === STRUCTURE_LINK && !l.isCollector()
    );
    if (opts.awayFromController && room.controller) {
        const away = _.filter(
            links,
            (l) => l.pos.getRangeTo(room.controller) > 2
        );
        if (away.length) links = away;
    }
    links = combat.excludeDangerZone(links, room);
    if (!links.length) return null;
    return pos ? pos.findClosestByRange(links) : links[0];
}

module.exports = { energyPiles, findNearbyFullSource, hasLinkNetwork, receivingLink };
