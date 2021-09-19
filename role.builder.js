module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function(creep) {

        if (creep.memory.action && creep.memory.target) {
            creep.execAction(creep.memory.action, creep.memory.target.id);
        }
        else if (creep.store.getFreeCapacity() < 0.9 * creep.store.getCapacity()) {
            // targets = creep.room.find(FIND_STRUCTURES, {
            //     filter: s => s.hits < 1000
            // });
            // target = _.sortBy(damagedStructures, s => s.hits)[0];

            if (target) {
                creep.repairStructure();
            }
            else {
                if (!creep.buildConstruction()) {
                    if (!creep.repairStructure()) {
                        if (!creep.depositEnergy()) {
                            creep.upgrade();
                        }
                    }
                }
            }
        }
        // if creep is supposed to harvest energy from source
        else {
            creep.getEnergy();
        }
    }
};
