/** @function */
Creep.prototype.runRoleHarvester =
    function () {

        if (this.memory.action && this.memory.target) {
            this.execAction(this.memory.action, this.memory.target.id);
        } 
        else if (this.store.getFreeCapacity() &&
            this.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                    s.store.energy.valueOf() > 0
            })[0]) {
            this.getEnergy();
        } 
        else if (this.store.energy.valueOf()) {
            if (!this.depositEnergy()) {
                if (!this.buildConstruction()) {
                    if (!this.upgrade()) {
                        if (!this.repairStructure()) {
                            this.repairWall();
                        }
                    }
                }

            }
        }
        // if this is supposed to harvest energy from source
        else {
            this.getEnergy();
        }
    };