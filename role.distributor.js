module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function (creep) {

        let nearTowers = creep.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => (s.structureType == STRUCTURE_TOWER)
                && s.store.energy <= 0.9 * s.store.getCapacity(RESOURCE_ENERGY)
        });

        let nearTower = _.sortBy(nearTowers, s => s.store.energy)[0];

        let nearSpawn = creep.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => (s.structureType == STRUCTURE_SPAWN)
                && s.store.energy <= 0.9 * s.store.getCapacity(RESOURCE_ENERGY)
        })[0];

        let nearLink = creep.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => (s.structureType == STRUCTURE_LINK)
        })[0];


        if (creep.store.getUsedCapacity() && nearTower) {
            creep.transfer(nearTower, RESOURCE_ENERGY);
        }
        else if (creep.store.getUsedCapacity() && nearSpawn) {
            creep.transfer(nearSpawn, RESOURCE_ENERGY);
        }
        else if (creep.store.getUsedCapacity() && nearLink && nearLink.store.energy.valueOf() < 100) {
            creep.transfer(nearLink, RESOURCE_ENERGY, 100 - nearLink.store.energy.valueOf());
        }
        else if (creep.store.getUsedCapacity() && creep.room.storage && creep.room.storage.store.getFreeCapacity()) {
            creep.transfer(creep.room.storage, RESOURCE_ENERGY);
        }
        else {
            if (nearLink && nearLink.store.energy.valueOf() > 100) {
                creep.withdraw(nearLink, RESOURCE_ENERGY, nearLink.store.energy.valueOf() - 100);
            }
            else if (creep.room.storage.store.getUsedCapacity() > 2000 &&
                    (nearLink.store.energy.valueOf() < 100 || nearTower || nearSpawn)) {
                creep.withdraw(creep.room.storage, RESOURCE_ENERGY,);
            }
            
            
        }
    }
};