var roles = {
    builder: require('role.builder'),
    claimer: require('role.claimer'),
    harvester: require('role.harvester'),
    longDistanceHarvester: require('role.longDistanceHarvester'),
    miner: require('role.miner'),
    repairer: require('role.repairer'),
    transporter: require('role.transporter'),
    upgrader: require('role.upgrader'),
    wallRepairer: require('role.wallRepairer')
};

Creep.prototype.runRole =
    function () {
        roles[this.memory.role].run(this);
    };

/** @function 
    @param {Structure} target */
Creep.prototype.getEnergy =
    function (target) {

        if (!target) {

            if (this.memory.role != 'harvester' && 
                this.memory.role != 'longDistanceHarvester' && 
                this.memory.role != 'transporter' &&
                this.memory.role != 'miner') {
                target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => (s.structureType == STRUCTURE_CONTAINER || s.structureType == STRUCTURE_STORAGE) &&
                                 s.store[RESOURCE_ENERGY] > 100
                });
            }
            else if (this.memory.role != 'miner') {
                target = this.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => (s.structureType == STRUCTURE_CONTAINER) &&
                                 s.store[RESOURCE_ENERGY] > 50
                });
            }


            if (!target && this.memory.role != 'transporter') {
                target = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            }
        }

        if (target) {
            if (this.harvest(target) == ERR_NOT_IN_RANGE || this.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.memory.action = this.getEnergy;
                this.memory.target = target;
                this.moveTo(target);
                return true;
            }
            else {
                this.action = undefined;
                this.target = undefined;
                return true;
            }

            
        }
        else {
            this.action = undefined;
            this.target = undefined;
            return false;
        }

    };


/** @function 
    @param {Structure} target */
    Creep.prototype.depositEnergy =
    function (target) {

        if (!target) {
            // If there is no target, try to get the closest spawn, extension or tower
            target = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: (s) => ((s.structureType == STRUCTURE_SPAWN
                             || s.structureType == STRUCTURE_EXTENSION
                             || s.structureType == STRUCTURE_TOWER)
                             && s.energy < s.energyCapacity * 0.9)
            });
            


            // // If still there is still no target, try to use a storage
            if (!target) {
                target = this.room.storage;
            }
        }


        if (target) {
            
            if (this.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.memory.action = this.depositEnergy;
                this.memory.target = target;
                this.moveTo(target);
                return true;
            }
            else {
                this.memory.action = this.depositEnergy;
                this.memory.target = target;
                return true;
            }


        }
        else {
            this.action = undefined;
            this.target = undefined;
            return false;
        }
    };


/** @function 
    @param {Structure} target */
    Creep.prototype.upgrade =
    function (target) {

        if (!target) {
            target = this.room.controller;
        }


        if (target) {
            if (this.upgradeController(this.room.controller) == ERR_NOT_IN_RANGE) {
                this.memory.action = this.upgrade;
                this.memory.target = target;
                this.moveTo(target);
                return true;
            }
            else {
                this.action = undefined;
                this.target = undefined;
                return true;
            }


        }
        else {
            this.action = undefined;
            this.target = undefined;
            return false;
        }
    };


/** @function 
    @param {ConstructionSite} target */
    Creep.prototype.buildConstruction =
    function (target) {

        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        }


        if (target) {
            if (this.build(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = this.buildConstruction;
                this.memory.target = target;
                this.moveTo(target);
                return true;
            }
            else {
                this.action = undefined;
                this.target = undefined;
                return true;
            }


        }
        else {
            this.action = undefined;
            this.target = undefined;
            return false;
        }
    };



/** @function 
    @param {Structure} target */
    Creep.prototype.repairStructure =
    function (target) {

        if (!target) {
            let targets = this.room.find(FIND_STRUCTURES,{ 
                filter: (s) => s.hits < s.hitsMax && s.structureType != STRUCTURE_WALL
            });

            target = _.sortBy(targets, s => s.hits)[0];
        }


        if (target) {
            if (this.repair(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = this.repairStructure;
                this.memory.target = target;
                this.moveTo(target);
                return true;
            }
            else {
                this.action = undefined;
                this.target = undefined;
                return true;
            }


        }
        else {
            this.action = undefined;
            this.target = undefined;
            return false;
        }
    };


/** @function 
    @param {StructureWall} target */
    Creep.prototype.repairWall =
    function (target) {

        if (!target) {
            let targets = this.room.find(FIND_STRUCTURES,{ 
                filter: (s) => s.hits < s.hitsMax && s.structureType == STRUCTURE_WALL
            });

            target = _.sortBy(targets, s => s.hits)[0];
        }


        if (target) {
            if (this.repair(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = this.repairWall;
                this.memory.target = target;
                this.moveTo(target);
                return true;
            }
            else {
                this.action = undefined;
                this.target = undefined;
                return true;
            }


        }
        else {
            this.action = undefined;
            this.target = undefined;
            return false;
        }
    };