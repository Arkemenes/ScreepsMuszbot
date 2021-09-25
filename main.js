
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
module.exports.loop = function () {
    profiler.wrap(function () {

        let cpu = Game.cpu.getUsed();
        let new_cpu = cpu;

        intel.getIntel();


        if (Memory.visualizeCPU) {
            new_cpu = Game.cpu.getUsed();
            console.log('CPU usage on intel: ' + (new_cpu - cpu))
            cpu = new_cpu;
        }

        architect.createBuildingSites();

        if (Memory.visualizeCPU) {
            new_cpu = Game.cpu.getUsed();
            console.log('CPU usage on architect: ' + (new_cpu - cpu))
            cpu = new_cpu;
        }

        // if there is no available spawn, it's possible to visualize using:
        // for (let i=18; i<20; i++){
        //     for (let j=56; j<58; j++) {
        //         architect.getPossibleSpawns("E" + i + "N" + j);
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

        if (Memory.visualizeCPU) {
            new_cpu = Game.cpu.getUsed();
            console.log('CPU usage on memory clean: ' + (new_cpu - cpu))
            cpu = new_cpu;
        }

        // find all towers
        var towers = _.filter(Game.structures, s => s.structureType == STRUCTURE_TOWER);
        // for each tower
        for (let tower of towers) {
            // run tower logic
            tower.runRole();
        }

        if (Memory.visualizeCPU) {
            new_cpu = Game.cpu.getUsed();
            console.log('CPU usage on towers: ' + (new_cpu - cpu))
            cpu = new_cpu;
        }

        // find all links
        var links = _.filter(Game.structures, s => s.structureType == STRUCTURE_LINK);
        // for each tower
        for (let link of links) {
            // run tower logic
            link.runRole();
        }

        if (Memory.visualizeCPU) {
            new_cpu = Game.cpu.getUsed();
            console.log('CPU usage on links: ' + (new_cpu - cpu))
            cpu = new_cpu;
        }

        // for each creeps
        for (let name in Game.creeps) {
            // run creep logic
            Game.creeps[name].runRole();
        }

        if (Memory.visualizeCPU) {
            new_cpu = Game.cpu.getUsed();
            console.log('CPU usage on creeps: ' + (new_cpu - cpu))
            cpu = new_cpu;
        }

        // for each spawn
        for (let spawnName in Game.spawns) {
            // run spawn logic
            Game.spawns[spawnName].spawnCreepsIfNecessary();
        }
        if (Memory.visualizeCPU) {
            new_cpu = Game.cpu.getUsed();
            console.log('CPU usage on spawn: ' + (new_cpu - cpu))
            cpu = new_cpu;
        }

    });
};

