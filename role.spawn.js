var roleSpawn = {

    /** @param {StructureSpawn} spawn **/
    run: function(spawn) {
        // console.log('h'+Memory.harvesters.length);
        // console.log('b'+Memory.builders.length);
        // console.log('u'+Memory.upgraders.length);
        if (!Memory.harvesters || Memory.harvesters.length <= 2){
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'harvester'}});

        }
        else if (!Memory.builders || Memory.builders.length <= 2){
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'builder'}});
        }
        else if (!Memory.upgraders || Memory.upgraders.length <= 2){
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'upgrader'}});
        }
    }
};

module.exports = roleSpawn;