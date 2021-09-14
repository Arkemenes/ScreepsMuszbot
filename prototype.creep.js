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
    @param {string} action
    @param {string} targetID */
Creep.prototype.execAction = 
    function (action, targetID) {

        target = Game.getObjectById(targetID);

        switch(action) {
            case 'getEnergy':
                this.getEnergy(target);
                break;
            case 'depositEnergy':
                this.depositEnergy(target);
                break;
            case 'upgrade':
                this.upgrade(target);
                break;
            case 'buildConstruction':
                this.buildConstruction(target);
                break;
            case 'repairStructure':
                this.repairStructure(target);
                    break;
            case 'repairWall':
                this.repairWall(target);
                    break;
            case 'harvest':
                this.harvest(target);
                    break;
            default:
                this.memory.action = undefined;
                this.memory.target = undefined;
          }
    }

/** @function 
    @param {Structure} target */
Creep.prototype.getEnergy =
    function (target) {

        Game.getObjectById()
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

            
            if (!target) {
                let numberofMiners = _.sum(Game.creeps, (c) => c.memory.role == 'miner');
                if (this.memory.role == 'miner' || !numberofMiners) {
                    target = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
                }
            }
        }

        if (target) {
            if (this.harvest(target) == ERR_NOT_IN_RANGE || this.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'getEnergy';
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


/** @function 
    @param {Structure} target */
    Creep.prototype.smartMove =
    function (target) {

        let near = this.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => (s.structureType == STRUCTURE_CONTAINER)
                         && s.store.energy.valueOf() >= 50})[0];

        
        if (this.store.getFreeCapacity() > 0 && near) {
            let prev = this.store.energy.valueOf();
            if (this.withdraw(near, RESOURCE_ENERGY) != 0) {
                this.harvest(near);
            }
            if (this.memory.action == 'harvest') {
                this.memory.action = undefined;
                this.memory.target = undefined;
            }
        }
        else {
            this.moveTo(target);
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


/** @function 
    @param {Structure} target */
    Creep.prototype.upgrade =
    function (target) {

        if (!target) {
            target = this.room.controller;
        }


        if (target) {
            if (this.upgradeController(this.room.controller) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'upgrade';
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


/** @function 
    @param {ConstructionSite} target */
    Creep.prototype.buildConstruction =
    function (target) {

        if (!target) {
            target = this.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        }


        if (target) {
            if (this.build(target) == ERR_NOT_IN_RANGE) {
                this.memory.action = 'buildConstruction';
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
                this.memory.action = 'repairStructure';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if (target.hits != target.hitsMax && this.store.getUsedCapacity() > 0) {
                this.memory.action = 'repairWall';
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
                this.memory.action = 'repairWall';
                this.memory.target = target;
                this.smartMove(target);
                return true;
            }
            else if (target.hits != target.hitsMax && this.store.getUsedCapacity() > 0) {
                this.memory.action = 'repairWall';
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