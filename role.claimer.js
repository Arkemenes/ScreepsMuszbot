module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function (creep) {

        if (creep.room.name != creep.memory.targetRoom) {
            let exitDir = Game.map.findExit(creep.room.name, creep.memory.targetRoom);
            let Exit = creep.pos.findClosestByPath(exitDir);
            creep.moveTo(Exit);
        } else {

            if (creep.room.controller && !creep.room.controller.my &&
                (!creep.room.controller.reservation || creep.room.controller.reservation.username != 'Arkemenes')) {

                if (creep.attackController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller);
                } else {
                    if (creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {

                        creep.moveTo(creep.room.controller);
                    } else if (creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller);
                    }
                }
            }
        }
    }
};
