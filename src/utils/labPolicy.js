"use strict";

const config = require("./config");
const model = require("./labPlanModel");
const data = require("./labPolicyData");
const labSlots = require("./labSlots");
const jobs = new Map(), planCache = new Map(), index = new Map();
const widePhaseCache = new Map();
let recipeSource, recipeSignature, recipes, budgetTick = -1, used = 0, cpuStart = 0;
data.rows.forEach((row) => {
    const key = row[0] + ":" + row[1];
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
});
function enabled() {
    return config.get("craft.labPolicy", true) && config.get("craft.wideLabs", true) &&
        ["auto", "policy"].includes(config.get("craft.labStrategy", "auto"));
}
function recipeMap() {
    const source = REACTIONS;
    if (recipeSource !== source || !recipes) {
        // The engine clones constants every tick. Identity changes alone must
        // not discard immutable geometry and force every fallback to rebuild.
        const rows = [];
        Object.keys(source).sort().forEach((a) => Object.keys(source[a]).sort().forEach((b) => {
            rows.push([a, b, source[a][b]]);
        }));
        const signature = JSON.stringify(rows);
        if (signature !== recipeSignature || !recipes) {
            recipes = {};
            planCache.clear(); widePhaseCache.clear();
            rows.forEach(([a, b, p]) => {
                if (!recipes[p]) recipes[p] = { inputs: [a, b], cooldown: REACTION_TIME[p] || 1 };
            });
            recipeSignature = signature;
        }
        recipeSource = source;
    }
    Object.keys(recipes).forEach((p) => { recipes[p].cooldown = REACTION_TIME[p] || 1; });
    return recipes;
}
function descriptor(steps) {
    if (!enabled() || steps.length < 2 || steps.some((s) => s.kind !== "lab")) return null;
    const map = recipeMap(), targets = {};
    for (const step of steps) {
        if (!map[step.product] || map[step.product].cooldown < 2 || !(step.batches > 0)) return null;
        targets[step.product] = Math.floor(step.batches) * 5;
    }
    const product = steps[steps.length - 1].product;
    return { kind: "lab", policy: true, product, target: targets[product],
        targets, order: steps.map((s) => s.product) };
}
function widePlan(item, built) {
    const map = recipeMap(), geometry = model.trios(built);
    const products = item.order.filter((p) => item.targets[p] > 0);
    const window = Math.max(...Object.values(item.targets));
    const key = "wide:" + built.join(",") + ":" + products.join(",") + ":" + window;
    if (planCache.has(key)) return planCache.get(key);
    const phases = products.map((p) => {
        const phaseKey = built.join(",") + ":" + p;
        if (widePhaseCache.has(phaseKey)) return widePhaseCache.get(phaseKey);
        const alternatives = [];
        for (let a = 0; a < built.length; a++) for (let b = 0; b < built.length; b++) {
            if (a === b) continue;
            const outputs = geometry.filter((g) => g.a === a && g.b === b).map((g) => g.out);
            if (!outputs.length) continue;
            const layout = built.map(() => null);
            layout[a] = map[p].inputs[0]; layout[b] = map[p].inputs[1];
            outputs.forEach((out) => { layout[out] = p; });
            alternatives.push(layout);
        }
        alternatives.sort((a, b) => b.filter((r) => r === p).length - a.filter((r) => r === p).length ||
            JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const phase = { products: [p], layout: alternatives[0], alternatives, keep: [], barrier: true };
        widePhaseCache.set(phaseKey, phase);
        if (widePhaseCache.size > config.get("craft.policyCacheEntries", 64) * 4)
            widePhaseCache.delete(widePhaseCache.keys().next().value);
        return phase;
    });
    if (!phases.length || phases.some((p) => !p.layout)) return null;
    const plan = { name: "wide-live", family: "wide", window, phases, adaptive: true };
    planCache.set(key, plan);
    if (planCache.size > config.get("craft.policyCacheEntries", 64) * 4) planCache.delete(planCache.keys().next().value);
    return plan;
}
function planFor(id, item, built) {
    if (id === "wide-live") return widePlan(item, built);
    const map = recipeMap();
    const key = id + ":" + built.join(",") + ":" + item.order.join(",");
    if (planCache.has(key)) return planCache.get(key);
    const source = data.plans[id];
    if (!source || source.phases.some((p) => p.layout.length !== built.length)) return null;
    const geometry = model.trios(built);
    const valid = (phase, layout) => phase.products.every((p) => !item.targets[p] || map[p] &&
        geometry.some((g) => layout[g.out] === p && layout[g.a] === map[p].inputs[0] && layout[g.b] === map[p].inputs[1]));
    const phases = source.phases.map((phase) => {
        const alternatives = (phase.alternatives || [phase.layout]).filter((layout) => valid(phase, layout));
        if (!alternatives.length) return null;
        return { ...phase, products: phase.products.filter((p) => item.order.includes(p)),
            layout: valid(phase, phase.layout) ? phase.layout : alternatives[0], alternatives };
    }).filter((phase) => !phase || phase.products.length);
    const result = phases.some((p) => !p) ? null : { ...source, phases };
    planCache.set(key, result);
    if (planCache.size > config.get("craft.policyCacheEntries", 64) * 4) planCache.delete(planCache.keys().next().value);
    return result;
}
function dual(plan, map) {
    return plan.phases.some((phase) => phase.products.some((p) =>
        phase.products.some((consumer) => map[consumer] && map[consumer].inputs.includes(p))));
}
function candidates(item, scenario, allowPipeline) {
    if (!enabled()) return [{ id: "wide-live", plan: widePlan(item, scenario.built) }].filter((c) => c.plan);
    const rows = (index.get(item.product + ":" + scenario.built.length) || []).slice();
    const b = scenario.bandwidth == null ? 10000 : scenario.bandwidth;
    rows.sort((a, c) => {
        const rank = (r) => Math.abs(Math.log(r[2] / scenario.qty)) +
            Math.abs(Math.log((r[3] == null ? 10000 : r[3]) / b)) + Math.abs(r[4] - scenario.delay) / 50;
        return rank(a) - rank(c) || a[5].localeCompare(c[5]);
    });
    const ids = ["wide-live"];
    rows.forEach((r) => { for (const id of [r[5]].concat(r[7])) if (!ids.includes(id)) ids.push(id); });
    const map = recipeMap();
    const result = [];
    const limit = Math.max(2, config.get("craft.policyCandidates", 8));
    for (const id of ids) {
        const plan = planFor(id, item, scenario.built);
        if (plan && (allowPipeline || !dual(plan, map))) result.push({ id, plan });
        if (result.length >= limit) break;
    }
    // Known winner first, reference always retained, then alternative windows/groups.
    if (result.length > 1) [result[0], result[1]] = [result[1], result[0]];
    return result;
}
function signature(item, scenario, allowPipeline) {
    const map = recipeMap();
    return JSON.stringify([item.product, item.targets, item.order.map((p) => [p, map[p].inputs, map[p].cooldown]), scenario.built, scenario.labs, scenario.stock,
        scenario.bandwidth, scenario.delay, scenario.buffer, scenario.refillRatio, allowPipeline, enabled()]);
}
function jobKey(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    const base = (hash >>> 0).toString(36) + ":" + value.length;
    let key = base;
    for (let i = 0; i < 1000 && jobs.has(key) && jobs.get(key).signature !== value; i++) key = base + ":" + i;
    return key;
}
function request(item, scenario, allowPipeline) {
    const value = signature(item, scenario, allowPipeline), key = jobKey(value);
    if (!jobs.has(key)) {
        const options = { maxIterations: config.get("craft.policyMaxIterations", 50000) };
        const entries = candidates(item, scenario, allowPipeline).map((c) => ({ ...c,
            generator: model.evaluate(c.plan, { ...scenario, recipes: recipeMap(), steps: item.order }, options) }));
        jobs.set(key, { signature: value, entries, cursor: 0, best: null, started: Game.time, status: "evaluating", failures: [] });
        const cap = config.get("craft.policyCacheEntries", 64);
        if (jobs.size > cap) jobs.delete(jobs.keys().next().value);
    }
    return key;
}
function poll(key) {
    const job = jobs.get(key);
    if (!job) return null; // heap reset: caller captures a new live state
    if (budgetTick !== Game.time) {
        budgetTick = Game.time; used = 0;
        cpuStart = Game.cpu && Game.cpu.getUsed ? Game.cpu.getUsed() : 0;
    }
    const budget = config.get("craft.policyWorkPerTick", 1000);
    const cpuLimit = config.get("craft.policyCpuPerTick", 1);
    const active = job.entries.filter((e) => e.generator);
    if (!Game.cpu || Game.cpu.bucket >= config.get("craft.minBucket", 500)) {
        while (job.status === "evaluating" && used < budget) {
            if (Game.cpu && Game.cpu.getUsed &&
                Game.cpu.getUsed() - cpuStart >= cpuLimit) break;
            if (!active.length) { job.status = job.best ? "complete" : "fallback"; break; }
            const entryIndex = job.cursor++ % active.length;
            const entry = active[entryIndex];
            let result;
            try { result = entry.generator.next(); }
            catch (error) { result = { done: true, value: { status: "invalid", message: error.message } }; }
            used++;
            if (!result.done) continue;
            entry.generator = null;
            active.splice(entryIndex, 1);
            const outcome = result.value;
            if (outcome.status !== "complete") { job.failures.push({ id: entry.id, status: outcome.status }); continue; }
            const rank = [outcome.ticks, outcome.movement, outcome.switches, entry.id];
            if (!job.best || rank.some((v, i) => v < job.best.rank[i] && rank.slice(0, i).every((n, j) => n === job.best.rank[j])))
                job.best = { id: entry.id, name: entry.plan.name, family: entry.plan.family, ticks: outcome.ticks, rank };
        }
    }
    return { best: job.best, status: job.status, failures: job.failures,
        expired: Game.time - job.started >= config.get("craft.policyPlanningTicks", 100) };
}
function cachedEstimate(item, scenario, allowPipeline) {
    const job = jobs.get(jobKey(signature(item, scenario, allowPipeline)));
    return job && job.best;
}
module.exports = { enabled, descriptor, recipeMap, widePlan, planFor, request, poll, cachedEstimate,
    dataVersion: data.source, dual };
