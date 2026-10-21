"use strict";
// ROADMAP 0150 T1 (ARK-137): is processing power into GPL still paying back fast enough?
//
// Cost of a GPL point = 1 power (its market bid: what selling it would fetch) + POWER_SPAWN_ENERGY_RATIO
// (50) energy at fairPrice. Points still needed: to power.targetLevel (3, the first useful operator:
// GENERATE_OPS + OPERATE_LAB) while below it, else to the next level - a milestone, never a cap.
// Benefit per day of one more operator level (OPERATE_LAB on power.operatedLabs labs): extra units
// per reaction (POWER_INFO OPERATE_LAB level 1, +2) x reactions per lab per tick observed by the
// labReport x the best running reaction's live margin (product - both inputs, fairPrice) x
// power.ticksPerDay. payback = cost / benefit; processing goes on while payback <= power.maxPaybackDays
// (user decision 2026-10-21: up to 90 days). Quadratic GPL costs make the payback grow level by
// level, so processing stops by itself when it no longer pays.
// Without prices or lab evidence the verdict is "unknown" and processing CONTINUES (user decision);
// a supply shortfall (resourceTiers.supplyShortfall) always pauses it. Heap cache, power.checkTicks.
const config = require("./config");
const market = require("./market");
const resourceTiers = require("./resourceTiers");
const labReactions = require("./labReactions");

let cache = null; // { tick, verdict }

function fair(resources, type) {
    const r = resources && resources[type];
    return r && r.fairPrice > 0 ? r.fairPrice : null;
}

function bid(resources, type) {
    const r = resources && resources[type];
    return r && r.buyPrice > 0 ? r.buyPrice : fair(resources, type);
}

function totalFor(level) {
    const mult = typeof POWER_LEVEL_MULTIPLY === "number" ? POWER_LEVEL_MULTIPLY : 1000;
    const pow = typeof POWER_LEVEL_POW === "number" ? POWER_LEVEL_POW : 2;
    return mult * Math.pow(level, pow);
}

// best (room, reaction) margin and reactions per output lab per tick, from the labReport
function labEvidence(resources) {
    let best = null;
    for (const room of Game.myRooms || []) {
        const s = require("./labReport").summary(room.name);
        if (!s || !(s.outputLabs > 0)) continue;
        const base = typeof LAB_REACTION_AMOUNT === "number" ? LAB_REACTION_AMOUNT : 5;
        const perTick = s.confirmedPerTick > 0 ? s.confirmedPerTick : s.amountPerTick;
        const reactionsPerLab = perTick / base / s.outputLabs;
        for (const r of labReactions.list(room.name)) {
            const p = fair(resources, r.product), a = fair(resources, r.a), b = fair(resources, r.b);
            if (p === null || a === null || b === null) continue;
            const margin = p - a - b;
            const value = margin * reactionsPerLab;
            if (!best || value > best.value) best = { room: room.name, product: r.product, margin, reactionsPerLab, value };
        }
    }
    return best;
}

function evaluate() {
    const gpl = Game.gpl || {};
    const snap = market.snapshot();
    const resources = snap && snap.resources;
    const out = { level: gpl.level, progress: gpl.progress, progressTotal: gpl.progressTotal };
    const powerValue = bid(resources, RESOURCE_POWER), energyValue = fair(resources, RESOURCE_ENERGY);
    if (powerValue === null || energyValue === null || !Number.isFinite(gpl.level)) return Object.assign(out, { status: "unknown", reason: "price-or-gpl-unknown" });
    const ratio = typeof POWER_SPAWN_ENERGY_RATIO === "number" ? POWER_SPAWN_ENERGY_RATIO : 50;
    const pointCost = powerValue + ratio * energyValue;
    const target = Math.max(gpl.level + 1, Number(config.get("power.targetLevel", 3)));
    // progress is measured from the current level's start: total processed = totalFor(level) + progress
    const processed = totalFor(gpl.level) + (gpl.progress || 0);
    const points = Math.max(0, totalFor(target) - processed);
    const lab = labEvidence(resources);
    if (!lab || !(lab.value > 0)) return Object.assign(out, { status: "unknown", reason: "no-lab-evidence", pointCost, points, target });
    const info = typeof POWER_INFO !== "undefined" && typeof PWR_OPERATE_LAB !== "undefined" ? POWER_INFO[PWR_OPERATE_LAB] : null;
    const extra = info && Array.isArray(info.effect) ? info.effect[0] : 2;
    const benefitPerDay = extra * Number(config.get("power.operatedLabs", 2)) * lab.value * Number(config.get("power.ticksPerDay", 25000));
    // below the milestone the levels carry no benefit of their own: the whole path pays back as one
    const cost = points * pointCost;
    const paybackDays = cost / benefitPerDay;
    const max = Number(config.get("power.maxPaybackDays", 90));
    return Object.assign(out, { status: paybackDays <= max ? "process" : "hold", reason: paybackDays <= max ? "pays-back" : "payback-too-long",
        target, points, pointCost, cost, benefitPerDay, paybackDays, best: lab.product + "@" + lab.room, margin: lab.margin });
}

function verdict() {
    const every = Number(config.get("power.checkTicks", 500));
    if (!cache || Game.time - cache.tick >= every || Game.time < cache.tick) {
        let v;
        try { v = evaluate(); } catch (e) { v = { status: "unknown", reason: "error:" + (e && e.message) }; }
        if (!cache || cache.verdict.status !== v.status) console.log("[power] " + line(v));
        cache = { tick: Game.time, verdict: v };
    }
    return cache.verdict;
}

// may this room's power spawn be fed / process now?
function allows(room) {
    if (config.get("power.economicGate", true) === false) return true;
    if (room && resourceTiers.supplyShortfall(room)) return false;
    return verdict().status !== "hold"; // unknown keeps processing (user decision 2026-10-21)
}

function line(v) {
    if (v.status === "unknown") return "GPL " + v.level + ": " + v.reason + " - processamento segue";
    return "GPL " + v.level + " → " + v.target + ": " + Math.round(v.points) + " power × " + Math.round(v.pointCost) + " cr = " +
        Math.round(v.cost / 1e6 * 10) / 10 + "M cr; benefício ~" + Math.round(v.benefitPerDay) + " cr/dia (" + v.best + ", margem " +
        Math.round(v.margin) + "); payback " + Math.round(v.paybackDays) + " dias → " + (v.status === "process" ? "processa" : "pausa");
}

function summary() {
    const v = verdict();
    const round = (x) => (Number.isFinite(x) ? Math.round(x) : null);
    return { status: v.status, reason: v.reason, target: v.target === undefined ? null : v.target, points: round(v.points),
        paybackDays: Number.isFinite(v.paybackDays) ? Math.round(v.paybackDays * 10) / 10 : null, benefitPerDay: round(v.benefitPerDay),
        cost: round(v.cost) };
}

function reset() { cache = null; }

global.powerEconomics = () => line(verdict());

module.exports = { evaluate, verdict, allows, summary, reset };
