/** @function 
    @param {ConstructionSite} target */
    Creep.prototype.buildConstruction =
    function (target) {
        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        }


        if (target) {
            if (this.build(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'buildConstruction';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if (target.structureType == STRUCTURE_RAMPART || target.structureType == STRUCTURE_WALL) {
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
