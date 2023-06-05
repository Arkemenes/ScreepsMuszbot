var harvester = {
    /** @param {Creep} creep **/
    run: function (creep) {
        // Get Energy
        if (creep.store[RESOURCE_ENERGY] == 0) {
            var resource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r) => r.energy >= 50,
            });
            if (resource) {
                if (creep.pickup(resource) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(resource);
                }
            } else {
                target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: (s) =>
                        (s.structureType == STRUCTURE_STORAGE ||
                            s.structureType == STRUCTURE_CONTAINER ||
                            (s.structureType == STRUCTURE_LINK &&
                                !s.isCollector())) &&
                        s.store.energy >= 50,
                });
                if (
                    creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(resource);
                }
            }
        }
        // Spend Energy
        else {
            if (!creep.memory.target) {
                let target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: (s) =>
                        (s.structureType == STRUCTURE_SPAWN ||
                            s.structureType == STRUCTURE_EXTENSION) &&
                        s.energy < s.energyCapacity,
                });

                if (!target) {
                    target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) =>
                            s.structureType == STRUCTURE_TOWER &&
                            !Memory.rooms[creep.room.name].numberOfLogistics &&
                            s.energy <= s.energyCapacity * 0.95,
                    });
                }

                if (!target) {
                    target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) =>
                            s.structureType == STRUCTURE_STORAGE &&
                            s.energy < s.energyCapacity,
                    });
                }
                if (!target) {
                    target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) =>
                            s.structureType == STRUCTURE_LAB &&
                            s.energy < s.energyCapacity,
                    });
                }

                if (target) {
                    creep.memory.target = target.id;
                }
            }

            if (creep.memory.target) {
                const status = creep.transfer(
                    Game.getObjectById(creep.memory.target),
                    RESOURCE_ENERGY
                );
                if (status == ERR_NOT_IN_RANGE) {
                    creep.moveTo(Game.getObjectById(creep.memory.target));
                } else if (status != OK) {
                    creep.memory.target = null;
                    // creep.say("💤");
                } else {
                    // creep.say("~Pew!~");
                }
            }
        }
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        var harvesters = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "harvester" && creep.room.name == room.name
        );

        if (harvesters.length < 2) {
            return true;
        }
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = "Harvester" + Game.time;
        let body = [WORK, CARRY, MOVE];
        let memory = { role: "harvester" };

        return { name, body, memory };
    },
};

module.exports = harvester;
