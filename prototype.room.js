const roomDimensions = 50;

/**
 * This is good for anything that isn't a diagonal, as searches all adjacent tiles when finding distance
 */
Room.prototype.distanceTransform = function (
    initialCM,
    enableVisuals,
    x1 = 0,
    y1 = 0,
    x2 = roomDimensions - 1,
    y2 = roomDimensions - 1
) {
    const room = this;

    // Use a costMatrix to record distances

    const distanceCM = new PathFinder.CostMatrix();

    let x;
    let y;

    for (
        x = Math.max(x1 - 1, 0);
        x < Math.min(x2 + 1, roomDimensions - 1);
        x += 1
    ) {
        for (
            y = Math.max(y1 - 1, 0);
            y < Math.min(y2 + 1, roomDimensions - 1);
            y += 1
        ) {
            distanceCM.set(x, y, initialCM.get(x, y) === 255 ? 0 : 255);
        }
    }

    let top;
    let left;
    let topLeft;
    let topRight;
    let bottomLeft;

    // Loop through the xs and ys inside the bounds

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            top = distanceCM.get(x, y - 1);
            left = distanceCM.get(x - 1, y);
            topLeft = distanceCM.get(x - 1, y - 1);
            topRight = distanceCM.get(x + 1, y - 1);
            bottomLeft = distanceCM.get(x - 1, y + 1);

            distanceCM.set(
                x,
                y,
                Math.min(
                    Math.min(top, left, topLeft, topRight, bottomLeft) + 1,
                    distanceCM.get(x, y)
                )
            );
        }
    }

    let bottom;
    let right;
    let bottomRight;

    // Loop through the xs and ys inside the bounds

    for (x = x2; x >= x1; x -= 1) {
        for (y = y2; y >= y1; y -= 1) {
            bottom = distanceCM.get(x, y + 1);
            right = distanceCM.get(x + 1, y);
            bottomRight = distanceCM.get(x + 1, y + 1);
            topRight = distanceCM.get(x + 1, y - 1);
            bottomLeft = distanceCM.get(x - 1, y + 1);

            distanceCM.set(
                x,
                y,
                Math.min(
                    Math.min(bottom, right, bottomRight, topRight, bottomLeft) +
                        1,
                    distanceCM.get(x, y)
                )
            );
        }
    }

    if (enableVisuals) {
        // Loop through the xs and ys inside the bounds

        for (x = x1; x <= x2; x += 1) {
            for (y = y1; y <= y2; y += 1) {
                const value = distanceCM.get(x, y);

                room.visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: `hsl(${200}${value * 10}, 100%, 60%)`,
                    opacity: 0.4,
                });

                room.visual.text(value.toString(), x, y, {
                    color: "white",
                    font: 0.5,
                    align: "center",
                    opacity: 0.8,
                });
            }
        }
    }

    return distanceCM;
};

/**
 * This is good for finding open diamond-shaped areas, as it voids adjacent diagonal tiles when finding distance
 */
Room.prototype.diagonalDistanceTransform = function (
    initialCM,
    enableVisuals,
    x1 = 0,
    y1 = 0,
    x2 = roomDimensions - 1,
    y2 = roomDimensions - 1
) {
    const room = this;

    // Use a costMatrix to record distances

    const distanceCM = new PathFinder.CostMatrix();

    let x;
    let y;

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            distanceCM.set(x, y, initialCM.get(x, y) === 255 ? 0 : 255);
        }
    }

    let top;
    let left;

    // Loop through the xs and ys inside the bounds

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            top = distanceCM.get(x, y - 1);
            left = distanceCM.get(x - 1, y);

            distanceCM.set(
                x,
                y,
                Math.min(Math.min(top, left) + 1, distanceCM.get(x, y))
            );
        }
    }

    let bottom;
    let right;

    // Loop through the xs and ys inside the bounds

    for (x = x2; x >= x1; x -= 1) {
        for (y = y2; y >= y1; y -= 1) {
            bottom = distanceCM.get(x, y + 1);
            right = distanceCM.get(x + 1, y);

            distanceCM.set(
                x,
                y,
                Math.min(Math.min(bottom, right) + 1, distanceCM.get(x, y))
            );
        }
    }

    if (enableVisuals) {
        // Loop through the xs and ys inside the bounds

        for (x = x1; x <= x2; x += 1) {
            for (y = y1; y <= y2; y += 1) {
                const value = distanceCM.get(x, y);

                room.visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: `hsl(${200}${value * 10}, 100%, 60%)`,
                    opacity: 0.4,
                });

                room.visual.text(value.toString(), x, y, {
                    color: "white",
                    font: 0.5,
                    align: "center",
                    opacity: 0.8,
                });
            }
        }
    }

    return distanceCM;
};

function findPositionsInsideRect(rect) {
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
}

Room.prototype.floodFill = function (seeds, blocks = [], visualize = false) {
    const room = this;

    // Construct a cost matrix for the flood

    const floodCM = new PathFinder.CostMatrix(),
        // Get the terrain cost matrix

        terrain = room.getTerrain(),
        // Construct a cost matrix for visited tiles and add seeds to it

        visitedCM = new PathFinder.CostMatrix();

    // Construct values for the flood

    let depth = 0,
        thisGeneration = seeds,
        nextGeneration = [];

    // Loop through positions of seeds

    for (const pos of seeds) {
        // Record the seedsPos as visited

        visitedCM.set(pos.x, pos.y, 1);
    }

    // So long as there are positions in this gen

    while (thisGeneration.length) {
        // Reset next gen

        nextGeneration = [];

        // Iterate through positions of this gen

        for (const pos of thisGeneration) {
            // If the depth isn't 0

            if (depth != 0) {
                if (
                    blocks.some((block) => block.x == pos.x && block.y == pos.y)
                ) {
                    console.log("d");
                }

                // Iterate if the terrain is a wall
                if (
                    terrain.get(pos.x, pos.y) == TERRAIN_MASK_WALL ||
                    blocks.some((block) => block.x == pos.x && block.y == pos.y)
                )
                    continue;

                if (
                    Memory.rooms[room.name].buildings &&
                    Memory.rooms[room.name].buildings.some(
                        ({ x, y, structureType }) =>
                            x === pos.x &&
                            y === pos.y &&
                            structureType != STRUCTURE_ROAD
                    )
                )
                    continue;

                // Otherwise so long as the pos isn't a wall record its depth in the flood cost matrix

                floodCM.set(pos.x, pos.y, depth);

                // If visuals are enabled, show the depth on the pos

                if (visualize) {
                    room.visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, {
                        fill: "hsl(" + 200 + depth * 2 + ", 100%, 60%)",
                        opacity: 0.4,
                    });
                    room.visual.text(depth, pos.x, pos.y, {
                        color: "white",
                        font: 0.5,
                        align: "center",
                        opacity: 0.8,
                    });
                }
            }

            // Construct a rect and get the positions in a range of 1

            const rect = {
                    x1: pos.x - 1,
                    y1: pos.y - 1,
                    x2: pos.x + 1,
                    y2: pos.y + 1,
                },
                adjacentPositions = findPositionsInsideRect(rect);

            // Loop through adjacent positions

            for (const adjacentPos of adjacentPositions) {
                // Iterate if the adjacent pos has been visited or isn't a tile

                if (visitedCM.get(adjacentPos.x, adjacentPos.y) == 1) continue;

                // Otherwise record that it has been visited

                visitedCM.set(adjacentPos.x, adjacentPos.y, 1);

                // Add it to the next gen

                nextGeneration.push(adjacentPos);
            }
        }

        // Set this gen to next gen

        thisGeneration = nextGeneration;

        // Increment depth

        depth++;
    }

    return floodCM;
};
