// ROADMAP 0149/0152 follow-up: energy-ledger credits follow the engine (read from screeps/engine on
// 2026-10-15): boosts add progress/hits but never energy; repair costs hits x REPAIR_COST.
module.exports = function (project, assert) {
    const path = require("path");
    const ledger = require(path.join(project, "src/utils/energyLedger"));
    const body = (n, boost) => Array.from({ length: n }, () => ({ type: WORK, hits: 100, boost }));
    const creep = (parts, energy, room) => ({ body: parts, store: { [RESOURCE_ENERGY]: energy }, room: { name: room } });
    const total = (room, category) => ledger.snapshot(room)[category] || 0;
    const spend = (room, category, run) => { const before = total(room, category); run(); return total(room, category) - before; };

    // build: 5 energy per WORK part, boosted or not
    const plain = spend("LedgerEngineA", "build", () => ledger.creditBuild(creep(body(10), 500, "LedgerEngineA"), { progress: 0, progressTotal: 10000 }));
    const boosted = spend("LedgerEngineB", "build", () => ledger.creditBuild(creep(body(10, "XLH2O"), 500, "LedgerEngineB"), { progress: 0, progressTotal: 10000 }));
    assert(plain === 50 && boosted === 50, "energy ledger: a boosted builder spends the same energy as an unboosted one (" + plain + " vs " + boosted + ")");

    // upgrade: 1 energy per WORK part
    const up = spend("LedgerEngineC", "upgrade", () => ledger.creditUpgrade(creep(body(15, "XGH2O"), 300, "LedgerEngineC"), {}));
    assert(up === 15, "energy ledger: upgrading costs 1 energy per WORK part, boost or not (" + up + ")");

    // repair: 100 hits per WORK part cost 1 energy per WORK part (0.01 per hit), not 100
    const repair = spend("LedgerEngineD", "repairNormal", () => ledger.creditRepair(creep(body(5), 200, "LedgerEngineD"),
        { structureType: STRUCTURE_ROAD, hits: 1000, hitsMax: 5000 }));
    const repairBoosted = spend("LedgerEngineE", "repairNormal", () => ledger.creditRepair(creep(body(5, "XLH2O"), 200, "LedgerEngineE"),
        { structureType: STRUCTURE_ROAD, hits: 1000, hitsMax: 5000 }));
    assert(repair === 5 && repairBoosted === 5, "energy ledger: repair costs 1 energy per WORK part, boost or not (" + repair + " / " + repairBoosted + ")");

    // capped by what is left to repair (3 missing hits -> ceil(0.03) = 1 energy) and by the energy carried
    const tiny = spend("LedgerEngineF", "repairNormal", () => ledger.creditRepair(creep(body(5), 200, "LedgerEngineF"),
        { structureType: STRUCTURE_ROAD, hits: 4997, hitsMax: 5000 }));
    const dry = spend("LedgerEngineG", "repairNormal", () => ledger.creditRepair(creep(body(5), 2, "LedgerEngineG"),
        { structureType: STRUCTURE_ROAD, hits: 0, hitsMax: 5000 }));
    assert(tiny === 1 && dry === 2, "energy ledger: repair is capped by the damage left and by the energy carried (" + tiny + " / " + dry + ")");
};
