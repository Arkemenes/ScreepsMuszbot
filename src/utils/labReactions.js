"use strict";
const config = require("./config");
const census = require("./census");
const labReservations = require("./labReservations");
const reactionAmount = require("./labReactionAmount");
// ROADMAP 0115: the lab reactions running in a room. A craft chain may run several at
// once (independent steps of the reaction tree, in labs of their own): those are
// Memory.rooms[r].labReactions, a list. A manual setLabReaction() (rooms/refining.js) and
// a single-step chain stay in the singular Memory.rooms[r].labReaction. Every consumer
// asks here instead of reading either field, so the two cases look the same to it.
//   reaction = { a, b, product, input1, input2, output, outputs?, keep? }

function list(roomName) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (!mem) return [];
    if (Array.isArray(mem.labReactions) && mem.labReactions.length) return mem.labReactions;
    return mem.labReaction ? [mem.labReaction] : [];
}

// ids of the labs that run (produce into) this reaction: the planned output, or the
// wide list when the reaction runs on several output labs
function outputsOf(reaction) {
    return reaction.outputs && reaction.outputs.length ? reaction.outputs : [reaction.output];
}

let ledgerTick = -1;
let ledgers = {};
function execute(structure) {
    if (ledgerTick !== Game.time) { ledgerTick = Game.time; ledgers = {}; }
    const reactions = list(structure.room.name);
    const reaction = reactions.find((r) => outputsOf(r).includes(structure.id));
    if (!reaction || structure.cooldown > 0) return;
    const power = reactionAmount.snapshot(structure);
    const quantity = reactionAmount.amount(power);
    if (!(quantity > 0)) return;
    const roomName = structure.room.name;
    const a = Game.getObjectById(reaction.input1), b = Game.getObjectById(reaction.input2);
    if (!a || !b || a.id === b.id || structure.id === a.id || structure.id === b.id) return;
    // A reaction may predate a boost reservation or an RCL change; check every participant live.
    if (labReservations.blocked(roomName, structure.id) || labReservations.blocked(roomName, a.id) || labReservations.blocked(roomName, b.id) ||
        structure.isActive && !structure.isActive() || a.isActive && !a.isActive() || b.isActive && !b.isActive()) return;
    if (!ledgers[roomName]) {
        const available = {}, used = {}, outputs = new Set(), groups = {};
        // Capture every source before the first intent: production this tick
        // never enters the snapshot, including labs with two simultaneous roles.
        reactions.forEach((r) => {
            for (const [id, resource] of [[r.input1, r.a], [r.input2, r.b]]) {
                const lab = Game.getObjectById(id);
                if (!(id in available)) available[id] = lab && lab.store && lab.store[resource] || 0;
            }
        });
        ledgers[roomName] = { available, used, outputs, groups };
    }
    const ledger = ledgers[roomName];
    if (a.mineralType !== reaction.a || b.mineralType !== reaction.b ||
        structure.mineralType && structure.mineralType !== reaction.product) return;
    if (structure.pos && (!structure.pos.inRangeTo(a, 2) || !structure.pos.inRangeTo(b, 2))) return;
    const owner = reaction.owner && Memory.craft && Memory.craft.active && Memory.craft.active[reaction.owner];
    const state = owner && owner.queue[owner.qi || 0].run;
    const group = reaction.quotaKey || (reaction.owner || "manual") + ":" + reaction.product;
    const quota = reaction.remaining === undefined ? Infinity : reaction.remaining;
    const pending = state ? (state.pending || []).filter((i) => i.tick === Game.time && i.product === reaction.product &&
        (!reaction.quotaKey || i.quotaKey === reaction.quotaKey))
        .reduce((sum, i) => sum + (i.amount === undefined ? reactionAmount.base() : i.amount), 0) : 0;
    if (quota - Math.max(pending, ledger.used[group] || 0) < quantity || ledger.outputs.has(structure.id)) {
        if (state) state.wait[structure.id] = "reservation";
        return;
    }
    const left = quota - Math.max(pending, ledger.used[group] || 0) - quantity;
    if (Number.isFinite(left) && left % reactionAmount.base() !== 0) {
        if (!ledger.groups[group]) {
            const entries = ledger.groups[group] = [];
            for (const r of reactions) {
                if ((r.quotaKey || (r.owner || "manual") + ":" + r.product) !== group) continue;
                for (const id of outputsOf(r)) if (!entries.some((entry) => entry.id === id)) {
                    const lab = Game.getObjectById(id);
                    if (lab) entries.push({ id, power: reactionAmount.snapshot(lab), next: lab.cooldown || 0 });
                }
            }
        }
        const cooldown = typeof REACTION_TIME !== "undefined" && REACTION_TIME[reaction.product] || 1;
        const future = (ledger.groups[group] || []).map((entry) => reactionAmount.opportunities(entry.power, cooldown,
            entry.id === structure.id || ledger.outputs.has(entry.id) ? cooldown : entry.next));
        if (!reactionAmount.canFinish(left, future)) { if (state) state.wait[structure.id] = "quota-tail"; return; }
    }
    if (ledger.available[a.id] < quantity || ledger.available[b.id] < quantity) {
        if (state) state.wait[structure.id] = "reservation";
        return;
    }
    const capacity = typeof LAB_MINERAL_CAPACITY === "number" ? LAB_MINERAL_CAPACITY : 3000;
    if ((structure.store[reaction.product] || 0) + quantity > capacity) return;
    const status = structure.runReaction(a, b);
    if (status !== OK) { if (state) state.wait[structure.id] = "intent:" + status; return; }
    ledger.available[a.id] -= quantity; ledger.available[b.id] -= quantity;
    ledger.used[group] = (ledger.used[group] || 0) + quantity;
    ledger.outputs.add(structure.id);
    require("./craftLedger").production(structure, reaction.product, quantity, power);
    require("./labReport").recordRun(structure, quantity, reaction.product); // ROADMAP 0155: this lab reacted this tick
    if (state) state.pending.push({ tick: Game.time, product: reaction.product, amount: quantity, power, quotaKey: reaction.quotaKey,
        before: structure.store[reaction.product] || 0, out: structure.id, inputs: [a.id, b.id] });
}
let deliveryTick = -1, deliveries = {};
function deliveryLimit(roomName, lab, resource) {
    if (labReservations.blocked(roomName, lab.id)) return 0;
    if (deliveryTick !== Game.time) { deliveryTick = Game.time; deliveries = {}; }
    const mem = Memory.rooms && Memory.rooms[roomName], target = mem && mem.labPolicyInputs && mem.labPolicyInputs[lab.id];
    if (!target || target[0] !== resource || lab.mineralType && lab.mineralType !== resource) return 0;
    return Math.max(0, target[1] - (lab.store[resource] || 0) - (deliveries[lab.id] || 0));
}
function recordDelivery(id, amount) {
    if (deliveryTick !== Game.time) { deliveryTick = Game.time; deliveries = {}; }
    deliveries[id] = (deliveries[id] || 0) + amount;
}
function drainThreshold(room, lab) {
    const cap = lab.store.getCapacity && lab.store.getCapacity(lab.mineralType) ||
        (typeof LAB_MINERAL_CAPACITY !== "undefined" ? LAB_MINERAL_CAPACITY : 3000);
    let load = Infinity;
    census.creepsByRole(room.name, "hauler").forEach((creep) => {
        const size = creep.store && creep.store.getCapacity ? creep.store.getCapacity() : 0;
        if (size > 0 && size < load) load = size;
    });
    return Math.min(cap * config.get("mineralHauler.labDrainRatio", 0.8), load,
        cap * config.get("mineralHauler.pressureHigh", 0.75));
}
module.exports = { list, outputsOf, execute, deliveryLimit, recordDelivery, drainThreshold };
