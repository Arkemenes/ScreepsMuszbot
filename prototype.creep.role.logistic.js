/** @function */
Creep.prototype.runRoleLogistic =
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


        if ((this.store.getUsedCapacity() > 0 && nearTower)) {
            this.transfer(nearTower, RESOURCE_ENERGY);
        }
        else if (this.store.getUsedCapacity() > 0 && nearSpawn) {
            this.transfer(nearSpawn, RESOURCE_ENERGY);
        }
        else if (this.store.getUsedCapacity() > 0 && this.room.storage && this.room.storage.store.getFreeCapacity()) {
            this.transfer(this.room.storage, RESOURCE_ENERGY);
        }
        else {
            
            if (nearLink && nearLink.store.energy.valueOf() > 100) {
                this.withdraw(nearLink, RESOURCE_ENERGY);
            }
            else if (this.room.storage.store.getUsedCapacity() > 2000 &&
                (nearTower || nearSpawn)) {
                this.withdraw(this.room.storage, RESOURCE_ENERGY);
            }


        }
    };