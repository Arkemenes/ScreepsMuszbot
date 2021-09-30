/** @function 
    @param {ConstructionSite} target */
    Creep.prototype.buildConstruction =
    function (target) {

        if (this.room.name != this.memory.targetRoom && Game.rooms[this.memory.targetRoom] && Game.rooms[this.memory.targetRoom].find(FIND_CONSTRUCTION_SITES)[0]) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = undefined;
            this.memory.target = undefined;
            this.moveTo(Exit);
            return true;
        }


        if (!target) {
            let targets = this.pos.findInRange(FIND_STRUCTURES, 5, {
                filter: (s) => s.hits < Math.min(1000, 0.2 * s.hitsMax) && s.hits < s.hitsMax
            });

            let repairTarget = _.sortBy(targets, s => s.hits)[0];

            if (repairTarget) {
                if (this.repair(repairTarget) == ERR_NOT_IN_RANGE) {
                    this.memory.action = 'repairStructure';
                    this.memory.target = repairTarget;
                    this.smartMove(repairTarget);
                    return true;
                }
            }
            
        }



        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES, {filter: (c) => c.structureType == STRUCTURE_CONTAINER});
        }

        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES, {filter: (c) => c.structureType == STRUCTURE_TOWER});
        }

        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES, {filter: (c) => c.structureType == STRUCTURE_LINK});
        }

        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        }


        if (target) {

            if (this.pos.isEqualTo(target.pos)){
                this.moveTo(this.room.controller);
                this.memory.action = 'buildConstruction';
                this.memory.target = target;
                return true;
            }
            else if (this.build(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'buildConstruction';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if ((target.structureType == STRUCTURE_RAMPART || target.structureType == STRUCTURE_WALL)) {
                this.memory.action = 'repairStructure';
                this.memory.target = target;
            }
            else {
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
