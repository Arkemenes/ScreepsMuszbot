var roleRepairer = require('role.repairer');

var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {

        var target = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);

        if(creep.memory.building && (creep.store[RESOURCE_ENERGY] == 0 || !target)) {
            creep.memory.building = false;
            creep.say('🔄 harvest');
        }
        if(!creep.memory.building && creep.store.getFreeCapacity() == 0 && target) {
            creep.memory.building = true;
            creep.say('🚧 build');
        }

        if(creep.memory.building) {
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