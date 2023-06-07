var miner = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (!creep.memory.target) {
            let sources = creep.room.find(FIND_SOURCES);
            for (const source of sources) {
                var miners = _.filter(
                    Game.creeps,
                    (creep) =>
                        creep.memory.target == source.id &&
                        creep.memory.role == "miner" &&
                        creep.room.name == creep.room.name
                );

                var workCount = 0;

                for (var i = 0; i < miners.length; i++) {
                    workCount += miners[i].body.filter(
                        (part) => part.type == WORK
                    ).length;
                }

                if (workCount < 2) {
                    creep.memory.target = source.id;
                    break;
                }
            }
        }

        if (
            creep.harvest(Game.getObjectById(creep.memory.target)) ==
            ERR_NOT_IN_RANGE
        ) {
            creep.moveTo(Game.getObjectById(creep.memory.target));
        }
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        var miners = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "miner" && creep.room.name == room.name
        );

        var workCount = 0;

        for (var i = 0; i < miners.length; i++) {
            var creep = miners[i];
            workCount += creep.body.filter((part) => part.type == WORK).length;
        }

        let wantedMinersWorkParts = 2 * room.find(FIND_SOURCES).length;

        if (workCount < wantedMinersWorkParts) {
            return true;
        }
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = "Miner" + Game.time;
        var extensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION },
        });

        var miners = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "miner" && creep.room.name == room.name
        );

        let body = [MOVE, WORK, WORK, WORK, WORK, WORK];
        if (
            extensions.length < 5 ||
            (miners.length == 0) & (room.energyAvailable == 300)
        ) {
            body = [MOVE, WORK, WORK];
        }

        let target = undefined; // the id of the source to harvest from. undefined means that there is no source to harvest from.
        let sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            var miners = _.filter(
                Game.creeps,
                (creep) =>
                    creep.memory.target == source.id &&
                    creep.memory.role == "miner" &&
                    creep.room.name == creep.room.name
            );

            var workCount = 0;

            for (var i = 0; i < miners.length; i++) {
                workCount += miners[i].body.filter(
                    (part) => part.type == WORK
                ).length;
            }

            if (workCount < 2) {
                target = source.id;
                break;
            }
        }

        let memory = { role: "miner", target: target };

        return { name, body, memory };
    },
};

module.exports = miner;
