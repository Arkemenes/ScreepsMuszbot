var roleRepairer = require('role.repairer');

var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {

        var target = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);

        if(creep.store.getFreeCapacity() == 0 && !creep.memory.working){
            creep.memory.working = true;
        }

        if(creep.store.energy.valueOf() == 0 && creep.memory.working){
            creep.memory.working = false;
        }

        if(target && creep.memory.working) {
            creep.memory.target = target;
            if(creep.build(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            roleRepairer.run(creep);
        }
    }
};

module.exports = roleBuilder;