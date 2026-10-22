const { findNearbyFullSource, energyPiles } = require("../utils/energy");
const { takeCover, isDangerous } = require("../utils/combat");
const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const roomCache = require("../utils/roomCache");
const salvage = require("../utils/salvage");
const config = require("../utils/config");
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

// Nothing to fill: put the energy to work instead of dropping it - dropping
// fed a loop where the salvage pass (0169, floor first) picked the same pile
// straight back up. A pioneer relabelled as bootstrap (roles/pioneer.js) in
// a young room is the usual case: big WORK body, spawn full, no builder yet.
// RCL1 upgrades first (200 energy unlocks RCL2's extensions), then the
// closest construction site, then the controller. False = nothing to do.
function spendEnergy(creep) {
    const controller = creep.room.controller;
    const canUpgrade = !!(controller && controller.my);
    const work = (target, act, range) => {
        if (act() === ERR_NOT_IN_RANGE) creep.moveTo(target, { range, reusePath: 10 });
        return true;
    };
    if (canUpgrade && controller.level < 2) {
        return work(controller, () => creep.upgradeController(controller), 3);
    }
    const site = creep.pos.findClosestByRange(roomCache.constructionSites(creep.room));
    if (site) return work(site, () => creep.build(site), 3);
    if (canUpgrade) return work(controller, () => creep.upgradeController(controller), 3);
    return false;
}

const bootstrap = {
    run(creep) {
        if (takeCover(creep)) return;

        const source = findSource(creep);

        // full: go deliver the energy - spawn/extension (closest) first,
        // then collector link/container, then build/upgrade (spendEnergy),
        // then drop as a last resort. Once spending, keep at it until empty
        // (memory.spending) - otherwise one tick of upgrade un-fills the
        // creep and it walks back to refill, ping-ponging forever.
        const spending = creep.memory.spending && creep.store[RESOURCE_ENERGY] > 0;
        if (!creep.store.getFreeCapacity() || spending) {
            reservations.release(creep);
            const target =
                findSpawnOrExtension(creep) || findEnergyDestination(creep);
            if (target) {
                delete creep.memory.spending;
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { reusePath: 10 });
                }
            } else if (spendEnergy(creep)) {
                creep.memory.spending = true;
            } else {
                delete creep.memory.spending;
                creep.drop(RESOURCE_ENERGY);
            }
            return;
        }
        delete creep.memory.spending;

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

        // Then recover local energy from drops, ruins, tombstones and stores
        // before sending the bootstrap back to a source.
        if (config.get("salvage.enabled", true)) {
            // floor first: dropped energy decays every tick
            const salvagePile = salvage.closestDecayFirst(
                creep,
                reservations.usable(creep, energyPiles(creep.room))
            );
            if (salvagePile) {
                reservations.claim(creep, salvagePile.id);
                if (creep.pos.isNearTo(salvagePile)) {
                    const result = salvagePile.resourceType === RESOURCE_ENERGY
                        ? creep.pickup(salvagePile)
                        : creep.withdraw(salvagePile, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) {
                        creep.moveTo(salvagePile, { reusePath: 10 });
                    }
                } else {
                    creep.moveTo(salvagePile, { reusePath: 10 });
                }
                return;
            }
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
