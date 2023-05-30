/** @function */
Creep.prototype.runRoleTransporter =
    function () {

        if (this.memory.action && this.memory.target) {
            this.execAction(this.memory.action, this.memory.target.id);
        }
        else if (this.store.getUsedCapacity() >= 0.7 * this.store.getCapacity()) {
            this.depositEnergy();
        }
        // if creep is supposed to harvest energy from source
        else {
            this.getEnergy();
        }
    };