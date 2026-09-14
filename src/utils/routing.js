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

// Room-level route to `toRoomName`: opts.avoid (array of room names, ROADMAP
// 0062 - see moveToRoom() below) is excluded outright; highway rooms are
// cheapened so the search prefers them; a dangerous room (isDangerousRoom
// above) is heavily penalized, or - with opts.blockHostiles - excluded
// outright too. Returns null when Game.map.findRoute finds nothing under
// those constraints.
function findRoute(fromRoomName, toRoomName, opts) {
    opts = opts || {};
    const avoid = opts.avoid || [];
    const hostilePenalty = config.get("routing.hostilePenalty", 10);
    const nonHighwayPenalty = config.get("routing.nonHighwayPenalty", 2);
    const route = Game.map.findRoute(fromRoomName, toRoomName, {
        routeCallback: (roomName) => {
            if (avoid.indexOf(roomName) !== -1) return Infinity;
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
    const allowed = new Set([currentRoomName, toRoomName]);
    if (route) {
        for (const step of route) {
            allowed.add(step.room);
            const exits = Memory.rooms[step.room] && Memory.rooms[step.room].exits;
            if (!exits) continue;
            for (const neighbor of Object.values(exits)) {
                if (avoid.indexOf(neighbor) !== -1) continue;
                if (opts.blockHostiles && isDangerousRoom(neighbor)) continue;
                allowed.add(neighbor);
            }
        }
    }
    const fn = (roomName, matrix) => (allowed.has(roomName) ? matrix : false);
    // Debug-only surface (ROADMAP 0064 live follow-up) - lets moveToRoom()
    // log exactly how many rooms this tick's search was allowed to touch,
    // to directly confirm/rule out the engine's own maxRooms ceiling as a
    // cause, instead of inferring it from route length alone.
    fn.allowedRooms = allowed;
    return fn;
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
    return (roomName, matrix) => {
        if (avoid.indexOf(roomName) !== -1) return false;
        if (opts.blockHostiles && isDangerousRoom(roomName)) return false;
        return matrix;
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
    const range = opts.range === undefined ? 20 : opts.range;
    const result = PathFinder.search(
        fromPos,
        { pos: new RoomPosition(25, 25, toRoomName), range },
        {
            plainCost: 1,
            swampCost: 5,
            maxRooms: config.get("routing.realRouteMaxRooms", 64),
            maxOps: config.get("routing.realRouteMaxOps", 200000),
            roomCallback: (roomName) => {
                if (avoid.indexOf(roomName) !== -1) return false;
                if (opts.blockHostiles && isDangerousRoom(roomName)) return false;
            },
        }
    );
    // ROADMAP 0064 same-day, third root cause: the only way to actually
    // CONFIRM (not guess) whether moveMaxOps is sized correctly relative to
    // this search - the two became mechanically equivalent once
    // avoidCostCallback replaced routeCostCallback's narrow allowlist for
    // native moveTo() execution - is to see how many ops THIS search
    // actually spent. Always-on, not gated: this only ever runs once per
    // leg (opt-in, trip start + each completed retreat), so the volume is
    // inherently tiny, same reasoning as tryComputeRealRoute's own log.
    console.log(
        `[routing] computeRealRoute ${fromPos.roomName}->${toRoomName}: ` +
            (result ? `ops=${result.ops} incomplete=${result.incomplete}` : "search returned nothing")
    );
    if (!result || result.incomplete || !result.path.length) return null;

    const rooms = [];
    for (const pos of result.path) {
        if (pos.roomName === fromPos.roomName) continue;
        if (rooms[rooms.length - 1] !== pos.roomName) rooms.push(pos.roomName);
    }
    return rooms.length ? rooms : null;
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

function retreatFrom(creep) {
    delete creep.memory._move; // stale native path cache - force a fresh search
    creep.memory._routeNoPathTicks = 0; // fresh streak once we're back on known-good ground
    // Deliberately permanent, not leftover debug cruft - do not strip on a
    // cleanup pass. ROADMAP.md's "Later" section (computeRealRoute/
    // routeCostCallback incorporating known structure) is still open and
    // unconfirmed either way; this call is rare (opt-in realRoute callers
    // only reach it reactively) so the log volume is never a concern, and
    // it's the only ground truth the next session investigating this will
    // have without re-deriving everything from scratch.
    console.log(
        `[routing] retreatFrom ${creep.name}: ${creep.room.name} confirmed a dead end ` +
            `(_routeStack was [${(creep.memory._routeStack || []).join(",")}])`
    );
    // ROADMAP 0064 same-day - diagnostic ONLY, no behavior change: the
    // maxOps ceiling was just RULED OUT by live evidence (computeRealRoute
    // succeeded at 803 and 29770 ops, both comfortably under even the old
    // 20000 ceiling, right where native moveTo() still failed) - so
    // whatever's actually blocking native moveTo() here but not
    // computeRealRoute()'s own PathFinder.search must be something
    // computeRealRoute() structurally never looks at: real, currently-
    // visible obstacles. Unlike computeRealRoute() (deliberately
    // terrain-only, roomCallback never touches the matrix), native
    // moveTo()'s own internal search bakes in whatever structures the
    // engine can currently see in THIS room (creep.room always has vision
    // of its own room) - some structure types (invader core, keeper lair,
    // power bank, spawn, etc.) always block regardless of any option;
    // player ramparts/walls block too unless ignoreDestructibleStructures
    // is explicitly set (never has been, here). Dumping exactly what's
    // physically in this room at the moment of the confirmed failure turns
    // that from a guess into a fact for the very next live test.
    if (typeof creep.room.find === "function") {
        console.log(
            `[routing] retreatFrom ${creep.name}: ${creep.room.name} structures=[` +
                roomCache.structures(creep.room).map((s) => `${s.structureType}@${s.pos.x},${s.pos.y}`).join(",") +
                `] creeps=${creep.room.find(FIND_CREEPS).length}`
        );
    }

    // ROADMAP 0064: a cached real-route (opts.realRoute) that still led
    // to this dead end was wrong about something (new construction, most
    // likely) - discard it rather than try to patch a validated sequence
    // mid-trip. findRoute()/the ordinary reactive backtrack above takes
    // over for the rest of the trip.
    delete creep.memory._realRoute;
    delete creep.memory._realRouteDest;
    delete creep.memory._realRouteFrom;

    const avoid = creep.memory._routeAvoid || (creep.memory._routeAvoid = []);
    if (avoid.indexOf(creep.room.name) === -1) avoid.push(creep.room.name);

    const prev = popStackAndRetreat(creep);
    // no previous room recorded - this IS the trip's own origin, nowhere
    // to retreat to. Leaves the dead end on `avoid` (harmless: findRoute()
    // never reads an avoid entry for the room it starts from anyway) and
    // falls back to the same fail-soft "no route" outcome as before.
    console.log(
        `[routing] retreatFrom ${creep.name}: _routeAvoid=[${avoid.join(",")}], ` +
            (prev ? `retreating to ${prev}` : "no earlier room to retreat to (this was the trip's own origin)")
    );
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

    const prev = popStackAndRetreat(creep);
    console.log(
        `[routing] retreatWithoutBlame ${creep.name}: no complete route found from ` +
            `${creep.room.name} avoiding [${(creep.memory._routeAvoid || []).join(",")}] - ` +
            "this room was never actually attempted, so it's NOT added to _routeAvoid - " +
            (prev ? `retreating to ${prev}` : "no earlier room to retreat to either")
    );
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
// site), and undefined when opts.realRoute isn't set at all (nothing to
// report either way).
function tryComputeRealRoute(creep, toRoomName, opts) {
    if (!opts.realRoute) return;
    const avoid = creep.memory._routeAvoid || [];
    const real = computeRealRoute(creep.pos, toRoomName, Object.assign({}, opts, { avoid }));
    // Always-on (not gated behind a debug flag): this only ever runs for an
    // opt-in caller (today, only claim missions) on a leg boundary - start
    // of trip, or a retreat completing - never per-tick, so the log volume
    // is inherently tiny. Diagnosing this exact mechanism live has needed
    // it three times already (ROADMAP 0064's own history).
    console.log(
        `[routing] tryComputeRealRoute ${creep.name} ${creep.room.name}->${toRoomName} ` +
            `avoid=[${avoid.join(",")}]: ` +
            (real ? `found ${real.length} hop(s): ${real.join(" -> ")}` : "NONE (incomplete/empty search)")
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
// story - see opts.realRoute below (ROADMAP 0064) and tryComputeRealRoute()
// above, opt-in only, bounded by the number of dead ends actually found.
function moveToRoom(creep, toRoomName, opts) {
    opts = opts || {};
    const range = opts.range === undefined ? 20 : opts.range;
    const moveOpts = {
        range: 20,
        reusePath: opts.reusePath === undefined ? 20 : opts.reusePath,
    };

    // ROADMAP 0064 live follow-up: the engine's own defaults (maxOps 2000,
    // maxRooms 16) can be too small once routeCostCallback's "allowed" set
    // spans several rooms with real natural-wall clutter (maxOps) or the
    // validated route itself simply runs longer than 16 rooms (maxRooms,
    // a hard cap on rooms EXPLORED regardless of ops left) - confirmed
    // live, a route computeRealRoute (200000 ops, 64 rooms) had JUST
    // validated as genuinely walkable still came back ERR_NO_PATH from
    // this exact same native moveTo() call, immediately triggering
    // another (wrong) retreat. Scoped to opts.realRoute callers only
    // (today, just the claimer's "claim" mission) rather than every
    // moveToRoom() call - scout/pioneer/raider/squad have never shown
    // this symptom, and a bigger ceiling isn't free CPU-wise for a search
    // that would otherwise have failed cheap and fast for a genuine reason
    // (constitution §1 - measure before widening a budget everyone pays
    // for, not just the one caller with evidence it's needed).
    if (opts.realRoute) {
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

        // ROADMAP 0064: opt-in real-terrain validation of this leg of the
        // trip - see tryComputeRealRoute()/computeRealRoute() above. A
        // caller that can't afford to discover a dead end by walking into
        // it (the claimer: CREEP_CLAIM_LIFE_TIME is a fixed budget) passes
        // this; everyone else keeps relying on findRoute() + the reactive
        // backtrack.
        tryComputeRealRoute(creep, toRoomName, opts);
    }

    // The destination ITSELF already proved unreachable from here - refuse
    // outright rather than walking up to its border and trying the
    // identical crossing every few ticks forever (routeCostCallback always
    // allows `toRoomName` - you have to be able to reach your actual
    // destination - so without this check nothing else here would ever
    // stop that retry loop once the trap IS the destination).
    if ((creep.memory._routeAvoid || []).indexOf(toRoomName) !== -1) return ERR_NO_PATH;

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

    const routeOpts = Object.assign({}, opts, { avoid });

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

    // ROADMAP 0064 live follow-up: a validated _realRoute gets the SAME
    // blocklist-only freedom computeRealRoute() itself used to validate it
    // (avoidCostCallback - see its own comment above for the full "raw
    // PathFinder.search from the console" diagnosis) - routeCostCallback's
    // narrower allowlist is reserved for the findRoute()-only fallback,
    // which was never checked against real terrain and still benefits from
    // being kept roughly on the room-graph path findRoute() chose.
    const baseCostCallback = usingRealRoute
        ? avoidCostCallback(avoid, routeOpts)
        : routeCostCallback(route, creep.room.name, toRoomName, routeOpts);
    // ROADMAP 0064 same-day, diagnostic ONLY - no decision here changes,
    // only records what baseCostCallback already decided. Live evidence so
    // far has ruled out every guess tried (maxOps - computeRealRoute
    // succeeded at 136-29770 ops where native moveTo() still failed;
    // structures/vision - E0N46 confirmed genuinely empty, zero structures,
    // and native moveTo() still failed there too). The one thing left
    // unobserved is what ROOMS native moveTo()'s own internal search
    // actually asks this callback about, and what it's told for each - the
    // only way to see that is to record it as it happens, since moveTo()
    // never exposes its own search internals otherwise. `queriedRooms`
    // only ever gets logged below on a tick that actually fails.
    const queriedRooms = [];
    const costCallback = (roomName, matrix) => {
        const result = baseCostCallback(roomName, matrix);
        queriedRooms.push(`${roomName}:${result === false ? "BLOCKED" : "open"}`);
        return result;
    };
    costCallback.allowedRooms = baseCostCallback.allowedRooms;

    // ROADMAP 0064 same-day, the actual root cause (found via queriedRooms
    // above, live, across 3 separate legs - W0N47/W0N48/W0N50): native
    // moveTo()'s OWN internal multi-room search is measurably less capable
    // than computeRealRoute()'s raw PathFinder.search() under IDENTICAL
    // constraints (same avoid, same costs, same generous maxOps/maxRooms).
    // Confirmed live: computeRealRoute found a real, cheap (803-29770 ops)
    // route requiring an initial move AWAY from the goal before doubling
    // back (a detour, forced once enough rooms sit in _routeAvoid) every
    // time - and native moveTo(), given the exact same room-level answers
    // (queriedRooms showed it asking about and correctly being told open/
    // blocked for exactly the right rooms), still gave up early, sometimes
    // without even exploring the room the correct detour starts in
    // (W0N49 - immediately adjacent, unblocked, never queried at all).
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
    const nextHop = usingRealRoute && route.length ? route[0].room : null;
    const singleHop = nextHop !== null && nextHop !== toRoomName;
    const moveTarget = singleHop ? nextHop : toRoomName;
    const moveRange = singleHop ? Math.min(range, 20) : range;
    const status = creep.moveTo(new RoomPosition(25, 25, moveTarget), {
        range: moveRange,
        reusePath: moveOpts.reusePath,
        maxOps: moveOpts.maxOps,
        maxRooms: moveOpts.maxRooms,
        costCallback,
    });

    if (status !== ERR_NO_PATH) {
        creep.memory._routeNoPathTicks = 0;
        return status;
    }

    creep.memory._routeNoPathTicks = (creep.memory._routeNoPathTicks || 0) + 1;
    // Logged on EVERY failing tick, not just once retreat is confirmed
    // (ROADMAP 0064 live follow-up, at the user's request - "pode colocar
    // bastante log, só não quero que fique infinitamente nisso"): shows the
    // exact allowed-room COUNT this tick's search had to work with when
    // routeCostCallback's allowlist was in play (fell to findRoute() -
    // never set on avoidCostCallback's blocklist, which has no fixed list
    // to report - "N/A (blocklist)" there is itself the useful signal that
    // this leg was trusting a validated route instead of guessing).
    console.log(
        `[routing] ${creep.name} ERR_NO_PATH in ${creep.room.name} (tick ${creep.memory._routeNoPathTicks}/` +
            `${config.get("routing.noPathTicks", 2)}) - moveTarget=${moveTarget} (range ${moveRange}), ` +
            `route=[${route ? route.map((s) => s.room).join(",") : "null"}], ` +
            (costCallback.allowedRooms
                ? `allowedRooms(${costCallback.allowedRooms.size})=[${Array.from(costCallback.allowedRooms).join(",")}], `
                : "allowedRooms=N/A (blocklist), ") +
            `avoid=[${avoid.join(",")}], usingRealRoute=${usingRealRoute}, ` +
            `queriedRooms=[${queriedRooms.join(",") || "NONE - native moveTo() never called costCallback at all"}]`
    );
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
};
