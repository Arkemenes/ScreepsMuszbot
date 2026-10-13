// Per-tile traffic counter, heap-only (never Memory - constitution §2: this
// is derived/ephemeral data, and re-warming over a few hundred ticks after a
// global reset is cheap and harmless).
//
// `record(creep)` is called once per creep per tick from main.js (not spread
// across roles). `hot()` tells the planner which tiles see enough real
// footfall to be worth paving beyond the baseline (spawn<->source,
// spawn<->controller) roads.

const config = require("./config");
const nativePath = require("./nativePath");
const { planEntriesAt } = require("./plan");

let counts = {}; // { roomName: { "x:y": count } }
let lastDecay = 0;
let intentTick = -1;
let intentsByTile = {};
let intentsByCreep = {};
let watchedScoutStep = null;

function scoutTraceEnabled() {
    return !!(
        Memory.settings &&
        Memory.settings.debug &&
        Memory.settings.debug.scoutTrace
    );
}

function ensureIntentTick() {
    if (intentTick === Game.time) return;
    intentTick = Game.time;
    intentsByTile = {};
    intentsByCreep = {};
    watchedScoutStep = null;
}

function recordIntent(creep, x, y, action) {
    if (!scoutTraceEnabled() || !creep.room || x < 0 || x > 49 || y < 0 || y > 49) return;
    ensureIntentTick();
    const creepKey = creep.id || creep.name;
    const previous = intentsByCreep[creepKey];
    if (previous) delete intentsByTile[previous.tileKey][creepKey];
    const tileKey = creep.room.name + ":" + x + ":" + y;
    const tile = intentsByTile[tileKey] || (intentsByTile[tileKey] = {});
    tile[creepKey] = { name: creep.name, role: creep.memory.role, action };
    intentsByCreep[creepKey] = { tileKey };
}

function recordDirectionIntent(creep, direction) {
    const dx = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    if (!dx[direction] && !dy[direction]) return;
    recordIntent(creep, creep.pos.x + dx[direction], creep.pos.y + dy[direction], "move");
}

function cachedMoveStep(creep) {
    const step = nativePath.nextStep(creep);
    if (step) return step;
    const path = creep.memory._m && creep.memory._m.path;
    if (path && path.length) return { x: path[0][0], y: path[0][1] };
    return null;
}

function recordMoveToIntent(creep) {
    const step = cachedMoveStep(creep);
    if (step) recordIntent(creep, step.x, step.y, "moveTo");
}

function watchScoutMove(creep) {
    if (!scoutTraceEnabled() || creep.memory.role !== "scout") return;
    const step = cachedMoveStep(creep);
    if (!step || step.x < 0 || step.x > 49 || step.y < 0 || step.y > 49) return;
    ensureIntentTick();
    watchedScoutStep = {
        creepKey: creep.id || creep.name,
        name: creep.name,
        tileKey: creep.room.name + ":" + step.x + ":" + step.y,
    };
}

function flushScoutTrace() {
    if (!scoutTraceEnabled() || !watchedScoutStep) return;
    const intents = intentsByTile[watchedScoutStep.tileKey] || {};
    const scoutIntent = intents[watchedScoutStep.creepKey] || null;
    const latest = intentsByCreep[watchedScoutStep.creepKey] || null;
    const contenders = Object.keys(intents)
        .filter((creepKey) => creepKey !== watchedScoutStep.creepKey)
        .map((creepKey) => intents[creepKey]);
    console.log("[scoutTrace] " + JSON.stringify({
        tick: Game.time,
        action: "intent-resolution",
        scout: watchedScoutStep.name,
        nextStep: watchedScoutStep.tileKey,
        scoutIntent,
        latestIntent: latest && latest.tileKey,
        contenders,
    }));
    watchedScoutStep = null;
}

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
// A road never qualifies while it's still above traffic.roadRepairFloor.
// Below the floor:
//   - a road the city plan reserves is ALWAYS worth repairing, however cold
//     its tile is (user-requested). The plan already decided that road
//     belongs there, and the heat gate below is heap-only - every global
//     reset zeroes it, so a planned road on a quiet tile could sit at 6% hits
//     forever, unreachable for both builder and tower. Repairing costs
//     1 energy / 100 hits against the 300 energy / 5000 hits (6x more) of
//     letting it die and rebuilding it, so waiting for heat only bought a
//     build -> decay -> build loop.
//   - anywhere the plan has nothing to say (a room with no plan at all yet,
//     or a road the plan doesn't reserve) the old rule still holds: repair
//     only a tile with recent traffic, and leave a cold, unused road to
//     decay/disappear instead of burning builder/tower energy on it.
let roadFloorTick = -1;
let roadFloor = 0.4;
function worthRepairing(structure) {
    if (structure.structureType !== STRUCTURE_ROAD) return true;
    // read once a tick: called per road, per candidate list (3x), each tick
    if (roadFloorTick !== Game.time) {
        roadFloorTick = Game.time;
        roadFloor = config.get("traffic.roadRepairFloor", 0.4);
    }
    const floor = roadFloor;
    if (structure.hits / structure.hitsMax >= floor) return false;

    const planned = planEntriesAt(
        structure.room.name,
        structure.pos.x,
        structure.pos.y
    );
    if (planned && planned.some((b) => b.structureType === STRUCTURE_ROAD)) {
        return true;
    }

    return isHot(structure.room.name, structure.pos.x, structure.pos.y);
}

module.exports = {
    record,
    decay,
    hot,
    isHot,
    worthRepairing,
    recordDirectionIntent,
    recordMoveToIntent,
    watchScoutMove,
    flushScoutTrace,
};
