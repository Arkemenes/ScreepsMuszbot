/** @function 
    @param {ConstructionSite} target */
    Creep.prototype.buildConstruction =
    function (target) {


        if (!target) {
            let targets = this.pos.findInRange(FIND_STRUCTURES, 5, {
                filter: (s) => s.hits < 100
            });

            let repairTarget = _.sortBy(targets, s => s.hits)[0];

            if (repairTarget) {
                if (this.repair(repairTarget) == ERR_NOT_IN_RANGE) {
                    this.memory.action = 'repairStructure';
                    this.memory.target = repairTarget;
                    this.smartMove(repairTarget);
                    return true;
                }
            }
            
        }



        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        }


        if (target) {
            if (this.room.name == this.memory.targetRoom && this.build(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'buildConstruction';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if (this.room.name == this.memory.targetRoom && (target.structureType == STRUCTURE_RAMPART || target.structureType == STRUCTURE_WALL)) {
                this.memory.action = 'repairStructure';
                this.memory.target = target;
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
