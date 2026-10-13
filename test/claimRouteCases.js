// Validated room traces must keep their actual, reachable crossing tiles.
module.exports = function (project, assert) {
    const path = require("path");
    const routing = require(path.join(project, "src/utils/routing"));
    const saved = { game: Game, memory: Memory, search: PathFinder.search };
    try {
        global.Memory = { settings: {}, rooms: {} };
        global.Game = Object.assign({}, saved.game, {
            time: 195000000,
            rooms: {},
            cpu: Object.assign({}, saved.game.cpu, { bucket: 10000 }),
            map: Object.assign({}, saved.game.map, {
                getRoomTerrain: () => ({ get: () => 0 }),
                getRoomLinearDistance: (a, b) => a === b ? 0 : 1,
            }),
        });
        let searches = 0, target, options, goal;
        PathFinder.search = (origin, searchGoal) => {
            goal = searchGoal;
            searches++;
            return {
                incomplete: false,
                path: [
                    new RoomPosition(49, 10, "E3N41"),
                    new RoomPosition(0, 10, "E4N41"),
                    new RoomPosition(1, 10, "E4N41"),
                    new RoomPosition(49, 40, "E4N41"),
                    new RoomPosition(0, 40, "E5N41"),
                    new RoomPosition(5, 40, "E5N41"),
                ],
            };
        };
        const creep = {
            name: "claimer-reachable-crossing",
            pos: new RoomPosition(40, 10, "E3N41"),
            room: { name: "E3N41" },
            memory: { role: "reserver", mission: "claim" },
            fatigue: 0,
            move: () => OK,
            moveTo: (pos, opts) => {
                target = pos;
                options = opts;
                // The middle exit at y=25 is in a separate pocket. The
                // complete search proved y=10 reachable from this origin.
                return pos.roomName === "E4N41" && pos.y !== 10 ? ERR_NO_PATH : OK;
            },
        };
        for (let i = 0; i < 4; i++) {
            Game.time++;
            routing.moveToRoom(creep, "E5N41", { realRoute: true, blockHostiles: true });
        }
        assert(target.roomName === "E4N41" && target.x === 0 && target.y === 10,
            "claimer follows the reachable crossing from its validated path, not an arbitrary middle exit");
        assert(!creep.memory._routeAvoid && !Memory.rooms.E3N41,
            "a disconnected arbitrary exit cannot falsely blacklist the claimer origin");
        assert(searches === 1,
            "claimer reuses one terrain search while following a reachable crossing");
        assert(goal.pos.roomName === "E5N41" && goal.pos.x === 25 &&
            goal.pos.y === 25 && goal.range === 24,
            "claimer terrain planning can reach any entrance instead of demanding an arbitrary destination exit");
        assert(options.maxRooms === 2 && options.maxOps <= 20000,
            "validated claimer hops bound native search to two rooms and a small ops budget");
        creep.room = { name: "E4N41" };
        creep.pos = new RoomPosition(1, 10, "E4N41");
        Game.time++;
        routing.moveToRoom(creep, "E5N41", { realRoute: true, blockHostiles: true });
        assert(target.roomName === "E5N41" && target.x === 0 && target.y === 40,
            "claimer advances to the next validated crossing instead of returning to the previous room");

        const cold = Object.assign({}, creep, { memory: {}, room: { name: "E3N41" },
            pos: new RoomPosition(40, 10, "E3N41") });
        Game.cpu.bucket = 0;
        let moves = 0;
        cold.moveTo = () => { moves++; return OK; };
        const before = searches;
        assert(routing.moveToRoom(cold, "E5N41", { realRoute: true }) === ERR_BUSY,
            "claimer defers new terrain planning while the CPU bucket is empty");
        assert(searches === before && moves === 0 && !cold.memory._routeStackDest,
            "empty-bucket deferral emits no search or movement and leaves planning retryable");
        Game.cpu.bucket = 10000;
        routing.moveToRoom(cold, "E5N41", { realRoute: true });
        assert(searches === before + 1,
            "claimer retries deferred terrain planning after the bucket recovers");
        cold.memory = JSON.parse(JSON.stringify(cold.memory));
        routing.moveToRoom(cold, "E5N41", { realRoute: true });
        routing.moveToRoom(cold, "E5N41", { realRoute: true });
        assert(searches === before + 1,
            "claimer restores deserialized crossing waypoints from same-tick validation without a duplicate search");
        assert(!JSON.stringify(cold.memory).includes('"x":'),
            "claimer crossing coordinates stay out of serialized Memory");
        const native = Object.assign({}, cold, { memory: {} });
        native.moveTo = creep.moveTo;
        routing.moveToRoom(native, "E5N41", { nativeRoute: true });
        assert(target.roomName === "E4N41" && target.y === 10 && options.range === 0,
            "native claimer travel also follows the exact validated crossing");

        Game.cpu.bucket = 0;
        routing.moveToRoom(native, "E5N41", { nativeRoute: true });
        assert(options.maxRooms === 2 && options.maxOps <= 20000,
            "a claimer with validated waypoints can continue bounded travel while its bucket recovers");
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
        PathFinder.search = saved.search;
    }
};
