// var roleUpgrader = require('role.upgrader');

var roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {

        if(creep.store.getFreeCapacity() == 0 && !creep.memory.working){
            creep.memory.working = true;
        }

        if(creep.store.energy.valueOf() == 0 && creep.memory.working){
            creep.memory.working = false;
        }

        if(!creep.memory.working) {

            var source = creep.pos.findClosestByPath(FIND_SOURCES);

            // If there is a valid energy source, move to and harvest it
            if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.memory.target = source;
                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        else {
            // Get a structure to store the energy
            var target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                        structure.structureType == STRUCTURE_SPAWN ||
                        structure.structureType == STRUCTURE_TOWER) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });

            if (target && !creep.memory.harvesting ) {
                creep.memory.harvesting = true;
                creep.say('🔄 harvest');
            }
            else if (!target && creep.memory.harvesting ){
                creep.memory.harvesting = false;
                creep.say('⚡ upgrade');
            }


            if(creep.memory.harvesting) {
                // If there is a valid target, move to and upgrade it
                if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.memory.target = target;
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            else {
                // Try to upgrade controller if there is no valid target in the room
                if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.memory.target = creep.room.controller;
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }
};

module.exports = roleHarvester;