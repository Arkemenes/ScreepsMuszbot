/** @function */
Creep.prototype.runRoleDistributor =
    function () {

        let nearTowers = this.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => (s.structureType == STRUCTURE_TOWER)
                && s.store.energy <= 0.9 * s.store.getCapacity(RESOURCE_ENERGY)
        });

        let nearTower = _.sortBy(nearTowers, s => s.store.energy)[0];

        let nearSpawn = this.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => (s.structureType == STRUCTURE_SPAWN)
                && s.store.energy <= 0.9 * s.store.getCapacity(RESOURCE_ENERGY)
        })[0];

        let nearLink = this.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => (s.structureType == STRUCTURE_LINK)
        })[0];


        if (this.store.getUsedCapacity() && nearTower) {
            this.transfer(nearTower, RESOURCE_ENERGY);
        }
        else if (this.store.getUsedCapacity() && nearSpawn) {
            this.transfer(nearSpawn, RESOURCE_ENERGY);
        }
        else if (this.store.getUsedCapacity() && nearLink && nearLink.store.energy.valueOf() < 100) {
            this.transfer(nearLink, RESOURCE_ENERGY, 100 - nearLink.store.energy.valueOf());
        }
        else if (this.store.getUsedCapacity() && this.room.storage && this.room.storage.store.getFreeCapacity()) {
            this.transfer(this.room.storage, RESOURCE_ENERGY);
        }
        else {
            if (nearLink && nearLink.store.energy.valueOf() > 100) {
                this.withdraw(nearLink, RESOURCE_ENERGY, nearLink.store.energy.valueOf() - 100);
            }
            else if (this.room.storage.store.getUsedCapacity() > 2000 &&
                (nearLink.store.energy.valueOf() < 100 || nearTower || nearSpawn)) {
                this.withdraw(this.room.storage, RESOURCE_ENERGY,);
            }


        }
    };