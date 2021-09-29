// create a new function for StructureTower
Structure.prototype.runRoleTower =
    function () {
        let hostiles = this.room.find(FIND_HOSTILE_CREEPS, {filter : (x) => _.some(x.body, y => [ATTACK, WORK, RANGED_ATTACK, CARRY, CLAIM].includes(y.type))});

        hostiles = _.sortBy(hostiles, s => s.hits);

        let closestHostile = _.sortBy(hostiles, s => s.pos.findPathTo(this).length)[0];


        if (closestHostile) {
            this.attack(closestHostile);
        }

        if (Memory.rooms[this.room.name].numberOfMiners >= Memory.rooms[this.room.name].numberOfLinks) {
            if (this.store.energy >= 0.7 * this.store.getCapacity(RESOURCE_ENERGY)) {
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

            if (this.store.energy >= 0.9 * this.store.getCapacity(RESOURCE_ENERGY)) {
                let damagedStructures = this.room.find(FIND_STRUCTURES, {
                    filter: (structure) => structure.hits < structure.hitsMax && structure.structureType != STRUCTURE_RAMPART && structure.structureType != STRUCTURE_WALL
                });

                let target = _.sortBy(damagedStructures, s => s.hits)[0];
                if (target) {
                    this.repair(target);
                }
    
            }

            if (Game.time % 3 == this.pos.x % 3 && this.store.energy >= 0.8 * this.store.getCapacity(RESOURCE_ENERGY)) {
                let damagedStructures = this.room.find(FIND_STRUCTURES, {
                    filter: (structure) => ((this.room.controller.level == 8 && structure.hits < structure.hitsMax) || structure.hits < 0.05 * structure.hitsMax)
                                            && (structure.structureType == STRUCTURE_RAMPART || structure.structureType == STRUCTURE_WALL)
                });

                let target = _.sortBy(damagedStructures, s => s.hits)[0];
                if (target) {
                    this.repair(target);
                }
            }
        }
    };