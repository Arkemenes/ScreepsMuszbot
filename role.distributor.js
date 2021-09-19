module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function (creep) {
        if (creep.store.getUsedCapacity() && creep.room.storage.store.getFreeCapacity()) {
            creep.transfer(creep.room.storage, RESOURCE_ENERGY);
        }
        else {
            let nearLink = creep.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => (s.structureType == STRUCTURE_LINK)
                    && s.store.energy.valueOf() > 0
            })[0];
            if (nearLink) {
                creep.withdraw(nearLink, RESOURCE_ENERGY);
            }
            
            
        }
    }
};