"use strict";
module.exports = function (project, assert) {
    const path = require("path"), load = (file) => require(path.join(project, "src/utils", file));
    const readiness = load("operationalReadiness"), policy = load("boostPolicy");
    const base = () => ({ nowTick: 100, observedTick: 100, regimeId: "r1", horizonTicks: 600,
        localFree: 12, quality: "bounded", coverageFraction: 1, coveredHorizonTicks: 600,
        supply: [{ commitmentId: "net-link", at: 0, until: 600, rate: 1.2 }],
        demand: [{ commitmentId: "work", at: 0, until: 600, rate: 1 }] });
    let c = base(), r = readiness.evaluate(c);
    assert(r.status === "ready" && Math.abs(r.minimumSlack - 12) < 1e-8, "0157 prefix demand: local12 plus1.2/tick covers1/tick and20% margin for600ticks");
    c.supply[0].at = 20; c.supply[0].rate = 2;
    assert(readiness.evaluate(c).status === "blocked", "0157 delivery envelope: sufficient final balance cannot hide an early shortage");
    c = base(); c.localFree = 0;
    assert(readiness.evaluate(c).status === "ready", "0157 delivery envelope: zero stored buffer can pass with a sustainable bounded delivery rate");
    for (const margin of [0, 0.2, 0.5]) {
        c = base(); c.margin = margin;
        assert(readiness.evaluate(c).status === (margin === 0.5 ? "blocked" : "ready"), "0157 prefix demand: margin " + margin + " applies to every prefix");
    }
    c = base(); c.localFree = 0; c.supply = [{ commitmentId: "arrival", at: 10, amount: 1000 }];
    c.demand = [{ commitmentId: "load", at: 10, amount: 100 }];
    assert(readiness.evaluate(c).status === "ready", "0157 delivery envelope: simultaneous arrival and need are checked on both sides of the jump");
    c.demand[0].at = 9;
    assert(readiness.evaluate(c).status === "blocked", "0157 delivery envelope: late arrival is not credited before its boundary");
    for (const mutation of [x => { x.observedTick = 98; }, x => { x.observedTick = 101; },
        x => { x.coverageFraction = 0.94; }, x => { x.quality = "estimated"; },
        x => { x.coveredHorizonTicks = 100; }, x => { x.supply[0].rate = NaN; },
        x => { x.supply.push({ ...x.supply[0] }); }]) {
        c = base(); mutation(c);
        assert(readiness.evaluate(c).status === "unknown", "0157 delivery envelope: invalid/stale/uncovered or duplicated inputs stay unknown");
    }
    c = base(); c.supply = Array.from({ length: 16 }, (_, i) => ({ commitmentId: "s" + i, at: i + 1, amount: 1 }));
    assert(readiness.evaluate(c).reasons[0] === "boundary-budget", "0157 prefix demand: excess boundaries are never silently truncated");
    const context = () => ({ nowTick: 100, body: Array.from({ length: 14 }, () => ({ type: "work", hits: 100 })),
        ttl: 1000, delayTicks: 10, constants: { boosts: { work: { XLH2O: { build: 2, repair: 2 } } },
            mineralPerPart: 30, energyPerPart: 20, toughType: "tough", workType: "work", buildPower: 5, repairPower: 100, repairCost: 0.01 },
        evidence: { observedTick: 100, kind: "bounded", demandAssigned: true },
        costs: { energyUnitValue: 1, logisticsEnergy: 0, logisticsCredits: 0, labOpportunityCredits: 0 },
        compoundOpportunity: { observedTick: 100, validUntilTick: 101, executable: true, quantity: 420, netUnitValue: 0.01 },
        delivery: { observedTick: 100, regimeId: "r1", localFree: 100000, supply: [], quality: "bounded", coverageFraction: 1, coveredHorizonTicks: 1000 },
        actions: [{ action: "build", demand: 10000, duty: 1, energyPerActionTick: 70, valuePerEffect: 1, mode: "fixed" }] });
    c = context(); const unchanged = JSON.stringify(c); r = policy.worth("builder", "XLH2O", c);
    assert(r.worth && r.kind === "estimated" && r.actions[0].normal.work === 10000 && r.actions[0].boost.work === 10000,
        "0149 realizable benefit: fixed work compares identical completed demand");
    assert(r.grossBenefit === r.actions[0].normal.energy - r.actions[0].boost.energy && r.cost === 284.2,
        "0149 realizable benefit: fixed energy savings never also count more throughput or free compound");
    assert(JSON.stringify(c) === unchanged, "0149 realizable benefit: pure model leaves body and context unchanged");
    c.actions[0].demand = 20;
    assert(!policy.worth("builder", "XLH2O", c).worth, "0149 realizable benefit: a tiny job cannot pay for fourteen boosted parts");
    for (const energy of [20, 31.6, 70]) {
        c = context(); c.actions[0] = { ...c.actions[0], demand: 1000000, mode: "capacity", energyPerActionTick: energy };
        r = policy.worth("builder", "XLH2O", c);
        assert(r.worth && r.actions[0].normal.work === Math.floor(energy) * 1000 &&
            r.actions[0].boost.work === (Math.floor(energy) + 70) * 990,
            "0149 realizable benefit: E=" + energy + " uses partial engine effect and loses preparation ticks");
        assert(r.grossBenefit === r.actions[0].boost.work - r.actions[0].normal.work,
            "0149 realizable benefit: capacity mode credits only additional useful units E=" + energy);
    }
    c.delayTicks = 900;
    assert(!policy.worth("builder", "XLH2O", c).worth, "0149 realizable benefit: late preparation can erase all additional useful capacity");
    c = context(); c.ttl = 2; c.delayTicks = 2;
    assert(policy.worth("builder", "XLH2O", c).reason === "no-productive-life", "0149 realizable benefit: no useful TTL blocks the boost");
    c = context(); c.delivery.localFree = 0;
    assert(policy.worth("builder", "XLH2O", c).status === "blocked", "0149 realizable benefit: favorable return without accessible application energy is blocked");
    c.delivery.supply = [{ commitmentId: "arrives-late", at: 1, amount: 100000 }];
    assert(policy.worth("builder", "XLH2O", c).status === "blocked", "0149 realizable benefit: late fuel cannot fund the initial application");
    c = context(); c.delivery.localFree = 400; c.delivery.supply = [{ commitmentId: "net-links", at: 0, until: 1000, rate: 100 }];
    assert(policy.worth("builder", "XLH2O", c).worth, "0149 realizable benefit: bounded net delivery can sustain work without a large warehouse");
    c = context(); c.actions[0].action = "upgrade";
    assert(!policy.worth("builder", "XLH2O", c).worth && !policy.worth("upgrader", "XLH2O", context()).worth,
        "0149 realizable benefit: XLH2O cannot approve upgrade or nonpilot roles");
    c = context(); c.actions[0].duty = 0;
    assert(!policy.worth("builder", "XLH2O", c).worth, "0149 realizable benefit: no duty never becomes implicit duty one");
    c = context(); c.actions.push({ ...c.actions[0], action: "repair", duty: 0.1 });
    assert(policy.worth("builder", "XLH2O", c).reason === "overlapping-work-duty", "0149 realizable benefit: build and repair cannot spend the same WORK tick twice");
    for (const mutation of [x => { delete x.evidence; }, x => { x.evidence.observedTick = 98; },
        x => { x.compoundOpportunity.executable = false; }, x => { x.compoundOpportunity.validUntilTick = 99; },
        x => { x.compoundOpportunity.quantity = 419; }, x => { x.costs.labOpportunityCredits = NaN; },
        x => { x.actions[0].demand = Infinity; }]) {
        c = context(); mutation(c);
        assert(policy.worth("builder", "XLH2O", c).status === "unknown", "0149 realizable benefit: missing executable costs, demand or evidence never approve");
    }
    c = context(); c.body[13].hits = 0;
    assert(!policy.worth("builder", "XLH2O", c).worth, "0149 realizable benefit: dead selected parts block the pilot even when the theoretical return is positive");
    c = context(); r = policy.worth("builder", "XLH2O", c);
    const targetCost = r.grossBenefit / 1.15;
    c.costs.labOpportunityCredits = targetCost - r.cost;
    assert(!policy.worth("builder", "XLH2O", c).worth, "0149 realizable benefit: entry requires configured20% return margin");
    c.previouslyApproved = true;
    assert(policy.worth("builder", "XLH2O", c).worth, "0149 realizable benefit: continuing a prepared boost uses10% hysteresis without repeating sunk gains");
};
