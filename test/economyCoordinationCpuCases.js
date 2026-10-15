module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils", name));
    const saved = { game: Game, memory: Memory, status: global.craftStatus };
    const stock = load("resourcePolicy"), claims = load("terminalClaims"), index = load("terminalIndex");
    const slots = load("labSlots"), research = require("../docs/lab-search/recipes.cjs");
    try {
        global.Memory = { settings: { craft: { log: false, test: true, tickInterval: 10, scanInterval: 300 } }, craft: { active: {} }, rooms: {}, terminalOps: { nextId: 465, operations: {} } };
        global.Game = { ...saved.game, time: 199300000, creeps: {}, rooms: {}, market: { orders: {} } };
        const room = { name: "CpuScale", find: () => [], storage: { id: "cpu-storage", store: { O: 10000 } }, terminal: { id: "cpu-terminal", store: {} } };
        Game.rooms[room.name] = room;
        for (let i = 0; i < 464; i++) Memory.terminalOps.operations["scale-" + i] = {
            id: "scale-" + i, kind: "sell", resourceType: "O", sourceRoom: room.name,
            owner: { kind: "manual", id: "scale-" + i }, state: i < 27 ? "queued" : "completed", remaining: 1
        };
        let scans = 0;
        Memory.terminalOps.operations = new Proxy(Memory.terminalOps.operations, {
            ownKeys(object) { scans++; return Reflect.ownKeys(object); }
        });
        for (let i = 0; i < 100; i++) {
            assert(stock.consumerAvailable(room, room.storage, "O") === 9973 && stock.commitments(room).O === 27,
                "ARK-128: repeated queries preserve all 27 live claims among 464 operations");
        }
        assert(scans === 1, "ARK-128: 200 reservation queries enumerate history once in the tick");
        const op = Memory.terminalOps.operations["scale-0"];
        op.remaining = 10;
        assert(stock.consumerAvailable(room, room.storage, "O") === 9964,
            "ARK-128: index never caches mutable reserved quantities");
        op.pendingDeal = { quantity: 10, cost: 5 };
        assert(claims.physicalFree(room, room.terminal, "energy") === 0,
            "ARK-128: empty sources retain their safe fast path");
        room.terminal.store.energy = 20;
        assert(claims.physicalFree(room, room.terminal, "energy", op.id, op.owner) === 15,
            "ARK-128: accepted freight intent remains protected against its owner");
        op.state = "completed";
        assert(stock.commitments(room).O === 26 && index.all().length === 26 && scans === 1,
            "ARK-128: completing an operation immediately releases only its claim");
        delete Memory.terminalOps.operations["scale-1"];
        assert(index.all().length === 25, "ARK-128: deletions are observed through current dictionary values");
        Memory.terminalOps.operations.new = { ...op, id: "new", state: "queued", pendingDeal: null, remaining: 2 };
        Memory.terminalOps.nextId++;
        assert(stock.commitments(room).O === 27 && scans === 2,
            "ARK-128: create revision invalidates membership inside the tick");
        Game.time++;
        stock.commitments(room);
        assert(scans === 3, "ARK-128: membership refreshes at the next tick");
        Memory.terminalOps.operations = {};
        assert(index.all().length === 0, "ARK-128: replacing Memory cannot retain another operation set");
        Memory.terminalOps.operations = { restored: { ...op, state: "waiting", id: "restored" } };
        Game.time--;
        assert(index.all()[0].id === "restored", "ARK-128: reset or backward tick rebuilds membership");

        slots.resetCache();
        const before = { ...slots.perf };
        const lh = slots.planPhases(research.tree("XLH2O"), [1, 2, 3, 4, 5, 6]);
        const nodes = slots.perf.nodes - before.nodes;
        const searches = slots.perf.searches;
        const kh = slots.planPhases(research.tree("XKH2O"), [1, 2, 3, 4, 5, 6]);
        assert(lh.ok && lh.moves === 3 && nodes < 5000,
            "ARK-128: cold six-lab search keeps the minimum move cost with bounded repeated work");
        assert(slots.perf.searches === searches && kh.ok && kh.phases.at(-1).product === "XKH2O" &&
            kh.phases.every((p) => ![p.product, ...p.ops.map((o) => o.item)].some((r) => r && ["L", "LH", "LH2O", "XLH2O"].includes(r))),
            "ARK-128: equal recipe topology shares geometry while rebinding every chemistry label");
        const gh = slots.planPhases(research.tree("XGH2O"), [1, 2, 3]);
        assert(gh.ok && gh.moves === 20 && gh.phases.every((p) => p.inputs.every((s) => slots.reaches(p.out, s, p.inputs.find((v) => v !== s)))),
            "ARK-128: memoized failures do not discard a valid parked branch");

        const chain = load("craftChain"), ledger = load("craftLedger"), market = load("market");
        const lot = { id: "ledger-cpu", room: room.name, buys: { O: { opId: "cpu-buy" } }, tradeIds: ["cpu-buy"] };
        ledger.ensure(lot, {});
        const purchase = { id: "cpu-buy", kind: "buy", resourceType: "O", dealtAmount: 10,
            accounting: { credits: -100, energy: 2, amount: 10, confidence: "confirmed" }, energyFairPrice: 3 };
        Memory.terminalOps.operations = { "cpu-buy": purchase };
        ledger.sync(lot);
        const financial = lot.economics.operations["cpu-buy"];
        let writes = 0;
        for (const key of ["balances", "costs", "costSeen", "buys", "sales"]) lot.inventory[key] = new Proxy(lot.inventory[key], {
            set(object, name, value) { writes++; object[name] = value; return true; }
        });
        for (let i = 0; i < 100; i++) ledger.sync(lot);
        assert(writes === 0 && lot.economics.operations["cpu-buy"] === financial,
            "ARK-128: unchanged ledger queries perform no financial writes or snapshot replacements");
        purchase.marketFees = 5; purchase.energyFairPrice = 4;
        ledger.sync(lot);
        assert(lot.inventory.costs.O === 113 && lot.inventory.balances.O === 10,
            "ARK-128: same-tick fee and fair-price changes update basis without adding inventory");
        purchase.dealtAmount = 15; purchase.accounting.amount = 15; purchase.accounting.credits = -150;
        ledger.sync(lot);
        assert(lot.inventory.costs.O === 163 && lot.inventory.balances.O === 15,
            "ARK-128: same-tick partial fill updates quantity and basis immediately");
        const restored = JSON.parse(JSON.stringify(lot));
        ledger.sync(restored);
        assert(restored.inventory.costs.O === 163 && restored.inventory.balances.O === 15,
            "ARK-128: restored ledger does not replay existing purchases");
        purchase.feeHistoryEstimated = true; ledger.sync(lot);
        assert(lot.economics.operations["cpu-buy"].confidence === "incomplete",
            "ARK-128: unchanged quantities still propagate accounting confidence immediately");
        const delivery = { id: "cpu-transfer", kind: "transfer", targetRoom: room.name, resourceType: "energy",
            receivedAmount: 20, sentAmount: 20, transactionCost: 3, recoveryUnitPrice: 2,
            accounting: { credits: 0, energy: 3, amount: 20, confidence: "confirmed" } };
        Memory.terminalOps.operations[delivery.id] = delivery; lot.tradeIds.push(delivery.id);
        ledger.sync(lot); writes = 0;
        const transferFinancial = lot.economics.operations[delivery.id];
        ledger.sync(lot);
        assert(writes === 0 && lot.economics.operations[delivery.id] === transferFinancial && lot.ownCost === 40,
            "ARK-128: repeated transfer synchronization keeps freight and received basis without writes");
        delivery.receivedAmount = 30; ledger.sync(lot);
        assert(lot.inventory.balances.energy === 30 && lot.inventory.costs.energy === 60 && lot.ownCost === 60,
            "ARK-128: same-tick transfer receipt adds only its new quantity and basis");
        const sale = { id: "cpu-sale", kind: "sell", resourceType: "O", dealtAmount: 5,
            accounting: { credits: 100, energy: 1, amount: 5, confidence: "confirmed" } };
        Memory.terminalOps.operations[sale.id] = sale; lot.tradeIds.push(sale.id);
        ledger.sync(lot); writes = 0;
        const soldBasis = lot.inventory.soldBasis;
        ledger.sync(lot);
        assert(writes === 0 && lot.inventory.soldBasis === soldBasis && lot.inventory.balances.O === 10,
            "ARK-128: repeated sale reads do not rewrite balances or subtract sold basis twice");
        const previous = { chainTick: chain.tick, ledgerTick: ledger.tick, snapshot: market.snapshot, ready: market.historyReady };
        const plannerPath = path.join(project, "src/utils/craftPlanner.js"), cached = require.cache[plannerPath];
        try {
            const calls = []; let ready = false;
            chain.tick = (options) => calls.push(options);
            ledger.tick = () => {};
            market.snapshot = () => ({ tick: Game.time, resources: {} });
            market.historyReady = () => ready;
            Game.rooms = {}; Game.time = 199400000;
            Memory.terminalOps.operations = {};
            Memory.craft = { active: { policy: { room: "Policy", state: "working", queue: [{ policy: true }] } } };
            delete require.cache[plannerPath];
            const planner = require(plannerPath);
            for (let i = 0; i <= 10; i++) { Game.time = 199400000 + i; planner.tick(); }
            assert(calls.length === 11 && calls.filter((c) => c.maintenance).length === 2 &&
                calls.filter((c) => c.policyOnly).length === 9,
                "ARK-128: per-tick lab execution does not promote all-chain maintenance to every tick (" + JSON.stringify(calls) + ")");
            const provisional = Memory.craft.lastScanTick;
            ready = true; Game.time++; planner.tick();
            assert(Memory.craft.lastScanTick === Game.time && Game.time - provisional < 300,
                "ARK-128: hydration completion immediately rechecks warming rooms before scan cadence");
            const hydrated = Memory.craft.lastScanTick;
            Game.time++; planner.tick();
            assert(Memory.craft.lastScanTick === hydrated,
                "ARK-128: hydrated history does not force repeated scans on subsequent ticks");
        } finally {
            chain.tick = previous.chainTick; ledger.tick = previous.ledgerTick;
            market.snapshot = previous.snapshot; market.historyReady = previous.ready;
            if (cached) require.cache[plannerPath] = cached; else delete require.cache[plannerPath];
        }
        const realRelease = ledger.releaseRecovered, realSettle = ledger.settle;
        try {
            let maintenance = 0, advanced = 0;
            ledger.releaseRecovered = () => maintenance++;
            ledger.settle = () => advanced++;
            Game.rooms = { [room.name]: room }; room.controller = { my: true };
            Memory.craft = { active: { conventional: { room: room.name, state: "buying", queue: [] } } };
            for (let i = 0; i < 9; i++) chain.tick({ policyOnly: true, maintenance: false });
            assert(maintenance === 0 && advanced === 0,
                "ARK-128: policy-only execution skips conventional chains and recovered-stock sweeps");
            Memory.craft.active = {};
            chain.tick({ maintenance: true });
            assert(maintenance === 1, "ARK-128: normal maintenance still reconciles every eligible room");
        } finally { ledger.releaseRecovered = realRelease; ledger.settle = realSettle; }
    } finally {
        global.Game = saved.game; global.Memory = saved.memory; global.craftStatus = saved.status;
        slots.resetCache();
    }
};
