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

        var numberOfHarvesters = _.sum(Game.creeps, (c) => c.memory.role == 'harvester' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberOfUpgraders = _.sum(Game.creeps, (c) => c.memory.role == 'upgrader' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberOfBuilders = _.sum(Game.creeps, (c) => c.memory.role == 'builder' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberOfRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'repairer' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberOfWallRepairers = _.sum(Game.creeps, (c) => c.memory.role == 'wallRepairer' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberofMiners = _.sum(Game.creeps, (c) => c.memory.role == 'miner' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberOfTransporters = _.sum(Game.creeps, (c) => c.memory.role == 'transporter' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberOfScouts = _.sum(Game.creeps, (c) => c.memory.role == 'scout' && c.ticksToLive > 5 && c.memory.home == this.room.name);
        var numberOfDistributors = _.sum(Game.creeps, (c) => c.memory.role == 'distributor' && c.ticksToLive > 5 && c.memory.home == this.room.name);


        let targetNumbers = {}
        targetNumbers['miner'] = this.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType == STRUCTURE_CONTAINER
        }).length;

        switch (this.room.controller.level) {
            case 1:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                break;
            case 2:
                targetNumbers['harvester'] = Math.ceil(8 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(3 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                break;
            case 3:
                targetNumbers['harvester'] = Math.ceil(5 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(3 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(4 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                break;
            case 4:
                targetNumbers['harvester'] = Math.ceil(3 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(3 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                break;
            case 5:
                targetNumbers['harvester'] = Math.ceil(3 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(4 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                break;

            case 6:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                break;

            case 7:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                break;

            case 8:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['builder'] = Math.ceil(1 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['upgrader'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - this.room.find(FIND_SOURCES).length));
                targetNumbers['scout'] = Math.ceil(0 / (3 - this.room.find(FIND_SOURCES).length));
                break;
            default:
                break;


        }

        if (numberOfHarvesters == 0) {
            var energy = Math.max(this.room.energyAvailable, 201);
            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'harvester',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) != 0) {
                let newHarvester = this.room.find(FIND_MY_CREEPS, {
                    filter: (creep) => creep.memory.role != 'distributor' &&
                        creep.memory.role != 'miner' &&
                        creep.memory.role != 'transporter'
                })[0];
                if (newHarvester) {
                    newHarvester.memory.role = 'harvester';
                    newHarvester.memory.action = undefined;
                    newHarvester.memory.target = undefined;
                }
            }
        } else {
            var energy = 0.8 * this.room.energyCapacityAvailable;


        }

        let dyingCreep = this.pos.findInRange(FIND_MY_CREEPS, 1, {
            filter: (c) => c.ticksToLive <= 300 &&
                (c.body.length >= 33 ||
                    (c.getActiveBodyparts(MOVE) == 0 &&
                        c.getActiveBodyparts(CARRY) >= 16))
        })[0];

        if (dyingCreep && this.room.energyAvailable >= 0.8 * this.room.energyCapacityAvailable) {
            this.renewCreep(dyingCreep);
        } else if (numberofMiners < targetNumbers['miner']) {

            var body = createBody([MOVE, WORK, WORK, WORK, WORK, WORK, MOVE, CARRY], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'miner',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        } else if (numberOfHarvesters < targetNumbers['harvester']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'harvester',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });

        } else if (numberOfBuilders < targetNumbers['builder']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'builder',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        } else if (numberOfUpgraders < targetNumbers['upgrader']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'upgrader',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        } else if (numberOfRepairers < targetNumbers['repairer']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'repairer',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        } else if (numberOfWallRepairers < targetNumbers['wall_repairer']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'wallRepairer',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        } else if (numberOfTransporters < targetNumbers['transporter'] && this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_STORAGE && s.isActive()
            })[0]) {

            var body = createBody([MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'transporter',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        } else if (numberOfDistributors < 1 && this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_STORAGE
            })[0]) {

            var body = createBody([CARRY, WORK, CARRY, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

            Game.spawns.Spawn1.spawnCreep(body, Game.time, {
                memory: {
                    role: 'distributor',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [BOTTOM]
            });
        } else if (numberOfScouts < targetNumbers['scout']) {

            var body = createBody([MOVE, MOVE], energy);

            this.spawnCreep(body, Game.time, {
                memory: {
                    role: 'scout',
                    home: this.room.name,
                    targetRoom: undefined
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            });
        } else {
            for (let exitId in Memory.rooms[this.room.name].exits) {

                let exit = Memory.rooms[this.room.name].exits[exitId];

                if (!Memory.rooms[exit].enemies) {
                    let exit = Memory.rooms[this.room.name].exits[exitId];
                    let numberOfClaimers = _.sum(Game.creeps, (c) => c.memory.role == 'claimer' && c.ticksToLive > 10 && c.memory.targetRoom == exit);
                    let numberOfBuilders = _.sum(Game.creeps, (c) => c.memory.role == 'builder' && c.ticksToLive > 10 && c.memory.targetRoom == exit);
                    let numberOfHarvesters = _.sum(Game.creeps, (c) => c.memory.role == 'harvester' && c.ticksToLive > 10 && c.memory.targetRoom == exit);

                    if (_.filter(Game.rooms, (r) => {
                            return r.controller && r.controller.my
                        }).length < Game.gcl &&
                        !numberOfClaimers &&
                        Memory.rooms[exit].hasController &&
                        Memory.rooms[exit].center &&
                        Memory.rooms[exit].center &&
                        energy > 800 &&
                        (!Memory.rooms[exit].owner ||
                            (Memory.rooms[exit].owner &&
                                Memory.rooms[exit].owner.username != "Arkemenes"))) {

                        var body = createBody([MOVE, CLAIM, WORK, CARRY, WORK, CARRY, WORK, CARRY, WORK, CARRY], energy);
                        this.spawnCreep(body, Game.time, {
                            memory: {
                                role: 'claimer',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        });
                        console.log('building new claimer from ' + this.room.name + ' to room ' + exit)
                    } else if (_.filter(Game.rooms, (r) => {
                            return r.controller && r.controller.my
                        }).length >= Game.gcl &&
                        !numberOfClaimers &&
                        Memory.rooms[exit].hasController &&
                        Memory.rooms[exit].center &&
                        Memory.rooms[exit].center &&
                        energy > 1250 &&
                        (!Memory.rooms[exit].owner ||
                            (Memory.rooms[exit].owner &&
                                Memory.rooms[exit].owner.username != "Arkemenes"))) {

                        var body = createBody([MOVE, CLAIM, CLAIM, CLAIM], energy);
                        this.spawnCreep(body, Game.time, {
                            memory: {
                                role: 'claimer',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        });
                        console.log('building new reserver from ' + this.room.name + ' to room ' + exit)
                    }

                    if (numberOfBuilders < 2 && Memory.rooms[exit].owner && Memory.rooms[exit].owner.username == "Arkemenes") {
                        var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

                        this.spawnCreep(body, Game.time, {
                            memory: {
                                role: 'builder',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        });
                    } else if (numberOfHarvesters < 2 && 
                              (Memory.rooms[exit].owner && Memory.rooms[exit].owner.username == "Arkemenes" ||
                               Memory.rooms[exit].reservation && Memory.rooms[exit].reservation.username == "Arkemenes")) {
                        var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

                        this.spawnCreep(body, Game.time, {
                            memory: {
                                role: 'harvester',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        });

                    }
                
                }

            }
        }


    }