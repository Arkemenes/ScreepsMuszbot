let roleTower = {

    /** @param {StructureTower} tower **/
    run: function(tower) {

        let closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if(closestHostile) {
            tower.attack(closestHostile);
        }
        if (tower.store.energy > 0.9 * tower.store.getCapacity(RESOURCE_ENERGY)) {

            let closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (structure) => structure.hits < structure.hitsMax && structure.structureType != STRUCTURE_WALL
            });
            if(closestDamagedStructure) {
                tower.repair(closestDamagedStructure);
            }

            if (Game.time % 5 == 0) {
                let closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: (structure) => structure.hits < structure.hitsMax
                });
                if(closestDamagedStructure) {
                    tower.repair(closestDamagedStructure);
                }
            }
            
        }


        
    }
};

module.exports = roleTower;