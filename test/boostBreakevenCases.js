// ROADMAP 0154 T4 (ARK-133): builder boost break-even from energyReport evidence through
// boostPolicy.worth, with live prices and the readiness delivery gate.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory, mineral: global.LAB_BOOST_MINERAL, energy: global.LAB_BOOST_ENERGY };
    const report = require(src("energyReport")), census = require(src("census")), market = require(src("market"));
    const readinessContext = require(src("readinessContext")), policy = require(src("boostPolicy"));
    const original = { context: report.context, byRole: census.creepsByRole, snapshot: market.snapshot, delivery: readinessContext.delivery };
    try {
        global.LAB_BOOST_MINERAL = 30; global.LAB_BOOST_ENERGY = 20;
        global.Memory = { settings: {}, rooms: {} };
        global.Game = Object.assign({}, saved.game, { time: 7000 });
        const part = (type) => ({ type, hits: 100 });
        const body = [].concat(Array(10).fill(WORK), Array(10).fill(CARRY), Array(10).fill(MOVE)).map(part);
        let builders = [{ name: "b1", body }];
        let window = { observedTicks: 1500, utilization: { builder: { workAlive: 10 } }, spend: { build: 37500 } };
        let snap = { resources: { energy: { fairPrice: 33 }, LH: { fairPrice: 600, sellPrice: 650 } } };
        report.context = () => window;
        census.creepsByRole = () => builders;
        market.snapshot = () => snap;
        readinessContext.delivery = () => ({ nowTick: 7000, observedTick: 7000, regimeId: "B:rcl8", quality: "bounded", coverageFraction: 1,
            coveredHorizonTicks: 1500, localFree: 1e6, supply: [], margin: 0.2, minCoverageFraction: 0.9, maxAgeTicks: 1 });
        delete require.cache[require.resolve(src("boostBreakeven"))];
        const be = require(src("boostBreakeven"));
        const room = { name: "B" };

        const ev = be.actionEvidence("B", body, 1500, require(src("boostConstants")).current());
        assert(ev && ev.actions.length === 1 && ev.actions[0].action === "build" && ev.actions[0].duty === 0.5 &&
            ev.actions[0].demand === 37500 - 50 && ev.actions[0].energyPerActionTick === 50,
            "0154 break-even evidence: builder duty = build energy / BUILD_POWER / builder WORK-ticks, demand = observed work over a life (got " + JSON.stringify(ev) + ")");
        const r = be.evaluate(room, "LH");
        assert(r.status === "ready" && r.breakevenPrice > 0 && r.marketPrice === 650 && r.worthAtMarket === (650 <= r.breakevenPrice),
            "0154 break-even: a ready evaluation gives the compound price at which the boost still pays (got " + JSON.stringify(r) + ")");
        const { ctx } = be.buildContext(room, "LH");
        const at = (p) => policy.worth("builder", "LH", Object.assign({}, ctx, { compoundOpportunity: Object.assign({}, ctx.compoundOpportunity, { netUnitValue: p }) }));
        assert(at(r.breakevenPrice * 0.99).status === "ready" && at(r.breakevenPrice * 1.01).status === "blocked",
            "0154 break-even: worth() approves just under the break-even price and refuses just above it");
        snap = { resources: { energy: { fairPrice: 66 }, LH: { fairPrice: 600, sellPrice: 650 } } };
        assert(be.evaluate(room, "LH").breakevenPrice > r.breakevenPrice * 1.9,
            "0154 break-even: dynamic - energy twice as expensive roughly doubles what the saved energy is worth");
        snap = null;
        assert(be.evaluate(room, "LH").reason === "price-unknown", "0154 break-even: no market price, no verdict (unknown)");
        snap = { resources: { energy: { fairPrice: 33 } } };
        window = null;
        assert(be.evaluate(room, "LH").reason === "no-action-evidence", "0154 break-even: without energyReport coverage there is no evidence (unknown)");
        window = { observedTicks: 1500, utilization: { builder: { workAlive: 10 } }, spend: { build: 37500 } };
        builders = [];
        assert(be.evaluate(room, "LH").reason === "no-builder", "0154 break-even: no builder to boost, nothing to price");
        builders = [{ name: "b1", body }];
        readinessContext.delivery = () => ({ nowTick: 7000, observedTick: 7000, regimeId: "B:rcl8", quality: "insufficient", coverageFraction: 0.3,
            coveredHorizonTicks: 400, localFree: 1e6, supply: [], margin: 0.2, minCoverageFraction: 0.9, maxAgeTicks: 1 });
        assert(be.evaluate(room, "LH").status === "unknown", "0154 break-even: readiness without bounded evidence keeps the verdict unknown");
    } finally {
        report.context = original.context; census.creepsByRole = original.byRole; market.snapshot = original.snapshot;
        readinessContext.delivery = original.delivery;
        if (saved.mineral === undefined) delete global.LAB_BOOST_MINERAL; else global.LAB_BOOST_MINERAL = saved.mineral;
        if (saved.energy === undefined) delete global.LAB_BOOST_ENERGY; else global.LAB_BOOST_ENERGY = saved.energy;
        global.Game = saved.game; global.Memory = saved.memory;
    }
};
