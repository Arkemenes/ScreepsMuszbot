const { findNearbyFullSource } = require("../utils/energy");
const { takeCover, isDangerous } = require("../utils/combat");
const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const names = require("../utils/names");
const priority = require("../utils/priority");
const resourceTiers = require("../utils/resourceTiers");

function findSource(creep) {
    if (creep.memory.source) {
        const cached = Game.getObjectById(creep.memory.source);
        // keep the cached source only while it still has energy to mine and
        // a hostile hasn't since moved in on top of it
        if (cached && cached.energy > 0 && !isDangerous(cached.pos, creep.room)) {
            return cached;
        }
        creep.memory.source = undefined;
    }

    const notDangerous = { filter: (s) => !isDangerous(s.pos, creep.room) };
    const source =
        creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, notDangerous) ||
        creep.pos.findClosestByPath(FIND_SOURCES, notDangerous);
    if (source) creep.memory.source = source.id;
    return source;
}

// Top priority: spawn or extension, whichever is closer - keeping the room
// able to spawn always outranks topping off the link network / a container.
function findSpawnOrExtension(creep) {
    const economy = resourceTiers.getEconomySnapshot(creep.room);
    const target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_EXTENSION) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            !isDangerous(structure.pos, creep.room),
    });
    const selected = priority.pick([{
        target,
        tier: economy.criticalConsumers > 0 ? "critical" : "satisfactory",
        priority: 3,
        allowed: Boolean(target),
    }]);
    return selected ? selected.target : null;
}

function findEnergyDestination(creep) {
    const target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure) => {
            if (isDangerous(structure.pos, creep.room)) return false;

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
    const selected = priority.pick([{
        target,
        tier: "satisfactory",
        priority: 1,
        allowed: Boolean(target),
    }]);
    return selected ? selected.target : null;
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
                structure.store[RESOURCE_ENERGY] > 0 &&
                !isDangerous(structure.pos, creep.room),
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
            {
                filter: (resource) =>
                    resource.resourceType === RESOURCE_ENERGY &&
                    !isDangerous(resource.pos, creep.room),
            }
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
