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
            else if (this.store['energy']) {
                this.say('*Pew!*');
                this.memory.action = 'upgrade';
                this.memory.target = target;
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