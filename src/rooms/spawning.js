let creepLogic = require("../roles");
let raiding = require("./raiding");
const census = require("../utils/census");
const config = require("../utils/config");
const energyLedger = require("../utils/energyLedger");
const roomCache = require("../utils/roomCache");
const { roomNeeds } = require("./needs");

// Priority order of the non-critical tier: whatever order the roles are
// declared in roles/index.js (bootstrap, defender, miner, hauler, upgrader,
// builder, scout). The critical tier (ROADMAP 0112) is built separately in
// spawnCreeps().
let creepTypes = _.keys(creepLogic);

// Cheapest body that still does the job. A critical role with ZERO creeps
// falls back to it when the full body isn't affordable right now - otherwise
// a room with no hauler waits for energy only a hauler can distribute.
const FALLBACK_BODIES = {
    miner: [MOVE, WORK, WORK],
    hauler: [CARRY, CARRY, MOVE],
};

function bodyCost(body) {
    return _.sum(body, (part) => BODYPART_COST[part.type]);
}

function energyStructuresForSpawn(room, spawn) {
    const anchor = room.storage && room.storage.pos
        ? room.storage.pos
        : spawn.pos;
    return roomCache
        .myStructures(room)
        .filter(
            (structure) =>
                structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_EXTENSION
        )
        .map((structure, index) => ({
            structure,
            index,
            distance: anchor.getRangeTo(structure.pos),
        }))
        .sort(
            (left, right) =>
                left.distance - right.distance || left.index - right.index
        )
        .map((entry) => entry.structure);
}

// ROADMAP 0045, old_1 parity: an idle spawn opportunistically renews an
// adjacent, expensive, near-death creep instead of always letting it die
// and paying a full spawn cycle for the replacement. Purely opportunistic -
// nothing is ever routed to a spawn just to be renewed, and a spawn that
// renews this tick is dropped from the returned list so the caller never
// also tries to spawnCreep() from it the same tick.
// Only worth it once the room is actually spawn-constrained: with most
// spawns idle, there's no queue to protect, so a creep is left to die and
// get replaced normally instead of spending energy on renew.
function renewIdleSpawns(room, spawns, totalSpawns) {
    const busyRatio = totalSpawns > 0
        ? (totalSpawns - spawns.length) / totalSpawns
        : 0;
    if (busyRatio < config.get("renew.minBusySpawnRatio", 0.5)) {
        return spawns;
    }

    if (
        room.energyCapacityAvailable <= 0 ||
        room.energyAvailable / room.energyCapacityAvailable <
            config.get("renew.minEnergyRatio", 0.8)
    ) {
        return spawns;
    }

    const ttlThreshold = config.get("renew.ticksToLiveThreshold", 300);
    const minBodyCost = config.get("renew.minBodyCost", 1000);
    const roomCreeps = census.allInRoom(room.name);

    const stillIdle = [];
    for (const spawn of spawns) {
        const candidate = _.find(
            roomCreeps,
            (c) =>
                c.ticksToLive !== undefined &&
                c.ticksToLive <= ttlThreshold &&
                !_.some(c.body, (p) => p.type === CLAIM) &&
                bodyCost(c.body) >= minBodyCost &&
                spawn.pos.getRangeTo(c) <= 1
        );
        if (candidate) {
            if (spawn.renewCreep(candidate) === OK) {
                energyLedger.record(room.name, "renew", energyLedger.renewCost(candidate.body));
                continue;
            }
        }
        stillIdle.push(spawn);
    }
    return stillIdle;
}

// "Nothing is wanted" verdict per room (heap): spawn()/spawnData() of every role were
// re-evaluated on every tick with an idle spawn just to conclude, again, that no creep is
// missing (0,6 CPU/tick for 3 rooms, 2026-10-03). The verdict holds while the room's needs object
// (rooms/needs.js keeps it needs.cacheTicks ticks, and recomputes it every tick under attack or
// after a console override) and the number of creeps in the room are the same - a creep dying
// or the needs being recomputed forces a fresh look at once. A room with a pending request is
// never skipped: it is waiting for energy and is re-checked every tick, as before.
const idleVerdict = {};

function spawnCreeps(room) {
    const allSpawns = roomCache.mySpawns(room);
    if (!allSpawns.length) return;

    let spawns = allSpawns.filter((s) => !s.spawning);
    if (!spawns.length) return;

    spawns = renewIdleSpawns(room, spawns, allSpawns.length);
    if (!spawns.length) return;

    // While the room has hostiles, pour all spawn capacity into defenders.
    // A single bootstrap is still allowed so the economy can't fully collapse
    // during a long siege (bootstrap.spawn() only fires when there is none).
    // Must include BOTH defense shapes rooms/needs.js can want here - once
    // energyCapacityAvailable crosses defender.pairEnergyThreshold (500,
    // easily reached at RCL2 with just a handful of extensions) it zeroes
    // out `defender` and wants `defenderStriker`/`defenderMedic` instead
    // (ROADMAP 0032 D2); omitting those two here left a room under attack
    // queuing nothing for defense at all once it crossed that threshold -
    // real bug this fixes.
    const roomMem = Memory.rooms[room.name];
    const underAttack = roomMem && roomMem.defenseActive;
    const needsNow = roomNeeds(room);
    const creepsNow = census.allInRoom(room.name).length;
    const verdict = idleVerdict[room.name];
    if (
        !underAttack &&
        verdict &&
        verdict.needs === needsNow &&
        verdict.creeps === creepsNow &&
        Game.time >= verdict.tick
    ) {
        return;
    }
    const types = underAttack
        ? ["defender", "defenderStriker", "defenderMedic", "bootstrap"]
        : creepTypes;

    const requests = [];

    // A squad (ROADMAP 0032 Fase 4) waiting on its last member(s) jumps the
    // whole queue - a squad stuck at 3/4 forever (competing every tick with
    // routine economy demand) is worse than delaying something replaceable.
    if (!underAttack) {
        const squadData = raiding.spawnPendingSquad(room);
        if (squadData) requests.push(squadData);
    }

    // ROADMAP 0112 - critical tier, strict order, BLOCKING: bootstrap, first
    // miner, first hauler, then any further miner. If one of these can't be
    // paid yet the spawn waits for energy to build up instead of falling
    // through to a cheaper role (an upgrader used to eat the energy the
    // hauler was waiting for, so the hauler never came).
    const queued = {};
    const pushCritical = (type) => {
        if (queued[type]) return;
        if (!creepLogic[type] || !creepLogic[type].spawn(room)) return;
        const data = creepLogic[type].spawnData(room);
        if (!data) return;
        queued[type] = true;
        data.critical = true;
        if (FALLBACK_BODIES[type] && census.count(room.name, type, 0) === 0) {
            data.fallbackBody = FALLBACK_BODIES[type];
        }
        requests.push(data);
    };
    // The min-body fallback above only buys time: once a hauler exists the
    // normal count is satisfied, so without this the room would keep the mini
    // forever. While every hauler is smaller than the full body the room can
    // now afford, queue one full hauler (even past `wanted`) - blocking, so
    // an upgrader can't eat the energy it is waiting for.
    const pushFullHaulerUpgrade = () => {
        if (queued.hauler || !creepLogic.hauler) return;
        const data = creepLogic.hauler.spawnData(room);
        if (!data) return;
        const haulers = census.creepsByRole(room.name, "hauler");
        if (_.some(haulers, (c) => c.body.length >= data.body.length)) return;
        queued.hauler = true;
        data.critical = true;
        requests.push(data);
    };
    if (!underAttack) {
        pushCritical("bootstrap");
        if (creepLogic.miner.spawnTier(room) === "first") pushCritical("miner");
        if (census.count(room.name, "hauler", 0) === 0) pushCritical("hauler");
        else pushFullHaulerUpgrade();
        pushCritical("miner");
    }

    // Every other role that currently wants a creep, in priority order.
    // Scouts, raiders, pioneers, and squadDismantler are pure luxury/never-solo -
    // only spawn once every other role (including scout, for the raider) is
    // already satisfied; squadDismantler never spawns here at all (only via
    // spawnPendingSquad above). Pioneer rescues a sister room, which matters,
    // but never at the cost of this room's own minimums (a la usuário) - it
    // waits behind scout/raider too, same as they wait behind each other.
    for (const type of types) {
        if (
            type === "scout" ||
            type === "raider" ||
            type === "squadDismantler" ||
            type === "pioneer" ||
            queued[type]
        ) {
            continue;
        }
        if (creepLogic[type] && creepLogic[type].spawn(room)) {
            const data = creepLogic[type].spawnData(room);
            if (data) requests.push(data);
        }
    }

    if (
        !requests.length &&
        !underAttack &&
        creepLogic.scout &&
        creepLogic.scout.spawn(room)
    ) {
        const data = creepLogic.scout.spawnData(room);
        if (data) requests.push(data);
    }

    if (
        !requests.length &&
        !underAttack &&
        creepLogic.raider &&
        creepLogic.raider.spawn(room)
    ) {
        const data = creepLogic.raider.spawnData(room);
        if (data) requests.push(data);
    }

    if (
        !requests.length &&
        !underAttack &&
        creepLogic.pioneer &&
        creepLogic.pioneer.spawn(room)
    ) {
        const data = creepLogic.pioneer.spawnData(room);
        if (data) requests.push(data);
    }

    if (!requests.length) {
        if (!underAttack) idleVerdict[room.name] = { tick: Game.time, needs: needsNow, creeps: creepsNow };
        return;
    }
    delete idleVerdict[room.name];

    for (const spawn of spawns) {
        // First request this spawn can actually afford right now. This way a
        // cheap low-priority creep still gets built when the room can't yet
        // pay for the expensive high-priority one.
        let picked = null;
        const energyStructures = energyStructuresForSpawn(room, spawn);
        const affordable = (req, body) =>
            spawn.spawnCreep(body, req.name, {
                memory: req.memory,
                energyStructures,
                dryRun: true,
            }) === OK;
        for (const req of requests) {
            if (affordable(req, req.body)) {
                picked = { name: req.name, body: req.body, memory: req.memory, req };
                break;
            }
            if (req.fallbackBody && affordable(req, req.fallbackBody)) {
                picked = { name: req.name, body: req.fallbackBody, memory: req.memory, req };
                break;
            }
            if (req.critical) break; // blocking: wait for energy, don't skip ahead
        }
        if (!picked) return; // nothing affordable -> stop

        const result = spawn.spawnCreep(picked.body, picked.name, {
            memory: picked.memory,
            energyStructures,
        });
        if (result !== OK) {
            console.log(
                `[spawn:${room.name}] ${picked.name} failed: ${result}`
            );
            return;
        }
        energyLedger.record(room.name, "spawn", bodyCost(picked.body));

        // consume the request so the next idle spawn builds something else
        requests.splice(requests.indexOf(picked.req), 1);
        if (!requests.length) return;
    }
}

module.exports = spawnCreeps;
// exposed for the offline smoke test only
module.exports.renewIdleSpawns = renewIdleSpawns;
module.exports.resetIdleVerdict = function () {
    Object.keys(idleVerdict).forEach((name) => { delete idleVerdict[name]; });
};
module.exports.energyStructuresForSpawn = energyStructuresForSpawn;
