/** @function */
Creep.prototype.runRoleScout =
    function () {

        if (this.room.find(FIND_HOSTILE_CREEPS)[0]) {
            this.say('Oi Duuuh!')
        }

        if (this.room.controller && (!this.room.controller.sign || this.room.controller.sign.username != 'Arkemenes')) {
            if (this.signController(this.room.controller, "I'm watching you!") == ERR_NOT_IN_RANGE) {
                if (this.moveTo(this.room.controller) == 0) {
                    return true;
                }
            }
        }

        if (this.memory.targetRoom && this.memory.targetRoom != this.room.name && this.memory.target) {
            if (this.moveTo(this.memory.target.x,this.memory.target.y) == 0) {
                return true;
            } 
            else {
                this.memory.targetRoom = undefined;
                this.memory.target = undefined;
            }
        }

        if (!this.memory.targetRoom || this.memory.targetRoom == this.room.name || !this.memory.target) {
            
            let targetRooms = _.sortBy(Memory.rooms[this.room.name].exits, r => (Memory.rooms[r]) ? Memory.rooms[r].lastVisit : 0);
            for (let targetRoom of targetRooms) {
                this.memory.targetRoom = targetRoom;
    
                let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
                let Exit = this.pos.findClosestByPath(exitDir);
                if (this.moveTo(Exit) == 0) {
                    this.memory.target = Exit;
                    return true;
                }
    
            }
        }
    };
