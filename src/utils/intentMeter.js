"use strict";
// ARK-116: base operations. Every game action that returns OK (an intent: harvest, move,
// transfer, repair, runReaction...) costs a flat 0.2 CPU whatever the code around it does
// - the floor that only fewer creeps/structures or fewer actions per creep can lower.
// The action methods are wrapped once per global and count their OK results; main.js folds
// the counts into the cpuMeter "intents" group each tick (cpu = count * INTENT_CPU), so
// Memory.stats.cpu.meter.intents.<class.method> and .intentCpu publish them per tick.
// The wrapper is one apply() and a compare per call - far below the 0.2 it measures.
const INTENT_CPU = 0.2;
// say and pull are not wrapped: the driver's freeMethods charge them nothing
// (screeps/driver lib/runtime/runtime.js, intents.set).

const ACTIONS = {
    Creep: ["attack", "attackController", "build", "claimController", "dismantle", "drop",
        "generateSafeMode", "harvest", "heal", "move", "notifyWhenAttacked", "pickup",
        "rangedAttack", "rangedHeal", "rangedMassAttack", "repair", "reserveController",
        "signController", "suicide", "transfer", "upgradeController", "withdraw"],
    PowerCreep: ["drop", "enableRoom", "move", "notifyWhenAttacked", "pickup", "renew",
        "suicide", "transfer", "usePower", "withdraw"],
    StructureSpawn: ["spawnCreep", "recycleCreep", "renewCreep"],
    StructureTower: ["attack", "heal", "repair"],
    StructureLink: ["transferEnergy"],
    StructureLab: ["runReaction", "reverseReaction", "boostCreep", "unboostCreep"],
    StructureTerminal: ["send"],
    StructureFactory: ["produce"],
    StructurePowerSpawn: ["processPower"],
    StructureObserver: ["observeRoom"],
    StructureNuker: ["launchNuke"],
    StructureController: ["activateSafeMode", "unclaim"],
};

let counts = {};
let installed = false;

function label(cls) {
    if (cls === "Creep") return "creep";
    if (cls === "PowerCreep") return "powerCreep";
    return cls.replace(/^Structure/, "").toLowerCase();
}

function wrap(proto, name, key) {
    const original = proto[name];
    if (typeof original !== "function" || original.intentKey) return;
    // spawnCreep({dryRun: true}) answers OK without spawning anything
    const dryRunAware = name === "spawnCreep";
    const wrapped = function () {
        const result = original.apply(this, arguments);
        if (result === 0 && !(dryRunAware && arguments[2] && arguments[2].dryRun)) counts[key] = (counts[key] || 0) + 1;
        return result;
    };
    wrapped.intentKey = key;
    proto[name] = wrapped;
}

// Idempotent; call after src/prototypes has replaced Creep.prototype.move/moveTo, so the
// wrapper sits outside the traffic recorder and moveTo's own move() call is counted once.
function install() {
    if (installed) return;
    installed = true;
    Object.keys(ACTIONS).forEach((cls) => {
        const ctor = global[cls];
        if (!ctor || !ctor.prototype) return;
        ACTIONS[cls].forEach((name) => wrap(ctor.prototype, name, label(cls) + "." + name));
    });
}

// This tick's counts per "class.method"; starts the next tick from zero.
function drain() {
    const out = counts;
    counts = {};
    return out;
}

module.exports = { install, drain, wrap, INTENT_CPU };
