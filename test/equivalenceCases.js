// ROADMAP 0145: the CPU ruler (profile tick count, cold-start flags, aggregate max),
// the shadow budget and the offline equivalence oracle.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const fresh = (n) => { delete require.cache[require.resolve(src(n))]; return require(src(n)); };
    const saved = { game: global.Game, memory: global.Memory, log: console.log };
    const clock = { used: 0 };
    const useGame = (time, extra) => {
        global.Game = Object.assign({}, saved.game, { time, cpu: Object.assign({ getUsed: () => clock.used, bucket: 10000, limit: 20 }, extra) });
    };
    try {
        // --- AC1: profile output counts the ticks it really accumulated
        const profiler = require(src("profiler"));
        global.Memory = { settings: {} };
        console.log = () => {};
        useGame(1000);
        profiler.enable();
        profiler.wrap(() => {});
        Game.profiler.profile(100);
        for (let t = 1001; t <= 1100; t++) { useGame(t); profiler.wrap(() => {}); }
        const out = profiler.output();
        profiler.disable();
        console.log = saved.log;
        assert(/Ticks: 100\b/.test(out), "0145: profile output counts 100 ticks for a 100-tick session");

        // --- AC2/AC3: cold start flags and aggregate max, heap only
        global.Memory = { settings: { stats: { cpuBalanceWindowTicks: 5, cpuWindowTicks: 600 } } };
        const accounting = fresh("cpuAccounting"), meter = fresh("cpuMeter");
        const memBefore = JSON.stringify(Memory);
        let bucket = 9000;
        const tick = (t, used, debit) => {
            useGame(t, { bucket, limit: 20 });
            clock.used = 0;
            meter.beginTick();
            clock.used = used;
            meter.endTick();
            bucket = bucket + 20 - debit; // what the next tick's begin() will read
        };
        tick(500, 100, 150); // the cold tick
        for (let t = 501; t <= 504; t++) tick(t, 10, 12);
        useGame(505, { bucket, limit: 20 });
        meter.beginTick();
        const early = meter.accounting();
        assert(early.includesReset === true && early.bootTick === 500,
            "0145: window containing the boot tick is flagged includesReset");
        assert(early.coldUsed === 150 && early.warmUsed === 12 && early.maxUsed === 150,
            "0145: cold sample excluded from warmUsed");
        const live = meter.live();
        assert(live.maxTick === 100 && live.includesReset === true,
            "0145: aggregate per-tick max and includesReset in the meter window");
        for (let t = 505; t <= 512; t++) tick(t, 10, 12);
        useGame(513, { bucket, limit: 20 });
        meter.beginTick();
        const late = meter.accounting();
        assert(late.includesReset === false && late.coldUsed === null && late.maxUsed === 12 && late.warmUsed === 12,
            "0145: once the cold sample leaves the window the baseline is clean");
        assert(JSON.stringify(Memory) === memBefore, "0145: aggregate max stays out of Memory");

        // --- AC5: shadow budget
        global.Memory = { settings: {} };
        useGame(2000);
        let shadow = fresh("shadowBudget"), runs = 0;
        assert(shadow.run("x", () => { runs++; }).ran === false && runs === 0, "0145: shadow off by default");
        global.Memory = { settings: { shadow: { enabled: true, minBucket: 9000, maxCpuPerTick: 0.5 } } };
        shadow = fresh("shadowBudget");
        useGame(2001, { bucket: 5000 });
        assert(shadow.run("x", () => { runs++; }).ran === false, "0145: shadow needs a healthy bucket");
        useGame(2002, { bucket: 10000 });
        assert(shadow.run("x", () => { runs++; return 1; }).ran === true && runs === 1, "0145: shadow runs when enabled");
        assert(shadow.run("x", () => { runs++; }).ran === false && runs === 1, "0145: shadow runs a name once per tick");
        const thrown = shadow.run("y", () => { throw new Error("boom"); });
        assert(thrown.ran === true && thrown.error === "boom", "0145: shadow contains a failing reference");
        let step = 0;
        useGame(2003, { bucket: 10000, getUsed: () => (step += 0.6) });
        shadow.run("z", () => {});
        useGame(2004, { bucket: 10000 });
        assert(shadow.run("z", () => { runs++; }).ran === false && shadow.status().tripped === true,
            "0145: shadow stops past its CPU cap");
        shadow.diverged("z", "a".repeat(500));
        assert(shadow.status().divergences === 1 && shadow.status().sample.detail.length === 200,
            "0145: shadow keeps only a bounded divergence summary");

        // --- AC4: equivalence oracle
        const { compareImplementations } = require(path.join(project, "test/equivalence/compare.js"));
        const worlds = [{ stock: { a: 5, b: 3 } }, { stock: { a: 0, b: 9 } }];
        const reference = (w) => ({ intents: Object.keys(w.stock).filter((k) => w.stock[k] > 0), n: 1 });
        const same = compareImplementations(reference, (w) => ({ n: 1, intents: Object.keys(w.stock).reverse().reverse().filter((k) => w.stock[k] > 0) }), worlds);
        assert(same.equal === true, "0145: identical candidate passes compareImplementations (key order ignored)");
        const different = compareImplementations(reference, (w) => ({ intents: Object.keys(w.stock), n: 1 }), worlds);
        assert(different.equal === false && different.divergences.length === 1 && different.divergences[0].index === 1,
            "0145: divergent candidate fails compareImplementations");
        const errors = compareImplementations(reference, () => { throw new Error("x"); }, worlds);
        assert(errors.equal === false, "0145: a candidate that throws where the reference does not is a divergence");
        require("./equivalenceOracleCases")(project, assert);

        // --- ordersAudit: fee estimate, age and distance to the best competitor
        {
            const audit = fresh("ordersAudit");
            useGame(100000);
            Game.market = { orders: {
                a: { id: "a", type: "sell", resourceType: "X", roomName: "R1", price: 120, remainingAmount: 1000, totalAmount: 1000, active: true, created: 100000 - 21000 * 10, createdTimestamp: Date.now() - 10 * 86400000 },
                b: { id: "b", type: "sell", resourceType: "X", roomName: "R1", price: 100, remainingAmount: 500, totalAmount: 500, active: true, created: 100000 - 100 },
                c: { id: "c", type: "sell", resourceType: "H", roomName: "R1", price: 9, remainingAmount: 0, totalAmount: 400, active: false, created: 100000 - 5000 },
            }, getAllOrders: () => [
                { id: "a", type: "sell", resourceType: "X", price: 120, remainingAmount: 1000 }, { id: "b", type: "sell", resourceType: "X", price: 100, remainingAmount: 500 },
                { id: "z", type: "sell", resourceType: "X", price: 100, remainingAmount: 300 }, { id: "y", type: "sell", resourceType: "X", price: 90, remainingAmount: 0 },
            ] };
            const out = audit.audit({ gap: 0.05, days: 7 });
            assert(out.summary.orders === 3 && out.summary.active === 2 && out.summary.finished === 1, "0151: ordersAudit separates active from finished orders");
            assert(out.summary.aboveMarket === 1 && out.summary.feeOnAboveMarket === 6000 && out.worst[0][3] === 120 && out.worst[0][4] === 100,
                "0151: ordersAudit flags a SELL priced 20% above the best competing ask and estimates its 5% fee (" + JSON.stringify(out.summary) + ")");
            assert(out.summary.olderThanDays === 1, "0151: ordersAudit counts listings older than the limit");
        }

        // --- console: cpuReport arms, the audits are real functions
        if (typeof global.cpuReport === "function") {
            const lines = [];
            console.log = (...a) => { lines.push(a.join(" ")); };
            global.Memory = { settings: {}, rooms: { A: { lastVisit: 1, x: [1, 2] } } };
            useGame(3000);
            global.cpuReport(600);
            global.cpuAuditRoomFields();
            const hadRaw = typeof global.RawMemory === "object" && typeof global.RawMemory.get === "function";
            if (hadRaw) global.cpuAuditMemory();
            console.log = saved.log;
            assert(/\[cpuReport\] armed: prints after 600 new ticks/.test(lines[0]),
                "0145: cpuReport arms and caps at the balance window");
            assert(/\[cpuAuditRoomFields\].*"lastVisit"/.test(lines[1]), "0145: cpuAuditRoomFields is a real console function");
            if (hadRaw) assert(/\[cpuAuditMemory\].*"rawChars"/.test(lines[2]), "0145: cpuAuditMemory is a real console function");
        }
    } finally {
        console.log = saved.log;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
