module.exports = {
    // a function to run the logic for this role
    /** @param {Creep} creep */
    run: function(creep) {
        
        if (creep.memory.action && creep.memory.target) {
            creep.execAction(creep.memory.action, creep.memory.target.id);
        }
        let isAboveContainer = creep.room.find(FIND_STRUCTURES,{
            filter: s => s.structureType == STRUCTURE_CONTAINER &&
                         s.pos.isEqualTo(creep.pos)
            }).length;


        if (!isAboveContainer) {

            let otherMiners = creep.room.find(FIND_CREEPS,{
                filter: c => c.memory.role == 'miner' && c != creep
            });
    
            let allContainers = creep.room.find(FIND_STRUCTURES,{
                filter: s => s.structureType == STRUCTURE_CONTAINER
            });
    
            let targets = []
    
            for (let container in allContainers){
                let available = true;
                for (let miner in otherMiners){
                    
                    if (otherMiners[miner].pos.isEqualTo(allContainers[container].pos)) {
                        available = false;
                        break;
                    }
                }
                if (available) {
                    targets.push(allContainers[container]);
                }
            }

            target = _.sortBy(targets, s => creep.pos.getRangeTo(s))[0];

            if (target) {
                creep.moveTo(target);
            }

            
        }
        // if creep is supposed to harvest energy from source
        else {
            creep.memory.action = 'harvest';
            creep.memory.target = creep.pos.findClosestByPath(FIND_SOURCES);

            creep.harvest(creep.memory.target);
        }
    }
};