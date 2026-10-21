"use strict";
// ROADMAP 0157-A (ARK-140): the live context utils/operationalReadiness.evaluate judges.
//
// context(room, owner) builds the "delivery" side of a readiness check from what the room
// actually has and does, never from a hope:
//   localFree  energy in storage + terminal that no claim already holds (terminalClaims.
//              physicalPool), minus the storage reserve floor (resourceTiers.reserveFloor),
//              minus what OTHER owners already committed as a lump sum
//   supply     the room's observed NET energy rate (energyReport: stored delta / ticks, the
//              current spend already paid), minus other owners' committed rates; a room
//              that is draining contributes no future supply, never a negative one
//   evidence   coverage and covered horizon come from energyReport's window; without enough
//              coverage the context says so (quality "insufficient") and evaluate() answers
//              "unknown" - absence of data is never read as spare energy
// regimeId names the room and its RCL: a new level is a new regime.
//
// commit(room, owner, { amount, rate, untilTick }) records what an admitted plan will draw,
// so two consumers cannot both spend the same balance; repeating it replaces the owner's own
// entry (idempotent), release() drops it, and expired entries are pruned on read. This is
// the one piece kept in Memory (Memory.readiness[room][owner]), small and bounded by owners.
const config = require("./config");
const terminalClaims = require("./terminalClaims");
const resourceTiers = require("./resourceTiers");
const energyReport = require("./energyReport");
const readiness = require("./operationalReadiness");

function commitments(roomName) {
    if (!Memory.readiness) Memory.readiness = {};
    const all = Memory.readiness[roomName] || (Memory.readiness[roomName] = {});
    for (const owner of Object.keys(all)) {
        const c = all[owner];
        if (!c || c.untilTick !== undefined && Game.time >= c.untilTick) delete all[owner];
    }
    return all;
}

function commit(roomName, owner, plan) {
    const amount = Math.max(0, Number(plan && plan.amount) || 0);
    const rate = Math.max(0, Number(plan && plan.rate) || 0);
    const untilTick = Number.isFinite(plan && plan.untilTick) ? plan.untilTick : undefined;
    commitments(roomName)[owner] = { amount, rate, untilTick, since: Game.time };
    return commitments(roomName)[owner];
}

function release(roomName, owner) {
    const all = commitments(roomName);
    const had = !!all[owner];
    delete all[owner];
    return had;
}

function context(room, owner, n) {
    const window = Number(config.get("energyReport.windowTicks", 1500));
    const report = energyReport.report(room.name, n || window);
    const others = Object.entries(commitments(room.name)).filter(([o]) => o !== owner).map(([, c]) => c);
    const committedAmount = others.reduce((sum, c) => sum + c.amount, 0);
    const committedRate = others.reduce((sum, c) => sum + c.rate, 0);
    const pool = terminalClaims.physicalPool(room, RESOURCE_ENERGY, null, owner ? "readiness:" + owner : null);
    const localFree = Math.max(0, pool - resourceTiers.reserveFloor(room) - committedAmount);
    const ticks = report.fromTick === null ? 0 : report.toTick - report.fromTick;
    const netRate = ticks > 0 && report.storedDelta !== null ? report.storedDelta / ticks : 0;
    const rate = Math.max(0, netRate - committedRate);
    const minCoverage = Number(config.get("readiness.minCoverage", 0.9));
    return {
        nowTick: Game.time, observedTick: report.toTick === null ? -1 : report.toTick,
        regimeId: room.name + ":rcl" + (room.controller ? room.controller.level : 0),
        quality: report.coverage >= minCoverage ? "bounded" : "insufficient",
        coverageFraction: Math.min(1, report.coverage), coveredHorizonTicks: report.observedTicks,
        localFree, netRate, supplyRate: rate, committedAmount, committedRate,
        margin: Number(config.get("readiness.margin", 0.20)),
        minCoverageFraction: minCoverage, maxAgeTicks: 1,
    };
}

// The context plus its supply curve over horizonTicks - the observed net rate is the only
// future supply. This is the "delivery" object boostPolicy and later consumers spread.
function delivery(room, owner, horizonTicks) {
    const c = context(room, owner);
    const horizon = Math.max(0, Math.floor(horizonTicks));
    c.supply = c.supplyRate > 0 && horizon > 0
        ? [{ commitmentId: "income:" + room.name, at: 0, until: horizon, rate: c.supplyRate }] : [];
    return c;
}

// Readiness of a demand curve (segments as operationalReadiness expects) over horizonTicks.
function evaluate(room, owner, demand, horizonTicks) {
    const c = delivery(room, owner, horizonTicks);
    const result = readiness.evaluate({ ...c, horizonTicks: Math.max(0, Math.floor(horizonTicks)), demand: demand || [] });
    return Object.assign(result, { context: c });
}

global.readinessStatus = function (roomName) {
    const rooms = roomName ? [Game.rooms[roomName]].filter(Boolean) : Game.myRooms || [];
    return rooms.map((room) => {
        const c = context(room);
        return room.name + ": livre " + Math.round(c.localFree) + ", líquido " + c.netRate.toFixed(1) + "/t, cobertura " +
            Math.round(c.coverageFraction * 100) + "% de " + c.coveredHorizonTicks + "t (" + c.quality + "), compromissos " +
            Object.keys(commitments(room.name)).join(",");
    }).join("\n");
};

module.exports = { context, delivery, evaluate, commit, release, commitments };
