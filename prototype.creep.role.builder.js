/** @function */
Creep.prototype.runRoleBuilder =
    function () {


        if (this.memory.action && this.memory.target) {

            this.execAction(this.memory.action, this.memory.target.id);
        }
        else if (this.store.getFreeCapacity() < 0.9 * this.store.getCapacity()) {
            if (!this.buildConstruction()) {
                if (!this.depositEnergy()) {
                    if (!this.repairStructure()) {
                        if (!this.repairWall()) {
                            this.upgrade();
                        }
                    }
                }
            }
        }
        // if this is supposed to harvest energy from source
        else {

            this.getEnergy(undefined);
        }

    };
