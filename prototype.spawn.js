Spawn.prototype.spawnCreepsIfNecessary =
    function () {

        // If busy, there is nothing to do
        if (this.spawning) {
            return;
        }

        // the number of miners is set as the number of containers
        let targetNumbers = {}
        targetNumbers['miner'] = Memory.rooms[this.room.name].numberOfContainers;

        // The number of each worker is set depending on the number os sources in this room and the controller level
        switch (this.room.controller.level) {
            case 1:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(3 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 2:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(3 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 3:
                targetNumbers['harvester'] = Math.ceil(3 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(9 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 4:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 5:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;

            case 6:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;

            case 7:
                targetNumbers['harvester'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;

            case 8:
                targetNumbers['harvester'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['brusiers'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            default:
                break;
        }

        if (Memory.rooms[this.room.name].numberOfHarvesters == 0) {

            // If there is no available harvester in this room, try to create a new one
            var energy = Math.max(this.room.energyAvailable, 201);
            var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

            if (this.spawnCreep(body, 'h' + Game.time, {  memory: {role: 'harvester', home: this.room.name, targetRoom: this.room.name },
                                                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]}) != 0) {

                // if the spawn has failed, transform a valid creep on harvester
                let newHarvester = this.room.find(FIND_MY_CREEPS, {
                                                filter: (creep) =>  creep.memory.role != 'distributor' &&
                                                                    creep.memory.role != 'miner' &&
                                                                    creep.memory.role != 'scout' &&
                                                                    creep.memory.role != 'transporter'})[0];
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
            var energy = Math.min(Math.max(this.room.energyAvailable, 250),0.7 * this.room.energyCapacityAvailable);
        }

        // If there is an enemy in map, spawn brusiers
        if (Memory.rooms[this.room.name] && Memory.rooms[this.room.name].numberOfBrusiers < Math.min(5,Memory.rooms[this.room.name].enemies)) {
            var body = createBody([ATTACK, MOVE, ATTACK, MOVE, CARRY, WORK, MOVE, ATTACK, MOVE, ATTACK, ATTACK], energy);

            if (this.spawnCreep(body, 'B' + Game.time, {
                memory: {
                    role: 'brusier',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            }) == 0) {
                Memory.rooms[this.room.name].numberOfBrusiers++;
            }
        }


        // If there is a dying creep that is fully created, renew it
        let dyingCreep = this.pos.findInRange(FIND_MY_CREEPS, 1, {
            filter: (c) => c.ticksToLive <= 300 &&
                (c.body.length >= 33 ||
                    (c.getActiveBodyparts(MOVE) == 0 &&
                        c.getActiveBodyparts(CARRY) >= 16))})[0];

        if (dyingCreep && this.room.energyAvailable >= 0.8 * this.room.energyCapacityAvailable) {
            this.renewCreep(dyingCreep);
        } 
        // If there is less miners than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfMiners < targetNumbers['miner']) {

            var body = createBody([MOVE, WORK, WORK, WORK, WORK, WORK, MOVE], energy);

            if (this.spawnCreep(body, 'm' + Game.time, {
                    memory: {
                        role: 'miner',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfMiners++;
            }
        } 
        
        // If there is less harvesters than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfHarvesters < targetNumbers['harvester']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

            if (this.spawnCreep(body, 'h' + Game.time, {
                    memory: {
                        role: 'harvester',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfHarvesters++;
            }

        }
        
        // If there is less builders than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfBuilders < targetNumbers['builder']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

            if (this.spawnCreep(body, 'b' + Game.time, {
                    memory: {
                        role: 'builder',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfBuilders++;
            }
        } 
        
        // If there is less upgraders than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfUpgraders < targetNumbers['upgrader']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

            if (this.spawnCreep(body, 'u' + Game.time, {
                    memory: {
                        role: 'upgrader',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfUpgraders++;
            }
        } 
        
        // If there is less repairers than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfRepairers < targetNumbers['repairer']) {
            var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);
            if (this.spawnCreep(body, 'r' + Game.time, {
                    memory: {
                        role: 'repairer',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfRepairers++;
            }
        }

        // If there is less wall repairers than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfWallRepairers < targetNumbers['wall_repairer']) {

            var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

            if (this.spawnCreep(body, 'w' + Game.time, {
                    memory: {
                        role: 'wallRepairer',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfWallRepairers++;
            }
        } 

        // If there is less brusiers than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfBrusiers < targetNumbers['brusiers'] && energy > 410) {

        var body = createBody([ATTACK, MOVE, ATTACK, MOVE, CARRY, WORK, MOVE, ATTACK, MOVE, ATTACK, ATTACK], energy);

        if (this.spawnCreep(body, 'B' + Game.time, {
                memory: {
                    role: 'brusier',
                    home: this.room.name,
                    targetRoom: this.room.name
                },
                directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
            }) == 0) {
            Memory.rooms[this.room.name].numberOfBrusiers++;
        }
    }
        
        // If there is less transporters than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfTransporters < targetNumbers['transporter'] && this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_STORAGE && s.isActive()
            })[0]) {

            var body = createBody([MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

            if (this.spawnCreep(body, 't' + Game.time, {
                    memory: {
                        role: 'transporter',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfTransporters++;
            }
        } 
        
        // If there is no distributors and the room have a storage and the spawn is above center, create a new one
        else if (Memory.rooms[this.room.name].numberOfDistributors == 0 && Memory.rooms[this.room.name].numberOfLinks &&
            this.pos.x == Memory.rooms[this.room.name].center[0] && this.pos.y+1 == Memory.rooms[this.room.name].center[1]) {
            var body = createBody([CARRY, WORK, CARRY, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);
            if (this.spawnCreep(body, 'd' + Game.time, {
                    memory: {
                        role: 'distributor',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [BOTTOM]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfDistributors++;
            }
        } 
        
        // If there is less scouts than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfScouts < targetNumbers['scout']) {

            var body = createBody([MOVE, MOVE], energy);

            if (this.spawnCreep(body, 's' + Game.time, {
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

            Memory.rooms[this.room.name].exits = _.sortBy(Memory.rooms[this.room.name].exits, e => (Memory.rooms[e] && Memory.rooms[e].sourceNumber) ? Memory.rooms[e].sourceNumber : 0).reverse();
            // If the room has all the workers, create workers for nearby rooms
            for (let exitId in Memory.rooms[this.room.name].exits) {

                let exit = Memory.rooms[this.room.name].exits[exitId];

                if (Memory.rooms[exit] && Memory.rooms[exit].numberOfBrusiers < Math.max(Memory.rooms[exit].enemies, Memory.rooms[exit].enemyStructures)) {
                    var body = createBody([ATTACK, MOVE, ATTACK, MOVE, CARRY, WORK, MOVE, ATTACK, MOVE, ATTACK, ATTACK], energy);

                    if (this.spawnCreep(body, 'B' + Game.time, {
                        memory: {
                            role: 'brusier',
                            home: this.room.name,
                            targetRoom: exit
                        },
                        directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                    }) == 0) {
                        Memory.rooms[exit].numberOfBrusiers++;
                    }
                }

                // Only create long distance workers if there is no enemies on that room
                else if (Memory.rooms[exit] && !Memory.rooms[exit].owner) {
                    let exit = Memory.rooms[this.room.name].exits[exitId];

                    // If the room is mine and has less than 1 and has a construction site, create a remote one
                    if (Memory.rooms[exit].numberOfBuilders < 1 && Game.rooms[exit] && Game.rooms[exit].find(FIND_CONSTRUCTION_SITES)[0]) {
                        var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

                        if (this.spawnCreep(body, 'b' + Game.time, {
                            memory: {
                                role: 'builder',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[exit].numberOfBuilders++;
                        }
                    } 
                    
                    // If the room is mine or reserved for me and has less than source number, create a remote one
                    else if (Memory.rooms[exit].numberOfHarvesters < Memory.rooms[exit].sourceNumber - Memory.rooms[exit].numberOfMiners) {
                        var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

                        if (this.spawnCreep(body, 'h' + Game.time, {
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

                    // If the room is mine and has less than 1 and has a construction site, create a remote one
                    else if (Memory.rooms[exit].numberOfRepairers < Memory.rooms[exit].sourceNumber && Game.rooms[exit] && 
                            (Game.rooms[exit].find(FIND_STRUCTURES, {filter : (s) => s.my || !s.owner })[0])) {
                        var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

                        if (this.spawnCreep(body, 'r' + Game.time, {
                            memory: {
                                role: 'repairer',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[exit].numberOfRepairers++;
                        }
                    } 

                    // If the room is mine and has less miners than containers, create a remote one
                    else if (Memory.rooms[exit].numberOfMiners < Memory.rooms[exit].numberOfContainers) {
                        var body = createBody([MOVE, WORK, WORK, WORK, MOVE], energy);

                        if (this.spawnCreep(body, 'm' + Game.time, {
                            memory: {
                                role: 'miner',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[exit].numberOfMiners++;
                        }
                    } 

                    // If the room is mine and has less transporters than containers, create a remote one
                    if (Memory.rooms[exit].numberOfTransporters < Memory.rooms[exit].numberOfMiners * 2 && Game.rooms[this.room.name].storage) {
                        var body = createBody([MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);

                        if (this.spawnCreep(body, 't' + Game.time, {
                            memory: {
                                role: 'transporter',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[exit].numberOfTransporters++;
                        }
                    } 

                    // If can claim that room, create a claimer
                    else if (Memory.myRooms.length < Game.gcl &&
                        !Memory.rooms[exit].numberOfClaimers &&
                        Memory.rooms[exit].hasController &&
                        Memory.rooms[exit].center &&
                        energy > 800 &&
                        (!Memory.rooms[exit].owner ||
                            (Memory.rooms[exit].owner &&
                                Memory.rooms[exit].owner.username != "Arkemenes"))) {

                        var body = createBody([MOVE, CLAIM, WORK, CARRY, WORK, CARRY, WORK, CARRY, WORK, CARRY], energy);
                        this.spawnCreep(body, 'c' + Game.time, {
                            memory: {
                                role: 'claimer',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        });
                        Memory.rooms[exit].numberOfClaimers++;
                        console.log('building new claimer from ' + this.room.name + ' to room ' + exit)
                    } 
                    
                    // If cannot claim that room, but can reserve it, also create a claimer
                    else if (!Memory.rooms[exit].numberOfClaimers &&
                                Memory.rooms[exit].hasController &&
                                !Memory.rooms[exit].my &&
                                this.room.energyAvailable > 1300) {

                        var body = createBody([MOVE, CLAIM, CLAIM], energy);
                        if (this.spawnCreep(body, 'r' + Game.time, {
                            memory: {
                                role: 'claimer',
                                home: this.room.name,
                                targetRoom: exit
                            },
                            directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                        }) == 0) {
                            Memory.rooms[exit].numberOfClaimers++;
                            console.log('building new reserver from ' + this.room.name + ' to room ' + exit);
                        }
                        
                    }

                }

            }
        }
            
        // if there is nothing more to build and has left energy on containers, build another upgrader
        if (!this.spawning &&
            this.room.energyAvailable > 0.9 * this.room.energyCapacityAvailable &&
             _.sum(this.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_STORAGE}), (s) => s.store.energy > 1000 * Memory.rooms[this.room.name].sourceNumber)) {

            var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);

            if (this.spawnCreep(body, 'u' + Game.time, {
                    memory: {
                        role: 'upgrader',
                        home: this.room.name,
                        targetRoom: this.room.name
                    },
                    directions: [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT]
                }) == 0) {
                Memory.rooms[this.room.name].numberOfUpgraders++;
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