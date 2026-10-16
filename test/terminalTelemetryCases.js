module.exports = function (project, assert) {
    const path = require("path"), terminal = require(path.join(project, "src/utils/terminalOps"));
    assert(typeof terminal.terminalNetworkStats === "function", "ARK-130: bot exposes explicit expiring route gauges");
    if (typeof terminal.terminalNetworkStats !== "function") return;
    const saved = { game: Game, memory: Memory };
    try {
        global.Game = { ...Game, time: 215000000, rooms: {}, creeps: {} };
        global.Memory = { rooms: {}, creeps: {}, settings: { terminalOps: { statsWindowTicks: 60 }, stats: { publishInterval: 600 } }, terminalOps: { operations: {}, events: [] } };
        const event = { tick: Game.time, kind: "transfer", from: "A", to: "B", resourceType: "energy", amount: 100 };
        Memory.terminalOps.events.push(event);
        let snap = terminal.terminalNetworkStats();
        assert(snap.transfers[0].amount === 100, "ARK-130: network snapshot publishes confirmed transfers");
        Game.time++;
        assert(terminal.terminalNetworkStats(snap) === snap, "ARK-130: idle ticks reuse the entire network snapshot");
        Game.time = event.tick + 60;
        snap = terminal.terminalNetworkStats(snap);
        assert(snap.transfers.length === 1 && snap.transfers[0].amount === 0 && Memory.terminalOps.events.length === 0,
            "ARK-130: expiry emits an explicit zero without waiting for the next full stats publication");
        // This models the previous exporter, which never clears absent labels.
        const gauge = { "A->B": 100 };
        snap.transfers.forEach((t) => gauge[t.from + "->" + t.to] = t.amount);
        assert(gauge["A->B"] === 0, "ARK-130: explicit bot zeros close gauges in legacy exporters too");
        Memory.terminalOps.events.push({ ...event, tick: Game.time, amount: 20 });
        snap = terminal.terminalNetworkStats(snap);
        assert(snap.transfers.length === 1 && snap.transfers[0].amount === 20, "ARK-130: a new transfer replaces the expired route total");
        Memory = JSON.parse(JSON.stringify(Memory));
        Game.time += 60;
        snap = terminal.terminalNetworkStats(JSON.parse(JSON.stringify(snap)));
        assert(snap.transfers[0].amount === 0, "ARK-130: persisted route labels still expire after a reset");
        Memory.stats = { time: Game.time, cpu: {}, terminalNetwork: snap };
        Memory.terminalOps.events.push({ ...event, tick: Game.time, amount: 45 });
        const stats = require(path.join(project, "src/utils/stats"));
        stats();
        assert(Memory.stats.terminalNetwork.transfers[0].amount === 45,
            "ARK-130: lightweight stats updates transfers between full publications");
        Game.time += 59; stats();
        assert(Memory.stats.terminalNetwork.transfers[0].amount === 45, "ARK-130: routes retain only their actual recent window amount");
        Game.time++; stats();
        assert(Memory.stats.terminalNetwork.transfers[0].amount === 0, "ARK-130: stats clears expired route amounts at the exact boundary");
        Memory.terminalOps.events.push({ ...event, tick: Game.time, kind: "buy", resourceType: "O", amount: 12, credits: -36 });
        Memory.terminalOps.events.push({ ...event, tick: Game.time, kind: "buy", resourceType: "O", amount: 8, credits: -20 });
        Memory.terminalOps.events.push({ ...event, tick: Game.time, kind: "sell", resourceType: "O", amount: 7, credits: 28 });
        stats();
        let tx = Memory.stats.market && Memory.stats.market.transactions;
        assert(tx && tx.bought.O && tx.bought.O.amount === 20 && tx.bought.O.credits === 56 && tx.sold.O.amount === 7,
            "ARK-130: lightweight market snapshot sums confirmed events by side and resource");
        const marketSnapshot = tx;
        Game.time++; stats();
        assert(Memory.stats.market && Memory.stats.market.transactions === marketSnapshot,
            "ARK-130: idle market ticks reuse the snapshot without replaying events");
        Game.time += 59; stats();
        tx = Memory.stats.market && Memory.stats.market.transactions;
        assert(tx && tx.bought.O && tx.bought.O.amount === 0 && tx.bought.O.credits === 0 && tx.sold.O.amount === 0,
            "ARK-130: expired market resources explicitly zero both amount and credits");
        assert(Memory.stats.telemetry && Memory.stats.telemetry.tick === Game.time && Memory.stats.telemetry.windowTicks === 60 &&
            Memory.stats.telemetry.windowStart === Game.time - 59,
            "ARK-130: external collector receives actual Game.time window endpoints");
    } finally { global.Game = saved.game; global.Memory = saved.memory; }
};
