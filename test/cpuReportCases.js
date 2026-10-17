"use strict";
module.exports = function (project, assert) {
    const path = require("path");
    const load = (name) => require(path.join(project, "src/utils", name));
    const fresh = (name) => { delete require.cache[require.resolve(path.join(project, "src/utils", name))]; return load(name); };
    const saved = { game: global.Game, memory: global.Memory };
    const modules = ["cpuAccounting", "cpuMeter", "cpuReport"].map((name) => {
        const file = require.resolve(path.join(project, "src/utils", name)); return { file, entry: require.cache[file] };
    });
    try {
        global.Memory = { settings: { stats: { cpuBalanceWindowTicks: 600, autoReportIntervals: 0 } } };
        global.Game = { time: 1000, shard: { name: "report-test" }, cpu: { limit: 20, bucket: 5000, getUsed: () => 8 } };
        const accounting = fresh("cpuAccounting");
        // Load the actual meter/reporter against this accounting instance.
        const meter = fresh("cpuMeter");
        let scans = 0;
        const range = meter.accountingRange;
        meter.accountingRange = (...args) => { scans++; return range(...args); };
        let report = fresh("cpuReport");
        let debit = 15;
        const tick = (time) => {
            Game.time = time; meter.beginTick(); meter.endTick();
            const result = report.poll();
            Game.cpu.bucket += Game.cpu.limit - debit;
            return result;
        };
        for (let t = 1000; t <= 1074; t++) tick(t);
        const request = report.arm(150);
        assert(request.fromTick === 1075 && request.toTick === 1224, "ARK-145: manual report starts at the next tick and fixes 150 origins");
        let early = null;
        debit = 10;
        for (let t = 1075; t <= 1151; t++) early = tick(t) || early;
        assert(early === null && !report.due(), "ARK-145: 74 old samples never make a 150-tick report print 77 ticks after arming");
        assert(scans === 0, "ARK-145: waiting never scans the ring or duplicates per-module collection");
        let result = null;
        for (let t = 1152; t <= 1225; t++) result = tick(t) || result;
        assert(result && result.complete && result.balance.ticks === 150 && result.balance.fromTick === 1075 && result.balance.toTick === 1224,
            "ARK-145: report closes only after next-tick finalization of all requested origins");
        assert(result && result.balance.used === 10 && result.balance.scriptUsed === 8 && result.balance.residual === 2 && !result.balance.includesReset,
            "ARK-145: isolated balance excludes old 15-CPU samples and preserves paired residual");
        assert(scans === 1 && result.balance.maxUsed === 10 && result.balance.headroom === 10,
            "ARK-145: one closing scan computes the scoped maximum and headroom");
        assert(accounting.snapshot().ticks > 150, "ARK-145: manual report never resets rolling telemetry");
        assert(tick(1226) === null, "ARK-145: manual report prints once");
        const memory = JSON.stringify(Memory);
        report.arm(3); tick(1227); report.arm(2); tick(1228); tick(1229); result = tick(1230);
        assert(result && result.balance.fromTick === 1228 && result.balance.toTick === 1229 && result.balance.ticks === 2,
            "ARK-145: rearm replaces the earlier request");
        assert(JSON.stringify(Memory) === memory, "ARK-145: report session and scoped sums stay out of Memory");
        report.arm(2); tick(1231); Memory.settings.terminalOps = { reuseOrderBook: false }; tick(1232); result = tick(1233);
        assert(result && !result.complete && !result.settingsMatch, "ARK-145: endpoint flag mismatch marks the comparison incomplete");
        Memory.settings.stats.cpuBalanceWindowTicks = 3;
        report.arm(100); tick(1234); tick(1235); tick(1236); result = tick(1237);
        assert(result && result.requestedTicks === 3 && result.balance.ticks === 3 && result.complete,
            "ARK-145: capacity clamp and ring rollover preserve exactly the requested new window");
        report.arm(2); tick(1238); result = tick(1240); tick(1241);
        assert(result && !result.complete && result.balance.missingTicks > 0,
            "ARK-145: a gap produces incomplete coverage without borrowing older data");
        Game.cpu.bucket = 10000;
        report.arm(1); tick(1242); result = tick(1243);
        assert(result && !result.complete && result.balance.validTicks === 0, "ARK-145: saturated bucket is unknown rather than known zero CPU");
        Game.cpu.bucket = 5000;
        report.arm(2); report = fresh("cpuReport");
        assert(tick(1244) === null && tick(1245) === null && tick(1246) === null, "ARK-145: reporter reload cancels manual session with auto disabled");
        report.arm(1);
        Game.time = 1247; accounting.begin(); Game.cpu.bucket += 10;
        Game.time = 1248; accounting.begin(); result = report.poll();
        assert(result && !result.complete && result.balance.validTicks === 1 && result.balance.missingEndTicks === 1,
            "ARK-145: missing endTick stays unpaired and cannot complete a report");
        report.arm(3); Game.time = 1200;
        result = report.poll();
        assert(result && result.cancelled && result.reason === "clock-rewind" && !report.due(),
            "ARK-145: clock rewind cancels instead of waiting for a stale future deadline");
        Memory.settings.stats.autoReportIntervals = 2;
        // A new global's accounting has a fresh real boot marker.
        fresh("cpuAccounting"); fresh("cpuMeter"); report = fresh("cpuReport");
        const autoMeter = load("cpuMeter");
        const autoTick = (t) => {
            Game.time = t; autoMeter.beginTick(); autoMeter.endTick();
            const out = report.poll(); Game.cpu.bucket += 10; return out;
        };
        const autoFirst = autoTick(2000); autoTick(2001); const autoEarly = autoTick(2002); result = autoTick(2003);
        assert(!autoFirst && !autoEarly && result && result.automatic && result.balance.fromTick === 2001 && !result.balance.includesReset,
            "ARK-145: automatic report measures only warm origins following the real boot");
        const cold = load("cpuAccounting").range(2000, 2002), empty = load("cpuAccounting").range(2004, 2005);
        assert(cold.includesReset && !cold.complete && empty.ticks === 0 && empty.used === null && !empty.complete,
            "ARK-145: explicit cold or missing ranges cannot be presented as complete warm evidence");
        Memory.settings.stats.cpuBalanceWindowTicks = Infinity;
        assert(report.arm(Infinity).requestedTicks === 600, "ARK-145: nonfinite counts/capacity use a finite bounded default");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory;
        for (const { file, entry } of modules) { if (entry) require.cache[file] = entry; else delete require.cache[file]; }
    }
};
