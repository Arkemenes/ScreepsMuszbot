"use strict";
// ROADMAP 0148 T2 (ARK-135): the builder target after autoscale, in the spec's precedence:
//   1. legacy (base formula + autoscale) - what wanted.builder holds on entry
//   2. manual override (wantedOverride.builder) wins; the policy leaves the room alone
//   3. opt-in policy (population.onDemand.rooms): builder 0 only while utils/builderDemand
//      finds no useful work - entering needs the room idle for max(lead, minIdleTicks) AND
//      energyReport evidence (window coverage, builders at or below maxBuilderUtilization);
//      once active it holds on "no demand" alone, so a global reset does not force a respawn
//      a room is eligible only with no threat (defenseActive / enemies) and no supply shortfall
//      (resourceTiers.supplyShortfall: critical for a reason other than refilling spawns, or
//      storage under its reserve floor) (T4, AC9); losing eligibility ends an active pilot like
//      demand does - a spawn refill after a big spawn is routine, never a reason to respawn
//   4. emergency floor, every room, policy on or off: no builder alive or spawning and a
//      critical repair or a rescue mark (container / road ratio) -> exactly one builder
// Never recycles a living builder: the pilot only stops the next respawn.
//
// Memory.rooms[r].onDemand = { state, since, detectionTick?, reasons? } is the only
// persistent state (pilot ownership): "active" while the policy holds builder 0,
// "recovering" from the tick demand came back (or the room left the policy / lost eligibility
// while active) until a builder exists again; that recovery time lands in
// Memory.rooms[r].onDemandLast { detectionTick, builderTick, recoveryTicks, reasons } (T3).
// Dropped when the room leaves the policy while not active. Last decision per room in the heap for onDemandStatus(); every
// mode but "active" carries the reason (off: not-opted-in / flag-off / manual-override).
const config = require("../utils/config");
const census = require("../utils/census");
const damaged = require("../utils/damagedStructures");
const rampartRepair = require("../utils/rampartRepair");
const builderDemand = require("../utils/builderDemand");
const energyReport = require("../utils/energyReport");
const resourceTiers = require("../utils/resourceTiers");

const last = {}; // roomName -> last decision

// null when the policy covers the room, else why not. population.onDemand.pilot (per room,
// read with the room so a 0154 experiment overlay applies) wins over the rooms list:
// true opts the room in, false out, unset leaves it to the list.
function optOut(roomName) {
    if (config.get("population.onDemand.enabled", true) === false) return "flag-off";
    const pilot = config.get("population.onDemand.pilot", undefined, roomName);
    if (pilot === true) return null;
    if (pilot === false) return "not-opted-in";
    const rooms = config.get("population.onDemand.rooms", []);
    return rooms === "all" || (Array.isArray(rooms) && rooms.indexOf(roomName) >= 0) ? null : "not-opted-in";
}

function enabledFor(roomName) { return !optOut(roomName); }

// null when the room may run the pilot (spec: no threat, stable supply), else why not
function ineligible(room, mem) {
    if (mem.defenseActive || mem.enemies > 0) return "threat";
    return resourceTiers.supplyShortfall(room);
}

function rescueNeeded(room) {
    const container = Number(config.get("population.onDemand.rescueContainerRatio", 0.4));
    const road = Number(config.get("population.onDemand.rescueRoadRatio", 0.3));
    for (const s of damaged.sorted(room)) {
        if (!rampartRepair.builderMayRepair(s, room)) continue;
        if (rampartRepair.tier(s) === "critical") return "critical";
        const ratio = s.hits / s.hitsMax;
        if (s.structureType === STRUCTURE_CONTAINER && ratio < container) return "container";
        if (s.structureType === STRUCTURE_ROAD && ratio < road) return "road";
    }
    return null;
}

// null when the energyReport window backs entering the pilot, else why not
function evidenceGap(roomName) {
    const ctx = energyReport.context(roomName);
    if (!ctx) return "energyReport-coverage";
    const util = ctx.utilization && ctx.utilization.builder;
    if (util && util.ratio > Number(config.get("population.onDemand.maxBuilderUtilization", 0.1, roomName))) return "builder-busy";
    return null;
}

// an active pilot ends: legacy count again, timed until a builder exists (T3, AC5/AC7)
function endPilot(mem, reasons) {
    mem.onDemand = { state: "recovering", since: mem.onDemand.since, detectionTick: Game.time, reasons };
}

// recovering closes once a builder is alive or spawning (census) - the time from detection
// is kept in Memory.rooms[r].onDemandLast - or at once when the final target wants none
function closeRecovery(name, mem, wanted) {
    const pilot = mem.onDemand;
    if (!pilot || pilot.state !== "recovering") return;
    const arrived = census.count(name, "builder", 0) > 0;
    if (!arrived && wanted.builder >= 1) return;
    mem.onDemandLast = { detectionTick: pilot.detectionTick, builderTick: arrived ? Game.time : null,
        recoveryTicks: arrived ? Game.time - pilot.detectionTick : null, reasons: pilot.reasons };
    delete mem.onDemand;
}

function apply(room, wanted, mem) {
    const name = room.name;
    const decision = { tick: Game.time, legacy: wanted.builder, mode: "off", reasons: [] };
    const manual = mem.wantedOverride && typeof mem.wantedOverride.builder === "number";
    const out = manual ? null : optOut(name);
    if (manual) { decision.mode = "manual"; decision.reasons = ["manual-override"]; }
    else if (out) {
        // leaving the policy (flag off, room off the list, an experiment overlay closed): an
        // active pilot still records its recovery, anything else is dropped
        if (mem.onDemand && mem.onDemand.state === "active") endPilot(mem, [out]);
        else if (mem.onDemand && mem.onDemand.state !== "recovering") delete mem.onDemand;
        decision.reasons = [out];
    }
    else {
        const demand = builderDemand.evaluate(room);
        const pilot = mem.onDemand;
        const why = ineligible(room, mem);
        decision.lead = demand.lead;
        if (why || demand.useful) {
            decision.mode = why ? "ineligible" : "demand";
            decision.reasons = why ? [why] : demand.reasons;
            if (pilot && pilot.state === "active") endPilot(mem, decision.reasons);
        } else {
            const idleFor = Game.time - demand.idleSince;
            const needed = Math.max(demand.lead, Number(config.get("population.onDemand.minIdleTicks", 300, name)));
            decision.idleFor = idleFor;
            if (pilot && pilot.state === "active") decision.mode = "active";
            else if (idleFor < needed) { decision.mode = "candidate"; decision.reasons = ["idle " + idleFor + "/" + needed]; }
            else {
                const gap = evidenceGap(name);
                if (gap) { decision.mode = "candidate"; decision.reasons = [gap]; }
                else { mem.onDemand = { state: "active", since: Game.time }; decision.mode = "active"; }
            }
            if (decision.mode === "active") wanted.builder = 0;
        }
    }
    if (!(wanted.builder >= 1) && census.count(name, "builder", 0) === 0) {
        const mark = rescueNeeded(room);
        if (mark) { wanted.builder = 1; decision.floor = mark; }
    }
    if (!manual) closeRecovery(name, mem, wanted);
    decision.builder = wanted.builder;
    last[name] = decision;
    return wanted;
}

// AC9: with no room active the output still lists each room's reason, then says so
global.onDemandStatus = function (roomName) {
    const names = roomName ? [roomName] : Object.keys(last);
    const lines = names.map((name) => {
        const d = last[name];
        if (!d) return "[onDemand] " + name + ": sem decisão ainda";
        const state = Memory.rooms[name] && Memory.rooms[name].onDemand;
        return "[onDemand] " + name + " t" + d.tick + ": " + d.mode + " builder " + d.legacy + "→" + d.builder +
            (d.idleFor !== undefined ? "; ocioso " + d.idleFor + "t (prazo " + d.lead + ")" : "") +
            (d.reasons.length ? "; " + d.reasons.join(", ") : "") + (d.floor ? "; piso " + d.floor : "") +
            (state ? "; piloto " + state.state + " desde " + state.since : "");
    });
    if (!lines.length) return "[onDemand] sem decisões";
    if (!roomName && !names.some((name) => last[name].mode === "active")) lines.push("[onDemand] nenhuma sala ativa (motivos acima)");
    return lines.join("\n");
};

function status(roomName) { return last[roomName] || null; }

module.exports = { apply, status, enabledFor };
