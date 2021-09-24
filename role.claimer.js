module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function (creep) {

        if (creep.room.name != creep.memory.targetRoom) {
            let exitDir = Game.map.findExit(creep.room.name, creep.memory.targetRoom);
            let Exit = creep.pos.findClosestByPath(exitDir);
            creep.moveTo(Exit);
        } else {

            if (creep.room.controller && !creep.room.controller.my) {
                creep.say(' b')
                if (creep.attackController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller);
                } else {
                    let status = creep.claimController(creep.room.controller);
                    creep.say(status)
                    if (status == ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller);
                    } else if (status == ERR_FULL && status == ERR_GCL_NOT_ENOUGH) {
                        if (creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(creep.room.controller);
                        }
                    }
                }
            }
        }
    }
};
