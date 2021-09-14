module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function(creep) {
        
        if (creep.memory.action && creep.memory.target) {
            creep.execAction(creep.memory.action, creep.memory.target.id);
        }
        else if (creep.store.energy.valueOf() >= 50) {
            creep.depositEnergy();
        }
        // if creep is supposed to harvest energy from source
        else {
            creep.getEnergy();
        }
    }
};