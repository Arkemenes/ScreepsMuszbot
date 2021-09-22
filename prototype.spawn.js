StructureSpawn.prototype.spawnCreepsIfNecessary =
    function () {
        function createBody(priorities, energy) {

            BODYPART_COST = {
                "move": 50,
                "work": 100,
                "attack": 80,
                "carry": 50,
                "heal": 250,
                "ranged_attack": 150,
                "tough": 10,
                "claim": 600
            }

            var body = [];
            var cumulativeCost = 0;

            for (let i = 0; i < priorities.length; i++) {
                if (cumulativeCost + BODYPART_COST[priorities[i]] <= energy) {
                    body.push(priorities[i]);
                    cumulativeCost += BODYPART_COST[priorities[i]];
                }
            }
            return body;

        }

        var numberOfHarvesters = _.sum(Game.creeps, (c) => c.memory.role == 'harvester' && c.ticksToLive > 5);
        var numberOfUpgraders = _.sum(Game.creeps, (c) => c.memory.role == 'upgrader' && c.ticksToLive > 5);
        var numberOfBuilders = _.sum(Game.creeps, (c) => c.memory.role == 'builder' && c.ticksToLive > 5);
        var numberOfRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'repairer' && c.ticksToLive > 5);
        var numberOfWallRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'wallRepairer' && c.ticksToLive > 5);
        var numberofMiners = _.sum(Game.creeps, (c) => c.memory.role == 'miner' && c.ticksToLive > 5);
        var numberOfTransporters = _.sum(Game.creeps, (c) => c.memory.role == 'transporter' && c.ticksToLive > 5);
        var numberOfDistributors = _.sum(Game.creeps, (c) => c.memory.role == 'distributor' && c.ticksToLive > 5);


        let targetNumbers = {}
        targetNumbers['miner'] = this.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType == STRUCTURE_CONTAINER
        }).length;

        switch (this.room.controller.level) {
            case 1:
                targetNumbers['harvester'] = 4;
                targetNumbers['builder'] = 2;
                targetNumbers['upgrader'] = 2;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 0;
                break;
            case 2:
                targetNumbers['harvester'] = 8;
                targetNumbers['builder'] = 3;
                targetNumbers['upgrader'] = 2;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 0;
                break;
            case 3:
                targetNumbers['harvester'] = 5;
                targetNumbers['builder'] = 3;
                targetNumbers['upgrader'] = 4;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 0;
                break;
            case 4:
                targetNumbers['harvester'] = 3;
                targetNumbers['builder'] = 3;
                targetNumbers['upgrader'] = 2;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 2;
                break;
            case 5:
                targetNumbers['harvester'] = 3;
                targetNumbers['builder'] = 2;
                targetNumbers['upgrader'] = 4;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 2;
                break;

            case 6:
                targetNumbers['harvester'] = 2;
                targetNumbers['builder'] = 1;
                targetNumbers['upgrader'] = 2;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 1;
                break;

            case 7:
                targetNumbers['harvester'] = 2;
                targetNumbers['builder'] = 1;
                targetNumbers['upgrader'] = 2;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 2;
                break;

            case 8:
                targetNumbers['harvester'] = 2;
                targetNumbers['builder'] = 1;
                targetNumbers['upgrader'] = 0;
                targetNumbers['repairer'] = 0;
                targetNumbers['wall_repairer'] = 0;
                targetNumbers['transporter'] = 2;
                break;
            default:
                break;


        }


        if (numberOfHarvesters == 0) {
            var energy = this.room.energyAvailable;
            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {memory: {role: 'harvester'}, directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]}) != 0) {
                let newHarvester = room.find(FIND_CREEPS, {filter: (creep) => creep.memory.role != 'distributor' && 
                                                                          creep.memory.role != 'miner' && 
                                                                          creep.memory.role != 'transporter'})[0];
                if (newHarvester) {
                    newHarvester.memory.role = 'harvester';
                    newHarvester.memory.action = undefined;
                    newHarvester.memory.target = undefined;
                }
            }
        }
        else {
            var energy = 0.8 * this.room.energyCapacityAvailable;


        }

        let dyingCreep = this.pos.findInRange(FIND_MY_CREEPS,1, {filter: (creep) => creep.ticksToLive <= 300})[0];

        if (dyingCreep && this.room.energyAvailable >= 0.8 * this.room.energyCapacityAvailable &&
            (dyingCreep.body.length >= 33 ||
            (_.filter(dyingCreep.body, function(bp){return bp.type == MOVE;}).length == 0 &&
            _.filter(dyingCreep.body, function(bp){return bp.type == CARRY;}).length >= 16))) {
            this.renewCreep(dyingCreep);
        }
        else if (numberofMiners < targetNumbers['miner']) {

            var body = createBody([MOVE, WORK, WORK, WORK, WORK, WORK], energy);

            this.spawnCreep(body, Game.time, {
                memory: {role: 'miner'},
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        }
        else if (numberOfHarvesters < targetNumbers['harvester']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {role: 'harvester'},
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });

        }
        else if (numberOfBuilders < targetNumbers['builder']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {role: 'builder'},
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        }
        else if (numberOfUpgraders < targetNumbers['upgrader']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {role: 'upgrader'},
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        }
        else if (numberOfRepairers < targetNumbers['repairer']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {role: 'repairer'},
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        }
        else if (numberOfWallRepairers < targetNumbers['wall_repairer']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {role: 'wallRepairer'},
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        }
        else if (numberOfTransporters < targetNumbers['transporter'] && this.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_STORAGE && s.isActive() })[0]) {

            var body = createBody([MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

            this.spawnCreep(body, Game.time, {
                memory: {role: 'transporter'},
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        }
        else if (numberOfDistributors < 1 && this.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_STORAGE })[0]) {

            var body = createBody([CARRY, WORK, CARRY, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

            Game.spawns.Spawn1.spawnCreep(body, Game.time, {
                memory: { role: 'distributor' },
                directions: [BOTTOM]
            });
        }


    }