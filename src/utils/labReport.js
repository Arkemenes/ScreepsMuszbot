"use strict";
// ROADMAP 0155 (ARK-134): lab utilization - is a room's lab output reaction-limited (labs
// always reacting or cooling down: OPERATE_LAB would add output) or limited by something
// upstream (reagents, capacity, reservations, plan switches: OPERATE_LAB would not help)?
//
// observe() runs once per tick after every structure acted. Each lab of each owned room gets
// exactly one classification for the tick:
//   output labs of a running reaction (labReactions.list):
//     reacting     runReaction accepted this tick (labReactions.execute calls ran())
//     cooldown     still cooling down from an earlier reaction (busy, not idle)
//     unavailable  inactive (RCL) / reservation  held by a boost or manual load
//     capacity     no room for another batch / switch  holds another mineral
//     input        an input lab lacks a batch of its reagent
//     idle         none of the above and it did not react (planning, quota, executor gates)
//   input labs of a running reaction: counted as inputTicks (assigned, not classified)
//   any other lab: unassigned (counts toward physical availability only)
// busy = (reacting + cooldown) / output lab-ticks; >= labReport.reactionLimited (0.85) reads
// "reaction-limited". The rule is descriptive: it does not by itself approve OPERATE_LAB.
//
// Counters are cumulative per room in Memory.labReport[room] (a dozen numbers per room) so the
// evidence survives global resets and grows over days; labReset(room) starts a new epoch.
const config = require("./config");
const roomCache = require("./roomCache");
const labReactions = require("./labReactions");
const labReservations = require("./labReservations");
const reactionAmount = require("./labReactionAmount");

const STATES = ["reacting", "cooldown", "unavailable", "reservation", "capacity", "switch", "input", "idle"];
let ranTick = -1;
let ran = new Map(); // lab id -> quantity, this tick
let lastTick = -1;

function recordRun(lab, quantity) {
    if (ranTick !== Game.time) { ranTick = Game.time; ran = new Map(); }
    ran.set(lab.id, (ran.get(lab.id) || 0) + (quantity || 0));
}

function counters(roomName) {
    if (!Memory.labReport) Memory.labReport = {};
    const c = Memory.labReport[roomName];
    if (c) return c;
    const fresh = { since: Game.time, ticks: 0, labTicks: 0, outputTicks: 0, inputTicks: 0, unassigned: 0, reactions: 0, amount: 0, states: {} };
    for (const s of STATES) fresh.states[s] = 0;
    return (Memory.labReport[roomName] = fresh);
}

function classify(roomName, lab, reaction) {
    if (ranTick === Game.time && ran.has(lab.id)) return "reacting";
    if (lab.cooldown > 0) return "cooldown";
    if (lab.isActive && !lab.isActive()) return "unavailable";
    if (labReservations.blocked(roomName, lab.id)) return "reservation";
    if (lab.mineralType && lab.mineralType !== reaction.product) return "switch";
    const quantity = reactionAmount.amount(reactionAmount.snapshot(lab)) || 5;
    const capacity = typeof LAB_MINERAL_CAPACITY === "number" ? LAB_MINERAL_CAPACITY : 3000;
    if ((lab.store[reaction.product] || 0) + quantity > capacity) return "capacity";
    for (const [id, resource] of [[reaction.input1, reaction.a], [reaction.input2, reaction.b]]) {
        const input = Game.getObjectById(id);
        if (!input || (input.store[resource] || 0) < quantity) return "input";
    }
    return "idle";
}

function observe() {
    if (config.get("labReport.enabled", true) === false || lastTick === Game.time) return;
    lastTick = Game.time;
    for (const room of Game.myRooms || []) {
        const labs = roomCache.structuresByType(room, STRUCTURE_LAB);
        if (!labs.length) continue;
        const c = counters(room.name);
        c.ticks++;
        c.labTicks += labs.length;
        const outputs = new Map(), inputs = new Set();
        for (const reaction of labReactions.list(room.name)) {
            for (const id of labReactions.outputsOf(reaction)) outputs.set(id, reaction);
            inputs.add(reaction.input1); inputs.add(reaction.input2);
        }
        for (const lab of labs) {
            const reaction = outputs.get(lab.id);
            if (!reaction) { if (inputs.has(lab.id)) c.inputTicks = (c.inputTicks || 0) + 1; else c.unassigned++; continue; }
            const state = classify(room.name, lab, reaction);
            c.outputTicks++;
            c.states[state] = (c.states[state] || 0) + 1;
            if (state === "reacting") { c.reactions++; c.amount += ran.get(lab.id) || 0; }
        }
    }
}

function report(roomName) {
    const c = Memory.labReport && Memory.labReport[roomName];
    if (!c || !c.ticks) return null;
    const out = c.outputTicks || 0;
    const busy = out ? ((c.states.reacting || 0) + (c.states.cooldown || 0)) / out : 0;
    const limit = Number(config.get("labReport.reactionLimited", 0.85));
    const waits = STATES.filter((s) => s !== "reacting" && s !== "cooldown" && c.states[s])
        .map((s) => [s, c.states[s] / Math.max(1, out)]).sort((a, b) => b[1] - a[1]);
    return { room: roomName, since: c.since, ticks: c.ticks, labs: c.labTicks / c.ticks,
        outputLabs: out / c.ticks, assignedShare: c.labTicks ? (out + (c.inputTicks || 0)) / c.labTicks : 0, busy,
        reactionLimited: out > 0 && busy >= limit, top: waits.slice(0, 3),
        amountPerTick: c.amount / c.ticks, reactions: c.reactions };
}

function line(r) {
    if (!r) return "";
    const pct = (v) => Math.round(v * 100) + "%";
    return "[labReport] " + r.room + " " + r.ticks + "t desde " + r.since + ": " + r.labs.toFixed(1) + " labs, " +
        r.outputLabs.toFixed(1) + " de saída (" + pct(r.assignedShare) + " dos labs em uso); ocupadas " + pct(r.busy) +
        (r.reactionLimited ? " (limitado pela reação)" : "") + "; " + r.amountPerTick.toFixed(2) + " un/t; espera: " +
        (r.top.map(([s, v]) => s + " " + pct(v)).join(", ") || "-");
}

// Compact numbers for Memory.stats.
function summary(roomName) {
    const r = report(roomName);
    if (!r) return null;
    const round = (v) => Math.round(v * 1000) / 1000;
    return { ticks: r.ticks, busy: round(r.busy), outputLabs: round(r.outputLabs), assignedShare: round(r.assignedShare),
        amountPerTick: round(r.amountPerTick), reactionLimited: r.reactionLimited,
        top: Object.fromEntries(r.top.map(([s, v]) => [s, round(v)])) };
}

global.labReport = function (roomName) {
    const names = roomName ? [roomName] : (Game.myRooms || []).map((room) => room.name);
    return names.map((name) => line(report(name))).filter(Boolean).join("\n") || "[labReport] sem dados ainda";
};
global.labReset = function (roomName) {
    if (!Memory.labReport) return 0;
    const names = roomName ? [roomName] : Object.keys(Memory.labReport);
    names.forEach((name) => delete Memory.labReport[name]);
    return names.length;
};

module.exports = { recordRun, observe, report, summary, STATES };
