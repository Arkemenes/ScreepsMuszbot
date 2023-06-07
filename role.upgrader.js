var roleUpgrader = {
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
        var upgraders = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "upgrader" && creep.room.name == room.name
        );

        if (upgraders.length < 5) {
            return true;
        }
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = "Upgrader" + Game.time;
        let body = [WORK, CARRY, MOVE];
        let memory = { role: "upgrader" };

        return { name, body, memory };
    },
};

module.exports = roleUpgrader;
