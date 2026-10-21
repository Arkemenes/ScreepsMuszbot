"use strict";
// ROADMAP 0154-B (ARK-133): energyReport - where a room's energy goes and how much of its
// WORK is actually working, over a trailing window of game ticks.
//
// observe() runs once per tick after energyLedger.finalize() and folds each owned room into
// a heap ring of blocks (energyReport.sampleTicks ticks each, default 10; window
// energyReport.windowTicks, default 1500): spend by ledger category and WORK parts alive /
// WORK parts that acted per role are summed every tick; stored energy and controller
// progress are read once, at the block's first tick. Nothing goes to Memory; a global
// reset or a skipped tick shows up as missing coverage (n < ticks), never as zero activity.
//
// report(room, n) aggregates the last n ticks. "income" is a PROXY (delta of stored energy
// plus estimated spend): it ignores transfers, purchases and sales, and is labelled as
// such. Utilization = WORK-ticks with a resolved build/repair/upgrade or accepted harvest
// intent / WORK-ticks alive, per role - one idle builder and several half-idle ones read differently.
// context(room) is the small read-only view later policies (0157/0148/0149) consume.
//
// ROADMAP 0157 T3: per-action utilization over the worker roles (energyReport.workerRoles):
// U_a = (energy spent on action a / e_a) / WORK-ticks of those roles, with e_build = BUILD_POWER (5)
// and e_repair = e_upgrade = 1 energy per WORK per tick; occupancy = WORK-ticks that did anything /
// WORK-ticks (a union per worker: build + upgrade can both be 1 while occupancy is 1). Energy is the
// ledger's estimate (kind "estimated"); a zero denominator reads null.
// ROADMAP 0157 T1: subwindowRates(room) - net stored-energy rate of each of the
// readiness.incomeWindowTicks / readiness.subwindowTicks (600 / 100) subwindows, with coverage, so
// the readiness supply is the slowest complete subwindow, never the window mean.
const config = require("./config");
const census = require("./census");
const roomCache = require("./roomCache");
const energyLedger = require("./energyLedger");
const cpuMeter = require("./cpuMeter");

const rings = {}; // roomName -> [sample], oldest first
let lastTick = -1;
let lastAuto = -1;
const workCache = new Map(); // creep id -> WORK parts (a creep's part types never change)

function windowTicks() {
    const value = Number(config.get("energyReport.windowTicks", 1500));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1500;
}

// Keyed by id only: the engine rebuilds game objects every tick, so a body-identity check
// would never hit live.
function sampleTicks() {
    const value = Number(config.get("energyReport.sampleTicks", 10));
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 10;
}

function workParts(creep) {
    const hit = workCache.get(creep.id);
    if (hit !== undefined) return hit;
    const body = creep.body;
    if (!body) return 0;
    let work = 0;
    for (let i = 0; i < body.length; i++) if (body[i].type === WORK) work++;
    workCache.set(creep.id, work);
    return work;
}

function storedEnergy(room) {
    const storage = room.storage, terminal = room.terminal;
    let energy = (storage && storage.store[RESOURCE_ENERGY] || 0) + (terminal && terminal.store[RESOURCE_ENERGY] || 0);
    for (const c of roomCache.structuresByType(room, STRUCTURE_CONTAINER)) energy += c.store[RESOURCE_ENERGY] || 0;
    return energy;
}

let workerTick = -1, workerSet = null;
function workerRoles() {
    if (workerTick !== Game.time) {
        workerTick = Game.time;
        const roles = config.get("energyReport.workerRoles", ["builder", "upgrader"]);
        workerSet = new Set(Array.isArray(roles) ? roles : []);
    }
    return workerSet;
}

function observe() {
    if (config.get("energyReport.enabled", true) === false) return;
    if (lastTick === Game.time) return;
    if (Game.time < lastTick) for (const name of Object.keys(rings)) delete rings[name];
    lastTick = Game.time;
    const acted = cpuMeter.span("energyReport.acted", () => energyLedger.actedIds());
    const keep = windowTicks(), block = sampleTicks();
    const live = new Set();
    let creepsCpu = 0, sampleCpu = 0, mark;
    for (const room of Game.myRooms || []) {
        const name = room.name;
        const roles = {};
        let workers = 0, workersActing = 0;
        const workerSet = workerRoles();
        mark = Game.cpu.getUsed();
        const byRole = census.rolesInRoom(name);
        for (const role in byRole) {
            const creeps = byRole[role];
            let alive = 0, acting = 0;
            for (let i = 0; i < creeps.length; i++) {
                const creep = creeps[i];
                live.add(creep.id);
                const work = workParts(creep);
                if (!work) continue;
                alive += work;
                if (acted.has(creep.id)) acting += work;
            }
            if (alive) roles[role] = [alive, acting];
            if (workerSet.has(role)) { workers += alive; workersActing += acting; }
        }
        const between = Game.cpu.getUsed();
        creepsCpu += between - mark;
        const ring = rings[name] || (rings[name] = []);
        let sample = ring[ring.length - 1];
        if (!sample || Game.time - sample.t >= block) {
            sample = { t: Game.time, n: 0, spend: {}, roles: {}, workers: 0, workersActing: 0, stored: storedEnergy(room),
                level: room.controller && room.controller.level,
                progress: room.controller && room.controller.progress,
                progressTotal: room.controller && room.controller.progressTotal };
            ring.push(sample);
            while (ring[0].t <= Game.time - keep) ring.shift();
        }
        sample.n++;
        sample.workers += workers;
        sample.workersActing += workersActing;
        const spend = energyLedger.tickCategories(name);
        for (const category in spend) sample.spend[category] = (sample.spend[category] || 0) + spend[category];
        for (const role in roles) {
            const sum = sample.roles[role] || (sample.roles[role] = [0, 0]);
            sum[0] += roles[role][0]; sum[1] += roles[role][1];
        }
        sampleCpu += Game.cpu.getUsed() - between;
    }
    cpuMeter.add("spans", "energyReport.creeps", creepsCpu, 1);
    cpuMeter.add("spans", "energyReport.sample", sampleCpu, 1);
    if (Game.time % 100 === 0) for (const id of workCache.keys()) if (!live.has(id)) workCache.delete(id);
    const every = Number(config.get("energyReport.autoTicks", 1500));
    if (every > 0 && (lastAuto < 0 || Game.time - lastAuto >= every || Game.time < lastAuto)) {
        if (lastAuto >= 0) for (const room of Game.myRooms || []) console.log(line(report(room.name, every)));
        lastAuto = Game.time;
    }
}

function report(roomName, n) {
    const want = Math.max(1, Math.floor(Number(n) || windowTicks()));
    const ring = rings[roomName] || [];
    // blocks are kept whole: the window edge is exact to one block (sampleTicks)
    const samples = ring.filter((s) => s.t > Game.time - want);
    const observed = samples.reduce((sum, s) => sum + s.n, 0);
    const out = { room: roomName, requestedTicks: want, observedTicks: observed,
        coverage: observed / want, fromTick: samples.length ? samples[0].t : null,
        toTick: samples.length ? samples[samples.length - 1].t : null,
        spend: {}, spendPerTick: 0, utilization: {}, storedDelta: null, incomeProxyPerTick: null,
        rcl: null, kind: "estimated", actions: null };
    if (!samples.length) return out;
    let spend = 0, workers = 0, workersActing = 0;
    const work = {};
    for (const s of samples) {
        workers += s.workers || 0;
        workersActing += s.workersActing || 0;
        for (const [category, amount] of Object.entries(s.spend || {})) {
            out.spend[category] = (out.spend[category] || 0) + amount;
            spend += amount;
        }
        for (const [role, [alive, acting]] of Object.entries(s.roles)) {
            const w = work[role] || (work[role] = [0, 0]);
            w[0] += alive; w[1] += acting;
        }
    }
    const ticks = observed;
    out.spendPerTick = spend / ticks;
    for (const [role, [alive, acting]] of Object.entries(work)) {
        out.utilization[role] = { workAlive: alive / ticks, workActing: acting / ticks, ratio: alive ? acting / alive : 0 };
    }
    const buildPower = typeof BUILD_POWER === "number" ? BUILD_POWER : 5;
    const repairEnergy = (out.spend.repairNormal || 0) + (out.spend.repairRampart || 0) + (out.spend.repairWall || 0);
    const per = (energy, e) => (workers > 0 ? (energy || 0) / e / workers : null);
    out.actions = { workerWorkTicks: workers, build: per(out.spend.build, buildPower), repair: per(repairEnergy, 1),
        upgrade: per(out.spend.upgrade, 1), occupancy: workers > 0 ? workersActing / workers : null };
    const first = samples[0], last = samples[samples.length - 1];
    if (last.t > first.t) {
        out.storedDelta = last.stored - first.stored;
        // stored is read at a block's first tick (before its intents apply), so the
        // "last - first" interval holds every block's spend except the last one's
        const spendInside = spend - Object.values(last.spend || {}).reduce((a, b) => a + b, 0);
        out.incomeProxyPerTick = (out.storedDelta + spendInside) / (last.t - first.t);
    }
    if (last.level) {
        out.rcl = { level: last.level, progress: last.progress, progressTotal: last.progressTotal, etaTicks: null };
        if (last.t > first.t && last.level === first.level && last.progressTotal) {
            const rate = (last.progress - first.progress) / (last.t - first.t);
            if (rate > 0) out.rcl.etaTicks = Math.ceil((last.progressTotal - last.progress) / rate);
        }
    }
    return out;
}

function line(r) {
    const util = Object.entries(r.utilization).map(([role, u]) =>
        role + " " + Math.round(u.ratio * 100) + "% de " + u.workAlive.toFixed(1) + "W").join(", ");
    const top = Object.entries(r.spend).sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([c, v]) => c + " " + (v / Math.max(1, r.observedTicks)).toFixed(1)).join(", ");
    return "[energyReport] " + r.room + " " + r.observedTicks + "/" + r.requestedTicks + " ticks: gasto " +
        r.spendPerTick.toFixed(1) + "/t (" + top + "); renda~ " +
        (r.incomeProxyPerTick === null ? "?" : r.incomeProxyPerTick.toFixed(1)) + "/t; Δestoque " +
        (r.storedDelta === null ? "?" : r.storedDelta) + "; WORK ativo: " + (util || "-") +
        (r.rcl && r.rcl.etaTicks ? "; RCL" + (r.rcl.level + 1) + " em ~" + r.rcl.etaTicks + "t" : "");
}

// 0157 T1: net stored-energy rate per subwindow of the last incomeWindowTicks, oldest first:
// [{ fromTick, toTick, observedTicks, coverage, rate }] - rate is null without two blocks in it.
function subwindowRates(roomName, windowT, subT) {
    const win = Math.max(1, Math.floor(Number(windowT || config.get("readiness.incomeWindowTicks", 600))));
    const sub = Math.max(1, Math.floor(Number(subT || config.get("readiness.subwindowTicks", 100))));
    const ring = rings[roomName] || [];
    const out = [];
    for (let start = Game.time - win; start < Game.time; start += sub) {
        const end = Math.min(Game.time, start + sub);
        const samples = ring.filter((s) => s.t > start && s.t <= end);
        const observed = samples.reduce((sum, s) => sum + s.n, 0);
        const first = samples[0], last = samples[samples.length - 1];
        out.push({ fromTick: start + 1, toTick: end, observedTicks: observed, coverage: observed / (end - start),
            rate: samples.length > 1 && last.t > first.t ? (last.stored - first.stored) / (last.t - first.t) : null });
    }
    return out;
}

// Read-only view for policies: null until the window holds enough coverage to judge.
function context(roomName, n) {
    const r = report(roomName, n);
    const minCoverage = Number(config.get("energyReport.minCoverage", 0.9));
    return r.coverage >= minCoverage ? r : null;
}

global.energyReport = function (roomName, n) {
    const names = roomName ? [roomName] : (Game.myRooms || []).map((room) => room.name);
    return names.map((name) => line(report(name, n))).join("\n");
};

// Compact numbers for Memory.stats (Grafana / live checks): rounded, no per-tick series.
function summary(roomName, n) {
    const r = report(roomName, n);
    const round = (v, d = 2) => v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d;
    const utilization = {};
    for (const [role, u] of Object.entries(r.utilization)) utilization[role] = { ratio: round(u.ratio), work: round(u.workAlive, 1) };
    return { ticks: r.observedTicks, coverage: round(r.coverage), spendPerTick: round(r.spendPerTick),
        incomeProxyPerTick: round(r.incomeProxyPerTick), storedDelta: r.storedDelta, utilization,
        rclEtaTicks: r.rcl ? r.rcl.etaTicks : null,
        actions: r.actions ? { build: round(r.actions.build, 3), repair: round(r.actions.repair, 3), upgrade: round(r.actions.upgrade, 3),
            occupancy: round(r.actions.occupancy, 3), workerWork: round(r.actions.workerWorkTicks / Math.max(1, r.observedTicks), 1) } : null };
}

function reset() { for (const name of Object.keys(rings)) delete rings[name]; lastTick = -1; lastAuto = -1; workCache.clear(); }

module.exports = { observe, report, summary, context, subwindowRates, reset };
