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
// c.gap {ticks, none, outputTicks} counts room-ticks with no reaction assigned at all (gaps
// between chains) in its own sub-epoch (older epochs predate it), so "labs unused" splits into between-chain gaps and labs a running plan leaves out (a
// waves step keeps one output lab so its product stays in place for the next step).
// busy = (reacting + cooldown) / output lab-ticks; >= labReport.reactionLimited (0.85) reads
// "reaction-limited". The rule is descriptive: it does not by itself approve OPERATE_LAB.
//
// Counters are cumulative per room in Memory.labReport[room] (a dozen numbers per room) so the
// evidence survives global resets and grows over days; labReset(room) starts a new epoch.
//
// T2 (confirmation): an accepted runReaction (recordRun) is a pending claim; the next tick's
// observe() confirms it when the lab is cooling down (only the engine sets the cooldown) or
// counts it as rejected. Confirmed amounts go per product into c.products, split into final
// output ("f:") and intermediates ("i:" - a product another running reaction of the room uses).
// T3 (coverage/regime): regime = RCL + lab count; a new regime starts a new epoch and keeps the
// old one's summary as c.previous. c.observedMs adds wall-clock time between consecutive observed
// ticks (each gap capped at labReport.maxGapMs); a reset or skipped tick only counts in c.gaps.
// evidence(room) is "bounded" only with labReport.requiredMs (48h) observed in one regime and
// confirmedShare >= labReport.minConfirmedShare (0.95) - the OPERATE_LAB gate's input.
const config = require("./config");
const roomCache = require("./roomCache");
const labReactions = require("./labReactions");
const labReservations = require("./labReservations");
const reactionAmount = require("./labReactionAmount");

const STATES = ["reacting", "cooldown", "unavailable", "reservation", "capacity", "switch", "input", "idle"];
let ranTick = -1;
let ran = new Map(); // lab id -> quantity, this tick
let lastTick = -1;
let pending = []; // accepted intents awaiting confirmation: { id, room, product, quantity, tick }
let lastObserve = null; // { tick, ms }
const clock = { now: () => Date.now() }; // replaceable by the offline tests

function recordRun(lab, quantity, product) {
    if (ranTick !== Game.time) { ranTick = Game.time; ran = new Map(); }
    ran.set(lab.id, (ran.get(lab.id) || 0) + (quantity || 0));
    // only observe() drains the claims: none while it is off, and never more than a tick's worth of labs
    if (config.get("labReport.enabled", true) === false || pending.length >= 200) return;
    pending.push({ id: lab.id, room: lab.room && lab.room.name, product: product || lab.mineralType || null, quantity: quantity || 0, tick: Game.time });
}

function regimeOf(room, labs) {
    return "rcl" + (room.controller ? room.controller.level : 0) + ":labs" + labs.length;
}

// confirm last tick's accepted reactions by the cooldown they must have left behind
function confirm() {
    const keep = [];
    for (const p of pending) {
        if (p.tick >= Game.time) { keep.push(p); continue; }
        const c = Memory.labReport && Memory.labReport[p.room];
        if (!c) continue;
        if (Game.time - p.tick > 1) { c.lostClaims = (c.lostClaims || 0) + 1; continue; } // a skipped tick: unknown
        const lab = Game.getObjectById(p.id);
        if (lab && lab.cooldown > 0) {
            c.confirmed = (c.confirmed || 0) + 1;
            c.confirmedAmount = (c.confirmedAmount || 0) + p.quantity;
            const products = c.products || (c.products = {});
            const intermediate = labReactions.list(p.room).some((r) => r.a === p.product || r.b === p.product);
            const key = (intermediate ? "i:" : "f:") + p.product;
            products[key] = (products[key] || 0) + p.quantity;
        } else c.rejected = (c.rejected || 0) + 1;
    }
    pending = keep;
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
    confirm();
    const ms = clock.now();
    const consecutive = !!lastObserve && lastObserve.tick === Game.time - 1;
    const elapsed = consecutive ? Math.max(0, Math.min(ms - lastObserve.ms, Number(config.get("labReport.maxGapMs", 10000)))) : 0;
    lastObserve = { tick: Game.time, ms };
    for (const room of Game.myRooms || []) {
        const labs = roomCache.structuresByType(room, STRUCTURE_LAB);
        if (!labs.length) continue;
        let c = counters(room.name);
        const regime = regimeOf(room, labs);
        if (c.regime && c.regime !== regime) {
            const previous = { regime: c.regime, since: c.since, until: Game.time, summary: summary(room.name) };
            delete Memory.labReport[room.name];
            c = counters(room.name);
            c.previous = previous;
        }
        c.regime = regime;
        if (consecutive && c.ticks > 0) c.observedMs = (c.observedMs || 0) + elapsed;
        else if (c.ticks > 0) c.gaps = (c.gaps || 0) + 1;
        c.ticks++;
        c.labTicks += labs.length;
        const outputs = new Map(), inputs = new Set();
        const reactions = labReactions.list(room.name);
        const gap = c.gap || (c.gap = { since: Game.time, ticks: 0, none: 0, outputTicks: 0 });
        gap.ticks++;
        if (!reactions.length) gap.none++;
        for (const reaction of reactions) {
            for (const id of labReactions.outputsOf(reaction)) outputs.set(id, reaction);
            inputs.add(reaction.input1); inputs.add(reaction.input2);
        }
        for (const lab of labs) {
            const reaction = outputs.get(lab.id);
            if (!reaction) { if (inputs.has(lab.id)) c.inputTicks = (c.inputTicks || 0) + 1; else c.unassigned++; continue; }
            const state = classify(room.name, lab, reaction);
            c.outputTicks++;
            gap.outputTicks++;
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
    const gap = c.gap || { ticks: 0, none: 0, outputTicks: 0 }, running = gap.ticks - gap.none;
    return { room: roomName, since: c.since, ticks: c.ticks, labs: c.labTicks / c.ticks,
        outputLabs: out / c.ticks, noReaction: gap.ticks ? gap.none / gap.ticks : 0,
        outputLabsRunning: running > 0 ? gap.outputTicks / running : 0, assignedShare: c.labTicks ? (out + (c.inputTicks || 0)) / c.labTicks : 0, busy,
        reactionLimited: out > 0 && busy >= limit, top: waits.slice(0, 3),
        amountPerTick: c.amount / c.ticks, reactions: c.reactions };
}

function line(r) {
    if (!r) return "";
    const pct = (v) => Math.round(v * 100) + "%";
    return "[labReport] " + r.room + " " + r.ticks + "t desde " + r.since + ": " + r.labs.toFixed(1) + " labs, " +
        r.outputLabs.toFixed(1) + " de saída (" + pct(r.assignedShare) + " dos labs em uso; " + r.outputLabsRunning.toFixed(1) +
        " de saída com reação; sem reação " + pct(r.noReaction) + "); ocupadas " + pct(r.busy) +
        (r.reactionLimited ? " (limitado pela reação)" : "") + "; " + r.amountPerTick.toFixed(2) + " un/t; espera: " +
        (r.top.map(([s, v]) => s + " " + pct(v)).join(", ") || "-");
}

// T3: is this room's lab evidence good enough for an economic gate (OPERATE_LAB)?
function evidence(roomName) {
    const c = Memory.labReport && Memory.labReport[roomName];
    if (!c || !c.ticks) return { status: "insufficient", reasons: ["no-observation"], observedMs: 0, confirmedShare: null };
    const required = Number(config.get("labReport.requiredMs", 172800000));
    const claims = (c.confirmed || 0) + (c.rejected || 0) + (c.lostClaims || 0);
    const confirmedShare = claims ? (c.confirmed || 0) / claims : null;
    const reasons = [];
    if (!((c.observedMs || 0) >= required)) reasons.push("coverage " + Math.round((c.observedMs || 0) / 3600000) + "h/" + Math.round(required / 3600000) + "h");
    if (confirmedShare === null) reasons.push("no-confirmed-reaction");
    else if (confirmedShare < Number(config.get("labReport.minConfirmedShare", 0.95))) reasons.push("confirmed " + Math.round(confirmedShare * 100) + "%");
    return { status: reasons.length ? "insufficient" : "bounded", reasons, regime: c.regime, observedMs: c.observedMs || 0,
        requiredMs: required, confirmedShare, gaps: c.gaps || 0 };
}

// Compact numbers for Memory.stats.
function summary(roomName) {
    const r = report(roomName);
    if (!r) return null;
    const round = (v) => Math.round(v * 1000) / 1000;
    const c = Memory.labReport[roomName];
    const ev = evidence(roomName);
    const finalAmount = Object.entries(c.products || {}).filter(([k]) => k.indexOf("f:") === 0).reduce((s, [, v]) => s + v, 0);
    return { ticks: r.ticks, busy: round(r.busy), outputLabs: round(r.outputLabs), assignedShare: round(r.assignedShare),
        confirmedPerTick: round((c.confirmedAmount || 0) / r.ticks), finalPerTick: round(finalAmount / r.ticks),
        confirmedShare: ev.confirmedShare === null ? null : round(ev.confirmedShare), observedHours: round(ev.observedMs / 3600000),
        evidence: ev.status, regime: c.regime || "",
        noReaction: round(r.noReaction), outputLabsRunning: round(r.outputLabsRunning),
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

module.exports = { recordRun, observe, report, summary, evidence, STATES, clock };
