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
                && s.store.energy.valueOf() > 0
        })[0];


        if (creep.store.getUsedCapacity() && nearTower) {
            creep.transfer(nearTower, RESOURCE_ENERGY);
        }
        else if (creep.store.getUsedCapacity() && nearSpawn) {
            creep.transfer(nearSpawn, RESOURCE_ENERGY);
        }
        else if (creep.store.getUsedCapacity() && creep.room.storage.store.getFreeCapacity()) {
            creep.transfer(creep.room.storage, RESOURCE_ENERGY);
        }
        else {
            if (nearLink) {
                creep.withdraw(nearLink, RESOURCE_ENERGY);
            }
            else if (creep.room.storage.store.getUsedCapacity() > 1500 && nearTower) {
                creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
            }
            
            
        }
    }
};