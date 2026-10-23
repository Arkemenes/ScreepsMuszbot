// Carries loot to the nearest owned room's storage or containers,
// round trip after round trip, until the mission room is
// empty (ROADMAP 0177). rooms/looting.js decides what is lootable and when
// damage cancels the mission (ROADMAP 0182);
// this only executes. CARRY/MOVE 1:1 - full speed loaded or not.

const { scaledBody } = require("../utils/population");
const routing = require("../utils/routing");
const names = require("../utils/names");
const config = require("../utils/config");
const salvage = require("../utils/salvage");
const roomCache = require("../utils/roomCache");
const remotes = require("../rooms/remotes");
const looting = require("../rooms/looting");
const lootRelay = require("../rooms/lootRelay");

// Heap: tick a relay giver started waiting at its handoff point.
const relayWaits = new Map();

// Heap: each delivery pick runs a room-graph search per owned room
// (remotes.roomDistance), so reuse it while the looter stays in one room.
// A cached target is re-resolved and re-checked for capacity on every use.
const deliveries = new Map();

function deliveryDestination(creep, resource) {
    const ttl = config.get("loot.deliveryCacheTicks", 20);
    const memo = deliveries.get(creep.name);
    if (memo && memo.room === creep.room.name && memo.resource === resource &&
        Game.time >= memo.tick && Game.time - memo.tick < ttl) {
        if (!memo.id) return null;
        const dest = Game.getObjectById(memo.id);
        const required = Math.max(1, creep.store.getUsedCapacity());
        if (dest && dest.store && dest.store.getFreeCapacity(resource) >= required) return dest;
    }
    if (deliveries.size > 50) {
        for (const [name, entry] of deliveries) {
            if (!Game.creeps[name] || Game.time - entry.tick >= ttl) deliveries.delete(name);
        }
    }
    const dest = looting.deliveryDestination(creep, resource);
    deliveries.set(creep.name, { room: creep.room.name, resource, tick: Game.time, id: dest ? dest.id : null });
    return dest;
}

function travel(creep, roomName) {
    routing.travelToRoom(creep, roomName, { range: 20, reusePath: 20, blockHostiles: false });
}

function cargoResource(creep) {
    return Object.keys(creep.store).find((r) => creep.store[r] > 0);
}

// Ticks to reach a delivery room at ~1 tick/tile, plus margin.
function mustHeadHome(creep) {
    const ttl = creep.ticksToLive;
    if (!ttl) return false;
    const dest = deliveryDestination(creep, cargoResource(creep) || RESOURCE_ENERGY);
    const hops = remotes.roomDistance(creep.room.name, dest ? dest.pos.roomName : creep.memory.home);
    return ttl < hops * config.get("loot.ticksPerHop", 50) + config.get("loot.returnMargin", 50);
}

// Deliver each resource to the nearest room with capacity. False once empty.
function unload(creep) {
    const resource = cargoResource(creep);
    if (!resource) return false;
    const dest = deliveryDestination(creep, resource);
    if (!dest) return true; // nowhere with room right now - hold the cargo
    if (creep.room.name !== dest.pos.roomName) {
        travel(creep, dest.pos.roomName);
        return true;
    }
    if (creep.transfer(dest, resource) === ERR_NOT_IN_RANGE) {
        creep.moveTo(dest, { range: 1, reusePath: 10 });
    }
    return true;
}

function retire(creep) {
    if (creep.room.name !== creep.memory.home) {
        travel(creep, creep.memory.home);
        return;
    }
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) {
        creep.suicide();
        return;
    }
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) creep.moveTo(spawn, { range: 1, reusePath: 10 });
}

function take(creep, pile) {
    if (!creep.pos.isNearTo(pile)) {
        creep.moveTo(pile, { range: 1, reusePath: 10 });
        return;
    }
    if (pile.resourceType !== undefined) {
        creep.pickup(pile);
        return;
    }
    const resource = looting.lootResource(pile);
    if (resource) creep.withdraw(pile, resource);
}

// Collect in the mission room; false when it is empty (mission finished).
function collect(creep, loot) {
    // floor first (0169): dropped resources decay, stores don't
    const pile = salvage.closestDecayFirst(creep, looting.lootablePiles(creep.room));
    if (!pile) {
        looting.finish(loot, "nothing left to take");
        creep.memory.unloading = creep.store.getUsedCapacity() > 0;
        return false;
    }
    take(creep, pile);
    return true;
}

// A full giver waits at its handoff point at most loot.relayWaitTicks, then
// delivers this load itself through the 0184 flow.
function waitForLink(creep) {
    const since = relayWaits.get(creep.name);
    if (since === undefined || Game.time < since) {
        relayWaits.set(creep.name, Game.time);
        return;
    }
    if (Game.time - since >= config.get("loot.relayWaitTicks", 50)) {
        relayWaits.delete(creep.name);
        creep.memory.unloading = true;
    }
}

// Last link: storage of the mother, else a mother container with room, else wait.
function deliverRelay(creep, link, resource) {
    const fits = (s) => s && s.store && s.store.getFreeCapacity(resource) > 0;
    let dest = Game.getObjectById(link.dest);
    if (!fits(dest)) {
        const mother = Game.rooms[creep.memory.home];
        dest = mother && (fits(mother.storage) ? mother.storage
            : roomCache.structures(mother).find((s) => s.structureType === STRUCTURE_CONTAINER && fits(s)));
    }
    if (!dest) return; // mother full: hold the cargo where the chain ends
    if (creep.pos.isNearTo(dest)) creep.transfer(dest, resource);
    else if (creep.room.name === dest.pos.roomName && lootRelay.indexOf(link.plan, creep.pos) === link.end) {
        creep.moveTo(dest, { range: 1, reusePath: 10 });
    } else lootRelay.walk(creep, link.plan, link.end);
}

function runRelay(creep, loot, link) {
    const resource = cargoResource(creep);
    const free = creep.store.getFreeCapacity();
    // First link: fills up in the mission room, partial loads included.
    if (link.seg === 0 && (!resource || free > 0)) {
        if (creep.room.name === loot.room) {
            relayWaits.delete(creep.name);
            collect(creep, loot);
            return;
        }
        if (!resource) {
            relayWaits.delete(creep.name);
            lootRelay.walk(creep, link.plan, 0);
            return;
        }
    }
    if (!resource) {
        relayWaits.delete(creep.name);
        lootRelay.walk(creep, link.plan, link.start);
        return;
    }
    if (link.seg === link.n - 1) {
        deliverRelay(creep, link, resource);
        return;
    }
    const receiver = link.next && Game.creeps[link.next];
    if (receiver && creep.pos.isNearTo(receiver) && receiver.store.getFreeCapacity() > 0) {
        relayWaits.delete(creep.name);
        creep.transfer(receiver, resource);
        return;
    }
    const handoff = link.end - 1;
    if (lootRelay.indexOf(link.plan, creep.pos) === handoff) waitForLink(creep);
    else lootRelay.walk(creep, link.plan, handoff);
}

const looter = {
    run(creep) {
        let loot = looting.forCreep(creep);
        if (looting.checkHealth(loot, creep)) loot = null;
        const target = creep.memory.targetRoom;
        const active = !!loot;
        const carrying = creep.store.getUsedCapacity() > 0;

        // ROADMAP 0187: a live chain takes over until a stalled handoff
        // falls back to delivering this load directly (memory.unloading).
        const link = active && !creep.memory.unloading && lootRelay.enabled(loot)
            ? lootRelay.link(loot, creep, looting.looters(loot).filter((c) => !c.spawning)) : null;
        if (link) {
            runRelay(creep, loot, link);
            return;
        }

        if (
            creep.memory.unloading ||
            (carrying && (!creep.store.getFreeCapacity() || !active || mustHeadHome(creep)))
        ) {
            creep.memory.unloading = true;
            if (unload(creep)) return;
            delete creep.memory.unloading;
        }

        if (!active || mustHeadHome(creep)) {
            retire(creep);
            return;
        }
        if (creep.room.name !== target) {
            travel(creep, target);
            return;
        }
        collect(creep, loot);
    },

    wanted(room) {
        return looting.lootersWanted(room);
    },

    spawn(room) {
        if (room.energyAvailable < BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) return false;
        return looting.lootersWanted(room) > 0;
    },

    spawnData(room) {
        const loot = looting.nextLoot(room);
        if (!loot) return null;
        return {
            name: names.generate("looter"),
            body: scaledBody(room, [CARRY, MOVE]),
            memory: {
                role: "looter",
                lootId: loot.id,
                targetRoom: loot.room,
                home: room.name,
            },
        };
    },
};

module.exports = looter;
