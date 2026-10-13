"use strict";

if (process.argv.includes("--search")) {
    require("./lab-search/run.cjs").main(process.argv.slice(2).filter((arg) => arg !== "--search"))
        .catch((err) => { console.error(err); process.exitCode = 1; });
} else {

// Research harness, not a game subsystem. Official cooldowns checked 2026-10-11.
// No power effects, boosts, market waits, movement or transport bandwidth.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.Memory = { settings: { craft: {} } };
const slots = require("../src/utils/labSlots");
const recipes = {
    OH: { inputs: ["H", "O"], cooldown: 20 },
    LH: { inputs: ["L", "H"], cooldown: 15 },
    LH2O: { inputs: ["LH", "OH"], cooldown: 10 },
    XLH2O: { inputs: ["LH2O", "X"], cooldown: 65 },
};
function tree(product) {
    return { product, inputs: recipes[product].inputs.map((r) => recipes[r] ? tree(r) : r) };
}
function work(qty) {
    return Object.fromEntries(Object.entries(recipes).map(([r, v]) => [r, { batches: qty / 5, cooldown: v.cooldown }]));
}
function bestPair(built) {
    let best = { inputs: [], outputs: [] };
    for (let a = 0; a < built.length; a++) for (let b = a + 1; b < built.length; b++) {
        const inputs = [built[a], built[b]];
        const outputs = built.filter((s) => slots.reaches(s, ...inputs));
        if (outputs.length > best.outputs.length) best = { inputs, outputs };
    }
    return best;
}

// Each transition drains incompatible minerals and instantly loads available stock.
// delay is an abstract barrier delay; cooldowns continue during the barrier.
// API eligibility uses beginning-of-tick minerals: a newly made intermediate
// is not assumed to be available to a downstream API call in the same tick.
function simulate(groups, built, qty, delay = 0) {
    const labs = Object.fromEntries(built.map((s) => [s, { type: null, amount: 0, next: 0 }]));
    const stock = { H: qty * 2, O: qty, L: qty, X: qty };
    const produced = {};
    const busy = {};
    let index = 0, startAt = 0, prepared = false, calls = 0;
    for (let tick = 0; tick < 1000000; tick++) {
        if (tick < startAt) continue;
        const group = groups[index];
        const expected = {};
        group.forEach((phase) => {
            recipes[phase.product].inputs.forEach((r, n) => { expected[phase.inputs[n]] = r; });
            phase.outputs.forEach((s) => { expected[s] = phase.product; });
        });
        if (!prepared) {
            for (const [s, lab] of Object.entries(labs)) {
                if (lab.amount && lab.type !== expected[s]) {
                    stock[lab.type] = (stock[lab.type] || 0) + lab.amount;
                    lab.amount = 0;
                }
                lab.type = expected[s] || null;
            }
            prepared = true;
        }
        const outputSlots = new Set(group.flatMap((p) => p.outputs));
        const needed = {};
        group.forEach((phase) => phase.inputs.forEach((s) => {
            needed[s] = (needed[s] || 0) + qty - (produced[phase.product] || 0);
        }));
        // Unlimited instantaneous logistics for external reagents only.
        for (const phase of group) recipes[phase.product].inputs.forEach((r, n) => {
            const s = phase.inputs[n], lab = labs[s];
            if (outputSlots.has(s)) return;
            const amount = Math.min(Math.max(0, Math.min(3000, needed[s]) - lab.amount), stock[r] || 0);
            lab.type = r; lab.amount += amount; stock[r] = (stock[r] || 0) - amount;
        });
        const before = Object.fromEntries(Object.entries(labs).map(([s, lab]) => [s, lab.amount]));
        for (const phase of group) {
            for (const s of phase.outputs) {
                const lab = labs[s], [a, b] = phase.inputs;
                if ((produced[phase.product] || 0) >= qty || tick < lab.next) continue;
                if (before[a] < 5 || before[b] < 5 || labs[a].amount < 5 || labs[b].amount < 5 || lab.amount > 2995) continue;
                assert(slots.reaches(s, a, b));
                assert.equal(labs[a].type, recipes[phase.product].inputs[0]);
                assert.equal(labs[b].type, recipes[phase.product].inputs[1]);
                labs[a].amount -= 5; labs[b].amount -= 5;
                before[a] -= 5; before[b] -= 5;
                lab.type = phase.product; lab.amount += 5;
                lab.next = tick + recipes[phase.product].cooldown;
                produced[phase.product] = (produced[phase.product] || 0) + 5;
                busy[s] = (busy[s] || 0) + recipes[phase.product].cooldown;
                calls++;
            }
        }
        // Held intermediates stay in place; other outputs are instantly drained.
        group.forEach((phase) => {
            if (phase.keep) return;
            phase.outputs.forEach((s) => {
                const lab = labs[s];
                stock[phase.product] = (stock[phase.product] || 0) + lab.amount;
                lab.amount = 0;
            });
        });
        if (group.every((p) => produced[p.product] === qty)) {
            if (++index === groups.length) {
                assert.equal(stock.XLH2O, qty);
                assert.equal(calls, qty / 5 * 4);
                return { ticks: tick + 1, calls, outputLabTicks: Object.values(busy).reduce((a, b) => a + b, 0) };
            }
            prepared = false; startAt = tick + 1 + delay;
        }
    }
    throw new Error("Simulation stalled: " + JSON.stringify(groups));
}
function groupsFromPlan(plan, built) {
    const groups = [];
    plan.phases.forEach((p, i) => {
        const final = i === plan.phases.length - 1;
        const outputs = plan.strategy === "wide" || final ? slots.finalOutputs(built, p.inputs, p.out) : [p.out];
        if (!groups[p.wave]) groups[p.wave] = [];
        groups[p.wave].push({ product: p.product, inputs: p.inputs, outputs, keep: plan.strategy !== "wide" && !final });
    });
    return groups.filter(Boolean);
}

// Exhaustive assignment for the theoretical best full-chain allocation:
// four raw labs + one OH + one LH + one LH2O + three final output labs.
// This allocation hits the count-only upper bound for a 10-lab full pipeline.
function pipelineAssignment() {
    const built = slots.SLOT_NUMBERS;
    const labels = ["H", "O", "L", "X", "OH", "LH", "LH2O"];
    const assigned = {};
    let visited = 0;
    function search(i, free) {
        visited++;
        if (i === labels.length) {
            if (!free.every((s) => slots.reaches(s, assigned.LH2O, assigned.X))) return null;
            return Object.assign({}, assigned, { XLH2O: free });
        }
        const label = labels[i], recipe = recipes[label];
        for (const s of free) {
            if (recipe && !slots.reaches(s, ...recipe.inputs.map((r) => assigned[r]))) continue;
            assigned[label] = s;
            const found = search(i + 1, free.filter((x) => x !== s));
            if (found) return found;
        }
        delete assigned[label];
        return null;
    }
    const mapping = search(0, built);
    assert(mapping, "Count-optimal pipeline must be feasible in this stamp");
    let upper = 0;
    for (let oh = 1; oh <= 3; oh++) for (let lh = 1; lh <= 3; lh++) for (let mid = 1; mid <= 3; mid++) {
        const end = 6 - oh - lh - mid;
        if (end < 1) continue;
        upper = Math.max(upper, Math.min(5 * oh / 20, 5 * lh / 15, 5 * mid / 10, 5 * end / 65));
    }
    assert.equal(upper, 15 / 65);
    const group = Object.keys(recipes).map((product) => ({
        product,
        inputs: recipes[product].inputs.map((r) => mapping[r]),
        outputs: product === "XLH2O" ? mapping[product] : [mapping[product]],
        keep: product !== "XLH2O",
    }));
    return { mapping, visited, idealUnitsPerTick: upper, group };
}

const results = { assumptions: { qty: 3000, reactionAmount: 5, mineralCapacity: 3000, cooldowns: recipes }, rows: [] };
for (const count of [3, 6, 10]) {
    const built = slots.SLOT_NUMBERS.slice(0, count);
    const plans = {};
    for (const strategy of ["waves", "wide", "auto"]) {
        const plan = slots.planPhases(tree("XLH2O"), built, { strategy, work: work(3000) });
        assert(plan.ok);
        plans[strategy] = plan;
    }
    const simulations = {};
    for (const strategy of ["waves", "wide"]) {
        simulations[strategy] = Object.fromEntries([0, 10, 50, 200].map((delay) => [delay, simulate(groupsFromPlan(plans[strategy], built), built, 3000, delay)]));
    }
    results.rows.push({ count, rcl: count === 3 ? 6 : count === 6 ? 7 : 8, bestPair: bestPair(built), selected: plans.auto.strategy,
        estimates: { waves: plans.waves.T, wide: plans.wide.T }, plans, simulations });
}
const pipeline = pipelineAssignment();
results.pipeline = { ...pipeline, simulation: simulate([pipeline.group], slots.SLOT_NUMBERS, 3000) };
results.lotSensitivity = [];
for (const count of [3, 6, 10]) for (const qty of [5, 20, 100, 500, 3000]) {
    const built = slots.SLOT_NUMBERS.slice(0, count);
    const row = { count, qty, strategies: {} };
    for (const strategy of ["waves", "wide", "auto"]) {
        const plan = slots.planPhases(tree("XLH2O"), built, { strategy, work: work(qty) });
        row.strategies[strategy] = { selected: plan.strategy, estimated: plan.T,
            ticks: simulate(groupsFromPlan(plan, built), built, qty).ticks };
    }
    results.lotSensitivity.push(row);
}
let masks = 0, centresOptimal = 0;
const unusable = [];
for (let mask = 0; mask < 1024; mask++) {
    const built = slots.SLOT_NUMBERS.filter((s) => mask & (1 << (s - 1)));
    if (built.length < 3) continue;
    const best = bestPair(built);
    if (!best.outputs.length) unusable.push(built);
    masks++;
    if (built.includes(1) && built.includes(2)) {
        assert.equal(slots.wideOutputs(built).length, built.length - 2);
        assert.equal(best.outputs.length, built.length - 2);
        centresOptimal++;
    }
}
results.partialLayouts = { tested: masks, centresOptimal, unusable };
const out = path.join(__dirname, "lab-production-results.json");
fs.writeFileSync(out, JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify({ rows: results.rows.map(({ count, selected, estimates, simulations }) => ({ count, selected, estimates,
    wavesTicks: simulations.waves[0].ticks, wideTicks: simulations.wide[0].ticks })), pipeline: results.pipeline,
    lotSensitivity: results.lotSensitivity, partialLayouts: { tested: masks, centresOptimal, unusable: unusable.length } }, null, 2));
}
