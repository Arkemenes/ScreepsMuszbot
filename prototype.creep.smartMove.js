/** @function 
    @param {Structure} target */
Creep.prototype.smartMove =
    function (target) {


        let near = this.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {filter: r => r.energy > 20})[0];

        if (!near) {
            near = this.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => (s.structureType == STRUCTURE_CONTAINER)
                    && s.store.energy.valueOf() > 50
            })[0];
        }

        if (this.store.getFreeCapacity() > 0 && near) {
            if (this.harvest(near) == ERR_NOT_IN_RANGE || this.withdraw(near, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE || this.pickup(near) == ERR_NOT_IN_RANGE) {
                this.moveTo(near, { reusePath: 5 });
            }
            if (this.memory.action == 'harvest') {
                this.memory.action = undefined;
                this.memory.target = undefined;
            }
        }
        else {
            this.moveTo(target, { reusePath: 5 });
        }



    };

