/** @function 
    @param {Structure} target */
    Creep.prototype.getEnergy =
    function (target) {


        if (!target) {

            let targets = this.pos.findInRange(FIND_DROPPED_RESOURCES, 5);
            target = _.sortBy(targets, s => s.pos.getDirectionTo(this.pos.x,this.pos.y))[0];

            if (!target) {

                if (this.memory.role == 'harvester') {

                    target = this.pos.findClosestByPath(FIND_DROPPED_RESOURCES);

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
                    target = this.pos.findClosestByPath(FIND_DROPPED_RESOURCES);

                    if (!target) {
                        target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                            filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                s.store.energy >= 50
                        });
                    }


                }
                else {

                    if (this.room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_STORAGE })[0] &&
                        this.room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_CONTAINER }).length >= this.room.find(FIND_SOURCES).length) {
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
                
                if (!target) {
                    target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => s.structureType == STRUCTURE_CONTAINER &&
                        s.store.energy > 0
                });
                }
            }
        }
        if (!target) {
            let numberofMiners = _.sum(Game.creeps, (c) => c.memory.role == 'miner' && c.memory.target == this.room.name);
            if (this.memory.role == 'miner' || numberofMiners < this.room.find(FIND_SOURCES).length) {
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
            else if (this.store.getFreeCapacity() && target.energy &&
                    (this.memory.role != 'transporter' ||
                    (_.sum(Game.creeps, (c) => c.memory.role == 'miner' && c.memory.target == this.room.name) < this.room.find(FIND_SOURCES).length && this.memory == 'harvester' && target.structureType != STRUCTURE_CONTAINER))) {
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
