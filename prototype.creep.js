/** Example state - goto location */
Creep.prototype.runGoto = function (scope) {
    var { pos, range = 1 } = scope;
    var roomPos = _.create(RoomPosition.prototype, pos);
    if (this.moveTo(roomPos, { range: range }) === ERR_NO_PATH) this.popState();
};

/** Example state - goto room */
Creep.prototype.runGotoRoom = function (scope) {
    if (this.moveToRoom(scope) === ERR_NO_PATH) this.popState();
};

/** Example state - goto room */
Creep.prototype.runGetEnergy = function (scope) {
    let target = Game.getObjectById(scope);

    // Check if the creep is not in range of the target
    if (!this.pos.isNearTo(target)) {
        // Move towards the target using the moveTo() function
        const moveStatus = this.moveTo(target);
        if (moveStatus != OK && moveStatus != ERR_TIRED) {
            this.popState();
            return false;
        }
    }

    // Determine the action based on the target's type
    if (target instanceof Structure || target instanceof Ruin) {
        // For structures, check if it has energy and withdraw it
        if (target.store && target.store[RESOURCE_ENERGY] > 0) {
            if (this.withdraw(target, RESOURCE_ENERGY) != OK) {
                this.popState();
                return false;
            }
        }
    } else if (target instanceof Resource) {
        // For resources, check if it is energy and pick it up
        if (target.resourceType === RESOURCE_ENERGY) {
            if (this.pickup(target) != OK) {
                this.popState();
                return false;
            }
        }
    }

    if (!this.store.getFreeCapacity()) {
        this.popState();
        return false;
    }
};

/** Example state - goto room */
Creep.prototype.runUpgrade = function (scope) {
    let target = Game.getObjectById(scope);

    const status = this.upgradeController(target);

    if (status == ERR_NOT_IN_RANGE) {
        const moveStatus = this.moveTo(target);
        if (moveStatus != OK && moveStatus != ERR_TIRED) {
            this.popState();
            return false;
        }
    }

    if (!this.store.getUsedCapacity()) {
        this.popState();
    }
};
