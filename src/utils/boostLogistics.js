"use strict";
// Preparation only. No spawn decisions, native boost intent or purchase exists here.
const config = require("./config");
const claims = require("./terminalClaims");
const reservations = require("./labReservations");
const reactions = require("./labReactions");
const policy = require("./boostPolicy");
const constants = require("./boostConstants");
const census = require("./census");
const sessionId = "boost:" + Date.now() + ":" + Math.random();
const active = (r) => r && (r.state === "reserved" || r.state === "loading");
const records = (room) => reservations.all(room.name);
const value = (s, resource) => s && s.store && s.store[resource] || 0;
// boost.room: one room name, or "all" (ROADMAP 0149 executor default: every room, the worth
// decision gates each boost)
function enabled(room) {
    if (config.get("boost.enabled", false) !== true) return false;
    const target = config.get("boost.room", null);
    return target === "all" || target === room.name;
}
function manual(room, labId) {
    const mem = Memory.rooms[room.name] || {};
    return !!(mem.labLoad && !mem.labLoadAuto && mem.labLoad[labId] || mem.labPolicyHold && mem.labPolicyHold[labId]);
}
function freeLab(room, lab) {
    if (!lab || lab.room.name !== room.name || !lab.my || lab.structureType !== STRUCTURE_LAB || lab.isActive && !lab.isActive() ||
        reservations.blocked(room.name, lab.id) || manual(room, lab.id)) return false;
    const mem = Memory.rooms[room.name] || {};
    if (mem.labPolicyDesired && mem.labPolicyDesired[lab.id] || mem.labPolicyInputs && mem.labPolicyInputs[lab.id]) return false;
    return !reactions.list(room.name).some((r) => r.input1 === lab.id || r.input2 === lab.id || reactions.outputsOf(r).includes(lab.id));
}
function reserve(creep, lab, compound, context) {
    const room = creep && creep.room;
    const fail = (reason) => ({ status: "blocked", reason });
    if (!room || !enabled(room)) return fail("disabled");
    if (compound !== config.get("boost.compound", "XLH2O") || compound !== "XLH2O" || !creep.id || creep.spawning ||
        !creep.memory || creep.memory.role !== "builder" || Game.creeps[creep.name] !== creep) return fail("pilot-target");
    const current = records(room);
    for (const id in current) {
        const r = current[id];
        if (r && r.managedBy === "boostLogistics" && reservations.blocked(room.name, id)) {
            if (lab && id === lab.id && r.ownerCreepId === creep.id && r.compound === compound && active(r) && r.sessionId === sessionId)
                return { status: r.state, reservationId: r.reservationId, generation: r.generation, reused: true };
            return fail("room-already-preparing");
        }
    }
    if (!freeLab(room, lab) || lab.mineralType && lab.mineralType !== compound) return fail("lab-not-free");
    const decision = policy.worth("builder", compound, { ...context, constants: constants.current(), body: creep.body, ttl: creep.ticksToLive, nowTick: Game.time,
        previouslyApproved: false, minReturnRatio: config.get("boost.minReturnRatio", 0.20), continueReturnRatio: config.get("boost.continueReturnRatio", 0.10) });
    if (!decision.worth) return { status: decision.status, reason: decision.reason, decision };
    const targets = { [compound]: decision.selection.requiredMineral, [RESOURCE_ENERGY]: decision.selection.requiredEnergy };
    const funding = [];
    // All parts must pass before the single canonical write. No speculative buys.
    for (const resource of Object.keys(targets)) {
        let missing = Math.max(0, targets[resource] - value(lab, resource));
        const sources = resource === RESOURCE_ENERGY ? [room.storage] : [room.storage, room.terminal];
        for (const source of sources) {
            if (!source || !missing) continue;
            const floor = resource === RESOURCE_ENERGY ? config.get("boost.energyReserve", 100000) : 0;
            if (!Number.isInteger(floor) || floor < 0) return fail("invalid-energy-reserve");
            const available = Math.max(0, claims.physicalFree(room, source, resource) - floor);
            const quantity = Math.min(missing, available);
            if (quantity) funding.push({ resource, sourceId: source.id, remaining: quantity });
            missing -= quantity;
        }
        if (missing > 0) return fail("insufficient-unclaimed-stock:" + resource);
    }
    const previous = current[lab.id], generation = previous && Number.isInteger(previous.generation) ? previous.generation + 1 : 1;
    const reservationId = creep.id + ":" + lab.id + ":" + generation + ":" + Game.time;
    const deadline = config.get("boost.deadlineTicks", 100);
    if (!Number.isInteger(deadline) || deadline <= 0) return fail("invalid-deadline");
    const record = { version: 1, managedBy: "boostLogistics", reservationId, ownerRequestId: reservationId,
        ownerCreepId: creep.id, ownerCreepName: creep.name, generation, sessionId, compound, selectorVersion: 1,
        bodyPartsCount: decision.selection.bodyPartsCount, predictedSelectedIndexes: decision.selection.selectedIndexes,
        partsRequested: decision.selection.bodyPartsCount, partsConfirmed: 0, requiredMineral: targets[compound], requiredEnergy: targets[RESOURCE_ENERGY],
        createdTick: Game.time, deadlineTick: Game.time + Math.min(deadline, creep.ticksToLive), state: "reserved",
        funding, shipments: {}, pending: false };
    const mem = Memory.rooms[room.name];
    if (!mem.labBoostReservations) mem.labBoostReservations = {};
    for (const id in mem.labBoostReservations) {
        const old = mem.labBoostReservations[id];
        if (id !== lab.id && old && old.managedBy === "boostLogistics" && old.state === "released" && !old.pending)
            delete mem.labBoostReservations[id];
    }
    mem.labBoostReservations[lab.id] = record;
    return { status: "reserved", reservationId, generation, decision };
}
function matches(room, labId, job) {
    const r = records(room)[labId];
    return r && r.managedBy === "boostLogistics" && r.reservationId === job.boostReservationId && r.generation === job.boostGeneration ? r : null;
}
function usable(room, labId, job) {
    const r = matches(room, labId, job);
    return r && enabled(room) && active(r) && !manual(room, labId) && r.sessionId === sessionId && Game.time < r.deadlineTick ? r : null;
}
function feedJob(room) {
    if (!enabled(room)) return null;
    for (const id in records(room)) {
        const r = records(room)[id];
        if (!active(r) || r.managedBy !== "boostLogistics" || r.sessionId !== sessionId || manual(room, id) || Game.time >= r.deadlineTick) continue;
        const lab = Game.getObjectById(id);
        if (!lab || lab.isActive && !lab.isActive()) continue;
        for (const f of r.funding) {
            if (!(f.remaining > 0) || Object.values(r.shipments).some((s) => s.resource === f.resource)) continue;
            if (census.creepsByRole(room.name, "hauler").some((creep) => {
                const job = creep.memory.mineralJob;
                return job && job.kind === "boostFeed" && job.boostReservationId === r.reservationId && job.resourceType === f.resource;
            })) continue;
            const source = Game.getObjectById(f.sourceId);
            if (!source || !value(source, f.resource)) continue;
            return { kind: "boostFeed", resourceType: f.resource, from: source, to: lab, amount: f.remaining,
                boostReservationId: r.reservationId, boostGeneration: r.generation };
        }
    }
    return null;
}
function withdrawalLimit(creep, job, from) {
    const r = usable(creep.room, job.toId, job);
    if (!r || r.shipments[creep.id] || Object.values(r.shipments).some((s) => s.resource === job.resourceType)) return 0;
    const f = r.funding.find((f) => f.sourceId === from.id && f.resource === job.resourceType);
    const floor = job.resourceType === RESOURCE_ENERGY ? config.get("boost.energyReserve", 100000) : 0;
    if (!Number.isInteger(floor) || floor < 0) return 0;
    return f ? Math.max(0, Math.min(f.remaining, claims.physicalFree(creep.room, from, job.resourceType, null, "boost:" + r.ownerRequestId) - floor)) : 0;
}
function withdrawn(creep, job, from, amount) {
    const r = matches(creep.room, job.toId, job);
    const f = r.funding.find((f) => f.sourceId === from.id && f.resource === job.resourceType);
    f.remaining -= amount;
    r.shipments[creep.id] = { resource: job.resourceType, amount, state: "withdraw", tick: Game.time,
        creepName: creep.name, beforeCargo: value(creep, job.resourceType) };
    r.state = "loading";
    r.pending = true;
}
function deliveryLimit(creep, job, lab) {
    const r = usable(creep.room, job.toId, job), s = r && r.shipments[creep.id];
    if (!s || s.state !== "cargo" || s.resource !== job.resourceType) return 0;
    const target = job.resourceType === RESOURCE_ENERGY ? r.requiredEnergy : r.requiredMineral;
    return Math.max(0, Math.min(s.amount, target - value(lab, job.resourceType)));
}
function delivered(creep, job, lab, amount) {
    const r = matches(creep.room, job.toId, job), s = r.shipments[creep.id];
    Object.assign(s, { state: "transfer", tick: Game.time, beforeLab: value(lab, job.resourceType), beforeCargo: value(creep, job.resourceType), submittedAmount: amount });
    r.pending = true;
}
function cancel(room, labId, reason) {
    const r = records(room)[labId];
    if (!r || r.managedBy !== "boostLogistics" || !reservations.structured(r) || r.state === "released" || r.state === "transferToManual") return false;
    r.funding = [];
    if (r.state !== "draining" && r.state !== "quarantined") {
        r.state = "draining"; r.drainDeadlineTick = Game.time + config.get("boost.drainTimeoutTicks", 300);
    }
    r.reason = reason;
    if (!r.endReason) r.endReason = reason;
    return true;
}
// Existing workers keep priority. Observe their accepted withdrawals rather than
// blocking their work behind an optional boost; revoke preparation if necessary.
function energyWithdrawn(creep, source, amount, alreadyRecorded = false) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const room = creep.room, all = records(room);
    if (source !== room.storage && source !== room.terminal || !Object.keys(all).length) return;
    if (!alreadyRecorded) claims.withdraw(source, RESOURCE_ENERGY, amount);
    for (const id in all) {
        const r = all[id];
        if (!active(r) || r.managedBy !== "boostLogistics") continue;
        const held = r.funding.filter((f) => f.resource === RESOURCE_ENERGY && f.sourceId === source.id).reduce((n, f) => n + f.remaining, 0);
        if (held > claims.physicalFree(room, source, RESOURCE_ENERGY, null, "boost:" + r.ownerRequestId)) cancel(room, id, "energy-preempted");
    }
}
function settle(room, id, r, lab) {
    let pending = false;
    for (const creepId in r.shipments) {
        const s = r.shipments[creepId], creep = Game.getObjectById(creepId) || Game.creeps[s.creepName];
        if (s.state === "cargo") {
            if (!creep || value(creep, s.resource) < s.amount) { delete r.shipments[creepId]; cancel(room, id, "cargo-lost"); }
            continue;
        }
        if (s.tick >= Game.time) { pending = true; continue; }
        if (s.state === "withdraw" && creep && value(creep, s.resource) - s.beforeCargo === s.amount) s.state = "cargo";
        else if (s.state === "transfer" && creep && lab && s.beforeCargo - value(creep, s.resource) === s.submittedAmount &&
            value(lab, s.resource) - s.beforeLab >= s.submittedAmount) {
            s.amount -= s.submittedAmount;
            if (s.amount > 0) s.state = "cargo"; else delete r.shipments[creepId];
        } else { delete r.shipments[creepId]; cancel(room, id, "transport-uncertain"); }
    }
    r.pending = pending;
}
function tickRoom(room) {
    for (const id in records(room)) {
        const r = records(room)[id];
        if (!reservations.structured(r) || r.managedBy !== "boostLogistics" || r.state === "released") continue;
        const lab = Game.getObjectById(id);
        settle(room, id, r, lab);
        if (manual(room, id)) { r.funding = []; r.state = "transferToManual"; r.reason = "manual-takeover"; r.endReason = r.endReason || r.reason; continue; }
        if (r.state === "transferToManual") continue;
        const creep = Game.getObjectById(r.ownerCreepId) || Game.creeps[r.ownerCreepName];
        if (active(r)) {
            if (!enabled(room)) cancel(room, id, "disabled");
            else if (r.sessionId !== sessionId) cancel(room, id, "session-reset");
            else if (!creep || !lab || creep.room.name !== room.name) cancel(room, id, "owner-or-lab-missing");
            else if (lab.mineralType && lab.mineralType !== r.compound || lab.isActive && !lab.isActive()) cancel(room, id, "lab-changed");
            else if (Game.time >= r.deadlineTick) cancel(room, id, "deadline");
        }
        if (r.state !== "draining" && r.state !== "quarantined" || r.pending) continue;
        if (r.state === "quarantined" && r.nextWakeTick > Game.time) continue;
        if (!lab || !Object.keys(lab.store).some((resource) => resource !== RESOURCE_ENERGY && value(lab, resource) > 0) &&
            value(lab, RESOURCE_ENERGY) <= config.get("craft.labEnergyTarget", 0)) {
            r.state = "released"; r.shipments = {}; r.funding = []; r.reason = "cleanup-complete";
        } else if (Game.time >= r.drainDeadlineTick) {
            r.state = "quarantined"; r.reason = "cleanup-blocked";
            r.nextWakeTick = Game.time + config.get("boost.quarantineWakeTicks", 25);
        }
    }
}
function status(room) {
    return Object.entries(records(room)).map(([labId, r]) => {
        if (!reservations.structured(r) || r.managedBy !== "boostLogistics")
            return { labId, kind: "external", blocked: reservations.blocked(room.name, labId) };
        const lab = Game.getObjectById(labId), shipments = Object.values(r.shipments);
        const missing = (resource, target) => Math.max(0, target - value(lab, resource) -
            shipments.reduce((n, s) => n + (s.resource === resource ? s.amount : 0), 0));
        return { labId, kind: "preparation", state: r.state, reason: r.reason || null, endReason: r.endReason || null,
            ownerCreepName: r.ownerCreepName, generation: r.generation, compound: r.compound,
            partsRequested: r.partsRequested, partsConfirmed: r.partsConfirmed, pending: !!r.pending,
            deadlineTick: r.deadlineTick, drainDeadlineTick: r.drainDeadlineTick || null,
            held: { mineral: value(lab, r.compound), energy: value(lab, RESOURCE_ENERGY) },
            missing: { mineral: missing(r.compound, r.requiredMineral), energy: missing(RESOURCE_ENERGY, r.requiredEnergy) },
            stockPrepared: active(r) && !r.pending && !shipments.length && value(lab, r.compound) >= r.requiredMineral && value(lab, RESOURCE_ENERGY) >= r.requiredEnergy,
            automaticApplication: false };
    });
}
module.exports = { reserve, feedJob, withdrawalLimit, withdrawn, deliveryLimit, delivered, cancel, tickRoom, energyWithdrawn, status, enabled, freeLab };
