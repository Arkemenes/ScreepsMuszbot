/** @function 
    @param {Structure} target */
    Creep.prototype.getEnergy =
    function (target) {

        Game.getObjectById()
        if (!target) {

            target = this.pos.findInRange(FIND_DROPPED_RESOURCES, 10)[0];

            if (!target) {

                if (this.memory.role == 'harvester') {

                    target = this.room.find(FIND_DROPPED_RESOURCES)[0];

                    if (!target) {

                        if (this.room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_LINK }).length >= 2) {
                            target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                                filter: s => (s.structureType == STRUCTURE_STORAGE) &&
                                    s.store.energy >= 10
                            });
                        }
                        else if (this.room.energyAvailable < this.room.energyCapacityAvailable) {
                            target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                                filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                    s.store.energy >= 100
                            });
                        }

                    }




                }
                else if (this.memory.role == 'transporter') {
                    target = this.room.find(FIND_DROPPED_RESOURCES)[0];

                    if (!target) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                s.store.energy >= 50
                        });
                    }


                }
                else {

                    if (this.room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_STORAGE })[0] &&
                        this.room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_CONTAINER }).length >= 2) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_STORAGE
                                || (s.structureType == STRUCTURE_LINK && !s.isCollector())) &&
                                s.store.energy > 10
                        });
                    }
                    else {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                s.store.energy >= 100
                        });
                    }

                }
            }




        }

        if (!target) {
            if (this.memory.role == 'harvester') {
                target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => ((s.structureType == STRUCTURE_CONTAINER && this.room.energyAvailable < this.room.energyCapacityAvailable)
                        || s.structureType == STRUCTURE_STORAGE) &&
                        s.store.energy > 0
                });
            }
            else if (this.memory.role == 'transporter') {
                target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                        s.store.energy > 0
                });
            }
            else {
                target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => (s.structureType == STRUCTURE_STORAGE
                        || (s.structureType == STRUCTURE_LINK && !s.isCollector())) &&
                        s.store.energy > 0
                });
            }
        }
        if (!target) {
            let numberofMiners = _.sum(Game.creeps, (c) => c.memory.role == 'miner');
            if (this.memory.role == 'miner' || numberofMiners < 2) {
                target = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            }
        }

        if (target) {
            if (this.harvest(target) == ERR_NOT_IN_RANGE || this.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE || this.pickup(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'getEnergy';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if (this.store.getFreeCapacity() &&
                ((target.store && (target.store[RESOURCE_ENERGY] > 0 || (this.memory.role != 'transporter' && target.store[RESOURCE_ENERGY] > 0))) ||
                    (_.sum(Game.creeps, (c) => c.memory.role == 'miner') < 2 && target.structureType != STRUCTURE_CONTAINER))) {
                this.memory.action = 'getEnergy';
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
