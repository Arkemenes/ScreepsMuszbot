// ROADMAP 0146: orphan/derived fields leave Memory.rooms, readers answer the same.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src", n);
    const fresh = (n) => { delete require.cache[require.resolve(src(n))]; return require(src(n)); };
    const { compareImplementations } = require(path.join(project, "test/equivalence/compare.js"));
    const saved = { game: global.Game, memory: global.Memory };
    try {
        global.Game = Object.assign({}, saved.game, { time: 100000,
            map: Object.assign({}, saved.game.map, { describeExits: (n) => (n === "Void" ? null : { 1: n + "N", 3: n + "E" }) }) });
        const legacy = () => ({
            Visited: { lastVisit: 5, exits: { 1: "VisitedN" }, walkMatrix: [[1]], terrainMatrix: [[2]], builds: {},
                enemies: 0, enemyStructures: 0, numberOfTowers: 0, hasInvaderCore: false, hasController: true, sourceNumber: 2, mineral: null },
            Hostile: { lastVisit: 9, exits: { 3: "HostileE" }, enemies: 2, enemyStructures: 1, numberOfTowers: 1, hasInvaderCore: true },
            Odd: { exits: { 1: "OddN" } }, // exits but never seen by getIntel: kept
            Stub: {},
        });

        // --- AC1: orphan matrices removed, second run no-op
        global.Memory = { rooms: legacy() };
        const cleanup = fresh("utils/memoryCleanup");
        const first = cleanup.run();
        const rooms = Memory.rooms;
        assert(first > 0 && rooms.Visited.walkMatrix === undefined && rooms.Visited.terrainMatrix === undefined &&
            !/walkMatrix|terrainMatrix/.test(JSON.stringify(Memory)),
            "0146: orphan matrices removed, second run no-op");
        const snapshot = JSON.stringify(Memory);
        cleanup.reset();
        assert(cleanup.run() === 0 && JSON.stringify(Memory) === snapshot, "0146: cleanup is idempotent");

        // --- AC3: exits field gone where the room was seen, kept where it was not
        assert(rooms.Visited.exits === undefined && rooms.Hostile.exits === undefined,
            "0146: exits field gone from Memory after cleanup");
        assert(!!rooms.Odd.exits && rooms.Stub && Object.keys(rooms.Stub).length === 0,
            "0146: a room never seen by getIntel keeps its exits, stubs stay");

        // --- AC2: known() answers what the old field answered, cold and warm
        const before = legacy();
        const mapExits = fresh("utils/mapExits");
        const old = (name) => (before[name] && before[name].exits) || undefined;
        const readers = compareImplementations(
            (w) => w.rooms.map((n) => old(n)),
            (w) => w.rooms.map((n) => { const a = mapExits.known(n); return a && JSON.parse(JSON.stringify(a)); }),
            [{ rooms: ["Odd", "Stub", "Nowhere"] }]
        );
        assert(readers.equal, "0146: exits readers match the old field for unseen rooms");
        const visited = mapExits.known("Visited"), again = mapExits.known("Visited");
        assert(visited && visited["1"] === "VisitedN" && visited === again && mapExits.known("Stub") === undefined &&
            mapExits.known("Nowhere") === undefined,
            "0146: exits readers match describeExits cold and warm");

        // --- AC4: omitted defaults change nothing for the readers
        const raiding = require(src("rooms/raiding")), squad = require(src("utils/squad"));
        global.Memory = { rooms: legacy(), settings: { targetEnemies: ["Foe"] } };
        const worlds = [{ name: "Visited" }, { name: "Hostile" }, { name: "Stub" }];
        const read = (rooms) => (w) => {
            global.Memory = { rooms: JSON.parse(JSON.stringify(rooms)), settings: { targetEnemies: ["Foe"] } };
            Memory.rooms[w.name].owner = "Foe"; Memory.rooms[w.name].controllerLevel = 1; Memory.rooms[w.name].lastVisit = 5;
            return { weak: raiding.isWeakEnemyRoom(w.name), refusal: raiding.contestRefusalReason(w.name),
                done: squad.missionComplete({ room: w.name, mission: "combat" }), siege: squad.missionComplete({ room: w.name, mission: "siege" }) };
        };
        const normalised = legacy();
        global.Memory = { rooms: normalised }; cleanup.reset(); cleanup.run();
        const omitted = compareImplementations(read(legacy()), read(normalised), worlds);
        assert(omitted.equal, "0146: intel default omission is behaviour-neutral");

        // --- intel itself no longer writes the defaults, exits or builds
        const getIntel = require(src("rooms/intel"));
        const room = Object.values(saved.game.rooms || {}).find((r) => r && r.controller && r.controller.my);
        if (room) {
            global.Memory = Object.assign({}, saved.memory, { rooms: {} });
            global.Game = Object.assign({}, global.Game, { rooms: saved.game.rooms });
            getIntel(room);
            const mem = Memory.rooms[room.name];
            assert(mem.exits === undefined && mem.builds === undefined && mem.lastVisit !== undefined &&
                !/"enemies":0|"enemyStructures":0|"hasInvaderCore":false/.test(JSON.stringify(mem)),
                "0146: intel stores neither exits, builds nor zero/false defaults");
            assert(Object.keys(Memory.rooms).length > 1, "0146: first visit still creates the neighbours' records");
        }

        // --- a setting left by the removed abTest tool is put back once
        {
            const fresh2 = () => fresh("utils/memoryCleanup");
            global.Memory = { rooms: { A: { lastVisit: 1 } }, settings: { builder: { idleRecheckTicks: 1 } },
                abTest: { path: "builder.idleRecheckTicks", original: null, hadOriginal: false } };
            fresh2().run();
            assert(Memory.settings.builder.idleRecheckTicks === undefined && Memory.abTest === undefined,
                "0145: a leftover abTest phase value is removed so the default applies again");
            global.Memory = { rooms: { A: { lastVisit: 1 } }, settings: { hauler: { idleRecheckTicks: 1 } },
                abTest: { path: "hauler.idleRecheckTicks", original: 3, hadOriginal: true } };
            fresh2().run();
            assert(Memory.settings.hauler.idleRecheckTicks === 3 && Memory.abTest === undefined,
                "0145: a leftover abTest restores the original value when there was one");
        }

        // --- the retired migrations are really gone
        const fs = require("fs");
        assert(!/migrateFromMemory/.test(fs.readFileSync(src("utils/planStore.js"), "utf8")),
            "0146: removed migrations are gone");
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
