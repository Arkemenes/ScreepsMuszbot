var harvester = {
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
            // here is the sayHello() prototype
            creep.sayHello();

            if (
                creep.transfer(Game.spawns["Spawn1"], RESOURCE_ENERGY) ==
                ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(Game.spawns["Spawn1"]);
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
