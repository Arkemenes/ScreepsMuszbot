"use strict";
// ROADMAP 0145: console diagnostics as real functions (a console line is capped at 1024
// characters by the API, so pasted one-liners are fragile). Read-only; they measure
// themselves, so keep them out of clean benchmark windows.

// Memory size per root and what serialising each costs, plus the global's boot tick.
function memory() {
    const start = Game.cpu.getUsed(), parts = {};
    Object.keys(Memory).forEach((k) => { parts[k] = (JSON.stringify(Memory[k]) || "").length; });
    const cpu = Game.cpu.getUsed() - start, stats = Memory.stats || {};
    const out = { tick: Game.time, rawChars: RawMemory.get().length, parts, serializationCpu: cpu,
        boot: require("./cpuAccounting").boot(), reset: stats.persistent && stats.persistent.lastGlobalReset,
        profiler: !!(Memory.settings && Memory.settings.profiler),
        history: typeof marketHistoryStatus === "function" ? marketHistoryStatus() : null };
    console.log("[cpuAuditMemory] " + JSON.stringify(out));
}

// Size of each Memory.rooms[*] field summed over the rooms, and in how many rooms it exists.
function roomFields() {
    const chars = {}, rooms = {}, all = Memory.rooms || {};
    Object.keys(all).forEach((name) => {
        const mem = all[name];
        Object.keys(mem).forEach((k) => {
            chars[k] = (chars[k] || 0) + (JSON.stringify(mem[k]) || "").length + k.length + 3;
            rooms[k] = (rooms[k] || 0) + 1;
        });
    });
    const top = Object.keys(chars).sort((a, b) => chars[b] - chars[a]).slice(0, 15).map((k) => [k, chars[k], rooms[k]]);
    console.log("[cpuAuditRoomFields] " + JSON.stringify({ tick: Game.time, rooms: Object.keys(all).length, fieldCharsWithKeys: top }));
}

module.exports = { memory, roomFields };
