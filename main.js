
// Any modules that you use that modify the game's prototypes should be require'd
// before you require the profiler.
const profiler = require('screeps-profiler');
const intel = require('intel');
const architect = require('architect');

// import modules
require('prototype.creep');
require('prototype.tower');
require('prototype.spawn');
require('prototype.link');

// This line monkey patches the global prototypes.
profiler.enable();
module.exports.loop = function() {
    profiler.wrap(function() {

        intel.getIntel();
        
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
        var towers = _.filter(Game.structures, s => s.structureType == STRUCTURE_TOWER);
        // for each tower
        for (let tower of towers) {
            // run tower logic
            tower.runRole();
        }

        // find all links
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

        // for each spawn
        for (let spawnName in Game.spawns) {
            // run spawn logic
            Game.spawns[spawnName].spawnCreepsIfNecessary();
        }

    });
};

