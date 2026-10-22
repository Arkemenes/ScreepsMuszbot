// Which owned rooms have no spawn at all (freshly claimed, or one lost to
// an attack) and need help from every nearby sister room to build their
// first one - rooms/architect.js already auto-places the spawn's construction
// site the moment a room becomes `my` (planStep >= 3), but nothing
// physically builds it without a creep with WORK there, and a spawnless
// room obviously can't spawn one itself. ROADMAP 0037. Same role in this
// domain that rooms/remotes.js and rooms/raiding.js play in theirs - the
// only place that decides eligibility; roles/pioneer.js just executes.

const config = require("../utils/config");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const remotes = require("./remotes");

function hasSpawn(room) {
    return roomCache.structuresByType(room, STRUCTURE_SPAWN).length > 0;
}

function isSpawnless(room) {
    return !!(room.controller && room.controller.my) && !hasSpawn(room);
}

// Owned, spawnless, and not fighting for its life right now - sending
// unarmed WORK/CARRY pioneers into a room under attack just feeds the
// enemy free kills. Better to wait for the threat to clear (or the mother
// room's own defense, separately) before dispatching anyone.
function needsRescue(room) {
    if (!isSpawnless(room)) return false;
    const mem = Memory.rooms[room.name];
    return !(mem && mem.enemies > 0);
}

function spawnlessRooms() {
    return _.filter(Game.myRooms, needsRescue);
}

// Rooms that can actually help - owned AND already has a spawn. A
// spawnless room can't spawn a pioneer of its own to send anywhere.
function candidateMothers() {
    return _.filter(Game.myRooms, hasSpawn);
}

// ROADMAP 0174 - travel time, not just hop count. A pioneer body is always
// balanced WORK/CARRY/MOVE (roles/pioneer.js spawnData) and travels loaded:
// 2 non-MOVE parts per MOVE -> 2 ticks per plain tile, ~50 tiles a room.
// 30 hops (the old only limit) was 3000+ ticks for a 1500-tick creep - live,
// pioneers from 15-16 rooms away died on the road.
function ticksPerHop() {
    return config.get("pioneer.tilesPerHop", 50) * config.get("pioneer.ticksPerTile", 2);
}

function travelTicks(fromRoomName, toRoomName) {
    const hops = remotes.roomDistance(fromRoomName, toRoomName);
    return hops === Infinity ? Infinity : hops * ticksPerHop();
}

// A mother can send a pioneer only if it arrives with at least
// pioneer.minWorkTicks of life left to actually build (spawn time and the
// loading trip are what the margin absorbs).
function withinReach(fromRoomName, toRoomName) {
    const lifetime = typeof CREEP_LIFE_TIME === "number" ? CREEP_LIFE_TIME : 1500;
    const hops = remotes.roomDistance(fromRoomName, toRoomName);
    return hops <= config.get("pioneer.maxDistance", 30) &&
        travelTicks(fromRoomName, toRoomName) <= lifetime - config.get("pioneer.minWorkTicks", 500);
}

// Every room that should rescue `targetRoomName`: within reach (above), and
// no more than pioneer.motherSlackHops farther than the closest such room.
// Several near sister rooms still help at once, each capped at
// pioneer.maxConcurrent for this target (see pioneersWanted below); a far
// room no longer sends slow help when a near one is already on it.
function mothersFor(targetRoomName) {
    const reachable = _.filter(candidateMothers(), (room) => withinReach(room.name, targetRoomName));
    if (!reachable.length) return [];
    const hops = (room) => remotes.roomDistance(room.name, targetRoomName);
    const nearest = _.min(reachable.map(hops));
    const slack = config.get("pioneer.motherSlackHops", 2);
    return _.filter(reachable, (room) => hops(room) <= nearest + slack);
}

// Every spawnless room `motherRoom` should help - the mirror of mothersFor().
function targetsFor(motherRoom) {
    return _.filter(
        spawnlessRooms(),
        (r) => _.some(mothersFor(r.name), (m) => m.name === motherRoom.name)
    );
}

// ROADMAP 0174, in transit: the user's preference is a pioneer working in
// the child room - it's a bigger worker than that room can spawn itself -
// so it keeps going whenever it can still arrive with
// pioneer.minUsefulTicks of life (even if the target got its spawn
// meanwhile). Only when it can't does it divert to the nearest owned room
// with a spawn it CAN reach in time, to work there instead of dying on the
// road. Returns that room's name, or null to keep going.
function divertTarget(creep, targetRoomName) {
    const ttl = creep.ticksToLive;
    if (!ttl) return null;
    const useful = config.get("pioneer.minUsefulTicks", 150);
    const arrives = (roomName) => travelTicks(creep.room.name, roomName) + useful <= ttl;
    if (arrives(targetRoomName)) return null;
    let best = null;
    let bestHops = Infinity;
    for (const room of candidateMothers()) {
        if (room.name === targetRoomName || !arrives(room.name)) continue;
        const hops = remotes.roomDistance(creep.room.name, room.name);
        if (hops < bestHops) {
            bestHops = hops;
            best = room.name;
        }
    }
    return best;
}

// Pioneers `motherRoom` itself has out (or spawning) for `targetRoomName` -
// the cap (pioneer.maxConcurrent) applies per mother-target pair, not per
// target overall, since several mothers can each be helping the same target
// at once.
function assignedBy(motherRoom, targetRoomName) {
    return census
        .all("pioneer")
        .filter(
            (c) =>
                c.memory.targetRoom === targetRoomName &&
                c.memory.home === motherRoom.name
        ).length;
}

// How many pioneers `motherRoom` should have in flight right now, summed
// across every spawnless room within its range, capped per target by
// pioneer.maxConcurrent (its OWN contribution - other mothers helping the
// same target don't count against this one). Zero while the mother room
// itself is under attack - home defense comes before sending help out
// (same caution rooms/needs.js already applies to reserver/raider).
function pioneersWanted(motherRoom) {
    const mem = Memory.rooms[motherRoom.name];
    if (mem && mem.defenseActive) return 0;

    const maxConcurrent = config.get("pioneer.maxConcurrent", 2);
    let wanted = 0;
    for (const target of targetsFor(motherRoom)) {
        wanted += Math.max(0, maxConcurrent - assignedBy(motherRoom, target.name));
    }
    return wanted;
}

// Whether `motherRoom` still has at least one in-range spawnless room to
// help, REGARDLESS of pioneer.maxConcurrent - unlike pioneersWanted() (which
// is already capped and hits 0 once that cap is reached), this is the raw
// "is there still a real job here" signal the autoscale grow criterion
// needs (ROADMAP 0040+) to decide whether it's worth pushing pioneer count
// past the normal cap. Same defenseActive guard as pioneersWanted.
function hasPendingTarget(motherRoom) {
    const mem = Memory.rooms[motherRoom.name];
    if (mem && mem.defenseActive) return false;
    return targetsFor(motherRoom).length > 0;
}

// The specific spawnless room a new pioneer spawned by `motherRoom` should
// head for - the first in-range target still under THIS mother's own
// concurrency cap, falling back to the first in-range target at all
// (mirrors roles/remoteMiner.js's spawnData target-picking).
function nextTarget(motherRoom) {
    const maxConcurrent = config.get("pioneer.maxConcurrent", 2);
    const targets = targetsFor(motherRoom);
    for (const target of targets) {
        if (assignedBy(motherRoom, target.name) < maxConcurrent) return target.name;
    }
    return targets.length ? targets[0].name : null;
}

// Every role that currently wants a creep in `room`, in the exact priority
// order rooms/spawning.js would build its request queue in - a lazy
// require (not top-level) because roles/index.js requires roles/pioneer.js
// which requires this file; calling require("../roles") only once
// pioneerStatus() actually runs (long after every module finished loading)
// sidesteps that circularity instead of getting an empty {} mid-load, same
// trick utils/population.js already uses for rooms/needs.js.
function previewQueue(room) {
    const creepLogic = require("../roles");
    const mem = Memory.rooms[room.name];
    const underAttack = mem && mem.defenseActive;
    const types = underAttack ? ["defender", "bootstrap"] : Object.keys(creepLogic);
    const wanting = [];
    for (const type of types) {
        if (type === "scout" || type === "raider" || type === "squadDismantler") continue;
        if (creepLogic[type] && creepLogic[type].spawn(room)) wanting.push(type);
    }
    return wanting;
}

// console: pioneerStatus() - live trace of the whole decision chain (which
// room is spawnless, who's assigned to rescue it, why not if nobody is,
// how many pioneers are wanted/already out) - added after a live report of
// "should be spawning but isn't" turned out hard to diagnose blind from
// outside the running game. Read-only, safe to call anytime.
global.pioneerStatus = function () {
    const maxDist = config.get("pioneer.maxDistance", 30);
    const maxConcurrent = config.get("pioneer.maxConcurrent", 2);
    console.log(
        `[pioneer] maxDistance=${maxDist} maxConcurrent=${maxConcurrent} ` +
            `ticksPerHop=${ticksPerHop()} minWorkTicks=${config.get("pioneer.minWorkTicks", 500)} ` +
            `motherSlackHops=${config.get("pioneer.motherSlackHops", 2)}`
    );

    const owned = Game.myRooms || [];
    console.log(`[pioneer] Game.myRooms: ${owned.map((r) => r.name).join(", ") || "(none)"}`);

    const mothers = candidateMothers();
    console.log(
        `[pioneer] rooms with a spawn (candidate mothers): ` +
            (mothers.map((r) => r.name).join(", ") || "(none)")
    );

    const spawnlessRaw = _.filter(owned, isSpawnless);
    if (!spawnlessRaw.length) {
        console.log("[pioneer] no owned room is spawnless right now");
        return;
    }

    for (const room of spawnlessRaw) {
        const mem = Memory.rooms[room.name];
        const hostile = !!(mem && mem.enemies > 0);
        let line = `[pioneer] ${room.name}: spawnless`;
        if (hostile) {
            console.log(`${line} - SKIPPED (hostile visible, mem.enemies=${mem.enemies})`);
            continue;
        }
        const mothers = mothersFor(room.name);
        if (!mothers.length) {
            console.log(
                `${line} - no owned room with a spawn can get a pioneer there with ` +
                    `minWorkTicks of life left (max ${maxDist} hops)`
            );
            continue;
        }
        console.log(
            `${line} - rescuers in range: ${mothers.map((m) => m.name).join(", ")}`
        );

        for (const mother of mothers) {
            const assigned = assignedBy(mother, room.name);
            const motherMem = Memory.rooms[mother.name];
            const motherUnderAttack = !!(motherMem && motherMem.defenseActive);
            const wanted = motherUnderAttack ? 0 : Math.max(0, maxConcurrent - assigned);
            const have = census.count(mother.name, "pioneer", 0);
            let mline =
                `[pioneer]   ${mother.name} (dist ${remotes.roomDistance(mother.name, room.name)}): ` +
                `assigned=${assigned}, wants ${wanted} more, ${have} currently standing there`;
            if (motherUnderAttack) mline += " [under attack - held back]";
            console.log(mline);

            // The exact priority queue rooms/spawning.js builds THIS tick
            // for this mother room - shows whether pioneer is actually in
            // the running, and who (if anyone) is ranked ahead of it
            // competing for the same free spawns.
            const motherRoom = Game.rooms[mother.name];
            if (motherRoom) {
                const queue = previewQueue(motherRoom);
                const freeSpawns = motherRoom
                    .find(FIND_MY_SPAWNS, { filter: (s) => !s.spawning })
                    .length;
                console.log(
                    `[pioneer]     spawn queue this tick (${freeSpawns} free spawn(s)): ` +
                        (queue.length ? queue.join(" > ") : "(nothing wants a creep right now)") +
                        (queue.indexOf("pioneer") === -1
                            ? " -- pioneer NOT in the queue!"
                            : ` -- pioneer is #${queue.indexOf("pioneer") + 1}`)
                );
            }
        }
    }
};

module.exports = {
    isSpawnless,
    spawnlessRooms,
    candidateMothers,
    mothersFor,
    pioneersWanted,
    hasPendingTarget,
    nextTarget,
    withinReach,
    divertTarget,
};
