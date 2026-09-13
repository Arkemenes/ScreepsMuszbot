let creepLogic = require("../roles");
let raiding = require("./raiding");
const census = require("../utils/census");
const config = require("../utils/config");

// Priority order: whatever order the roles are declared in roles/index.js
// (bootstrap, defender, miner, hauler, upgrader, builder, scout).
let creepTypes = _.keys(creepLogic);

function bodyCost(body) {
    return _.sum(body, (part) => BODYPART_COST[part.type]);
}

// ROADMAP 0045, old_1 parity: an idle spawn opportunistically renews an
// adjacent, expensive, near-death creep instead of always letting it die
// and paying a full spawn cycle for the replacement. Purely opportunistic -
// nothing is ever routed to a spawn just to be renewed, and a spawn that
// renews this tick is dropped from the returned list so the caller never
// also tries to spawnCreep() from it the same tick.
function renewIdleSpawns(room, spawns) {
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
        if (candidate && spawn.renewCreep(candidate) === OK) continue;
        stillIdle.push(spawn);
    }
    return stillIdle;
}

function spawnCreeps(room) {
    let spawns = room.find(FIND_MY_SPAWNS, {
        filter: (s) => !s.spawning,
    });
    if (!spawns.length) return;

    spawns = renewIdleSpawns(room, spawns);
    if (!spawns.length) return;

    // While the room has hostiles, pour all spawn capacity into defenders.
    // A single bootstrap is still allowed so the economy can't fully collapse
    // during a long siege (bootstrap.spawn() only fires when there is none).
    const roomMem = Memory.rooms[room.name];
    const underAttack = roomMem && roomMem.defenseActive;
    const types = underAttack ? ["defender", "bootstrap"] : creepTypes;

    const requests = [];

    // A squad (ROADMAP 0032 Fase 4) waiting on its last member(s) jumps the
    // whole queue - a squad stuck at 3/4 forever (competing every tick with
    // routine economy demand) is worse than delaying something replaceable.
    if (!underAttack) {
        const squadData = raiding.spawnPendingSquad(room);
        if (squadData) requests.push(squadData);
    }

    // Every role that currently wants a creep, in priority order. Scouts,
    // raiders, and squadDismantler are pure luxury/never-solo - only spawn
    // once every other role (including scout, for the raider) is already
    // satisfied; squadDismantler never spawns here at all (only via
    // spawnPendingSquad above).
    for (const type of types) {
        if (type === "scout" || type === "raider" || type === "squadDismantler") continue;
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

    if (!requests.length) return;

    for (const spawn of spawns) {
        // First request this spawn can actually afford right now. This way a
        // cheap low-priority creep still gets built when the room can't yet
        // pay for the expensive high-priority one.
        let picked = null;
        for (const req of requests) {
            const dry = spawn.spawnCreep(req.body, req.name, {
                memory: req.memory,
                dryRun: true,
            });
            if (dry === OK) {
                picked = req;
                break;
            }
        }
        if (!picked) return; // nothing affordable -> stop

        const result = spawn.spawnCreep(picked.body, picked.name, {
            memory: picked.memory,
        });
        if (result !== OK) {
            console.log(
                `[spawn:${room.name}] ${picked.name} failed: ${result}`
            );
            return;
        }

        // consume the request so the next idle spawn builds something else
        requests.splice(requests.indexOf(picked), 1);
        if (!requests.length) return;
    }
}

module.exports = spawnCreeps;
// exposed for the offline smoke test only
module.exports.renewIdleSpawns = renewIdleSpawns;
