// One target room per tick, same one-action-per-tick shape as the real
// observeRoom() API. Priority: (1) a pending layout-preview request within
// range (planLayout() console, roles/scout.js) - this is also the only
// place that dequeues a request once its plan is ready, for any room an
// observer (rather than a scout) is the one giving it vision; (2) a plain
// observe() request (console, below) - refreshes Memory.rooms[x] via
// intel.js every tick for a fixed number of ticks, no completion condition
// beyond the countdown; (3) with nothing pending, explore by priority - the
// same job the scout's round-robin wandering did before an observer
// existed (rooms/needs.js keeps the scout's exploratory count at 0 once
// one does - ROADMAP 0028), but weighted toward rooms with more hostiles
// instead of plain least-recently-seen (ROADMAP 0031): a room's urgency
// score grows with both how stale its intel is AND how many hostiles were
// last seen there, so a room under heavy military presence gets
// re-observed far more often - but every room's score still grows
// unboundedly with staleness alone, so nothing goes permanently unwatched.

const observerUtil = require("../utils/observer");
const config = require("../utils/config");

// --- console: observe(roomName, ticks=10) -------------------------------
// Keeps an owned observer in range pointed at roomName for `ticks` ticks -
// a quick way to check in on a room (hostiles, remotes, anything
// getIntel.js tracks in Memory.rooms) without sending a creep. Observer
// only - unlike planLayout() there's no scout fallback, since a scout
// physically parking there already does this for free while it's there.
global.observe = function (roomName, ticks) {
    ticks = ticks === undefined ? 10 : ticks;
    if (!Memory.observeRequests) Memory.observeRequests = {};
    Memory.observeRequests[roomName] = Game.time + ticks;
    const obs = observerUtil.observerFor(roomName);
    console.log(
        obs
            ? `[observe] ${roomName}: observer in ${obs.room.name} will watch it for ${ticks} ticks`
            : `[observe] ${roomName} queued for ${ticks} ticks, but no observer is in range yet`
    );
};

// --- room name <-> signed world coordinates (Screeps' own convention: E/N
// increase away from the W/S=0 boundary rooms, which sit adjacent to W0/S0
// with no "room -1") - lets exploration scan a square of rooms by simple
// arithmetic instead of calling Game.map.getRoomLinearDistance per cell.
function roomNameToXY(roomName) {
    const m = /^([EW])(\d+)([NS])(\d+)$/.exec(roomName);
    let x = Number(m[2]);
    let y = Number(m[4]);
    if (m[1] === "W") x = -x - 1;
    if (m[3] === "N") y = -y - 1;
    return [x, y];
}
function xyToRoomName(x, y) {
    const h = x < 0 ? "W" : "E";
    const v = y < 0 ? "N" : "S";
    return h + (x < 0 ? -x - 1 : x) + v + (y < 0 ? -y - 1 : y);
}

function serveLayoutRequests(structure) {
    for (const roomName in Memory.layoutRequests || {}) {
        if (
            Game.map.getRoomLinearDistance(structure.room.name, roomName) >
            OBSERVER_RANGE
        ) {
            continue;
        }
        const mem = Memory.rooms[roomName];
        if (mem && mem.planned) {
            // already finished (this observer, or another one, saw it
            // through) - clean up and keep looking for something to do
            delete Memory.layoutRequests[roomName];
            console.log(`[layout] ${roomName}: plan ready`);
            continue;
        }
        structure.observeRoom(roomName);
        return true;
    }
    return false;
}

function serveObserveRequests(structure) {
    for (const roomName in Memory.observeRequests || {}) {
        // expire first, regardless of range - an observe() request nobody
        // ever comes into range for must still self-clean instead of
        // sitting in Memory forever (constitution §2)
        if (Game.time >= Memory.observeRequests[roomName]) {
            delete Memory.observeRequests[roomName];
            continue;
        }
        if (
            Game.map.getRoomLinearDistance(structure.room.name, roomName) >
            OBSERVER_RANGE
        ) {
            continue;
        }
        structure.observeRoom(roomName);
        return true;
    }
    return false;
}

// score = staleness * (1 + enemies * militaryWeight) - see the file-level
// comment. militaryWeight = 0 collapses this back to plain
// least-recently-seen.
function explorePriority(structure) {
    const [ox, oy] = roomNameToXY(structure.room.name);
    const militaryWeight = config.get("observer.militaryWeight", 1);
    let best = null;
    let bestScore = -Infinity;

    for (let dx = -OBSERVER_RANGE; dx <= OBSERVER_RANGE; dx++) {
        for (let dy = -OBSERVER_RANGE; dy <= OBSERVER_RANGE; dy++) {
            const roomName = xyToRoomName(ox + dx, oy + dy);
            const mem = Memory.rooms[roomName];
            if (!mem || !mem.lastVisit) {
                structure.observeRoom(roomName);
                return true; // never seen - highest priority, stop here
            }
            const staleness = Game.time - mem.lastVisit;
            const score = staleness * (1 + (mem.enemies || 0) * militaryWeight);
            if (score > bestScore) {
                bestScore = score;
                best = roomName;
            }
        }
    }
    if (!best) return false;
    structure.observeRoom(best);
    return true;
}

var observer = {
    /** @param {StructureObserver} structure **/
    run: function (structure) {
        if (serveLayoutRequests(structure)) return;
        if (serveObserveRequests(structure)) return;
        explorePriority(structure);
    },
};

module.exports = observer;
// exposed for the offline smoke test only
module.exports.roomNameToXY = roomNameToXY;
module.exports.xyToRoomName = xyToRoomName;
