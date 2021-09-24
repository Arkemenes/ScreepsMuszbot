module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function(creep) {

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
