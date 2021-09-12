// var roleUpgrader = require('role.upgrader');

var roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if(creep.store.getFreeCapacity() > 0) {

            var sources = creep.room.find(FIND_SOURCES);

            // Sort the energy sources by distance from the current creep
            sources = _.sortBy(sources, s => creep.pos.getRangeTo(s));

            // If there is a valid energy source, move to and harvest it
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.memory.target = sources[0];
                creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        else {
            // Get a structure to store the energy
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                        structure.structureType == STRUCTURE_SPAWN ||
                        structure.structureType == STRUCTURE_TOWER) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });

            targets = _.sortBy(targets, s => creep.pos.getRangeTo(s));

            if (targets.length > 0 && !creep.memory.harvesting ) {
                creep.memory.harvesting = true;
                creep.say('🔄 harvest');
            }
            else if (!targets.length && creep.memory.harvesting ){
                creep.memory.harvesting = false;
                creep.say('⚡ upgrade');
            }


            if(creep.memory.harvesting) {
                // If there is a valid target, move to and upgrade it
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.memory.target = targets[0];
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
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