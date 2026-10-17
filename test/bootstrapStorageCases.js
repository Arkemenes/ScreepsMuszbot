// ROADMAP 0158: real planner/hauler paths with engine-style deferred intents.
module.exports = function (project, assert) {
    const path = require("path");
    const load = (name) => require(path.join(project, "src", name));
    const saved = { game: global.Game, memory: global.Memory, sites: global.__sites };
    const warehouse = load("utils/bootstrapStorage");
    const plans = load("utils/planStore");
    const architect = load("rooms/architect");
    const hauler = load("roles/hauler");
    const needs = load("rooms/needs");
    const name = "W15N58";
    let objects = {}, structures = [], sites = [], pending = [], destroys = 0;
    let destroyStatus = OK;
    const finds = {};
    const store = (values, cap) => {
        const s = Object.assign({}, values);
        const used = () => Object.keys(s).reduce((sum, r) => sum + s[r], 0);
        Object.defineProperties(s, {
            getUsedCapacity: { value: (r) => r ? s[r] || 0 : used() },
            getFreeCapacity: { value: () => Math.max(0, cap - used()) },
            getCapacity: { value: () => cap },
        });
        return s;
    };
    const make = (id, type, x, y, values, cap) => {
        const s = { id, structureType: type, pos: new RoomPosition(x, y, name), store: store(values, cap) };
        objects[id] = s;
        return s;
    };
    const tick = () => {
        const intents = pending; pending = [];
        intents.forEach((f) => f());
        Game.time++;
        // Like the engine, each tick starts from the physical storage.
        room.storage = objects.real;
        warehouse.prepareRoom(room);
    };
    const carrier = (id) => {
        const creep = { name: id, id, room, memory: { role: "hauler", job: "load" },
            store: store({ energy: 0 }, 100), ticksToLive: 1000, pos: new RoomPosition(20, 20, name),
            moveTo: () => OK, say() {},
            withdraw(from, r, q) {
                pending.push(() => { from.store[r] -= q; this.store[r] = (this.store[r] || 0) + q; });
                return OK;
            },
            transfer(to, r, q) {
                q = q === undefined ? this.store[r] : q;
                pending.push(() => { this.store[r] -= q; to.store[r] = (to.store[r] || 0) + q; });
                return OK;
            },
        };
        Game.creeps[id] = creep;
        return creep;
    };
    const room = { name, controller: { my: true, level: 1, pos: new RoomPosition(45, 45, name) },
        energyAvailable: 300, energyCapacityAvailable: 300, visual: new RoomVisual(),
        find(type) {
            const key = Game.time + ":" + type;
            finds[key] = (finds[key] || 0) + 1;
            if (type === FIND_STRUCTURES) return structures;
            if (type === FIND_MY_STRUCTURES) return structures.filter((s) => s.my);
            if (type === FIND_MY_CONSTRUCTION_SITES) return sites;
            return [];
        },
    };
    try {
        global.Memory = { settings: { planner: { visualizeEnabled: false }, needs: { cacheTicks: 1 } },
            rooms: { [name]: { planned: true } }, creeps: {} };
        global.Game = Object.assign({}, saved.game, { time: 1580000, rooms: { [name]: room }, myRooms: [room],
            creeps: {}, powerCreeps: {}, structures: {}, getObjectById: (id) => objects[id] || null });
        plans.setPlan(name, { buildings: [
            { x: 20, y: 20, structureType: STRUCTURE_TERMINAL, minimalRCL: 6 },
            { x: 21, y: 20, structureType: STRUCTURE_STORAGE, minimalRCL: 4 },
        ] });
        for (const rcl of [1, 2, 3]) {
            room.controller.level = rcl; Game.time++; global.__sites = [];
            architect(room);
            assert(__sites.length === 1 && __sites[0].join(":") === "20:20:container",
                "0158: early room queues terminal-tile container at RCL " + rcl);
        }
        assert(plans.getPlan(name).buildings.length === 2, "0158: temporary site never mutates the persisted plan");
        sites = [{ structureType: STRUCTURE_CONTAINER, pos: new RoomPosition(20, 20, name),
            remove() { pending.push(() => { sites = []; }); return OK; } }];
        tick(); global.__sites = []; architect(room);
        assert(__sites.length === 0, "0158: existing temporary site is not duplicated");
        room.controller.level = 4; tick(); global.__sites = []; architect(room);
        assert(__sites.some((s) => s.join(":") === "21:20:storage") && !__sites.some((s) => s[2] === STRUCTURE_CONTAINER),
            "0158: RCL4 builds real storage and keeps buffer construction disabled on RCL change");
        tick(); assert(sites.length === 0, "0158: RCL4 cancels an unfinished temporary site");
        room.controller.level = 3;
        const buffer = make("buffer", STRUCTURE_CONTAINER, 20, 20, { energy: 400, U: 13 }, 2000);
        buffer.destroy = () => {
            assert(buffer.store.getUsedCapacity() === 0 && Object.values(Game.creeps).every((c) => c.store.getUsedCapacity() === 0),
                "0158: destroy never runs with stock or migration cargo in transit");
            destroys++;
            if (destroyStatus === OK) pending.push(() => { delete objects.buffer; structures = structures.filter((s) => s !== buffer); });
            return destroyStatus;
        };
        structures = [buffer]; tick();
        assert(room.storage === buffer && Memory.rooms[name].bootstrapStorageId === buffer.id,
            "0158: buffer is canonical storage and Memory holds only its id");
        assert(load("utils/resourceTiers").reserveFloor(room) === 20 && load("utils/resourcePolicy").stock(room, RESOURCE_ENERGY) === 400,
            "0158: reserves and resource policy use the real container capacity and stock");
        assert(load("utils/energy").energyPiles(room).filter((s) => s.id === buffer.id).length === 1,
            "0158: builder energy pool contains the canonical buffer exactly once");
        const worker = carrier("Drain1"); Game.time++;
        const spawn = make("spawn", STRUCTURE_SPAWN, 19, 20, { energy: 0 }, 300);
        spawn.my = true; structures.push(spawn); room.energyAvailable = 0;
        const energyPick = hauler.pickLoad(worker);
        assert(energyPick && energyPick.id === buffer.id, "0158: ordinary hauler loads from the canonical buffer");
        structures = [buffer]; room.energyAvailable = 300;
        // At 150 pickable energy a new builder is not viable; double counting
        // the alias would cross the room's >200 threshold.
        buffer.store.energy = 150; sites = [{ structureType: STRUCTURE_EXTENSION, pos: new RoomPosition(15, 15, name), progress: 0, progressTotal: 3000 }];
        Game.time++; needs.invalidate(name);
        const firstDemand = needs.roomNeeds(room);
        assert(firstDemand.hauler >= 1, "0158: canonical buffer enables central hauling demand");
        assert(firstDemand.builder === 0, "0158: builder demand does not double-count container energy");
        const firstStock = load("utils/resourcePolicy").stock(room, RESOURCE_ENERGY);
        assert(firstStock === 150, "0158: warehouse stock is not counted twice");
        buffer.store.energy = 400; sites = [];
        room.controller.level = 4; tick();
        assert(room.storage === buffer && destroys === 0, "0158: RCL4 keeps buffer until physical storage is ready");
        // Persisted ID recovers the alias even while its plan segment is unavailable.
        const getPlan = plans.getPlan;
        plans.getPlan = () => null;
        delete require.cache[require.resolve(path.join(project, "src/utils/bootstrapStorage"))];
        const afterReset = load("utils/bootstrapStorage");
        room.storage = undefined; afterReset.prepareRoom(room);
        assert(room.storage === buffer, "0158: reset recovers buffer by id without an available plan");
        plans.getPlan = getPlan;
        const real = make("real", STRUCTURE_STORAGE, 21, 20, { energy: 0 }, 1000000);
        real.my = true; structures.push(real); tick();
        assert(room.storage === real && destroys === 0, "0158: completed real storage becomes canonical without deleting stock");
        assert(!hauler.deliverPickValid(worker, { room: name, id: buffer.id, rank: 2, tick: Game.time }),
            "0158: cached energy deliveries to the retired buffer are invalidated");
        // Persisted state-machine deposits and old non-energy jobs can still
        // point at the former warehouse after the canonical reference switches.
        worker.store.energy = 7; worker.popState = () => {};
        Creep.prototype.runDeposit.call(worker, buffer.id);
        tick();
        assert(real.store.energy === 7 && buffer.store.energy === 400,
            "0158: queued state-machine deposits redirect to real storage");
        Memory.settings.stockPolicy = { enabled: false };
        worker.store.U = 3;
        worker.memory.mineralJob = { kind: "mineralContainer", resourceType: "U", fromId: "old-source", toId: buffer.id };
        hauler.runMineralJobNow(worker); tick();
        assert(real.store.U === 3 && buffer.store.U === 13,
            "0158: old mineral deliveries redirect even with stockPolicy disabled");
        delete worker.memory.mineralJob;
        real.store.energy = 0; real.store.U = 0;
        real.store.energy = 1;
        assert(!warehouse.runHauler(worker, () => true) && !worker.memory.bootstrapDrain,
            "0158: urgent consumers postpone new migration trips");
        real.store.energy = 0;
        // Exercise the actual role: pickup is an intent, not immediate stock movement.
        spawn.store.energy = 0; structures.push(spawn); room.energyAvailable = 0; Game.time++;
        hauler.run(worker);
        assert(worker.memory.bootstrapDrain && buffer.store.energy === 400 && worker.store.energy === 0,
            "0158: hungry room bootstraps empty real storage from buffer energy without deadlock");
        structures = [buffer, real]; room.energyAvailable = 300;
        const other = carrier("Drain2");
        warehouse.runHauler(other, () => false);
        assert(load("utils/terminalClaims").withdrawn(buffer, RESOURCE_ENERGY) === 200,
            "0158: concurrent migration pickups share the withdrawal ledger");
        tick();
        // A full destination preserves both current cargo and the source.
        real.store.energy = 1000000;
        warehouse.runHauler(worker, () => false);
        assert(worker.store.energy === 100 && pending.length === 0 && destroys === 0,
            "0158: full destination keeps cargo and container intact");
        real.store.energy = 0;
        warehouse.runHauler(worker, () => true);
        assert(worker.store.energy === 100, "0158: accepted transfer does not count as delivered cargo yet");
        warehouse.runHauler(other, () => true); tick();
        // Drain everything, including below ordinary minimum load sizes.
        for (let i = 0; i < 30 && (buffer.store.getUsedCapacity() > 0 || worker.store.getUsedCapacity() > 0 || other.store.getUsedCapacity() > 0); i++) {
            warehouse.runHauler(worker, () => false);
            warehouse.runHauler(other, () => false);
            tick();
        }
        assert(real.store.energy === 400 && real.store.U === 13 && buffer.store.getUsedCapacity() === 0,
            "0158: migration delivers every resource to real storage");
        assert(destroys === 1, "0158: removal waits for confirmed cargo delivery");
        assert(Memory.rooms[name].bootstrapStorageId === buffer.id,
            "0158: retiring id remains recognizable during the destroy intent tick");
        tick();
        assert(!objects.buffer && !Memory.rooms[name].bootstrapStorageId, "0158: confirmed removal clears the persisted buffer id");
        // Destruction errors retain the ID and are retried, without resources.
        objects.buffer = buffer; structures.push(buffer); Memory.rooms[name].bootstrapStorageId = buffer.id;
        destroyStatus = ERR_BUSY;
        worker.memory.bootstrapDrain = { fromId: buffer.id, toId: real.id, resourceType: RESOURCE_ENERGY, loaded: true };
        worker.store.energy = 1; worker.room = { name: "W15N57" };
        const beforeExcursion = destroys;
        tick();
        assert(destroys === beforeExcursion, "0158: migration cargo outside the source room still prevents removal");
        worker.store.energy = 0; worker.room = room; delete worker.memory.bootstrapDrain;
        tick();
        const failedAttempts = destroys;
        tick();
        assert(destroys === failedAttempts + 1 && Memory.rooms[name].bootstrapStorageId === buffer.id,
            "0158: failed destroy is retried without losing migration identity");
        destroyStatus = OK; tick(); tick();
        room.controller.level = 3; delete objects.real; room.storage = undefined; objects.buffer = buffer;
        structures = [buffer]; tick();
        assert(room.storage === buffer, "0158: downgrade can reuse a surviving early warehouse");
        delete objects.buffer; structures = []; tick();
        assert(!room.storage && !Memory.rooms[name].bootstrapStorageId,
            "0158: destroyed buffer never leaves a stale canonical reference");
        room.controller.my = false; objects.buffer = buffer; room.storage = undefined;
        warehouse.prepareRoom(room);
        assert(!room.storage, "0158: foreign rooms never adopt or destroy a buffer");
        assert(Object.values(finds).every((count) => count <= 1), "0158: room.find budget remains one per type per tick");
        assert(!JSON.stringify(Memory).includes('"store"'), "0158: migration Memory never serializes game objects");
    } finally {
        plans.dropPlan(name);
        global.Game = saved.game; global.Memory = saved.memory; global.__sites = saved.sites;
    }
};
