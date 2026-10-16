// Generate the paste file with prepare-cpu-audit-console.js.
// Submit each generated line SEPARATELY. No installation or deploy.
// The console API limits JSON.stringify(expression).length to 1024.
// Each expression is independent and leaves Memory and globals unchanged.
// COMMAND memory
(() => {
    const s = Game.cpu.getUsed(), p = {};
    for (const k of Object.keys(Memory)) p[k] = (JSON.stringify(Memory[k]) || '').length;
    const cpu = Game.cpu.getUsed() - s, m = Memory.stats || {};
    console.log('[cpuAuditMemory] ' + JSON.stringify({tick: Game.time,
        rawChars: RawMemory.get().length, parts: p, serializationCpu: cpu,
        reset: m.persistent && m.persistent.lastGlobalReset,
        profiler: !!(Memory.settings && Memory.settings.profiler),
        history: typeof marketHistoryStatus === 'function' ? marketHistoryStatus() : null}));
})();
// COMMAND rooms
(() => {
    const r = {};
    for (const x of Object.values(Game.rooms)) if (x.controller && x.controller.my)
        r[x.name] = {level: x.controller.level, labs: 0, roles: {},
            energy: [x.storage && x.storage.store.energy || 0, x.terminal && x.terminal.store.energy || 0],
            cooldown: x.terminal && x.terminal.cooldown || 0};
    for (const x of Object.values(Game.structures)) if (x.structureType === 'lab' && r[x.room.name]) r[x.room.name].labs++;
    for (const x of Object.values(Game.creeps)) if (r[x.room.name]) {
        const a = r[x.room.name].roles, k = x.memory.role || 'none'; a[k] = (a[k] || 0) + 1;
    }
    console.log('[cpuAuditRooms] ' + JSON.stringify({tick: Game.time, rooms: r,
        chains: Object.values(Memory.craft && Memory.craft.active || {}).map(x => [x.room, x.product, x.state])}));
})();
// COMMAND business
(() => {
    const t = Memory.terminalOps || {}, tx = new Map();
    for (const x of (Game.market.incomingTransactions || []).concat(Game.market.outgoingTransactions || []))
        if (x.transactionId) tx.set(x.transactionId, [x.transactionId, x.time, !!x.order]);
    console.log('[cpuAuditBusiness] ' + JSON.stringify({tick: Game.time, nextId: t.nextId,
        reset: Memory.stats && Memory.stats.persistent && Memory.stats.persistent.lastGlobalReset,
        ownOrders: Object.keys(Game.market.orders || {}).length,
        opFields: ['id', 'kind', 'state'],
        ops: Object.keys(t.operations || {}).map(id => [id, t.operations[id].kind, t.operations[id].state]),
        txFields: ['id', 'tick', 'marketOrder'], transactions: Array.from(tx.values()), coverageNotGuaranteed: true}));
})();
