"use strict";
// ROADMAP 0148 T1 (ARK-135): is there useful builder work in a room, now or before a
// replacement builder could arrive? Pure observation - rooms/needs.js decides what to do.
//
// A builder's work is exactly what roles/builder.js would do with energy in hand:
//   build    any construction site
//   repair   the room's damaged list (utils/damagedStructures) filtered by
//            rampartRepair.builderMayRepair - every tier, never only emergencies:
//            critical          always demand (emergency floor)
//            defensive entries demand: rampart/wall hardening the storage gates already allow
//            normal entries    demand unless the towers verifiably cover them (below)
//   upgrade  below RCL8 every upgrade is RCL progress -> demand. At RCL8 the builder only
//            fills the 1% band under rcl8SafeRatio (0103); the downgrade floor is the
//            upgrader's (needs.js, rcl8UpkeepRatio), so that band is not builder demand.
//
// Tower coverage is never presumed (AC2): it counts only with at least one tower, every
// tower at or above tower.satisfactoryRepairEnergyRatio (the gate towerMayRepair applies to
// non-critical repair - same tier/storage gates as the builder's), no defense or hostiles,
// and an economy that is not "critical" (the towers stay refilled).
//
// Replacement lead = body parts x CREEP_SPAWN_TIME + travel + margin
// (population.onDemand.travelTicks / marginTicks). idleSince(room) is the first tick of the
// current unbroken no-demand run (heap; a reset starts it over, a demand tick clears it, and
// evaluations more than population.onDemand.gapTicks (20) apart - needs is cached a few ticks -
// count as a break), so
// a caller can require the room to stay idle longer than the lead before letting go.
const config = require("./config");
const roomCache = require("./roomCache");
const damaged = require("./damagedStructures");
const rampartRepair = require("./rampartRepair");
const resourceTiers = require("./resourceTiers");

const idle = {}; // roomName -> { since, last }

function builderParts(room) {
    // same scaling as roles/builder.js spawnData (scaledBody of [WORK, CARRY, MOVE])
    const units = Math.max(1, Math.min(Math.floor((room.energyCapacityAvailable || 0) / 200), 16));
    return units * 3;
}

function leadTicks(room) {
    const spawnTime = typeof CREEP_SPAWN_TIME === "number" ? CREEP_SPAWN_TIME : 3;
    return builderParts(room) * spawnTime + Number(config.get("population.onDemand.travelTicks", 50)) +
        Number(config.get("population.onDemand.marginTicks", 100));
}

function towersCover(room) {
    const towers = roomCache.structuresByType(room, STRUCTURE_TOWER);
    if (!towers.length) return "no-tower";
    const mem = (Memory.rooms && Memory.rooms[room.name]) || {};
    if (mem.defenseActive || mem.enemies > 0) return "defense";
    if (resourceTiers.getEconomySnapshot(room).state === "critical") return "economy-critical";
    const ratio = config.get("tower.satisfactoryRepairEnergyRatio", 0.7);
    for (const tower of towers) {
        const capacity = tower.store.getCapacity(RESOURCE_ENERGY) || 1;
        if ((tower.store[RESOURCE_ENERGY] || 0) / capacity < ratio) return "tower-energy";
    }
    return null;
}

// { useful, reasons: [...], lead, idleSince } - reasons name every kind of demand found
// (empty when none); a tower-coverage failure is reported as "repair-uncovered:<why>".
function evaluate(room) {
    const reasons = [];
    if (roomCache.constructionSites(room).length) reasons.push("build");
    const ctrl = room.controller;
    if (ctrl && ctrl.my && ctrl.level < 8) reasons.push("rcl-progress");
    let normal = false;
    for (const s of damaged.sorted(room)) {
        if (!rampartRepair.builderMayRepair(s, room)) continue;
        if (rampartRepair.tier(s) === "critical") { if (reasons.indexOf("repair-critical") < 0) reasons.push("repair-critical"); continue; }
        if (rampartRepair.isDefensive(s)) { if (reasons.indexOf("repair-defensive") < 0) reasons.push("repair-defensive"); continue; }
        normal = true;
    }
    if (normal) {
        const gap = towersCover(room);
        if (gap) reasons.push("repair-uncovered:" + gap);
    }
    const useful = reasons.length > 0;
    const mark = idle[room.name];
    if (useful) delete idle[room.name];
    else if (!mark || Game.time < mark.last || Game.time - mark.last > Number(config.get("population.onDemand.gapTicks", 20))) {
        idle[room.name] = { since: Game.time, last: Game.time };
    }
    else mark.last = Game.time;
    return { useful, reasons, lead: leadTicks(room), idleSince: useful ? null : idle[room.name].since };
}

function reset() { for (const name of Object.keys(idle)) delete idle[name]; }

module.exports = { evaluate, leadTicks, towersCover, reset };
