function getIntel(room) {
    if (Memory.rooms == undefined) {
        Memory.rooms = {};
    }
    // If there is no info about the room, create a variable
    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }

    // Get terrain info only if it's not in memory
    if (Memory.rooms[room.name].terrainMatrix == undefined) {
        console.log("Calculationg terrain matrix for room", room.name);
        const terrain = new Room.Terrain(room.name);
        const terrainMatrix = [];
        for (let x = 0; x < 50; x++) {
            terrainMatrix[x] = [];
            for (let y = 0; y < 50; y++) {
                const terrainType = terrain.get(x, y);
                terrainMatrix[x][y] = terrainType;
            }
        }
        Memory.rooms[room.name].terrainMatrix = terrainMatrix;
    }
}

module.exports = getIntel;
