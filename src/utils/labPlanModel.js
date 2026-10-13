"use strict";


function assert(ok, message) { if (!ok) throw new Error(message || "Invalid lab schedule"); }
assert.equal = (a, b, message) => assert(a === b, message);
assert.deepEqual = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
function composition(resource, recipes) {
    const recipe = recipes[resource];
    if (!recipe) return { [resource]: 1 };
    const result = {};
    recipe.inputs.forEach((r) => Object.entries(composition(r, recipes)).forEach(([base, n]) => {
        result[base] = (result[base] || 0) + n;
    }));
    return result;
}
const slots = require("./labSlots");

const trioCache = new Map();
function trios(built) {
    const key = built.join(",");
    if (!trioCache.has(key)) {
        const result = [];
        for (let out = 0; out < built.length; out++) for (let a = 0; a < built.length; a++) for (let b = 0; b < built.length; b++) {
            if (a !== b && slots.reaches(built[out], built[a], built[b])) result.push({ out, a, b });
        }
        trioCache.set(key, result);
    }
    return trioCache.get(key);
}
function materialTotals(stock, labs, recipes) {
    const total = {};
    function add(type, amount) {
        if (!amount) return;
        for (const [atom, n] of Object.entries(composition(type, recipes))) total[atom] = (total[atom] || 0) + n * amount;
    }
    Object.entries(stock).forEach(([type, amount]) => add(type, amount));
    labs.forEach((lab) => add(lab.role, lab.amount));
    return Object.fromEntries(Object.entries(total).sort(([a], [b]) => a.localeCompare(b)));
}
function* evaluate(plan, scenario, options = {}) {
    const { product, qty, built, recipes } = scenario;
    const bandwidth = scenario.bandwidth == null ? Infinity : scenario.bandwidth;
    const delay = scenario.delay || 0;
    assert(qty > 0 && qty % 5 === 0);
    assert(bandwidth > 0 && (bandwidth === Infinity || Number.isInteger(bandwidth)));
    const stock = { ...scenario.stock };
    const initialLabs = scenario.labs || [];
    const initial = materialTotals(stock, initialLabs, recipes);
    const labs = built.map((_, i) => ({ role: null, amount: 0, next: 0, ready: 0, desired: null, ...initialLabs[i] }));
    const initialFinal = (stock[product] || 0) + labs.reduce((n, l) => n + (l.role === product ? l.amount : 0), 0);
    const steps = scenario.steps;
    const targets = Object.fromEntries(steps.map((p) => [p, scenario.targets ? scenario.targets[p] || 0 : qty]));
    const produced = Object.fromEntries(steps.map((r) => [r, 0]));
    const geometry = trios(built);
    const byOutput = labs.map((_, i) => geometry.filter((g) => g.out === i));
    const counters = { movement: 0, loads: 0, drains: 0, switches: 0, cooldownSwitches: 0, calls: 0, dualRoleTicks: 0, dualRoleLabs: [], peakDualRoleLabs: 0 };
    const dualLabs = new Set();
    const trace = { phases: [], switches: [], dualRolePeriods: [], reactions: [] };
    const fullTrace = options.trace === true;
    let tick = 0, phaseIndex = 0, round = 0, phase = null, quota = null, cursor = 0;
    let finishing = false, lastProgress = 0;
    let layoutKey = null, pairs = [], sourceUses = [], copies = {}, outputOrder = [];
    function refreshLayout() {
        const key = labs.map((l) => l.desired || "").join(",") + "|" + phase.products.join(",");
        if (key === layoutKey) return;
        layoutKey = key; copies = {}; sourceUses = labs.map(() => []);
        labs.forEach((l) => { copies[l.desired] = (copies[l.desired] || 0) + 1; });
        pairs = labs.map((lab, out) => {
            const p = lab.desired;
            if (!phase.products.includes(p)) return [];
            const result = byOutput[out].filter((g) => labs[g.a].desired === recipes[p].inputs[0] && labs[g.b].desired === recipes[p].inputs[1]);
            result.forEach((g) => { for (const i of [g.a, g.b]) if (!sourceUses[i].includes(p)) sourceUses[i].push(p); });
            return result;
        });
        outputOrder = labs.map((_, i) => i).filter((i) => phase.products.includes(labs[i].desired));
        outputOrder.sort((a, b) => steps.indexOf(labs[b].desired) - steps.indexOf(labs[a].desired) || a - b);
    }
    function enterPhase() {
        phase = plan.phases[phaseIndex];
        const window = Math.min(plan.window || qty, qty - round * (plan.window || qty));
        quota = Object.fromEntries(phase.products.map((p) => [p, Math.min(targets[p] || 0, produced[p] + (phase.amount || window))]));
        if (plan.adaptive && phase.alternatives) phase = { ...phase, layout: layoutFor(phase, labs, quota, produced, recipes, tick, bandwidth, delay) };
        phase.layout.forEach((r, i) => { labs[i].desired = r; });
        if (fullTrace) trace.phases.push({ tick, round, phase: phaseIndex, layout: phase.layout, quota: { ...quota } });
    }
    function switchEmpty(lab, i) {
        if (lab.role === lab.desired || lab.amount) return;
        if (lab.role && lab.desired) {
            counters.switches++;
            if (lab.next > tick) counters.cooldownSwitches++;
            if (fullTrace) trace.switches.push({ tick, slot: built[i], from: lab.role, to: lab.desired, cooldownRemaining: Math.max(0, lab.next - tick) });
            lab.ready = tick + delay;
        }
        lab.role = lab.desired;
        lab.refilling = false;
    }
    function remaining(p) { return Math.max(0, (quota[p] || 0) - produced[p]); }
    function consumers(type) { return phase.products.filter((p) => remaining(p) && recipes[p].inputs.includes(type)); }
    function sourceConsumers(i) {
        return sourceUses[i].filter((p) => remaining(p));
    }
    function expectedJobs() {
        const jobs = [];
        labs.forEach((lab, i) => {
            if (lab.amount && lab.role !== lab.desired) jobs.push({ kind: "drain", i, max: lab.amount });
        });
        labs.forEach((lab, i) => {
            if (!lab.amount || lab.role !== lab.desired) return;
            const held = !finishing && ((phase.keep || []).includes(lab.role) || sourceConsumers(i).length);
            if (!held) jobs.push({ kind: "drain", i, max: lab.amount });
        });
        if (!finishing) labs.forEach((lab, i) => {
            if (lab.role !== lab.desired || tick < lab.ready || !lab.role) return;
            const use = sourceConsumers(i);
            if (!use.length) return;
            const need = use.reduce((sum, p) => sum + remaining(p), 0);
            const target = Math.floor(Math.min(3000, need, (scenario.buffer || Math.max(40, 10 * built.length)) / copies[lab.role]));
            const low = Math.min(target, Math.max(5, Math.floor(target * (scenario.refillRatio || 1))));
            if (lab.amount < low) lab.refilling = true;
            if (lab.amount >= target) lab.refilling = false;
            if (!stock[lab.role] || !lab.refilling) return;
            const amount = Math.min(Math.max(0, Math.floor(target) - lab.amount), stock[lab.role]);
            if (amount) jobs.push({ kind: "load", i, max: amount });
        });
        return jobs;
    }
    function move(jobs, budget) {
        let moved = 0;
        if (!jobs.length) return 0;
        // Conflict drains first, then fair rotating five-unit service. Infinite
        // logistics completes every job in this start-of-tick snapshot.
        if (budget === Infinity) cursor = 0;
        let scanned = 0;
        const maxScans = budget === Infinity ? jobs.length : jobs.length * (1 + Math.ceil(budget / 5));
        while (budget > 0 && scanned < maxScans) {
            const job = jobs[(cursor + scanned) % jobs.length], lab = labs[job.i];
            const available = job.kind === "load" ? stock[lab.role] || 0 : lab.amount;
            const amount = Math.min(job.max, available, budget === Infinity ? job.max : Math.min(5, budget));
            if (job.kind === "load") { lab.amount += amount; stock[lab.role] -= amount; counters.loads += amount; }
            else { lab.amount -= amount; stock[lab.role] = (stock[lab.role] || 0) + amount; counters.drains += amount; }
            moved += amount; budget -= amount; scanned++;
            job.max -= amount;
        }
        if (bandwidth !== Infinity) cursor = (cursor + scanned) % Math.max(1, jobs.length);
        counters.movement += moved;
        return moved;
    }
    function reassign() {
        if (!plan.reassign || finishing) return;
        for (let i = 0; i < labs.length; i++) {
            const lab = labs[i], old = lab.desired;
            if (remaining(old) || sourceConsumers(i).length) continue;
            const counts = {};
            labs.forEach((l) => { counts[l.desired] = (counts[l.desired] || 0) + 1; });
            const choices = phase.products.filter((p) => remaining(p) && geometry.some((g) => g.out === i &&
                labs[g.a].desired === recipes[p].inputs[0] && labs[g.b].desired === recipes[p].inputs[1]));
            choices.sort((a, b) => remaining(b) * recipes[b].cooldown / (counts[b] || 1) - remaining(a) * recipes[a].cooldown / (counts[a] || 1) || a.localeCompare(b));
            if (choices.length) { lab.desired = choices[0]; refreshLayout(); }
        }
    }
    function complete() {
        assert.deepEqual(materialTotals(stock, labs, recipes), initial, "0128 atom conservation");
        assert(steps.every((p) => produced[p] === targets[p]), "0128 exact step balances");
        assert(labs.every((l) => l.amount >= 0 && l.amount <= 3000), "0128 capacity");
        assert.equal(counters.calls, Object.values(targets).reduce((sum, n) => sum + n / 5, 0), "0128 exact reaction count");
        counters.dualRoleLabs = [...dualLabs].sort((a, b) => a - b);
        return { status: "complete", ticks: tick + 1, ...counters, produced, trace: fullTrace ? trace : undefined };
    }
    enterPhase();
    for (let iterations = 0; iterations < (options.maxIterations || 1000000) && tick < (options.maxTicks || 1000000); iterations++) {
        yield null;
        if (phase.notBefore != null && tick < phase.notBefore) { tick = phase.notBefore; continue; }
        labs.forEach(switchEmpty);
        refreshLayout();
        let moved = move(expectedJobs(), bandwidth);
        assert(bandwidth === Infinity || moved <= bandwidth, "0128 transport budget");
        labs.forEach(switchEmpty);
        const before = labs.map((l) => l.amount);
        let calls = 0;
        const barrier = phase.barrier && labs.some((l) => l.role !== l.desired || tick < l.ready);
        if (!finishing && !barrier) {
            // Downstream-first reservations; new production never enters before[].
            for (const out of outputOrder) {
                const lab = labs[out], p = lab.role;
                if (lab.role !== lab.desired || tick < lab.ready || tick < lab.next || before[out] > 2995 || lab.amount > 2995 || remaining(p) < 5) continue;
                const available = pairs[out].filter((g) => labs[g.a].role === recipes[p].inputs[0] && labs[g.b].role === recipes[p].inputs[1] &&
                    labs[g.a].role === labs[g.a].desired && labs[g.b].role === labs[g.b].desired && tick >= labs[g.a].ready && tick >= labs[g.b].ready && before[g.a] >= 5 && before[g.b] >= 5);
                available.sort((a, b) => Math.min(before[b.a], before[b.b]) - Math.min(before[a.a], before[a.b]) || a.a - b.a || a.b - b.b);
                if (!available.length) continue;
                const g = available[0];
                assert(labs[g.a].amount >= 5 && labs[g.b].amount >= 5, "0128 no double consumption");
                before[g.a] -= 5; before[g.b] -= 5;
                labs[g.a].amount -= 5; labs[g.b].amount -= 5;
                lab.amount += 5; produced[p] += 5; lab.next = tick + recipes[p].cooldown;
                calls++; counters.calls++;
                if (fullTrace) trace.reactions.push({ tick, product: p, out: built[out], inputs: [built[g.a], built[g.b]] });
            }
        }
        const dual = labs.map((l, i) => i).filter((i) => remaining(labs[i].role) && consumers(labs[i].role).length);
        if (dual.length) {
            counters.dualRoleTicks += dual.length;
            counters.peakDualRoleLabs = Math.max(counters.peakDualRoleLabs, dual.length);
            dual.forEach((i) => dualLabs.add(built[i]));
            if (fullTrace) trace.dualRolePeriods.push({ start: tick, end: tick + 1, slots: dual.map((i) => built[i]) });
        }
        // Instantaneous logistics drains outputs at end of tick, matching the old
        // reference. Finite logistics drains them from the next tick's budget.
        if (bandwidth === Infinity) moved += move(expectedJobs().filter((j) => j.kind === "drain"), Infinity);
        if (calls || moved) lastProgress = tick;
        if (finishing && (stock[product] || 0) >= initialFinal + (targets[product] || 0)) {
            return complete();
        }
        if (!finishing && phase.products.every((p) => produced[p] >= quota[p])) {
            phaseIndex++;
            if (phaseIndex >= plan.phases.length) {
                phaseIndex = 0; round++;
                if (steps.every((p) => produced[p] >= targets[p])) {
                    finishing = true;
                    // The final product must actually reach stock, also at finite B.
                    if (bandwidth === Infinity) {
                        move(expectedJobs().filter((j) => j.kind === "drain"), Infinity);
                        if ((stock[product] || 0) >= initialFinal + (targets[product] || 0)) return complete();
                    }
                }
            }
            if (!finishing) enterPhase();
            tick++; continue;
        }
        reassign();
        if (!calls && !moved) {
            const future = labs.flatMap((l) => [l.next, l.ready]).filter((t) => t > tick);
            if (future.length) {
                const nextTick = Math.min(...future);
                counters.dualRoleTicks += dual.length * (nextTick - tick - 1);
                if (fullTrace && dual.length) trace.dualRolePeriods[trace.dualRolePeriods.length - 1].end = nextTick;
                tick = nextTick; continue;
            }
            return { status: "stalled", tick, phaseIndex, round, lastProgress };
        }
        tick++;
    }
    return { status: "limit", tick, phaseIndex, round };
}

function simulate(plan, scenario, options) {
    const generator = evaluate(plan, scenario, options);
    let result;
    do { result = generator.next(); } while (!result.done);
    return result.value;
}
// Same ranking used by the research engine, exposed to the live executor.
function layoutFor(phase, labs, quota, produced, recipes, tick, bandwidth, delay) {
    let best = null;
    for (const layout of phase.alternatives || [phase.layout]) {
        let projected = tick, movement = 0, changes = 0;
        labs.forEach((lab, i) => {
            if (lab.role !== layout[i]) { movement += lab.amount; if (lab.role && layout[i]) changes++; }
        });
        for (const p of phase.products) {
            const ready = labs.map((lab, i) => layout[i] === p ? Math.max(tick, lab.next,
                lab.role && lab.role !== p ? tick + delay : lab.ready) : null).filter((t) => t !== null);
            if (!ready.length && quota[p] > produced[p]) { projected = Infinity; break; }
            for (let n = 0; n < (quota[p] - produced[p]) / 5; n++) {
                ready.sort((a, b) => a - b);
                projected = Math.max(projected, ready[0]); ready[0] += recipes[p].cooldown;
            }
        }
        const rank = projected + (bandwidth === Infinity ? 0 : movement / bandwidth) + (changes ? delay : 0);
        if (!best || rank < best.rank || rank === best.rank && movement < best.movement) best = { layout, rank, movement };
    }
    return best.layout.slice();
}
module.exports = { trios, simulate, evaluate, materialTotals, layoutFor };
