/** @function */
Creep.prototype.runRoleUpgrader =
    function () {
    
        if (this.room.name != this.memory.targetRoom && Game.rooms[this.memory.targetRoom] && Game.rooms[this.memory.targetRoom].controller && Game.rooms[this.memory.targetRoom].controller.my) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = undefined;
            this.memory.target = undefined;
            this.moveTo(Exit);
            return true;
        }
        
        if (this.memory.action && this.memory.target) {
            this.execAction(this.memory.action, this.memory.target.id);
        }
        else if (this.store.getFreeCapacity() < 0.9 * this.store.getCapacity()) {
            this.upgrade();
        }
        // if creep is supposed to harvest energy from source
        else {
            this.getEnergy();
        }
    };