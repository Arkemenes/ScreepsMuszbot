/** @function */
Creep.prototype.runRoleClaimer =
    function () {
        if (this.room.name != this.memory.targetRoom) {
            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.moveTo(Exit);
        } else {

            if (this.room.controller && !this.room.controller.my && (!this.room.controller.reservation || !this.room.controller.reservation.username != 'Arkemenes')) {

                if (((this.room.controller.owner) || (this.room.controller.reservation && this.room.controller.reservation.username != 'Arkemenes')) && this.attackController(this.room.controller) == ERR_NOT_IN_RANGE) {
                    this.moveTo(this.room.controller);
                } else if (Memory.rooms[this.room.name].center && Memory.myRooms.length < Game.gcl.level && this.claimController(this.room.controller) == ERR_NOT_IN_RANGE) {
                    this.moveTo(this.room.controller);
                }else if (this.reserveController(this.room.controller) == ERR_NOT_IN_RANGE) {
                    this.moveTo(this.room.controller);
                }
                
            } else if (this.reserveController(this.room.controller) == ERR_NOT_IN_RANGE) {
                this.moveTo(this.room.controller);
            }
        }
    };
