const { findNearbyFullSource } = require("../utils/energy");
const { takeCover } = require("../utils/combat");
const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const names = require("../utils/names");

function findSource(creep) {
    if (creep.memory.source) {
        const cached = Game.getObjectById(creep.memory.source);
        // keep the cached source only while it still has energy to mine
        if (cached && cached.energy > 0) return cached;
        creep.memory.source = undefined;
    }

    const source =
        creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE) ||
        creep.pos.findClosestByPath(FIND_SOURCES);
    if (source) creep.memory.source = source.id;
    return source;
}

// Top priority: spawn or extension, whichever is closer - keeping the room
// able to spawn always outranks topping off the link network / a container.
function findSpawnOrExtension(creep) {
    return creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_EXTENSION) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
}

function findEnergyDestination(creep) {
    return creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure) => {
            if (structure.structureType === STRUCTURE_LINK) {
                return (
                    structure.isCollector() &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                );
            }

            if (structure.structureType === STRUCTURE_CONTAINER) {
                return structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }

            return false;
        },
    });
}

const bootstrap = {
    run(creep) {
        if (takeCover(creep)) return;

        const source = findSource(creep);

        // full: go deliver the energy - spawn/extension (closest) first,
        // then collector link/container, then drop as a last resort
        if (!creep.store.getFreeCapacity()) {
            reservations.release(creep);
            const target =
                findSpawnOrExtension(creep) || findEnergyDestination(creep);
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { reusePath: 10 });
                }
            } else {
                creep.drop(RESOURCE_ENERGY);
            }
            return;
        }

        // need energy: closest non-collector link that has energy first
        const link = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
            filter: (structure) =>
                structure.structureType === STRUCTURE_LINK &&
                !structure.isCollector() &&
                structure.store[RESOURCE_ENERGY] > 0,
        });
        if (link) {
            reservations.claim(creep, link.id);
            if (creep.withdraw(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(link, { reusePath: 10 });
            }
            return;
        }

        // then dropped energy
        const droppedEnergy = creep.pos.findClosestByPath(
            FIND_DROPPED_RESOURCES,
            { filter: (resource) => resource.resourceType === RESOURCE_ENERGY }
        );
        if (droppedEnergy) {
            reservations.claim(creep, droppedEnergy.id);
            if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy, { reusePath: 10 });
            }
            return;
        }

        reservations.release(creep);

        // then a source within reach
        const nearbyFullSource = findNearbyFullSource(creep);
        if (nearbyFullSource) {
            if (creep.harvest(nearbyFullSource) === ERR_NOT_IN_RANGE) {
                creep.moveTo(nearbyFullSource, { reusePath: 10 });
            }
            return;
        }

        // otherwise walk to the assigned source and mine it
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { reusePath: 10 });
        }
    },

    wanted(room) {
        return roomNeeds(room).bootstrap;
    },

    spawn(room) {
        if (room.energyAvailable < 200) return;
        return census.count(room.name, "bootstrap", 0) < this.wanted(room);
    },

    spawnData() {
        return {
            name: names.generate("bootstrap"),
            body: [WORK, CARRY, MOVE],
            memory: { role: "bootstrap" },
        };
    },
};

module.exports = bootstrap;
