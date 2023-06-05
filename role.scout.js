var scout = {
    /** @param {Creep} creep **/
    run: function (creep) {
        creep.say(creep.memory.targetRoom);
        if (!Memory.rooms[creep.room.name]) {
            Memory.rooms[creep.room.name] = {};
        }
        if (
            creep.memory.targetRoom &&
            creep.memory.targetRoom != creep.room.name &&
            creep.memory.target
        ) {
            if (
                creep.moveTo(
                    creep.memory.target.x,
                    creep.memory.target.y,
                    creep.memory.targetRoom
                ) == 0
            ) {
                return true;
            } else {
                creep.memory.targetRoom = undefined;
                creep.memory.target = undefined;
            }
        }

        if (
            !creep.memory.targetRoom ||
            creep.memory.targetRoom == creep.room.name ||
            !creep.memory.target
        ) {
            let minLastVisit = Infinity;
            let targetRoom = null;

            for (const roomName of Object.values(
                Memory.rooms[creep.room.name].exits
            )) {
                if (
                    !Memory.rooms[roomName] ||
                    !Memory.rooms[roomName].lastVisit
                ) {
                    // If the room doesn't exist in Memory or doesn't have lastVisit value
                    targetRoom = roomName;
                    console.log("kkkkk", roomName);
                    break;
                }

                const lastVisit = Memory.rooms[roomName].lastVisit;
                if (lastVisit < minLastVisit) {
                    minLastVisit = lastVisit;
                    targetRoom = roomName;
                }
            }

            creep.memory.targetRoom = targetRoom;
            const exitDirection = Game.map.findExit(creep.room, targetRoom);
            const exitTile = creep.pos.findClosestByRange(exitDirection);

            if (creep.moveTo(exitTile) == 0) {
                creep.memory.target = exitTile;
                return true;
            }

            creep.memory.target = undefined;
            creep.memory.targetRoom = undefined;
        }
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        var scouts = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "scout" && creep.memory.room == room.name
        );

        if (scouts.length < 1) {
            return true;
        }
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = "Scout" + Game.time;
        let body = [MOVE, MOVE];
        let memory = {
            role: "scout",
            targetRoom: undefined,
            target: undefined,
            room: room.name,
        };

        return { name, body, memory };
    },
};

module.exports = scout;
