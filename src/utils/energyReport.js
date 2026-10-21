"use strict";
// ROADMAP 0154-B (ARK-133): energyReport - where a room's energy goes and how much of its
// WORK is actually working, over a trailing window of game ticks.
//
// observe() runs once per tick after energyLedger.finalize() and keeps one compact sample
// per owned room in a heap ring (energyReport.windowTicks, default 1500): spend by ledger
// category, WORK parts alive / WORK parts that acted per role, stored energy, controller
// progress. Nothing goes to Memory; a global reset or a skipped tick shows up as missing
// coverage, never as zero activity.
//
// report(room, n) aggregates the last n ticks. "income" is a PROXY (delta of stored energy
// plus estimated spend): it ignores transfers, purchases and sales, and is labelled as
// such. Utilization = WORK-ticks with a resolved build/repair/upgrade or accepted harvest
// intent / WORK-ticks alive, per role - one idle builder and several half-idle ones read differently.
// context(room) is the small read-only view later policies (0157/0148/0149) consume.
const config = require("./config");
const census = require("./census");
const roomCache = require("./roomCache");
const energyLedger = require("./energyLedger");
const cpuMeter = require("./cpuMeter");

const rings = {}; // roomName -> [sample], oldest first
let lastTick = -1;
let lastAuto = -1;
const workCache = new Map(); // creep id -> { body, work } (WORK parts, counted once per body)

function windowTicks() {
    const value = Number(config.get("energyReport.windowTicks", 1500));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1500;
}

function workParts(creep) {
    const body = creep.body;
    if (!body) return 0;
    const hit = workCache.get(creep.id);
    if (hit && hit.body === body) return hit.work;
    let work = 0;
    for (let i = 0; i < body.length; i++) if (body[i].type === WORK) work++;
    workCache.set(creep.id, { body, work });
    return work;
}

function storedEnergy(room) {
    let energy = (room.storage && room.storage.store[RESOURCE_ENERGY] || 0) +
        (room.terminal && room.terminal.store[RESOURCE_ENERGY] || 0);
    for (const c of roomCache.structuresByType(room, STRUCTURE_CONTAINER)) energy += c.store[RESOURCE_ENERGY] || 0;
    return energy;
}

function observe() {
    if (config.get("energyReport.enabled", true) === false) return;
    if (lastTick === Game.time) return;
    if (Game.time < lastTick) for (const name of Object.keys(rings)) delete rings[name];
    lastTick = Game.time;
    const acted = cpuMeter.span("energyReport.acted", () => energyLedger.actedIds());
    const keep = windowTicks();
    const live = new Set();
    let creepsCpu = 0, sampleCpu = 0, mark;
    for (const room of Game.myRooms || []) {
        const name = room.name;
        const roles = {};
        mark = Game.cpu.getUsed();
        for (const creep of census.allInRoom(name)) {
            live.add(creep.id);
            const work = workParts(creep);
            if (!work || !creep.memory || !creep.memory.role) continue;
            const slot = roles[creep.memory.role] || (roles[creep.memory.role] = [0, 0]);
            slot[0] += work;
            if (acted.has(creep.id)) slot[1] += work;
        }
        const between = Game.cpu.getUsed();
        creepsCpu += between - mark;
        const ring = rings[name] || (rings[name] = []);
        ring.push({ t: Game.time, spend: energyLedger.tickCategories(name), roles,
            stored: storedEnergy(room), level: room.controller && room.controller.level,
            progress: room.controller && room.controller.progress,
            progressTotal: room.controller && room.controller.progressTotal });
        while (ring.length && ring[0].t <= Game.time - keep) ring.shift();
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
    const samples = ring.filter((s) => s.t > Game.time - want);
    const out = { room: roomName, requestedTicks: want, observedTicks: samples.length,
        coverage: samples.length / want, fromTick: samples.length ? samples[0].t : null,
        toTick: samples.length ? samples[samples.length - 1].t : null,
        spend: {}, spendPerTick: 0, utilization: {}, storedDelta: null, incomeProxyPerTick: null,
        rcl: null, kind: "estimated" };
    if (!samples.length) return out;
    let spend = 0;
    const work = {};
    for (const s of samples) {
        for (const [category, amount] of Object.entries(s.spend || {})) {
            out.spend[category] = (out.spend[category] || 0) + amount;
            spend += amount;
        }
        for (const [role, [alive, acting]] of Object.entries(s.roles)) {
            const w = work[role] || (work[role] = [0, 0]);
            w[0] += alive; w[1] += acting;
        }
    }
    const ticks = samples.length;
    out.spendPerTick = spend / ticks;
    for (const [role, [alive, acting]] of Object.entries(work)) {
        out.utilization[role] = { workAlive: alive / ticks, workActing: acting / ticks, ratio: alive ? acting / alive : 0 };
    }
    const first = samples[0], last = samples[samples.length - 1];
    if (ticks > 1) {
        out.storedDelta = last.stored - first.stored;
        // spend of the first sample happened before the "last - first" interval opened
        const spendInside = spend - Object.values(first.spend || {}).reduce((a, b) => a + b, 0);
        out.incomeProxyPerTick = (out.storedDelta + spendInside) / (last.t - first.t);
    }
    if (last.level) {
        out.rcl = { level: last.level, progress: last.progress, progressTotal: last.progressTotal, etaTicks: null };
        if (ticks > 1 && last.level === first.level && last.progressTotal) {
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
        rclEtaTicks: r.rcl ? r.rcl.etaTicks : null };
}

function reset() { for (const name of Object.keys(rings)) delete rings[name]; lastTick = -1; lastAuto = -1; workCache.clear(); }

module.exports = { observe, report, summary, context, reset };
