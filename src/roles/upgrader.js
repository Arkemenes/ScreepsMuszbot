const { findNearbyFullSource, receivingLink } = require("../utils/energy");
const { scaledBody } = require("../utils/population");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const { takeCover } = require("../utils/combat");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const names = require("../utils/names");

var roleUpgrader = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (takeCover(creep)) return;

        // once the controller is maxed (and not about to downgrade) the room
        // has no use for upgraders -> turn them into builders
        if (this.wanted(creep.room) === 0) {
            creep.clearState();
            creep.memory.role = "builder";
            return;
        }

        if (creep.invokeState()) {
            return;
        }

        // Get Energy. A hauler or bootstrap heading for the same pile outranks
        // an upgrader while the room still wants spawn / extensions filled.
        if (creep.store[RESOURCE_ENERGY] == 0) {
            const link = creep.pos.findClosestByRange(
                roomCache.myStructures(creep.room),
                {
                    filter: (s) =>
                        s.structureType === STRUCTURE_LINK &&
                        !s.isCollector() &&
                        s.store[RESOURCE_ENERGY] > 0 &&
                        reservations.available(creep, s) >= 50,
                }
            );
            if (link) {
                reservations.claim(creep, link.id);
                creep.pushState("GetEnergy", link.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let resource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r) =>
                    r.resourceType === RESOURCE_ENERGY &&
                    r.amount >= 50 &&
                    reservations.available(creep, r) >= 50,
            });
            if (resource) {
                reservations.claim(creep, resource.id);
                creep.pushState("GetEnergy", resource.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let structure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) =>
                    (s.structureType == STRUCTURE_STORAGE ||
                        s.structureType == STRUCTURE_CONTAINER) &&
                    s.store[RESOURCE_ENERGY] >= 50 &&
                    reservations.available(creep, s) >= 50,
            });

            if (structure) {
                reservations.claim(creep, structure.id);
                creep.pushState("GetEnergy", structure.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            reservations.release(creep);

            // last resort: mine a nearby source
            const nearbyFullSource = findNearbyFullSource(creep);
            if (nearbyFullSource) {
                creep.pushState("GetEnergy", nearbyFullSource.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            // room is dry - wait next to a receiving link (usually our own
            // controller link) for the network to fill it
            const waitLink = receivingLink(creep.room, creep.pos);
            if (waitLink && !creep.pos.inRangeTo(waitLink, 1)) {
                creep.moveTo(waitLink, { range: 1 });
            }
            return;
        }
        // Spend Energy
        else {
            reservations.release(creep);
            let controller = creep.room.controller;

            creep.pushState("Upgrade", controller.id);

            if (!creep.invokeState()) {
                creep.say("zzz");
                return;
            }

            creep.say("zzz");
            return;
        }
    },
    // the number of upgraders this room should have - see rooms/needs.js
    wanted: function (room) {
        return roomNeeds(room).upgrader;
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        return census.count(room.name, "upgrader", 0) < this.wanted(room);
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = names.generate("upgrader");
        let body = scaledBody(room, [WORK, CARRY, MOVE]);
        let memory = { role: "upgrader" };

        return { name, body, memory };
    },
};

module.exports = roleUpgrader;
