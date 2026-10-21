"use strict";
// ROADMAP 0150 T8 (ARK-137): the lab operator - one OPERATOR power creep that GENERATE_OPS and
// OPERATE_LABs the output labs of the home room's running reactions.
//
// manage() once per tick (main.js, guard):
//   create   no managed operator, a free GPL level (Game.gpl.level - sum of (level + 1) over all
//            power creeps) and the home room's labReport.evidence "bounded" (48h, the spec's
//            operator gate) -> PowerCreep.create; Memory.powerCreeps[name] = { managed: true, home }
//            (power.operator.autoCreate). An operator the bot did not create is never adopted.
//   upgrade  free GPL level + the same gate -> the next power of power.operator.plan whose level
//            requirement the creep meets (GENERATE_OPS / OPERATE_LAB alternating by default).
//   run      per managed operator: spawn at the home power spawn (after its real spawn cooldown),
//            enable the room's power, renew below power.operator.renewTicks, GENERATE_OPS whenever
//            ready, OPERATE_LAB the output lab whose effect is missing or expiring (range 3, ops
//            from its store, topped up from storage), park surplus ops in storage. Safe mode (threat,
//            bucket under power.operator.minBucket, power.operator.enabled false): renew/return only.
// Home: the room with a power spawn whose labReport confirms the most output per tick.
const config = require("../utils/config");
const roomCache = require("../utils/roomCache");
const labReactions = require("../utils/labReactions");
const labReport = require("../utils/labReport");

function mem() {
    if (!Memory.powerCreeps) Memory.powerCreeps = {};
    return Memory.powerCreeps;
}

function freeLevels() {
    const gpl = Game.gpl && Game.gpl.level || 0;
    let used = 0;
    for (const name in Game.powerCreeps || {}) used += (Game.powerCreeps[name].level || 0) + 1;
    return gpl - used;
}

function homeRoom() {
    let best = null, bestValue = -1;
    for (const room of Game.myRooms || []) {
        if (!roomCache.structuresByType(room, STRUCTURE_POWER_SPAWN).length) continue;
        const s = labReport.summary(room.name);
        const value = s ? (s.confirmedPerTick || s.amountPerTick || 0) : 0;
        if (value > bestValue) { best = room; bestValue = value; }
    }
    return best;
}

function gateOpen(roomName) {
    return labReport.evidence(roomName).status === "bounded";
}

function powerId(name) {
    return typeof global[name] !== "undefined" ? global[name] : null;
}

// next power of the plan the creep can take at its next level, or null
function nextPower(pc) {
    const plan = config.get("power.operator.plan", ["PWR_GENERATE_OPS", "PWR_OPERATE_LAB"]);
    const nextLevel = (pc.level || 0) + 1;
    for (let round = 0; round < 5; round++) {
        for (const key of plan) {
            const id = powerId(key);
            if (id === null || typeof POWER_INFO === "undefined" || !POWER_INFO[id]) continue;
            const have = pc.powers && pc.powers[id] ? pc.powers[id].level : 0;
            if (have > round) continue; // keep the plan balanced: one level per power per round
            const required = POWER_INFO[id].level && POWER_INFO[id].level[have];
            if (have < 5 && (required === undefined || required <= nextLevel - 1)) return id;
        }
    }
    return null;
}

// home room and gate are re-read every power.operator.checkTicks (100): both come from labReport
// summaries of every room, too dear for every tick while nothing changes
let planCache = null; // { tick, home, open }
function plan() {
    const every = Number(config.get("power.operator.checkTicks", 100));
    if (!planCache || Game.time - planCache.tick >= every || Game.time < planCache.tick) {
        const home = homeRoom();
        planCache = { tick: Game.time, home: home ? home.name : null, open: !!home && gateOpen(home.name) };
    }
    return planCache;
}

function manage() {
    if (config.get("power.operator.autoCreate", true) === false) return runAll();
    const managed = Object.keys(mem()).filter((n) => mem()[n].managed && Game.powerCreeps && Game.powerCreeps[n]);
    const p = freeLevels() >= 1 ? plan() : null;
    const home = p && p.home ? Game.rooms[p.home] : null;
    if (home && p.open) {
        if (!managed.length && typeof PowerCreep !== "undefined" && PowerCreep.create) {
            const name = "operator-" + Game.time.toString(36);
            const status = PowerCreep.create(name, typeof POWER_CLASS !== "undefined" ? POWER_CLASS.OPERATOR : "operator");
            if (status === OK) { mem()[name] = { managed: true, home: home.name, created: Game.time }; console.log("[power] operador " + name + " criado (casa " + home.name + ")"); }
        } else {
            for (const name of managed) {
                const pc = Game.powerCreeps[name];
                const power = nextPower(pc);
                if (power !== null && freeLevels() >= 1 && pc.upgrade(power) === OK) {
                    console.log("[power] " + name + " nível " + ((pc.level || 0) + 1) + ": +" + power);
                    break;
                }
            }
        }
    }
    runAll();
}

function runAll() {
    for (const name in mem()) {
        const m = mem()[name];
        const pc = Game.powerCreeps && Game.powerCreeps[name];
        // PowerCreep.create only shows up in Game.powerCreeps next tick: a fresh record is kept
        if (!pc) { if (!(m.created >= Game.time - 5)) delete mem()[name]; continue; }
        if (m.managed) run(pc, m);
    }
}

function opsType() { return typeof RESOURCE_OPS !== "undefined" ? RESOURCE_OPS : "ops"; }

function safe(room) {
    if (config.get("power.operator.enabled", true) === false) return "off";
    if (Game.cpu.bucket < Number(config.get("power.operator.minBucket", 1000))) return "bucket";
    const rm = Memory.rooms && Memory.rooms[room.name];
    if (rm && (rm.defenseActive || rm.enemies > 0)) return "threat";
    return null;
}

function ready(pc, power) {
    const p = pc.powers && pc.powers[power];
    return !!p && !(p.cooldown > 0);
}

function labTarget(room) {
    const operate = powerId("PWR_OPERATE_LAB");
    const refresh = Number(config.get("power.operator.refreshTicks", 20));
    let best = null;
    for (const reaction of labReactions.list(room.name)) {
        for (const id of labReactions.outputsOf(reaction)) {
            const lab = Game.getObjectById(id);
            if (!lab) continue;
            const effect = (lab.effects || []).find((e) => e.effect === operate);
            if (effect && effect.ticksRemaining > refresh) continue;
            if (!best || (lab.cooldown || 0) < (best.cooldown || 0)) best = lab;
        }
    }
    return best;
}

function run(pc, m) {
    const home = Game.rooms[m.home];
    if (!home) return;
    const spawn = roomCache.structuresByType(home, STRUCTURE_POWER_SPAWN)[0];
    if (!pc.ticksToLive) {
        // unspawned or dead: respawn at home once the real cooldown (a timestamp) has passed
        if (spawn && !(pc.spawnCooldownTime > Date.now())) { const s = pc.spawn(spawn); m.state = s === OK ? "spawnPending" : "respawnWait"; }
        else m.state = "respawnWait";
        return;
    }
    const room = pc.room;
    if (room.name !== home.name) { pc.moveTo(home.controller || spawn, { range: 1, reusePath: 20 }); m.state = "travel"; return; }
    if (home.controller && !home.controller.isPowerEnabled) {
        if (pc.pos.isNearTo(home.controller)) pc.enableRoom(home.controller); else pc.moveTo(home.controller, { range: 1 });
        m.state = "enabling"; return;
    }
    if (spawn && pc.ticksToLive < Number(config.get("power.operator.renewTicks", 1000))) {
        if (pc.pos.isNearTo(spawn)) pc.renew(spawn); else pc.moveTo(spawn, { range: 1 });
        m.state = "renewPending"; return;
    }
    const generate = powerId("PWR_GENERATE_OPS");
    if (generate !== null && ready(pc, generate)) pc.usePower(generate);
    const why = safe(home);
    if (why) { m.state = "safe:" + why; if (spawn && !pc.pos.inRangeTo(spawn, 3)) pc.moveTo(spawn, { range: 2 }); return; }
    m.state = "active";
    const ops = opsType(), carried = pc.store[ops] || 0;
    const operate = powerId("PWR_OPERATE_LAB");
    const cost = operate !== null && typeof POWER_INFO !== "undefined" && POWER_INFO[operate] ? POWER_INFO[operate].ops : 10;
    if (operate !== null && ready(pc, operate)) {
        const lab = labTarget(home);
        if (lab && carried >= cost) {
            if (pc.pos.inRangeTo(lab, 3)) { if (pc.usePower(operate, lab) === OK) m.lastOperate = { tick: Game.time, lab: lab.id }; }
            else pc.moveTo(lab, { range: 3 });
            return;
        }
        if (lab && home.storage && (home.storage.store[ops] || 0) >= cost - carried) {
            if (pc.pos.isNearTo(home.storage)) pc.withdraw(home.storage, ops, Math.min(pc.store.getFreeCapacity(), home.storage.store[ops]));
            else pc.moveTo(home.storage, { range: 1 });
            return;
        }
    }
    // park surplus ops (keep enough for a few applications)
    const keep = cost * Number(config.get("power.operator.keepApplications", 3));
    if (home.storage && carried > keep && pc.store.getFreeCapacity() < cost) {
        if (pc.pos.isNearTo(home.storage)) pc.transfer(home.storage, ops, carried - keep);
        else pc.moveTo(home.storage, { range: 1 });
    }
}

function status() {
    return Object.entries(mem()).map(([name, m]) => {
        const pc = Game.powerCreeps && Game.powerCreeps[name];
        return { name, home: m.home, state: m.state || null, level: pc ? pc.level : null, ttl: pc ? pc.ticksToLive || null : null,
            lastOperate: m.lastOperate || null };
    });
}

global.powerOperator = () => JSON.stringify({ freeLevels: freeLevels(), home: (homeRoom() || {}).name || null, operators: status() });

function resetPlan() { planCache = null; }

module.exports = { manage, run, nextPower, freeLevels, homeRoom, status, resetPlan };
