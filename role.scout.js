module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function(creep) {

        // creep.suicide()

        creep.memory.targetRoom = _.sortBy(Memory.rooms[creep.room.name].exits, r => (Memory.rooms[r]) ? Memory.rooms[r].lastVisit : 0)[0];

        let exitDir = Game.map.findExit(creep.room.name, creep.memory.targetRoom);
        let Exit = creep.pos.findClosestByPath(exitDir);
        creep.moveTo(Exit);
        
    }
};
