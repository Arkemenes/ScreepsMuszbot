"use strict";
// ROADMAP 0148 T2 (ARK-135): the builder target after autoscale, in the spec's precedence:
//   1. legacy (base formula + autoscale) - what wanted.builder holds on entry
//   2. manual override (wantedOverride.builder) wins; the policy leaves the room alone
//   3. opt-in policy (population.onDemand.rooms): builder 0 only while utils/builderDemand
//      finds no useful work - entering needs the room idle for max(lead, minIdleTicks) AND
//      energyReport evidence (window coverage, builders at or below maxBuilderUtilization);
//      once active it holds on "no demand" alone, so a global reset does not force a respawn
//   4. emergency floor, every room, policy on or off: no builder alive or spawning and a
//      critical repair or a rescue mark (container / road ratio) -> exactly one builder
// Never recycles a living builder: the pilot only stops the next respawn.
//
// Memory.rooms[r].onDemand = { state, since, detectionTick?, reasons? } is the only
// persistent state (pilot ownership): "active" while the policy holds builder 0,
// "recovering" from the tick demand came back until a builder exists again. Gone when the
// room leaves the policy. Last decision per room in the heap for onDemandStatus().
const config = require("../utils/config");
const census = require("../utils/census");
const damaged = require("../utils/damagedStructures");
const rampartRepair = require("../utils/rampartRepair");
const builderDemand = require("../utils/builderDemand");
const energyReport = require("../utils/energyReport");

const last = {}; // roomName -> last decision

function enabledFor(roomName) {
    if (config.get("population.onDemand.enabled", true) === false) return false;
    const rooms = config.get("population.onDemand.rooms", []);
    return rooms === "all" || (Array.isArray(rooms) && rooms.indexOf(roomName) >= 0);
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
    if (util && util.ratio > Number(config.get("population.onDemand.maxBuilderUtilization", 0.1))) return "builder-busy";
    return null;
}

function apply(room, wanted, mem) {
    const name = room.name;
    const decision = { tick: Game.time, legacy: wanted.builder, mode: "off", reasons: [] };
    const manual = mem.wantedOverride && typeof mem.wantedOverride.builder === "number";
    if (manual) decision.mode = "manual";
    else if (!enabledFor(name)) delete mem.onDemand;
    else {
        const demand = builderDemand.evaluate(room);
        const pilot = mem.onDemand;
        decision.lead = demand.lead;
        if (demand.useful) {
            decision.mode = "demand";
            decision.reasons = demand.reasons;
            if (pilot && pilot.state === "active") {
                mem.onDemand = { state: "recovering", since: pilot.since, detectionTick: Game.time, reasons: demand.reasons };
            }
        } else {
            const idleFor = Game.time - demand.idleSince;
            const needed = Math.max(demand.lead, Number(config.get("population.onDemand.minIdleTicks", 300)));
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
        if (mem.onDemand && mem.onDemand.state === "recovering" && census.count(name, "builder", 0) > 0) delete mem.onDemand;
    }
    if (!(wanted.builder >= 1) && census.count(name, "builder", 0) === 0) {
        const mark = rescueNeeded(room);
        if (mark) { wanted.builder = 1; decision.floor = mark; }
    }
    decision.builder = wanted.builder;
    last[name] = decision;
    return wanted;
}

global.onDemandStatus = function (roomName) {
    const names = roomName ? [roomName] : Object.keys(last);
    return names.map((name) => {
        const d = last[name];
        if (!d) return "[onDemand] " + name + ": sem decisão ainda";
        const state = Memory.rooms[name] && Memory.rooms[name].onDemand;
        return "[onDemand] " + name + " t" + d.tick + ": " + d.mode + " builder " + d.legacy + "→" + d.builder +
            (d.idleFor !== undefined ? "; ocioso " + d.idleFor + "t (prazo " + d.lead + ")" : "") +
            (d.reasons.length ? "; " + d.reasons.join(", ") : "") + (d.floor ? "; piso " + d.floor : "") +
            (state ? "; piloto " + state.state + " desde " + state.since : "");
    }).join("\n") || "[onDemand] sem decisões";
};

function status(roomName) { return last[roomName] || null; }

module.exports = { apply, status, enabledFor };
