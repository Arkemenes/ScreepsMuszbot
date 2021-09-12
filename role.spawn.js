var config = {
    "harvester_number":4,
    "builder_number":2,
    "upgrader_number":2,
    "repairer_number":2
};

var roleSpawn = {

    /** @param {StructureSpawn} spawn **/
    run: function(spawn) {
        var numberOfHarvesters = _.sum(Game.creeps, (c) => c.memory.role == 'harvester');
        var numberOfUpgraders = _.sum(Game.creeps, (c) => c.memory.role == 'upgrader');
        var numberOfBuilders = _.sum(Game.creeps, (c) => c.memory.role == 'builder');
        var numberOfRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'repairer');

        var energy = spawn.room.energyCapacityAvailable;

        if (numberOfHarvesters > 0) {
            var energy = spawn.room.energyCapacityAvailable;
        }
        else {
            var energy = spawn.room.energyAvailable;
        }

        var numberOfParts = Math.floor(energy/200);
        

        var body = [];

        for (let i = 0; i < numberOfParts; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }

        if (numberOfHarvesters <= config["harvester_number"]){
            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'harvester'}});

        }
        else if (numberOfBuilders <= config["builder_number"]){
            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'builder'}});
        }
        else if (numberOfUpgraders <= config["upgrader_number"]){
            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'upgrader'}});
        }
        else if (numberOfRepairers <= config["repairer_number"]){
            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'upgrader'}});
        }
    }
};

module.exports = roleSpawn;