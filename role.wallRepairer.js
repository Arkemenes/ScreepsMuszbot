module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function(creep) {
        
        if (creep.memory.action && creep.memory.target) {
            creep.execAction(creep.memory.action, creep.memory.target.id);
        }
        else if (creep.store.getFreeCapacity() == 0) {
            if (!creep.repairWall()) {
                if (!creep.repairStructure()) {
                    creep.upgrade();
                }
            }
        }
        // if creep is supposed to harvest energy from source
        else {
            creep.getEnergy();
        }
    }
};