var roleUpgrader = require('role.upgrader');

var roleRepairer = {

    /** @param {Creep} creep **/
    run: function(creep) {

        var target = creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: (s) => s.hits < s.hitsMax && s.structureType != STRUCTURE_WALL});

        if(creep.store.getFreeCapacity() == 0 && !creep.memory.working){
            creep.memory.working = true;
        }

        if(creep.store.energy.valueOf() == 0 && creep.memory.working){
            creep.memory.working = false;
        }

        if(target && creep.memory.working) {
            creep.memory.target = target;
            if(creep.repair(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            roleUpgrader.run(creep);
        }
    }
};

module.exports = roleRepairer;