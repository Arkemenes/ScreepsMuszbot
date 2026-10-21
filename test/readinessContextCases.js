// ROADMAP 0157-A (ARK-140): live readiness context from energyReport + claims, and
// owner commitments so two consumers cannot spend the same balance.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory };
    const report = require(src("energyReport"));
    const claims = require(src("terminalClaims"));
    const tiers = require(src("resourceTiers"));
    const original = { report: report.report, pool: claims.physicalPool, floor: tiers.reserveFloor };
    try {
        global.Memory = { settings: {}, rooms: {} };
        global.Game = Object.assign({}, saved.game, { time: 5000, myRooms: [] });
        const room = { name: "ReadyRoom", controller: { level: 7, my: true } };
        let window = { coverage: 1, observedTicks: 1500, fromTick: 3500, toTick: 4999, storedDelta: 3000 };
        report.report = () => window;
        let pool = 50000;
        claims.physicalPool = () => pool;
        tiers.reserveFloor = () => 10000;
        delete require.cache[require.resolve(src("readinessContext"))];
        const ctx = require(src("readinessContext"));
        const demand = (amount) => [{ commitmentId: "boost:demand", at: 0, amount }];

        let c = ctx.context(room, "boost:a");
        assert(c.localFree === 40000 && Math.abs(c.netRate - 3000 / 1499) < 1e-9 && c.quality === "bounded" && c.regimeId === "ReadyRoom:rcl7",
            "0157 delivery envelope: free = claim-free pool minus reserve floor, net rate from the stored delta (got " + JSON.stringify(c) + ")");
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

        window = { coverage: 0.4, observedTicks: 600, fromTick: 4400, toTick: 5000, storedDelta: 600 };
        const thin = ctx.evaluate(room, "boost:a", demand(1), 1500);
        assert(thin.status === "unknown" && thin.reasons[0] === "insufficient-evidence",
            "0157 delivery envelope: thin coverage after a reset answers unknown, never ready (got " + JSON.stringify(thin.reasons) + ")");

        window = { coverage: 1, observedTicks: 1500, fromTick: 3501, toTick: 5000, storedDelta: -15000 };
        pool = 12000;
        c = ctx.context(room, "boost:a");
        assert(c.supplyRate === 0 && c.localFree === 2000 && ctx.evaluate(room, "boost:a", demand(5000), 1500).status !== "ready",
            "0157 delivery envelope: a draining room adds no future supply, so a demand above its free energy is refused");
    } finally {
        report.report = original.report;
        claims.physicalPool = original.pool;
        tiers.reserveFloor = original.floor;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
