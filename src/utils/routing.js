// Room-LEVEL route planning: which chain of rooms to cross to reach ONE
// specific destination - the scout's sign/layout tasks, the reserver's
// reserve/claim missions - never the scout's exploratory wandering, which
// has no fixed destination to route around. Complements utils/move.js's
// travel(), which handles tile-level movement/caching once inside a room;
// this module only decides which rooms a cross-room moveTo() is allowed to
// cross through.

const remotes = require("../rooms/remotes");
const config = require("./config");

// Highway rooms sit on the map's coordinate grid (either axis a multiple of
// 10) - open, sourceless, usually ownerless space that forms natural travel
// corridors between the clusters of owned/claimed rooms. Preferred whenever
// a creep has one specific room to reach.
function isHighwayRoom(roomName) {
    const m = /^[EW](\d+)[NS](\d+)$/.exec(roomName);
    if (!m) return false;
    return Number(m[1]) % 10 === 0 || Number(m[2]) % 10 === 0;
}

// --- route blacklist: a room that turned out to be a trap for a creep
// heading to ONE fixed destination - the specific intermediate hop
// findRoute picked that couldn't actually be walked (a hostile that showed
// up only once inside, a native-engine pathing quirk at the border...),
// caught reactively by isRouteFlapping() below once the creep visibly
// bounces in and out of it. Shared by every moveToRoom() caller (reserver's
// reserve/claim/contest, scout's sign/layout tasks) - a single place to say
// "don't route anyone through here for a while" instead of just repeating
// the same dead end forever. Deliberately separate from roles/scout.js's
// own scoutBlacklistUntil (free-roaming exploration, no fixed destination
// to route around - different problem, own mechanism, ROADMAP 0009).
function isBlacklisted(roomName) {
    const mem = Memory.rooms[roomName];
    return !!(mem && mem.routeBlacklistUntil && mem.routeBlacklistUntil > Game.time);
}
function blacklistRoom(roomName) {
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    Memory.rooms[roomName].routeBlacklistUntil =
        Game.time + config.get("routing.blacklistTicks", 5000);
}

// Bouncing between the same two rooms while walking toward one fixed
// destination means the intermediate hop findRoute most recently picked
// can't actually be crossed - the trail's last entry is always the room the
// creep is CURRENTLY standing in at the moment the ABAB pattern completes,
// which is exactly the room it keeps entering and being forced back out of.
// Same reactive, tick/room-only bookkeeping as roles/scout.js's own
// isFlapping() (never a live PathFinder.search - see moveToRoom()'s
// comment below for why that was tried and reverted), just keyed under its
// own memory field so the two never interfere with each other on a scout
// that switches between a sign/layout task and free exploration.
function isRouteFlapping(creep) {
    const trail = creep.memory._routeTrail || [];
    if (trail[trail.length - 1] !== creep.room.name) {
        trail.push(creep.room.name);
        if (trail.length > 4) trail.shift();
        creep.memory._routeTrail = trail;
    }
    return (
        trail.length === 4 &&
        trail[0] === trail[2] &&
        trail[1] === trail[3] &&
        trail[0] !== trail[1]
    );
}

// --- border stall: a creep sitting still, several ticks running, exactly on
// a room's edge coordinate (x/y 0 or 49). Confirmed live (ROADMAP 0060): the
// engine won't let a creep rest on an exit tile - one that stops there
// without a fresh move queued gets shoved back off it, which from a
// room-name trail's point of view can look like nothing happened at all
// (the correction can land it back in the room it came from before the next
// tick's script even reads its position, so isRouteFlapping()/scout's
// isFlapping() never see the room name actually flip - their whole signal
// is room-name CHANGES, and this case might never produce one). Position
// bookkeeping catches it instead: same room, same tile, still on the edge,
// several ticks running. keyPrefix keeps independent callers (this module's
// own moveToRoom, roles/scout.js's free-roam exploration) from clobbering
// each other's tracking on a creep that does both jobs at different times.
function isStuckAtBorder(creep, keyPrefix) {
    const onBorder =
        creep.pos.x === 0 || creep.pos.x === 49 ||
        creep.pos.y === 0 || creep.pos.y === 49;
    const posField = keyPrefix + "Pos";
    const ticksField = keyPrefix + "Ticks";
    if (!onBorder) {
        creep.memory[posField] = undefined;
        creep.memory[ticksField] = 0;
        return false;
    }
    const posKey = creep.pos.x + ":" + creep.pos.y + ":" + creep.room.name;
    if (creep.memory[posField] === posKey) {
        creep.memory[ticksField] = (creep.memory[ticksField] || 0) + 1;
    } else {
        creep.memory[posField] = posKey;
        creep.memory[ticksField] = 0;
    }
    return creep.memory[ticksField] >= 2;
}

// Step 1 tile in from whichever edge(s) the creep is sitting on, away from
// the border that's about to get it auto-corrected - queues an actual move
// intent for this tick instead of leaving it to another moveTo() call that
// might just propose the same doomed step again (the underlying blockage -
// a hostile body parked on the exit, a wall - hasn't changed just because we
// blacklisted a room). Returns false only if the creep isn't on an edge at
// all (nothing to nudge away from).
function nudgeAwayFromBorder(creep) {
    const x = creep.pos.x === 0 ? 1 : creep.pos.x === 49 ? 48 : creep.pos.x;
    const y = creep.pos.y === 0 ? 1 : creep.pos.y === 49 ? 48 : creep.pos.y;
    if (x === creep.pos.x && y === creep.pos.y) return false;
    creep.move(creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name)));
    return true;
}

// Which neighboring room a border-stuck creep was actually trying to cross
// into, from the specific edge it's sitting on (Memory.rooms[x].exits, keyed
// by FIND_EXIT_TOP/RIGHT/BOTTOM/LEFT - same shape roles/scout.js's own
// exploration already reads). This is the room that's ACTUALLY the trap -
// blacklisting creep.room.name instead (the room the creep is still
// standing in, which routeCostCallback always allows regardless of
// blacklist status - you can never be excluded from the room you're
// already in) would leave the very next findRoute() call free to propose
// the exact same doomed crossing again.
function borderNeighborRoom(creep) {
    const exits = Memory.rooms[creep.room.name] && Memory.rooms[creep.room.name].exits;
    if (!exits) return null;
    if (creep.pos.y === 0) return exits[FIND_EXIT_TOP] || null;
    if (creep.pos.y === 49) return exits[FIND_EXIT_BOTTOM] || null;
    if (creep.pos.x === 0) return exits[FIND_EXIT_LEFT] || null;
    if (creep.pos.x === 49) return exits[FIND_EXIT_RIGHT] || null;
    return null;
}

// Room-level route to `toRoomName`: a blacklisted room (see above) is
// excluded outright; highway rooms are cheapened so the search prefers
// them; rooms with known hostiles (rooms/remotes.hasHostiles) are heavily
// penalized, or - with opts.blockHostiles - excluded outright too. Returns
// null when Game.map.findRoute finds nothing under those constraints (only
// possible with blockHostiles, or a blacklisted destination, when every
// path there crosses excluded ground).
function findRoute(fromRoomName, toRoomName, opts) {
    opts = opts || {};
    const hostilePenalty = config.get("routing.hostilePenalty", 10);
    const nonHighwayPenalty = config.get("routing.nonHighwayPenalty", 2);
    const route = Game.map.findRoute(fromRoomName, toRoomName, {
        routeCallback: (roomName) => {
            if (isBlacklisted(roomName)) return Infinity;
            if (roomName === toRoomName) return 1;
            const hostile = remotes.hasHostiles(roomName);
            if (hostile && opts.blockHostiles) return Infinity;
            let cost = 1;
            if (hostile) cost += hostilePenalty;
            if (!isHighwayRoom(roomName)) cost += nonHighwayPenalty;
            return cost;
        },
    });
    return route === ERR_NO_PATH ? null : route;
}

// costCallback for Creep.moveTo(): only the creep's current room, the
// destination, and whatever rooms findRoute() picked are passable - every
// other room is excluded from the search, so the highway/hostile
// preferences above actually decide which rooms get walked through instead
// of just which chain findRoute would have preferred.
function routeCostCallback(route, currentRoomName, toRoomName) {
    const allowed = new Set([currentRoomName, toRoomName]);
    if (route) for (const step of route) allowed.add(step.room);
    return (roomName, matrix) => (allowed.has(roomName) ? matrix : false);
}

// Route-aware Creep.moveTo() to a specific room - see findRoute() above.
// opts: range, reusePath (moveTo defaults below), blockHostiles (the
// reserver: never route through a room with known hostiles).
//
// No reachability pre-check here on purpose (a PathFinder.search was tried
// and reverted - ROADMAP: it ran once per room entered, but a creep cycling
// through several dead-end candidate rooms in a row, as the scout does while
// blacklisting its way out of one, meant several fresh uncached searches in
// quick succession; that's cheap in isolation but was enough to drain the
// CPU bucket in practice). Detecting "this room is a dead end toward my
// target" instead happens the cheap way the rest of this codebase already
// does stall detection (utils/move.js's m.stuck, utils/squad.js's
// stuckTicks): reactively, off plain tick/position bookkeeping in the
// caller, never a live pathfinding call. See roles/scout.js's exploration
// loop for the room-flapping detector built on that principle.
function moveToRoom(creep, toRoomName, opts) {
    opts = opts || {};
    const range = opts.range === undefined ? 20 : opts.range;

    if (isRouteFlapping(creep)) {
        // whatever room the creep is standing in right now is the trap (see
        // isRouteFlapping's comment) - blacklist it and start the trail
        // clean so the findRoute() call below is forced to compute a
        // genuinely different way around instead of repeating this.
        blacklistRoom(creep.room.name);
        creep.memory._routeTrail = [];
    }

    if (isStuckAtBorder(creep, "_routeBorder")) {
        // parked on the edge, unmoving, for several ticks - same trap
        // isRouteFlapping above catches by a room-name flip, just caught by
        // position instead (see isStuckAtBorder's comment on why the trail
        // can miss this entirely). Blacklist the SPECIFIC neighbor this edge
        // leads to (borderNeighborRoom) - not creep.room.name: that's the
        // room the creep is still standing in, which routeCostCallback
        // always allows no matter its blacklist status, so blacklisting it
        // wouldn't change anything about the next findRoute() call. Only
        // fall back to blacklisting the current room if the neighbor can't
        // be identified (no exits intel yet) - better than doing nothing.
        const neighbor = borderNeighborRoom(creep);
        blacklistRoom(neighbor || creep.room.name);
        creep.memory._routeBorderTicks = 0;
        if (nudgeAwayFromBorder(creep)) return OK;
    }

    const route = findRoute(creep.room.name, toRoomName, opts);

    return creep.moveTo(new RoomPosition(25, 25, toRoomName), {
        range,
        reusePath: opts.reusePath === undefined ? 20 : opts.reusePath,
        costCallback: routeCostCallback(route, creep.room.name, toRoomName),
    });
}

// --- console: diagnose why a blockHostiles route can't reach a target -----
//   routeCheck("W1N49", "E1N45")
// Prints both the unrestricted route (ignoring hostiles) and the
// blockHostiles one, plus - when blockHostiles finds nothing - every hostile
// room on the unrestricted route, so it's visible whether that's a single
// avoidable room or a genuine dead end with no way around it.
global.routeCheck = function (fromRoomName, toRoomName) {
    const free = findRoute(fromRoomName, toRoomName, {});
    const safe = findRoute(fromRoomName, toRoomName, { blockHostiles: true });

    console.log(
        `[routeCheck] ${fromRoomName} -> ${toRoomName}: ` +
            (free
                ? `unrestricted route is ${free.length} hop(s): ${free.map((s) => s.room).join(" -> ")}`
                : "no unrestricted route at all (map disconnected?)")
    );
    console.log(
        `[routeCheck] blockHostiles route: ` +
            (safe
                ? `${safe.length} hop(s): ${safe.map((s) => s.room).join(" -> ")}`
                : "NONE - every path there crosses a room flagged hostile")
    );

    if (!safe && free) {
        const hostileRooms = free
            .map((s) => s.room)
            .filter((r) => remotes.hasHostiles(r));
        console.log(
            hostileRooms.length
                ? `[routeCheck] hostile room(s) on the direct route: ${hostileRooms.join(", ")} ` +
                      `(Memory.rooms[x].enemies - stale if not revisited since)`
                : "[routeCheck] no hostile room on the direct route itself - " +
                      "the block must come from an alternate the engine tried and rejected"
        );
    }
};

module.exports = {
    isHighwayRoom,
    findRoute,
    routeCostCallback,
    moveToRoom,
    // exposed for smoke.js - otherwise only reachable indirectly through
    // moveToRoom() - and isStuckAtBorder/nudgeAwayFromBorder are also reused
    // directly by roles/scout.js's own free-roam exploration flap guard
    isBlacklisted,
    isRouteFlapping,
    isStuckAtBorder,
    nudgeAwayFromBorder,
    borderNeighborRoom,
};
