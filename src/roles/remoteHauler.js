// Like the local hauler, but with a fixed remote-room <-> home-room route
// instead of picking freely among piles: load from the assigned remote's
// source container(s)/drops, deliver to home's storage/spawn/extensions.
// Travel between rooms uses utils/routing.moveToRoom() (ROADMAP 0075 -
// before that, a raw creep.moveTo() with remotes.roomCallback() as its only
// safety net: no upfront terrain validation, no retreat/backtrack, so a
// remote room with a natural-wall maze between the border and the container
// left the creep parked on ERR_NO_PATH forever, silently) with
// opts.allowRoom restricted to the exact same rule remotes.roomCallback used
// to enforce on its own - never a room that isn't ours, reserved by us, or
// the trip's own destination. A hostile in the remote sends it home rather
// than risking the creep (ROADMAP 0020).

const { scaledBody } = require("../utils/population");
const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const remotes = require("../rooms/remotes");
const routing = require("../utils/routing");
const names = require("../utils/names");

function pickLoad(creep, targetRoomName) {
    const container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (s) =>
            s.structureType === STRUCTURE_CONTAINER &&
            s.store[RESOURCE_ENERGY] >= 50,
    });
    if (container) return { target: container, act: "withdraw" };

    const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50,
    });
    if (dropped) return { target: dropped, act: "pickup" };

    return null;
}

function pickDeliver(creep) {
    if (
        creep.room.storage &&
        creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    ) {
        return creep.room.storage;
    }
    const consumer = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (s) =>
            (s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    if (consumer) return consumer;

    // ROADMAP 0059 - last resort, same principle as hauler.js's own final
    // tower fallback: storage and spawn/extension are both full/absent, but
    // a tower still has room - top it off instead of idling home full.
    return creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (s) =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
}

var remoteHauler = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const home = creep.memory.home;
        const targetRoomName = creep.memory.targetRoom;
        if (!targetRoomName) {
            creep.suicide();
            return;
        }

        const carrying = creep.store[RESOURCE_ENERGY];
        const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);

        // flip mode only at the extremes so it doesn't dither
        if (creep.memory.job === "deliver" && carrying === 0) {
            creep.memory.job = "load";
        } else if (creep.memory.job !== "deliver" && free === 0) {
            creep.memory.job = "deliver";
        } else if (!creep.memory.job) {
            creep.memory.job = carrying > 0 ? "deliver" : "load";
        }

        if (creep.memory.job === "load") {
            if (
                creep.room.name === targetRoomName &&
                remotes.hasHostiles(targetRoomName)
            ) {
                // unsafe out there - head home with whatever we're carrying
                creep.memory.job = carrying > 0 ? "deliver" : "load";
                routing.moveToRoom(creep, home, {
                    range: 20,
                    reusePath: 30,
                    allowRoom: remotes.allowRoom(home),
                });
                return;
            }
            if (creep.room.name !== targetRoomName) {
                routing.moveToRoom(creep, targetRoomName, {
                    range: 20,
                    reusePath: 30,
                    allowRoom: remotes.allowRoom(targetRoomName),
                });
                return;
            }

            const pile = pickLoad(creep, targetRoomName);
            if (pile) {
                const res =
                    pile.act === "pickup"
                        ? creep.pickup(pile.target)
                        : creep.withdraw(pile.target, RESOURCE_ENERGY);
                if (res === ERR_NOT_IN_RANGE) {
                    creep.moveTo(pile.target, { range: 1, reusePath: 5 });
                }
                return;
            }
            // nothing to load yet - wait by the source cluster
            return;
        }

        // deliver
        if (creep.room.name !== home) {
            routing.moveToRoom(creep, home, {
                range: 20,
                reusePath: 30,
                allowRoom: remotes.allowRoom(home),
            });
            return;
        }
        const target = pickDeliver(creep);
        if (!target) return;
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { range: 1, reusePath: 10 });
        }
    },

    wanted: function (room) {
        return roomNeeds(room).remoteHauler;
    },

    spawn: function (room) {
        return census.count(room.name, "remoteHauler", 0) < this.wanted(room);
    },

    spawnData: function (room) {
        const active = remotes.active(room);
        const roomHaulers = census.creepsByRole(room.name, "remoteHauler");

        let target = null;
        for (const name of active) {
            const covered = roomHaulers.filter(
                (c) => c.memory.targetRoom === name
            ).length;
            if (covered < 1) {
                target = name;
                break;
            }
        }
        if (!target) target = active[0] || null;

        return {
            name: names.generate("remoteHauler"),
            body: scaledBody(room, [CARRY, CARRY, MOVE]),
            memory: {
                role: "remoteHauler",
                home: room.name,
                targetRoom: target,
                job: "load",
            },
        };
    },
};

module.exports = remoteHauler;
