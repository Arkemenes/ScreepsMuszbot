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

// Room-level route to `toRoomName`: highway rooms are cheapened so the
// search prefers them; rooms with known hostiles (rooms/remotes.hasHostiles)
// are heavily penalized, or - with opts.blockHostiles - excluded outright.
// Returns null when Game.map.findRoute finds nothing under those
// constraints (only possible with blockHostiles, when every path there
// crosses hostile ground).
function findRoute(fromRoomName, toRoomName, opts) {
    opts = opts || {};
    const hostilePenalty = config.get("routing.hostilePenalty", 10);
    const nonHighwayPenalty = config.get("routing.nonHighwayPenalty", 2);
    const route = Game.map.findRoute(fromRoomName, toRoomName, {
        routeCallback: (roomName) => {
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
function moveToRoom(creep, toRoomName, opts) {
    opts = opts || {};
    const route = findRoute(creep.room.name, toRoomName, opts);
    return creep.moveTo(new RoomPosition(25, 25, toRoomName), {
        range: opts.range === undefined ? 20 : opts.range,
        reusePath: opts.reusePath === undefined ? 20 : opts.reusePath,
        costCallback: routeCostCallback(route, creep.room.name, toRoomName),
    });
}

module.exports = { isHighwayRoom, findRoute, routeCostCallback, moveToRoom };
