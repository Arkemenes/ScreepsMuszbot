var roleMiner = {

    /** @param {Creep} creep **/
    run: function(creep) {

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

        if (targets) {

            target = _.sortBy(targets, s => creep.pos.getRangeTo(s))[0];

            // if creep is on top of the container
            if (creep.pos.isEqualTo(target.pos)) {
                
                let source = creep.pos.findInRange(FIND_SOURCES, 1, {
                    filter: (source) => {
                        return (source.energy > 0);
                    }
                })[0];

                creep.harvest(source);
            }
            // if creep is not on top of the container
            else {
                // move towards it
                creep.moveTo(target);
        }

        }

    }
};

module.exports = roleMiner;