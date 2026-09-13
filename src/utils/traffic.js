// Per-tile traffic counter, heap-only (never Memory - constitution §2: this
// is derived/ephemeral data, and re-warming over a few hundred ticks after a
// global reset is cheap and harmless).
//
// `record(creep)` is called once per creep per tick from main.js (not spread
// across roles). `hot()` tells the planner which tiles see enough real
// footfall to be worth paving beyond the baseline (spawn<->source,
// spawn<->controller) roads.

const config = require("./config");

let counts = {}; // { roomName: { "x:y": count } }
let lastDecay = 0;

function record(creep) {
    if (!creep.pos || !creep.room) return;
    const room = (counts[creep.room.name] || (counts[creep.room.name] = {}));
    const key = creep.pos.x + ":" + creep.pos.y;
    room[key] = (room[key] || 0) + 1;
}

// Ages every counter down by traffic.decayFactor, dropping entries that round
// to 0. Cheap: only touches tiles that have ever been recorded, and only
// actually runs once every traffic.decayInterval ticks (main.js calls this
// every tick; the interval gate lives here so callers don't need to track
// timing).
function decay() {
    const interval = config.get("traffic.decayInterval", 100);
    if (Game.time - lastDecay < interval) return;
    lastDecay = Game.time;

    const factor = config.get("traffic.decayFactor", 0.99);
    for (const roomName in counts) {
        const room = counts[roomName];
        let any = false;
        for (const key in room) {
            const next = Math.floor(room[key] * factor);
            if (next > 0) {
                room[key] = next;
                any = true;
            } else {
                delete room[key];
            }
        }
        if (!any) delete counts[roomName];
    }
}

// Tiles in `roomName` whose recorded traffic is at or above `threshold`
// (default: traffic.roadThreshold), as [{x, y, count}, ...]. Empty when the
// room has no recorded traffic yet (fresh room, global reset) - callers fall
// back to the baseline roads.
function hot(roomName, threshold) {
    const room = counts[roomName];
    if (!room) return [];
    const min = threshold === undefined
        ? config.get("traffic.roadThreshold", 50)
        : threshold;

    const tiles = [];
    for (const key in room) {
        if (room[key] < min) continue;
        const [x, y] = key.split(":").map(Number);
        tiles.push({ x, y, count: room[key] });
    }
    return tiles;
}

// Cheap O(1) membership check for a single tile - for repair policy (builder/
// tower) where scanning every damaged structure against a full hot() array
// would be wasteful.
function isHot(roomName, x, y, threshold) {
    const room = counts[roomName];
    if (!room) return false;
    const min = threshold === undefined
        ? config.get("traffic.roadThreshold", 50)
        : threshold;
    return (room[x + ":" + y] || 0) >= min;
}

// Whether `structure` is worth queueing for repair from a traffic point of
// view. Every non-road structure always is (the rule only exists for roads).
// A road only qualifies once it's below traffic.roadRepairFloor AND its tile
// has seen recent traffic - a cold, unused road tile is left to decay/
// disappear instead of burning builder/tower energy on it.
function worthRepairing(structure) {
    if (structure.structureType !== STRUCTURE_ROAD) return true;
    const floor = config.get("traffic.roadRepairFloor", 0.4);
    if (structure.hits / structure.hitsMax >= floor) return false;
    return isHot(structure.room.name, structure.pos.x, structure.pos.y);
}

module.exports = { record, decay, hot, isHot, worthRepairing };
