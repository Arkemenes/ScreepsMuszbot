var config = {
    "harvester_number":2,
    "builder_number":10,
    "upgrader_number":2
};

var roleSpawn = {

    /** @param {StructureSpawn} spawn **/
    run: function(spawn) {
        var numberOfHarvesters = _.sum(Game.creeps, (c) => c.memory.role == 'harvester');
        var numberOfUpgraders = _.sum(Game.creeps, (c) => c.memory.role == 'upgrader');
        var numberOfBuilders = _.sum(Game.creeps, (c) => c.memory.role == 'builder');

        if (numberOfHarvesters <= config["harvester_number"]){
            spawn.spawnCreep([WORK, WORK, CARRY, MOVE], Game.time, {memory: {working: false, role: 'harvester'}});

        }
        else if (numberOfBuilders <= config["builder_number"]){
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'builder'}});
        }
        else if (numberOfUpgraders <= config["upgrader_number"]){
            spawn.spawnCreep([WORK, WORK, CARRY, MOVE], Game.time, {memory: {working: false, role: 'upgrader'}});
        }
    }
};

module.exports = roleSpawn;