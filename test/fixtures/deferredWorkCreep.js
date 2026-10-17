// Synchronous API stub: accepted calls replace intent slots without mutating stores.
// Resolution expectations in energyIntentCases follow screeps/engine commit
// 80977824199a596d174d392fd0cf8c458c21fcbd (intents/build/repair/upgradeController).
let nextId = 0;
module.exports = function (room, n = 2, energy = 100, capacity = 100) {
    class Worker {
        constructor() {
            this.id = "worker:" + ++nextId;
            this.name = this.id;
            this.room = { name: room };
            this.memory = { role: "builder" };
            this.body = Array.from({ length: n }, () => ({ type: WORK, hits: 100 }));
            this.store = { energy, getCapacity: () => capacity, getFreeCapacity: () => capacity - energy };
            this.intents = {};
            this.trace = [];
        }
        accept(method, args) {
            this.trace.push([method, args[0] && args[0].id || args[0]]);
            if (args[0] && args[0].throwError) throw args[0].throwError;
            if (args[0] && args[0].reject) return ERR_NOT_IN_RANGE;
            this.intents[method] = args;
            return OK;
        }
        build(...args) { return this.accept("build", args); }
        repair(...args) { return this.accept("repair", args); }
        upgradeController(...args) { return this.accept("upgradeController", args); }
        drop(...args) { return this.accept("drop", args); }
        transfer(...args) { return this.accept("transfer", args); }
        withdraw(...args) { return this.accept("withdraw", args); }
        pickup(...args) { return this.accept("pickup", args); }
        heal(...args) { return this.accept("heal", args); }
        rangedHeal(...args) { return this.accept("rangedHeal", args); }
        dismantle(...args) { return this.accept("dismantle", args); }
        attackController(...args) { return this.accept("attackController", args); }
        harvest(...args) { return this.accept("harvest", args); }
        suicide(...args) { return this.accept("suicide", args); }
        cancelOrder(method) {
            this.trace.push(["cancelOrder", method]);
            if (!this.intents[method]) return ERR_NOT_FOUND;
            delete this.intents[method];
            return OK;
        }
    }
    return new Worker();
};
