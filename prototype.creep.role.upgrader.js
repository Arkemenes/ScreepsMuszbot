/** @function */
Creep.prototype.runRoleUpgrader =
    function () {

        if (this.memory.action && this.memory.target) {
            this.execAction(this.memory.action, this.memory.target.id);
        }
        else if (this.store.getFreeCapacity() < 0.9 * this.store.getCapacity()) {
            this.upgrade();
        }
        // if creep is supposed to harvest energy from source
        else {
            this.getEnergy();
        }
    };