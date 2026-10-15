module.exports = function (project, assert) {
    const path = require("path"), modulePath = path.join(project, "src/utils/cpuAccounting");
    let accounting;
    try { accounting = require(modulePath); }
    catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
    assert(!!accounting, "0140: bucket accounting is available separately from observed script time");
    if (!accounting) return;
    const saved = { game: Game, memory: Memory };
    try {
        global.Memory = { settings: { stats: { cpuBalanceWindowTicks: 3 } } };
        global.Game = { time: 1, shard: { name: "shard3" }, cpu: { limit: 20, bucket: 3500 } };
        const begin = (tick, bucket, limit = 20) => {
            Game.time = tick; Game.cpu.bucket = bucket; Game.cpu.limit = limit; accounting.begin();
        };
        accounting.reset(); begin(1, 3500); accounting.end(16);
        assert(accounting.snapshot().validTicks === 0 && accounting.snapshot().used === null,
            "0140: the first tick has no completed server balance to infer");
        begin(2, 3500);
        let s = accounting.snapshot();
        assert(s.used === 20 && s.scriptUsed === 16 && s.residual === 4 && s.headroom === 0 && s.fromTick === 1,
            "0140: stable bucket reveals20 accounted CPU despite16 observed inside the script");
        accounting.end(10); begin(3, 3505);
        s = accounting.snapshot();
        assert(s.used === 17.5 && s.scriptUsed === 13 && s.residual === 4.5 && s.headroom === 2.5,
            "0140: each bucket delta pairs with its own previous script tick");
        accounting.begin();
        assert(accounting.snapshot().validTicks === 2, "0140: duplicate begin cannot count an interval twice");
        // Tick3 never called end: its debit still must remain in the real average.
        begin(4, 3495);
        s = accounting.snapshot();
        assert(s.validTicks === 3 && s.used === 21.667 && s.pairedTicks === 2 && s.missingEndTicks === 1,
            "0140: a missing end measurement does not erase the expensive completed bucket interval");
        accounting.end(10); begin(5, 3505);
        s = accounting.snapshot();
        assert(s.ticks === 3 && s.fromTick === 2 && s.toTick === 4 && s.used === 18.333,
            "0140: the rolling heap window evicts old contributions rather than growing forever");
        accounting.end(1); begin(7, 3505);
        assert(accounting.snapshot().skippedTicks === 1 && accounting.snapshot().missingTicks === 1,
            "0140: a tick gap is marked instead of inventing a per-tick debit");
        accounting.reset(); begin(10, 9995); accounting.end(1); begin(11, 10000);
        assert(accounting.snapshot().validTicks === 0 && accounting.snapshot().skippedTicks === 1,
            "0140: saturated bucket intervals cannot imply negative or free CPU");
        accounting.reset(); begin(20, 10); accounting.end(16); begin(21, 0);
        assert(accounting.snapshot().validTicks === 0, "0140: an exhausted bucket cannot prove the full charged debit");
        accounting.reset(); begin(30, 3500); accounting.end(10); begin(31, 3500, 25);
        assert(accounting.snapshot().validTicks === 0, "0140: a changed shard budget invalidates the transition");
        begin(32, 3515, 25); accounting.end(16); begin(33, 3535, 25);
        assert(accounting.snapshot().residual < 0, "0140: inconsistent negative residual is exposed without hiding it by clamping");
        begin(1, 3500);
        assert(accounting.snapshot().validTicks === 0, "0140: backward time resets the historical timeline");
        Game.shard.name = "shard2"; begin(2, 3500);
        assert(accounting.snapshot().ticks === 0, "0140: another shard cannot share a balance history");
        accounting.reset(); begin(40, 3500); accounting.end(16); begin(41, 3500);
        Memory.settings.stats.cpuBalanceWindowTicks = 1; begin(42, 3500);
        assert(accounting.snapshot().ticks <= 1, "0140: changing the window resets its bounded heap storage");
        Memory.settings.stats.cpuBalanceWindowTicks = Infinity; begin(43, 3500); accounting.end(16); begin(44, 3500);
        assert(accounting.snapshot().validTicks === 1, "0140: a nonfinite configured window falls back to bounded storage");
    } finally { global.Game = saved.game; global.Memory = saved.memory; accounting.reset(); }
};
