// ROADMAP 0150 T1 (ARK-137): process power into GPL while the payback of the next milestone stays
// within power.maxPaybackDays (90), from live prices and the labReport's observed reactions.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory };
    const market = require(src("market")), labReport = require(src("labReport")), labReactions = require(src("labReactions"));
    const tiers = require(src("resourceTiers"));
    const original = { snapshot: market.snapshot, summary: labReport.summary, list: labReactions.list, shortfall: tiers.supplyShortfall };
    try {
        global.Memory = { settings: {}, rooms: {} };
        const room = { name: "PW" };
        global.Game = Object.assign({}, saved.game, { time: 100000, myRooms: [room], gpl: { level: 0, progress: 0, progressTotal: 1000 } });
        let prices = { power: { fairPrice: 2350, buyPrice: 2300 }, energy: { fairPrice: 33 }, XLH2O: { fairPrice: 1540 }, LH2O: { fairPrice: 888 }, X: { fairPrice: 252 } };
        market.snapshot = () => (prices ? { resources: prices } : null);
        let lab = { outputLabs: 6.5, confirmedPerTick: 1.14, amountPerTick: 1.14 };
        labReport.summary = () => lab;
        labReactions.list = () => [{ a: "X", b: "LH2O", product: "XLH2O" }];
        let shortfall = null;
        tiers.supplyShortfall = () => shortfall;
        delete require.cache[require.resolve(src("powerEconomics"))];
        const pe = require(src("powerEconomics"));

        let v = pe.evaluate();
        const reactionsPerLab = 1.14 / 5 / 6.5, benefit = 2 * 2 * (1540 - 888 - 252) * reactionsPerLab * 25000;
        assert(v.status === "process" && v.target === 3 && v.points === 9000 && v.pointCost === 2300 + 50 * 33 &&
            Math.abs(v.benefitPerDay - benefit) < 1e-6 && Math.abs(v.paybackDays - 9000 * 3950 / benefit) < 1e-6,
            "0150 dynamic target: GPL 0 -> 3 costs 9000 power at bid + 50 energy each, paid back by OPERATE_LAB on 2 labs at the best live margin (got " + JSON.stringify(v) + ")");
        prices.XLH2O.fairPrice = 1200; // margin 60
        v = pe.evaluate();
        assert(v.status === "hold" && v.reason === "payback-too-long" && v.paybackDays > 90,
            "0150 dynamic target: a thinner reaction margin pushes the payback past 90 days and processing holds");
        prices.XLH2O.fairPrice = 1540;
        Game.gpl = { level: 3, progress: 2000, progressTotal: 7000 };
        v = pe.evaluate();
        assert(v.target === 4 && v.points === 16000 - (9000 + 2000) && v.status === "process",
            "0150 hysteresis: past the milestone the next level is judged on its own, no fixed GPL cap (got " + JSON.stringify(v) + ")");
        Game.gpl = { level: 20, progress: 0, progressTotal: 41000 };
        assert(pe.evaluate().status === "hold", "0150 dynamic target: quadratic GPL cost makes processing stop by itself at high levels");
        Game.gpl = { level: 0, progress: 0, progressTotal: 1000 };

        prices = null;
        pe.reset();
        assert(pe.verdict().status === "unknown" && pe.allows(room) === true,
            "0150 dynamic target: without prices the verdict is unknown and processing continues (user decision)");
        shortfall = "reserve";
        assert(pe.allows(room) === false, "0150 off stocked spawn: a supply shortfall pauses feeding and processPower");
        shortfall = null;
        prices = { power: { fairPrice: 2350, buyPrice: 2300 }, energy: { fairPrice: 33 }, XLH2O: { fairPrice: 1000 }, LH2O: { fairPrice: 888 }, X: { fairPrice: 252 } };
        Game.time += 10;
        assert(pe.verdict().status === "unknown", "0150 dynamic target: the verdict is cached for power.checkTicks");
        Game.time += 600;
        assert(pe.verdict().status === "unknown" || pe.verdict().reason === "no-lab-evidence",
            "0150 dynamic target: a non-positive margin is no lab evidence (unknown, not process)");
        prices.XLH2O.fairPrice = 1200; Game.time += 600;
        assert(pe.allows(room) === false && pe.summary().status === "hold", "0150 dynamic target: a hold verdict stops feeding and processing");
        Memory.settings.power = { economicGate: false };
        assert(pe.allows(room) === true, "0150 dynamic target: power.economicGate false restores unconditional processing");
    } finally {
        market.snapshot = original.snapshot; labReport.summary = original.summary; labReactions.list = original.list;
        tiers.supplyShortfall = original.shortfall;
        global.Game = saved.game; global.Memory = saved.memory;
    }
};
