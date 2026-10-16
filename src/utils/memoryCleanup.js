"use strict";
// ROADMAP 0146: one idempotent pass per global that drops what no longer belongs in
// Memory.rooms. Cheap (one loop over the rooms, no game calls) and safe to repeat; it
// is itself a migration, so remove it once a deploy has confirmed it found nothing.
//   walkMatrix / terrainMatrix  terrain is heap data (utils/terrain.js), spec 0001
//   exits                       derived: utils/mapExits.js (only where lastVisit proves
//                               getIntel saw the room, so known() answers the same)
//   builds                      read by nothing
//   enemies / enemyStructures / numberOfTowers / hasInvaderCore
//                               stored only when non-default: every reader treats a
//                               missing field as 0/false (audit in spec 0146)
let done = false;
const bootDelay = 5; // stay clear of the cold-start tick

// The abTest tool was removed (2026-10-15). An experiment in flight at that deploy leaves Memory.abTest and a
// phase value in Memory.settings: put the original value back once, then forget it.
function restoreAbTest() {
    const saved = Memory.abTest;
    if (!saved) return 0;
    const keys = String(saved.path).split(".");
    let node = Memory.settings;
    for (let i = 0; node && i < keys.length - 1; i++) node = node[keys[i]];
    if (node && typeof node === "object") {
        const last = keys[keys.length - 1];
        if (saved.hadOriginal) node[last] = saved.original; else delete node[last];
    }
    delete Memory.abTest;
    return 1;
}

function run() {
    if (done || !Memory.rooms) return 0;
    if (Game.time < (require("./cpuAccounting").boot() || 0) + bootDelay) return 0;
    done = true;
    let removed = restoreAbTest();
    const rooms = Memory.rooms;
    Object.keys(rooms).forEach((name) => {
        const mem = rooms[name];
        if (!mem || typeof mem !== "object") return;
        ["walkMatrix", "terrainMatrix", "builds"].forEach((key) => {
            if (mem[key] !== undefined) { delete mem[key]; removed++; }
        });
        if (mem.exits && mem.lastVisit !== undefined) { delete mem.exits; removed++; }
        if (mem.enemies === 0) { delete mem.enemies; removed++; }
        if (mem.enemyStructures === 0) { delete mem.enemyStructures; removed++; }
        if (mem.numberOfTowers === 0) { delete mem.numberOfTowers; removed++; }
        if (mem.hasInvaderCore === false) { delete mem.hasInvaderCore; removed++; }
    });
    // one line per global: `removed 0` after a deploy means this module (and its migration) can be retired
    console.log("[memoryCleanup] removed " + removed + " legacy field(s)");
    return removed;
}

function reset() { done = false; }

module.exports = { run, reset };
