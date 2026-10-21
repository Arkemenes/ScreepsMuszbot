// ROADMAP 0157-A (ARK-140): live readiness context from energyReport + claims, and
// owner commitments so two consumers cannot spend the same balance.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory };
    const report = require(src("energyReport"));
    const claims = require(src("terminalClaims"));
    const tiers = require(src("resourceTiers"));
    const original = { report: report.report, subs: report.subwindowRates, pool: claims.physicalPool, floor: tiers.reserveFloor };
    try {
        global.Memory = { settings: {}, rooms: {} };
        global.Game = Object.assign({}, saved.game, { time: 5000, myRooms: [] });
        const room = { name: "ReadyRoom", controller: { level: 7, my: true } };
        let window = { coverage: 1, observedTicks: 1500, fromTick: 3500, toTick: 4999, storedDelta: 3000 };
        report.report = () => window;
        const subwindows = (rates, coverage = 1) => rates.map((rate) => ({ coverage, rate }));
        let subs = subwindows([2.5, 2, 3, 2.2, 2.8, 2.4]);
        report.subwindowRates = () => subs;
        let pool = 50000;
        claims.physicalPool = () => pool;
        tiers.reserveFloor = () => 10000;
        delete require.cache[require.resolve(src("readinessContext"))];
        const ctx = require(src("readinessContext"));
        const demand = (amount) => [{ commitmentId: "boost:demand", at: 0, amount }];

        let c = ctx.context(room, "boost:a");
        assert(c.localFree === 40000 && c.netRate === 2 && c.quality === "bounded" && c.regimeId === "ReadyRoom:rcl7",
            "0157 affine continuous supply: free = claim-free pool minus reserve floor, future supply = the slowest of the six subwindows (got " + JSON.stringify(c) + ")");
        subs = subwindows([2.5, 2, 3, 2.2, 2.8, 2.4]).map((s, i) => (i === 3 ? { coverage: 0.9, rate: 9 } : s));
        assert(ctx.context(room, "boost:a").quality === "insufficient" && ctx.evaluate(room, "boost:a", demand(1), 600).status === "unknown",
            "0157 affine continuous supply: one subwindow under minCoverageFraction (0.95) makes the evidence insufficient - unknown, not ready");
        subs = subwindows([2.5, 2, 3, 2.2, 2.8, 2.4]);
        assert(ctx.evaluate(room, "boost:a", demand(30000), 1500).status === "ready",
            "0157 delivery envelope: a demand under the free energy with the 20% margin is ready");
        assert(ctx.evaluate(room, "boost:a", demand(40000), 1500).status !== "ready",
            "0157 prefix demand: the same balance without margin room is not approved");

        ctx.commit("ReadyRoom", "boost:a", { amount: 30000, untilTick: 6000 });
        ctx.commit("ReadyRoom", "boost:a", { amount: 30000, untilTick: 6000 });
        assert(Object.keys(ctx.commitments("ReadyRoom")).length === 1 && ctx.context(room, "boost:a").localFree === 40000,
            "0157 concurrent admission: re-committing the same owner replaces it and does not count against itself");
        assert(ctx.context(room, "power:b").localFree === 10000 && ctx.evaluate(room, "power:b", demand(30000), 1500).status !== "ready",
            "0157 concurrent admission: another owner sees the balance minus the first owner's commitment");
        assert(ctx.release("ReadyRoom", "boost:a") && ctx.context(room, "power:b").localFree === 40000,
            "0157 owner recovery: releasing a commitment gives the balance back");
        ctx.commit("ReadyRoom", "boost:a", { amount: 30000, untilTick: 5001 });
        Game.time = 5001;
        assert(!ctx.commitments("ReadyRoom")["boost:a"], "0157 owner recovery: an expired commitment is pruned on read");

        // T2: validateAndSpend re-checks live, commits, submits; a failed intent gives the balance back
        window = Object.assign({}, window, { toTick: Game.time }); // fresh evidence (maxAgeTicks 1)
        let calls = 0;
        let spent = ctx.validateAndSpend(room, "boost:v", { amount: 20000, untilTick: 9000 }, () => { calls++; return OK; });
        assert(spent.ok && calls === 1 && ctx.commitments("ReadyRoom")["boost:v"].submittedTick === 5001 && ctx.context(room, "power:b").localFree === 20000,
            "0157 concurrent admission: validateAndSpend commits and submits, other owners see the balance taken (got " + JSON.stringify(spent) + ")");
        spent = ctx.validateAndSpend(room, "power:b", { amount: 30000 }, () => { calls++; return OK; });
        assert(!spent.ok && spent.status === "blocked" && calls === 1,
            "0157 concurrent admission: a second owner cannot spend what the first already holds - no intent is submitted (got " + JSON.stringify(spent) + ")");
        spent = ctx.validateAndSpend(room, "power:b", { amount: 5000 }, () => ERR_NOT_ENOUGH_RESOURCES);
        assert(!spent.ok && spent.status === "submit-failed" && !ctx.commitments("ReadyRoom")["power:b"],
            "0157 owner recovery: a synchronous intent error releases the reservation");
        spent = ctx.validateAndSpend(room, "boost:v", { amount: 10000 }, () => { throw new Error("boom"); });
        assert(!spent.ok && ctx.commitments("ReadyRoom")["boost:v"].amount === 20000,
            "0157 owner recovery: a failed re-submit restores the owner's previous commitment, never a double discount");
        ctx.release("ReadyRoom", "boost:v");

        window = { coverage: 0.4, observedTicks: 600, fromTick: 4400, toTick: 5000, storedDelta: 600 };
        const thin = ctx.evaluate(room, "boost:a", demand(1), 1500);
        assert(thin.status === "unknown" && thin.reasons[0] === "insufficient-evidence",
            "0157 delivery envelope: thin coverage after a reset answers unknown, never ready (got " + JSON.stringify(thin.reasons) + ")");

        window = { coverage: 1, observedTicks: 1500, fromTick: 3501, toTick: 5000, storedDelta: -15000 };
        subs = subwindows([-10, -12, -9, -11, -10, -8]);
        pool = 12000;
        c = ctx.context(room, "boost:a");
        assert(c.supplyRate === 0 && c.localFree === 2000 && ctx.evaluate(room, "boost:a", demand(5000), 1500).status !== "ready",
            "0157 delivery envelope: a draining room adds no future supply, so a demand above its free energy is refused");
    } finally {
        report.report = original.report;
        report.subwindowRates = original.subs;
        claims.physicalPool = original.pool;
        tiers.reserveFloor = original.floor;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
