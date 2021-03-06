require('prototype.creep.buildConstruction');
require('prototype.creep.depositEnergy');
require('prototype.creep.getEnergy');
require('prototype.creep.repairStructure');
require('prototype.creep.repairWall');
require('prototype.creep.smartMove');
require('prototype.creep.upgrade');

require('prototype.creep.role.defender')
require('prototype.creep.role.builder')
require('prototype.creep.role.claimer')
require('prototype.creep.role.logistic')
require('prototype.creep.role.harvester')
require('prototype.creep.role.miner')
require('prototype.creep.role.repairer')
require('prototype.creep.role.scout')
require('prototype.creep.role.transporter')
require('prototype.creep.role.upgrader')
require('prototype.creep.role.wallRepairer')

Creep.prototype.runRole =
    function () {
        if (this.ticksToLive <= 5) {
            this.drop(RESOURCE_ENERGY);
            return false;
        } 

        if (!this.memory || !this.memory.role) {
            this.memory = { 'role': 'harvester' }
        }
        

        switch (this.memory.role) {
            case 'defender':
                this.runRoleDefender();
                break;
            case 'builder':
                this.runRoleBuilder();
                break;
            case 'claimer':
                this.runRoleClaimer();
                break;
            case 'logistic':
                this.runRoleLogistic();
                break;
            case 'harvester':
                this.runRoleHarvester();
                break;
            case 'miner':
                this.runRoleMiner();
                break;
            case 'repairer':
                this.runRoleRepairer();
                break;
            case 'scout':
                this.runRoleScout();
                break;
            case 'transporter':
                this.runRoleTransporter();
                break;
            case 'upgrader':
                this.runRoleUpgrader();
                break;
            case 'wallRepairer':
                this.runRoleWallRepairer();
                break;
            default:
                this.memory.role = 'harvester'
                this.memory.action = undefined;
                this.memory.target = undefined;
        }

        // Avoid getting stucked on border
        if (this.pos.x == 49 || this.pos.x == 0 || this.pos.y == 49 || this.pos.y == 49) {
            this.moveTo(25,25);
        }
        


    };


/** @function 
    @param {string} action
    @param {string} targetID */
Creep.prototype.execAction =
    function (action, targetID) {

        target = Game.getObjectById(targetID);

        switch (action) {
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
            case 'moveTo':
                this.moveTo(target);
                break;
            default:
                this.memory.action = undefined;
                this.memory.target = undefined;
        }
    }