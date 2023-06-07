var builder = {
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
                creep.memory.target = creep.pos.findClosestByPath(
                    FIND_STRUCTURES,
                    {
                        filter: (s) =>
                            (s.structureType == STRUCTURE_STORAGE ||
                                s.structureType == STRUCTURE_CONTAINER) &&
                            s.store.energy >= 50,
                    }
                );
                creep.say(creep.memory.target);
                if (
                    creep.withdraw(creep.memory.target, RESOURCE_ENERGY) ==
                    ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(creep.memory.target);
                }
            }
        }
        // Spend Energy
        else {
            if (!creep.memory.target) {
                let repairTargets = creep.room.find(FIND_STRUCTURES, {
                    filter: (s) =>
                        s.structureType != STRUCTURE_CONTROLLER &&
                        s.structureType != STRUCTURE_WALL &&
                        s.hits < s.hitsMax &&
                        (s.structureType != STRUCTURE_RAMPART ||
                            s.hits < 0.05 * s.hitsMax),
                });

                if (repairTargets.length) {
                    repairTargets = _.sortBy(
                        repairTargets,
                        (s) => s.hits / s.hitsMax
                    );
                    var target = repairTargets[0];
                } else {
                    var target = creep.pos.findClosestByPath(
                        FIND_MY_CONSTRUCTION_SITES
                    );
                }

                if (target) {
                    creep.memory.target = target.id;
                }
            }

            if (creep.memory.target) {
                const targetObj = Game.getObjectById(creep.memory.target);

                if (targetObj) {
                    if (targetObj.progressTotal) {
                        var status = creep.build(
                            Game.getObjectById(creep.memory.target)
                        );
                    } else {
                        var status = creep.repair(
                            Game.getObjectById(creep.memory.target)
                        );
                    }

                    if (status == ERR_NOT_IN_RANGE) {
                        creep.moveTo(Game.getObjectById(creep.memory.target));
                    } else if (status != OK) {
                        creep.memory.target = null;
                    } else {
                        creep.say("~Pew!~");
                    }
                }
            }
        }
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        var builders = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "builder" && creep.room.name == room.name
        );
        var constructionSites = _.filter(
            Game.constructionSites,
            (cs) => cs.room.name == room.name
        ).length;

        const wantedBuilders = Math.ceil(constructionSites / 5);

        if (builders.length < wantedBuilders) {
            return true;
        }
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = "builder" + Game.time;
        let body = [WORK, CARRY, MOVE];
        let memory = { role: "builder" };

        return { name, body, memory };
    },
};

module.exports = builder;
