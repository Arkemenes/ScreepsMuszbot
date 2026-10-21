// ROADMAP 0154-B (ARK-133): energyReport aggregates spend, WORK utilization, income proxy,
// coverage and RCL ETA from per-tick heap samples.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory };
    const ledger = require(src("energyLedger"));
    const original = { actedIds: ledger.actedIds, tickCategories: ledger.tickCategories };
    try {
        global.Memory = { settings: { energyReport: { autoTicks: 0 } }, rooms: {} };
        let stored = 1000, progress = 0;
        const room = {
            name: "ReportRoom",
            controller: { level: 5, my: true, get progress() { return progress; }, progressTotal: 10000 },
            get storage() { return { store: { energy: stored } }; },
            terminal: null,
            find: () => [],
        };
        const body = (n) => Array.from({ length: n }, () => ({ type: WORK })).concat([{ type: CARRY }, { type: MOVE }]);
        const creep = (id, role, work) => ({ id, name: id, room, memory: { role }, body: body(work) });
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
        const sum = energyReport.summary("ReportRoom", 10);
        assert(sum.ticks === 10 && sum.coverage === 1 && sum.utilization.builder.ratio === 0.5 && sum.incomeProxyPerTick === 15,
            "0154 report: summary() gives Memory.stats the rounded window numbers");
        const partial = energyReport.report("ReportRoom", 20);
        assert(partial.coverage === 0.5 && energyReport.context("ReportRoom", 20) === null && energyReport.context("ReportRoom", 10) !== null,
            "0154 report: missing ticks lower coverage and context() refuses to answer below energyReport.minCoverage");
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
