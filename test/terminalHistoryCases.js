module.exports = function (project, assert) {
    const path = require("path"), terminal = require(path.join(project, "src/utils/terminalOps"));
    const original = { game: Game, memory: Memory };
    try {
        global.Game = { ...Game, time: 211000000, creeps: {}, rooms: {}, market: { orders: {},
            incomingTransactions: [{ transactionId: "transaction", time: 211000000, to: "HistoryRoom", amount: 10, resourceType: "O" }], outgoingTransactions: [] } };
        global.Memory = { settings: {}, terminalOps: { nextId: 600, operations: {}, events: [{ tick: Game.time, amount: 10 }], seenIncoming: { transaction: Game.time } },
            craft: { active: {}, stats: { profit: 12345 } }, marketFlip: { active: {}, stats: { profit: 6789 } } };
        const ops = Memory.terminalOps.operations;
        const put = (id, extra = {}) => ops[id] = { id, kind: "buy", state: "completed", sourceRoom: "HistoryRoom", resourceType: "O",
            amount: 10, remaining: 0, updatedTick: Game.time - 100, accounting: { credits: -100, energy: 1, amount: 10 }, ...extra };
        for (let i = 0; i < 500; i++) put("old-" + i);
        const before = JSON.stringify(Memory).length;
        put("live", { state: "waiting" });
        terminal.tick();
        assert(Object.keys(ops).length === 1 && ops.live && JSON.stringify(Memory).length < before / 10,
            "ARK-131: default collection removes 500 unreferenced final operations and keeps active work");
        assert(Memory.craft.stats.profit === 12345 && Memory.marketFlip.stats.profit === 6789 && Memory.terminalOps.seenIncoming.transaction,
            "ARK-131: collection preserves consolidated accounting and transaction deduplication");
        // Isolated collector tests do not run state machines or incoming reconciliation.
        const history = require(path.join(project, "src/utils/terminalHistory"));
        put("craft-buy"); put("craft-owner", { owner: { kind: "craft", id: "chain" } });
        put("flip-buy"); put("flip-sell", { kind: "sell" });
        put("receipt-parent"); put("receipt", { kind: "receipt", state: "waiting", parentId: "receipt-parent" });
        put("hauler-op", { state: "cancelled" });
        put("intent", { pendingDeal: { tick: Game.time, quantity: 10 } });
        put("extension", { pendingExtension: { tick: Game.time } });
        put("cancel-listing", { pendingListingCancel: { tick: Game.time } });
        put("listing", { marketOrderId: "market-live" });
        Game.market.orders["market-live"] = { remainingAmount: 10 };
        Memory.craft.active.chain = { id: "chain", buys: { O: { opId: "craft-buy" } }, tradeIds: [] };
        Memory.marketFlip.active.O = { buyOpId: "flip-buy", sellOpId: "flip-sell" };
        Game.time++;
        Game.creeps.worker = { room: { name: "HistoryRoom" }, memory: { role: "hauler", terminalJob: { operationId: "hauler-op" } }, store: { O: 10 } };
        const retained = Object.keys(ops).length;
        history.prune(Memory.terminalOps);
        assert(Object.keys(ops).length === retained,
            "ARK-131: craft, migration owner, flip, receipt parents, jobs, pending intents and listings retain final records");
        Memory.terminalOps.lotTargets = { "craft:chain:O:output": { accepted: 10, updatedTick: Game.time },
            "manual:finished:O:output": { accepted: 10, updatedTick: Game.time } };
        const events = JSON.stringify(Memory.terminalOps.events), seen = JSON.stringify(Memory.terminalOps.seenIncoming);
        history.prune(Memory.terminalOps);
        assert(Memory.terminalOps.lotTargets["craft:chain:O:output"] && !Memory.terminalOps.lotTargets["manual:finished:O:output"] &&
            JSON.stringify(Memory.terminalOps.events) === events && JSON.stringify(Memory.terminalOps.seenIncoming) === seen,
            "ARK-131: orphan lot targets are cleared without deleting live idempotency or recent events");
        assert(JSON.parse(global.terminalOperations()).every((op) => !["completed", "failed", "cancelled"].includes(op.state)) &&
            JSON.parse(global.terminalOperations({ includeFinalized: true })).length === retained,
            "ARK-131: console defaults to active work and can include temporarily retained final records");
        // Restore persistent state and release every consumer before collecting again.
        global.Memory = JSON.parse(JSON.stringify(Memory));
        Memory.craft.active = {}; Memory.marketFlip.active = {}; Game.creeps = {}; Game.time++;
        const restored = Memory.terminalOps.operations;
        delete restored.receipt; delete restored.intent.pendingDeal; delete restored.extension.pendingExtension;
        delete restored["cancel-listing"].pendingListingCancel; Game.market.orders = {};
        history.prune(Memory.terminalOps);
        assert(Object.keys(restored).join() === "live",
            "ARK-131: reset preserves lifecycle and released dependencies allow automatic collection");
        assert(!Object.keys(Memory.terminalOps.lotTargets).length,
            "ARK-131: completed owners release their cumulative lot targets after reset");
        Memory.settings.terminalOps = { operationRetentionTicks: 200 };
        restored.retained = { id: "retained", state: "completed", updatedTick: Game.time - 100 };
        history.prune(Memory.terminalOps);
        assert(restored.retained, "ARK-131: explicit diagnostic retention remains configurable");
        Game.time += 201; history.prune(Memory.terminalOps);
        assert(!restored.retained, "ARK-131: configured diagnostic retention expires");
        Memory.settings.terminalOps.operationRetentionTicks = 0;
        restored.a = { id: "a", state: "completed", parentId: "b", updatedTick: Game.time };
        restored.b = { id: "b", state: "completed", parentId: "a", updatedTick: Game.time };
        restored.live.parentId = "a";
        history.prune(Memory.terminalOps);
        assert(restored.a && restored.b, "ARK-131: referenced parent cycles terminate while retaining dependencies");
        delete restored.live.parentId; history.prune(Memory.terminalOps);
        assert(!restored.a && !restored.b, "ARK-131: orphaned parent cycles are collectible");
    } finally { global.Game = original.game; global.Memory = original.memory; }
};
