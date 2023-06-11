var tower = {
    /** @param {Structure} tower **/
    run: function (tower) {
        let hostiles = tower.room.find(FIND_HOSTILE_CREEPS, {
            filter: (c) =>
                _.some(
                    c.body,
                    (b) =>
                        [ATTACK, RANGED_ATTACK, WORK, HEAL, CLAIM].includes(
                            b.type
                        ) &&
                        c.pos.x != 49 &&
                        c.pos.x != 0 &&
                        c.pos.y != 49 &&
                        c.pos.y != 49
                ),
        });

        hostiles = _.sortBy(hostiles, (s) => s.hits);

        let closestHostile = _.sortBy(
            hostiles,
            (s) => s.pos.findPathTo(tower).length
        )[0];

        if (!closestHostile) {
            let hostiles = tower.room.find(FIND_HOSTILE_CREEPS, {
                filter: (c) =>
                    _.some(
                        c.body,
                        (b) =>
                            [
                                ATTACK,
                                WORK,
                                RANGED_ATTACK,
                                CARRY,
                                CLAIM,
                            ].includes(b.type) &&
                            c.pos.x != 49 &&
                            c.pos.x != 0 &&
                            c.pos.y != 49 &&
                            c.pos.y != 49
                    ),
            });

            hostiles = _.sortBy(hostiles, (s) => s.hits);

            let closestHostile = _.sortBy(
                hostiles,
                (s) => s.pos.findPathTo(tower).length
            )[0];
        }

        if (closestHostile) {
            tower.attack(closestHostile);
        } else if (Memory.rooms[tower.room.name].numberOfMiners) {
            if (
                tower.store.energy >=
                0.7 * tower.store.getCapacity(RESOURCE_ENERGY)
            ) {
                let damagedStructures = tower.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.hits < structure.hitsMax &&
                        ((structure.structureType != STRUCTURE_WALL &&
                            structure.structureType != STRUCTURE_RAMPART) ||
                            structure.hits < 1000),
                });

                let target = _.sortBy(damagedStructures, (s) => s.hits)[0];

                if (target) {
                    tower.repair(target);
                }
            }

            if (
                tower.store.energy >=
                0.9 * tower.store.getCapacity(RESOURCE_ENERGY)
            ) {
                let damagedStructures = tower.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.hits < structure.hitsMax &&
                        structure.structureType != STRUCTURE_RAMPART &&
                        structure.structureType != STRUCTURE_WALL,
                });

                let target = _.sortBy(damagedStructures, (s) => s.hits)[0];
                if (target) {
                    tower.repair(target);
                }
            }

            if (
                (Game.time %
                    (3 * Memory.rooms[tower.room.name].numberOfTowers) ==
                    tower.pos.x %
                        (3 * Memory.rooms[tower.room.name].numberOfTowers) ||
                    (tower.room.storage &&
                        tower.room.storage.store.energy > 10000)) &&
                tower.store.energy >=
                    0.8 * tower.store.getCapacity(RESOURCE_ENERGY)
            ) {
                let damagedStructures = tower.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        ((tower.room.controller.level == 8 &&
                            structure.hits < structure.hitsMax) ||
                            (structure.hits < 0.05 * structure.hitsMax &&
                                !structure.room.find(
                                    FIND_MY_CONSTRUCTION_SITES
                                )[0]) ||
                            structure.hits < 0.01 * structure.hitsMax) &&
                        (structure.structureType == STRUCTURE_RAMPART ||
                            structure.structureType == STRUCTURE_WALL),
                });
                let target = _.sortBy(damagedStructures, (s) => s.hits)[0];
                if (target) {
                    tower.repair(target);
                }
            }
        }
    },
};

module.exports = tower;
