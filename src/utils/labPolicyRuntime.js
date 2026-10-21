"use strict";

const config = require("./config");
const policy = require("./labPolicy");
const model = require("./labPlanModel");
const labSlots = require("./labSlots");
const labReactions = require("./labReactions");
const census = require("./census");
const cpuMeter = require("./cpuMeter");
const cpuTier = require("./cpuTier");
const labReservations = require("./labReservations");
const reactionAmount = require("./labReactionAmount");
const layoutCache = new Map();
const activeCache = new Map();

// [controller id, level, x, y, owner, then per lab: id, x, y, my, owner - or 0 and four 0s for a missing lab]
function labSignature(controller, labs) {
    const out = [controller.id, controller.level, controller.pos.x, controller.pos.y,
        controller.owner && controller.owner.username];
    labs.forEach((lab) => {
        if (!lab) out.push(0, 0, 0, 0, 0);
        else out.push(lab.id, lab.pos.x, lab.pos.y, lab.my, lab.owner && lab.owner.username);
    });
    return out;
}
function sameSignature(flat, controller, labs) {
    if (flat.length !== 5 + labs.length * 5 || flat[0] !== controller.id || flat[1] !== controller.level ||
        flat[2] !== controller.pos.x || flat[3] !== controller.pos.y ||
        flat[4] !== (controller.owner && controller.owner.username)) return false;
    for (let n = 0, i = 5; n < labs.length; n++, i += 5) {
        const lab = labs[n];
        if (!lab) { if (flat[i] !== 0) return false; continue; }
        if (flat[i] !== lab.id || flat[i + 1] !== lab.pos.x || flat[i + 2] !== lab.pos.y || flat[i + 3] !== lab.my ||
            flat[i + 4] !== (lab.owner && lab.owner.username)) return false;
    }
    return true;
}
function sameMethods(labs, methods) {
    for (let n = 0; n < labs.length; n++) if ((labs[n] && labs[n].isActive) !== methods[n]) return false;
    return true;
}
function activeLabs(room, labs) {
    const controller = room.controller;
    const stable = controller && controller.my === true && Number.isFinite(controller.level) &&
        controller.pos && Number.isFinite(controller.pos.x) && Number.isFinite(controller.pos.y) &&
        labs.every((lab) => !lab || lab.pos && Number.isFinite(lab.pos.x) && Number.isFinite(lab.pos.y));
    const check = () => labs.map((lab) => !!lab && (!lab.isActive || lab.isActive()));
    if (!stable) return check();
    // ROADMAP 0147: the signature is a flat array of primitives compared in place - building a
    // JSON string of every lab each call was the whole cost of this cache hit.
    const cached = activeCache.get(room.name);
    if (cached && Game.time >= cached.tick && sameSignature(cached.signature, controller, labs) &&
        sameMethods(labs, cached.methods)) return cached.active;
    const signature = labSignature(controller, labs);
    const active = check();
    activeCache.delete(room.name);
    const cap = Math.max(1, config.get("craft.policyActiveCacheEntries", 64));
    while (activeCache.size >= cap) activeCache.delete(activeCache.keys().next().value);
    activeCache.set(room.name, { tick: Game.time, signature, active, methods: labs.map((lab) => lab && lab.isActive) });
    return active;
}
function bindings(built, desired, products, map) {
    const key = built.join(",") + ":" + desired.join(",") + ":" + products.map((p) => p + map[p].inputs.join(",")).join(";");
    if (layoutCache.has(key)) return layoutCache.get(key);
    const geometry = model.trios(built), sources = built.map(() => []);
    const pairs = desired.map((p, out) => {
        if (!products.includes(p)) return [];
        const result = geometry.filter((g) => g.out === out && desired[g.a] === map[p].inputs[0] && desired[g.b] === map[p].inputs[1]);
        result.forEach((g) => { for (const i of [g.a, g.b]) if (!sources[i].includes(p)) sources[i].push(p); });
        return result;
    });
    const value = { pairs, sources };
    layoutCache.set(key, value);
    if (layoutCache.size > 256) layoutCache.delete(layoutCache.keys().next().value);
    return value;
}

function resolve(room) {
    const all = labSlots.resolve(room);
    if (!all) return null;
    const mem = Memory.rooms && Memory.rooms[room.name] || {};
    const labs = all.built.map((slot) => Game.getObjectById(all.ids[slot]));
    const active = activeLabs(room, labs);
    const built = all.built.filter((slot, i) => {
        const lab = labs[i];
        return lab && active[i] && !labReservations.blocked(room.name, lab.id) &&
            !(mem.labLoad && !mem.labLoadAuto && mem.labLoad[lab.id]);
    });
    return built.length < 3 ? null : { built, ids: all.ids };
}
function profile(room) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
    const mem = Memory.rooms[room.name];
    if (!mem.labLogistics) mem.labLogistics = { samples: 0, movement: 0, switchSamples: 0, switchTicks: 0 };
    const measured = mem.labLogistics;
    const override = config.get("craft.policyBandwidth", 0);
    const d = config.get("craft.policySwitchDelay", null);
    const bandwidth = override === "instant" ? null : override > 0 ? override :
        Math.max(1, Math.round(measured.samples ? measured.movement / measured.samples : config.get("craft.policyInitialBandwidth", 4)));
    const delay = d !== null ? Math.max(0, d) : Math.min(200, Math.round(measured.switchSamples ?
        measured.switchTicks / measured.switchSamples : config.get("craft.policyInitialDelay", 50)));
    return { bandwidth, delay, buffer: config.get("craft.policyBuffer", 500),
        refillRatio: Math.max(0.1, Math.min(1, config.get("craft.policyRefillRatio", 0.5))),
        allowPipeline: config.get("craft.policyAllowUnmeasuredPipeline", false) ||
            (override === "instant" || override > 0) && d !== null ||
            measured.samples >= config.get("craft.policyLogisticsSamples", 100) && measured.movement > 0 };
}
function remaining(item, state, p) { return Math.max(0, (item.targets[p] || 0) - (state.produced[p] || 0)); }
function phaseRemaining(state, p) { return Math.max(0, (state.quota[p] || 0) - (state.produced[p] || 0)); }
function snapshot(room, chain, item, resolved, state) {
    const logistics = profile(room), map = policy.recipeMap(), need = {};
    const targets = Object.fromEntries(item.order.map((p) => [p, state ? remaining(item, state, p) : item.targets[p]]));
    item.order.forEach((p) => { for (const r of map[p].inputs) need[r] = (need[r] || 0) + targets[p]; });
    // Other chains/manual reservations remain unavailable; our own purchases are usable.
    const commitments = config.get("stockPolicy.enabled", true) ? require("./resourcePolicy").commitments(room, chain.id) : {};
    const stock = {};
    const carriers = census.creepsByRole(room.name, "hauler").filter((creep) => {
        const job = creep.memory.mineralJob;
        return job && (job.policy || job.chain && ["labReagent", "labOutput"].includes(job.kind));
    });
    Object.keys(need).forEach((r) => {
        const total = (room.storage && room.storage.store[r] || 0) + (room.terminal && room.terminal.store[r] || 0) +
            carriers.reduce((sum, creep) => sum + (creep.store[r] || 0), 0);
        stock[r] = Math.min(need[r], Math.max(0, total - (commitments[r] || 0)));
    });
    const labs = resolved.built.map((slot, i) => {
        const lab = Game.getObjectById(resolved.ids[slot]);
        const power = reactionAmount.snapshot(lab);
        return { role: lab.mineralType || state && state.roles[i] || null, ...(power ? { reactionPower: power } : {}),
            amount: lab.mineralType ? lab.store[lab.mineralType] || 0 : 0, next: lab.cooldown || 0, ready: 0,
            refilling: !!(state && state.refilling && state.refilling[i]) };
    });
    return { product: item.product, qty: Math.max(5, ...Object.values(targets)), targets,
        built: resolved.built, stock, labs, ...logistics };
}
function confirm(room, chain, item, state, labs) {
    const map = policy.recipeMap(), adjustments = labs.map(() => ({}));
    const byId = new Map(labs.map((l, i) => [l.id, i]));
    const pending = [];
    for (const intent of state.pending || []) {
        if (intent.tick >= Game.time) { pending.push(intent); continue; }
        const out = Game.getObjectById(intent.out);
        // A cooldown proves execution; an unchanged/expired effect timeline
        // proves its quantity even when haulers moved the output meanwhile.
        const elapsed = Game.time - intent.tick;
        const expected = map[intent.product].cooldown - elapsed;
        const observedPower = reactionAmount.snapshot(out);
        if (expected <= 0 || !reactionAmount.sameAfter(intent.power || null, observedPower, elapsed)) {
            state.uncertain = true;
            continue;
        }
        const success = out && expected > 0 && out.cooldown === expected;
        if (!success) { state.rejected = (state.rejected || 0) + 1; continue; }
        const quantity = intent.amount === undefined ? reactionAmount.base() : intent.amount;
        state.produced[intent.product] = (state.produced[intent.product] || 0) + quantity;
        function change(id, resource, amount) {
            if (!byId.has(id)) return;
            const delta = adjustments[byId.get(id)]; delta[resource] = (delta[resource] || 0) + amount;
        }
        change(intent.out, intent.product, quantity);
        intent.inputs.forEach((id, i) => change(id, map[intent.product].inputs[i], -quantity));
        chain.stateTick = Game.time;
    }
    state.pending = pending;
    if (state.observation && state.observation.tick === Game.time - 1 && state.observation.demand &&
        state.observation.ids.join(",") === labs.map((lab) => lab.id).join(",")) {
        const moved = labs.reduce((sum, lab, i) => {
            const before = state.observation.amounts[i] || 0;
            const now = lab.mineralType ? lab.store[lab.mineralType] || 0 : 0;
            const predicted = { ...adjustments[i] };
            const previousType = state.observation.types[i];
            if (previousType) predicted[previousType] = (predicted[previousType] || 0) + before;
            if (lab.mineralType) predicted[lab.mineralType] = (predicted[lab.mineralType] || 0) - now;
            return sum + Object.values(predicted).reduce((n, amount) => n + Math.abs(amount), 0);
        }, 0);
        const stats = Memory.rooms[room.name].labLogistics;
        // Keep a bounded rolling observation horizon, including waiting ticks.
        if (stats.samples >= config.get("craft.policyLogisticsWindow", 500)) { stats.samples /= 2; stats.movement /= 2; }
        stats.samples++; stats.movement += moved;
        if (moved) chain.stateTick = Game.time;
    }
}
function clear(room) {
    const mem = Memory.rooms[room.name];
    if (mem.labReactionAuto) { delete mem.labReaction; delete mem.labReactions; delete mem.labReactionAuto; }
    delete mem.labPolicyInputs;
    delete mem.labPolicyHold;
    delete mem.labPolicyDesired;
}
function enter(item, state, plan, labs, logistics) {
    const phase = plan.phases[state.phase];
    const amount = phase.amount || plan.window || Math.max(...Object.values(item.targets));
    state.quota = Object.fromEntries(phase.products.map((p) => [p,
        Math.min(item.targets[p] || 0, (state.produced[p] || 0) + amount)]));
    const virtual = labs.map((lab, i) => ({ role: lab.mineralType || state.roles[i] || null,
        amount: lab.mineralType ? lab.store[lab.mineralType] || 0 : 0,
        next: Game.time + (lab.cooldown || 0), ready: Game.time }));
    state.desired = plan.adaptive ? model.layoutFor(phase, virtual, state.quota, state.produced,
        policy.recipeMap(), Game.time, logistics.bandwidth == null ? Infinity : logistics.bandwidth, logistics.delay) : phase.layout.slice();
    state.phaseSince = Game.time;
}
function assignments(room, chain, item, state, plan, resolved, labs) {
    let logistics;
    // The fields used here stay constant within this assignment decision.
    const currentProfile = () => logistics || (logistics = profile(room));
    const map = policy.recipeMap(), phase = plan.phases[state.phase], geometry = model.trios(resolved.built);
    let binding = bindings(resolved.built, state.desired, phase.products, map);
    const consumers = (i) => binding.sources[i].filter((p) => phaseRemaining(state, p));
    if (plan.reassign) for (let i = 0; i < labs.length; i++) {
        const old = state.desired[i];
        if (phaseRemaining(state, old) || consumers(i).length) continue;
        const choices = phase.products.filter((p) => phaseRemaining(state, p) && geometry.some((g) => g.out === i &&
            state.desired[g.a] === map[p].inputs[0] && state.desired[g.b] === map[p].inputs[1]));
        choices.sort((a, b) => phaseRemaining(state, b) * map[b].cooldown /
            Math.max(1, state.desired.filter((r) => r === b).length) - phaseRemaining(state, a) * map[a].cooldown /
            Math.max(1, state.desired.filter((r) => r === a).length) || a.localeCompare(b));
        if (choices.length) {
            state.desired[i] = choices[0];
            binding = bindings(resolved.built, state.desired, phase.products, map);
        }
    }
    const inputs = {}, holds = {}, reactions = [], reasons = {};
    const incoming = new Set(census.creepsByRole(room.name, "hauler").map((creep) => creep.memory.mineralJob)
        .filter((job) => job && job.policy && job.kind === "labReagent").map((job) => job.toId));
    let changing = false, demand = false;
    labs.forEach((lab, i) => {
        const desired = state.desired[i];
        if (state.roles[i] !== desired || lab.mineralType && lab.mineralType !== desired) {
            state.refilling[i] = false;
            if (!state.switching[i]) state.switching[i] = { tick: Game.time,
                amount: lab.mineralType ? lab.store[lab.mineralType] || 0 : 0, tracked: !!state.roles[i] };
            if (lab.mineralType && lab.mineralType !== desired && lab.store[lab.mineralType]) {
                changing = true; demand = true; reasons[lab.id] = "switch"; return;
            }
            state.roles[i] = desired;
            if (!state.switching[i].emptyAt) state.switching[i].emptyAt = Game.time;
        }
        if (state.switching[i] && (!desired || phase.products.includes(desired) || lab.mineralType === desired && lab.store[desired] >= 5)) {
            const stats = Memory.rooms[room.name].labLogistics;
            const start = state.switching[i];
            if (start.tracked) {
                if (stats.switchSamples >= 100) { stats.switchSamples /= 2; stats.switchTicks /= 2; }
                const b = currentProfile().bandwidth;
                const units = phase.products.includes(desired) ? 0 : lab.store[desired] || 0;
                // Transport is already charged by B; D estimates only residual
                // role preparation. Producer cooldown is not a switch delay.
                stats.switchSamples++;
                stats.switchTicks += Math.max(0, Game.time - (start.emptyAt || start.tick) - (b == null ? 0 : units / b));
            }
            state.switching[i] = 0;
        }
        if (!desired) return;
        const use = consumers(i), keep = (phase.keep || []).includes(desired) || use.length;
        if (keep) holds[lab.id] = desired;
        if (use.length) {
            const need = use.reduce((sum, p) => sum + phaseRemaining(state, p), 0);
            const target = Math.floor(Math.min(3000, need, currentProfile().buffer /
                state.desired.filter((r) => r === desired).length));
            const amount = lab.store[desired] || 0;
            if (amount < Math.min(target, Math.max(5, Math.floor(target * currentProfile().refillRatio)))) state.refilling[i] = true;
            if (amount >= target) state.refilling[i] = false;
            inputs[lab.id] = [desired, target, !!state.refilling[i]];
            if (state.refilling[i] && ((room.storage && room.storage.store[desired] || 0) +
                (room.terminal && room.terminal.store[desired] || 0) > 0 || incoming.has(lab.id))) demand = true;
        } else if (lab.mineralType && lab.store[lab.mineralType] >= labReactions.drainThreshold(room, lab) && !keep) demand = true;
    });
    const barrier = phase.barrier && changing || phase.notBefore != null && Game.time < state.selectedTick + phase.notBefore;
    for (let i = 0; i < labs.length; i++) {
        const lab = labs[i], p = state.desired[i];
        if (!phase.products.includes(p) || !phaseRemaining(state, p)) continue;
        if (barrier || state.roles[i] !== p || lab.mineralType && lab.mineralType !== p) { reasons[lab.id] = "switch"; continue; }
        const pairs = binding.pairs[i].filter((g) => state.roles[g.a] === map[p].inputs[0] &&
            state.roles[g.b] === map[p].inputs[1] && state.desired[g.a] === state.roles[g.a] && state.desired[g.b] === state.roles[g.b]);
        pairs.sort((a, b) => Math.min(labs[b.a].store[map[p].inputs[0]] || 0, labs[b.b].store[map[p].inputs[1]] || 0) -
            Math.min(labs[a.a].store[map[p].inputs[0]] || 0, labs[a.b].store[map[p].inputs[1]] || 0) || a.a - b.a || a.b - b.b);
        if (!pairs.length) { reasons[lab.id] = "unavailable"; continue; }
        const pair = pairs[0];
        const quantity = reactionAmount.amount(reactionAmount.snapshot(lab));
        const reason = !quantity ? "powers" : lab.cooldown ? "cooldown" : (lab.store[p] || 0) + quantity > 3000 ? "capacity" :
            (labs[pair.a].store[map[p].inputs[0]] || 0) < quantity || (labs[pair.b].store[map[p].inputs[1]] || 0) < quantity ? "input" : "ready";
        reasons[lab.id] = reason;
        reactions.push({ a: map[p].inputs[0], b: map[p].inputs[1], product: p,
            input1: labs[pair.a].id, input2: labs[pair.b].id, output: lab.id,
            keep: (phase.keep || []).includes(p) || consumers(i).length > 0,
            owner: chain.key || chain.room, remaining: phaseRemaining(state, p),
            quotaKey: [chain.key || chain.room, chain.qi || 0, p, state.phaseSince].join(":") });
    }
    // ROADMAP 0147 probe: would this decision have been identical to the previous one?
    // (an upper bound: it hashes the lab states and the plan position, not every input)
    {
        const probe = require("./probe");
        let h = probe.fold(0, state.phase);
        labs.forEach((lab, i) => {
            h = probe.fold(h, lab.mineralType || ""); h = probe.fold(h, lab.mineralType ? lab.store[lab.mineralType] || 0 : 0);
            h = probe.fold(h, !!lab.cooldown); h = probe.fold(h, state.desired[i] || ""); h = probe.fold(h, state.roles[i] || "");
        });
        phase.products.forEach((p) => { h = probe.fold(h, phaseRemaining(state, p)); });
        probe.hit("labPolicy.assignments", room.name, h);
    }
    const mem = Memory.rooms[room.name];
    delete mem.labReaction;
    mem.labReactions = reactions; mem.labReactionAuto = true;
    mem.labPolicyInputs = inputs;
    mem.labPolicyHold = holds;
    mem.labPolicyDesired = Object.fromEntries(labs.map((lab, i) => [lab.id, state.desired[i]]));
    chain.holds = holds;
    state.wait = reasons;
    state.observation = { tick: Game.time, demand,
        ids: labs.map((lab) => lab.id), types: labs.map((lab) => lab.mineralType),
        amounts: labs.map((lab) => lab.mineralType ? lab.store[lab.mineralType] || 0 : 0) };
}
function tick(room, chain, item) {
    const mem = Memory.rooms[room.name];
    if ((mem.labReaction || (mem.labReactions || []).length) && !mem.labReactionAuto) return false;
    const resolved = cpuMeter.span("labPolicy.resolve", () => resolve(room));
    if (!resolved) {
        reconcile(room, chain, item);
        if (item.run) item.run.wait = { room: "unavailable" };
        clear(room); chain.holds = {};
        return false;
    }
    const labs = resolved.built.map((slot) => Game.getObjectById(resolved.ids[slot]));
    const logistics = cpuMeter.span("labPolicy.profile", () => profile(room));
    if (!item.run) item.run = { catalogue: policy.dataVersion, refilling: labs.map(() => false), produced: Object.fromEntries(item.order.map((p) => [p, 0])),
        pending: [], phase: 0, round: 0, roles: labs.map((lab) => lab.mineralType || null), switching: labs.map(() => 0), started: Game.time };
    const state = item.run;
    if (!state.refilling) state.refilling = labs.map(() => false);
    cpuMeter.span("labPolicy.confirm", () => confirm(room, chain, item, state, labs));
    if (state.uncertain) { clear(room); state.wait = { room: "confirmation-lost" }; return false; }
    const signature = resolved.built.map((slot) => resolved.ids[slot]).join(",");
    if (state.geometry !== signature) {
        clear(room); state.geometry = signature; state.planId = null; state.evalKey = null;
        chain.holds = {};
        state.phase = 0; state.roles = labs.map((lab) => lab.mineralType || null); state.switching = labs.map(() => 0); state.refilling = labs.map(() => false);
    }
    const hasPowers = labs.some((lab) => (lab.effects || []).some((effect) => effect.ticksRemaining > 0));
    const powers = hasPowers ? labs.map((lab) => reactionAmount.snapshot(lab)) : null;
    if (powers && powers.some((power) => power && power.unsupported)) {
        clear(room); state.wait = { room: "powers" }; return false;
    }
    const powerSignature = powers ? powers.map((power) => power ? power.extra + ":" + (Game.time + power.remaining) : "").join(",") : "";
    if ((state.powerSignature || "") !== powerSignature) {
        if (state.pending.length) { clear(room); state.wait = { room: "power-change-pending" }; return false; }
        state.powerSignature = powerSignature; state.planId = null; state.evalKey = null; state.phase = 0; state.enter = true;
    }
    if (!state.planId) {
        clear(room);
        // Freeze existing mineral buffers while evaluating this snapshot.
        mem.labPolicyHold = Object.fromEntries(labs.filter((lab) => lab.mineralType)
            .map((lab) => [lab.id, lab.mineralType]));
        if (!state.evalKey || !cpuMeter.span("labPolicy.poll", () => policy.poll(state.evalKey)))
            state.evalKey = cpuMeter.span("labPolicy.request", () =>
                policy.request(item, snapshot(room, chain, item, resolved, state), logistics.allowPipeline));
        const result = cpuMeter.span("labPolicy.poll", () => policy.poll(state.evalKey));
        state.evaluation = result.status;
        state.wait = { room: "planning" };
        if (!result.best && !result.expired && result.status === "evaluating") return false;
        state.planId = result.best ? result.best.id : "wide-live";
        state.estimate = result.best ? result.best.ticks : null;
        state.selection = result.best ? result.best.name : "wide-live-fallback";
        state.limits = result.failures;
        state.selectedLogistics = [logistics.bandwidth, logistics.delay, logistics.allowPipeline];
        state.selectedTick = Game.time;
        state.enter = true; state.phase = 0;
    }
    const plan = cpuMeter.span("labPolicy.plan", () => policy.planFor(state.planId, item, resolved.built));
    if (!plan) { clear(room); state.planId = null; state.evalKey = null; return false; }
    // Once a plan runs, searching for a better one is optional work: it only spends
    // the policy budget in a band that allows cpu.tiers.labRefine (full by default),
    // otherwise it would burn craft.policyCpuPerTick every tick until the search ends.
    if (state.evalKey && !cpuTier.allows("labRefine")) cpuTier.skip("labRefine");
    else if (state.evalKey) {
        const evaluation = cpuMeter.span("labPolicy.poll", () => policy.poll(state.evalKey));
        if (evaluation) {
            state.evaluation = evaluation.status;
            state.betterCandidate = evaluation.best && evaluation.best.id !== state.planId &&
                (state.estimate == null || evaluation.best.ticks + config.get("craft.policyPlanningTicks", 100) < state.estimate);
        } else { state.evalKey = null; state.betterCandidate = false; }
    }
    // A tick boundary with every intent settled is safe even inside a long
    // phase. Keep confirmed balances and re-evaluate the remaining work, so an
    // early wide fallback need not lock the entire lot into the old plan.
    if (!state.pending.length && state.betterCandidate && state.evaluation === "complete" &&
        Game.time - state.selectedTick >= config.get("craft.policyReplanTicks", 500)) {
        clear(room); state.planId = null; state.evalKey = null; state.phase = 0; state.enter = true;
        return false;
    }
    if (!item.started) { item.started = true; item.startTick = Game.time; }
    if (state.enter) { cpuMeter.span("labPolicy.enter", () => enter(item, state, plan, labs, logistics)); state.enter = false; }
    const phase = plan.phases[state.phase];
    if (!state.pending.length && phase.products.every((p) => !phaseRemaining(state, p))) {
        state.phase++;
        if (state.phase >= plan.phases.length) {
            state.phase = 0; state.round++;
            if (item.order.every((p) => !remaining(item, state, p))) { clear(room); chain.holds = {}; state.done = true; return true; }
            const previous = state.selectedLogistics || [];
            const changed = !policy.enabled() || state.betterCandidate || previous[2] !== logistics.allowPipeline ||
                previous[0] !== logistics.bandwidth && (previous[0] == null || logistics.bandwidth == null ||
                    Math.max(previous[0], logistics.bandwidth) / Math.max(1, Math.min(previous[0], logistics.bandwidth)) >= 1.5) ||
                Math.abs(previous[1] - logistics.delay) >= 10;
            if (changed && (!policy.enabled() || Game.time - state.selectedTick >= config.get("craft.policyReplanTicks", 500))) {
                clear(room); state.planId = null; state.evalKey = null; state.enter = true; return false;
            }
        }
        state.enter = true;
        cpuMeter.span("labPolicy.enter", () => enter(item, state, plan, labs, logistics)); state.enter = false;
    }
    cpuMeter.span("labPolicy.assignments", () => assignments(room, chain, item, state, plan, resolved, labs));
    if (powerSignature) {
        const events = labs.map((lab, i) => Math.max(Game.time + (lab.cooldown || 0), powers[i] ? Game.time + powers[i].remaining : 0));
        state.nextWakeTick = Math.min(...events.filter((tick) => tick > Game.time));
        if (!Number.isFinite(state.nextWakeTick)) state.nextWakeTick = Game.time;
        const stamp = Math.max(state.phaseSince || 0, chain.stateTick || 0);
        if (state.stallStamp !== stamp) { state.stallStamp = stamp; state.stallDeadline =
            Math.max(stamp, state.nextWakeTick) + config.get("craft.operatedStallTicks", 300); }
        if (Game.time >= state.stallDeadline) {
            clear(room); state.planId = null; state.evalKey = null; state.enter = true;
            state.wait = { room: "operated-stall-replan" }; delete state.stallStamp;
            return false;
        }
    }
    return true;
}
function reconcile(room, chain, item) {
    if (!item.run) return;
    profile(room);
    const ids = (item.run.geometry || "").split(",").filter(Boolean);
    const labs = ids.map((id) => Game.getObjectById(id)).filter(Boolean);
    confirm(room, chain, item, item.run, labs);
}
module.exports = { tick, snapshot, profile, resolve, clear, reconcile,
    // exposed for the offline oracle (ROADMAP 0147)
    activeLabs };
