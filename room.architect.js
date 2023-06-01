layoutKey = {
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
    " ....  ",
    ".EFMN. ",
    ".E P.O.",
    ".ESAEE.",
    ".E C E.",
    ".EELEE.",
    " ..... ",
];
// {
//     structures: ["EFMN.", "E P.O", "ESAEE", "E C E", "EELEE"],
//     rcl: ["111  ", "1 111", "111 1", " 1111"],
// };
const spawnStamp = [
    " ...   ",
    ".EEL.. ",
    ".E AEE.",
    ".EEC E.",
    "   EEE.",
    "   ... ",
]; // x3
const containerStamp = ["  .  ", " .E. ", ".EEE.", " .E. ", "  .  "];
const labStamp = [" LL.", "LL.L", "L.LL", ".LL "];

const roomDimensions = 50;

function planCity(room) {
    const roomName = room.name;

    if (Memory.rooms[room.name].planStep == undefined) {
        Memory.rooms[roomName].buildings = getContainerLocations(roomName);
        Memory.rooms[roomName].planStep = 1;
    } else if (Memory.rooms[room.name].planStep == 1) {
        exits = getAllExitCoordinates(roomName);
        let floodFillMatrix = room.floodFill(exits);

        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, coreStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 2;
    } else if (Memory.rooms[room.name].planStep == 2) {
        exits = getAllExitCoordinates(roomName);
        let floodFillMatrix = room.floodFill(exits);
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, spawnStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 3;
    } else if (Memory.rooms[room.name].planStep == 3) {
        exits = getAllExitCoordinates(roomName);
        let floodFillMatrix = room.floodFill(exits);
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, spawnStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 4;
    } else if (Memory.rooms[room.name].planStep == 4) {
        exits = getAllExitCoordinates(roomName);
        let floodFillMatrix = room.floodFill(exits);
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, labStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 5;
    } else if (Memory.rooms[room.name].planStep == 5) {
        exits = getAllExitCoordinates(roomName);
        let floodFillMatrix = room.floodFill(exits);
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, containerStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 6;
    } else if (Memory.rooms[room.name].planStep == 6) {
        exits = getAllExitCoordinates(roomName);
        let floodFillMatrix = room.floodFill(exits);
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, containerStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 7;
    } else if (Memory.rooms[room.name].planStep == 7) {
        exits = getAllExitCoordinates(roomName);
        let floodFillMatrix = room.floodFill(exits);
        Memory.rooms[roomName].buildings = Memory.rooms[
            roomName
        ].buildings.concat(
            findStampLocation(roomName, containerStamp, floodFillMatrix)
        );
        Memory.rooms[roomName].planStep = 8;
    }

    visualizeStructures(Memory.rooms[roomName].buildings);
    // First plan the Container locations

    // console.log(JSON.stringify(stampLocation));

    // visualizeStamp(roomName, coreStamp, stampLocation);

    // console.log(JSON.stringify(stampLocation));
}

function getContainerLocations(roomName) {
    sources = Game.rooms[roomName].find(FIND_SOURCES);

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

    const usedPositions = Memory.rooms[room.name].buildings.some(
        ({ x, y }) => x === 1
    );

    // console.log(usedPositions);

    const terrainMatrix = Memory.rooms[room.name].terrainMatrix;
    const stampHeight = stamp.length;
    const stampWidth = stamp[0].length;

    let bestLocation = undefined;
    let bestVal = -1;
    let buildings = [];
    let tmp_buildings = [];

    for (let coordX = 1; coordX < 50 - stampWidth; coordX++) {
        for (let coordY = 1; coordY < 50 - stampHeight; coordY++) {
            let isValid = true;

            value = 0;
            tmp_buildings = [];

            for (let stampY = 0; stampY < stampHeight; stampY++) {
                for (let stampX = 0; stampX < stampWidth; stampX++) {
                    if (
                        Memory.rooms[room.name].buildings.some(
                            ({ x, y }) =>
                                x === coordX + stampX && y === coordY + stampY
                        )
                    ) {
                        isValid = false;
                        break;
                    } else if (
                        stamp[stampY][stampX] !== " " &&
                        terrainMatrix[coordX + stampX][coordY + stampY] ===
                            TERRAIN_MASK_WALL
                    ) {
                        isValid = false;
                        break;
                    }
                    value += floodFillMatrix.get(coordX, coordY);

                    if (stamp[stampY][stampX] !== " ") {
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

            if (isValid && value > bestVal) {
                x = coordX;
                y = coordY;
                bestLocation = { x, y };
                bestVal = value;
                buildings = tmp_buildings;
            }
        }
    }

    return buildings;
}

function visualizeStamp(roomName, stamp, location) {
    const room = Game.rooms[roomName];

    if (!room) {
        console.log(`Room ${roomName} not found.`);
        return;
    }

    const stampHeight = stamp.length;
    const stampWidth = stamp[0].length;

    const roomVisual = new RoomVisual(roomName); // Create RoomVisual instance outside the loop

    const { x, y } = location;

    for (let stampY = 0; stampY < stampHeight; stampY++) {
        for (let stampX = 0; stampX < stampWidth; stampX++) {
            const stampChar = stamp[stampY][stampX];

            if (stampChar === " ") {
                // Draw an outline for empty spaces
                roomVisual.rect(x + stampX, y + stampY, 1, 1, {
                    fill: "transparent",
                    stroke: "#00FF00",
                });
            } else if (stampChar === "C") {
                // Draw a colored square for the center location
                roomVisual.rect(x + stampX, y + stampY, 1, 1, {
                    fill: "#FF0000",
                    stroke: "#000000",
                });
            } else {
                // Draw a colored square for structure locations
                roomVisual.rect(x + stampX, y + stampY, 1, 1, {
                    fill: "#EEEEEE",
                    stroke: "#000000",
                });
            }
        }
    }
}

findPositionsInsideRect = function (rect) {
    const positions = [];

    for (let x = rect.x1; x <= rect.x2; x++) {
        for (let y = rect.y1; y <= rect.y2; y++) {
            // Iterate if the pos doesn't map onto a room

            if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions)
                continue;

            // Otherwise ass the x and y to positions

            positions.push({ x, y });
        }
    }

    return positions;
};

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
