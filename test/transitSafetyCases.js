// ROADMAP 0129: observed ally attacks and safe multi-room transit.
module.exports = function (project, assert) {
    const path = require("path");
    const safety = require(path.join(project, "src/utils/transitSafety"));
    const routing = require(path.join(project, "src/utils/routing"));
    const census = require(path.join(project, "src/utils/census"));
    const hostiles = require(path.join(project, "src/utils/hostiles"));
    const saved = { game: Game, memory: Memory, event: global.EVENT_ATTACK };
    let events = [], reads = 0, moves = 0, callback;
    const room = { name: "E2N44", controller: { owner: { username: "TransitAlly" } },
        find: () => [], getEventLog: () => { reads++; return events; } };
    const victim = { id: "transit-victim", my: true, body: [{ type: MOVE }],
        room, memory: { role: "scout" } };
    const tower = { id: "transit-tower", owner: { username: "TransitAlly" }, structureType: STRUCTURE_TOWER };
    let objects = { [victim.id]: victim, [tower.id]: tower };
    const attack = (targetId, damage, actor) => ({ event: EVENT_ATTACK,
        objectId: actor || tower.id, data: { targetId, damage } });
    const next = () => { Game.time++; census.build(); };
    try {
        global.EVENT_ATTACK = 1;
        global.Game = Object.assign({}, saved.game, { time: 190000000, creeps: { victim },
            rooms: { [room.name]: room }, getObjectById: (id) => objects[id] || null,
            map: Object.assign({}, saved.game.map) });
        global.Memory = { settings: { allies: ["TransitAlly", "SafeAlly"],
            routing: { allyAttackAvoidTicks: 5 } }, rooms: {
            E2N44: { owner: "TransitAlly" }, E3N44: { reservation: { username: "TransitAlly" } },
            E1N45: { my: true }, E4N44: { owner: "SafeAlly" }, E5N41: {} } };
        safety.reset(); census.build();
        assert(!safety.isBlockedRoom(room.name), "0129: allies start passable without hardcoded transit bans");
        safety.observeRoom(room); safety.observeRoom(room);
        assert(reads === 1, "0129: events are read only once per room per tick");
        const quiet = { name: "E1N45", controller: { my: true, owner: { username: "me" } }, find: () => [], getEventLog: () => { reads++; return []; } };
        Game.rooms[quiet.name] = quiet; safety.observeRoom(quiet);
        assert(reads === 1, "ARK-116: an own room with no foreign creep does not parse its event log");
        delete Game.rooms[quiet.name];
        events = [attack(victim.id, 100)]; next(); safety.observeRoom(room);
        assert(safety.isBlockedRoom(room.name) && safety.isBlockedRoom("E3N44"), "0129: allied tower damage blocks owned and reserved territory");
        assert(hostiles.isAlly("TransitAlly") && !safety.isBlockedRoom("E4N44") && !safety.isBlockedRoom("E1N45"), "0129: learned transit bans preserve diplomacy and safe allies");
        assert(Memory.routingAggressors.TransitAlly.room === room.name && typeof Memory.routingAggressors.TransitAlly.tick === "number", "0129: incident memory contains compact evidence");
        const first = Memory.routingAggressors.TransitAlly.tick;
        next(); safety.observeRoom(room);
        assert(Memory.routingAggressors.TransitAlly.tick > first, "0129: new damage renews the incident window");
        global.allowPlayer("TransitAlly");
        assert(!safety.isBlockedRoom(room.name), "0129: allowPlayer clears learned evidence immediately");
        Memory.routingAggressors = {};
        safety.isBlockedRoom(room.name); // warm the same-tick cache with an empty record map
        Memory.routingAggressors = { TransitAlly: { room: room.name, tick: Game.time - 1 } };
        assert(safety.isBlockedRoom(room.name), "0186: learned-player cache refreshes when incident memory is replaced in the same tick");
        Memory.routingAggressors = {};
        assert(!safety.isBlockedRoom(room.name), "0186: learned-player cache refreshes when incident memory is cleared in the same tick");
        events = [attack(victim.id, 0), attack("foreign-victim", 100), attack(victim.id, 100, "unknown"),
            { event: 999, objectId: tower.id, data: { targetId: victim.id, damage: 100 } }];
        next(); safety.observeRoom(room);
        assert(!safety.isBlockedRoom(room.name), "0129: zero damage foreign victims unknown actors and nonattack events do not ban allies");
        const alliedCreep = { id: "transit-attacker", owner: { username: "TransitAlly" }, body: [{ type: ATTACK }] };
        objects[alliedCreep.id] = alliedCreep;
        delete objects[victim.id]; Game.creeps = {}; events = [attack(victim.id, 200, alliedCreep.id)];
        next(); safety.observeRoom(room);
        assert(safety.isBlockedRoom(room.name), "0129: allied creep lethal damage recognizes a victim seen on the previous tick");
        global.allowPlayer("TransitAlly"); next(); safety.observeRoom(room);
        assert(!safety.isBlockedRoom(room.name), "0129: stale victim snapshots cannot attribute a later death");
        Game.creeps = { victim }; objects[victim.id] = victim;
        Memory.settings.routing.learnAllyAttacks = false;
        next(); safety.observeRoom(room);
        assert(!safety.isBlockedRoom(room.name), "0129: learning can be disabled without changing allies");
        Memory.settings.routing.learnAllyAttacks = true;
        next(); safety.observeRoom(room);
        const bannedAt = Game.time; events = [];
        Game.time += 5; census.build(); safety.observeRoom(room);
        assert(!safety.isBlockedRoom(room.name) && !Memory.routingAggressors.TransitAlly, "0129: learned evidence expires at the configured deadline");
        assert(Game.time === bannedAt + 5, "0129: expiration permits ordinary retry without spawning a probe");
        Memory.routingAggressors = { TransitAlly: { room: room.name, tick: Game.time } };
        const activePolicy = safety.policyKey();
        Game.time += 5;
        assert(safety.policyKey() !== activePolicy && !safety.isBlockedRoom(room.name),
            "0129: automatic incident expiry changes the route policy key");
        global.avoidPlayer("TransitAlly"); Game.time += 10;
        assert(safety.isBlockedRoom(room.name), "0129: explicit manual bans survive learned expiration");
        assert(global.routeAvoidStatus().manual.includes("TransitAlly"), "0129: routeAvoidStatus reports manual bans");

        const matrix = new PathFinder.CostMatrix();
        Game.map.findRoute = (from, to, opts) => {
            callback = opts.routeCallback;
            return callback(to) === Infinity ? ERR_NO_PATH : [{ room: to }];
        };
        routing.findRoute("E1N45", "E5N41");
        assert(callback(room.name) === Infinity && callback("E4N44") < Infinity, "0129: room graph excludes unsafe allies without blockHostiles");
        assert(routing.findRoute("E1N45", room.name) === null, "0129: a banned destination is refused before destination exceptions");
        const allowed = routing.routeCostCallback([{ room: room.name }], "E1N45", "E5N41", {});
        // Mirror engine _findPath2: non-CostMatrix returns (including false)
        // are ignored. Verify the effective matrix, not just callback output.
        const engineMatrix = (cb, rn) => {
            const base = new PathFinder.CostMatrix();
            const result = cb(rn, base);
            return result instanceof PathFinder.CostMatrix ? result : base;
        };
        const fullyBlocked = (cm) => {
            if (!(cm instanceof PathFinder.CostMatrix)) return false;
            for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) if (cm.get(x, y) !== 255) return false;
            }
            return true;
        };
        assert(fullyBlocked(engineMatrix(allowed, room.name)),
            "0129 regression: engine moveTo must see every unsafe-room tile blocked");
        assert(fullyBlocked(allowed(room.name, matrix)), "0129: native route callback rejects banned cached hops and slack");
        const avoid = routing.avoidCostCallback([], {});
        assert(fullyBlocked(engineMatrix(avoid, room.name)), "0129: real route fallback callback also blocks unsafe allies");
        const escape = routing.routeCostCallback([], room.name, "E5N41", {});
        assert(!fullyBlocked(engineMatrix(escape, room.name)), "0129: the current room remains usable to escape a ban");
        const oldSearch = PathFinder.search;
        try {
            PathFinder.search = (from, goal, opts) => {
                assert(opts.roomCallback(room.name) === false, "0129: terrain validation rejects unsafe ally territory");
                return { incomplete: true, path: [] };
            };
            routing.computeRealRoute(new RoomPosition(25, 25, "E1N45"), "E5N41", {});
        } finally { PathFinder.search = oldSearch; }
        const traveler = { name: "TransitTest", memory: { role: "scout" }, room: { name: "E1N45" },
            pos: new RoomPosition(25, 25, "E1N45"), body: [{ type: MOVE, hits: 100 }], fatigue: 0,
            moveTo: (pos, opts) => { moves++; callback = opts.costCallback; return OK; } };
        for (const role of ["scout", "reserver"]) {
            for (const nativeRoute of [false, true]) {
                traveler.memory = { role, mission: role === "reserver" ? "claim" : undefined };
                routing.moveToRoom(traveler, "E5N41", { nativeRoute, realRoute: false });
                assert(fullyBlocked(engineMatrix(callback, room.name)),
                    "0129 regression: " + role + " movement blocks unsafe territory in nativeRoute=" + nativeRoute);
            }
        }
        moves = 0;
        traveler.memory = { role: "scout" };
        assert(routing.moveToRoom(traveler, room.name, { nativeRoute: true }) === ERR_NO_PATH && moves === 0, "0129: native mode cannot fall back directly into a banned target");
        traveler.memory._move = { path: "unsafe-cache" };
        traveler.memory._realRoute = [room.name, "E5N41"];
        traveler.memory._realRouteDest = "E5N41";
        traveler.memory._realRouteFrom = "E1N45";
        routing.moveToRoom(traveler, "E5N41", { realRoute: false });
        assert(!traveler.memory._move && !traveler.memory._realRoute && fullyBlocked(engineMatrix(callback, room.name)), "0129: existing native paths and validated routes are invalidated by a transit ban");
        traveler.memory._routeRetreatTo = room.name;
        traveler.memory._routeStackDest = "E5N41";
        const beforeRetreat = moves;
        assert(routing.moveToRoom(traveler, "E5N41", { realRoute: false }) === ERR_NO_PATH &&
            moves === beforeRetreat && !traveler.memory._routeRetreatTo,
            "0129: a stored retreat cannot reenter banned territory");
        traveler.room = room; traveler.pos = new RoomPosition(25, 25, room.name);
        routing.moveToRoom(traveler, "E5N41", { realRoute: false });
        assert(!fullyBlocked(engineMatrix(callback, room.name)),
            "0129: a traveler already inside banned territory can route out");
        traveler.room = { name: "E1N45" }; traveler.pos = new RoomPosition(25, 25, "E1N45");
        const routeFinder = Game.map.findRoute;
        Game.map.findRoute = () => ERR_NO_PATH;
        const beforeNoRoute = moves;
        assert(routing.moveToRoom(traveler, "E5N41", { nativeRoute: true, realRoute: false }) === ERR_NO_PATH &&
            moves === beforeNoRoute, "0129: native mode with no safe route issues no direct fallback intent");
        Game.map.findRoute = routeFinder;
        const key = traveler.memory._routeTransitKey;
        global.allowPlayer("TransitAlly");
        routing.moveToRoom(traveler, "E5N41", { realRoute: false });
        assert(key !== traveler.memory._routeTransitKey, "0129: releasing a player invalidates the routing policy cache");
        global.avoidPlayer("TransitAlly");
        room.controller.owner.username = "SafeAlly"; next(); safety.observeRoom(room);
        assert(!safety.isBlockedRoom(room.name), "0129: visible ownership changes override stale territory intel");
        safety.reset(); Game.creeps = {}; objects = { [tower.id]: tower }; events = [attack(victim.id, 100)];
        room.controller.owner.username = "TransitAlly"; global.allowPlayer("TransitAlly");
        next(); safety.observeRoom(room);
        assert(!safety.isBlockedRoom(room.name), "0129: reset with no victim evidence does not guess who died");
        const blindRoom = { name: "E6N41", find: () => [] };
        next(); safety.observeRoom(blindRoom);
        assert(!safety.isBlockedRoom(room.name), "0129: absent event APIs do not infer an attack from disappearance");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory; global.EVENT_ATTACK = saved.event;
        safety.reset(); census.build();
    }
};
