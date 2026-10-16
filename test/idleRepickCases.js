// ROADMAP 0152: the builder idle rule and the hauler's kept delivery pick.
module.exports = function (project, assert) {
    const path = require("path");
    const saved = { game: global.Game, memory: global.Memory };
    try {
        let now = 120000;
        const objects = {};
        const at = (time) => {
            now = time;
            global.Game = Object.assign({}, saved.game, { time, creeps: { Idle1: { memory: {}, store: { getUsedCapacity: () => 0 } }, Carrier: { memory: {}, name: "Carrier", store: { getUsedCapacity: () => 200 } } },
                getObjectById: (id) => objects[id] || null });
        };
        global.Memory = { settings: {}, rooms: {} };
        at(now);

        // --- builder: empty + no pile -> look again only every 5 ticks
        const builder = require(path.join(project, "src/roles/builder"));
        const room = { name: "BuildRoom" };
        const creep = { name: "Idle1", room };
        assert(builder.idleSkip(creep) === false, "0152: a builder that never searched in vain always searches");
        builder.markIdle(creep);
        const pattern = [];
        for (let i = 1; i <= 6; i++) { at(120000 + i); pattern.push(builder.idleSkip(creep)); }
        assert(JSON.stringify(pattern) === JSON.stringify([true, true, true, true, false, false]),
            "0152: an empty builder with no pile skips 4 ticks, then searches (" + JSON.stringify(pattern) + ")");
        at(120001);
        assert(builder.idleSkip({ name: "Idle1", room: { name: "Other" } }) === false, "0152: a builder that changed room searches at once");
        at(119990);
        assert(builder.idleSkip(creep) === false, "0152: a rewound clock (reset) forgets the builder's idle mark");
        at(120002);
        global.Memory = { settings: { builder: { idleRecheckTicks: 1 } }, rooms: {} };
        assert(builder.idleSkip(creep) === false, "0152: builder.idleRecheckTicks = 1 restores the per-tick search");
        global.Memory = { settings: {}, rooms: {} };

        // --- hauler: the kept delivery pick and what outranks it
        const hauler = require(path.join(project, "src/roles/hauler"));
        const spawn = () => ({ id: "sp1", structureType: STRUCTURE_SPAWN, my: true, pos: new RoomPosition(10, 10, "DelRoom"),
            store: { getFreeCapacity: () => free.spawn, getUsedCapacity: () => 300 - free.spawn, energy: 300 - free.spawn } });
        const free = { spawn: 50, storage: 1000000 };
        let storageEnergy = 500000, towerEnergy = 1000;
        const storage = () => ({ id: "st1", structureType: STRUCTURE_STORAGE, my: true, pos: new RoomPosition(20, 20, "DelRoom"),
            store: { getFreeCapacity: () => free.storage, getUsedCapacity: () => storageEnergy, energy: storageEnergy, getCapacity: () => 1000000 } });
        const tower = () => ({ id: "tw1", structureType: STRUCTURE_TOWER, my: true, room: { name: "DelRoom" }, pos: new RoomPosition(30, 30, "DelRoom"),
            store: { getFreeCapacity: () => 1000 - towerEnergy, getUsedCapacity: () => towerEnergy, energy: towerEnergy, getCapacity: () => 1000 } });
        const world = (time) => {
            at(time);
            const list = [spawn(), storage(), tower()];
            list.forEach((o) => { objects[o.id] = o; });
            return { name: "DelRoom", controller: { my: true, level: 6 }, storage: objects.st1, find: () => list };
        };
        const carrier = (r) => ({ name: "Carrier", room: r, memory: {}, pos: new RoomPosition(5, 5, "DelRoom"),
            store: { getUsedCapacity: () => 200, getFreeCapacity: () => 0 } });
        const entry = (id, rank, tick) => ({ id, rank, tick, room: "DelRoom" });

        let r = world(121000);
        assert(hauler.deliverPickValid(carrier(r), entry("sp1", 0, 121000)) === true,
            "0152: a delivery pick to a still-hungry spawn is kept");
        free.spawn = 0; r = world(121001);
        assert(hauler.deliverPickValid(carrier(r), entry("sp1", 0, 121000)) === false,
            "0152: ...and dropped once that spawn is full");
        free.spawn = 50; r = world(121001);
        assert(hauler.deliverPickValid(carrier(r), entry("st1", 4, 121000)) === false,
            "0152: a pick to storage is dropped as soon as a spawn/extension is hungry (higher priority)");
        free.spawn = 0; towerEnergy = 100; r = world(121002);
        assert(hauler.deliverPickValid(carrier(r), entry("st1", 4, 121000)) === false,
            "0152: critical towers are checked before a storage pick is kept");
        towerEnergy = 1000; r = world(121003); // a new tick: the per-tick room cache must not keep the critical tower
        const tiers = require(path.join(project, "src/utils/resourceTiers"));
        assert(hauler.deliverPickValid(carrier(r), entry("st1", 4, 121000)) === true,
            "0152: with nothing hungry or critical a storage pick above the reserve is kept (full " + hauler.spawnsAndExtensionsFull(r) +
            ", aboveReserve " + tiers.aboveReserve(r) + ", available " + require(path.join(project, "src/utils/reservations")).availableDeliver(carrier(r), objects.st1) + ")");
        assert(hauler.deliverPickValid(carrier(r), entry("st1", 4, 120996)) === false, "0152: a kept pick expires after 5 ticks");
        assert(hauler.deliverPickValid(carrier(r), entry("st1", 3, 121000)) === false && hauler.deliverPickValid(carrier(r), entry("st1", 5, 121000)) === false,
            "0152: optional-consumer and last-resort picks are never kept (their rules are per tick)");
        assert(hauler.deliverPickValid(carrier(r), { id: "st1", rank: 4, tick: 121000, room: "ElsewhereRoom" }) === false,
            "0152: a pick made in another room is not kept");
        free.storage = 0; r = world(121004);
        assert(hauler.deliverPickValid(carrier(r), entry("st1", 4, 121000)) === false, "0152: a full target is not kept");
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
