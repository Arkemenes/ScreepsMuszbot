// ROADMAP 0163 (ARK-202): terminal cooldown / wait-on-cooldown share, freight paid by our own
// terminal, and the descriptive OPERATE_TERMINAL estimate.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory, pwr: global.PWR_OPERATE_TERMINAL, info: global.POWER_INFO };
    try {
        const terminal = { my: true, cooldown: 0 };
        const room = { name: "TermRoom", terminal };
        global.Memory = { settings: {} };
        global.Game = Object.assign({}, saved.game, { time: 9000, myRooms: [room, { name: "NoTerminal" }] });
        if (saved.pwr === undefined) global.PWR_OPERATE_TERMINAL = 6;
        global.POWER_INFO = Object.assign({}, saved.info, { [global.PWR_OPERATE_TERMINAL]: { ops: 100, duration: 1000, effect: [0.9, 0.8, 0.7, 0.6, 0.5] } });
        delete require.cache[require.resolve(src("terminalReport"))];
        const report = require(src("terminalReport"));

        // t1 idle; t2 cooling down with an op waiting on it (counted once); t3 idle again
        report.observe();
        Game.time++; terminal.cooldown = 7;
        report.blocked("TermRoom"); report.blocked("TermRoom"); report.observe(); report.observe();
        Game.time++; terminal.cooldown = 0; report.observe();
        report.freight("TermRoom", 300, 10000);
        report.freight("TermRoom", 0, 5000); // a passive listing fill pays no freight here
        const c = Memory.terminalReport.TermRoom;
        assert(c.ticks === 3 && c.cooldown === 1 && c.blocked === 1 && !Memory.terminalReport.NoTerminal,
            "0163 observation: one sample per tick, cooldown and wait-on-cooldown counted once per tick, rooms without a terminal skipped (got " + JSON.stringify(c) + ")");
        assert(c.freight === 300 && c.amount === 10000 && c.transfers === 1,
            "0163 freight: only transfers our terminal paid freight for are counted (got " + JSON.stringify(c) + ")");
        const r = report.report("TermRoom");
        assert(Math.abs(r.busy - 1 / 3) < 1e-9 && r.freightPerTick === 100 && Math.abs(r.operate[0].saved - 10000) < 1e-6 &&
            Math.abs(r.operate[4].saved - 50000) < 1e-6 && Math.abs(r.operate[0].savedPerOp - 100) < 1e-6,
            "0163 report: busy share, freight/tick and OPERATE_TERMINAL saving = freight/tick x duration x (1 - factor) per level (got " + JSON.stringify(r) + ")");
        const s = report.summary("TermRoom");
        assert(s.operateSavedL1 === 10000 && s.operateSavedL5 === 50000 && s.blocked === 0.333,
            "0163 summary: compact numbers for Memory.stats (got " + JSON.stringify(s) + ")");
        assert(/TermRoom 3t/.test(global.terminalReport("TermRoom")) && global.terminalReset("TermRoom") === 1 && !Memory.terminalReport.TermRoom,
            "0163 console: terminalReport() prints the room, terminalReset() starts a new epoch");
        Memory.settings.terminalReport = { enabled: false };
        Game.time++; report.observe(); report.freight("TermRoom", 50, 100);
        assert(!Memory.terminalReport.TermRoom, "0163 off: terminalReport.enabled false records nothing");
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
        if (saved.pwr === undefined) delete global.PWR_OPERATE_TERMINAL;
        global.POWER_INFO = saved.info;
    }
};
