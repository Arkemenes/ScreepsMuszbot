/** @function 
    @param {Structure} target */
Creep.prototype.getEnergy =
    function (target) {


        if (this.room.name != this.memory.targetRoom) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = 'getEnergy';
            this.memory.target = target;
            this.moveTo(Exit);
            return true;
        }

        if (!target) {

            let targets = this.pos.findInRange(FIND_DROPPED_RESOURCES, 5);
            target = _.sortBy(targets, s => s.pos.getDirectionTo(this.pos.x, this.pos.y))[0];

            if (!target) {

                if (this.memory.role == 'miner') {
                    target = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
                }
                else if (this.memory.role == 'harvester') {

                    target = this.pos.findClosestByPath(FIND_DROPPED_RESOURCES);

                    if (!target) {

                        if (Memory.rooms[this.room.name].numberOfLinks >= 2) {
                            target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                                filter: s => (s.structureType == STRUCTURE_STORAGE) &&
                                    s.store.energy >= 10
                            });
                        } else if (this.room.energyAvailable < this.room.energyCapacityAvailable) {
                            target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                                filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                    s.store.energy >= 100
                            });
                        }

                    }

                    if (!target) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => ((s.structureType == STRUCTURE_CONTAINER && this.room.energyAvailable < this.room.energyCapacityAvailable) ||
                                    s.structureType == STRUCTURE_STORAGE) &&
                                s.store.energy > 0
                        });
                    }




                } else if (this.memory.role == 'transporter') {
                    target = this.pos.findClosestByPath(FIND_DROPPED_RESOURCES);

                    if (!target) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                s.store.energy >= 50
                        });
                    }

                    if (!target) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                s.store.energy > 0
                        });
                    }


                } else {

                    if (this.room.find(FIND_STRUCTURES, {
                            filter: s => s.structureType == STRUCTURE_STORAGE
                        })[0] &&
                        Memory.rooms[this.room.name].numberOfContainers >= Memory.rooms[this.room.name].sourceNumber) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_STORAGE ||
                                    (s.structureType == STRUCTURE_LINK && !s.isCollector())) &&
                                s.store.energy > 10
                        });
                    } else {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                s.store.energy >= 100
                        });
                    }

                    if (!target) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_STORAGE ||
                                    (s.structureType == STRUCTURE_LINK && !s.isCollector())) &&
                                s.store.energy > 0
                        });
                    }

                    if (!target) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => s.structureType == STRUCTURE_CONTAINER &&
                                s.store.energy > 0
                        });
                    }

                }
            }
        }

        if (!target) {
            if (Memory.rooms[this.room.name].numberOfMiners < Memory.rooms[this.room.name].sourceNumber) {
                target = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            }
        }

        if (target) {

            if (this.memory.targetRoom &&
                this.harvest(target) == ERR_NOT_IN_RANGE || this.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE || this.pickup(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'getEnergy';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            } else if (this.store.getFreeCapacity() && target.energy) {
                this.memory.action = 'getEnergy';
                this.memory.target = target;
                return true;
            } else {
                this.memory.action = undefined;
                this.memory.target = undefined;
                return true;
            }


        } else {
            this.memory.action = undefined;
            this.memory.target = undefined;
            return false;
        }

    };
