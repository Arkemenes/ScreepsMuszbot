var config = {
    "harvester_number":2,
    "builder_number":3,
    "upgrader_number":1,
    "repairer_number":0,
    "wall_repairer_number":0,
    "transporter_number":2
};

StructureSpawn.prototype.spawnCreepsIfNecessary = 
    function () {
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
            
            for (let i = 0; i < priorities.length; i++){
                if (cumulativeCost + BODYPART_COST[priorities[i]] <= energy) {
                    body.push(priorities[i]);
                    cumulativeCost += BODYPART_COST[priorities[i]];
                }
            }
            return body;
            
        }

        var numberOfHarvesters = _.sum(Game.creeps, (c) => c.memory.role == 'harvester' && c.ticksToLive > 10);
        var numberOfUpgraders = _.sum(Game.creeps, (c) => c.memory.role == 'upgrader' && c.ticksToLive > 10);
        var numberOfBuilders = _.sum(Game.creeps, (c) => c.memory.role == 'builder' && c.ticksToLive > 10);
        var numberOfRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'repairer' && c.ticksToLive > 10);
        var numberOfWallRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'wallRepairer' && c.ticksToLive > 10);
        var numberofMiners = _.sum(Game.creeps, (c) => c.memory.role == 'miner' && c.ticksToLive > 10);
        var numberOfTransporters = _.sum(Game.creeps, (c) => c.memory.role == 'transporter' && c.ticksToLive > 10);

        
        
        
        config['miner_number'] = this.room.find(FIND_STRUCTURES,{
            filter: s => s.structureType == STRUCTURE_CONTAINER
        }).length;


        if (numberOfHarvesters > 0) {
            var energy = this.room.energyCapacityAvailable;
        }
        else {
            var energy = Math.max(this.room.energyAvailable,300);
        }
            

        if (numberofMiners < config["miner_number"]){

            var body = createBody([MOVE, WORK, WORK, WORK, WORK, WORK], energy);
            
            this.spawnCreep(body, Game.time, {memory: {working: false, role: 'miner'}});
        }
        else if (numberOfHarvesters < config["harvester_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, MOVE, CARRY], energy);

            this.spawnCreep(body, Game.time, {memory: {working: false, role: 'harvester'}});

        }
        else if (numberOfBuilders < config["builder_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, WORK, CARRY, WORK, MOVE], energy);

            this.spawnCreep(body, Game.time, {memory: {working: false, role: 'builder'}});
        }
        else if (numberOfUpgraders < config["upgrader_number"]){

            var body = createBody([CARRY, MOVE, WORK, MOVE, WORK, WORK, WORK], energy);

            this.spawnCreep(body, Game.time, {memory: {working: false, role: 'upgrader'}});
        }
        else if (numberOfRepairers < config["repairer_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, MOVE, CARRY, WORK, CARRY, WORK, CARRY], energy);
            
            this.spawnCreep(body, Game.time, {memory: {working: false, role: 'repairer'}});
        }
        else if (numberOfWallRepairers < config["wall_repairer_number"]){

            var body = createBody([CARRY, MOVE, WORK, CARRY, MOVE, CARRY, WORK, CARRY, CARRY, WORK, CARRY, CARRY, CARRY], energy);
            
            this.spawnCreep(body, Game.time, {memory: {working: false, role: 'wallRepairer'}});
        }
        else if (numberOfTransporters < config["transporter_number"] && this.room.find(FIND_STRUCTURES, {filter: (s) => (s.structureType == STRUCTURE_CONTAINER)})[0]){

            var body = createBody([MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY], energy);
            
            this.spawnCreep(body, Game.time, {memory: {working: false, role: 'transporter'}});
        }

    
    }