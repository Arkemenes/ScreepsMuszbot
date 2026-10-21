"use strict";
// One list of damaged structures per room, shared by structures/tower.js and roles/builder.js
// (ROADMAP 0118). Each of them used to walk EVERY structure of the room on its own - the tower
// every 5 ticks, the builder's critical list and its repair list on every tick - reading
// structureType/hits/hitsMax (engine getters) and tier() on hundreds of ramparts, roads and
// walls just to find the few that are damaged (builder.opportunistic was ~0.8 CPU/tick).
//
//   ids(room)     the damaged, worth-repairing structure ids, rescanned every repair.scanTicks
//                 (5) - and every tick while the room is under attack, when ramparts fall
//                 fast. Heap only. A structure that gets damaged is seen at most that late;
//                 one that is repaired drops out at once (see sorted()).
//   sorted(room)  the live objects still below hitsMax, in rampartRepair.priority order
//                 (tier, then type, then ratio) - computed once per tick per room.
//   critical(room) the leading run of sorted() that is in the "critical" tier.
const config = require("./config");
const roomCache = require("./roomCache");
const traffic = require("./traffic");
const rampartRepair = require("./rampartRepair");

const scans = {};
let listTick = -1;
let sortedLists = {};
let criticalLists = {};

function ids(room) {
    const mem = Memory.rooms && Memory.rooms[room.name];
    const interval = Math.max(1, Number(config.get("repair.scanTicks", 5)) || 5);
    let scan = scans[room.name];
    if (!scan || Game.time < scan.tick || Game.time - scan.tick >= interval || (mem && mem.defenseActive)) {
        const found = [];
        const all = roomCache.structures(room);
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (s.structureType === STRUCTURE_CONTROLLER) continue;
            if (s.hits < s.hitsMax && traffic.worthRepairing(s)) found.push(s.id);
        }
        scan = scans[room.name] = { tick: Game.time, ids: found };
    }
    return scan.ids;
}

function freshTick() {
    if (listTick !== Game.time) {
        listTick = Game.time;
        sortedLists = {};
        criticalLists = {};
    }
}

// ARK-116: ramparts and walls are almost never at hitsMax, so the list is long and sorting it
// (tier() per entry) every tick per room was the bulk of builder.opportunistic. The order is
// computed on the scan ticks of ids() and reused in between - a repaired structure still drops
// out at once, the order within a tier is at most repair.scanTicks old (the same latency a
// newly damaged structure already has). Under attack ids() rescans every tick, so it re-sorts.
const sortedOrder = {};
function sorted(room) {
    freshTick();
    if (!sortedLists[room.name]) {
        const list = ids(room);
        const scanTick = scans[room.name].tick;
        const cached = sortedOrder[room.name];
        const live = [];
        if (cached && cached.scanTick === scanTick && cached.ids === list) {
            for (let i = 0; i < cached.order.length; i++) {
                const s = Game.getObjectById(cached.order[i]);
                if (s && s.hits < s.hitsMax) live.push(s);
            }
            sortedLists[room.name] = live;
        } else {
            for (let i = 0; i < list.length; i++) {
                const s = Game.getObjectById(list[i]);
                if (s && s.hits < s.hitsMax) live.push(s);
            }
            sortedLists[room.name] = _.sortBy(live, rampartRepair.priorityKey);
            sortedOrder[room.name] = { scanTick, ids: list, order: sortedLists[room.name].map((s) => s.id) };
        }
    }
    return sortedLists[room.name];
}

function critical(room) {
    freshTick();
    if (!criticalLists[room.name]) {
        const list = sorted(room);
        let n = 0;
        while (n < list.length && rampartRepair.tier(list[n]) === "critical") n++;
        criticalLists[room.name] = list.slice(0, n);
    }
    return criticalLists[room.name];
}

// Tests build a fresh room per case under the same name.
function reset() {
    Object.keys(scans).forEach((name) => { delete scans[name]; });
    Object.keys(sortedOrder).forEach((name) => { delete sortedOrder[name]; });
    listTick = -1;
    sortedLists = {};
    criticalLists = {};
}

module.exports = { ids, sorted, critical, reset };
