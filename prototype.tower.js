// create a new function for StructureTower
StructureTower.prototype.runRole =
    function () {
        let closestHostile = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if(closestHostile) {
            this.attack(closestHostile);
        }

        let closestDamagedStructure = this.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: (structure) => structure.hits < structure.hitsMax &&
                            structure.structureType != STRUCTURE_WALL &&
                            structure.structureType != STRUCTURE_RAMPART
        });
        if(closestDamagedStructure) {
            this.repair(closestDamagedStructure);
        }

        if (this.store.energy > 0.9 * this.store.getCapacity(RESOURCE_ENERGY) && Game.time % 5 == 0) {
            let closestDamagedStructure = this.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (structure) => structure.hits < structure.hitsMax
            });
            if(closestDamagedStructure) {
                this.repair(closestDamagedStructure);
            }
        }
    };