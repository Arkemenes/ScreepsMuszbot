// Helpers for comparing what is built against the city plan, which lives in a
// RawMemory segment behind utils/planStore (an array of
// {x, y, structureType, minimalRCL}).

const planStore = require("./planStore");

// The plan is a flat array; scanning it per structure per tick is O(n*m). Index
// it by "x:y" once per tick (rebuilding when the plan array identity changes).
let indexTick = -1;
let indexes = {};

function planIndex(roomName) {
    const plan = planStore.getPlan(roomName);
    if (!plan) return null;
    const buildings = plan.buildings;

    if (indexTick !== Game.time) {
        indexTick = Game.time;
        indexes = {};
    }

    let entry = indexes[roomName];
    if (!entry || entry.src !== buildings || entry.len !== buildings.length) {
        const map = {};
        for (const b of buildings) {
            const key = b.x + ":" + b.y;
            (map[key] || (map[key] = [])).push(b);
        }
        entry = { src: buildings, len: buildings.length, map };
        indexes[roomName] = entry;
    }

    return entry.map;
}

// The plan entries sitting on a given tile, or null when the room has no plan.
function planEntriesAt(roomName, x, y) {
    const map = planIndex(roomName);
    if (!map) return null;
    return map[x + ":" + y] || [];
}

// True when the structure sits on a tile the plan reserves for that same
// structure type. When the room has no plan yet, everything counts as planned
// so early-game behaviour is unchanged.
function isPlanned(structure) {
    const entries = planEntriesAt(
        structure.room.name,
        structure.pos.x,
        structure.pos.y
    );
    if (entries === null) return true;
    return entries.some((b) => b.structureType === structure.structureType);
}

module.exports = { isPlanned, planEntriesAt };
