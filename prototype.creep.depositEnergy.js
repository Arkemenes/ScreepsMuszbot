/** @function 
    @param {Structure} target */
    Creep.prototype.depositEnergy =
    function (target) {

        if (!target) {

            if (this.memory.role == 'harvester') {
                target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: (s) => ((s.structureType == STRUCTURE_SPAWN
                        || s.structureType == STRUCTURE_EXTENSION)
                        && s.energy < s.energyCapacity)
                });

                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: (s) => ((s.structureType == STRUCTURE_TOWER)
                        && s.energy < s.energyCapacity)
                    });
                }

                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: (s) => ((s.structureType == STRUCTURE_STORAGE)
                        && s.energy < s.energyCapacity)
                    });
                }
                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) => (s.structureType == STRUCTURE_LAB && s.energy < s.energyCapacity)
                    });

                }
            }

            else if (this.memory.role == 'transporter') {
                if (!target) {
                    target = this.pos.findInRange(FIND_MY_STRUCTURES, 5, {
                        filter: (s) => ((s.structureType == STRUCTURE_LINK && s.isCollector())
                            && s.energy < s.energyCapacity)
                    })[0];

                }
                if (!target && !this.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_LINK })) {
                    target = this.pos.findInRange(FIND_STRUCTURES, 5, {
                        filter: (s) => (s.structureType == STRUCTURE_STORAGE)
                    })[0];
                }
                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) => ((s.structureType == STRUCTURE_LINK && s.isCollector())
                            && s.energy < s.energyCapacity)
                    });

                }
                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) => (s.structureType == STRUCTURE_LAB && s.energy < s.energyCapacity)
                    });

                }
                if (!target && 
                    this.room.storage.store.energy < this.room.storage.store.energyCapacity) {
                    
                    target = this.room.storage;
                }
            }
            else {
                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) => (s.structureType == STRUCTURE_TOWER
                            && s.energy < s.energyCapacity)
                    });
                }
                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) => ((s.structureType == STRUCTURE_SPAWN
                            || s.structureType == STRUCTURE_EXTENSION)
                            && s.energy < s.energyCapacity)
                    });
                }
                if (!target) {
                    target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) => (s.structureType == STRUCTURE_LAB && s.energy < s.energyCapacity)
                    });

                }
            }

        }

        if ((!target || target.room.name != this.room.name) && this.room.name != this.memory.home) {
            let exitDir = Game.map.findExit(this.room.name, this.memory.home);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = undefined;
            this.memory.target = undefined;
            this.moveTo(Exit);
            return true;
        }

        if (target) {

            if (this.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'depositEnergy';
                this.memory.target = target;
                this.smartMove(target);
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
