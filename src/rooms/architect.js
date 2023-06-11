const mincut = require("../utils/mincut");

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

    if (Memory.rooms[roomName].buildings) {
        visualizeStructures(Memory.rooms[roomName].buildings, roomName);
    }

    if (
        Memory.rooms[room.name].planned &&
        !_.find(Game.constructionSites, (c) => {
            return c.room.name == room.name;
        })
    ) {
        createConstructionSites(room);
    }

    if (Memory.rooms[room.name].planned) {
        return;
    }

    const exits = getAllExitCoordinates(roomName);
    const floodFillMatrix = room.floodFill(exits);

    const planStep = Memory.rooms[room.name].planStep;

    let stamp = { structures: [], rcl: [] };

    switch (planStep) {
        case undefined:
            Memory.rooms[roomName].buildings = [];
            Memory.rooms[roomName].mincutBoundries = [];
            const containersAndLinks = getContainerLocations(
                roomName,
                floodFillMatrix
            );
            addBuildings(roomName, containersAndLinks, false);
            Memory.rooms[roomName].planStep = 1;
            break;
        case 1:
            // Plan first spawn stamp
            stamp = {
                structures: [
                    " ...   ",
                    ".EEK.. ",
                    ".E AEE.",
                    ".EEC E.",
                    " ..EEE.",
                    "   ... ",
                ],
                rcl: [
                    " 222   ",
                    "222522 ",
                    "22 1332",
                    "2222 32",
                    " 224332",
                    "   222 ",
                ],
                ramparts: [
                    "       ",
                    "   5   ",
                    "   5   ",
                    "   5   ",
                    "       ",
                    "       ",
                ],
            };
            const spawn = room.find(FIND_MY_STRUCTURES, {
                filter: { structureType: STRUCTURE_SPAWN },
            })[0];

            if (spawn) {
                addStamp(
                    roomName,
                    stamp,
                    floodFillMatrix,
                    spawn.pos.x,
                    spawn.pos.y
                );
            } else {
                addStamp(roomName, stamp, floodFillMatrix);
            }

            Memory.rooms[roomName].planStep++;
            break;
        case 2:
            // Plan the second spawn stamp (having storage)
            stamp = {
                structures: [
                    " ...   ",
                    ".EEK.. ",
                    ".E AEE.",
                    ".EES E.",
                    " ..EEE.",
                    "   ... ",
                ],
                rcl: [
                    " 444   ",
                    "444744 ",
                    "44 7454",
                    "4444 44",
                    " 445444",
                    "   444 ",
                ],
                ramparts: [
                    "       ",
                    "   7   ",
                    "   7   ",
                    "   5   ",
                    "       ",
                    "       ",
                ],
            };

            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 3:
            // Plan the third spawn stamp
            stamp = {
                structures: [
                    " ...   ",
                    ".EEK.. ",
                    ".E AEE.",
                    ".EEC E.",
                    " ..EEE.",
                    "   ... ",
                ],
                rcl: [
                    " 888   ",
                    "878888 ",
                    "88 8888",
                    "8888 88",
                    " 888888",
                    "   888 ",
                ],
                ramparts: [
                    "       ",
                    "   8   ",
                    "   8   ",
                    "   8   ",
                    "       ",
                    "       ",
                ],
            };

            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 4:
            // Plan the Lab Stamp
            stamp = {
                structures: [
                    "  ??  ",
                    " ?LL. ",
                    "?LL.L?",
                    "?L.LL?",
                    " .LL? ",
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
                ramparts: [
                    "      ",
                    "  87  ",
                    " 87 6 ",
                    " 7 68 ",
                    "  68  ",
                    "      ",
                ],
            };
            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 5:
            // Plan anchor
            stamp = {
                structures: ["  ?  ", " .N. ", "?OPF?", " .M. ", "  ?  "],
                rcl: ["  6  ", " 686 ", "68876", " 666 ", "  6  "],
                ramparts: ["     ", "  8  ", " 887 ", "  6  ", "     "],
            };
            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;

        case 6:
            // Plan the exensions position
            var countExtensions = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_EXTENSION
            ).length;

            var planRCL = Math.ceil((countExtensions + 4) / 10) + 2;

            stamp = {
                structures: ["  ?  ", " .E. ", "?EEE?", " .E. ", "  ?  "],
                rcl: ["  x  ", " xxx ", "xxxxx", " xxx ", "  x  "].map((str) =>
                    str.replace(/x/g, planRCL)
                ),
                ramparts: ["    ", "    ", "    ", "    ", "    "],
            };
            addStamp(roomName, stamp, floodFillMatrix);

            if (countExtensions >= 56) {
                Memory.rooms[roomName].planStep++;
            }
            break;

        case 7:
            // Plan the exensions position
            var countExtensions = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_EXTENSION
            ).length;

            var planRCL = Math.ceil(countExtensions / 10) + 2;

            stamp = {
                structures: [" ? ", "?E?", " ? "],
                rcl: [" x ", "xxx", " x "].map((str) =>
                    str.replace(/x/g, planRCL)
                ),
                ramparts: ["   ", "   ", "   "],
            };
            addStamp(roomName, stamp, floodFillMatrix);

            if (countExtensions >= 60) {
                Memory.rooms[roomName].planStep++;
            }
            break;
        case 8:
            // Plan Roads
            const containers = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_CONTAINER
            );
            const anchorSpawm = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_SPAWN
            )[0];
            const roadPos = { x: anchorSpawm.x + 1, y: anchorSpawm.y - 1 };
            let newRoads = [];
            for (container of containers) {
                newRoads = getShortestPath(
                    roomName,
                    roadPos.x,
                    roadPos.y,
                    container.x,
                    container.y
                );
                Memory.rooms[roomName].buildings =
                    Memory.rooms[roomName].buildings.concat(newRoads);
            }

            const pathsToAdjacentRooms = getShortestPathToAdjacentRooms(
                roomName,
                roadPos.x,
                roadPos.y
            );

            Memory.rooms[roomName].buildings =
                Memory.rooms[roomName].buildings.concat(pathsToAdjacentRooms);

            // TODO: add road to upgrader

            Memory.rooms[roomName].planStep++;
            break;
        case 9:
            const cutTiles = mincut.GetCutTiles(
                roomName,
                Memory.rooms[roomName].mincutBoundries
            );
            const ramparts = [];
            for (const tile of cutTiles) {
                ramparts.push({
                    x: tile.x,
                    y: tile.y,
                    structureType: STRUCTURE_RAMPART,
                    minimalRCL: 3,
                });
            }
            Memory.rooms[roomName].buildings =
                Memory.rooms[roomName].buildings.concat(ramparts);
            Memory.rooms[roomName].planStep++;
            break;
        case 10:
            const structures = Memory.rooms[roomName].buildings.filter(
                (building) =>
                    building.structureType !== STRUCTURE_ROAD &&
                    building.structureType !== STRUCTURE_RAMPART &&
                    building.structureType !== STRUCTURE_CONTAINER &&
                    building.structureType !== STRUCTURE_LINK &&
                    building.structureType !== STRUCTURE_EXTRACTOR
            );
            const blockRamparts = Memory.rooms[roomName].buildings.filter(
                (building) =>
                    building.structureType == STRUCTURE_RAMPART &&
                    building.minimalRCL == 3
            );

            const floodFillMatrixBlocked = room.floodFill(
                structures,
                blockRamparts,
                (visualize = true)
            );
            const towerPos = findFirstTowerLocation(
                floodFillMatrixBlocked,
                blockRamparts,
                roomName
            );
            addBuildings(
                roomName,
                [
                    {
                        x: towerPos.x,
                        y: towerPos.y,
                        structureType: STRUCTURE_TOWER,
                        minimalRCL: 3,
                    },
                    {
                        x: towerPos.x,
                        y: towerPos.y,
                        structureType: STRUCTURE_RAMPART,
                        minimalRCL: 4,
                    },
                ],
                false
            );

            const secondTowerPos = findNextTowerLocation(
                floodFillMatrixBlocked,
                blockRamparts,
                roomName
            );
            addBuildings(
                roomName,
                [
                    {
                        x: secondTowerPos.x,
                        y: secondTowerPos.y,
                        structureType: STRUCTURE_TOWER,
                        minimalRCL: 5,
                    },
                    {
                        x: secondTowerPos.x,
                        y: secondTowerPos.y,
                        structureType: STRUCTURE_RAMPART,
                        minimalRCL: 5,
                    },
                ],
                false
            );

            const thirdTowerPos = findNextTowerLocation(
                floodFillMatrixBlocked,
                blockRamparts,
                roomName
            );

            addBuildings(
                roomName,
                [
                    {
                        x: thirdTowerPos.x,
                        y: thirdTowerPos.y,
                        structureType: STRUCTURE_TOWER,
                        minimalRCL: 7,
                    },
                    {
                        x: thirdTowerPos.x,
                        y: thirdTowerPos.y,
                        structureType: STRUCTURE_RAMPART,
                        minimalRCL: 7,
                    },
                ],
                false
            );

            for (let ix = 0; ix < 3; ix++) {
                const newTowerPos = findNextTowerLocation(
                    floodFillMatrixBlocked,
                    blockRamparts,
                    roomName
                );
                addBuildings(
                    roomName,
                    [
                        {
                            x: newTowerPos.x,
                            y: newTowerPos.y,
                            structureType: STRUCTURE_TOWER,
                            minimalRCL: 8,
                        },
                        {
                            x: newTowerPos.x,
                            y: newTowerPos.y,
                            structureType: STRUCTURE_RAMPART,
                            minimalRCL: 8,
                        },
                    ],
                    false
                );
            }

            Memory.rooms[roomName].planStep++;
            Memory.rooms[room.name].planned = true;
            break;
    }
}

function createConstructionSites(room) {
    const rcl = room.controller.level;
    for (const building of Memory.rooms[room.name].buildings) {
        const buildingPos = new RoomPosition(building.x, building.y, room.name);
        if (
            rcl >= building.minimalRCL &&
            buildingPos.createConstructionSite(building.structureType) == OK
        ) {
            break;
        }
    }
}

function findFirstTowerLocation(
    floodFillMatrix,
    structures,
    roomName,
    rampartDistance = 1
) {
    // Define the adjacent positions
    const adjacentOffsets = [
        { dx: 0, dy: -1 * rampartDistance }, // Top
        { dx: 0, dy: 1 * rampartDistance }, // Bottom
        { dx: -1 * rampartDistance, dy: 0 }, // Left
        { dx: 1 * rampartDistance, dy: 0 }, // Right,
        { dx: -1 * rampartDistance, dy: -1 * rampartDistance }, // Top Left
        { dx: 1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Right
        { dx: -1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Left
        { dx: 1 * rampartDistance, dy: -1 * rampartDistance }, // Top Right
    ];

    // Find the minimum value in the floodFillMatrix that is adjacent to any structure
    let minVal = Infinity;
    let targetPosition = null;

    structures.forEach((structure) => {
        const { x, y } = structure;

        adjacentOffsets.forEach((offset) => {
            const adjacentX = x + offset.dx;
            const adjacentY = y + offset.dy;

            if (
                floodFillMatrix.get(adjacentX, adjacentY) < minVal &&
                floodFillMatrix.get(adjacentX, adjacentY) > 0 &&
                !Memory.rooms[roomName].buildings.find(
                    (building) =>
                        building.x === adjacentX && building.y === adjacentY
                )
            ) {
                minVal = floodFillMatrix.get(adjacentX, adjacentY);
                targetPosition = { x: adjacentX, y: adjacentY };
            } else {
            }
        });
    });

    if (targetPosition == null) {
        targetPosition = findFirstTowerLocation(
            floodFillMatrix,
            structures,
            roomName,
            rampartDistance + 1
        );
    }

    return targetPosition;
}

function findNextTowerLocation(
    floodFillMatrix,
    structures,
    roomName,
    rampartDistance = 1
) {
    // Define the adjacent positions
    const adjacentOffsets = [
        { dx: 0, dy: -1 * rampartDistance }, // Top
        { dx: 0, dy: 1 * rampartDistance }, // Bottom
        { dx: -1 * rampartDistance, dy: 0 }, // Left
        { dx: 1 * rampartDistance, dy: 0 }, // Right,
        { dx: -1 * rampartDistance, dy: -1 * rampartDistance }, // Top Left
        { dx: 1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Right
        { dx: -1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Left
        { dx: 1 * rampartDistance, dy: -1 * rampartDistance }, // Top Right
    ];

    // Find the minimum value in the floodFillMatrix that is adjacent to any structure
    let maxVal = -Infinity;
    let targetPosition = null;

    structures.forEach((structure) => {
        const { x, y } = structure;

        adjacentOffsets.forEach((offset) => {
            const adjacentX = x + offset.dx;
            const adjacentY = y + offset.dy;

            const currentTowers = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_TOWER
            );

            const totalDistance = currentTowers.reduce((sum, tower) => {
                const distance = Math.sqrt(
                    (tower.x - adjacentX) ** 2 + (tower.y - adjacentY) ** 2
                );
                return sum + distance;
            }, 0);

            const averageDistance = totalDistance / currentTowers.length;

            if (
                floodFillMatrix.get(adjacentX, adjacentY) > 0 &&
                averageDistance > maxVal &&
                !Memory.rooms[roomName].buildings.find(
                    (building) =>
                        building.x === adjacentX && building.y === adjacentY
                )
            ) {
                maxVal = averageDistance;
                targetPosition = { x: adjacentX, y: adjacentY };
            }
        });
    });

    if (targetPosition == null) {
        targetPosition = findNextTowerLocation(
            floodFillMatrix,
            structures,
            roomName,
            rampartDistance + 1
        );
    }

    return targetPosition;
}

function getContainerLocations(roomName, floodFillMatrix) {
    const sources = Game.rooms[roomName].find(FIND_SOURCES);

    const locations = [];

    for (const source of sources) {
        let location = undefined;
        let maxVal = -Infinity;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const coordX = source.pos.x + i;
                const coordY = source.pos.y + j;

                // Check if the terrain is not a wall and no other structure exists at the location
                if (
                    floodFillMatrix.get(coordX, coordY) > maxVal &&
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
                    location = {
                        x: coordX,
                        y: coordY,
                        structureType: STRUCTURE_CONTAINER,
                        minimalRCL: 0,
                    };
                    maxVal = floodFillMatrix.get(coordX, coordY);
                }
            }
        }
        if (location) {
            locations.push(location);
        }
    }
    // Container for extractor
    const minerals = Game.rooms[roomName].find(FIND_MINERALS);

    for (const mineral of minerals) {
        let location = undefined;
        let maxVal = -Infinity;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const coordX = mineral.pos.x + i;
                const coordY = mineral.pos.y + j;
                // Check if the terrain is not a wall and no other structure exists at the location
                if (
                    floodFillMatrix.get(coordX, coordY) > maxVal &&
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
                    location = {
                        x: coordX,
                        y: coordY,
                        structureType: STRUCTURE_CONTAINER,
                        minimalRCL: 6,
                    };
                    maxVal = floodFillMatrix.get(coordX, coordY);
                }
            }
        }
        if (location) {
            locations.push(location);
        }
    }

    // Links for containers
    const linkLocations = [];

    for (const container of locations) {
        let locationFound = false;
        // Check each adjacent position within range 1
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue; // Skip the original position

                if (locationFound) {
                    break;
                }

                const posX = container.x + dx;
                const posY = container.y + dy;

                // Check if the position has a wall
                if (
                    Memory.rooms[roomName].terrainMatrix[posX][posY] ==
                    TERRAIN_MASK_WALL
                ) {
                    continue; // Skip if there is a wall
                }

                // Check if the position is within the room bounds
                if (
                    floodFillMatrix.get(posX, posY) > 3 &&
                    posX >= 0 &&
                    posX < 50 &&
                    posY >= 0 &&
                    posY < 50
                ) {
                    const rcl =
                        linkLocations.length == 0
                            ? 5
                            : linkLocations.length == 1
                            ? 6
                            : 8;
                    linkLocations.push({
                        x: posX,
                        y: posY,
                        structureType: STRUCTURE_LINK,
                        minimalRCL: rcl,
                    }); // Return the link spot
                    locationFound = true;
                }
            }
        }
    }

    for (const mineral of minerals) {
        // Add extractor for mineral
        locations.push({
            x: mineral.pos.x,
            y: mineral.pos.y,
            structureType: STRUCTURE_EXTRACTOR,
            minimalRCL: 6,
        });
    }

    return locations.concat(linkLocations);
}

function addStamp(
    roomName,
    stamp,
    floodFillMatrix,
    spawnX = null,
    spawnY = null
) {
    // Find the locations using the stamp and flood fill matrix
    const newBuildings = findStampLocation(
        roomName,
        stamp,
        floodFillMatrix,
        spawnX,
        spawnY
    );

    addBuildings(roomName, newBuildings, floodFillMatrix);
}

function addBuildings(roomName, newBuildings, shouldProtect = true) {
    // Concatenate the new buildings with the existing ones in Memory
    Memory.rooms[roomName].buildings =
        Memory.rooms[roomName].buildings.concat(newBuildings);

    // Add mincut boundries (for rampart positioning)
    if (shouldProtect) {
        for (const b of newBuildings) {
            Memory.rooms[roomName].mincutBoundries.push({
                x1: b.x - 1,
                y1: b.y - 1,
                x2: b.x + 1,
                y2: b.y + 1,
            });
        }
    }
}

function findStampLocation(
    roomName,
    stamp,
    floodFillMatrix,
    spawnX = null,
    spawnY = null
) {
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

                    if (
                        stampStructure === "A" &&
                        spawnX &&
                        spawnY &&
                        (spawnX !== coordX + stampX ||
                            spawnY !== coordY + stampY)
                    ) {
                        isValid = false;
                        break;
                    }

                    if (
                        stampStructure !== " " &&
                        stampStructure !== "?" &&
                        floodFillMatrix.get(coordX + stampX, coordY + stampY) <
                            3
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

                        if (stamp["ramparts"][stampY][stampX] != " ") {
                            tmpBuildings.push({
                                x: coordX + stampX,
                                y: coordY + stampY,
                                structureType: STRUCTURE_RAMPART,
                                minimalRCL: stamp["ramparts"][stampY][stampX],
                            });
                        }
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

function visualizeStructures(structures, roomName, showRCL = false) {
    const roomVisual = new RoomVisual(roomName);

    for (const structure of structures) {
        const { x, y, structureType, minimalRCL } = structure;

        roomVisual.structure(x, y, structureType, {
            opacity: 0.1,
        });

        if (showRCL) {
            roomVisual.text(minimalRCL, x, y, {
                opacity: 0.4,
            });
        }
    }
}

function getShortestPathToAdjacentRooms(roomName, x, y) {
    const exits = Game.map.describeExits(roomName);
    let adjacentPaths = [];

    for (const direction in exits) {
        const adjacentRoomName = exits[direction];
        const exit = new RoomPosition(x, y, roomName).findClosestByPath(
            parseInt(direction)
        );

        if (exit !== null) {
            const path = getShortestPath(roomName, x, y, exit.x, exit.y);
            adjacentPaths = adjacentPaths.concat(path);
        }
    }

    return adjacentPaths;
}

function getShortestPath(roomName, x1, y1, x2, y2) {
    const room = Game.rooms[roomName];
    const buildings = Memory.rooms[roomName].buildings;

    if (buildings === undefined) {
        return [];
    }

    const matrix = new PathFinder.CostMatrix();
    buildings.forEach((building) => {
        if (
            building.structureType !== STRUCTURE_ROAD &&
            building.structureType !== STRUCTURE_RAMPART
        ) {
            matrix.set(building.x, building.y, 255); // Impassable terrain
        }
    });

    const origin = new RoomPosition(x1, y1, roomName);
    const target = new RoomPosition(x2, y2, roomName);

    const path = PathFinder.search(
        origin,
        { pos: target, range: 1 },
        {
            roomCallback: (roomName) => {
                if (roomName === room.name) {
                    return matrix;
                }
                return false; // Ignore paths to adjacent rooms
            },
        }
    );

    const filteredPath = path.path.filter((step) => {
        return (
            step.roomName === roomName &&
            !buildings.some(
                (building) =>
                    building.structureType === STRUCTURE_ROAD &&
                    building.x === step.x &&
                    building.y === step.y
            )
        );
    });

    // Visualize the path
    const visual = new RoomVisual(roomName);
    filteredPath.forEach((step, index) => {
        visual.circle(step.x, step.y, {
            radius: 0.3,
            fill: "#ffffff",
            opacity: 0.5,
        });
        if (index > 0) {
            const prevStep = filteredPath[index - 1];
            visual.line(prevStep.x, prevStep.y, step.x, step.y, {
                width: 0.1,
                color: "#ffffff",
            });
        }
    });

    // Convert path to list of road elements
    const roadElements = filteredPath.map((step) => ({
        x: step.x,
        y: step.y,
        structureType: STRUCTURE_ROAD,
        minimalRCL: 3,
    }));

    return roadElements;
}

module.exports = planCity;
