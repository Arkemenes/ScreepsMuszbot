// Dynamic fuel policy regressions, called by the smoke harness.
module.exports = function (project, assert) {
    const path = require("path");
    const fuel = require(path.join(project, "src/utils/terminalFuel"));
    const census = require(path.join(project, "src/utils/census"));
    const saved = { settings: Memory.settings, ops: Memory.terminalOps, swing: Memory.swing,
        rooms: Game.rooms, creeps: Game.creeps, time: Game.time, market: Game.market };
    const store = (energy) => ({ energy, getCapacity: () => 300000,
        getFreeCapacity: () => 300000 - energy });
    const room = { name: "FuelRoom", controller: { my: true }, storage: { store: store(50000) },
        terminal: { id: "fuel-terminal", store: store(30000) } };
    const op = (id, cost, extra) => Object.assign({ id, sourceRoom: room.name, kind: "sell",
        resourceType: "O", state: "queued", remaining: 1000,
        createdTick: Number(id), fuelQuote: { tick: Game.time, cost } }, extra);
    try {
        Game.time = 12345; Game.rooms = { FuelRoom: room }; Game.creeps = {};
        Memory.settings = { terminalFuel: { enabled: true } };
        Memory.terminalOps = { operations: {} }; Memory.swing = { observations: {} };
        census.build();
        assert(fuel.reserve(room) === 0 && fuel.releasable(room) === 30000,
            "0124 fuel: idle terminal has no fixed energy reserve");
        Memory.terminalOps.operations = { a: op("1", 1500), b: op("2", 2500), c: op("3", 7000) };
        assert(fuel.plan(room).reserve === 4800 && fuel.plan(room).transactions === 2,
            "0124 fuel: next two freight costs plus 20 percent margin");
        Memory.terminalOps.operations.a.feeLoadedAmount = 1500;
        assert(fuel.plan(room).reserve === 4800 && fuel.unfunded(room) === 3300,
            "0124 fuel: staged fee counted once");
        Memory.terminalOps.operations.c.state = "listed";
        Memory.terminalOps.operations.b.fuelQuote.tick -= 301;
        assert(fuel.plan(room).forecast === 1500,
            "0124 fuel: listed orders and stale quotes do not forecast freight");
        Memory.terminalOps.operations.a.state = "completed";
        Memory.swing.observations.old = { room: room.name, reason: "eligible", kind: "sell",
            resourceType: "O", tick: Game.time, cost: 9000, opId: "1" };
        assert(fuel.plan(room).forecast === 0,
            "0124 fuel: completed candidate never revives its freight forecast");
        Game.market = { calcTransactionCost: () => 200 };
        Memory.terminalOps.operations = { transfer: op("4", 0, { kind: "transfer",
            resourceType: "energy", targetRoom: "Other", remaining: 1000, amount: 1000, loadedAmount: 1200 }) };
        assert(fuel.plan(room).cargo === 1000 && fuel.plan(room).funded === 200 &&
            fuel.keep(room) === 1240 && fuel.unfunded(room) === 40,
            "0124 fuel: outgoing energy cargo and staged freight protected separately");

        Memory.terminalOps.operations.transfer.sentAmount = 1000;
        Memory.terminalOps.operations.transfer.sentTick = Game.time;
        assert(fuel.keep(room) === 1200, "0124 fuel: accepted transfer intent remains protected until engine applies it");
        Game.time++;
        assert(fuel.keep(room) === 0, "0124 fuel: sent transfer releases source fuel after engine tick");
        Memory.terminalOps.operations.transfer.sentAmount = 0;
        Memory.terminalOps.operations.transfer.remaining = 1000;
        Memory.terminalOps.operations.transfer.fuelQuote.tick = Game.time;
        room.terminal.store = store(1300);
        assert(fuel.releasable(room) === 0, "0124 fuel: hysteresis suppresses small reverse trips");
        room.storage.store = store(1000);
        assert(fuel.plan(room).margin === 0 && !fuel.optionalAllowed(room, 500),
            "0124 fuel: scarcity removes preventive margin and delays expensive optional freight");
        Memory.terminalOps.operations = { sale: op("1", 1000, { policy: "swing" }),
            buy: op("9", 100, { kind: "buy", resourceType: "energy" }) };
        assert(fuel.plan(room).forecast === 100,
            "0124 fuel: energy replenishment remains eligible during scarcity");
        room.storage.store = store(50000); room.terminal.store = store(30000);
        Memory.terminalOps.operations = { sale: op("1", 1000), later: op("2", 2000),
            buy: op("9", 300, { kind: "buy", resourceType: "energy" }) };
        assert(fuel.plan(room).forecast === 1300,
            "0124 fuel: replenishment takes priority in forecast window");
        Game.creeps = { carrier: { name: "carrier", room, memory: { role: "hauler",
            home: room.name, mineralJob: { toId: room.terminal.id, resourceType: "energy", amount: 500 } },
            store: Object.assign(store(200), { getFreeCapacity: () => 300 }) } };
        census.build();
        assert(fuel.transit(room, true) === 200, "0124 fuel: loaded hauler counted as incoming fuel");
        Memory.settings.terminalFuel.enabled = false;
        assert(fuel.reserve(room) === 30000, "0124 fuel: explicit legacy mode preserves fixed reserve");
    } finally {
        Memory.settings = saved.settings; Memory.terminalOps = saved.ops; Memory.swing = saved.swing;
        Game.rooms = saved.rooms; Game.creeps = saved.creeps; Game.time = saved.time; Game.market = saved.market;
        census.build();
    }
};
