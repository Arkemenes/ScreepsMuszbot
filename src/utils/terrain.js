// Terrain never changes, so it belongs on the heap (survives until a global
// reset) and never in Memory, where it would be re-serialised every tick.

const matrices = {};

// number[50][50] of TERRAIN_MASK_* values, indexed [x][y].
function terrainMatrix(roomName) {
    if (matrices[roomName]) return matrices[roomName];

    const terrain = new Room.Terrain(roomName);
    const matrix = [];
    for (let x = 0; x < 50; x++) {
        matrix[x] = [];
        for (let y = 0; y < 50; y++) {
            matrix[x][y] = terrain.get(x, y);
        }
    }

    matrices[roomName] = matrix;
    return matrix;
}

module.exports = { terrainMatrix };
