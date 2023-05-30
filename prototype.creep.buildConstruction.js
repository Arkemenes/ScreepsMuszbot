/** @function 
    @param {ConstructionSite} target */
    Creep.prototype.buildConstruction =
    function (target) {

        if (this.room.name != this.memory.targetRoom && Game.rooms[this.memory.targetRoom] && Game.rooms[this.memory.targetRoom].find(FIND_CONSTRUCTION_SITES)[0]) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exits = this.room.find(exitDir);
            Exit = _.sortBy(targets, s => s.progress).reverse()[0];
            this.memory.action = undefined;
            this.memory.target = undefined;
            this.moveTo(Exit);
            return true;
        }


        if (!target) {
            let targets = this.pos.findInRange(FIND_STRUCTURES, 5, {
                filter: (s) => s.hits < Math.min(1000, 0.2 * s.hitsMax) && s.hits < s.hitsMax &&
                               s.structureType != STRUCTURE_WALL 

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

        let possibleTargets = this.room.find(FIND_CONSTRUCTION_SITES, {filter: (c) => c.my});

        if (!possibleTargets){
            this.memory.action = undefined;
            this.memory.target = undefined;
            return false;
        }

        
        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_SPAWN);
            target = this.pos.findClosestByPath(targets);
        }

        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_SPAWN);
            target = this.pos.findClosestByPath(targets);
        }

        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_CONTAINER);
            target = this.pos.findClosestByPath(targets);
        }

        if (!target && Memory.rooms[this.room.name].numberOfTowers == 0) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_TOWER);
            target = _.sortBy(targets, s => s.progress).reverse()[0];
        }

        if (!target && Memory.rooms[this.room.name].numberOfTowers) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_WALL || c.structureType == STRUCTURE_RAMPART);
            target = this.pos.findClosestByPath(targets);
        }

        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_EXTENSION);
            target = this.pos.findClosestByPath(targets);
        }

        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_TOWER);
            target = _.sortBy(targets, s => s.progress).reverse()[0];
        }

        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_LINK);
            target = this.pos.findClosestByPath(targets);
        }

        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_STORAGE);
            target = _.sortBy(targets, s => s.progress).reverse()[0];
        }

        if (!target) {
            targets = _.filter(possibleTargets, (c) => c.structureType == STRUCTURE_LAB);
            target = this.pos.findClosestByPath(targets);
        }

        if (!target) {
            target = this.pos.findClosestByPath(possibleTargets);
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
            else if (this.energy) {
                this.memory.action = 'buildConstruction';
                this.memory.target = target;
                return true;
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
