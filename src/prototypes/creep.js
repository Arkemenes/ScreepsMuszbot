const energyLedger = require("../utils/energyLedger");
const speak = require("../utils/speech");
energyLedger.installHooks(Creep.prototype);

/** Example state - goto location */
Creep.prototype.runGoto = function (scope) {
    var { pos, range = 1 } = scope;
    var roomPos = _.create(RoomPosition.prototype, pos);
    if (this.moveTo(roomPos, { range: range }) === ERR_NO_PATH) this.popState();
};

/** Example state - goto room */
Creep.prototype.runGetEnergy = function (scope) {
    let target = Game.getObjectById(scope);

    // Target gone (mined out, picked up by someone else, out of view)
    if (!target) {
        this.popState();
        return false;
    }

    // Check if the creep is not in range of the target
    if (!this.pos.isNearTo(target)) {
        // Move towards the target using the moveTo() function
        const moveStatus = this.moveTo(target);
        if (moveStatus != OK && moveStatus != ERR_TIRED) {
            this.popState();
            return false;
        }
    } else if (target instanceof Source) {
        const status = this.harvest(target);
        if (status === ERR_NOT_IN_RANGE) {
            this.moveTo(target);
        } else if (status !== OK) {
            this.popState();
            return false;
        }
    }

    // Determine the action based on the target's type
    if (
        target instanceof Structure ||
        target instanceof Ruin ||
        target instanceof Tombstone
    ) {
        // For structures / ruins / tombstones, withdraw stored energy
        if (target.store && target.store[RESOURCE_ENERGY] > 0) {
            const trackBoost = Memory.rooms && Memory.rooms[this.room.name] && Memory.rooms[this.room.name].labBoostReservations;
            const amount = trackBoost ? Math.min(target.store[RESOURCE_ENERGY], this.store.getFreeCapacity(RESOURCE_ENERGY)) : 0;
            if (this.withdraw(target, RESOURCE_ENERGY) != OK) {
                this.popState();
                return false;
            }
            if (trackBoost)
                require("../utils/boostLogistics").energyWithdrawn(this, target, amount);
        } else if (this.pos.isNearTo(target)) {
            // in range but the store ran dry - stop waiting on it
            this.popState();
            return false;
        }
    } else if (target instanceof Resource) {
        // For resources, check if it is energy and pick it up
        if (target.resourceType === RESOURCE_ENERGY) {
            if (this.pickup(target) != OK) {
                this.popState();
                return false;
            }
        }
    } else if (target instanceof Source) {
        const status = this.harvest(target);
        if (status === ERR_NOT_IN_RANGE) {
            this.moveTo(target);
        } else if (status !== OK) {
            this.popState();
            return false;
        }
    }

    if (!this.store.getFreeCapacity()) {
        this.popState();
        return false;
    }
};

/** Deliver energy to a structure (by id). Pops when empty, or the target is
 *  gone / full / rejects the transfer. */
Creep.prototype.runDeposit = function (scope) {
    let target = Game.getObjectById(scope);
    if (require("../utils/bootstrapStorage").isBuffer(this.room, target) && target !== this.room.storage)
        target = this.room.storage;
    if (!target || !target.store) {
        this.popState();
        return false;
    }

    if (this.store[RESOURCE_ENERGY] === 0) {
        this.popState();
        return;
    }

    const status = this.transfer(target, RESOURCE_ENERGY);
    if (status === ERR_NOT_IN_RANGE) {
        const moveStatus = this.moveTo(target);
        if (moveStatus != OK && moveStatus != ERR_TIRED) {
            this.popState();
            return false;
        }
    } else if (status !== OK) {
        this.popState();
        return false;
    } else {
        // transferred this tick - re-evaluate next tick
        this.popState();
    }
};

/** Example state - goto room */
Creep.prototype.runUpgrade = function (scope) {
    let target = Game.getObjectById(scope);

    const status = energyLedger.invoke(this, "upgradeController", target);

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

/** Example state - goto room */
Creep.prototype.runBuild = function (scope) {
    let target = Game.getObjectById(scope);

    // Determine the action based on the target's type
    if (target instanceof ConstructionSite) {
        let status = energyLedger.invoke(this, "build", target);

        if (status == OK) {
            speak(this, "~Pew!~");
        } else if (status == ERR_NOT_IN_RANGE) {
            this.moveTo(target);
        } else {
            this.popState();
            return false;
        }

        if (!this.store.getUsedCapacity()) {
            this.popState();
        }

        return true;
    } else if (target instanceof Structure) {
        let status = energyLedger.invoke(this, "repair", target);

        if (status == OK) {
            speak(this, "~Pew!~");
        } else if (status == ERR_NOT_IN_RANGE) {
            this.moveTo(target);
        } else {
            this.popState();
            return false;
        }

        if (target.hits == target.hitsMax) {
            this.popState();
        }

        if (!this.store.getUsedCapacity()) {
            this.popState();
        }

        return true;
    } else {
        this.popState();
        return false;
    }
};
