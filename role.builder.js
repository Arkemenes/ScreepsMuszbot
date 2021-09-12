var roleRepairer = require('role.repairer');

var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {

        var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
        targets = _.sortBy(targets, s => creep.pos.getRangeTo(s));

        if(creep.memory.building && (creep.store[RESOURCE_ENERGY] == 0 || !targets.length)) {
            creep.memory.building = false;
            creep.say('🔄 harvest');
        }
        if(!creep.memory.building && creep.store.getFreeCapacity() == 0 && targets.length) {
            creep.memory.building = true;
            creep.say('🚧 build');
        }

        if(creep.memory.building) {
            if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            roleRepairer.run(creep);
        }
    }
};

module.exports = roleBuilder;