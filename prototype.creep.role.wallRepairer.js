/** @function */
Creep.prototype.runRoleWallRepairer =
    function () {

        if (this.memory.action && this.memory.target) {
            this.execAction(this.memory.action, this.memory.target.id);
        }
        else if (this.store.getFreeCapacity() == 0) {
            if (!this.repairWall()) {
                if (!this.repairStructure()) {
                    this.upgrade();
                }
            }
        }
        // if creep is supposed to harvest energy from source
        else {
            this.getEnergy();
        }
    };