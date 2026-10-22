// Emptying another player's room of every resource it holds (ROADMAP 0177) -
// the single place that decides what is lootable and when damage cancels
// the mission; roles/looter.js only executes. Console:
//   lootRoom("W4N48")            -> mother = nearest owned room with spawn + storage
//   lootRoom("W4N48", "W7N49")   -> explicit mother room
//   cancelLoot(room?, mother?)   -> stop matching missions; no args stops all
//   lootStatus(room?)            -> list matching missions and populations
// Memory.lootTargets[id] = {id, room, from}; creep.memory.lootId identifies it.

const config = require("../utils/config");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const salvage = require("../utils/salvage");
const { isAlly } = require("../utils/hostiles");
const remotes = require("./remotes");

// withdraw() is refused by the engine for these
const NOT_WITHDRAWABLE = [STRUCTURE_NUKER, STRUCTURE_POWER_BANK, STRUCTURE_INVADER_CORE];

function lootResource(pile) {
    const eligible = (resource, amount) => amount > 0 &&
        (resource !== RESOURCE_ENERGY || amount >= config.get("loot.minEnergyAmount", 30));
    if (pile.resourceType !== undefined) {
        return eligible(pile.resourceType, pile.amount) ? pile.resourceType : null;
    }
    return pile.store && Object.keys(pile.store).find((r) => eligible(r, pile.store[r])) || null;
}

// Prefer the closest owned room that can receive the entire cargo, then storage
// before containers within that room. Capacity is checked live, even same tick.
function deliveryDestination(creep, resource) {
    const required = Math.max(1, creep.store.getUsedCapacity());
    let best = null;
    let bestHops = Infinity;
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        const hops = remotes.roomDistance(creep.room.name, name);
        if (!Number.isFinite(hops) || hops > bestHops) continue;
        const available = (s) => s && s.store && s.store.getFreeCapacity(resource) >= required;
        let target = available(room.storage) ? room.storage : null;
        if (!target) {
            let range = Infinity;
            for (const s of roomCache.structures(room)) {
                if (s.structureType !== STRUCTURE_CONTAINER || !available(s)) continue;
                const distance = name === creep.room.name ? creep.pos.getRangeTo(s) : 0;
                if (!target || distance < range) { target = s; range = distance; }
            }
        }
        if (!target) continue;
        if (!best || hops < bestHops || name === creep.memory.home) {
            best = target;
            bestHops = hops;
        }
    }
    return best;
}

// Every pile in `room` a looter may take: dropped resources, tombstones,
// ruins, and any non-ally, non-mine structure store - minus what a hostile
// rampart covers (the engine refuses withdraw through it).
function lootablePiles(room) {
    const piles = [];
    for (const drop of roomCache.droppedResources(room)) {
        if (lootResource(drop)) piles.push(drop);
    }
    for (const t of roomCache.tombstones(room).concat(roomCache.ruins(room))) {
        if (lootResource(t)) piles.push(t);
    }
    for (const s of roomCache.structures(room)) {
        if (s.my === true || NOT_WITHDRAWABLE.indexOf(s.structureType) !== -1) continue;
        if (s.owner && isAlly(s.owner.username)) continue;
        if (lootResource(s)) piles.push(s);
    }
    return salvage.excludeProtected(piles, room);
}

function nextId() {
    Memory.lootSequence = (Memory.lootSequence || 0) + 1;
    return "loot" + Game.time + "-" + Memory.lootSequence;
}

function missions() {
    const all = Memory.lootTargets || (Memory.lootTargets = {});
    const legacy = Memory.lootTarget;
    if (legacy) {
        let entry = Object.values(all).find((m) => m.room === legacy.room && m.from === legacy.from);
        if (!entry) {
            const id = nextId();
            entry = all[id] = { id, room: legacy.room, from: legacy.from };
        }
        entry.legacy = true; // adopt old looters, including ones still spawning
        delete Memory.lootTarget;
    }
    return all;
}

function findMission(room, from) {
    return Object.values(missions()).find((m) => m.room === room && (!from || m.from === from));
}

function matches(creep, loot) {
    if (!loot || creep.memory.home !== loot.from || creep.memory.targetRoom !== loot.room) return false;
    if (creep.memory.lootId) return creep.memory.lootId === loot.id;
    if (!loot.legacy) return false;
    creep.memory.lootId = loot.id;
    return true;
}

function forCreep(creep) {
    const all = missions();
    if (creep.memory.lootId) {
        const entry = all[creep.memory.lootId];
        return matches(creep, entry) ? entry : null;
    }
    return Object.values(all).find((entry) => entry.legacy && matches(creep, entry)) || null;
}

function finish(loot, reason) {
    if (!loot || !missions()[loot.id]) return;
    console.log(`[loot] ${loot.room}: ${reason} - loot finished`);
    delete Memory.lootTargets[loot.id];
}

function looters(loot) {
    return census.all("looter").filter((c) => matches(c, loot));
}

// Observe all members before spawning or acting, independent of role order.
// Include the caller so its current health is checked directly as well.
function checkHealth(loot, creep) {
    if (!loot || !missions()[loot.id]) return false;
    delete loot.pausedUntil; // old tower-based cooldowns no longer apply
    const ratio = config.get("loot.cancelHpRatio", 0.5);
    const damaged = (creep ? [creep] : []).concat(looters(loot)).find((c) =>
        matches(c, loot) &&
        c.hitsMax > 0 && c.hits <= c.hitsMax * ratio);
    if (!damaged) return false;
    finish(loot, `cancelled: ${damaged.name || damaged.id} at or below ${ratio * 100}% hits`);
    return true;
}

// How many looters `motherRoom` should still spawn.
function candidates(motherRoom) {
    const entries = Object.values(missions()).filter((m) => m.from === motherRoom.name && !checkHealth(m));
    const mem = Memory.rooms[motherRoom.name];
    if (mem && mem.defenseActive) return [];
    // looting is optional: no new looters while the CPU bucket is in its critical band
    if (config.get("cpu.pauseLootersInCritical", true) && require("../utils/cpuTier").band() === "critical") return [];
    const limit = config.get("loot.maxHaulers", 3);
    return entries.map((entry) => ({ entry, count: looters(entry).length }))
        .filter(({ count }) => count < limit);
}

function lootersWanted(motherRoom) {
    const limit = config.get("loot.maxHaulers", 3);
    return candidates(motherRoom).reduce((n, item) => n + limit - item.count, 0);
}

function nextLoot(motherRoom) {
    let best = null;
    for (const item of candidates(motherRoom)) {
        if (!best || item.count < best.count) best = item;
    }
    return best && best.entry;
}

function canReceive(room) {
    return !!(room && room.controller && room.controller.my &&
        roomCache.mySpawns(room).length && (room.storage ||
            roomCache.structures(room).some((s) => s.structureType === STRUCTURE_CONTAINER)));
}

function nearestMother(targetRoomName) {
    let best = null;
    let bestDist = Infinity;
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (name === targetRoomName || !canReceive(room)) continue;
        const dist = remotes.roomDistance(name, targetRoomName);
        if (dist < bestDist) {
            bestDist = dist;
            best = name;
        }
    }
    return best;
}

function refusalReason(targetRoomName, motherRoomName) {
    const tmem = Memory.rooms[targetRoomName];
    if (!tmem || !tmem.lastVisit) return `${targetRoomName} hasn't been scouted yet`;
    if (tmem.my) return `${targetRoomName} is mine`;
    if (tmem.owner && isAlly(tmem.owner)) return `${targetRoomName} belongs to ${tmem.owner}, an ally`;
    if (!motherRoomName) return "no owned room with a spawn and a storage/container to deliver to";
    if (!canReceive(Game.rooms[motherRoomName])) {
        return `${motherRoomName} needs to be mine, in vision, with a spawn and a storage/container`;
    }
    const hops = remotes.roomDistance(motherRoomName, targetRoomName);
    const maxHops = config.get("loot.maxHops", 10);
    if (hops > maxHops) return `${targetRoomName} is ${hops} rooms from ${motherRoomName} (max loot.maxHops=${maxHops})`;
    return null;
}

global.lootRoom = function (targetRoomName, motherRoomName) {
    const mother = motherRoomName || nearestMother(targetRoomName);
    const reason = refusalReason(targetRoomName, mother);
    if (reason) {
        console.log(`[loot] refusing: ${reason}`);
        return;
    }
    const existing = findMission(targetRoomName, mother);
    if (existing) {
        console.log(`[loot] ${existing.id}: ${mother} is already looting ${targetRoomName}`);
        return existing.id;
    }
    const id = nextId();
    missions()[id] = { id, room: targetRoomName, from: mother };
    console.log(`[loot] ${id}: ${mother} will send up to ${config.get("loot.maxHaulers", 3)} looters to empty ${targetRoomName}`);
    return id;
};

global.cancelLoot = function (targetRoomName, motherRoomName) {
    const entries = Object.values(missions()).filter((m) =>
        (!targetRoomName || m.room === targetRoomName) && (!motherRoomName || m.from === motherRoomName));
    if (!entries.length) {
        console.log("[loot] no loot pending");
        return;
    }
    for (const entry of entries) finish(entry, "cancelled");
};

global.lootStatus = function (targetRoomName) {
    const entries = Object.values(missions()).filter((m) => !targetRoomName || m.room === targetRoomName);
    if (!entries.length) {
        console.log("[loot] no loot pending");
        return [];
    }
    return entries.map((loot) => {
        const count = looters(loot).length;
        console.log(`[loot] ${loot.id}: ${loot.from} -> ${loot.room}: ${count} looter(s) out`);
        return { id: loot.id, room: loot.room, from: loot.from, looters: count };
    });
};

module.exports = {
    lootResource,
    deliveryDestination,
    lootablePiles,
    findMission,
    forCreep,
    nextLoot,
    checkHealth,
    finish,
    lootersWanted,
    refusalReason,
};
