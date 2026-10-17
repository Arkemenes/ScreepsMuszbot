"use strict";
const boostParts = require("./boostParts");
const readiness = require("./operationalReadiness");
const finite = (n) => Number.isFinite(n) && n >= 0;

// Same per-call semantics as the WORK model, using only supplied constants.
function actionModel(body, action, energy, constants) {
    const power = action === "build" ? constants.buildPower : constants.repairPower;
    const unitCost = action === "build" ? 1 : constants.repairCost;
    const work = body.filter((p) => p.type === constants.workType && p.hits > 0).length;
    const extras = [];
    for (const p of body) {
        if (p.type !== constants.workType || !p.boost) continue;
        const info = constants.boosts[p.type] && constants.boosts[p.type][p.boost];
        if (!info) return null;
        if (info[action] !== undefined && (!Number.isFinite(info[action]) || info[action] < 1)) return null;
        if (info[action] > 0) extras.push((info[action] - 1) * power);
    }
    extras.sort((a, b) => b - a);
    const call = (need) => {
        const base = Math.min(work * power, energy / unitCost, need);
        let effect = base;
        for (let i = 0; i < Math.min(extras.length, Math.floor(base)); i++) effect += extras[i];
        return { effect: Math.min(need, Math.floor(effect)), energy: Math.min(energy, Math.ceil(base * unitCost)) };
    };
    return { call, full: call(Infinity) };
}
function project(model, demand, ticks) {
    if (!model.full.effect || !ticks || !demand) return { work: 0, energy: 0, ticks: 0 };
    const completeCalls = Math.min(ticks, Math.max(0, Math.ceil(demand / model.full.effect) - 1));
    let work = completeCalls * model.full.effect, energy = completeCalls * model.full.energy, used = completeCalls;
    if (used < ticks && work < demand) {
        const last = model.call(demand - work); work += last.effect; energy += last.energy; used++;
    }
    return { work, energy, ticks: used };
}
function worth(role, compound, context) {
    const c = context || {}, k = c.constants;
    const fail = (reason, status = "unknown") => ({ status, reason, kind: "estimated", worth: false });
    if (role !== "builder") return fail("pilot-role", "blocked");
    const selection = boostParts.select(c.body, compound, c.count, null, k);
    if (!selection.pilotSafe) return fail(selection.reason || "destroyed-prefix", selection.status === "unknown" ? "unknown" : "blocked");
    if (!k || typeof k.workType !== "string" || !(k.buildPower > 0) || !(k.repairPower > 0) || !(k.repairCost > 0) ||
        ![k.buildPower, k.repairPower, k.repairCost].every(Number.isFinite)) return fail("missing-work-constants");
    if (!finite(c.ttl) || !finite(c.delayTicks) || !finite(c.nowTick) || !Array.isArray(c.actions) || !c.actions.length || c.actions.length > 2)
        return fail("invalid-horizon-actions");
    if (c.ttl <= c.delayTicks) return fail("no-productive-life", "blocked");
    const evidence = c.evidence, maxAge = c.maxAgeTicks === undefined ? 1 : c.maxAgeTicks;
    if (!finite(maxAge)) return fail("invalid-evidence-age");
    if (!evidence || evidence.observedTick > c.nowTick || c.nowTick - evidence.observedTick > maxAge ||
        !Number.isFinite(evidence.observedTick) || evidence.kind !== "bounded" || evidence.demandAssigned !== true)
        return fail("missing-action-evidence");
    const costs = c.costs, quote = c.compoundOpportunity;
    if (!costs || ![costs.energyUnitValue, costs.logisticsEnergy, costs.logisticsCredits, costs.labOpportunityCredits].every(finite) ||
        !quote || !finite(quote.netUnitValue) || !finite(quote.quantity) || quote.quantity < selection.requiredMineral ||
        !finite(quote.observedTick) || !finite(quote.validUntilTick) || quote.observedTick > c.nowTick || quote.validUntilTick < c.nowTick ||
        c.nowTick - quote.observedTick > maxAge || quote.executable !== true) return fail("missing-executable-costs");
    const boosted = c.body.map((p, i) => selection.selectedIndexes.includes(i) ? { ...p, boost: compound } : p);
    const rows = [], demands = [{ commitmentId: "boost:application", at: 0, amount: selection.requiredEnergy + costs.logisticsEnergy }];
    let duty = 0, grossBenefit = 0, extraEnergyCost = 0;
    const seen = new Set();
    for (const action of c.actions) {
        if (!action || !["build", "repair"].includes(action.action) || seen.has(action.action) ||
            ![action.demand, action.duty, action.energyPerActionTick, action.valuePerEffect].every(finite) ||
            action.duty > 1 || !Number.isInteger(action.demand) || !["fixed", "capacity"].includes(action.mode)) return fail("invalid-action-model");
        seen.add(action.action); duty += action.duty;
        const energy = Math.floor(action.energyPerActionTick);
        const baseline = actionModel(c.body, action.action, energy, k), after = actionModel(boosted, action.action, energy, k);
        if (!baseline || !after) return fail("unknown-existing-boost");
        const normal = project(baseline, action.demand, Math.floor(c.ttl * action.duty));
        const boost = project(after, action.demand, Math.floor((c.ttl - c.delayTicks) * action.duty));
        let benefit;
        if (action.mode === "fixed") {
            if (normal.work < action.demand || boost.work < action.demand) return fail("fixed-demand-not-realizable", "blocked");
            benefit = Math.max(0, normal.energy - boost.energy) * costs.energyUnitValue;
        } else {
            benefit = Math.max(0, boost.work - normal.work) * action.valuePerEffect;
            extraEnergyCost += Math.max(0, boost.energy - normal.energy) * costs.energyUnitValue;
        }
        grossBenefit += benefit;
        rows.push({ action: action.action, mode: action.mode, normal, boost, benefit });
        // One-call burst plus full-rate draw is an upper bound, even for small jobs.
        if (boost.ticks) demands.push({ commitmentId: "boost:work:" + action.action, at: c.delayTicks,
            amount: after.full.energy, until: c.ttl, rate: after.full.energy * action.duty });
    }
    if (duty > 1 + 1e-9) return fail("overlapping-work-duty");
    const gate = readiness.evaluate({ ...c.delivery, nowTick: c.nowTick, horizonTicks: c.ttl, demand: demands });
    if (gate.status !== "ready") return { ...fail(gate.reasons[0], gate.status), readiness: gate };
    const cost = selection.requiredMineral * quote.netUnitValue + selection.requiredEnergy * costs.energyUnitValue +
        costs.logisticsEnergy * costs.energyUnitValue + costs.logisticsCredits + costs.labOpportunityCredits + extraEnergyCost;
    const enter = c.minReturnRatio === undefined ? 0.20 : c.minReturnRatio;
    const exit = c.continueReturnRatio === undefined ? 0.10 : c.continueReturnRatio;
    if (!finite(enter) || !finite(exit) || exit > enter) return fail("invalid-return-margin");
    const margin = c.previouslyApproved === true ? exit : enter;
    if (![cost, grossBenefit].every(finite)) return fail("nonfinite-projection");
    const netBenefit = grossBenefit - cost;
    const approved = grossBenefit > 0 && grossBenefit >= cost * (1 + margin);
    return { kind: "estimated", status: approved ? "ready" : "blocked", reason: approved ? null : "insufficient-return",
        worth: approved, grossBenefit, cost, netBenefit, selection, actions: rows, readiness: gate,
        observedTick: c.nowTick, validUntilTick: Math.min(quote.validUntilTick, gate.validUntilTick) };
}
module.exports = { worth };
