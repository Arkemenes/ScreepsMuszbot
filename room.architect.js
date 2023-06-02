let layoutKey = {
    A: STRUCTURE_SPAWN,
    N: STRUCTURE_NUKER,
    K: STRUCTURE_LINK,
    L: STRUCTURE_LAB,
    E: STRUCTURE_EXTENSION,
    S: STRUCTURE_STORAGE,
    T: STRUCTURE_TOWER,
    O: STRUCTURE_OBSERVER,
    M: STRUCTURE_TERMINAL,
    P: STRUCTURE_POWER_SPAWN,
    ".": STRUCTURE_ROAD,
    C: STRUCTURE_CONTAINER,
    R: STRUCTURE_RAMPART,
    W: STRUCTURE_WALL,
    F: STRUCTURE_FACTORY,
};
_.merge(layoutKey, _.invert(layoutKey));

const coreStamp = [
    " ...   ",
    ".EEK.. ",
    ".E AEE.",
    ".EES E.",
    " ..EEE.",
    "   ... ",
];
const spawnStamp = [
    " ...   ",
    ".EEK.. ",
    ".E AEE.",
    ".EEC E.",
    " ..EEE.",
    "   ... ",
];
const anchorStamp = ["  .  ", " .N. ", ".OPF.", " .M. ", "  .  "];
const containerStamp = ["  .  ", " .E. ", ".EEE.", " .E. ", "  .  "];
const labStamp = ["  ..  ", " .LL. ", ".LL.L.", ".L.LL.", " .LL. ", "  ..  "];
const microStamp = [" . ", ".E.", " . "];
// {
//     structures: ["EFMN.", "E P.O", "ESAEE", "E C E", "EELEE"],
//     rcl: ["111  ", "1 111", "111 1", " 1111"],
// };

const roomDimensions = 50;

function planCity(room) {
    const roomName = room.name;

    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }

    // if (Memory.rooms[room.name].planStep == 8) {
    //     visualizeStructures(Memory.rooms[roomName].buildings);
    //     return;
    // }

    const exits = getAllExitCoordinates(roomName);
    const floodFillMatrix = room.floodFill(exits);

    if (Memory.rooms[room.name].planStep == undefined) {
        Memory.rooms[roomName].buildings = [];
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(getContainerLocations(roomName));
        Memory.rooms[roomName].planStep = 1;
    } else if (Memory.rooms[room.name].planStep == 1) {
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, anchorStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 2;
    } else if (Memory.rooms[room.name].planStep == 2) {
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, coreStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 3;
    } else if (Memory.rooms[room.name].planStep == 3) {
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, spawnStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 4;
    } else if (Memory.rooms[room.name].planStep == 4) {
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, spawnStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 5;
    } else if (Memory.rooms[room.name].planStep == 5) {
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, labStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 6;
    } else if (Memory.rooms[room.name].planStep == 6) {
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, microStamp, floodFillMatrix)
        );

        const countExtensions = Memory.rooms[roomName].buildings.filter(
            (building) => building.structureType === STRUCTURE_EXTENSION
        ).length;

        if (countExtensions == 60) {
            Memory.rooms[roomName].planStep = 7;
        }
    }

    visualizeStructures(Memory.rooms[roomName].buildings);
    // First plan the Container locations

    // console.log(JSON.stringify(stampLocation));

    // visualizeStamp(roomName, coreStamp, stampLocation);

    // console.log(JSON.stringify(stampLocation));
}

function getContainerLocations(roomName) {
    let sources = Game.rooms[roomName].find(FIND_SOURCES);

    const locations = [];
    for (let sourceName in sources) {
        let locationFound = false;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                let coordX = sources[sourceName].pos.x + i;
                let coordY = sources[sourceName].pos.y + j;

                if (locationFound) {
                    break;
                } else if (
                    Memory.rooms[roomName].terrainMatrix[coordX][coordY] !=
                        TERRAIN_MASK_WALL &&
                    !Game.rooms[roomName].find(FIND_STRUCTURES, {
                        filter: (s) =>
                            s.pos &&
                            s.pos.x == coordX &&
                            s.pos.y == coordY &&
                            s.structureType != STRUCTURE_CONTAINER &&
                            s.structureType != STRUCTURE_ROAD,
                    })[0] &&
                    (i != 0 || j != 0)
                ) {
                    locations.push({
                        x: coordX,
                        y: coordY,
                        structureType: STRUCTURE_CONTAINER,
                        minimalRCL: 0,
                    });
                    locationFound = true;
                }
            }
        }
    }

    // TODO: add container for extractor

    return locations;
}

function findStampLocation(roomName, stamp, floodFillMatrix) {
    const room = Game.rooms[roomName];

    if (!room) {
        console.log(`Room ${roomName} not found.`);
        return [];
    }

    const terrainMatrix = Memory.rooms[room.name].terrainMatrix;
    const stampHeight = stamp.length;
    const stampWidth = stamp[0].length;

    let bestVal = -1;
    let bestAdjacenRoads = -1;
    let buildings = [];

    for (let coordX = 1; coordX < 50 - stampWidth; coordX++) {
        for (let coordY = 1; coordY < 50 - stampHeight; coordY++) {
            let isValid = true;

            let value = 0;
            let adjacentRoads = 0;
            let tmp_buildings = [];

            for (let stampY = 0; stampY < stampHeight; stampY++) {
                for (let stampX = 0; stampX < stampWidth; stampX++) {
                    if (
                        stamp[stampY][stampX] !== " " &&
                        terrainMatrix[coordX + stampX][coordY + stampY] ===
                            TERRAIN_MASK_WALL
                    ) {
                        isValid = false;
                        break;
                    } else if (
                        Memory.rooms[room.name].buildings.some(
                            ({ x, y, structureType }) =>
                                x === coordX + stampX &&
                                y === coordY + stampY &&
                                stamp[stampY][stampX] != " " &&
                                !(
                                    structureType == STRUCTURE_ROAD &&
                                    stamp[stampY][stampX] == "."
                                )
                        )
                    ) {
                        isValid = false;
                        break;
                    }

                    value += floodFillMatrix.get(coordX, coordY);

                    if (
                        stamp[stampY][stampX] == "." &&
                        Memory.rooms[roomName].buildings.some(
                            (building) =>
                                building.x === coordX + stampX &&
                                building.y === coordY + stampY &&
                                building.structureType === STRUCTURE_ROAD
                        )
                    ) {
                        adjacentRoads += 1;
                    }

                    if (
                        stamp[stampY][stampX] !== " " &&
                        !Memory.rooms[room.name].buildings.some(
                            ({ x, y, structureType }) =>
                                x === coordX + stampX &&
                                y === coordY + stampY &&
                                structureType ==
                                    layoutKey[stamp[stampY][stampX]]
                        )
                    ) {
                        tmp_buildings.push({
                            x: coordX + stampX,
                            y: coordY + stampY,
                            structureType: layoutKey[stamp[stampY][stampX]],
                            // TODO: Ajustar
                            minimalRCL: 0,
                        });
                    }
                }
                if (!isValid) {
                    break;
                }
            }

            if (isValid && adjacentRoads > 0) {
                console.log("valid", adjacentRoads);
            }
            if (
                isValid &&
                (adjacentRoads > bestAdjacenRoads ||
                    (value > bestVal && adjacentRoads == bestAdjacenRoads))
            ) {
                let x = coordX;
                let y = coordY;
                bestVal = value;
                bestAdjacenRoads = adjacentRoads;
                buildings = tmp_buildings;
            }
        }
    }

    return buildings;
}

function getAllExitCoordinates(roomName) {
    const exits = [];
    const terrain = Game.map.getRoomTerrain(roomName);

    // Check top edge
    for (let x = 0; x < 50; x++) {
        if (terrain.get(x, 0) !== TERRAIN_MASK_WALL) {
            exits.push({ x: x, y: 0 });
        }
    }

    // Check bottom edge
    for (let x = 0; x < 50; x++) {
        if (terrain.get(x, 49) !== TERRAIN_MASK_WALL) {
            exits.push({ x: x, y: 49 });
        }
    }

    // Check left edge
    for (let y = 1; y < 49; y++) {
        if (terrain.get(0, y) !== TERRAIN_MASK_WALL) {
            exits.push({ x: 0, y: y });
        }
    }

    // Check right edge
    for (let y = 1; y < 49; y++) {
        if (terrain.get(49, y) !== TERRAIN_MASK_WALL) {
            exits.push({ x: 49, y: y });
        }
    }

    return exits;
}

function visualizeStructures(structures) {
    const roomVisual = new RoomVisual();

    for (const structure of structures) {
        const { x, y, structureType } = structure;

        roomVisual.structure(x, y, structureType, {
            opacity: 0.8,
        });
    }
}

module.exports = planCity;
