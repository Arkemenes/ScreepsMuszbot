/** @function 
    @param {Structure} target */
    Creep.prototype.repairStructure =
    function (target) {

        if (this.room.name != this.memory.targetRoom && Game.rooms[this.memory.targetRoom] && Game.rooms[this.memory.targetRoom].find(FIND_STRUCTURES, {filter : (s) => s.my || !s.owner })[0]) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = 'repairStructure';
            this.memory.target = undefined;
            this.moveTo(Exit);
            return true;
        }

        if (target && target.hit == target.hitsMax) {
            target = undefined;
        }


        if (!target) {
            if (this.memory.role == 'harvester') {

                let targets = this.pos.findInRange(FIND_STRUCTURES, 5, {
                    filter: (s) => s.structureType != STRUCTURE_CONTROLLER && 
                    (s.structureType != STRUCTURE_RAMPART && s.structureType != STRUCTURE_WALL && s.hits < s.hitsMax) 
                    || (((this.room.controller.level == 8 && 0.5 * s.hits < s.hitsMax) || s.hits < 0.05 * s.hitsMax)
                    && (s.structureType == STRUCTURE_RAMPART || s.structureType == STRUCTURE_WALL))
                });
    
                target = _.sortBy(targets, s => s.hits)[0];


                if (!target) {
                    let targets = this.room.find(FIND_STRUCTURES, {
                        filter: (s) => s.structureType != STRUCTURE_CONTROLLER && (s.structureType != STRUCTURE_RAMPART 
                            && s.structureType != STRUCTURE_WALL  && s.hits < s.hitsMax) || (((this.room.controller.level == 8 && 0.5 * s.hits < s.hitsMax) || s.hits < 0.05 * s.hitsMax)
                        && (s.structureType == STRUCTURE_RAMPART || s.structureType == STRUCTURE_WALL))
                    });
        
                    target = _.sortBy(targets, s => s.hits)[0];
                }
                
            }
            else {
                let targets = this.pos.findInRange(FIND_STRUCTURES, 5, {
                    filter: (s) => s.structureType != STRUCTURE_CONTROLLER && (s.structureType != STRUCTURE_RAMPART && s.structureType != STRUCTURE_WALL && s.hits < s.hitsMax) || (((this.room.controller.level == 8 && s.hits < s.hitsMax) || s.hits < 0.05 * s.hitsMax)
                    && (s.structureType == STRUCTURE_RAMPART || s.structureType == STRUCTURE_WALL))
                });
    
                if (!target) {
                    let targets = this.room.find(FIND_STRUCTURES, {
                        filter: (s) => s.structureType != STRUCTURE_CONTROLLER && (s.structureType != STRUCTURE_RAMPART && s.structureType != STRUCTURE_WALL && s.hits < s.hitsMax) || (((this.room.controller.level == 8 && s.hits < s.hitsMax) || s.hits < 0.05 * s.hitsMax)
                        && (s.structureType == STRUCTURE_RAMPART || s.structureType == STRUCTURE_WALL))
                    });
        
                    target = _.sortBy(targets, s => s.hits)[0];
                }
            }
          
        }

        if (target) {
            if (this.repair(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'repairStructure';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else {
                this.say('*Pew!*');
                this.memory.action = undefined;
                this.memory.target = undefined;
                return true;
            }


        }
        else {
            this.memory.action = undefined;
            this.memory.target = undefined;
            return false;
        }
    };