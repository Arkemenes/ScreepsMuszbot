// OBSOLETE: too large for the console API. Kept only as a diagnostic reference.
// Use cpu-audit-console-paste.txt instead, submitting its three lines separately.
// Read-only bot inspection. Only this diagnostic's bounded state lives in global.
// Does not reset meters, change settings, wrap the loop, or send game intents.
global.cpuAuditSnapshot = function (measureMemoryParts) {
    const before = Game.cpu.getUsed();
    const stats = Memory.stats || {};
    const terminal = Memory.terminalOps || {};
    const operations = terminal.operations || {};
    const final = new Set(["completed", "failed", "cancelled"]);
    const opCounts = {}, rooms = {}, roles = {}, ids = Object.keys(operations);
    const add = (table, key) => { table[key] = (table[key] || 0) + 1; };
    for (const room of Object.values(Game.rooms)) {
        if (!room.controller || !room.controller.my) continue;
        rooms[room.name] = { level: room.controller.level, labs: 0, roles: {}, jobs: {},
            storageEnergy: room.storage && room.storage.store.energy || 0,
            terminalEnergy: room.terminal && room.terminal.store.energy || 0,
            terminalCooldown: room.terminal && room.terminal.cooldown || 0 };
    }
    for (const structure of Object.values(Game.structures)) {
        if (structure.structureType === STRUCTURE_LAB && rooms[structure.room.name]) rooms[structure.room.name].labs++;
    }
    for (const creep of Object.values(Game.creeps)) {
        const role = creep.memory.role || "none";
        add(roles, role);
        const room = rooms[creep.room.name];
        if (room) {
            add(room.roles, role);
            const job = creep.memory.terminalJob || creep.memory.mineralJob || creep.memory.lootJob;
            add(room.jobs, job ? job.kind || job.direction || "assigned" : creep.memory.job || "none");
        }
    }
    for (const id of ids) {
        const op = operations[id];
        add(opCounts, (op.kind || "unknown") + ":" + op.state);
    }
    const tx = new Map();
    for (const entry of (Game.market.incomingTransactions || []).concat(Game.market.outgoingTransactions || [])) {
        if (entry.transactionId) tx.set(entry.transactionId, entry);
    }
    const previous = global.__cpuAuditObservation;
    const newlyObserved = previous ? Array.from(tx.values()).filter((entry) => !previous.txIds.has(entry.transactionId)) : [];
    const retainedNewOps = previous ? ids.filter((id) => !previous.operationIds.has(id)) : [];
    const output = { tick: Game.time, profilerActive: !!(Memory.settings && Memory.settings.profiler),
        lastGlobalReset: stats.persistent && stats.persistent.lastGlobalReset,
        rawMemoryChars: RawMemory.get().length,
        accountingPublished: stats.cpu && stats.cpu.accounting,
        meterLastClosed: stats.cpu && stats.cpu.meter,
        rooms, roles, operationCounts: opCounts, operationsRetained: ids.length,
        activeOperations: ids.filter((id) => !final.has(operations[id].state)).length,
        nextId: terminal.nextId, ownOrders: Object.keys(Game.market.orders || {}).length,
        chains: Object.values(Memory.craft && Memory.craft.active || {}).map((chain) => ({
            room: chain.room, product: chain.product, state: chain.state,
            item: chain.queue && chain.queue[chain.qi || 0] && chain.queue[chain.qi || 0].kind,
            policy: !!(chain.queue && chain.queue[chain.qi || 0] && chain.queue[chain.qi || 0].policy) })),
        history: typeof marketHistoryStatus === "function" ? marketHistoryStatus() : null,
        observedTransactions: { retainedDistinct: tx.size, sinceTick: previous ? previous.tick : null,
            newlySeen: newlyObserved.length, withMarketOrder: newlyObserved.filter((entry) => !!entry.order).length,
            withoutMarketOrder: newlyObserved.filter((entry) => !entry.order).length,
            earliestRetainedTick: tx.size ? Math.min(...Array.from(tx.values(), (entry) => entry.time)) : null,
            coverageNotGuaranteed: true },
        creationDelta: previous ? { fromTick: previous.tick, toTick: Game.time,
            nextIdDelta: Number.isFinite(terminal.nextId) && Number.isFinite(previous.nextId) && terminal.nextId >= previous.nextId ? terminal.nextId - previous.nextId : null,
            newlyRetainedByKind: retainedNewOps.reduce((out, id) => { add(out, operations[id].kind || "unknown"); return out; }, {}),
            collectedBetweenSamplesNotRecoverable: true } : null };
    if (measureMemoryParts) {
        output.memoryPartsChars = {};
        const start = Game.cpu.getUsed();
        for (const key of Object.keys(Memory)) {
            const encoded = JSON.stringify(Memory[key]);
            output.memoryPartsChars[key] = encoded ? encoded.length : 0;
        }
        output.explicitSerializationCpu = Game.cpu.getUsed() - start;
    }
    global.__cpuAuditObservation = { tick: Game.time, nextId: terminal.nextId,
        operationIds: new Set(ids), txIds: new Set(tx.keys()) };
    output.diagnosticCpuBeforeOutput = Game.cpu.getUsed() - before;
    console.log("[cpuAuditSnapshot] " + JSON.stringify(output));
};
cpuAuditSnapshot(true);
