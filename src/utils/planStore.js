// The only door to a room's city plan { buildings, mincutBoundries }.
//
// The plan is large (~200-300 entries) and static once done, so it lives in
// RawMemory.segments[id] (a JSON string) instead of the Memory blob the server
// serializes every tick. A heap cache holds the parsed object between ticks and
// is only invalidated when planStore itself writes - so a segment is parsed at
// most once per global reset per room.
//
// Segment ids are handed out lazily in Memory.planSegments, from 10 up.
// main.js calls activate() each tick so the segments are readable next tick.
//
// Hardening (found while chasing "towers/links land somewhere different every
// replan"): the id->room mapping used to live in Memory.settings.planSegments.
// A console `Memory.settings = { profiler: true }` (the exact pattern main.js's
// own comment suggests) wholesale-replaces Memory.settings and wipes that
// mapping, while RawMemory.segments keeps the old payloads. The next room to
// request an id can then be handed an already-occupied slot and silently
// inherit a stranger's stale plan. Fixed two ways: the mapping now lives in
// its own Memory.planSegments key, outside Memory.settings; and every segment
// is tagged with its room name - getPlan() refuses a mismatched tag, so even a
// genuine id collision can never resurface as the wrong room's plan.

const BASE_SEGMENT = 10;
const MAX_SEGMENT = 99;
const MAX_ACTIVE = 10;
const MARKET_HISTORY_SEGMENT = 9;

// roomName -> { buildings: [...], mincutBoundries: [...] }
const heap = {};

function segmentMap() {
    if (!Memory.planSegments) {
        // one-time migration from the old (unsafe) location
        Memory.planSegments =
            (Memory.settings && Memory.settings.planSegments) || {};
        if (Memory.settings) delete Memory.settings.planSegments;
    }
    return Memory.planSegments;
}

function emptyPlan() {
    return { buildings: [], mincutBoundries: [] };
}

// The segment id for a room, allocating a free one on first use. Returns null
// only if all 90 segments are taken (never, in practice).
function segmentId(roomName) {
    const map = segmentMap();
    if (map[roomName] == null) {
        const used = {};
        for (const rn in map) used[map[rn]] = true;
        let id = BASE_SEGMENT;
        while (used[id] && id <= MAX_SEGMENT) id++;
        if (id > MAX_SEGMENT) return null;
        map[roomName] = id;
    }
    return map[roomName];
}

// Old format: plan sitting in Memory.rooms[roomName].buildings. Move it into a
// segment and drop the Memory copy. Returns the moved plan, or null.
function migrateFromMemory(roomName) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (!mem || !mem.buildings) return null;
    if (segmentId(roomName) == null) return null; // no segment free - leave it

    const plan = {
        buildings: mem.buildings,
        mincutBoundries: mem.mincutBoundries || [],
    };
    setPlan(roomName, plan);
    delete mem.buildings;
    delete mem.mincutBoundries;
    return plan;
}

// Parse RawMemory.segments[id] and return its plan, but only if the segment is
// actually tagged for `roomName`. A mismatched (or untagged/legacy) tag means
// this slot belongs to someone else or is stale garbage - treat it as absent
// rather than ever handing back the wrong room's buildings.
function readSegment(roomName, id) {
    const raw = RawMemory.segments && RawMemory.segments[id];
    if (typeof raw !== "string" || !raw.length) return null;
    try {
        const stored = JSON.parse(raw);
        if (!stored || !stored.buildings || stored.room !== roomName) {
            return null;
        }
        return {
            buildings: stored.buildings,
            mincutBoundries: stored.mincutBoundries || [],
        };
    } catch (e) {
        console.log(
            "[planStore] segment " + id + " for " + roomName + " is corrupt"
        );
        return null;
    }
}

// The room's plan, or null when it has none. Heap-cached; migrates the old
// Memory format on first read.
function getPlan(roomName) {
    if (heap[roomName]) return heap[roomName];

    const migrated = migrateFromMemory(roomName);
    if (migrated) return migrated;

    const id = segmentId(roomName);
    if (id == null) return null;

    const plan = readSegment(roomName, id);
    if (plan) heap[roomName] = plan;
    return plan;
}

// Replace the room's plan (write-through to the segment + heap).
function setPlan(roomName, plan) {
    if (!plan.mincutBoundries) plan.mincutBoundries = [];
    heap[roomName] = plan;
    const id = segmentId(roomName);
    if (id != null && RawMemory.segments) {
        RawMemory.segments[id] = JSON.stringify(
            Object.assign({ room: roomName }, plan)
        );
    }
}

// get -> mutate in place -> write back. Creates an empty plan if none exists.
function mutate(roomName, fn) {
    const plan = getPlan(roomName) || emptyPlan();
    fn(plan);
    setPlan(roomName, plan);
    return plan;
}

// Forget the room's plan so planCity() rebuilds it. Keeps the segment id
// allocation so the rebuild reuses the same slot.
function dropPlan(roomName) {
    delete heap[roomName];
    const map = segmentMap();
    const id = map[roomName];
    if (id != null && RawMemory.segments) delete RawMemory.segments[id];
}

// Ask the server to make our plan segments readable next tick (max 10 active).
// Owned rooms first.
function activate() {
    const map = segmentMap();
    const ids = [];
    const push = (id) => {
        if (id != null && ids.indexOf(id) === -1 && ids.length < MAX_ACTIVE) {
            ids.push(id);
        }
    };
    // Segment 9 is reserved for market history. Keep it active alongside
    // up to nine room-plan segments; room plans begin at segment 10.
    push(MARKET_HISTORY_SEGMENT);
    for (const r of Game.myRooms || []) push(map[r.name]);
    for (const rn in map) push(map[rn]);

    if (ids.length && RawMemory.setActiveSegments) {
        RawMemory.setActiveSegments(ids);
    }
}

module.exports = {
    getPlan,
    setPlan,
    mutate,
    dropPlan,
    activate,
    segmentId,
    emptyPlan,
};
