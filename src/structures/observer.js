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
//
// ROADMAP 0056: with 2+ observers, the whole empire still only observes ONE
// room per tick, chosen considering every room any observer can reach - not
// one room per observer. main.js calls run(structure) once per observer
// (same generic per-structure loop as every other structure type), so the
// serve*/explore helpers below take the full observer list (utils/observer's
// myObservers()) instead of a single structure, and a Game.time-scoped guard
// makes every call after the first one in a given tick a no-op. With exactly
// one observer the guard never engages - same single-structure decision as
// before ROADMAP 0056.

const observerUtil = require("../utils/observer");
const config = require("../utils/config");
const cpuTier = require("../utils/cpuTier");

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

// The first observer (in list order) within OBSERVER_RANGE of roomName, or
// null - lets the serve*/explore helpers below pick whichever observer can
// actually reach a candidate room instead of only the one whose run() call
// triggered the decision (ROADMAP 0056).
function observerInRangeOf(observers, roomName) {
    for (const obs of observers) {
        if (Game.map.getRoomLinearDistance(obs.room.name, roomName) <= OBSERVER_RANGE) {
            return obs;
        }
    }
    return null;
}

function serveLayoutRequests(observers) {
    for (const roomName in Memory.layoutRequests || {}) {
        const mem = Memory.rooms[roomName];
        if (mem && mem.planned) {
            // already finished (this observer, or another one, saw it
            // through) - clean up and keep looking for something to do
            delete Memory.layoutRequests[roomName];
            console.log(`[layout] ${roomName}: plan ready`);
            continue;
        }
        const obs = observerInRangeOf(observers, roomName);
        if (!obs) continue;
        obs.observeRoom(roomName);
        return true;
    }
    return false;
}

function serveObserveRequests(observers) {
    for (const roomName in Memory.observeRequests || {}) {
        // expire first, regardless of range - an observe() request nobody
        // ever comes into range for must still self-clean instead of
        // sitting in Memory forever (constitution §2)
        if (Game.time >= Memory.observeRequests[roomName]) {
            delete Memory.observeRequests[roomName];
            continue;
        }
        const obs = observerInRangeOf(observers, roomName);
        if (!obs) continue;
        obs.observeRoom(roomName);
        return true;
    }
    return false;
}

// score = staleness * (1 + enemies * militaryWeight) - see the file-level
// comment. militaryWeight = 0 collapses this back to plain
// least-recently-seen. Scans the union of every observer's square (deduped
// via `seen`) so a two-observer empire picks the single best room across
// both ranges, not just whoever's square is scanned first (ROADMAP 0056).
function explorePriority(observers) {
    const militaryWeight = config.get("observer.militaryWeight", 1);
    let best = null;
    let bestScore = -Infinity;
    let bestObserver = null;
    const seen = {};

    for (const obs of observers) {
        const [ox, oy] = roomNameToXY(obs.room.name);
        for (let dx = -OBSERVER_RANGE; dx <= OBSERVER_RANGE; dx++) {
            for (let dy = -OBSERVER_RANGE; dy <= OBSERVER_RANGE; dy++) {
                const roomName = xyToRoomName(ox + dx, oy + dy);
                if (seen[roomName]) continue;
                seen[roomName] = true;
                const mem = Memory.rooms[roomName];
                if (!mem || !mem.lastVisit) {
                    obs.observeRoom(roomName);
                    return true; // never seen - highest priority, stop here
                }
                const staleness = Game.time - mem.lastVisit;
                const score = staleness * (1 + (mem.enemies || 0) * militaryWeight);
                if (score > bestScore) {
                    bestScore = score;
                    best = roomName;
                    bestObserver = obs;
                }
            }
        }
    }
    if (!best) return false;
    bestObserver.observeRoom(best);
    return true;
}

// explorePriority() scans a (2*OBSERVER_RANGE+1)^2 square of room names
// every time it runs - real cost, and staleness only grows slowly, so
// there's no need to re-decide every single tick with nothing else pending.
// Throttled to once every `observer.exploreInterval` ticks (default 10);
// serveLayoutRequests/serveObserveRequests above stay unthrottled - those
// are cheap (bounded by pending request count, not room count) and the
// player is actively waiting on them.
let exploreTick = -1;
function throttledExplore(observers) {
    const interval = cpuTier.scaled("observer.exploreInterval", 10);
    if (interval > 1 && Game.time - exploreTick < interval) return false;
    const acted = explorePriority(observers);
    if (acted) exploreTick = Game.time;
    return acted;
}

// module-heap only (constitution §3: derived/transient, never Memory) -
// tracks whether some observer already acted this tick, so a second (third,
// ...) observer's run() call in the same tick is a no-op (ROADMAP 0056).
let coordTick = -1;
let observedThisTick = false;

var observer = {
    /** @param {StructureObserver} structure **/
    run: function (structure) {
        const observers = observerUtil.myObservers();
        if (observers.length <= 1) {
            // solo observer (or `structure` isn't currently tracked in
            // Game.structures, e.g. a direct unit-test call) - decide alone,
            // exactly as before ROADMAP 0056, no coordination overhead.
            if (serveLayoutRequests([structure])) return;
            if (serveObserveRequests([structure])) return;
            throttledExplore([structure]);
            return;
        }

        if (Game.time !== coordTick) {
            coordTick = Game.time;
            observedThisTick = false;
        }
        if (observedThisTick) return;
        observedThisTick =
            serveLayoutRequests(observers) ||
            serveObserveRequests(observers) ||
            throttledExplore(observers);
    },
};

module.exports = observer;
// exposed for the offline smoke test only
module.exports.roomNameToXY = roomNameToXY;
module.exports.xyToRoomName = xyToRoomName;
