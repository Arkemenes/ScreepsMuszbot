// Room-LEVEL route planning: which chain of rooms to cross to reach ONE
// specific destination - the scout's sign/layout tasks, the reserver's
// reserve/claim missions - never the scout's exploratory wandering, which
// has no fixed destination to route around. Complements utils/move.js's
// travel(), which handles tile-level movement/caching once inside a room;
// this module only decides which rooms a cross-room moveTo() is allowed to
// cross through.

const remotes = require("../rooms/remotes");
const config = require("./config");
const roomCache = require("./roomCache");
const traffic = require("./traffic");
const excuseMe = require("./excuseMe");

function requestCrossRoomClearance(creep) {
    const path = creep.memory._move && creep.memory._move.path;
    const direction = path && Number(path[0]);
    const dx = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    if (direction < TOP || direction > TOP_LEFT) return false;
    const x = creep.pos.x + dx[direction];
    const y = creep.pos.y + dy[direction];
    if (x < 0 || x > 49 || y < 0 || y > 49) return false;
    const blocker = creep.room
        .lookForAt(LOOK_CREEPS, x, y)
        .find((other) => other.my && other.id !== creep.id);
    if (!blocker || !excuseMe.ask(creep, x, y)) return false;
    creep.move(direction);
    return true;
}

function followCachedStep(creep) {
    const path = creep.memory._move && creep.memory._move.path;
    const direction = path && Number(path[0]);
    if (direction < TOP || direction > TOP_LEFT) return false;
    creep.move(direction);
    return true;
}

function scoutTraceNextStep(creep) {
    const path = creep.memory._move && creep.memory._move.path;
    const direction = path && Number(path[0]);
    const dx = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    if (!direction || !dx[direction] && !dy[direction]) return null;
    const x = creep.pos.x + dx[direction];
    const y = creep.pos.y + dy[direction];
    if (x < 0 || x > 49 || y < 0 || y > 49) return null;
    return {
        pos: creep.room.name + ":" + x + "," + y,
        direction,
        creeps: creep.room.lookForAt(LOOK_CREEPS, x, y).map((other) => ({
            name: other.name,
            role: other.memory && other.memory.role,
            fatigue: other.fatigue,
        })),
        terrain: creep.room.getTerrain().get(x, y),
        structures: creep.room.lookForAt(LOOK_STRUCTURES, x, y).map((structure) =>
            structure.structureType
        ),
        sites: creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).map((site) =>
            site.structureType
        ),
    };
}

function traceScoutMove(creep, action, targetPos, status) {
    if (
        creep.memory.role !== "scout" ||
        !Memory.settings ||
        !Memory.settings.debug ||
        !Memory.settings.debug.scoutTrace
    ) return;
    console.log("[scoutTrace] " + JSON.stringify({
        tick: Game.time,
        action,
        status,
        pos: creep.room.name + ":" + creep.pos.x + "," + creep.pos.y,
        target: targetPos && targetPos.roomName + ":" + targetPos.x + "," + targetPos.y,
        fatigue: creep.fatigue,
        spawning: creep.spawning,
        activeMove: creep.body.filter((part) => part.type === MOVE && part.hits > 0).length,
        moveDest: creep.memory._move && creep.memory._move.dest,
        nextStep: scoutTraceNextStep(creep),
        realRoute: creep.memory._realRoute,
        routeDest: creep.memory._realRouteDest,
        avoid: creep.memory._routeAvoid,
        retreatTo: creep.memory._routeRetreatTo,
        noPath: creep.memory._routeNoPathTicks,
    }));
    if (action === "native-after" || action === "route-after") {
        traffic.watchScoutMove(creep);
    }
}

// Highway rooms sit on the map's coordinate grid (either axis a multiple of
// 10) - open, sourceless, usually ownerless space that forms natural travel
// corridors between the clusters of owned/claimed rooms. Preferred whenever
// a creep has one specific room to reach.
function isHighwayRoom(roomName) {
    const m = /^[EW](\d+)[NS](\d+)$/.exec(roomName);
    if (!m) return false;
    return Number(m[1]) % 10 === 0 || Number(m[2]) % 10 === 0;
}

// A creep that walks OUT of a room and back IN, over and over, on the way
// to one fixed destination - room-name trail [A,B,A,B]. Confirmed live
// (ROADMAP 0062 same-day fix): unlike the frozen-in-place cases below, the
// creep here genuinely MOVES every cycle (out the door, pause, back in,
// pause, back out) - its position never repeats for consecutive ticks, so
// isStuck()'s position-freeze check can't see this pattern at all, only a
// room-NAME trail can. Pure detection only - moveToRoom() below feeds
// whichever room the pattern closes on (creep.room.name at that moment,
// always the far side the creep keeps failing to get past - ROADMAP 0063)
// through the exact same retreatFrom() as a frozen stall.
function isBouncing(creep) {
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

// Is this creep sitting on one of the room's edge coordinates (x/y 0 or
// 49)? Only used now to gate the last-resort exit-tile nudge below (ROADMAP
// 0060) - which room a border stall was heading into no longer matters
// (ROADMAP 0063 - see retreatFrom()).
function isOnBorder(creep) {
    return (
        creep.pos.x === 0 || creep.pos.x === 49 ||
        creep.pos.y === 0 || creep.pos.y === 49
    );
}

// --- stall detection: a creep sitting still, several ticks running,
// anywhere in a room - not just a border tile. Confirmed live (ROADMAP
// 0060): the engine won't let a creep rest on an exit tile - one that stops
// there without a fresh move queued gets shoved back off it, which can
// happen before the next tick's script even reads its position. A creep
// stuck wandering (or truly frozen) somewhere in a room's interior (a maze
// of natural walls, a pocket with no way through) is the same blind spot,
// just never on a border tile at all. Generalized (ROADMAP 0061, researched
// from screeps-cartographer's creepIsStuck): same position/tick bookkeeping,
// anywhere in the room, and a tick with creep.fatigue > 0 never counts
// toward the counter - ordinary terrain/body fatigue isn't "stuck", only a
// creep that COULD move but hasn't. keyPrefix keeps independent callers
// (this module's own moveToRoom, roles/scout.js's free-roam exploration)
// from clobbering each other's tracking on a creep that does both jobs at
// different times.
function isStuck(creep, keyPrefix) {
    const posField = keyPrefix + "Pos";
    const ticksField = keyPrefix + "Ticks";
    if (creep.fatigue > 0) {
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
    return creep.memory[ticksField] >= config.get("routing.stuckTicks", 4) - 1;
}

// Step 1 tile in from whichever edge(s) the creep is sitting on, away from
// the border - queues an actual move intent for this tick directly (not
// moveTo()) so the engine's exit-tile snapback (ROADMAP 0060) never applies
// mid-tick. Returns false only if the creep isn't on an edge at all
// (nothing to nudge away from).
function nudgeAwayFromBorder(creep) {
    const x = creep.pos.x === 0 ? 1 : creep.pos.x === 49 ? 48 : creep.pos.x;
    const y = creep.pos.y === 0 ? 1 : creep.pos.y === 49 ? 48 : creep.pos.y;
    if (x === creep.pos.x && y === creep.pos.y) return false;
    creep.move(creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name)));
    return true;
}

// A room worth treating as dangerous to route through under
// opts.blockHostiles - either an actual hostile creep has been seen there
// (rooms/remotes.hasHostiles), or the room is owned outright by someone
// else's empire (rooms/remotes.isForeignOwned). ROADMAP 0064 live
// follow-up: a claimer walked straight into an enemy-owned room with zero
// hostile creeps currently visible, and got blocked anyway by walls/
// ramparts the owner had already built - creep presence was never the only
// way a room can be a threat to route through. An ally's room is exempt
// from the ownership half (same call isForeignOwned already makes) - their
// own interior obstacles are the separate, narrower problem ROADMAP 0061's
// terrain-slack handles.
function isDangerousRoom(roomName) {
    return remotes.hasHostiles(roomName) || remotes.isForeignOwned(roomName);
}

// ROADMAP 0077/0083 - multi-room routing needs a narrower structure policy
// than movement within one room: walls and private ramparts block a route,
// while public ramparts owned by another player remain valid tiles. Keep this
// matrix separate from utils/move.js's intra-room matrix so the two policies
// cannot change each other. The result is cached on the heap and uses the
// roomCache slot already shared by the rest of the tick.
const knownRoutingMatrices = {};

function routingStructureMatrix(room, roadCost) {
    const structures = roomCache.structures(room);
    const version = structures.map((structure) =>
        [structure.id, structure.structureType, structure.my ? 1 : 0, structure.isPublic ? 1 : 0].join(":"))
        .join("|");
    const cacheKey = version + "|road:" + roadCost;
    const cached = knownRoutingMatrices[room.name];
    if (cached && cached.version === cacheKey) return cached.matrix;

    const matrix = new PathFinder.CostMatrix();
    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_ROAD) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost);
        } else if (
            structure.structureType === STRUCTURE_WALL ||
            (structure.structureType === STRUCTURE_RAMPART &&
                !structure.my && !structure.isPublic)
        ) {
            matrix.set(structure.pos.x, structure.pos.y, 255);
        }
    }
    knownRoutingMatrices[room.name] = { version: cacheKey, matrix };
    return matrix;
}

function bodyTravelCosts(body, carriedAmount) {
    if (!Array.isArray(body) || !body.length) return null;
    const isActive = (part) =>
        !part || typeof part !== "object" || part.hits === undefined || part.hits > 0;
    const typeOf = (part) =>
        part && typeof part === "object" ? part.type : part;
    const moveParts = body.filter((part) =>
        isActive(part) && typeOf(part) === MOVE
    ).length;
    if (!moveParts) return null;
    const activeParts = body.filter(isActive).length;
    const carryParts = body.filter((part) =>
        isActive(part) && typeOf(part) === CARRY
    ).length;
    const amount = Math.max(0, Number(carriedAmount) || 0);
    const carryCapacity = typeof CREEP_PART_MAX_ENERGY === "number"
        ? CREEP_PART_MAX_ENERGY
        : 50;
    const loadedCarryParts = Math.min(carryParts, Math.ceil(amount / carryCapacity));
    const otherParts = activeParts - moveParts - carryParts + loadedCarryParts;
    const ticksPerTile = (fatiguePerPart) =>
        Math.max(1, Math.ceil((fatiguePerPart * otherParts) / (2 * moveParts)));
    return {
        roadCost: ticksPerTile(1),
        plainCost: ticksPerTile(2),
        swampCost: ticksPerTile(10),
    };
}

function knownStructureMatrix(roomName, roadCost) {
    const room = Game.rooms[roomName];
    return room ? routingStructureMatrix(room, roadCost === undefined ? 1 : roadCost) : null;
}

// ROADMAP 0076 - a room retreatFrom() below CONFIRMS as a genuine dead end
// (a creep was physically standing there and native moveTo() returned
// ERR_NO_PATH repeatedly - ROADMAP 0063 made this blame reliable, no
// longer a guess) is a fact about the ROOM, not just that one creep's
// trip. Sharing it lets every OTHER creep - a second pioneer sent moments
// later, say - skip discovering the exact same thing the hard way instead
// of each walking in and backing out independently. Confirmed live: an
// ally's interior rampart/wall (ROADMAP 0064's own terrain-only gap,
// still open in ROADMAP.md's "Later" section) blocked a pioneer's route
// through a room neither computeRealRoute (terrain-only) nor findRoute
// (room-graph only, ally exempt from isDangerousRoom on purpose) could
// see coming - but once ONE creep confirms it the hard way, there's no
// reason for a sibling pioneer sent right after to repeat the exact same
// wasted trip.
//
// This revives the spirit of the global blacklist ROADMAP 0058 had and
// ROADMAP 0062 deliberately killed - but 0062's reason for killing it
// (guessing WRONG which of two candidate rooms was the actual trap, a
// coin-flip between the room the creep was in and the one it came from)
// was fixed by 0063, which this only ever runs AFTER: creep.room.name at
// the moment retreatFrom() fires is ground truth now, never a guess.
// TTL'd (routing.deadEndTicks) since the obstruction can change - an ally
// might open a rampart or tear down a wall; console clearRouteDeadEnd()
// resets one early without waiting it out.
function isKnownDeadEnd(roomName) {
    const mem = Memory.rooms[roomName];
    if (remotes.isAllyOwned(roomName)) {
        if (mem && mem.routeDeadEndUntil) delete mem.routeDeadEndUntil;
        return false;
    }
    return !!(mem && mem.routeDeadEndUntil && mem.routeDeadEndUntil > Game.time);
}

function markDeadEnd(roomName) {
    // ROADMAP 0078 - see retreatFrom()'s own comment: never share a room I
    // own as a confirmed dead end. architect.js plans roads to every exit
    // by design, so a failure to route through/out of an owned room is
    // never a genuine, permanent fact about the room - always something
    // transient (search-space constraints, a build in progress) that a
    // shared, TTL'd mark would otherwise block every creep's routing on
    // for no reason. Confirmed live: exactly this happened.
    if (remotes.isMine(roomName) || remotes.isAllyOwned(roomName)) return;

    const alreadyKnown = isKnownDeadEnd(roomName);
    const ticks = config.get("routing.deadEndTicks", 10000);
    const mem = Memory.rooms[roomName] || (Memory.rooms[roomName] = {});
    mem.routeDeadEndUntil = Game.time + ticks;
    if (!alreadyKnown) {
        console.log(
            `[routing] ${roomName} confirmed a route dead end - every creep avoids it for ` +
                `${ticks} ticks (clearRouteDeadEnd("${roomName}") to reset early)`
        );
    }
}

global.clearRouteDeadEnd = function (roomName) {
    if (!Memory.rooms[roomName] || !Memory.rooms[roomName].routeDeadEndUntil) {
        console.log(`[routing] ${roomName} wasn't marked as a route dead end`);
        return;
    }
    delete Memory.rooms[roomName].routeDeadEndUntil;
    console.log(`[routing] ${roomName} route dead-end mark cleared`);
};

// Room-level route to `toRoomName`: opts.avoid (array of room names, ROADMAP
// 0062 - see moveToRoom() below) is excluded outright; highway rooms are
// cheapened so the search prefers them; a dangerous room (isDangerousRoom
// above) is heavily penalized, or - with opts.blockHostiles - excluded
// outright too. opts.allowRoom (ROADMAP 0075, (roomName) => boolean) is an
// extra, optional restriction ON TOP of avoid/hostile - a room this rejects
// is excluded outright regardless of everything else, same treatment as
// avoid. Lets a caller confine the whole trip to a subset of rooms it
// decides (remoteHauler/remoteMiner: only mine/reserved-by-me + the trip's
// own destination - the same rule remotes.roomCallback used to enforce on
// its own, narrower costCallback) without routing.js needing to know
// anything about what that subset means. Returns null when
// Game.map.findRoute finds nothing under those constraints.
function findRoute(fromRoomName, toRoomName, opts) {
    opts = opts || {};
    const avoid = opts.avoid || [];
    const hostilePenalty = config.get("routing.hostilePenalty", 10);
    const nonHighwayPenalty = config.get("routing.nonHighwayPenalty", 2);
    const route = Game.map.findRoute(fromRoomName, toRoomName, {
        routeCallback: (roomName) => {
            if (avoid.indexOf(roomName) !== -1) return Infinity;
            if (isKnownDeadEnd(roomName)) return Infinity;
            if (opts.allowRoom && !opts.allowRoom(roomName)) return Infinity;
            if (roomName === toRoomName) return 1;
            const dangerous = isDangerousRoom(roomName);
            if (dangerous && opts.blockHostiles) return Infinity;
            let cost = 1;
            if (dangerous) cost += hostilePenalty;
            if (!isHighwayRoom(roomName)) cost += nonHighwayPenalty;
            return cost;
        },
    });
    return route === ERR_NO_PATH ? null : route;
}

// costCallback for Creep.moveTo(): the creep's current room, the
// destination, whatever rooms findRoute() picked, AND (ROADMAP 0061,
// researched from screeps-cartographer's findRoute enhancement) each of
// those rooms' known neighbors (Memory.rooms[x].exits) are passable - every
// other room is excluded from the search. Game.map.findRoute only reasons
// about room-graph adjacency, never terrain inside a room, so the exact
// minimal hop sequence can leave the PathFinder with zero slack to route
// around an internal obstacle it can't see coming (a natural-wall maze, a
// pocket). The extra neighbors only ever ADD slack inside the general
// direction findRoute already chose; they never override its preference
// (hostile-avoidance, highway routing, opts.avoid). Fail-soft fallback: no
// exits intel for a hop yet (room never visited) just means no slack added
// for it.
function routeCostCallback(route, currentRoomName, toRoomName, opts) {
    opts = opts || {};
    const avoid = opts.avoid || [];
    const costs = bodyTravelCosts(opts.body, opts.carriedAmount) || { roadCost: 1 };
    const allowed = new Set([currentRoomName, toRoomName]);
    if (route) {
        for (const step of route) {
            if (opts.allowRoom && !opts.allowRoom(step.room)) continue;
            // ROADMAP 0076 - see isKnownDeadEnd()'s own comment.
            if (isKnownDeadEnd(step.room)) continue;
            allowed.add(step.room);
            const exits = Memory.rooms[step.room] && Memory.rooms[step.room].exits;
            if (!exits) continue;
            for (const neighbor of Object.values(exits)) {
                if (avoid.indexOf(neighbor) !== -1) continue;
                if (opts.blockHostiles && isDangerousRoom(neighbor)) continue;
                // ROADMAP 0075 - see findRoute()'s own allowRoom comment.
                if (opts.allowRoom && !opts.allowRoom(neighbor)) continue;
                if (isKnownDeadEnd(neighbor)) continue;
                allowed.add(neighbor);
            }
        }
    }
    // ROADMAP 0077 - see knownStructureMatrix()'s own comment: a room this
    // allowlist already accepted gets known-structure obstacles layered in
    // when it's currently in vision, instead of the bare terrain-only
    // matrix the engine handed in.
    return (roomName, matrix) =>
        allowed.has(roomName) ? knownStructureMatrix(roomName, costs.roadCost) || matrix : false;
}

// ROADMAP 0064 live follow-up - the actual root cause, found with a raw
// PathFinder.search from the console (no code of ours in the way): a
// creep's real route kept getting blamed for dead ends in rooms later
// proven, room by room, to be completely clean. The smoking gun: a raw
// search from the creep's own live position, excluding only the ONE
// genuinely closed room, found a complete path in ~1300 ops straight
// through every room routeCostCallback() above had been blaming - the
// EXACT rooms a validated _realRoute already said were fine.
//
// routeCostCallback() above is an ALLOWLIST: only the exact rooms
// computeRealRoute()'s room-sequence names, plus one layer of each of
// THEIR known neighbors, are traversable - everything else is
// unconditionally blocked (ROADMAP 0061's own design, "no slack to route
// around an internal obstacle"). computeRealRoute() itself is the
// opposite - a BLOCKLIST (only opts.avoid/hostile excluded, every other
// room fully open, see its own roomCallback above). So a room sequence
// computeRealRoute() validates as walkable can still be unreachable
// through the allowlist if the REAL tile-level path needs to wiggle
// through so much as one room that isn't the exact sequence or a direct
// neighbor of it - which real terrain, full of natural-wall mazes, does
// often enough to explain every failure traced today. The one layer of
// neighbor slack (ROADMAP 0061) was a hedge against exactly this, and it
// wasn't enough.
//
// So: once a route has actually been validated against real terrain
// (opts.realRoute, an active _realRoute), TRUST that validation and give
// the native search the SAME freedom computeRealRoute() itself used -
// blocklist, not allowlist. moveToRoom() below only reaches for this
// while a validated _realRoute is driving the route; the findRoute()-only
// fallback (a room-graph guess, never terrain-checked) keeps using
// routeCostCallback()'s narrower allowlist - that guess has never been
// walked before, so keeping it roughly on the path findRoute() chose is
// still the safer default there.
function avoidCostCallback(avoid, opts) {
    opts = opts || {};
    avoid = avoid || [];
    const costs = bodyTravelCosts(opts.body, opts.carriedAmount) || { roadCost: 1 };
    return (roomName, matrix) => {
        if (avoid.indexOf(roomName) !== -1) return false;
        if (opts.blockHostiles && isDangerousRoom(roomName)) return false;
        // ROADMAP 0075 - see findRoute()'s own allowRoom comment.
        if (opts.allowRoom && !opts.allowRoom(roomName)) return false;
        // ROADMAP 0076 - see isKnownDeadEnd()'s own comment.
        if (isKnownDeadEnd(roomName)) return false;
        // ROADMAP 0077 - see knownStructureMatrix()'s own comment.
        return knownStructureMatrix(roomName, costs.roadCost) || matrix;
    };
}

function hopCostCallback(currentRoomName, targetRoomName, opts) {
    opts = opts || {};
    const costs = bodyTravelCosts(opts.body, opts.carriedAmount) || { roadCost: 1 };
    return (roomName, matrix) => {
        if (roomName !== currentRoomName && roomName !== targetRoomName) return false;
        if (opts.blockHostiles && isDangerousRoom(roomName) && roomName !== targetRoomName) {
            return false;
        }
        if (opts.allowRoom && !opts.allowRoom(roomName)) return false;
        if (isKnownDeadEnd(roomName)) return false;
        return knownStructureMatrix(roomName, costs.roadCost) || matrix;
    };
}

// ROADMAP 0064: one-time, cached-per-trip validation that a room sequence
// is actually WALKABLE (real terrain, Game.map.getRoomTerrain - available
// even without vision, unlike structures), not just adjacent on the map
// graph. Game.map.findRoute() can never see the kind of dead end ROADMAP
// 0063 backtracks away from - it only knows room-graph adjacency, never
// terrain - so this validates the whole trip upfront instead, for the one
// caller (the claimer) that can least afford to burn travel ticks
// discovering a dead end the hard way (CREEP_CLAIM_LIFE_TIME is a fixed
// 600 ticks total, ROADMAP 0033, not the usual 1500). Runs PathFinder.
// search ONCE per trip (opt-in via moveToRoom()'s opts.realRoute below) -
// a completely different cost profile than the reachability pre-check
// that was tried and reverted before (that ran once per room ENTERED, for
// a scout cycling through many candidate rooms in a row - several fresh
// uncached searches in quick succession was what drained the bucket, not
// the idea of pre-checking itself).
//
// roomCallback only ever excludes (opts.avoid, and - opts.blockHostiles - a
// dangerous room per isDangerousRoom() below: known-hostile creep OR
// foreign-owned outright); every other room is left at plain terrain cost,
// no structures - most of a long trip is unvisited territory anyway, the
// same blind spot Game.map.findRoute already had (an ally's own room is
// exempt from the ownership half and still just plain terrain here - their
// interior obstacles, if any, are the reactive backtrack's job, not this
// precheck's - ROADMAP 0061's live incident). Returns the resulting
// path collapsed to a deduped room-name sequence (the origin room itself
// excluded, same convention Game.map.findRoute's own hop list already
// uses), or null if PathFinder.search came back incomplete/empty - never
// the only source of truth, always safe to ignore and fall back to
// findRoute()/the reactive backtrack (ROADMAP 0063).
function computeRealRoute(fromPos, toRoomName, opts) {
    opts = opts || {};
    const avoid = opts.avoid || [];
    const costs = bodyTravelCosts(opts.body, opts.carriedAmount) || {
        roadCost: 1,
        plainCost: 1,
        swampCost: 5,
    };
    const targetPos = hopEntryPosition(fromPos.roomName, toRoomName);
    const result = PathFinder.search(
        fromPos,
        { pos: targetPos, range: 0 },
        {
            plainCost: costs.plainCost,
            swampCost: costs.swampCost,
            maxRooms: config.get("routing.realRouteMaxRooms", 64),
            maxOps: config.get("routing.realRouteMaxOps", 200000),
            roomCallback: (roomName) => {
                if (avoid.indexOf(roomName) !== -1) return false;
                if (opts.blockHostiles && isDangerousRoom(roomName)) return false;
                // ROADMAP 0075 - see findRoute()'s own allowRoom comment.
                if (opts.allowRoom && !opts.allowRoom(roomName)) return false;
                // ROADMAP 0076 - see isKnownDeadEnd()'s own comment.
                if (isKnownDeadEnd(roomName)) return false;
                // ROADMAP 0077 - see knownStructureMatrix()'s own comment:
                // undefined (the implicit fall-through) keeps the prior
                // terrain-only behavior for a room with no vision this tick.
                return knownStructureMatrix(roomName, costs.roadCost) || undefined;
            },
        }
    );
    if (!result || result.incomplete || !result.path.length) return null;

    const rooms = [];
    for (const pos of result.path) {
        if (pos.roomName === fromPos.roomName) continue;
        if (rooms[rooms.length - 1] !== pos.roomName) rooms.push(pos.roomName);
    }
    if (!rooms.length) return null;

    // A terrain search can return a path whose room trace is not usable as a
    // hop plan after collapsing tiles. Never hand moveToRoom() a non-adjacent
    // first hop; fall back to the room-graph route instead.
    if (!isValidRoomTrace(fromPos.roomName, rooms)) return null;
    return rooms;
}

function isValidRoomTrace(fromRoomName, rooms) {
    let previousRoom = fromRoomName;
    for (const roomName of rooms || []) {
        let distance;
        try {
            distance = Game.map.getRoomLinearDistance
                ? Game.map.getRoomLinearDistance(previousRoom, roomName)
                : null;
        } catch (e) {
            distance = null;
        }
        if (distance !== null && distance !== 1) return false;
        previousRoom = roomName;
    }
    return true;
}

function hopEntryPosition(fromRoomName, toRoomName) {
    const matchRoom = (roomName) => {
        const match = /^([WE])(\d+)([NS])(\d+)$/.exec(roomName);
        if (!match) return null;
        return {
            x: (match[1] === "W" ? -1 : 1) * Number(match[2]),
            y: (match[3] === "N" ? -1 : 1) * Number(match[4]),
        };
    };
    const from = matchRoom(fromRoomName);
    const to = matchRoom(toRoomName);
    if (!from || !to) return new RoomPosition(25, 25, toRoomName);

    let edge = null;
    if (to.x > from.x) edge = { axis: "x", value: 0 };
    else if (to.x < from.x) edge = { axis: "x", value: 49 };
    else if (to.y > from.y) edge = { axis: "y", value: 0 };
    else if (to.y < from.y) edge = { axis: "y", value: 49 };
    if (!edge) return new RoomPosition(25, 25, toRoomName);

    const terrain = Game.map.getRoomTerrain && Game.map.getRoomTerrain(toRoomName);
    const fromTerrain = Game.map.getRoomTerrain && Game.map.getRoomTerrain(fromRoomName);
    const matrix = knownStructureMatrix(toRoomName);
    const fromMatrix = knownStructureMatrix(fromRoomName);
    const isWalkable = (roomTerrain, roomMatrix, x, y) =>
        (!roomTerrain || roomTerrain.get(x, y) !== TERRAIN_MASK_WALL) &&
        (!roomMatrix || roomMatrix.get(x, y) < 255);
    const candidates = [];
    for (let offset = 0; offset < 50; offset++) {
        for (const delta of [offset, -offset]) {
            const variable = 25 + delta;
            if (variable < 0 || variable > 49) continue;
            const x = edge.axis === "x" ? edge.value : variable;
            const y = edge.axis === "y" ? edge.value : variable;
            if (!isWalkable(terrain, matrix, x, y)) continue;
            const fromX = edge.axis === "x" ? (to.x > from.x ? 49 : 0) : variable;
            const fromY = edge.axis === "y" ? (to.y > from.y ? 49 : 0) : variable;
            if (!isWalkable(fromTerrain, fromMatrix, fromX, fromY)) continue;
            candidates.push(new RoomPosition(x, y, toRoomName));
        }
        if (candidates.length) return candidates[0];
    }
    return new RoomPosition(25, 25, toRoomName);
}

// Records each room this creep has actually STOOD IN while travelling
// toward the current destination, in visiting order (creep.memory.
// _routeStack) - ground truth for retreatFrom() below, never a guess about
// room-graph geometry. moveToRoom() resets this (and any in-progress
// retreat) whenever the destination itself changes, before this is ever
// called - a room-history from a past trip (e.g. squad.js sending the same
// creep to squad.target, then later to squad.from) would point
// retreatFrom() the wrong way otherwise.
function pushRouteHistory(creep) {
    const stack = creep.memory._routeStack || (creep.memory._routeStack = []);
    if (stack[stack.length - 1] !== creep.room.name) stack.push(creep.room.name);
}

// ROADMAP 0063 - the actual fix for "a creep gives up on a dead-end room
// and just sits at its border instead of backtracking" (ROADMAP
// 0057/0058/0060/0061/0062, five specs straight at the same live bug,
// none of which fixed it). Root cause, confirmed by reading how
// Game.map.findRoute() actually works: routeCallback(roomName) is called
// only for rooms the search CONSIDERS ENTERING - never for the room the
// search starts FROM. So every previous fix's core move, "push the room
// the creep is stuck in onto its own avoid list, then call findRoute()
// again FROM that same room", changed nothing: the very next findRoute()
// call still starts from that dead-end room, whose own entry in `avoid`
// is never once read by routeCallback. A room-graph edge (findRoute only
// knows room-adjacency, never terrain - ARCHITECTURE.md's routeCostCallback
// note) can look fine two hops away and only turn out unwalkable once a
// creep is actually standing in the room before it - and avoiding a room
// only ever works from a DIFFERENT room's search.
//
// So: retreat one hop back to the room this creep was last known to be
// in (creep.memory._routeStack, an honest record of its own path - never
// guessed from linear distance or a name-trail coin flip, the two ways
// ROADMAP 0061's fixes broke), NOW exclude the dead end (from there, it's
// a real candidate routeCallback actually evaluates), and let findRoute()
// pick a genuinely different room (ROADMAP: B>D>E instead of B>C>E, once
// C proves to be the dead end).
// Shared by retreatFrom() and retreatWithoutBlame() below: pop the current
// room off the visited-history stack (if it's on top) and point the creep
// back at whatever room is left on top after that - its own real path,
// never a guess. Returns the retreat target, or undefined if there was
// nothing earlier to retreat to (this room was the trip's own origin).
function popStackAndRetreat(creep) {
    const stack = creep.memory._routeStack || [];
    if (stack[stack.length - 1] === creep.room.name) stack.pop();
    creep.memory._routeStack = stack;
    const prev = stack[stack.length - 1];
    if (prev) creep.memory._routeRetreatTo = prev;
    return prev;
}

// ROADMAP 0078 - see retreatFrom()'s own comment below: does this creep's
// own visited history have anything BEHIND the room it's standing in right
// now? If not, this room is this leg's own origin - there's nowhere honest
// to retreat to, and treating it as a confirmed dead end would be exactly
// the mistake retreatWithoutBlame() already exists to avoid one level up.
function hasEarlierRoom(creep) {
    const stack = creep.memory._routeStack || [];
    const trimmed = stack[stack.length - 1] === creep.room.name ? stack.slice(0, -1) : stack;
    return trimmed.length > 0;
}

function retreatFrom(creep) {
    // ROADMAP 0078 - confirmed live: a pioneer's own OWNED home room
    // (spawns, roads to every exit by architect.js design) got blamed and
    // shared as a route dead end, blocking every other creep's routing
    // through/into it too. Root cause traced: when retreatWithoutBlame()
    // (below) falls through with no earlier room either, moveToRoom()
    // retries the ordinary findRoute()-based flow FROM that same room -
    // if THAT also fails for routing.noPathTicks ticks straight (a search
    // genuinely constrained by the accumulated avoid list, or some other
    // transient cause - never proof the room itself is unenterable), this
    // function fires again with creep.room.name now pointing at what is
    // really this leg's own origin.
    //
    // Only suspect a false blame under BOTH conditions at once: no earlier
    // room to retreat to (hasEarlierRoom) AND this creep has already
    // confirmed at least one OTHER dead end this same trip (_routeAvoid
    // already non-empty) - i.e. this is a SECOND-OR-LATER retreat cycle
    // landing back on ground with nothing behind it, exactly the
    // accumulating-constraint pattern retreatWithoutBlame() exists for.
    // A creep's very FIRST stall this trip (avoid still empty) with no
    // earlier room is a genuinely different, trustworthy signal - it
    // never moved, and native moveTo() still can't find a way out - so it
    // keeps the original ROADMAP 0063 blame (confirmed by the existing
    // "parked at its own trip origin" test in test/smoke.js).
    const avoidSoFar = creep.memory._routeAvoid || [];
    if (avoidSoFar.length > 0 && !hasEarlierRoom(creep)) {
        retreatWithoutBlame(creep);
        return;
    }

    delete creep.memory._move; // stale native path cache - force a fresh search
    creep.memory._routeNoPathTicks = 0; // fresh streak once we're back on known-good ground

    // ROADMAP 0064: a cached real-route (opts.realRoute) that still led
    // to this dead end was wrong about something (new construction, most
    // likely) - discard it rather than try to patch a validated sequence
    // mid-trip. findRoute()/the ordinary reactive backtrack above takes
    // over for the rest of the trip.
    delete creep.memory._realRoute;
    delete creep.memory._realRouteDest;
    delete creep.memory._realRouteFrom;

    // ROADMAP 0078: never let THIS creep permanently avoid a room it owns
    // either - the shared-cache guard in markDeadEnd() below covers every
    // OTHER creep, but this creep's own _routeAvoid is separate state; left
    // unguarded, it could later refuse to even try going home
    // (moveToRoom()'s own toRoomName-in-_routeAvoid early refusal).
    if (!remotes.isMine(creep.room.name)) {
        const avoid = creep.memory._routeAvoid || (creep.memory._routeAvoid = []);
        if (avoid.indexOf(creep.room.name) === -1) avoid.push(creep.room.name);
    }

    // ROADMAP 0076 - see isKnownDeadEnd()'s own comment: this room is
    // confirmed, not guessed, so share it with every other creep too.
    // markDeadEnd() has its own independent "never mine" guard (ROADMAP
    // 0078) - kept there too, not just here, so it protects any future
    // caller of markDeadEnd(), not only this one.
    markDeadEnd(creep.room.name);

    popStackAndRetreat(creep);
}

// ROADMAP 0064 live follow-up - confirmed live with a full trace: once
// _routeAvoid grows enough that computeRealRoute (200000 ops, 64 rooms -
// generous, not a per-tick search) can no longer find ANY complete route
// avoiding it, moveToRoom() used to silently fall back to plain
// findRoute() - the ORIGINAL room-graph-only, zero-terrain-validation
// mechanism computeRealRoute exists specifically to replace. findRoute()
// then handed back a long, entirely unvalidated room sequence (confirmed
// live: 36 hops, a wraparound detour), which failed to execute just like
// any ungrounded guess would - and the room the creep happened to be
// standing in (never actually blocked - confirmed after the fact by
// checking its terrain directly) got permanently blacklisted for a
// failure that was never really about that room at all. Each wrongful
// blacklist made the NEXT leg's avoid list bigger, forcing an even longer
// unvalidated detour, compounding until the creep's CREEP_CLAIM_LIFE_TIME
// ran out mid-cascade.
//
// So: when computeRealRoute itself can't find anything, that is not
// evidence the CURRENT room is a dead end (it was never actually
// attempted) - it means the accumulated avoid list has made the
// neighborhood too constrained FROM HERE. Retreat one more hop
// immediately (same one-room-at-a-time discipline as retreatFrom, driven
// by this creep's own real _routeStack) WITHOUT adding the current room
// to _routeAvoid, and without ever falling through to execute the
// unvalidated findRoute() route at all.
function retreatWithoutBlame(creep) {
    delete creep.memory._move;
    creep.memory._routeNoPathTicks = 0;
    delete creep.memory._realRoute;
    delete creep.memory._realRouteDest;
    delete creep.memory._realRouteFrom;

    popStackAndRetreat(creep);
}

// Route-aware Creep.moveTo() to a specific room - see findRoute() above.
// opts: range, reusePath (moveTo defaults below), blockHostiles (the
// reserver: never route through a room with known hostiles).
//
// Rooms that prove impassable are tracked per-CREEP (creep.memory.
// _routeAvoid, ROADMAP 0062), not as a global Memory.rooms flag with a TTL
// - permanently for the rest of this creep's trip. Avoiding one extra room
// a creep never needed anyway costs nothing; it never affects any other
// creep's routing.
//
// ROADMAP 0063 live follow-up: gating retreatFrom() on mere POSITION
// freeze (isStuck) was itself a false-positive trap. Confirmed live: a
// creep froze in W1N50, retreatFrom() backed it out to W2N50 - but W1N50's
// border to W0N50 turned out to be wide open (checked the room's terrain
// directly), so nothing there was actually a dead end. A creep can sit
// still for several ticks running for reasons that have nothing to do
// with the route being bad - a highway room is shared, foreign traffic
// (or a stalled ally) parked on the one tile ahead looks IDENTICAL to a
// sealed room from a position-freeze counter's point of view, but native
// moveTo() itself already knows the difference: it returns ERR_NO_PATH
// only when PathFinder genuinely finds nothing, and OK whenever a real
// path was found (traffic blocking the very next step doesn't change
// that return code - the path is still valid, just temporarily blocked).
// So the retreat trigger is now that authoritative signal directly -
// consecutive ERR_NO_PATH ticks (creep.memory._routeNoPathTicks) - never
// "hasn't moved". A room with real traffic never accumulates a streak (a
// single OK tick resets it); a genuine dead end returns ERR_NO_PATH every
// tick without exception, so it still gets caught just as fast.
//
// ROADMAP 0064 live follow-up: computeRealRoute() only ever ran ONCE, at
// the very start of a trip - confirmed live, that's not enough. A creep
// can legitimately walk a validated real route into a room that LOOKS
// fine on terrain alone (an ally's own room, exempt from isDangerousRoom
// on purpose - ROADMAP 0064's own live follow-up) but turns out blocked in
// practice by something terrain never sees (their interior rampart/wall,
// ROADMAP 0061's original incident). retreatFrom() correctly discards the
// stale _realRoute then - but every leg AFTER that dead end used to fall
// back to plain findRoute()-based routing for the REST of the trip, which
// is exactly the narrow-search-space mechanism ROADMAP 0064 exists to
// route around in the first place: confirmed live, it went on to falsely
// reject W1N50->W0N50 (a real, wide-open border) right after discarding
// the real route over the ally room. So: re-validate against real terrain
// again once a retreat actually completes (a natural "new leg" boundary,
// not a per-tick retry) - see moveToRoom() below.
//
// Returns true when a route was found and cached, false when opts.realRoute
// is on but computeRealRoute() found nothing (see retreatWithoutBlame()
// above for why that return value matters at the retreat-completion call
// site), and undefined when opts.realRoute is explicitly opted out
// (nothing to report either way).
//
// ROADMAP 0075: opts.realRoute flipped from opt-IN to opt-OUT
// (`opts.realRoute === false` skips this, anything else - including
// leaving it unset - runs it). Every real caller already passed
// `realRoute: true` explicitly by the time this changed (scout's
// sign/layout tasks, reserver, raider, pioneer, squad) - a role written
// tomorrow that forgets to pass the flag used to silently fall back to the
// original reactive-only backtrack this whole mechanism exists to avoid;
// now it gets the same upfront validation everyone else already relies on,
// with no way to forget it. The one caller that genuinely shouldn't pay
// this cost - scout's own free-roam exploration, no fixed destination, a
// fresh direct-neighbor hop every cycle, validating terrain for a room
// that's already adjacent buys nothing - opts out explicitly instead.
function tryComputeRealRoute(creep, toRoomName, opts) {
    if (opts.realRoute === false) return;
    const avoid = creep.memory._routeAvoid || [];
    const real = computeRealRoute(
        creep.pos,
        toRoomName,
        Object.assign({}, opts, {
            avoid,
            body: creep.body,
            carriedAmount: creep.store && creep.store.getUsedCapacity
                ? creep.store.getUsedCapacity()
                : 0,
        })
    );
    if (real) {
        creep.memory._realRoute = real;
        creep.memory._realRouteDest = toRoomName;
        // computeRealRoute() excludes the room it started FROM (same
        // convention as Game.map.findRoute's own hop list) - the creep is
        // still standing right there this same tick, so remembering it is
        // what lets the route-selection below tell "haven't left yet, use
        // the whole cached sequence" apart from "genuinely fell off it
        // later" (both look like "not found in the array" otherwise).
        creep.memory._realRouteFrom = creep.room.name;
        return true;
    }
    return false;
}

// No PER-TICK reachability pre-check here on purpose (a PathFinder.search
// was tried and reverted - ROADMAP: it ran once per room entered, but a
// creep cycling through several dead-end candidate rooms in a row meant
// several fresh uncached searches in quick succession; that's cheap in
// isolation but was enough to drain the CPU bucket in practice). A pre-check
// PER LEG of a trip (start, and again after every retreat) is a different
// story - see opts.realRoute below (ROADMAP 0064, default-on since ROADMAP
// 0075 - opt OUT with `realRoute: false` instead) and tryComputeRealRoute()
// above, bounded by the number of dead ends actually found either way.
function moveToRoom(creep, toRoomName, opts) {
    opts = opts || {};
    const range = opts.range === undefined ? 20 : opts.range;
    const moveOpts = {
        range: 20,
        reusePath: opts.reusePath === undefined ? 20 : opts.reusePath,
    };

    if (opts.nativeRoute) {
        if (isOnBorder(creep) && nudgeAwayFromBorder(creep)) {
            traceScoutMove(creep, "nudge", null, OK);
            return OK;
        }
        if (!creep.memory._realRoute || creep.memory._realRouteDest !== toRoomName) {
            tryComputeRealRoute(creep, toRoomName, opts);
        }
        const route = creep.memory._realRoute && creep.memory._realRouteDest === toRoomName
            ? (() => {
                const idx = creep.memory._realRoute.indexOf(creep.room.name);
                return (idx === -1
                    ? creep.memory._realRoute
                    : creep.memory._realRoute.slice(idx + 1)
                ).map((room) => ({ room }));
            })()
            : findRoute(creep.room.name, toRoomName, opts);
        const nextRoom = route && route.length ? route[0].room : toRoomName;
        const cachedDest = creep.memory._move && creep.memory._move.dest;
        const cachedRoom = cachedDest && (cachedDest.roomName || cachedDest.room);
        if (cachedRoom && cachedRoom !== nextRoom) delete creep.memory._move;
        const costs = bodyTravelCosts(
            creep.body,
            creep.store && creep.store.getUsedCapacity ? creep.store.getUsedCapacity() : 0
        ) || { roadCost: 1, plainCost: 1, swampCost: 5 };
        const hopOpts = Object.assign({}, opts, {
            body: creep.body,
            carriedAmount: creep.store && creep.store.getUsedCapacity
                ? creep.store.getUsedCapacity()
                : 0,
        });
        const targetPos = hopEntryPosition(creep.room.name, nextRoom);
        traceScoutMove(creep, "native-before", targetPos);
        const status = creep.moveTo(targetPos, {
            range,
            reusePath: moveOpts.reusePath,
            maxOps: config.get("routing.moveMaxOps", 20000),
            maxRooms: 2,
            plainCost: costs.plainCost,
            swampCost: costs.swampCost,
            costCallback: hopCostCallback(creep.room.name, nextRoom, hopOpts),
        });
        if (status === OK) requestCrossRoomClearance(creep);
        traceScoutMove(creep, "native-after", targetPos, status);
        return status;
    }

    // ROADMAP 0064 live follow-up: the engine's own defaults (maxOps 2000,
    // maxRooms 16) can be too small once routeCostCallback's "allowed" set
    // spans several rooms with real natural-wall clutter (maxOps) or the
    // validated route itself simply runs longer than 16 rooms (maxRooms,
    // a hard cap on rooms EXPLORED regardless of ops left) - confirmed
    // live, a route computeRealRoute (200000 ops, 64 rooms) had JUST
    // validated as genuinely walkable still came back ERR_NO_PATH from
    // this exact same native moveTo() call, immediately triggering
    // another (wrong) retreat. ROADMAP 0075: originally scoped to
    // opts.realRoute callers only (today, just the claimer's "claim"
    // mission) - now tracks the same opt-out default tryComputeRealRoute()
    // uses above, since every caller that reaches this branch already runs
    // computeRealRoute() itself; a bigger ceiling isn't free CPU-wise in
    // the abstract (constitution §1), but it's only ever paid on the same
    // tick a fresh path is actually needed, same as before.
    if (opts.realRoute !== false) {
        moveOpts.maxOps = config.get("routing.moveMaxOps", 20000);
        moveOpts.maxRooms = config.get("routing.moveMaxRooms", 64);
    }

    if (creep.memory._routeStackDest !== toRoomName) {
        // a new destination starts a fresh trip - any room-history/retreat
        // state left over from a previous one (e.g. squad.js sending this
        // same creep to squad.target, then later to squad.from) would
        // point retreatFrom() the wrong way otherwise.
        creep.memory._routeStackDest = toRoomName;
        creep.memory._routeStack = [];
        creep.memory._routeNoPathTicks = 0;
        delete creep.memory._routeRetreatTo;
        delete creep.memory._realRoute;
        delete creep.memory._realRouteDest;
        delete creep.memory._realRouteFrom;

        // ROADMAP 0064, default-on since ROADMAP 0075: real-terrain
        // validation of this leg of the trip - see
        // tryComputeRealRoute()/computeRealRoute() above. Runs for every
        // caller unless it opts out with `realRoute: false` (scout's own
        // free-roam exploration - no fixed destination, a fresh
        // direct-neighbor hop every cycle, nothing worth pre-validating).
        tryComputeRealRoute(creep, toRoomName, opts);
    }

    let forceCachedStep = false;
    const progressKey = creep.room.name + ":" + toRoomName;
    const progressPos = creep.pos.x + ":" + creep.pos.y + ":" + creep.pos.roomName;
    if (creep.memory._routeProgressKey !== progressKey) {
        creep.memory._routeProgressKey = progressKey;
        creep.memory._routeProgressPos = progressPos;
        creep.memory._routeNoProgressTicks = 0;
    } else if (creep.memory._routeProgressPos === progressPos && creep.fatigue === 0) {
        creep.memory._routeNoProgressTicks = (creep.memory._routeNoProgressTicks || 0) + 1;
        if (creep.memory._routeNoProgressTicks >= config.get("routing.noProgressTicks", 4)) {
            delete creep.memory._move;
            creep.memory._routeNoProgressTicks = 0;
            forceCachedStep = true;
        }
    } else {
        creep.memory._routeProgressPos = progressPos;
        creep.memory._routeNoProgressTicks = 0;
    }

    // The destination ITSELF already proved unreachable from here - refuse
    // outright rather than walking up to its border and trying the
    // identical crossing every few ticks forever (routeCostCallback always
    // allows `toRoomName` - you have to be able to reach your actual
    // destination - so without this check nothing else here would ever
    // stop that retry loop once the trap IS the destination). ROADMAP 0076:
    // same refusal when a DIFFERENT creep already confirmed the destination
    // itself is a dead end - no reason for this one to rediscover it.
    if ((creep.memory._routeAvoid || []).indexOf(toRoomName) !== -1 || isKnownDeadEnd(toRoomName)) {
        return ERR_NO_PATH;
    }

    // Mid-retreat from a dead end found earlier this trip (retreatFrom()
    // below): keep walking back to that room, ignoring toRoomName for now,
    // until the creep is actually standing in it again.
    if (creep.memory._routeRetreatTo) {
        if (creep.room.name === creep.memory._routeRetreatTo) {
            delete creep.memory._routeRetreatTo;
            // ROADMAP 0064 live follow-up: a retreat completing is a new
            // leg of the trip starting from known-good ground, with the
            // dead end that caused it now correctly in _routeAvoid -
            // exactly the moment to re-validate the REST of the trip
            // against real terrain again, instead of leaving every leg
            // after the first dead end on the narrower findRoute()-only
            // path for good.
            const found = tryComputeRealRoute(creep, toRoomName, opts);
            if (found === false) {
                // computeRealRoute (200000 ops, 64 rooms) found NOTHING
                // avoiding _routeAvoid so far - confirmed live, falling
                // through to findRoute() here used to hand back a long,
                // entirely unvalidated room sequence that failed anyway
                // and got THIS room wrongly blacklisted for it (it was
                // never actually attempted). Retreat one more hop instead,
                // without blaming this room - see retreatWithoutBlame().
                retreatWithoutBlame(creep);
                if (creep.memory._routeRetreatTo) {
                    return creep.moveTo(new RoomPosition(25, 25, creep.memory._routeRetreatTo), moveOpts);
                }
                // no earlier room either - fail-soft, fall through to the
                // normal findRoute()-based flow below as an absolute last
                // resort (matches the trip-start case, which has the same
                // "nowhere to retreat to" fallback).
            }
        } else {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory._routeRetreatTo), moveOpts);
        }
    }

    pushRouteHistory(creep);

    // isBouncing is a separate signal on purpose: a room whose interior is
    // a sealed pocket can still make native moveTo() return OK every tick
    // (a partial path into the pocket is still "a path"), so the
    // ERR_NO_PATH streak below would never catch it - only the room-name
    // trail can (ROADMAP 0062's live incident).
    if (isBouncing(creep)) {
        creep.memory._routeTrail = [];
        retreatFrom(creep);
        if (creep.memory._routeRetreatTo) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory._routeRetreatTo), moveOpts);
        }
    }

    const avoid = creep.memory._routeAvoid || [];

    // Confirmed live: the engine's own reusePath cache (creep.memory._move)
    // isn't invalidated just because a NEW costCallback closure is handed
    // to moveTo() this tick - it only recomputes when the destination
    // changes, the cache expires, or the next cached tile turns out
    // physically blocked. A path cached before some room joined `avoid`
    // can keep being walked, straight through that room, for the rest of
    // its reusePath window - retreatFrom() already deletes _move the
    // moment IT fires, but that's not the only way avoid can have grown
    // since the path now being followed was computed. Comparing avoid's
    // length catches that gap generally: any growth since the last time
    // this creep's path was (re)computed forces a fresh one, so the
    // costCallback below is never silently ignored.
    if (creep.memory._routeAvoidSeenLen !== avoid.length) {
        delete creep.memory._move;
        creep.memory._routeAvoidSeenLen = avoid.length;
    }

    const routeOpts = Object.assign({}, opts, { avoid, body: creep.body });
    const costs = bodyTravelCosts(
        creep.body,
        creep.store && creep.store.getUsedCapacity ? creep.store.getUsedCapacity() : 0
    ) || { roadCost: 1, plainCost: 1, swampCost: 5 };

    // ROADMAP 0064 same-day follow-up, second root cause: a validated real
    // route takes over from findRoute() entirely while it lasts - it's a
    // CONFIRMED walkable sequence, not a room-graph guess. Confirmed live
    // (a fresh trace right after the avoidCostCallback fix shipped): this
    // used to discard the ENTIRE cached _realRoute - falling all the way
    // back to findRoute()/routeCostCallback's narrow allowlist, the exact
    // mechanism this whole spec exists to route around - the instant the
    // creep's ACTUAL room wasn't found in the recorded sequence (idx===-1).
    // But avoidCostCallback is a deliberate BLOCKLIST, not an allowlist - it
    // never constrains the native search to the recorded sequence, only to
    // "not avoided/hostile". So the native PathFinder is completely free to
    // (and regularly does) choose a cheaper path through rooms outside that
    // exact list - confirmed live via _routeStack diverging from the
    // recorded _realRoute within the very first couple of hops (W2N51/
    // W0N50 walked, neither one in the cached sequence). That deviation is
    // NOT evidence the terrain validation was wrong - it's the blocklist
    // freedom working as designed - but the old code treated it as "stop
    // trusting this route", re-triggering the identical cascade of
    // wrongful one-room-at-a-time blaming the avoidCostCallback fix was
    // supposed to end. Fix: idx===-1 no longer invalidates _realRoute -
    // same treatment as "still standing at the search's own origin room"
    // (also always idx===-1, since computeRealRoute excludes the room it
    // started from) - just fall back to the whole cached sequence as a
    // best-effort logging aid; avoidCostCallback itself never reads `route`
    // at all, only the always-fresh `avoid` list below, so there's nothing
    // stale to worry about functionally, only for the diagnostic log line.
    if (
        creep.memory._realRoute &&
        creep.memory._realRouteDest === toRoomName &&
        !isValidRoomTrace(
            creep.memory._realRouteFrom || creep.room.name,
            creep.memory._realRoute
        )
    ) {
        delete creep.memory._realRoute;
        delete creep.memory._realRouteDest;
        delete creep.memory._realRouteFrom;
    }

    let route;
    let usingRealRoute = false;
    if (creep.memory._realRoute && creep.memory._realRouteDest === toRoomName) {
        usingRealRoute = true;
        const idx = creep.memory._realRoute.indexOf(creep.room.name);
        route = (idx === -1 ? creep.memory._realRoute : creep.memory._realRoute.slice(idx + 1)).map(
            (r) => ({ room: r })
        );
    } else {
        route = findRoute(creep.room.name, toRoomName, routeOpts);
    }

    const nextHop = usingRealRoute && route.length ? route[0].room : null;
    const singleHop = nextHop !== null && nextHop !== toRoomName;

    // ROADMAP 0064 live follow-up: a validated _realRoute gets the SAME
    // blocklist-only freedom computeRealRoute() itself used to validate it
    // (avoidCostCallback - see its own comment above for the full "raw
    // PathFinder.search from the console" diagnosis) - routeCostCallback's
    // narrower allowlist is reserved for the findRoute()-only fallback,
    // which was never checked against real terrain and still benefits from
    // being kept roughly on the room-graph path findRoute() chose.
    const costCallback = usingRealRoute && singleHop
        ? hopCostCallback(creep.room.name, nextHop, routeOpts)
        : usingRealRoute
            ? avoidCostCallback(avoid, routeOpts)
        : routeCostCallback(route, creep.room.name, toRoomName, routeOpts);

    // ROADMAP 0064 same-day, the actual root cause (found via a live trace
    // across 3 separate legs - W0N47/W0N48/W0N50): native
    // moveTo()'s OWN internal multi-room search is measurably less capable
    // than computeRealRoute()'s raw PathFinder.search() under IDENTICAL
    // constraints (same avoid, same costs, same generous maxOps/maxRooms).
    // Confirmed live: computeRealRoute found a real, cheap (803-29770 ops)
    // route requiring an initial move AWAY from the goal before doubling
    // back (a detour, forced once enough rooms sit in _routeAvoid) every
    // time - and native moveTo(), given the exact same room-level answers,
    // still gave up early, sometimes without even exploring the room the
    // correct detour starts in (W0N49 - immediately adjacent, unblocked,
    // never queried at all).
    // Two independent multi-room searches that can silently disagree is
    // exactly the "2 filtros" the user suspected - not our costCallback
    // logic (proven correct every time), but running a SECOND, less
    // reliable search on top of the first at all. Fix: once
    // computeRealRoute has already decided the room sequence, never ask
    // native moveTo() to re-solve the WHOLE multi-room trip again - only
    // ever hand it the NEXT single hop as its target. Room geometry makes
    // this safe without a smaller range: two adjacent rooms' centers are
    // always >= 25 tiles apart in world coordinates, so satisfying
    // `range` (<=20 in every realRoute caller today) against a neighboring
    // room's center requires having actually crossed into it - capped at
    // 20 defensively regardless of what a future caller passes, so a
    // larger opts.range can never let the engine call the hop "reached"
    // while the creep is still in the room behind it.
    const moveTarget = singleHop ? nextHop : toRoomName;
    const moveRange = 0;
    const targetPos = hopEntryPosition(creep.room.name, moveTarget);
    traceScoutMove(creep, "route-before", targetPos);
    const status = creep.moveTo(targetPos, {
        range: moveRange,
        reusePath: moveOpts.reusePath,
        maxOps: moveOpts.maxOps,
        maxRooms: moveOpts.maxRooms,
        plainCost: costs.plainCost,
        swampCost: costs.swampCost,
        costCallback,
    });
    if (status === OK && !requestCrossRoomClearance(creep) && forceCachedStep) {
        followCachedStep(creep);
    }
    traceScoutMove(creep, "route-after", targetPos, status);

    if (status !== ERR_NO_PATH) {
        creep.memory._routeNoPathTicks = 0;
        return status;
    }

    creep.memory._routeNoPathTicks = (creep.memory._routeNoPathTicks || 0) + 1;
    if (creep.memory._routeNoPathTicks >= config.get("routing.noPathTicks", 2)) {
        retreatFrom(creep);
        if (creep.memory._routeRetreatTo) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory._routeRetreatTo), moveOpts);
        }
    }

    // The engine won't let a creep rest on an exit tile without a fresh
    // move queued that tick (confirmed live, ROADMAP 0060). moveTo() above
    // already provides that intent whenever it finds any path at all: this
    // is only a fallback for the (now rare) case where the updated avoid
    // list still leaves no path whatsoever and the creep is sitting right
    // on a border - nudge it off directly instead of leaving it to get
    // shoved back involuntarily.
    if (isOnBorder(creep)) nudgeAwayFromBorder(creep);

    return status;
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
        const dangerousRooms = free.map((s) => s.room).filter(isDangerousRoom);
        console.log(
            dangerousRooms.length
                ? `[routeCheck] dangerous room(s) on the direct route: ${dangerousRooms.join(", ")} ` +
                      `(hostile creep seen - Memory.rooms[x].enemies, stale if not revisited since - ` +
                      `or foreign-owned outright - Memory.rooms[x].owner)`
                : "[routeCheck] no dangerous room on the direct route itself - " +
                      "the block must come from an alternate the engine tried and rejected"
        );
    }
};

module.exports = {
    isHighwayRoom,
    bodyTravelCosts,
    findRoute,
    routeCostCallback,
    avoidCostCallback,
    computeRealRoute,
    moveToRoom,
    // exposed for smoke.js - otherwise only reachable indirectly through
    // moveToRoom() - and isStuck/isOnBorder/nudgeAwayFromBorder are also
    // reused directly by roles/scout.js's own free-roam exploration flap
    // guard
    isBouncing,
    isStuck,
    isOnBorder,
    nudgeAwayFromBorder,
    // ROADMAP 0076 - exposed for smoke.js; markDeadEnd is also reachable
    // indirectly through retreatFrom()/moveToRoom()
    isKnownDeadEnd,
    markDeadEnd,
};
