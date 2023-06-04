function getIntel(room) {
    if (Memory.rooms == undefined) {
        Memory.rooms = {};
    }
    // If there is no info about the room, create a variable
    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }
    Memory.myRooms = _.filter(Game.rooms, (r) => {
        return r.controller && r.controller.my;
    });

    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    for (let roomName in Game.rooms) {
        let room = Game.rooms[roomName];
        if (!Memory.rooms[roomName]) {
            Memory.rooms[roomName] = {};
        }

        if (!Memory.rooms[roomName].exits) {
            Memory.rooms[roomName].exits = Game.map.describeExits(roomName);
            // Memory.rooms[roomName].exits = _.sortBy(
            //     Memory.rooms[roomName].exits,
            //     (e) =>
            //         Memory.rooms[e] && Memory.rooms[e].sourceNumber
            //             ? Memory.rooms[e].sourceNumber
            //             : 0
            // ).reverse();

            for (let exit in Memory.rooms[roomName].exits) {
                console.log(Memory.rooms[roomName].exits[exit]);
                if (!Memory.rooms[Memory.rooms[roomName].exits[exit]]) {
                    Memory.rooms[Memory.rooms[roomName].exits[exit]] = {};
                    console.log(
                        Memory.rooms[roomName].exits[
                            Memory.rooms[roomName].exits
                        ]
                    );
                }
            }
        }

        if (Memory.rooms[roomName].sourceNumber == undefined) {
            Memory.rooms[roomName].sourceNumber =
                room.find(FIND_SOURCES).length;
        }

        if (Memory.rooms[roomName].mineral == undefined) {
            let mineral = room.find(FIND_MINERALS)[0];
            Memory.rooms[roomName].mineral = mineral
                ? mineral.mineralType
                : null;
        }

        if (Memory.rooms[roomName].hasController == undefined) {
            Memory.rooms[roomName].hasController = room.controller
                ? true
                : false;
        }

        Memory.rooms[roomName].reservation = room.controller
            ? room.controller.reservation
            : undefined;

        Memory.rooms[roomName].my = room.controller
            ? room.controller.my
            : undefined;

        Memory.rooms[roomName].owner = room.controller
            ? room.controller.owner
            : undefined;

        Memory.rooms[roomName].enemies = room.find(FIND_HOSTILE_CREEPS).length;

        Memory.rooms[roomName].enemyStructures = room.find(
            FIND_HOSTILE_STRUCTURES,
            { filter: (s) => s.structureType != STRUCTURE_POWER_BANK }
        ).length;

        Memory.rooms[roomName].lastVisit = Game.time;

        if (!Memory.rooms[roomName].builds) {
            Memory.rooms[roomName].builds = {};
        }

        if (room.controller) {
            Memory.rooms[roomName].numberOfDefenders = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "defender" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfHarvesters = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "harvester" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfUpgraders = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "upgrader" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfBuilders = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "builder" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfRepairers = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "repairer" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfWallRepairers = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "wallRepairer" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfMiners = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "miner" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfTransporters = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "transporter" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfLogistics = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "logistic" &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfClaimers = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "claimer" &&
                    c.ticksToLive > 5 &&
                    c.memory.targetRoom == room.name
            );
            Memory.rooms[roomName].numberOfScouts = _.sum(
                Game.creeps,
                (c) =>
                    c.memory.role == "scout" &&
                    c.ticksToLive > 5 &&
                    c.memory.home == room.name
            );

            Memory.rooms[roomName].numberOfLinks = room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_LINK,
            }).length;
            Memory.rooms[roomName].numberOfContainers = room.find(
                FIND_STRUCTURES,
                { filter: (s) => s.structureType == STRUCTURE_CONTAINER }
            ).length;

            Memory.rooms[roomName].numberOfTowers = room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_TOWER,
            }).length;
        }
    }

    // Get terrain info only if it's not in memory
    if (Memory.rooms[room.name].terrainMatrix == undefined) {
        console.log("Calculationg terrain matrix for room", room.name);
        const terrain = new Room.Terrain(room.name);
        const terrainMatrix = [];
        const walkMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            terrainMatrix[x] = [];
            walkMatrix[x] = [];
            for (let y = 0; y < 50; y++) {
                const terrainType = terrain.get(x, y);
                terrainMatrix[x][y] = terrainType;
                if (terrainType == TERRAIN_MASK_WALL) {
                    walkMatrix.set(x, y, 255);
                }
            }
        }
        Memory.rooms[room.name].terrainMatrix = terrainMatrix;
        Memory.rooms[room.name].walkMatrix = walkMatrix;
    }
}

module.exports = getIntel;
