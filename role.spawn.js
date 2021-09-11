var roleSpawn = {

    /** @param {StructureSpawn} spawn **/
    run: function(spawn) {
        if (!Memory.harvesters || Memory.harvesters.length <= 4){
            // console.log('Criando harvester');
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'harvester'}});

        }
        else if (!Memory.builders || Memory.builders.length <= 3){
            // console.log('Criando builder');
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'builder'}});
        }
        else if (!Memory.upgraders || Memory.upgraders.length <= 4){
            // console.log('Criando upgrader');
            spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], Game.time, {memory: {working: false, role: 'upgrader'}});
        }
    }
};

module.exports = roleSpawn;