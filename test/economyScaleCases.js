// Work counters, not a conversion of Node timings into Screeps CPU.
module.exports = function (project, assert, report = () => {}) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils", name));
    const claims = load("terminalClaims"), census = load("census"), book = load("orderBook");
    const saved = { game: Game, memory: Memory };
    try {
        for (const rooms of [3, 5, 10]) for (const labs of [3, 7, 10]) for (const orders of [0, 20, 100]) {
            global.Memory = { rooms: {}, craft: { active: {} }, terminalOps: { nextId: 1, operations: {} } };
            global.Game = { ...saved.game, time: 216000000, rooms: {}, creeps: {}, market: { orders: {} } };
            let listingScans = 0, operationScans = 0, bookCalls = 0;
            for (let i = 0; i < rooms; i++) {
                const name = "Scale" + i;
                Game.rooms[name] = { name, storage: { id: name + "s", store: { O: 10000 } },
                    terminal: { id: name + "t", store: { O: 10000 } } };
                for (let j = 0; j < orders; j++) {
                    const id = name + ":" + j;
                    Game.market.orders[id] = { id, roomName: name, type: ORDER_SELL, resourceType: "O", remainingAmount: 1 };
                    Memory.terminalOps.operations[id] = { id, sourceRoom: name, kind: "sell", resourceType: "O",
                        marketOrderId: id, state: "queued", remaining: 1, loadedAmount: 1, owner: { kind: "manual", id } };
                }
            }
            Game.market.orders = new Proxy(Game.market.orders, { ownKeys(o) { listingScans++; return Reflect.ownKeys(o); } });
            Memory.terminalOps.operations = new Proxy(Memory.terminalOps.operations, { ownKeys(o) { operationScans++; return Reflect.ownKeys(o); } });
            census.build(); book.reset();
            const measure = (query) => {
                listingScans = 0;
                for (const room of Object.values(Game.rooms)) for (let i = 0; i < labs; i++)
                    assert(query(room) === 20000 - orders, "ARK-128: physical sum preserves manual listings at scale");
                return listingScans;
            };
            const baseline = measure((r) => claims.physicalFree(r, r.storage, "O") + claims.physicalFree(r, r.terminal, "O"));
            Game.time++; operationScans = 0;
            const cold = typeof claims.physicalPool === "function" ? measure((r) => claims.physicalPool(r, "O")) : baseline;
            const warm = typeof claims.physicalPool === "function" ? measure((r) => claims.physicalPool(r, "O")) : baseline;
            assert(cold === rooms * labs && warm === cold,
                "ARK-128: paired physical query scans listings once per decision, cold and warm (" + rooms + "/" + labs + "/" + orders + ")");
            assert(operationScans === 1, "ARK-128: scaling queries still enumerate operation history once per tick");
            // History size varies independently of active work and confirmed events.
            for (let i = 0; i < 500; i++) Memory.terminalOps.operations["old" + i] = { id: "old" + i, state: "completed" };
            Game.time++; operationScans = 0;
            if (claims.physicalPool) measure((r) => claims.physicalPool(r, "O"));
            assert(!claims.physicalPool || operationScans === 1, "ARK-128: finalized history does not multiply query enumerations");
            Game.market.getAllOrders = (filter) => { bookCalls++; return [{ id: "offer", type: filter.type, resourceType: filter.resourceType, amount: 100 }]; };
            for (let i = 0; i < rooms * labs; i++) book.matching(ORDER_SELL, "O");
            assert(bookCalls === 1, "ARK-128: shared filtered book makes one API call for repeated consumers");
            report({ rooms, consumersPerRoom: labs, ordersPerRoom: orders, baselineScans: baseline, coldScans: cold, warmScans: warm, bookCalls,
                activeOperations: rooms * orders, confirmedEvents: 0, createdOperations: 0, createdReceipts: 0 });
        }
        assert(typeof claims.physicalPool === "function", "ARK-128: shared physical pool API exists");
        if (claims.physicalPool) {
            const room = Game.rooms.Scale0;
            const compare = (label) => assert(claims.physicalPool(room, "O") ===
                claims.physicalFree(room, room.storage, "O") + claims.physicalFree(room, room.terminal, "O"), label);
            compare("ARK-128: pool equals independent sources with manual listings");
            claims.withdraw(room.storage, "O", 123); compare("ARK-128: pool protects accepted withdrawals");
            room.storage.store.O = 0; compare("ARK-128: pool clamps sources independently when storage empties");
            Game.market.orders.new = { type: ORDER_SELL, resourceType: "O", roomName: room.name, remainingAmount: 700 };
            compare("ARK-128: same-tick new listing is immediately reserved");
            room.terminal.store.O = 9; compare("ARK-128: changed physical balances are never cached");
            Game.time--; Memory.terminalOps.operations = {};
            compare("ARK-128: pool survives Memory replacement and backward tick");
            Game.time++;
            Game.market.orders = {};
            room.storage.store.O = 50; room.terminal.store.O = 20;
            const op = { id: "reserved", sourceRoom: room.name, kind: "sell", resourceType: "O", state: "queued",
                remaining: 40, loadedAmount: 10, owner: { kind: "manual", id: "reserved" } };
            Memory.terminalOps.operations = { reserved: op };
            assert(claims.physicalPool(room, "O") === 30, "ARK-128: pool protects staged and unstaged cargo exactly once");
            op.pendingDeal = { quantity: 5, cost: 3 };
            assert(claims.physicalPool(room, "O", null, op.owner) === 65,
                "ARK-128: owner exemption never releases accepted sale cargo");
            assert(claims.physicalPool(room, "O") === 30, "ARK-128: intent cargo is not double-reserved against others");
            op.state = "completed";
            assert(claims.physicalPool(room, "O") === 70, "ARK-128: same-tick completion immediately releases claims");
            Memory.terminalOps.operations = { receipt: { id: "receipt", targetRoom: room.name, kind: "receipt", resourceType: "O",
                state: "unloading", amount: 15, receivedAmount: 5 } };
            assert(claims.physicalPool(room, "O") === 60, "ARK-128: pending receipt protects only unreceived cargo");
            claims.withdraw(room.terminal, "O", 8);
            assert(claims.physicalPool(room, "O") === 52, "ARK-128: receipts and accepted withdrawal stay independent");
        }
    } finally { global.Game = saved.game; global.Memory = saved.memory; census.build(); book.reset(); }
};

if (require.main === module) {
    global.Memory = {}; global.Game = { time: 0, cpu: { getUsed: () => 0 } };
    global.RESOURCE_ENERGY = "energy"; global.ORDER_SELL = "sell";
    let failures = 0;
    module.exports(require("path").resolve(__dirname, ".."), (ok) => { if (!ok) failures++; }, (row) => console.log(JSON.stringify(row)));
    console.log(JSON.stringify({ failures })); process.exitCode = failures ? 1 : 0;
}
