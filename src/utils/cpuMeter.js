"use strict";
// ROADMAP 0113: one CPU meter, three granularities over the same {cpu, calls, max}
// record per key.
//   L0  modules     guard()ed subsystems          (always on)
//   L1  roles       creep role                    (always on)
//       structures  structure type                (always on)
//       spans       named hot points              (always on, inclusive of children)
//       tick        what no guard covers          (entry = CPU already used when loop() starts,
//                                                  prelude = profiler/Memory wrappers)
//   L2  fns         per function, from profile(N) (on demand, published when it ends)
// Accumulators live in the heap; every stats.cpuWindowTicks ticks they are folded into
// a snapshot of per-tick averages (what Memory.stats.cpu.meter publishes) and reset.
// An average needs only a sum and a count - no per-tick samples are kept.
const config = require("./config");
const accounting = require("./cpuAccounting");

const GROUPS = ["modules", "roles", "structures", "spans", "tick"];

function fresh() {
    const groups = {};
    GROUPS.forEach((g) => { groups[g] = {}; });
    return { ticks: 0, total: 0, fromTick: null, toTick: null, groups };
}

let acc = fresh();
let published = null; // last closed window
let fns = null; // last profile(N) result
let lastTick = -1;
let totalTicks = 0;

function round(value) {
    return Math.round(value * 1000) / 1000;
}

function record(group, key, used) {
    const slot = acc.groups[group] || (acc.groups[group] = {});
    const entry = slot[key] || (slot[key] = { cpu: 0, calls: 0, max: 0 });
    entry.cpu += used;
    entry.calls++;
    if (used > entry.max) entry.max = used;
}

// Measure `fn` as span `key` and hand back its result; an exception still counts
// and is rethrown, so callers' own handling (guard) is untouched.
function span(key, fn) {
    const start = Game.cpu.getUsed();
    try {
        return fn();
    } finally {
        record("spans", key, Game.cpu.getUsed() - start);
    }
}

function build(source) {
    const ticks = Math.max(1, source.ticks);
    const out = { window: source.ticks, ticks: source.ticks, at: Game.time, used: round(source.total / ticks),
        totalTicks, fromTick: source.fromTick, toTick: source.toTick };
    Object.keys(source.groups).forEach((group) => {
        out[group] = {};
        Object.keys(source.groups[group]).forEach((key) => {
            const e = source.groups[group][key];
            out[group][key] = { avg: round(e.cpu / ticks), max: round(e.max), calls: round(e.calls / ticks) };
        });
    });
    return out;
}

function publish() {
    published = build(acc);
    if (fns) published.fns = fns;
    acc = fresh();
}

// Called after the measured script work. Engine finalization is observed
// through next tick's bucket balance rather than this getUsed() reading.
function endTick() {
    if (lastTick === Game.time) return;
    lastTick = Game.time;
    totalTicks++;
    if (acc.fromTick === null) acc.fromTick = Game.time;
    acc.toTick = Game.time;
    acc.ticks++;
    const used = Game.cpu.getUsed();
    acc.total += used;
    accounting.end(used);
    if (acc.ticks >= Math.max(1, Number(config.get("stats.cpuWindowTicks", 60)) || 60)) publish();
}

// Last closed window (null until the first one closes after a global reset).
function snapshot() {
    return published;
}

// The window in progress, for the console (cpuTop): same shape, averages so far.
function live() {
    return build(acc);
}

// Forget one key (the console probe measures a throwaway guard and removes it again).
function drop(group, key) {
    if (acc.groups[group]) delete acc.groups[group][key];
}

function reset() {
    acc = fresh();
    totalTicks = 0;
    accounting.reset();
}

// L2 result of a profile(N) session: rows are {name, selfTime, totalTime, calls},
// `ticks` the length of the window. Keeps the heaviest functions by self time, as
// per-tick averages, and puts them in the snapshot right away.
function setFns(rows, ticks) {
    const t = Math.max(1, ticks);
    const limit = config.get("stats.cpuTopFunctions", 15);
    const top = rows.slice().sort((a, b) => b.selfTime - a.selfTime).slice(0, limit);
    fns = {};
    top.forEach((r) => {
        fns[r.name] = { self: round(r.selfTime / t), total: round(r.totalTime / t), calls: round(r.calls / t) };
    });
    if (published) published.fns = fns;
}

module.exports = { record, span, endTick, snapshot, live, reset, drop, setFns, GROUPS,
    beginTick: accounting.begin, accounting: accounting.snapshot };
