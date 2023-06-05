var builder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.store[RESOURCE_ENERGY] == 0) {
            var resource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r) => r.energy > 20,
            });
            if (creep.pickup(resource) == ERR_NOT_IN_RANGE) {
                creep.moveTo(resource);
            }
        } else {
            if (creep.memory.target) {
                const status = creep.build(
                    Game.getObjectById(creep.memory.target)
                );
                if (status == ERR_NOT_IN_RANGE) {
                    creep.moveTo(Game.getObjectById(creep.memory.target));
                } else if (status != OK) {
                    creep.memory.target = null;
                }
            }

            if (!creep.memory.target) {
                creep.memory.target = creep.pos.findClosestByPath(
                    FIND_CONSTRUCTION_SITES
                );
                if (creep.memory.target) {
                    creep.memory.target = creep.memory.target.id;
                } else {
                    creep.say("💤");
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
