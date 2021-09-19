/** @function 
    @param {Structure} target */
    Creep.prototype.repairStructure =
    function (target) {
        if (!target) {
            let targets = this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.hits < s.hitsMax
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
            else {
                this.say('*Pew!*');
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