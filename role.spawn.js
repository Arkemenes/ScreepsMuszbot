var config = {
    "harvester_number":6,
    "builder_number":4,
    "upgrader_number":2,
    "repairer_number":2
};

var roleSpawn = {

    /** @param {StructureSpawn} spawn **/
    run: function(spawn) {

        function createBody(priorities, energy) {

            BODYPART_COST = { "move": 50, 
                          "work": 100, 
                          "attack": 80, 
                          "carry": 50, 
                          "heal": 250, 
                          "ranged_attack": 150, 
                          "tough": 10, 
                          "claim": 600 }

            var body = [];
            var cumulativeCost = 0;  

            var minCost = 600;

            for (let i = 0; i < priorities.length; i++){
                minCost = Math.min(minCost, BODYPART_COST[priorities[i]]);
            }
            
            while ((energy - cumulativeCost) > minCost ){
                for (let i = 0; i < priorities.length; i++){
                    if (cumulativeCost + BODYPART_COST[priorities[i]] <= energy) {
                        body.push(priorities[i]);
                        cumulativeCost += BODYPART_COST[priorities[i]];
                    }
                    if (cumulativeCost + minCost > energy) {
                        break;
                    }
                }
            }
            return body;
            
        }

        var numberOfHarvesters = _.sum(Game.creeps, (c) => c.memory.role == 'harvester');
        var numberOfUpgraders = _.sum(Game.creeps, (c) => c.memory.role == 'upgrader');
        var numberOfBuilders = _.sum(Game.creeps, (c) => c.memory.role == 'builder');
        var numberOfRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'repairer');

        if (numberOfHarvesters > 0) {
            var energy = spawn.room.energyCapacityAvailable;
        }
        else {
            var energy = spawn.room.energyAvailable;
        }
            

        if (numberOfHarvesters <= config["harvester_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, MOVE, WORK], energy);

            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'harvester'}});

        }
        else if (numberOfBuilders <= config["builder_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, MOVE, WORK], energy);

            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'builder'}});
        }
        else if (numberOfUpgraders <= config["upgrader_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, MOVE, WORK], energy);

            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'upgrader'}});
        }
        else if (numberOfRepairers <= config["repairer_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, MOVE, WORK], energy);
            
            spawn.spawnCreep(body, Game.time, {memory: {working: false, role: 'upgrader'}});
        }
    }
};

module.exports = roleSpawn;