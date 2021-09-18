let architect = require('architect');

// import modules
require('prototype.creep');
require('prototype.tower');
require('prototype.spawn');
require('prototype.link');

module.exports.loop = function () {

    
    architect.createBuildingSites();

    // if there is no available spawn, it's possible to visualize using:
    // for (let i=0; i<11; i++){
    //     for (let j=0; j<11; j++) {
    //         architect.getPossibleSpawns("W" + i + "N" + j);
    //     }
    // }

    // check for memory entries of died creeps by iterating over Memory.creeps
    for (let name in Memory.creeps) {
        // and checking if the creep is still alive
        if (Game.creeps[name] == undefined) {
            // if not, delete the memory entry
            delete Memory.creeps[name];
        }
    }
    // find all towers
    var links = _.filter(Game.structures, s => s.structureType == STRUCTURE_LINK);
    // for each tower
    for (let link of links) {
        // run tower logic
        link.runRole();
    }

    // for each creeps
    for (let name in Game.creeps) {
        // run creep logic
        Game.creeps[name].runRole();
    }

    // find all towers
    var towers = _.filter(Game.structures, s => s.structureType == STRUCTURE_TOWER);
    // for each tower
    for (let tower of towers) {
        // run tower logic
        tower.runRole();
    }

    // for each spawn
    for (let spawnName in Game.spawns) {
        // run spawn logic
        Game.spawns[spawnName].spawnCreepsIfNecessary();
        break;
    }
};