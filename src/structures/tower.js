const { getHostiles, isHostile } = require("../utils/hostiles");
const { isPlanned } = require("../utils/plan");
const traffic = require("../utils/traffic");
const config = require("../utils/config");
const rampartRepair = require("../utils/rampartRepair");
let cacheTick;
let hostileTargets = {};
let repairTargets = {};

const hostilePartPriority = {
    [HEAL]: 0,
    [RANGED_ATTACK]: 1,
    [ATTACK]: 2,
    [WORK]: 3,
    [CLAIM]: 4,
    [CARRY]: 5,
};

function getHostilePriority(creep) {
    const priorities = creep.body
        .filter((part) => hostilePartPriority[part.type] !== undefined)
        .map((part) => hostilePartPriority[part.type]);

    const priority = priorities.length ? Math.min(...priorities) : Infinity;
    return creep.body.some((part) => part.boost) ? priority - 0.5 : priority;
}

function getTowerDamage(tower, creep) {
    const range = tower.pos.getRangeTo(creep);
    const optimalRange = 5;
    const falloffRange = 20;
    const falloff = 0.75;
    const effectiveRange = Math.max(
        optimalRange,
        Math.min(range, falloffRange)
    );

    return 600 * (1 - falloff * (effectiveRange - optimalRange) / 15);
}

function resetCache() {
    if (cacheTick !== Game.time) {
        cacheTick = Game.time;
        hostileTargets = {};
        repairTargets = {};
    }
}

function findHostileTarget(tower) {
    resetCache();
    if (Object.prototype.hasOwnProperty.call(hostileTargets, tower.room.name)) {
        return hostileTargets[tower.room.name];
    }

    const roomMemory = Memory.rooms[tower.room.name];
    if (
        roomMemory &&
        roomMemory.defenseTargetId &&
        Game.time - roomMemory.defenseTargetTick < 5
    ) {
        const rememberedTarget = Game.getObjectById(roomMemory.defenseTargetId);
        if (rememberedTarget && isHostile(rememberedTarget, tower.room)) {
            hostileTargets[tower.room.name] = rememberedTarget;
            return rememberedTarget;
        }
    }

    const hostiles = getHostiles(tower.room).filter(
        (creep) =>
            _.some(
                creep.body,
                (part) => hostilePartPriority[part.type] !== undefined
            ) &&
            creep.pos.x > 0 &&
            creep.pos.x < 49 &&
            creep.pos.y > 0 &&
                creep.pos.y < 49
            );

    hostileTargets[tower.room.name] = _.sortBy(hostiles, (creep) => {
        const damage = getTowerDamage(tower, creep);
        const timeToKill = creep.hits / damage;
        const distance = tower.pos.getRangeTo(creep);
        return getHostilePriority(creep) * 100000 + timeToKill * 1000 + distance;
    })[0];

    if (hostileTargets[tower.room.name]) {
        roomMemory.defenseTargetId = hostileTargets[tower.room.name].id;
        roomMemory.defenseTargetTick = Game.time;
    }

    return hostileTargets[tower.room.name];
}

function countNearbyHostiles(tower) {
    return getHostiles(tower.room).filter(
        (creep) =>
            tower.pos.getRangeTo(creep) <= 3 &&
            _.some(
                creep.body,
                (part) => hostilePartPriority[part.type] !== undefined
            )
    ).length;
}

function findHealingTarget(tower) {
    const injuredCreeps = tower.room.find(FIND_MY_CREEPS, {
        filter: (creep) => creep.hits < creep.hitsMax,
    });

    return _.sortBy(
        injuredCreeps,
        (creep) => creep.hits / Math.max(creep.hitsMax, 1)
    )[0];
}

function findRepairTarget(tower) {
    resetCache();
    if (Object.prototype.hasOwnProperty.call(repairTargets, tower.room.name)) {
        return repairTargets[tower.room.name];
    }

    const damagedStructures = tower.room.find(FIND_STRUCTURES, {
        filter: (structure) =>
            structure.hits < structure.hitsMax &&
            isPlanned(structure) &&
            traffic.worthRepairing(structure),
    });

    const normalStructures = damagedStructures.filter(
        (structure) =>
            structure.structureType !== STRUCTURE_WALL &&
            structure.structureType !== STRUCTURE_RAMPART
    );

    if (normalStructures.length) {
        repairTargets[tower.room.name] = _.sortBy(
            normalStructures,
            (structure) => structure.hits
        )[0];
        return repairTargets[tower.room.name];
    }

    const defensiveStructures = damagedStructures.filter(
        (structure) =>
            structure.structureType === STRUCTURE_WALL ||
            structure.structureType === STRUCTURE_RAMPART
    );

    // utils/rampartRepair.js is the single source of truth for the
    // critical/healthy/surplus-only tiers (ROADMAP 0032 D4 + follow-up) -
    // shared with roles/builder.js so the two never disagree on it.
    const eligible = defensiveStructures.filter((structure) =>
        rampartRepair.worthHardening(structure, tower.room)
    );

    const criticalRampart = _.sortBy(
        eligible.filter(rampartRepair.isCritical),
        (structure) => structure.hits
    )[0];

    if (criticalRampart) {
        repairTargets[tower.room.name] = criticalRampart;
        return criticalRampart;
    }

    repairTargets[tower.room.name] = _.sortBy(
        eligible,
        (structure) => structure.hits
    )[0];
    return repairTargets[tower.room.name];
}

var tower = {
    /** @param {Structure} tower **/
    run: function (tower) {
        const hostileTarget = findHostileTarget(tower);
        if (hostileTarget) {
            if (countNearbyHostiles(tower) >= 2) {
                tower.rangedMassAttack();
                return;
            }
            tower.attack(hostileTarget);
            return;
        }

        const healingTarget = findHealingTarget(tower);
        if (healingTarget) {
            tower.heal(healingTarget);
            return;
        }

        const energyCapacity = tower.store.getCapacity(RESOURCE_ENERGY);
        const energyRatio = tower.store.energy / energyCapacity;
        const repairTarget = findRepairTarget(tower);

        if (repairTarget && energyRatio >= config.get("tower.repairEnergyRatio", 0.7)) {
            tower.repair(repairTarget);
        }
    },
};

module.exports = tower;
