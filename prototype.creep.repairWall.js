/** @function 
    @param {StructureWall} target */
    Creep.prototype.repairWall =
    function (target) {


        if (!target) {
            let targets = this.room.find(FIND_CONSTRUCTION_SITES, {
                filter: (c) => c.my && (c.structureType == STRUCTURE_WALL || c.structureType == STRUCTURE_RAMPART)
            });

            target = this.pos.findClosestByPath(targets);
        }

        if (!target) {
            let targets = this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.hits < s.hitsMax && (s.structureType == STRUCTURE_WALL || s.structureType == STRUCTURE_RAMPART)
            });

            target = _.sortBy(targets, s => s.hits)[0];
        }


        if (target) {
            if (this.build(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'repairWall';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if (this.repair(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'repairWall';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if (target.hits != target.hitsMax && this.store.getUsedCapacity() > 0) {
                this.memory.action = 'repairWall';
                this.memory.target = target;
                return true;
            }
            else {
                this.memory.action = undefined;
                this.memory.target = undefined;
                return true;
            }


        }
        else {
            this.memory.action = undefined;
            this.memory.target = undefined;
            return false;
        }
    };