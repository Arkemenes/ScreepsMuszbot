var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleBuilder = require('role.builder');
var roleBuilder = require('role.repairer');
var roleSpawn = require('role.spawn');
var roleTower = require('role.tower');

module.exports.loop = function () {

    for(var name in Game.structures) {
		var structure = Game.structures[name];
        if (structure.structureType == STRUCTURE_TOWER) {
            roleTower.run(structure);
        }
		
	}

    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        if(creep.memory.role == 'harvester') {
            roleHarvester.run(creep);
        }
        if(creep.memory.role == 'upgrader') {
            roleUpgrader.run(creep);
        }
        if(creep.memory.role == 'builder') {
            roleBuilder.run(creep);
        }
        if(creep.memory.role == 'repairer') {
            roleBuilder.run(creep);
        }
    }

	for(var name in Game.spawns) {
		var spawn = Game.spawns[name];
		roleSpawn.run(spawn);
	}
}