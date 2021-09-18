module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function(creep) {
        
        if (creep.memory.action && creep.memory.target) {
            creep.execAction(creep.memory.action, creep.memory.target.id);
        }
        else if (creep.store.getFreeCapacity() 
                && 
                creep.pos.findInRange(FIND_STRUCTURES, 1, {
                    filter: s => (s.structureType == STRUCTURE_CONTAINER)
                        && s.store.energy.valueOf() > 0
                })[0]) {
                    creep.getEnergy();
                }
        else if (!creep.store.getFreeCapacity()) {
            
            if (!creep.depositEnergy()) {
                creep.upgrade();
            }
        }
        // if creep is supposed to harvest energy from source
        else {
            creep.getEnergy();
        }
    }
};