const mincut = require("./util.mincut");

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
    "?": STRUCTURE_ROAD,
    ".": STRUCTURE_ROAD,
    C: STRUCTURE_CONTAINER,
    R: STRUCTURE_RAMPART,
    W: STRUCTURE_WALL,
    F: STRUCTURE_FACTORY,
};
_.merge(layoutKey, _.invert(layoutKey));

function planCity(room) {
    const roomName = room.name;

    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }

    const exits = getAllExitCoordinates(roomName);
    const floodFillMatrix = room.floodFill(exits);

    const planStep = Memory.rooms[room.name].planStep;

    let stamp = { structures: [], rcl: [] };

    if (Memory.rooms[room.name].mincutBoundries) {
        for (
            let i = 0;
            i < Memory.rooms[room.name].mincutBoundries.length;
            i++
        ) {
            const boundary = Memory.rooms[room.name].mincutBoundries[i];
        }
    }

    switch (planStep) {
        case undefined:
            Memory.rooms[roomName].mincutBoundries = [];
            Memory.rooms[roomName].buildings = getContainerLocations(roomName);
            Memory.rooms[roomName].planStep = 1;
            break;
        case 1:
            // TODO: Include logic if there is already a spawn

            // Plan first spawn stamp
            stamp = {
                structures: [
                    " ???   ",
                    "?EEK.? ",
                    "?E AEE?",
                    "?EEC E?",
                    " ??EEE?",
                    "   ??? ",
                ],
                rcl: [
                    " 222   ",
                    "222522 ",
                    "22 1332",
                    "2222 32",
                    " 224332",
                    "   222 ",
                ],
            };
            addBuildings(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 2:
            // Plan the second spawn stamp (having storage)
            stamp = {
                structures: [
                    " ???   ",
                    "?EEK.? ",
                    "?E AEE?",
                    "?EES E?",
                    " ??EEE?",
                    "   ??? ",
                ],
                rcl: [
                    " 444   ",
                    "444744 ",
                    "44 7454",
                    "4444 44",
                    " 445444",
                    "   444 ",
                ],
            };

            addBuildings(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 3:
            // Plan the third spawn stamp
            stamp = {
                structures: [
                    " ???   ",
                    "?EEK?? ",
                    "?E AEE?",
                    "?EEC E?",
                    " ??EEE?",
                    "   ??? ",
                ],
                rcl: [
                    " 888   ",
                    "878888 ",
                    "88 8888",
                    "8888 88",
                    " 888888",
                    "   888 ",
                ],
            };

            addBuildings(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 4:
            // Plan the Lab Stamp
            stamp = {
                structures: [
                    "  ??  ",
                    " ?LL? ",
                    "?LL.L?",
                    "?L.LL?",
                    " ?LL? ",
                    "  ??  ",
                ],
                rcl: [
                    "  88  ",
                    " 8876 ",
                    "887668",
                    "876688",
                    " 6688 ",
                    "  88  ",
                ],
            };
            addBuildings(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 5:
            // Plan anchor
            stamp = {
                structures: ["  ?  ", " .N. ", "?OPF?", " .M. ", "  ?  "],
                rcl: ["  6  ", " 686 ", "68876", " 666 ", "  6  "],
            };
            addBuildings(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;

        case 6:
            // Plan the exensions position
            const countExtensions = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_EXTENSION
            ).length;

            const planRCL = Math.ceil(countExtensions / 10) + 2;

            stamp = {
                structures: [" ? ", "?E?", " ? "],
                rcl: [" x ", "xxx", " x "].map((str) =>
                    str.replace(/x/g, planRCL)
                ),
            };
            addBuildings(roomName, stamp, floodFillMatrix);

            if (countExtensions >= 200) {
                Memory.rooms[roomName].planStep++;
            }
            break;
        case 7:
            // console.log(JSON.stringify(Memory.rooms[roomName].mincutBoundries));
            const cutTiles = mincut.GetCutTiles(
                roomName,
                Memory.rooms[roomName].mincutBoundries
            );
            const ramparts = [];
            for (const tile of cutTiles) {
                console.log(JSON.stringify(tile));
                ramparts.push({
                    x: tile.x,
                    y: tile.y,
                    structureType: STRUCTURE_RAMPART,
                    minimalRCL: 0,
                });
            }
            Memory.rooms[roomName].buildings =
                Memory.rooms[roomName].buildings.concat(ramparts);
            Memory.rooms[roomName].planStep++;
            break;
        case 8:
            // TODO: build towers
            break;
    }

    visualizeStructures(Memory.rooms[roomName].buildings);
}

function getContainerLocations(roomName) {
    const sources = Game.rooms[roomName].find(FIND_SOURCES);

    const locations = [];
    for (const source of sources) {
        let locationFound = false;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const coordX = source.pos.x + i;
                const coordY = source.pos.y + j;

                // Check if a suitable location has already been found for the current source
                if (locationFound) {
                    break;
                }
                // Check if the terrain is not a wall and no other structure exists at the location
                else if (
                    Memory.rooms[roomName].terrainMatrix[coordX][coordY] !==
                        TERRAIN_MASK_WALL &&
                    !Game.rooms[roomName].find(FIND_STRUCTURES, {
                        filter: (s) =>
                            s.pos &&
                            s.pos.x === coordX &&
                            s.pos.y === coordY &&
                            s.structureType !== STRUCTURE_CONTAINER &&
                            s.structureType !== STRUCTURE_ROAD,
                    })[0] &&
                    (i !== 0 || j !== 0)
                ) {
                    // Add the location to the list
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

    // TODO: add links for containers

    return locations;
}

function addBuildings(roomName, stamp, floodFillMatrix) {
    // Find the locations using the stamp and flood fill matrix
    const newBuildings = findStampLocation(roomName, stamp, floodFillMatrix);

    // Concatenate the new buildings with the existing ones in Memory
    Memory.rooms[roomName].buildings =
        Memory.rooms[roomName].buildings.concat(newBuildings);

    // Add mincut boundries (for rampart positioning)
    for (const b of newBuildings) {
        Memory.rooms[roomName].mincutBoundries.push({
            x1: b.x,
            y1: b.y,
            x2: b.x + 1,
            y2: b.y + 1,
        });
    }
}

function findStampLocation(roomName, stamp, floodFillMatrix) {
    const room = Game.rooms[roomName];

    // Check if the room exists
    if (!room) {
        console.log(`Room ${roomName} not found.`);
        return [];
    }

    const terrainMatrix = Memory.rooms[room.name].terrainMatrix;
    const stampHeight = stamp["structures"].length;
    const stampWidth = stamp["structures"][0].length;

    let bestVal = -1;
    let bestAdjacentRoads = -1;
    let buildings = [];

    // Iterate over possible coordinates for stamp placement
    for (let coordX = 1; coordX < 50 - stampWidth; coordX++) {
        for (let coordY = 1; coordY < 50 - stampHeight; coordY++) {
            let isValid = true;

            let value = 0;
            let adjacentRoads = 0;
            let tmpBuildings = [];

            // Check stamp validity and calculate value and adjacent roads count
            for (let stampY = 0; stampY < stampHeight; stampY++) {
                for (let stampX = 0; stampX < stampWidth; stampX++) {
                    const stampStructure = stamp["structures"][stampY][stampX];

                    // Check if stamp overlaps with a wall
                    if (
                        stampStructure !== " " &&
                        stampStructure !== "?" &&
                        terrainMatrix[coordX + stampX][coordY + stampY] ===
                            TERRAIN_MASK_WALL
                    ) {
                        isValid = false;
                        break;
                    }

                    // Check if stamp overlaps with existing buildings
                    const existingBuilding = Memory.rooms[
                        room.name
                    ].buildings.find(
                        ({ x, y, structureType }) =>
                            x === coordX + stampX &&
                            y === coordY + stampY &&
                            stampStructure !== " " &&
                            !(
                                structureType === STRUCTURE_ROAD &&
                                layoutKey[stampStructure] === STRUCTURE_ROAD
                            ) &&
                            !(
                                structureType === STRUCTURE_CONTAINER &&
                                stampStructure === "?"
                            )
                    );

                    if (existingBuilding) {
                        isValid = false;
                        break;
                    }

                    // Calculate value based on flood fill matrix
                    value += floodFillMatrix.get(coordX, coordY);

                    // Count adjacent roads
                    if (
                        (stampStructure === "." || stampStructure === "?") &&
                        Memory.rooms[roomName].buildings.some(
                            (building) =>
                                building.x === coordX + stampX &&
                                building.y === coordY + stampY &&
                                building.structureType === STRUCTURE_ROAD
                        )
                    ) {
                        adjacentRoads += 1;
                    }

                    // Add new buildings to the temporary array
                    if (
                        stampStructure !== " " &&
                        !Memory.rooms[room.name].buildings.some(
                            ({ x, y, structureType }) =>
                                x === coordX + stampX &&
                                y === coordY + stampY &&
                                structureType === layoutKey[stampStructure]
                        ) &&
                        terrainMatrix[coordX + stampX][coordY + stampY] !=
                            TERRAIN_MASK_WALL
                    ) {
                        tmpBuildings.push({
                            x: coordX + stampX,
                            y: coordY + stampY,
                            structureType: layoutKey[stampStructure],
                            minimalRCL: stamp["rcl"][stampY][stampX],
                        });
                    }
                }

                if (!isValid) {
                    break;
                }
            }

            // Update best values and buildings if a better placement is found
            if (
                isValid &&
                (adjacentRoads > bestAdjacentRoads ||
                    (value > bestVal && adjacentRoads === bestAdjacentRoads))
            ) {
                bestVal = value;
                bestAdjacentRoads = adjacentRoads;
                buildings = tmpBuildings;
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
