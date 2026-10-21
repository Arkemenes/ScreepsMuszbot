// Tick-local WORK intent model. Engine reference: 80977824199a596d174d392fd0cf8c458c21fcbd.
// No Game/Memory scans, persistent journal or claim of server confirmation.
const noBoosts = [];
const workMethods = ["repair", "build", "upgradeController"];
const workActions = ["build", "repair", "upgrade"];
const flowMethods = ["drop", "transfer", "withdraw", "pickup"];
function controllerLimit(target, tick) {
    if (target.level !== 8) return Infinity;
    if (typeof CONTROLLER_MAX_UPGRADE_PER_TICK !== "number") return null;
    let limit = CONTROLLER_MAX_UPGRADE_PER_TICK;
    const power = typeof PWR_OPERATE_CONTROLLER === "undefined" ? null : PWR_OPERATE_CONTROLLER;
    for (const effect of target.effects || []) {
        const valid = effect.endTime !== undefined ? effect.endTime >= tick : effect.ticksRemaining >= 0;
        if (effect.effect !== power && effect.power !== power || !valid) continue;
        const info = typeof POWER_INFO !== "undefined" && POWER_INFO[power];
        if (info && info.effect && Number.isFinite(info.effect[effect.level - 1])) limit += info.effect[effect.level - 1];
        else return null;
        break;
    }
    return limit;
}

function targetData(action, target, tick) {
    if (!target) return { key: null, need: 0, unknown: true };
    const key = target.id || target;
    if (action === "build" || action === "repair") {
        const need = action === "build" ? target.progressTotal - target.progress : target.hitsMax - target.hits;
        return { key, need: Number.isFinite(need) ? Math.max(0, need) : Infinity,
            unknown: !Number.isFinite(need), type: target.structureType };
    }
    return { key, limit: controllerLimit(target, tick), blocked: target.upgradeBlocked > 0 };
}

function effectFor(state, action, base, need) {
    const extras = state.boosts ? state.boosts[action] : noBoosts;
    let effect = base;
    for (let i = 0; i < Math.min(extras.length, Math.floor(base)); i++) effect += extras[i];
    return Math.min(need, Math.floor(effect));
}

function create(tick) {
    const identities = new Map();
    const states = [];
    const externalTargets = new Set();
    let revision = 0, cacheRevision = -1, cached, sequence = 0, cacheHasEvents = false;
    function stateFor(creep) {
        if (!creep) return null;
        const key = creep.id || creep.name || creep;
        if (identities.has(key)) return identities.get(key);
        const body = creep.body;
        if (!body || !creep.room || !creep.store) return null;
        let work = 0, unknownBoost = false, boosts = null;
        for (const part of body) {
            if (part.type !== WORK) continue;
            if (part.hits > 0) work++;
            if (!part.boost) continue;
            const info = typeof BOOSTS !== "undefined" && BOOSTS[WORK] && BOOSTS[WORK][part.boost];
            if (!info) { unknownBoost = true; continue; }
            if (!boosts) boosts = { build: [], repair: [], upgrade: [] };
            if (info.build > 0) boosts.build.push((info.build - 1) * BUILD_POWER);
            if (info.repair > 0) boosts.repair.push((info.repair - 1) * REPAIR_POWER);
            if (info.upgradeController > 0) boosts.upgrade.push(info.upgradeController - 1);
        }
        if (boosts) for (const action of workActions) boosts[action].sort((a, b) => b - a);
        let state = null;
        if (work) {
            const energy = creep.store[RESOURCE_ENERGY] || 0;
            const free = typeof creep.store.getFreeCapacity === "function" ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
            const capacity = typeof creep.store.getCapacity === "function" ? creep.store.getCapacity(RESOURCE_ENERGY) : null;
            state = { id: creep.id || creep.name || "anonymous:" + states.length, room: creep.room.name,
                role: creep.memory && creep.memory.role, work, energy, unknownBoost, boosts,
                free: Number.isFinite(free) ? Math.max(0, free) : 0,
                capacityKnown: Number.isFinite(capacity),
                capacity: Number.isFinite(capacity) ? Math.max(energy, capacity) : energy + (Number.isFinite(free) ? free : 0),
                slots: {}, incoming: false };
            states.push(state);
        }
        identities.set(key, state);
        return state;
    }
    function accept(state, method, args, capturedTarget) {
        if (!state) return;
        const target = args[0];
        const action = method === "upgradeController" ? "upgrade" : method;
        let slot;
        if (action === "build" || action === "repair" || action === "upgrade") {
            slot = { action, target: capturedTarget || targetData(action, target, tick) };
        } else if (method === "drop") {
            slot = { resource: args[0], amount: args[1] || state.energy };
        } else if (method === "transfer" || method === "withdraw") {
            const resource = args[1];
            const amount = method === "transfer" ? state.energy : target && target.store && target.store[resource] || 0;
            const free = method === "transfer" && target && target.store && typeof target.store.getFreeCapacity === "function"
                ? target.store.getFreeCapacity(resource) : state.free;
            slot = { resource, amount: args[2] || Math.min(amount, Number.isFinite(free) ? free : amount) };
        } else if (method === "pickup") {
            slot = { resource: target && target.resourceType, amount: Math.min(target && target.amount || 0, state.free) };
        } else slot = {};
        slot.order = ++sequence;
        state.slots[method] = slot;
        revision++;
    }
    function cancel(state, method) {
        if (state && state.slots[method]) { delete state.slots[method]; revision++; }
    }
    function incoming(creep) {
        const state = stateFor(creep);
        if (state && !state.incoming) { state.incoming = true; revision++; }
    }
    function uncovered(state) {
        if (state && !state.uncovered) { state.uncovered = true; revision++; }
    }
    function externalTarget(target) {
        if (!target) return;
        const key = target.id || target;
        if (!externalTargets.has(key)) { externalTargets.add(key); revision++; }
    }
    function resolve(includeEvents = false) {
        if (cacheRevision === revision && (!includeEvents || cacheHasEvents)) return cached;
        // acted: WORK creeps with a resolved build/repair/upgrade or an accepted harvest this tick
        const rooms = {}, events = [], acted = new Set(), usedTargets = new Map(), usage = new Map();
        for (const state of states) {
            for (const method of workMethods) {
                const slot = state.slots[method];
                if (slot) usage.set(slot.target.key, (usage.get(slot.target.key) || 0) + 1);
            }
        }
        for (const state of states) {
            const slots = state.slots, reasons = [];
            let energy = state.energy;
            if (state.uncovered) reasons.push("incomplete-hooks");
            if (state.unknownBoost) reasons.push("boost-data");
            if (state.incoming) reasons.push("incoming-transfer-order");
            for (const method of flowMethods) {
                const flow = slots[method];
                if (!flow || flow.resource !== RESOURCE_ENERGY) continue;
                if (method === "drop") {
                    if (flow.amount > 0 && energy >= flow.amount) energy -= flow.amount;
                } else {
                    reasons.push("shared-" + method);
                    if (method === "transfer") { if (energy >= flow.amount) energy -= flow.amount; }
                    else energy = Math.min(state.capacity, energy + flow.amount);
                }
            }
            if (slots.harvest) acted.add(state.id);
            const blocked = slots.heal || slots.rangedHeal || slots.dismantle || slots.attackController;
            if (slots.dismantle || slots.harvest && !slots.build && !slots.repair) reasons.push("unmodeled-resource-action");
            for (const method of workMethods) {
                const slot = slots[method];
                if (!slot || method !== "upgradeController" && (blocked || method === "build" && slots.repair)) continue;
                acted.add(state.id);
                const action = slot.action, target = slot.target, localReasons = reasons.slice();
                if (usage.get(target.key) > 1) localReasons.push("shared-target-order");
                if (externalTargets.has(target.key)) localReasons.push("external-target-action");
                if (!target.key || target.unknown || target.limit === null) localReasons.push("target-data");
                if (slots.suicide && action === "upgrade") localReasons.push("suicide-before-upgrade");
                const key = target.key;
                const used = usedTargets.get(key) || 0;
                let base, amount, effect, ceiling;
                if (action === "repair") {
                    const need = Math.max(0, target.need - used);
                    ceiling = Math.min(state.work * REPAIR_POWER, need);
                    base = Math.min(ceiling, energy / REPAIR_COST);
                    amount = Math.min(energy, Math.ceil(base * REPAIR_COST));
                    effect = effectFor(state, action, base, need);
                } else if (action === "build") {
                    const need = Math.max(0, target.need - used);
                    ceiling = Math.min(state.work * BUILD_POWER, need);
                    amount = base = Math.min(ceiling, energy);
                    effect = effectFor(state, action, base, need);
                } else {
                    const limit = target.limit === null ? 0 : target.limit;
                    ceiling = Math.min(state.work * UPGRADE_CONTROLLER_POWER, Math.max(0, limit - used));
                    amount = base = target.blocked ? 0 : Math.min(ceiling, energy);
                    effect = effectFor(state, action, base, Infinity);
                }
                amount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
                effect = Number.isFinite(effect) ? Math.max(0, effect) : 0;
                usedTargets.set(key, used + (action === "upgrade" ? amount : effect));
                energy = Math.max(0, energy - amount);
                const category = action === "repair" ? target.type === STRUCTURE_RAMPART ? "repairRampart"
                    : target.type === STRUCTURE_WALL ? "repairWall" : "repairNormal" : action;
                const room = rooms[state.room] || (rooms[state.room] = { categories: {}, effects: { build: 0, repair: 0, upgrade: 0 }, unknown: 0, actions: 0 });
                room.categories[category] = (room.categories[category] || 0) + amount;
                room.effects[action] += effect;
                room.actions++;
                if (localReasons.length) room.unknown++;
                if (includeEvents) {
                    const upperPower = action === "repair" ? Math.ceil(Math.min(state.work * REPAIR_POWER, target.need) * REPAIR_COST)
                        : action === "build" ? Math.min(state.work * BUILD_POWER, target.need)
                        : target.blocked ? 0 : Math.min(state.work * UPGRADE_CONTROLLER_POWER, target.limit === null ? Infinity : target.limit);
                    events.push({ originTick: tick, entityId: state.id, room: state.room, role: state.role, action,
                        energyEstimate: amount, effectEstimate: effect, quality: localReasons.length ? "unknown" : "estimated",
                        reason: localReasons.join(","), energyLower: localReasons.length ? 0 : amount,
                        energyUpper: localReasons.length ? Math.min(state.capacityKnown ? state.capacity : Infinity, upperPower) : amount,
                        order: slot.order });
                }
            }
        }
        cached = { rooms, events, acted };
        cacheRevision = revision;
        cacheHasEvents = includeEvents;
        return cached;
    }
    return { stateFor, accept, cancel, incoming, uncovered, externalTarget, resolve };
}

module.exports = { create, targetData };
