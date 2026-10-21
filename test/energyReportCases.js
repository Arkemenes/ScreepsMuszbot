// ROADMAP 0154-B (ARK-133): energyReport aggregates spend, WORK utilization, income proxy,
// coverage and RCL ETA from per-tick heap samples.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory };
    const ledger = require(src("energyLedger"));
    const original = { actedIds: ledger.actedIds, tickCategories: ledger.tickCategories };
    try {
        global.Memory = { settings: { energyReport: { autoTicks: 0, sampleTicks: 1 } }, rooms: {} };
        let stored = 1000, progress = 0;
        const room = {
            name: "ReportRoom",
            controller: { level: 5, my: true, get progress() { return progress; }, progressTotal: 10000 },
            get storage() { return { store: { energy: stored } }; },
            terminal: null,
            find: () => [],
        };
        const body = (n) => Array.from({ length: n }, () => ({ type: WORK })).concat([{ type: CARRY }, { type: MOVE }]);
        // body is rebuilt on every read, like the live engine's per-tick game objects
        let bodyReads = 0;
        const creep = (id, role, work) => ({ id, name: id, room, memory: { role }, get body() { bodyReads++; return body(work); } });
        global.Game = Object.assign({}, saved.game, { time: 1000, myRooms: [room],
            creeps: { b1: creep("b1", "builder", 2), b2: creep("b2", "builder", 2), u1: creep("u1", "upgrader", 3) } });
        ledger.actedIds = () => new Set(["b1", "u1"]);
        ledger.tickCategories = () => ({ build: 2, upgrade: 3 });
        delete require.cache[require.resolve(src("energyReport"))];
        const energyReport = require(src("energyReport"));

        for (let i = 0; i < 10; i++) {
            Game.time = 1000 + i;
            stored = 1000 + 10 * i;
            progress = 50 * i;
            energyReport.observe();
        }
        const r = energyReport.report("ReportRoom", 10);
        assert(r.observedTicks === 10 && r.coverage === 1 && r.spendPerTick === 5 && r.spend.build === 20 && r.spend.upgrade === 30,
            "0154 report denominators: spend per tick and by category over the observed ticks (got " + JSON.stringify(r.spend) + ")");
        assert(r.utilization.builder.ratio === 0.5 && r.utilization.builder.workAlive === 4 && r.utilization.upgrader.ratio === 1,
            "0154 report: one acting and one idle builder read 50% of 4 WORK, the busy upgrader 100%");
        // stored +90 over 9 ticks, spend inside the interval 9 ticks x 5 = 45 -> (90 + 45) / 9 = 15
        assert(r.storedDelta === 90 && r.incomeProxyPerTick === 15,
            "0154 report: income proxy = (stored delta + spend inside the interval) / ticks (got " + r.incomeProxyPerTick + ")");
        assert(r.rcl && r.rcl.etaTicks === Math.ceil((10000 - 450) / 50),
            "0154 report: RCL ETA from the controller progress rate (got " + JSON.stringify(r.rcl) + ")");
        // 0157 T3: worker WORK-ticks = (2 + 2 + 3) x 10 = 70, acting (b1 + u1) = 50
        assert(r.actions.workerWorkTicks === 70 && Math.abs(r.actions.build - 20 / 5 / 70) < 1e-9 &&
            Math.abs(r.actions.upgrade - 30 / 70) < 1e-9 && r.actions.repair === 0 && Math.abs(r.actions.occupancy - 50 / 70) < 1e-9,
            "0157 action utilization: U_a = energy / e_a over the worker WORK-ticks (e_build 5, e_upgrade 1), occupancy is the union per worker (got " +
            JSON.stringify(r.actions) + ")");
        const subs = energyReport.subwindowRates("ReportRoom", 10, 5);
        assert(subs.length === 2 && subs.every((s) => s.coverage === 1 && s.rate === 10),
            "0157 affine continuous supply: subwindowRates gives each subwindow's net stored rate and coverage (got " + JSON.stringify(subs) + ")");
        assert(energyReport.report("NoRoom", 10).actions === null, "0157 action utilization: no samples, no utilization (null, never 0)");
        assert(bodyReads === 3, "0154 report: WORK parts are counted once per creep id, not once per tick (got " + bodyReads + " body reads)");
        const sum = energyReport.summary("ReportRoom", 10);
        assert(sum.ticks === 10 && sum.coverage === 1 && sum.utilization.builder.ratio === 0.5 && sum.incomeProxyPerTick === 15,
            "0154 report: summary() gives Memory.stats the rounded window numbers");
        const partial = energyReport.report("ReportRoom", 20);
        assert(partial.coverage === 0.5 && energyReport.context("ReportRoom", 20) === null && energyReport.context("ReportRoom", 10) !== null,
            "0154 report: missing ticks lower coverage and context() refuses to answer below energyReport.minCoverage");
        // blocks of 5 ticks: same totals, stored/progress read once per block, ring 5x smaller
        energyReport.reset();
        Memory.settings.energyReport.sampleTicks = 5;
        let storedReads = 0;
        Object.defineProperty(room, "storage", { configurable: true, get() { storedReads++; return { store: { energy: stored } }; } });
        for (let i = 0; i < 20; i++) {
            Game.time = 2000 + i;
            stored = 1000 + 10 * i;
            progress = 50 * i;
            energyReport.observe();
        }
        const b = energyReport.report("ReportRoom", 20);
        assert(b.observedTicks === 20 && b.coverage === 1 && b.spendPerTick === 5 && b.utilization.builder.ratio === 0.5 &&
            b.fromTick === 2000 && b.toTick === 2015 && b.storedDelta === 150 && b.incomeProxyPerTick === 15 &&
            b.rcl.etaTicks === Math.ceil((10000 - 750) / 50) && storedReads === 4,
            "0154 report blocks: sampleTicks folds ticks into blocks with the same totals and one stored read per block (got " +
            JSON.stringify({ o: b.observedTicks, d: b.storedDelta, i: b.incomeProxyPerTick, reads: storedReads }) + ")");
        Game.time = 500;
        energyReport.observe();
        assert(energyReport.report("ReportRoom", 10).observedTicks === 1,
            "0154 report: a clock that goes backwards (new world) drops the old samples");
        Memory.settings.energyReport.enabled = false;
        Game.time = 501;
        energyReport.observe();
        assert(energyReport.report("ReportRoom", 10).observedTicks === 1, "0154 report: energyReport.enabled = false stops sampling");
        assert(typeof global.energyReport === "function" && /ReportRoom/.test(global.energyReport("ReportRoom", 10)),
            "0154 report: console energyReport(room, n) prints the room line");
    } finally {
        ledger.actedIds = original.actedIds;
        ledger.tickCategories = original.tickCategories;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
