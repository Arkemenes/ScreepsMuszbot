const roomCache = require("./roomCache");

// A non-owner must not target loot protected by a hostile rampart. Reuse the
// per-room FIND_STRUCTURES cache so callers add no new room.find call.
function excludeProtected(objects, room) {
    const hostileRamparts = roomCache
        .structuresByType(room, STRUCTURE_RAMPART)
        .filter((rampart) => !rampart.my);
    if (!hostileRamparts.length) return objects;

    return objects.filter((object) => {
        if (!object || !object.pos) return false;
        return !hostileRamparts.some(
            (rampart) =>
                rampart.pos.x === object.pos.x &&
                rampart.pos.y === object.pos.y
        );
    });
}

// Salvage goes to what disappears first: a dropped resource decays every
// tick, a tombstone/ruin expires (and spills its store to the floor), a
// structure's store keeps. 0 = dropped, 1 = tombstone/ruin, 2 = anything else.
function decayTier(object) {
    if (object.resourceType !== undefined) return 0;
    if (object.deathTime !== undefined || object.destroyTime !== undefined) return 1;
    return 2;
}

// Stable sort by decayTier - for callers that take the first match.
function byDecay(objects) {
    return objects
        .map((object, index) => ({ object, index, tier: decayTier(object) }))
        .sort((a, b) => a.tier - b.tier || a.index - b.index)
        .map((entry) => entry.object);
}

// Closest by path within the most perishable tier that has a reachable pile.
function closestDecayFirst(creep, objects) {
    const tiers = [[], [], []];
    for (const object of objects) tiers[decayTier(object)].push(object);
    for (const tier of tiers) {
        if (!tier.length) continue;
        const pick = creep.pos.findClosestByPath(tier);
        if (pick) return pick;
    }
    return null;
}

module.exports = { excludeProtected, decayTier, byDecay, closestDecayFirst };
