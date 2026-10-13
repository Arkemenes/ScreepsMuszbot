"use strict";

const assert = require("node:assert/strict");
const { recipes, order, tree, rawStock } = require("./recipes.cjs");
const { trios } = require("./model.cjs");
const labSlots = require("../../src/utils/labSlots");
const WIDTH = 64, LIMIT = 100000, EXACT_LIMIT = 200000;
function distinctBest(states, score, width = WIDTH) {
    const seen = new Set();
    return states.map((state) => { const value = score(state); return { state, rank: Array.isArray(value) ? value : [value], key: JSON.stringify(state) }; })
        .sort((a, b) => {
            for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
                const delta = (a.rank[i] || 0) - (b.rank[i] || 0); if (delta) return delta;
            }
            return a.key.localeCompare(b.key);
        }).filter((s) => { if (seen.has(s.key)) return false; seen.add(s.key); return true; }).slice(0, width).map((s) => s.state);
}
function layoutScore(layout, products) {
    const counts = {};
    layout.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
    return Math.max(...products.map((p) => recipes[p].cooldown / (counts[p] || 0.01))) + (counts[null] || 0) * 0.001;
}
function layoutsFor(products, built, budget) {
    const set = new Set(products), geometry = trios(built);
    const external = [...new Set(products.flatMap((p) => recipes[p].inputs).filter((r) => !set.has(r)))];
    const labels = external.concat(products);
    const ceiling = budget.layoutLimit || LIMIT;
    if (labels.length > built.length || budget.expanded >= ceiling) return [];
    let beam = [Array(built.length).fill(null)];
    function canAssign(layout, index, label) {
        if (!set.has(label)) return true;
        const [a, b] = recipes[label].inputs;
        return geometry.some((g) => g.out === index && layout[g.a] === a && layout[g.b] === b);
    }
    function partialScore(layout) {
        let score = 0;
        for (const p of products) {
            const [a, b] = recipes[p].inputs;
            if (layout.includes(a) && layout.includes(b)) {
                score -= geometry.filter((g) => (!layout[g.out] || layout[g.out] === p) && layout[g.a] === a && layout[g.b] === b).length * recipes[p].cooldown;
            }
        }
        return score;
    }
    for (const label of labels) {
        const next = [];
        for (const layout of beam) for (let i = 0; i < layout.length; i++) {
            if (layout[i] || !canAssign(layout, i, label)) continue;
            if (budget.expanded >= ceiling) break;
            budget.expanded++;
            const copy = layout.slice(); copy[i] = label; next.push(copy);
        }
        beam = distinctBest(next, partialScore);
        if (!beam.length || budget.expanded >= ceiling) return [];
    }
    // Fill remaining slots with additional producers or reagent copies. Each
    // placement preserves feasibility; unused slots are also legal candidates.
    for (let n = labels.length; n < built.length; n++) {
        const next = [];
        for (const layout of beam) {
            const i = layout.indexOf(null);
            if (i < 0) { next.push(layout); continue; }
            for (const label of products.concat(external, [null])) {
                if (!canAssign(layout, i, label)) continue;
                if (budget.expanded >= ceiling) break;
                budget.expanded++;
                const copy = layout.slice(); copy[i] = label;
                // A null placement marks this slot unavailable for this pass.
                if (label === null) copy[i] = "-";
                next.push(copy);
            }
        }
        beam = distinctBest(next, (l) => layoutScore(l, products));
        if (budget.expanded >= ceiling) break;
    }
    return distinctBest(beam.map((l) => l.map((r) => r === "-" ? null : r)), (l) => layoutScore(l, products), 8);
}
function phaseEstimate(phase, qty) {
    const counts = {};
    phase.layout.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    return Math.max(...phase.products.map((p) => Math.ceil(qty / 5 / counts[p]) * recipes[p].cooldown));
}
function estimate(plan, qty) {
    const w = plan.window || qty, rounds = Math.ceil(qty / w);
    const last = qty - (rounds - 1) * w;
    return (rounds - 1) * plan.phases.reduce((s, p) => s + phaseEstimate(p, w), 0) + plan.phases.reduce((s, p) => s + phaseEstimate(p, last), 0);
}
function movementEstimate(plan, qty) {
    return plan.phases.reduce((sum, phase) => {
        const set = new Set(phase.products);
        const externalLoads = phase.products.reduce((n, p) => n + recipes[p].inputs.filter((r) => !set.has(r)).length, 0);
        const exports = phase.products.filter((p) => !phase.products.some((q) => recipes[q].inputs.includes(p))).length;
        return sum + qty * (externalLoads + exports);
    }, 0);
}
function switchEstimate(phases) {
    let changes = 0;
    for (let i = 1; i < phases.length; i++) phases[i].layout.forEach((r, slot) => {
        if (r && phases[i - 1].layout[slot] && r !== phases[i - 1].layout[slot]) changes++;
    });
    return changes;
}
function baselinePlans(product, qty, built) {
    const steps = order(product);
    const work = Object.fromEntries(steps.map((p) => [p, { batches: qty / 5, cooldown: recipes[p].cooldown }]));
    const saved = global.Memory;
    global.Memory = { settings: { craft: { wideLabs: true, parallelLabs: true, parallelExtraMoves: 4 } } };
    const plans = [];
    try {
        for (const strategy of ["waves", "wide"]) {
            const p = labSlots.planPhases(tree(product), built, { strategy, work });
        if (!p || !p.ok) {
            if (!plans.unavailable) plans.unavailable = [];
            plans.unavailable.push({ name: strategy, reason: p && p.reason || "no-plan" });
            continue;
        }
            const phases = [];
            p.phases.forEach((phase, i) => {
                if (!phases[phase.wave]) phases[phase.wave] = { products: [], layout: built.map(() => null), keep: [], barrier: true };
                const group = phases[phase.wave];
                group.products.push(phase.product);
                recipes[phase.product].inputs.forEach((r, n) => { group.layout[built.indexOf(phase.inputs[n])] = r; });
                const final = i === p.phases.length - 1;
                const outputs = strategy === "wide" || final ? labSlots.finalOutputs(built, phase.inputs, phase.out) : [phase.out];
                outputs.forEach((s) => { group.layout[built.indexOf(s)] = phase.product; });
                if (strategy === "waves" && !final) group.keep.push(phase.product);
            });
            plans.push({ name: strategy, family: strategy, window: qty, phases: phases.filter(Boolean) });
        }
    } finally { global.Memory = saved; }
    if (product === "XLH2O" && built.length === 10) {
        const layout = ["H", "LH2O", "O", "L", "LH", "OH", "XLH2O", "X", "XLH2O", "XLH2O"];
        plans.push({ name: "pipeline-known", family: "pipeline", window: qty, phases: [{ products: steps, layout, keep: steps.filter((p) => p !== product) }] });
    }
    return plans;
}
function beamPlans(product, qty, built, templates) {
    const steps = order(product), all = (1 << steps.length) - 1;
    const budget = { expanded: templates ? templates.expanded : 0, layoutLimit: 60000 };
    const groups = templates ? templates.groups : [];
    const masks = Array.from({ length: all }, (_, i) => i + 1);
    const size = (m) => steps.filter((_, i) => m & (1 << i)).length;
    masks.sort((a, b) => (size(a) === 1 ? 0 : 1) - (size(b) === 1 ? 0 : 1) || size(b) - size(a) || a - b);
    if (!templates) for (const mask of masks) {
        const products = steps.filter((_, i) => mask & (1 << i));
        const layouts = layoutsFor(products, built, budget);
        if (layouts.length) groups.push({ mask, products, layouts });
    }
    const layoutExpanded = budget.expanded;
    const needs = steps.map((p) => recipes[p].inputs.reduce((mask, r) => steps.includes(r) ? mask | (1 << steps.indexOf(r)) : mask, 0));
    const windows = [...new Set([qty, 500, 100, 20, 5].filter((w) => w <= qty))];
    const complete = [];
    const windowLimits = [];
    for (let wi = 0; wi < windows.length; wi++) {
        const window = windows[wi];
        const ceiling = layoutExpanded + Math.floor((LIMIT - layoutExpanded) * (wi + 1) / windows.length);
        let beam = [{ done: 0, phases: [], projected: 0 }];
        for (let depth = 0; depth < steps.length && beam.length && budget.expanded < ceiling; depth++) {
            const next = [];
            for (const state of beam) for (const group of groups) {
                if (group.mask & state.done) continue;
                const union = state.done | group.mask;
                if (steps.some((_, i) => (group.mask & (1 << i)) && (needs[i] & ~union))) continue;
                for (const layout of group.layouts) {
                    if (budget.expanded >= ceiling) break;
                    budget.expanded++;
                    const phase = { products: group.products, layout, keep: group.products.filter((p) => p !== product) };
                    const phases = state.phases.concat(phase);
                    const projected = state.projected + phaseEstimate(phase, window);
                    if (union === all) complete.push({ name: "beam", family: phases.some((p) => p.products.length === steps.length) ? "pipeline" : "hybrid", window, phases });
                    else next.push({ done: union, phases, projected });
                }
            }
            beam = distinctBest(next, (s) => [s.projected + steps.reduce((sum, p, i) => sum + (s.done & (1 << i) ? 0 : window / 5 * recipes[p].cooldown / Math.max(1, built.length - 2)), 0),
                movementEstimate({ phases: s.phases }, window), switchEstimate(s.phases)]);
        }
        if (budget.expanded >= ceiling) windowLimits.push(window);
        if (budget.expanded >= LIMIT) break;
    }
    // Retain different window sizes rather than letting one fluid estimate erase
    // all short-window schedules. Every final candidate is physically replayed.
    const buckets = windows.map((w) => distinctBest(complete.filter((p) => p.window === w), (p) => [estimate(p, qty), movementEstimate(p, qty), switchEstimate(p.phases)], 16));
    const retained = [];
    for (let i = 0; i < 16 && retained.length < 32; i++) for (const bucket of buckets) {
        if (bucket[i] && retained.length < 32) retained.push(bucket[i]);
    }
    const candidates = retained.flatMap((p) => {
        const phases = p.phases.map((phase) => ({ ...phase,
            alternatives: groups.find((g) => g.products.join(",") === phase.products.join(",")).layouts }));
        return [p, { ...p, name: "beam-adaptive", reassign: true, adaptive: true, phases }];
    }).slice(0, WIDTH);
    return { candidates, templates: { groups, expanded: layoutExpanded },
        expanded: Math.min(LIMIT, budget.expanded), layoutTruncated: layoutExpanded >= budget.layoutLimit, windowLimits,
        reason: budget.expanded >= LIMIT ? "expansion-limit" : layoutExpanded >= budget.layoutLimit ? "layout-limit" : windowLimits.length ? "window-allocation-limit" : "beam-complete", width: WIDTH, limit: LIMIT };
}

class Heap {
    constructor() { this.items = []; }
    push(node) {
        const a = this.items; a.push(node); let i = a.length - 1;
        while (i) { const parent = (i - 1) >> 1; if (a[parent].time <= node.time) break; a[i] = a[parent]; i = parent; } a[i] = node;
    }
    pop() {
        const a = this.items, first = a[0], last = a.pop();
        if (a.length) { let i = 0; while (2 * i + 1 < a.length) { let c = 2 * i + 1; if (c + 1 < a.length && a[c + 1].time < a[c].time) c++; if (a[c].time >= last.time) break; a[i] = a[c]; i = c; } a[i] = last; }
        return first;
    }
}
function exactSmall(product, qty, built, limit = EXACT_LIMIT) {
    assert(built.length === 3 && qty <= 20 && qty % 5 === 0);
    const geometry = trios(built);
    // This particular three-slot stamp is a complete range-2 triangle. Cooldown
    // permutations are true symmetries, not arbitrary pruning by lab identity.
    assert.equal(geometry.length, 6);
    const steps = order(product), target = qty / 5, raw = rawStock(product, target);
    const queue = new Heap(), seen = new Map();
    const first = { counts: steps.map(() => 0), next: [0, 0, 0], time: 0, prev: null, action: null };
    queue.push(first);
    let expanded = 0;
    function key(s) { return s.counts.join(",") + "|" + s.next.map((t) => Math.max(0, t - s.time)).sort((a, b) => a - b).join(","); }
    function inventory(counts) {
        const stock = { ...raw };
        steps.forEach((p, i) => { stock[p] = (stock[p] || 0) + counts[i]; recipes[p].inputs.forEach((r) => { stock[r] = (stock[r] || 0) - counts[i]; }); });
        return stock;
    }
    while (queue.items.length && expanded < limit) {
        const s = queue.pop(), k = key(s);
        if (seen.has(k) && seen.get(k) <= s.time) continue;
        seen.set(k, s.time); expanded++;
        if (s.counts.every((n) => n === target)) {
            const actions = [];
            for (let n = s; n.prev; n = n.prev) if (n.action) actions.push(n.action);
            actions.reverse();
            const phases = actions.map((action) => {
                const layout = built.map(() => null), other = built.map((_, i) => i).filter((i) => i !== action.out);
                layout[action.out] = action.product;
                recipes[action.product].inputs.forEach((r, n) => { layout[other[n]] = r; });
                return { products: [action.product], layout, amount: 5, notBefore: action.tick };
            });
            return { reason: "optimal-proved", expanded, limit, ticks: s.time,
                model: "three-labs-instant-logistics", plan: { name: "exact", family: "hybrid", window: qty, phases }, actions };
        }
        const stock = inventory(s.counts), out = s.next.findIndex((t) => t <= s.time);
        if (out >= 0) for (let i = 0; i < steps.length; i++) {
            const p = steps[i];
            if (s.counts[i] >= target || recipes[p].inputs.some((r) => (stock[r] || 0) < 1)) continue;
            const counts = s.counts.slice(), next = s.next.slice(); counts[i]++; next[out] = s.time + recipes[p].cooldown;
            queue.push({ counts, next, time: s.time + 1, prev: s, action: { tick: s.time, out, product: p } });
        }
        const future = s.next.filter((t) => t > s.time);
        if (future.length) queue.push({ ...s, time: Math.min(...future), prev: s, action: null });
    }
    return { reason: queue.items.length ? "state-limit" : "exhausted", expanded, limit, ticks: null, model: "three-labs-instant-logistics" };
}
module.exports = { WIDTH, LIMIT, EXACT_LIMIT, baselinePlans, beamPlans, exactSmall, movementEstimate, estimate };
