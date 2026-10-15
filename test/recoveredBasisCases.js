module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils/" + name));
    const ledger = load("craftLedger"), chain = load("craftChain"), market = load("market"), pricing = load("marketPricing");
    const saved = { rooms: Game.rooms, creeps: Game.creeps, market: Game.market, time: Game.time, get: Game.getObjectById,
        settings: Memory.settings, craft: Memory.craft, ops: Memory.terminalOps, flip: Memory.marketFlip, memRooms: Memory.rooms,
        snapshot: market.snapshot, bid: pricing.conservativeBid, reactions: REACTIONS };
    const store = (values) => Object.assign({ getCapacity: () => 1000000, getFreeCapacity: () => 900000 }, values);
    let room;
    function reset() {
        Game.time += 1000;
        Memory.settings = { stockPolicy: { enabled: false, creditReserve: 0 }, craft: { test: false, maxActive: 9, labPolicy: false, tickInterval: 1 } };
        Memory.craft = { active: {}, stranded: {}, recovered: {} }; Memory.terminalOps = { operations: {}, nextId: 1, events: [] };
        Memory.marketFlip = { active: {}, committedCredits: 0 }; Memory.rooms = {};
        const labs = [[13, 12], [12, 13], [14, 11]].map(([x, y], n) => ({ id: "basis-lab-" + n,
            pos: { x, y }, structureType: STRUCTURE_LAB, store: store({}), mineralAmount: 0, cooldown: 0 }));
        room = { name: "BasisRoom", controller: { my: true }, storage: { id: "basis-storage", store: store({ X: 1205, KH2O: 375 }) },
            terminal: { id: "basis-terminal", store: store({ energy: 1000 }) }, find: () => labs };
        Game.rooms = { BasisRoom: room }; Game.creeps = {}; Game.getObjectById = (id) => labs.find((l) => l.id === id);
        Game.market = { credits: 10000000, orders: {}, calcTransactionCost: () => 0, getAllOrders: () => [] };
        market.snapshot = () => ({ resources: { X: { currentBuy: 220 }, KH2O: { currentBuy: 200 }, energy: { currentBuy: 1 } } });
        pricing.conservativeBid = (r, p) => p === undefined ? null : p;
        REACTIONS = Object.assign({}, saved.reactions, { X: Object.assign({}, saved.reactions.X, { KH2O: "XKH2O" }) });
        pricing.resetCaches();
    }
    const legacy = (items, spent) => ({ room: room.name, items, spent, confidence: "estimated", tick: Game.time - 100 });
    try {
        reset(); Memory.craft.recovered.old = legacy({ X: 900 }, 847543);
        let q = ledger.recoveredBasis(room, { X: 375 });
        assert(q.extra === 0 && q.estimated && Memory.craft.recovered.old.spent === 847543,
            "0137: unknown historical847543 is not charged again to a375-unit opportunity-cost candidate");
        const candidate = { room: room.name, product: "XKH2O", qty: 375, cost: 157500, cash: 0, spend: 0, revenue: 210000,
            profit: 52500, ratio: 1 / 3, margin: 0.05, steps: [{ kind: "lab", product: "XKH2O", batches: 75 }],
            buys: {}, owns: { X: 375, KH2O: 375 } };
        const opened = chain.open(room, candidate);
        assert(opened.ok && Memory.craft.active[room.name].kinds.includes("lab"),
            "0137: profitable lab chain opens with recovered X instead of failing recovered-cost-margin");
        if (opened.ok) {
            const c = Memory.craft.active[room.name];
            assert(c.recoveredCostEstimated && c.inventory.balances.X === 375 && Memory.craft.recovered.old.items.X === 525,
                "0137: new lab owns only its375 inputs and retains unknown-cost provenance");
            const item = c.queue[0], output = Game.getObjectById(item.output); item.started = true; output.room = room;
            ledger.production(output, "XKH2O", 5); output.store.XKH2O = 5; Game.time++; ledger.settle(c);
            assert(c.inventory.estimatedCosts.XKH2O && !c.inventory.estimatedCosts.KH2O,
                "0137: production propagates unknown input basis to output without contaminating unrelated known inputs");
            chain.cancelRoom(room.name);
            const aborted = Memory.craft.stranded[c.id];
            assert(aborted && aborted.confidence === "estimated", "0137: abort never promotes estimated recovered basis to confirmed history");
            assert(aborted.costConfidence.XKH2O === "estimated" && aborted.costConfidence.KH2O === "confirmed",
                "0137: mixed recovery retains per-resource confidence and confirmed remaining basis");
        }
        reset(); Memory.craft.recovered = { a: legacy({ X: 900 }, 847543), b: legacy({ X: 1045 }, 851865) };
        assert(typeof ledger.reconcileRecovered === "function", "0137: recovery pool has quantitative reconciliation");
        if (ledger.reconcileRecovered) {
            ledger.reconcileRecovered(room);
            assert(Object.values(Memory.craft.recovered).reduce((n, e) => n + (e.items.X || 0), 0) === 1205,
                "0137: legacy X900+1045 is backed by physical1205 only once");
            room.storage.store.X = 500; Game.time++; ledger.reconcileRecovered(room);
            assert(Object.values(Memory.craft.recovered).reduce((n, e) => n + (e.items.X || 0), 0) === 500 && Memory.craft.recovered.a.spent === 847543,
                "0137: external consumption reduces recovered quantity without erasing historical estimates");
        }
        reset(); room.storage.store.X = 100;
        Memory.craft.recovered.known = { room: room.name, items: { X: 100 }, costs: { X: 30000 }, confidence: "confirmed", spent: 30000 };
        q = ledger.recoveredBasis(room, { X: 25 });
        assert(q.extra === 2000 && !q.estimated && Memory.craft.recovered.known.items.X === 100,
            "0137: confirmed basis7500 replaces included opportunity5500 without mutating preview");
        const first = ledger.recoveredBasis(room, { X: 25 }, "adopter-a");
        ledger.recoveredBasis(room, { X: 10 }, "adopter-b");
        Memory.craft = JSON.parse(JSON.stringify(Memory.craft)); ledger.recoveredBasis(room, { X: 25 }, "adopter-a");
        assert(first.extra === 2000 && Memory.craft.recovered.known.items.X === 65 && Memory.craft.recovered.known.costs.X === 19500,
            "0137: partial adoptions25+10 and retry after reset consume35 rather than60");
        room.storage.store.X = 50; Game.time++;
        if (ledger.reconcileRecovered) {
            ledger.reconcileRecovered(room);
            assert(Memory.craft.recovered.known.costs.X === 15000 && Memory.craft.recovered.known.unassignedCosts.X === 4500,
                "0137: missing physical quantity moves known basis out of available pool without deleting it");
        }
        reset(); Memory.craft.recovered.old = legacy({ X: 1205 }, 847543);
        Game.market.orders.manual = { roomName: room.name, type: ORDER_SELL, resourceType: "X", remainingAmount: 1000 };
        ledger.reconcileRecovered(room);
        assert(Memory.craft.recovered.old.items.X === 205,
            "0137: published manual listing keeps its1000 units ahead of the recovery pool");
        reset(); Memory.craft.recovered.old = legacy({ X: 1205 }, 847543);
        const active = { id: "other-owner", room: room.name, queue: [], buys: {}, product: "XKH2O", state: "working" };
        ledger.ensure(active, { X: 100 }); Memory.craft.active.other = active;
        ledger.reconcileRecovered(room);
        assert(Memory.craft.recovered.old.items.X === 1105 && active.inventory.balances.X === 100,
            "0137: active owner's confirmed stock cannot also back a recovered lot");
        reset(); Memory.craft.recovered.known = { room: room.name, items: { X: 900 }, costs: { X: 270000 }, confidence: "confirmed", spent: 270000 };
        const priced = Object.assign({}, candidate, { cost: 187500, profit: 22500, ratio: 0.12, recoveredCost: 30000 });
        const knownOpened = chain.open(room, priced);
        assert(knownOpened.ok && Memory.craft.active[room.name].est.cost === 187500,
            "0137: opening does not charge confirmed recovery cost already applied by selection twice");
        if (knownOpened.ok) assert(Memory.craft.active[room.name].inventory.costs.X === 112500 && Memory.craft.active[room.name].inventory.costs.KH2O === 75000,
            "0137: confirmed adopted basis stays on its resource rather than inflating unrelated input cost");
        reset(); Memory.craft.recovered.known = { room: room.name, items: { X: 900 }, costs: { X: 900000 }, confidence: "confirmed", spent: 900000 };
        const denied = chain.open(room, candidate);
        assert(!denied.ok && denied.reason === "recovered-cost-margin" && Memory.craft.recovered.known.items.X === 900,
            "0137: proven high historical basis still refuses an unprofitable recipe before adopting stock");
        reset(); Memory.craft.recovered.old = legacy({ X: 900 }, 847543); market.snapshot = () => ({ resources: {} });
        const unknown = chain.open(room, candidate);
        assert(!unknown.ok && unknown.reason === "recovered-cost-unknown:X" && Memory.craft.recovered.old.items.X === 900,
            "0137: missing opportunity reference never makes unknown recovered input free");
    } finally {
        Game.rooms = saved.rooms; Game.creeps = saved.creeps; Game.market = saved.market; Game.time = saved.time; Game.getObjectById = saved.get;
        Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.terminalOps = saved.ops; Memory.marketFlip = saved.flip;
        Memory.rooms = saved.memRooms; market.snapshot = saved.snapshot; pricing.conservativeBid = saved.bid; REACTIONS = saved.reactions; pricing.resetCaches();
    }
};
