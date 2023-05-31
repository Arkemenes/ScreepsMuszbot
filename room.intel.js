function getIntel(roomName) {
    // If there is no info about the room, create a variable
    if (Memory.rooms[roomName] == undefined) {
        Memory.rooms[roomName] = {};
    }
}

module.exports = getIntel;
