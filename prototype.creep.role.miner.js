/** @function */
Creep.prototype.runRoleMiner =
    function () {
        
        if (this.room.name != this.memory.targetRoom) {

            let exitDir = Game.map.findExit(this.room.name, this.memory.targetRoom);
            let Exit = this.pos.findClosestByPath(exitDir);
            this.memory.action = 'getEnergy';
            this.memory.target = target;
            this.moveTo(Exit);
            return true;
        }

        if (this.memory.action = 'moveTo' && Game.time % 10 == 0) {
            this.memory.target = undefined;
        }

        if (this.memory.action && this.memory.target && (this.pos.x != this.memory.target.pos.x || this.pos.y != this.memory.target.pos.y)) {
            this.execAction(this.memory.action, this.memory.target.id);
        }
        else {

            let isAboveContainer = this.room.find(FIND_STRUCTURES, {
                filter: s => s.structureType == STRUCTURE_CONTAINER &&
                    s.pos.isEqualTo(this.pos)
            }).length;



            if (!isAboveContainer) {

                let otherMiners = this.room.find(FIND_MY_CREEPS, {
                    filter: c => c.memory && c.memory.role == 'miner' && c != this
                });

                let allContainers = this.room.find(FIND_STRUCTURES, {
                    filter: s => s.structureType == STRUCTURE_CONTAINER
                });

                let targets = []

                for (let container in allContainers) {
                    let available = true;
                    for (let miner in otherMiners) {

                        if (otherMiners[miner].pos.isEqualTo(allContainers[container].pos)) {
                            available = false;
                            break;
                        }
                    }
                    if (available) {
                        targets.push(allContainers[container]);
                    }
                }

                target = _.sortBy(targets, s => this.pos.getRangeTo(s))[0];

                if (target) {
                    this.moveTo(target);
                    this.memory.action = 'moveTo'
                    this.memory.target = target
                }


            }
            // if creep is supposed to harvest energy from source
            else {
                this.memory.action = 'harvest';
                let target = this.pos.findInRange(FIND_SOURCES, 1)[0];

                if (!target) {
                    target = this.pos.findInRange(FIND_MINERALS, 1)[0];
                }

                this.memory.target = target;


                this.harvest(target)
            }
        }

    };