StructureSpawn.prototype.spawnCreepsIfNecessary =
    function () {

        if (this.spawning) {
            return;
        }

        let targetNumbers = {}
        targetNumbers['miner'] = Memory.rooms[this.room.name].numberOfContainers;

        let sourceNumber = Memory.rooms[this.room.name].sourceNumber;

        switch (this.room.controller.level) {
            case 1:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(0 / (3 - sourceNumber));
                break;
            case 2:
                targetNumbers['harvester'] = Math.ceil(8 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(3 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - sourceNumber));
                break;
            case 3:
                targetNumbers['harvester'] = Math.ceil(3 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - sourceNumber));
                break;
            case 4:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - sourceNumber));
                break;
            case 5:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - sourceNumber));
                break;

            case 6:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(1 / (3 - sourceNumber));
                break;

            case 7:
                targetNumbers['harvester'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - sourceNumber));
                break;

            case 8:
                targetNumbers['harvester'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - sourceNumber));
                targetNumbers['scout'] = Math.ceil(0 / (3 - sourceNumber));
                break;
            default:
                break;


        }


        if (Memory.rooms[this.room.name].numberOfHarvesters == 0) {
            var energy = Math.max(this.room.energyAvailable, 201);
            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

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
                    Memory.rooms[this.room.name].numberOfHarvesters++;
                }
            } else {
                Memory.rooms[this.room.name].numberOfHarvesters++;
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
        } else if (Memory.rooms[this.room.name].numberOfMiners < targetNumbers['miner']) {

            var body = createBody([MOVE, WORK, WORK, WORK, WORK, WORK, MOVE, CARRY], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'miner',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfMiners++;
            }
        } else if (Memory.rooms[this.room.name].numberOfHarvesters < targetNumbers['harvester']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'harvester',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfHarvesters++;
            }

        } else if (Memory.rooms[this.room.name].numberOfBuilders < targetNumbers['builder']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'builder',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfBuilders++;
            }
        } else if (Memory.rooms[this.room.name].numberOfUpgraders < targetNumbers['upgrader']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'upgrader',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfUpgraders++;
            }
        } else if (Memory.rooms[this.room.name].numberOfRepairers < targetNumbers['repairer']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'repairer',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfRepairers++;
            }
        } else if (Memory.rooms[this.room.name].numberOfWallRepairers < targetNumbers['wall_repairer']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'wallRepairer',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfWallRepairers++;
            }
        } else if (Memory.rooms[this.room.name].numberOfTransporters < targetNumbers['transporter'] && this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_STORAGE && s.isActive()
            })[0]) {

            var body = createBody([MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'transporter',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfTransporters++;
            }
        } else if (Memory.rooms[this.room.name].numberOfDistributors == 0 && this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_STORAGE
            })[0] &&
            this.pos.x == Memory.rooms[this.room.name].center[0] && this.pos.y+1 == Memory.rooms[this.room.name].center[1]) {

            var body = createBody([CARRY, WORK, CARRY, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'distributor',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [BOTTOM]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfDistributors++;
            }
        } else if (Memory.rooms[this.room.name].numberOfScouts < targetNumbers['scout']) {

            var body = createBody([MOVE, MOVE], energy);

            if (this.spawnCreep(body, Game.time, {
                    memory: {
                        role: 'scout',
                        home: this.room.name,
                        targetRoom: undefined
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfScouts++;
            }
        } else {
            for (let exitId in Memory.rooms[this.room.name].exits) {

                let exit = Memory.rooms[this.room.name].exits[exitId];

                if (Memory.rooms[exit] && !Memory.rooms[exit].enemies) {
                    let exit = Memory.rooms[this.room.name].exits[exitId];

                    if (Memory.myRooms.length < Game.gcl &&
                        !Memory.rooms[this.room.name].numberOfClaimers &&
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
                    } else if (Memory.myRooms.length >= Game.gcl &&
                        !Memory.rooms[this.room.name].numberOfClaimers &&
                        Memory.rooms[exit].hasController &&
                        Memory.rooms[exit].center &&
                        Memory.rooms[exit].center &&
                        energy > 1250 &&
                        (!Memory.rooms[exit].owner ||
                            (Memory.rooms[exit].owner &&
                                Memory.rooms[exit].owner.username != "Arkemenes"))) {

                        var body = createBody([MOVE, CLAIM, CLAIM], energy);
                        if (this.spawnCreep(body, Game.time, {
                            memory: {
                                role: 'claimer',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[this.room.name].numberOfClaimers++;
                            console.log('building new reserver from ' + this.room.name + ' to room ' + exit);
                        }
                        
                    }

                    if (Memory.rooms[exit].numberOfBuilders < 2 && Memory.rooms[exit].owner && Memory.rooms[exit].owner.username == "Arkemenes") {
                        var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

                        if (this.spawnCreep(body, Game.time, {
                            memory: {
                                role: 'builder',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[exit].numberOfBuilders++;
                        }
                    } else if (Memory.rooms[exit].numberOfHarvesters < 2 &&
                        (Memory.rooms[exit].owner && Memory.rooms[exit].owner.username == "Arkemenes" ||
                            Memory.rooms[exit].reservation && Memory.rooms[exit].reservation.username == "Arkemenes")) {
                        var body = createBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE], energy);

                        if (this.spawnCreep(body, Game.time, {
                            memory: {
                                role: 'harvester',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[exit].numberOfHarvesters++;
                        }

                    }

                }

            }
        }


    }



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