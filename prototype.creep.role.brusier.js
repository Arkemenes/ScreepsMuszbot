/** @function */
Creep.prototype.runRoleBrusier =
    function () {

        let hostiles = this.room.find(FIND_HOSTILE_CREEPS, {filter : (x) => _.some(x.body, y => [ATTACK, WORK, RANGED_ATTACK, CARRY, CLAIM].includes(y.type))});

        hostiles = _.sortBy(hostiles, s => s.hits);

        let closestHostile = _.sortBy(hostiles, s => s.pos.getDirectionTo(this.pos.x, this.pos.y))[0];

        
        if (closestHostile) {
            if (this.attack(closestHostile) == ERR_NOT_IN_RANGE) {
                this.moveTo(closestHostile);
            }
            return true
        }

        let target = this.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_TOWER});

        if (!target) {
            target = this.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES);
        }

        
        if (target) {
            if (this.attack(target) == ERR_NOT_IN_RANGE) {
                this.moveTo(target);
            }
            return true
        }


        if (this.room.name != this.memory.targetRoom) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = 'getEnergy';
            this.memory.target = target;
            this.moveTo(Exit);
            return true;
        }
    };
