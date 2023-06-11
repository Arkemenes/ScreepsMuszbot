var builder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.invokeState()) {
            return;
        }

        // Get Energy
        if (creep.store[RESOURCE_ENERGY] == 0) {
            let resource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r) => r.energy >= 50,
            });
            if (resource) {
                creep.pushState("GetEnergy", resource.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let structure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) =>
                    (s.structureType == STRUCTURE_STORAGE ||
                        s.structureType == STRUCTURE_CONTAINER) &&
                    s.store.energy >= 50,
            });

            if (structure) {
                creep.pushState("GetEnergy", structure.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            // creep.say("zzz");
            return;
        }
        // Spend Energy
        else {
            let repairTargets = creep.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.structureType != STRUCTURE_CONTROLLER &&
                    s.structureType != STRUCTURE_WALL &&
                    s.hits < s.hitsMax &&
                    (s.structureType != STRUCTURE_RAMPART ||
                        s.hits < 0.01 * s.hitsMax),
            });

            if (repairTargets.length) {
                repairTargets = _.sortBy(
                    repairTargets,
                    (s) => s.hits / s.hitsMax
                );

                var repairTarget = repairTargets[0];

                if (repairTargets[0].hits / repairTargets[0].hitsMax < 0.3) {
                    creep.pushState("Build", repairTarget.id);
                    if (!creep.invokeState()) {
                        creep.say("zzz");
                    }
                    return;
                }
            }

            var targetConstructionSite = creep.pos.findClosestByPath(
                FIND_MY_CONSTRUCTION_SITES
            );

            if (targetConstructionSite) {
                creep.pushState("Build", targetConstructionSite.id);
                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            if (repairTarget) {
                creep.pushState("Build", repairTarget.id);
                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let damagedRamparts = creep.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.hits < s.hitsMax && s.structureType == STRUCTURE_RAMPART,
            });

            if (damagedRamparts.length) {
                damagedRamparts = _.sortBy(
                    damagedRamparts,
                    (s) => s.hits / s.hitsMax
                );

                creep.pushState("Build", damagedRamparts[0].id);
                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let controller = creep.room.controller;

            creep.pushState("Upgrade", controller.id);

            if (!creep.invokeState()) {
                creep.say("zzz");
                return;
            }

            creep.say("zzz");
            return;
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

        const wantedBuilders = 2; // Math.ceil(constructionSites / 5);

        if (builders.length < wantedBuilders) {
            return true;
        }
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = "Builder" + Game.time;
        let body = [WORK, CARRY, MOVE];
        let memory = { role: "builder" };

        return { name, body, memory };
    },
};

module.exports = builder;
