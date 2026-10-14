// ROADMAP 0111: fixed lab layout (the stamp in rooms/architect.js is never
// rotated or mirrored, so slot positions are constant offsets) and the phase
// planner that maps a reaction tree onto whatever slots are actually built.
// Slot numbers follow the stamp's RCL build order: 1,2,3 at RCL6, 4,5,6 at
// RCL7, 7..10 at RCL8. Slots 1 and 2 (the centre pair) reach every other lab
// (range <= 2, runReaction's real requirement), so they double as the "wide
// mode" inputs for a single-level product.
const roomCache = require("./roomCache");
const config = require("./config");

// slot -> [row, col] inside the stamp
const OFFSETS = {
    1: [2, 3], 2: [3, 2], 3: [1, 4], 4: [1, 1], 5: [2, 1],
    6: [1, 2], 7: [3, 4], 8: [4, 3], 9: [4, 4], 10: [4, 1],
};
const SLOT_NUMBERS = Object.keys(OFFSETS).map(Number);
const phaseGeometryCache = new Map();

function distance(a, b) {
    return Math.max(Math.abs(OFFSETS[a][0] - OFFSETS[b][0]), Math.abs(OFFSETS[a][1] - OFFSETS[b][1]));
}
function reaches(out, a, b) {
    return out !== a && out !== b && distance(out, a) <= 2 && distance(out, b) <= 2;
}

// --- room resolution (heap cache, invalidated when the lab set changes) ----
const cache = {};

function resolve(room, labs) {
    const list = labs || roomCache.structuresByType(room, STRUCTURE_LAB);
    if (!list.length) return null;
    const signature = list.map((lab) => lab.id).sort().join(",");
    if (cache[room.name] && cache[room.name].signature === signature) return cache[room.name].value;
    let best = null;
    SLOT_NUMBERS.forEach((slot) => {
        const x0 = list[0].pos.x - OFFSETS[slot][1];
        const y0 = list[0].pos.y - OFFSETS[slot][0];
        const ids = {};
        let matched = 0;
        list.forEach((lab) => {
            const found = SLOT_NUMBERS.find((s) =>
                x0 + OFFSETS[s][1] === lab.pos.x && y0 + OFFSETS[s][0] === lab.pos.y);
            if (found) { ids[found] = lab.id; matched++; }
        });
        if (matched !== list.length) return;
        const rank = Object.keys(ids).reduce((sum, s) => sum + Number(s), 0);
        if (!best || rank < best.rank) best = { rank, ids, origin: { x: x0, y: y0 } };
    });
    const value = best ? { ids: best.ids, origin: best.origin, built: Object.keys(best.ids).map(Number).sort((a, b) => a - b) } : null;
    cache[room.name] = { signature, value };
    return value;
}

// --- reaction trees ---------------------------------------------------------
// tree node: { product, inputs: [node | "mineral", node | "mineral"] }
function treeFromSteps(product, steps, recipeOf) {
    const made = {};
    steps.forEach((step) => { if (step.kind === "lab") made[step.product] = true; });
    function build(resourceType) {
        const recipe = recipeOf(resourceType);
        const inputs = Object.keys(recipe.components).map((component) =>
            made[component] ? build(component) : component);
        if (inputs.length === 1) inputs.push(inputs[0]);
        return { product: resourceType, inputs };
    }
    return made[product] ? build(product) : null;
}

function postOrder(node, out) {
    node.inputs.forEach((input) => { if (typeof input !== "string") postOrder(input, out); });
    out.push(node);
    return out;
}

function heightOf(node) {
    return node.inputs.reduce((h, input) => (typeof input === "string" ? h : Math.max(h, heightOf(input) + 1)), 0);
}

// Minimum-move assignment of a reaction tree onto `built` slots.
// ops per reaction: drain (slot reused while holding residue), load (leaf
// reagent), reload (parked intermediate back from storage), park (intermediate
// to storage to free its slot). moves = drains + reloads + parks.
//
// ROADMAP 0115: reactions of the same tree height do not depend on each other, so they
// can run at the same time ("waves": heights 0, 1, 2...). A wave plan gives each of them
// slots of its own (inputs and output never shared inside the wave); every phase carries
// its `wave`, and the executor starts one wave together. It is used when it exists and
// costs at most craft.parallelExtraMoves more moves than the sequential plan; otherwise
// (too few labs, or craft.parallelLabs off) the plan is the old sequential one, one
// phase per wave. options.parallel overrides craft.parallelLabs.
function planInPlace(tree, built, options) {
    const slots = built.slice().sort((a, b) => a - b);
    const sequential = run(postOrder(tree, []), slots, false);
    const wanted = options && options.parallel !== undefined ? options.parallel : config.get("craft.parallelLabs", true);
    if (!wanted || !sequential.ok) return sequential;
    const reactions = postOrder(tree, []);
    reactions.forEach((node) => { node.wave = heightOf(node); });
    if (new Set(reactions.map((node) => node.wave)).size === reactions.length) return sequential; // a chain: nothing to overlap
    reactions.sort((a, b) => a.wave - b.wave); // stable: children (lower height) always first
    const waves = run(reactions, slots, true);
    if (waves.ok && waves.moves <= sequential.moves + config.get("craft.parallelExtraMoves", 4)) return waves;
    return sequential;
}

function run(reactions, slots, waves) {
    const limit = reactions.length * 3 + 4;
    let nodes = 0;
    for (let budget = 0; budget <= limit; budget++) {
        const found = search(reactions, 0, slots, { live: {}, dirty: {}, where: {}, used: {}, wave: -1 }, budget, [], () => ++nodes > 30000, waves);
        if (found) {
            const parks = found.reduce((sum, p) => sum + p.ops.filter((o) => o.op === "park").length, 0);
            return { ok: true, moves: budget, mode: parks ? "park" : budget ? "reuse" : "tree", parallel: waves, phases: found };
        }
        if (nodes > 30000) break;
    }
    return { ok: false, reason: slots.length < 3 ? "too-few-labs" : "no-phase-plan" };
}

// slots ordered with the centre pair (1, 2) first or last, the rest in slot order
function byCentre(slots, centreFirst) {
    const centre = (s) => (s === 1 || s === 2 ? 0 : 1);
    return slots.slice().sort((a, b) => (centreFirst ? centre(a) - centre(b) : centre(b) - centre(a)) || a - b);
}

function search(reactions, index, slots, state, budget, phases, stalled, waves) {
    if (stalled()) return null;
    if (index === reactions.length) return phases;
    const node = reactions[index];
    // inside a wave no slot is shared between reactions (inputs or output)
    const used = waves && state.wave === node.wave ? state.used : {};
    const free = (s, extra) => !state.live[s] && extra.indexOf(s) < 0 && !used[s];
    // The centre labs (slots 1 and 2) reach every other lab, so the FINAL reaction wants
    // them as its inputs: that is what lets it run on up to 8 output labs. Earlier
    // reactions therefore keep off the centre, except the ones feeding the final
    // reaction, whose product should land there (and stay in place for it).
    const root = reactions[reactions.length - 1];
    const isRoot = node === root;
    const feedsRoot = !isRoot && root.inputs.indexOf(node) >= 0;
    const inOrder = byCentre(slots, isRoot);
    const outOrder = byCentre(slots, feedsRoot);
    // choose slots for the two inputs (sub-products already placed, or leaves/reloads)
    function pickInputs(i, chosen, ops, cost, cont) {
        if (i === 2) return cont(chosen, ops, cost);
        const input = node.inputs[i];
        if (typeof input !== "string" && state.where[input.product] !== undefined && state.where[input.product] !== "parked") {
            return pickInputs(i + 1, chosen.concat(state.where[input.product]), ops, cost, cont);
        }
        const parked = typeof input !== "string";
        for (const s of inOrder) {
            if (!free(s, chosen)) continue;
            const extraCost = (state.dirty[s] ? 1 : 0) + (parked ? 1 : 0);
            if (cost + extraCost > budget) continue;
            const added = [];
            if (state.dirty[s]) added.push({ op: "drain", slot: s });
            added.push({ op: parked ? "reload" : "load", slot: s, item: parked ? input.product : input });
            const result = pickInputs(i + 1, chosen.concat(s), ops.concat(added), cost + extraCost, cont);
            if (result) return result;
        }
        return null;
    }
    return pickInputs(0, [], [], 0, (inputSlots, ops, cost) => {
        for (const out of outOrder) {
            if (!free(out, inputSlots) || !reaches(out, inputSlots[0], inputSlots[1])) continue;
            const outCost = cost + (state.dirty[out] ? 1 : 0);
            if (outCost > budget) continue;
            const phaseOps = ops.concat(state.dirty[out] ? [{ op: "drain", slot: out }] : []);
            const nextUsed = Object.assign({}, used);
            inputSlots.concat(out).forEach((s) => { nextUsed[s] = true; });
            const next = {
                live: Object.assign({}, state.live), dirty: Object.assign({}, state.dirty),
                where: Object.assign({}, state.where), used: nextUsed, wave: waves ? node.wave : -1,
            };
            inputSlots.forEach((s) => { delete next.live[s]; next.dirty[s] = true; });
            node.inputs.forEach((input) => { if (typeof input !== "string") delete next.where[input.product]; });
            next.live[out] = true; next.dirty[out] = true; next.where[node.product] = out;
            const phase = { product: node.product, inputs: inputSlots, out, ops: phaseOps, wave: waves ? node.wave : index };
            const isRoot = index === reactions.length - 1;
            // keep in place first; parking (storage round trip) only as a fallback
            const kept = search(reactions, index + 1, slots, next, budget - outCost, phases.concat(phase), stalled, waves);
            if (kept) return kept;
            if (!isRoot && outCost + 2 <= budget) {
                const parkedState = {
                    live: Object.assign({}, next.live), dirty: next.dirty, where: Object.assign({}, next.where),
                    used: next.used, wave: next.wave,
                };
                delete parkedState.live[out]; parkedState.where[node.product] = "parked";
                const parkedPhase = Object.assign({}, phase, { ops: phaseOps.concat({ op: "park", slot: out, item: node.product }) });
                const result = search(reactions, index + 1, slots, parkedState, budget - outCost - 2, phases.concat(parkedPhase), stalled, waves);
                if (result) return result;
            }
        }
        return null;
    });
}

// --- strategies and production time (ROADMAP 0116) ------------------------------------
// Two ways to run a reaction tree:
//  - "waves"  (planInPlace): intermediates stay in the lab that made them (one output lab
//    each, independent steps overlap), the final step runs wide;
//  - "wide"   (planWide): EVERY step runs on all the labs that reach the centre pair
//    (slots 1 and 2 are the inputs of every step), one step after the other; each step's
//    product goes to storage and the next step receives it like any other reagent.
// What decides the time is how many labs react at once: the work (sum of batches x cooldown,
// ~63000 lab-ticks for XLH2O) divided by the output labs. Hence "wide" on a 10-lab room is
// ~3x faster than waves of one lab each. planPhases picks by estimated time.

// work: {product: {batches, cooldown}} for the lab steps of a candidate
function workFromSteps(steps, recipeOf) {
    const work = {};
    steps.forEach((step) => {
        if (step.kind !== "lab") return;
        const recipe = recipeOf(step.product);
        if (recipe) work[step.product] = { batches: step.batches, cooldown: recipe.cooldown };
    });
    return work;
}

function stepTime(work, product, outputs) {
    const w = work[product];
    return w ? Math.ceil(w.batches / Math.max(1, outputs)) * (Number(w.cooldown) || 0) : 0;
}

// Production time of a phase plan: a wave takes as long as its slowest step. The final step
// of a "waves" plan, and every step of a "wide" plan, react on every lab that reaches both
// of their inputs (craft.wideLabs); the other steps on one.
function estimateTime(plan, built, work) {
    const wide = config.get("craft.wideLabs", true);
    const perWave = {};
    plan.phases.forEach((phase, index) => {
        const final = index === plan.phases.length - 1;
        const n = (plan.strategy === "wide" || final) && wide ? finalOutputs(built, phase.inputs, phase.out).length : 1;
        perWave[phase.wave] = Math.max(perWave[phase.wave] || 0, stepTime(work, phase.product, n));
    });
    return Object.keys(perWave).reduce((sum, wave) => sum + perWave[wave], 0);
}

// Every step on the centre pair, in sequence. Needs both centre labs built.
function planWide(tree, built) {
    if (built.indexOf(1) < 0 || built.indexOf(2) < 0) return null;
    const out = built.filter((s) => s !== 1 && s !== 2 && reaches(s, 1, 2)).sort((a, b) => a - b)[0];
    if (out === undefined) return null;
    return {
        ok: true, strategy: "wide", moves: 0, mode: "wide", parallel: false,
        phases: postOrder(tree, []).map((node, index) => ({ product: node.product, inputs: [1, 2], out, ops: [], wave: index })),
    };
}

// options.work turns on the strategy choice (and `T`, the estimated production time);
// without it the plan is the in-place one, as before.
// options.strategy overrides craft.labStrategy ("auto" | "waves" | "wide").
function planPhases(tree, built, options) {
    // Search depends on topology/recipe shape, not batches or cooldowns.
    // Keep immutable search results in the heap and return independent copies.
    const shape = (node) => typeof node === "string" ? node : [node.product, node.inputs.map(shape)];
    const parallel = options && options.parallel !== undefined ? options.parallel : config.get("craft.parallelLabs", true);
    const key = JSON.stringify([shape(tree), built.slice().sort((a, b) => a - b), parallel,
        config.get("craft.parallelExtraMoves", 4)]);
    let geometry = phaseGeometryCache.get(key);
    if (!geometry) {
        geometry = { base: planInPlace(tree, built, options), wide: planWide(tree, built) };
        phaseGeometryCache.set(key, geometry);
        const cap = Math.max(1, Number(config.get("craft.phaseCacheEntries", 128)) || 128);
        if (phaseGeometryCache.size > cap) phaseGeometryCache.delete(phaseGeometryCache.keys().next().value);
    }
    const copy = (plan) => plan && ({ ...plan, ...(plan.phases ? { phases: plan.phases.map((p) => ({ ...p,
        inputs: p.inputs.slice(), ops: p.ops.map((op) => ({ ...op })) })) } : {}) });
    const base = copy(geometry.base);
    const work = options && options.work;
    if (!work) return base;
    if (base.ok) { base.strategy = "waves"; base.T = estimateTime(base, built, work); }
    const mode = (options && options.strategy) || config.get("craft.labStrategy", "auto");
    const wide = config.get("craft.wideLabs", true) && mode !== "waves" ? copy(geometry.wide) : null;
    if (!wide) return base;
    wide.T = estimateTime(wide, built, work);
    if (!base.ok || mode === "wide") return wide;
    // the wide plan moves every product through storage: it must be clearly faster
    return wide.T <= base.T * (1 - config.get("craft.wideMinGain", 0.2)) ? wide : base;
}

// A single-level product runs wide: slots 1+2 feed every other built lab.
function wideOutputs(built) {
    if (built.indexOf(1) < 0 || built.indexOf(2) < 0) return [];
    return built.filter((s) => s !== 1 && s !== 2 && reaches(s, 1, 2));
}

// ROADMAP 0111 (user request, 2026-10-02): the FINAL reaction of a chain runs wide.
// Only the lab that calls runReaction() goes on cooldown (the two input labs just
// lose 5 of each reagent per reaction), so every built lab that reaches BOTH input
// labs (range <= 2) can react at the same time from the same two inputs. Returns
// [out, ...others] in slot order, `out` (the planned output) first. With the centre
// pair (slots 1 and 2) as inputs on 10 labs that is 8 outputs.
function finalOutputs(built, inputs, out) {
    const others = built
        .filter((s) => s !== out && inputs.indexOf(s) < 0 && reaches(s, inputs[0], inputs[1]))
        .sort((a, b) => a - b);
    return [out].concat(others);
}

module.exports = {
    OFFSETS, SLOT_NUMBERS, distance, reaches, resolve, treeFromSteps,
    planPhases, planWide, workFromSteps, wideOutputs, finalOutputs,
    resetCache() { Object.keys(cache).forEach((k) => delete cache[k]); phaseGeometryCache.clear(); },
};
