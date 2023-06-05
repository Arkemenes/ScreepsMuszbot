var roleUpgrader = {
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
            if (
                creep.upgradeController(creep.room.controller) ==
                ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(creep.room.controller);
            }
        }
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        var upgraders = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "upgrader" && creep.room.name == room.name
        );

        if (upgraders.length < 2) {
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
