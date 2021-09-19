require('prototype.creep.buildConstruction');
require('prototype.creep.depositEnergy');
require('prototype.creep.getEnergy');
require('prototype.creep.repairStructure');
require('prototype.creep.repairWall');
require('prototype.creep.smartMove');
require('prototype.creep.upgrade');

var roles = {
    builder: require('role.builder'),
    claimer: require('role.claimer'),
    distributor: require('role.distributor'),
    harvester: require('role.harvester'),
    miner: require('role.miner'),
    repairer: require('role.repairer'),
    transporter: require('role.transporter'),
    upgrader: require('role.upgrader'),
    wallRepairer: require('role.wallRepairer')
};

Creep.prototype.runRole =
    function () {

        if (!this.memory || !this.memory.role) {
            this.memory = { 'role': 'harvester' }
        }
        if (this.ticksToLive > 1) {
            roles[this.memory.role].run(this);
        }
        else {
            this.drop(RESOURCE_ENERGY);
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
            default:
                this.memory.action = undefined;
                this.memory.target = undefined;
        }
    }