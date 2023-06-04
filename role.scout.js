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
            let targetRooms = Object.values(
                Memory.rooms[creep.room.name].exits
            );

            const targetRoom = targetRooms.sort((value1, value2) => {
                const lastVisit1 = Memory.rooms[value1]
                    ? Memory.rooms[value1].lastVisit
                    : 0;
                const lastVisit2 = Memory.rooms[value2]
                    ? Memory.rooms[value2].lastVisit
                    : 0;

                return lastVisit2 - lastVisit1;
            })[0];
            creep.memory.targetRoom = targetRoom;
            const exitDirection = Game.map.findExit(creep.room, targetRoom);
            const exitTile = creep.pos.findClosestByRange(exitDirection);

            if (creep.moveTo(exitTile) == 0) {
                creep.memory.target = exitTile;
                return true;
            }

            // creep.say(JSON.stringify(targetRooms));
            // console.log(JSON.stringify(targetRooms));

            // for (let targetRoomName of targetRooms) {
            //     const targetRoom = targetRooms[targetRoomName];
            //     creep.memory.targetRoom = targetRoom;

            //     let exitDir = Game.map.findExit(
            //         creep.room.name,
            //         creep.memory.targetRoom
            //     );

            // }
        }
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        var scouts = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "scout" && creep.memory.room == room.name
        );

        if (scouts.length < 0) {
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
