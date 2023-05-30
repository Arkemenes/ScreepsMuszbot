/** @function */
Creep.prototype.runRoleDefender =
    function () {

        if (Memory.rooms[this.memory.target] && (Memory.rooms[this.memory.target].enemies || Memory.rooms[this.memory.target].enemyStructures)) {
            // Keep the current target
        }
        else if (Memory.rooms[this.memory.home].enemies || Memory.rooms[this.memory.home].enemyStructures) {
            this.memory.targetRoom = this.memory.home;
        } 
        else{
            this.memory.targetRoom = this.memory.home;
            for (let exitID in Memory.rooms[this.room.name].exits) {
                let exit = Memory.rooms[this.room.name].exits[exitID];
                if (Memory.rooms[exit] && Memory.rooms[exit].wanted && (Memory.rooms[exit].enemies || Memory.rooms[exit].enemyStructures)) {
                    this.memory.targetRoom = exit;
                    break;
                }
            }
        }

        let hostiles = this.room.find(FIND_HOSTILE_CREEPS, {filter : (x) => _.some(x.body, y => [ATTACK, WORK, RANGED_ATTACK, CARRY, CLAIM].includes(y.type))});

        hostiles = _.sortBy(hostiles, s => s.hits);

        let closestHostile = _.sortBy(hostiles, s => s.pos.findPathTo(this).length)[0];

        
        if (closestHostile) {
            if (this.attack(closestHostile) == ERR_NOT_IN_RANGE) {
                this.moveTo(closestHostile);
            }
            return true
        }

        let target = this.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_TOWER});

        if (!target) {
            target = this.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType != STRUCTURE_POWER_BANK});
        }

        
        if (target) {
            if (this.attack(target) == ERR_NOT_IN_RANGE) {
                this.moveTo(target);
            }
            return true
        }


        if (this.room.name != this.memory.targetRoom && (Memory.rooms[this.memory.targetRoom].enemies || Memory.rooms[this.memory.targetRoom].enemyStructures)) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = 'getEnergy';
            this.memory.target = target;
            this.moveTo(Exit);
            return true;
        }

        if (this.store.energy.valueOf()) {
            if (!this.depositEnergy()) {
                if (!this.buildConstruction()) {
                    if (!this.upgrade()) {
                        if (!this.repairStructure()) {
                            this.repairWall();
                        }
                    }
                }

            }
        }
        // if this is supposed to harvest energy from source
        else {
            this.getEnergy();
        }
    };
