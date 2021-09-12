var roleHarvester = require('role.harvester');

var roleUpgrader = {

    /** @param {Creep} creep **/
    run: function(creep) {

        var target = creep.room.controller;
        
        if(creep.store.getFreeCapacity() == 0 && !creep.memory.working){
            creep.memory.working = true;
        }

        if(creep.store.energy.valueOf() == 0 && creep.memory.working){
            creep.memory.working = false;
        }
        
        if(target && creep.memory.working) {
            creep.memory.target = creep.room.controller;
            if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            roleHarvester.run(creep);
        }
    }
};

module.exports = roleUpgrader;