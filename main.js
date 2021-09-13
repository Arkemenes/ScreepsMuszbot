var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleBuilder = require('role.builder');
var roleRepairer = require('role.repairer');
var roleWallRepairer = require('role.wallRepairer');
var roleMiner = require('role.miner');
var roleSpawn = require('role.spawn');
var roleTower = require('role.tower');
var architect = require('architect'); 

module.exports.loop = function () {

    // check for memory entries of died creeps by iterating over Memory.creeps
    for (let name in Memory.creeps) {
        // and checking if the creep is still alive
        if (Game.creeps[name] == undefined) {
            // if not, delete the memory entry
            delete Memory.creeps[name];
        }
    }

    architect.run();

    for(var name in Game.structures) {
		var structure = Game.structures[name];
        if (structure.structureType == STRUCTURE_TOWER) {
            roleTower.run(structure);
        }
		
	}

    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        switch(creep.memory.role) {
            case 'harvester':
                roleHarvester.run(creep);
              break;
            case 'upgrader':
                roleUpgrader.run(creep);
                break;
            case 'builder':
                roleBuilder.run(creep);
                break;
            case 'repairer':
                roleRepairer.run(creep);
                break;
            case 'wallRepairer':
                roleWallRepairer.run(creep);
                break;
            case 'miner':
                    roleMiner.run(creep);
                    break;
            default:
              console.log(creep.name + ' has no valid role defined :' + creep.memory.role);
          }
    }

	for(var name in Game.spawns) {
		var spawn = Game.spawns[name];
		roleSpawn.run(spawn);
	}
}