module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function (creep) {

        if (creep.room.controller && (!creep.room.controller.sign || creep.room.controller.sign.username != 'Arkemenes')) {
            if (creep.signController(creep.room.controller, "I'm watching you!") == ERR_NOT_IN_RANGE) {
                if (creep.moveTo(creep.room.controller) == 0) {
                    return;
                }
            }
        }
        
        let targetRooms = _.sortBy(Memory.rooms[creep.room.name].exits, r => (Memory.rooms[r]) ? Memory.rooms[r].lastVisit : 0);

        for (let targetRoom of targetRooms) {
            creep.memory.targetRoom = targetRoom;

            let exitDir = Game.map.findExit(creep.room.name, creep.memory.targetRoom);
            let Exit = creep.pos.findClosestByPath(exitDir);
            if (creep.moveTo(Exit) == 0) {
                break;
            }

        }
    }


};
