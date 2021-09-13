var roleWallRepairer = require('role.wallRepairer');

var roleRepairer = {

    /** @param {Creep} creep **/
    run: function(creep) {

        var targets = creep.room.find(FIND_STRUCTURES,{ 
            filter: (s) => s.hits < s.hitsMax && s.structureType != STRUCTURE_WALL
        });
        
        target = _.sortBy(targets, s => s.hits)[0];

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
            roleWallRepairer.run(creep);
        }
    }
};

module.exports = roleRepairer;