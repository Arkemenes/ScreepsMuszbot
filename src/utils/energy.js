// Every stored / dropped energy source in a room, all equal priority - the
// caller just takes whichever is closest by path. Shared by builder.js and
// pioneer.js (ROADMAP 0037) - was a local copy in builder.js, extracted here
// once a second role needed the exact same list (constitution §5).
function energyPiles(room) {
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

    return piles;
}

const roomCache = require("./roomCache");

function findNearbyFullSource(creep) {
    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    if (!freeCapacity) return null;

    return creep.pos.findClosestByRange(FIND_SOURCES, {
        filter: (source) =>
            creep.pos.getRangeTo(source) <= 5 &&
            source.energy >= freeCapacity,
    });
}

// true when the room runs both collector links (next to a source) and
// non-collector links (the receiving end of the link network)
function hasLinkNetwork(room) {
    const links = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_LINK },
    });
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
        room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_LINK },
        }),
        (l) => !l.isCollector()
    );
    if (opts.awayFromController && room.controller) {
        const away = _.filter(
            links,
            (l) => l.pos.getRangeTo(room.controller) > 2
        );
        if (away.length) links = away;
    }
    if (!links.length) return null;
    return pos ? pos.findClosestByRange(links) : links[0];
}

module.exports = { energyPiles, findNearbyFullSource, hasLinkNetwork, receivingLink };
