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
    for (const r of roomCache.droppedResources(room)) {
        if (r.resourceType === RESOURCE_ENERGY && r.amount >= 50) piles.push(r);
    }
    for (const t of roomCache.tombstones(room)) {
        if (t.store[RESOURCE_ENERGY] >= 50) piles.push(t);
    }
    for (const ruin of roomCache.ruins(room)) {
        if (ruin.store[RESOURCE_ENERGY] >= 50) piles.push(ruin);
    }

    const holders = roomCache.structuresByType(room, STRUCTURE_STORAGE)
        .concat(roomCache.structuresByType(room, STRUCTURE_CONTAINER));
    for (const s of holders) {
        if (s.store && s.store[RESOURCE_ENERGY] >= 50) piles.push(s);
    }
    const links = roomCache.structuresByType(room, STRUCTURE_LINK);
    for (const s of links) {
        // Never drain a collector link: the miner owns its feed contract.
        if (s.store && s.store[RESOURCE_ENERGY] >= 50 && !s.isCollector()) piles.push(s);
    }

    // Structures with a known foreign owner can retain energy after capture.
    // Existing storage/container/link sources remain handled above.
    if (config.get("salvage.enabled", true)) {
        const known = new Set(holders.concat(links).map((s) => s.id));
        for (const s of roomCache.structures(room)) {
            if (known.has(s.id) || s.my === true || !s.owner || !s.store) continue;
            if (s.store[RESOURCE_ENERGY] >= 50) piles.push(s);
        }
    }

    const accessible = salvage.excludeProtected(piles, room);
    energyPilesCache[room.name] = combat.excludeDangerZone(accessible, room);
    return energyPilesCache[room.name];
}

const config = require("./config");
const salvage = require("./salvage");
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
