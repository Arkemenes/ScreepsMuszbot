"use strict";
// ROADMAP 0163 (ARK-202): terminal utilization - the terminal side of the OPERATE_LAB vs
// OPERATE_TERMINAL decision (0150 T7), next to utils/labReport. OPERATE_TERMINAL multiplies the
// freight and the cooldown of the terminal it is applied to, so it is worth something only when
// our own terminal pays freight for useful transfers (sends and deals we initiate - a passive
// listing filled by someone else pays nothing on our side) or when useful work waits on the
// cooldown.
//
// observe() runs once per tick after the terminal executors; per owned room with a terminal:
//   ticks      observed ticks
//   cooldown   ticks the terminal was cooling down (busy)
//   blocked    ticks a terminal operation was ready but waited only on the cooldown
//              (terminalOps calls blocked(room) where it parks an op on "terminal em cooldown")
// and from terminalOps.record (the confirmed send/deal ledger, paid by op.sourceRoom):
//   freight    energy paid as freight by this terminal
//   amount     resource moved by those transfers, transfers = their count
//
// The OPERATE_TERMINAL estimate is descriptive: freight/tick x effect duration x (1 - factor)
// per application and level, against its ops cost (POWER_INFO). It does not approve an operator.
// Counters are cumulative per room in Memory.terminalReport[room] (a handful of numbers) so the
// evidence survives global resets and grows over days; terminalReset(room) starts a new epoch.
const config = require("./config");

let lastTick = -1;
let blockedTick = -1;
let blockedRooms = new Set(); // rooms already counted as blocked this tick

function counters(roomName) {
    if (!Memory.terminalReport) Memory.terminalReport = {};
    return Memory.terminalReport[roomName] ||
        (Memory.terminalReport[roomName] = { since: Game.time, ticks: 0, cooldown: 0, blocked: 0, freight: 0, amount: 0, transfers: 0 });
}

function enabled() { return config.get("terminalReport.enabled", true) !== false; }

// a ready operation waited only on this room's terminal cooldown this tick (counted once per tick)
function blocked(roomName) {
    if (!roomName || !enabled()) return;
    if (blockedTick !== Game.time) { blockedTick = Game.time; blockedRooms = new Set(); }
    if (blockedRooms.has(roomName)) return;
    blockedRooms.add(roomName);
    counters(roomName).blocked++;
}

// a confirmed send/deal paid `energy` freight from roomName's terminal
function freight(roomName, energy, amount) {
    if (!roomName || !enabled() || !(energy > 0)) return;
    const c = counters(roomName);
    c.freight += energy;
    c.amount += amount > 0 ? amount : 0;
    c.transfers++;
}

function observe() {
    if (!enabled() || lastTick === Game.time) return;
    lastTick = Game.time;
    for (const room of Game.myRooms || []) {
        const terminal = room.terminal;
        if (!terminal || !terminal.my) continue;
        const c = counters(room.name);
        c.ticks++;
        if (terminal.cooldown > 0) c.cooldown++;
    }
}

// OPERATE_TERMINAL per level: { level, saved (energy per application), ops, savedPerOp }, or null
// without the engine constants
function operateEstimate(freightPerTick) {
    if (typeof PWR_OPERATE_TERMINAL === "undefined" || typeof POWER_INFO === "undefined") return null;
    const info = POWER_INFO[PWR_OPERATE_TERMINAL];
    if (!info || !Array.isArray(info.effect) || !(info.duration > 0)) return null;
    return info.effect.map((factor, i) => {
        const saved = freightPerTick * info.duration * (1 - factor);
        return { level: i + 1, saved, ops: info.ops || null, savedPerOp: info.ops ? saved / info.ops : null };
    });
}

function report(roomName) {
    const c = Memory.terminalReport && Memory.terminalReport[roomName];
    if (!c || !c.ticks) return null;
    const freightPerTick = c.freight / c.ticks;
    return { room: roomName, since: c.since, ticks: c.ticks, busy: c.cooldown / c.ticks, blocked: c.blocked / c.ticks,
        freightPerTick, amountPerTick: c.amount / c.ticks, transfers: c.transfers,
        freightPerUnit: c.amount ? c.freight / c.amount : 0, operate: operateEstimate(freightPerTick) };
}

function line(r) {
    if (!r) return "";
    const pct = (v) => Math.round(v * 100) + "%";
    const op = r.operate ? r.operate.filter((e) => e.level === 1 || e.level === 5)
        .map((e) => "L" + e.level + " " + Math.round(e.saved) + "e/aplicação" + (e.savedPerOp !== null ? " (" + e.savedPerOp.toFixed(1) + "e/op)" : "")).join(", ") : "sem constantes";
    return "[terminalReport] " + r.room + " " + r.ticks + "t desde " + r.since + ": cooldown " + pct(r.busy) +
        ", espera por cooldown " + pct(r.blocked) + "; frete " + r.freightPerTick.toFixed(2) + "e/t em " + r.transfers +
        " transferências (" + r.amountPerTick.toFixed(1) + " un/t, " + r.freightPerUnit.toFixed(3) + "e/un); OPERATE_TERMINAL: " + op;
}

// Compact numbers for Memory.stats.
function summary(roomName) {
    const r = report(roomName);
    if (!r) return null;
    const round = (v) => (v === null ? null : Math.round(v * 1000) / 1000);
    const top = r.operate ? r.operate[r.operate.length - 1] : null;
    const first = r.operate ? r.operate[0] : null;
    return { ticks: r.ticks, busy: round(r.busy), blocked: round(r.blocked), freightPerTick: round(r.freightPerTick),
        amountPerTick: round(r.amountPerTick), transfers: r.transfers,
        operateSavedL1: first ? Math.round(first.saved) : null, operateSavedL5: top ? Math.round(top.saved) : null };
}

global.terminalReport = function (roomName) {
    const names = roomName ? [roomName] : (Game.myRooms || []).map((room) => room.name);
    return names.map((name) => line(report(name))).filter(Boolean).join("\n") || "[terminalReport] sem dados ainda";
};
global.terminalReset = function (roomName) {
    if (!Memory.terminalReport) return 0;
    const names = roomName ? [roomName] : Object.keys(Memory.terminalReport);
    names.forEach((name) => delete Memory.terminalReport[name]);
    return names.length;
};

module.exports = { observe, blocked, freight, report, summary };
