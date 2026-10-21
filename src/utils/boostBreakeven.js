"use strict";
// ROADMAP 0154 T4 (ARK-133): what a builder boost is worth in this room right now, from what the
// room observably does - the evidence utils/boostPolicy.worth needs and nothing else supplied.
//
// actionEvidence(room, body, ttl) turns energyReport's window into the builder's action model:
//   duty_a    (energy spent on a / e_a) / builder WORK-ticks   (e_build = BUILD_POWER, e_repair = 1)
//   demand_a  this creep's share (its WORK / all builder WORK) of the effect the room absorbed
//             over its life: energy/tick x effect per energy (build: 1 progress, repair:
//             1 / REPAIR_COST hits) x ttl, floored one call short so the unboosted projection
//             can always realize it
//   energyPerActionTick  WORK x e_a (one call's energy at full rate)
// Every action is "fixed" (the observed work, done with less energy): benefit = energy saved at the
// energy fairPrice. No window coverage, no builder or no build/repair energy -> null (unknown).
//
// evaluate(room, compound) runs worth() with the compound at price 0 - cost is linear in the price,
// so the break-even is closed form: p* = (gross / (1 + minReturnRatio) - other costs) / mineral.
// Delivery comes from readinessContext (six covered subwindows or unknown); prices from the live
// market snapshot every call (resource values move a lot). Descriptive: it never boosts anything.
const config = require("./config");
const energyReport = require("./energyReport");
const boostPolicy = require("./boostPolicy");
const boostConstants = require("./boostConstants");
const census = require("./census");
const market = require("./market");

function price(resources, type, field) {
    const r = resources && resources[type];
    const v = r && r[field];
    return typeof v === "number" && isFinite(v) && v > 0 ? v : null;
}

function actionEvidence(roomName, body, ttl, constants) {
    const r = energyReport.context(roomName);
    const util = r && r.utilization && r.utilization.builder;
    if (!r || !util || !(util.workAlive > 0)) return null;
    const builderWorkTicks = util.workAlive * r.observedTicks;
    const work = body.filter((p) => p.type === constants.workType).length;
    const repairEnergy = (r.spend.repairNormal || 0) + (r.spend.repairRampart || 0) + (r.spend.repairWall || 0);
    const actions = [];
    for (const [action, energy, e, effectPerEnergy] of [
        ["build", r.spend.build || 0, constants.buildPower, 1],
        ["repair", repairEnergy, 1, constants.repairPower / (constants.repairPower * constants.repairCost)],
    ]) {
        if (!(energy > 0)) continue;
        const duty = Math.min(1, energy / e / builderWorkTicks);
        const share = Math.min(1, work / util.workAlive);
        const perCall = work * e * effectPerEnergy;
        const demand = Math.floor((energy / r.observedTicks) * effectPerEnergy * ttl * share - perCall);
        if (demand < 1) continue;
        actions.push({ action, mode: "fixed", duty, valuePerEffect: 0, energyPerActionTick: work * e, demand });
    }
    if (!actions.length) return null;
    const duty = actions.reduce((sum, a) => sum + a.duty, 0);
    if (duty > 1) actions.forEach((a) => { a.duty = a.duty / duty; }); // overlap capped at full time
    return { actions, observedTicks: r.observedTicks, builderWork: util.workAlive };
}

// the worth() context for compound at price 0, or { fail: reason }
function buildContext(room, compound) {
    const fail = (reason) => ({ fail: reason });
    const constants = boostConstants.current();
    if (!constants.workType) return fail("missing-constants");
    const builders = census.creepsByRole(room.name, "builder");
    const creep = builders.find((c) => c.body && c.body.length) || null;
    if (!creep) return fail("no-builder");
    const ttl = Number(config.get("boost.breakevenTtl", 1500));
    const delayTicks = Number(config.get("boost.breakevenDelayTicks", 50));
    const evidence = actionEvidence(room.name, creep.body, ttl, constants);
    if (!evidence) return fail("no-action-evidence");
    const snap = market.snapshot();
    const resources = snap && snap.resources;
    const energyPrice = price(resources, RESOURCE_ENERGY, "fairPrice");
    if (energyPrice === null) return fail("price-unknown");
    const body = creep.body.map((p) => ({ type: p.type, hits: p.hits > 0 ? p.hits : 100, boost: p.boost }));
    const ctx = {
        constants, body, ttl, delayTicks, nowTick: Game.time, count: undefined, actions: evidence.actions,
        evidence: { kind: "bounded", observedTick: Game.time, demandAssigned: true },
        costs: { energyUnitValue: energyPrice, logisticsEnergy: 0, logisticsCredits: 0, labOpportunityCredits: 0 },
        compoundOpportunity: { netUnitValue: 0, quantity: body.length * (constants.mineralPerPart || 30),
            observedTick: Game.time, validUntilTick: Game.time, executable: true },
        delivery: require("./readinessContext").delivery(room, "breakeven:" + room.name, ttl),
        minReturnRatio: config.get("boost.minReturnRatio", 0.20),
    };
    return { ctx, evidence, energyPrice, resources };
}

function evaluate(room, compound) {
    const fail = (reason) => ({ status: "unknown", reason, compound });
    const built = buildContext(room, compound);
    if (built.fail) return fail(built.fail);
    const { ctx, evidence, energyPrice, resources } = built;
    const w = boostPolicy.worth("builder", compound, ctx);
    if (!Number.isFinite(w.grossBenefit)) return Object.assign(fail(w.reason || "not-evaluable"), { readiness: w.readiness && w.readiness.status });
    const margin = Number(ctx.minReturnRatio);
    const mineral = w.selection.requiredMineral;
    const breakeven = mineral > 0 ? Math.max(0, (w.grossBenefit / (1 + margin) - w.cost) / mineral) : null;
    const fair = price(resources, compound, "fairPrice"), ask = price(resources, compound, "sellPrice");
    const marketPrice = ask !== null ? ask : fair;
    return { status: "ready", compound, breakevenPrice: breakeven, marketPrice, worthAtMarket: marketPrice !== null && breakeven !== null && marketPrice <= breakeven,
        grossBenefit: w.grossBenefit, otherCost: w.cost, parts: w.selection.bodyPartsCount, mineral, energyPrice,
        duty: Object.fromEntries(evidence.actions.map((a) => [a.action, a.duty])) };
}

function round(v, d) { return v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d; }

// compact per-compound numbers for Memory.stats
function summary(room) {
    const out = {};
    for (const compound of config.get("boost.breakevenCompounds", ["XLH2O", "LH2O", "LH"])) {
        const e = evaluate(room, compound);
        out[compound] = e.status === "ready"
            ? { breakeven: round(e.breakevenPrice, 1), market: round(e.marketPrice, 1), worth: e.worthAtMarket ? 1 : 0, gross: Math.round(e.grossBenefit) }
            : { reason: e.reason };
    }
    return out;
}

global.boostBreakeven = function (roomName, compound) {
    const rooms = roomName ? [Game.rooms[roomName]].filter(Boolean) : Game.myRooms || [];
    const compounds = compound ? [compound] : config.get("boost.breakevenCompounds", ["XLH2O", "LH2O", "LH"]);
    const lines = [];
    for (const room of rooms) for (const c of compounds) {
        const e = evaluate(room, c);
        lines.push("[boostBreakeven] " + room.name + " " + c + ": " + (e.status !== "ready" ? "unknown (" + e.reason + ")" :
            "equilíbrio " + round(e.breakevenPrice, 1) + " cr/un vs mercado " + round(e.marketPrice, 1) + (e.worthAtMarket ? " - compensa" : " - não compensa") +
            " (benefício " + Math.round(e.grossBenefit) + " cr numa vida, " + e.parts + " partes, duty " +
            Object.entries(e.duty).map(([a, d]) => a + " " + Math.round(d * 100) + "%").join("/") + ")"));
    }
    return lines.join("\n") || "[boostBreakeven] sem salas";
};

module.exports = { actionEvidence, buildContext, evaluate, summary };
