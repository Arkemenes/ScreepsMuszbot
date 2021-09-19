// create a new function for StructureTower
StructureTower.prototype.runRole =
    function () {
        let closestHostile = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
            this.attack(closestHostile);
        }

        if (_.sum(Game.creeps, (c) => c.memory.role == 'miner') >= 2) {
            if (this.store.energy > 0.7 * this.store.getCapacity(RESOURCE_ENERGY)) {
                let damagedStructures = this.room.find(FIND_STRUCTURES, {
                    filter: (structure) => structure.hits < structure.hitsMax &&
                        ((structure.structureType != STRUCTURE_WALL &&
                            structure.structureType != STRUCTURE_RAMPART)
                            || structure.hits < 1000)
                });

                let target = _.sortBy(damagedStructures, s => s.hits)[0];

                if (target) {
                    this.repair(target);
                }
            }

            if (this.store.energy > 0.9 * this.store.getCapacity(RESOURCE_ENERGY)) {
                let damagedStructures = this.room.find(FIND_STRUCTURES, {
                    filter: (structure) => structure.hits < structure.hitsMax
                });

                let target = _.sortBy(damagedStructures, s => s.hits)[0];
                if (target) {
                    this.repair(target);
                }
            }
        }
    };