// create a new function for StructureLink
StructureLink.prototype.isCollector =
    function () {
        let nearContainer = this.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: (s) => s.structureType == STRUCTURE_CONTAINER
        })[0];

        return nearContainer != undefined;
        
    };

Structure.prototype.runRoleLink =
    function () {
        if (this.isCollector() && this.store['energy'] >= 50 && this.isActive()){


            let nonCollectorLinks = this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_LINK 
                            && !s.isCollector()

            });
            let target = _.sortBy(nonCollectorLinks, s => s.store.getFreeCapacity())[0];
            this.transferEnergy(target);
        }
    };