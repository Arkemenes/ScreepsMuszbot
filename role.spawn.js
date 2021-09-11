var config = {
    "harvester_number":2,
    "builder_number":2,
    "upgrader_number":2
};

var roleSpawn = {

    /** @param {StructureSpawn} spawn **/
    run: function(spawn) {
        if (!Memory.harvesters || Memory.harvesters.length <= config["harvester_number"]){
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'harvester'}});

        }
        else if (!Memory.builders || Memory.builders.length <= config["builder_number"]){
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'builder'}});
        }
        else if (!Memory.upgraders || Memory.upgraders.length <= config["upgrader_number"]){
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'upgrader'}});
        }
    }
};

module.exports = roleSpawn;