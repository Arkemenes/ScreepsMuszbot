function getIntel(room) {
    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    // If there is no info about the room, create a variable
    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }
    Memory.myRooms = _.filter(Game.rooms, (r) => {
        return r.controller && r.controller.my;
    });

    if (!Memory.rooms[room.name].exits) {
        Memory.rooms[room.name].exits = Game.map.describeExits(room.name);

        for (let exit in Memory.rooms[room.name].exits) {
            if (!Memory.rooms[Memory.rooms[room.name].exits[exit]]) {
                Memory.rooms[Memory.rooms[room.name].exits[exit]] = {};
            }
        }
    }

    if (Memory.rooms[room.name].sourceNumber == undefined) {
        Memory.rooms[room.name].sourceNumber = room.find(FIND_SOURCES).length;
    }

    if (Memory.rooms[room.name].mineral == undefined) {
        let mineral = room.find(FIND_MINERALS)[0];
        Memory.rooms[room.name].mineral = mineral ? mineral.mineralType : null;
    }

    if (Memory.rooms[room.name].hasController == undefined) {
        Memory.rooms[room.name].hasController = room.controller ? true : false;
    }

    Memory.rooms[room.name].reservation = room.controller
        ? room.controller.reservation
        : undefined;

    Memory.rooms[room.name].my = room.controller
        ? room.controller.my
        : undefined;

    Memory.rooms[room.name].owner = room.controller
        ? room.controller.owner
        : undefined;

    Memory.rooms[room.name].enemies = room.find(FIND_HOSTILE_CREEPS).length;

    Memory.rooms[room.name].enemyStructures = room.find(
        FIND_HOSTILE_STRUCTURES,
        { filter: (s) => s.structureType != STRUCTURE_POWER_BANK }
    ).length;

    Memory.rooms[room.name].lastVisit = Game.time;

    if (!Memory.rooms[room.name].builds) {
        Memory.rooms[room.name].builds = {};
    }

    Memory.rooms[room.name].numberOfDefenders = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "defender" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfHarvesters = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "harvester" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfUpgraders = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "upgrader" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfBuilders = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "builder" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfRepairers = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "repairer" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfWallRepairers = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "wallRepairer" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfMiners = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "miner" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfTransporters = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "transporter" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfLogistics = _.sum(
        Game.creeps,
        (c) => c.memory.role == "logistic" && c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfClaimers = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "claimer" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfScouts = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "scout" &&
            c.ticksToLive > 5 &&
            c.memory.home == room.name
    );

    Memory.rooms[room.name].numberOfLinks = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType == STRUCTURE_LINK,
    }).length;
    Memory.rooms[room.name].numberOfContainers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType == STRUCTURE_CONTAINER,
    }).length;

    Memory.rooms[room.name].numberOfTowers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType == STRUCTURE_TOWER,
    }).length;

    // Get terrain info only if it's not in memory and if it's mine
    if (
        Memory.rooms[room.name].terrainMatrix == undefined &&
        Memory.rooms[room.name].my
    ) {
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
