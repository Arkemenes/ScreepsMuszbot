const { isAlly, isHostile, bodyInfo } = require("../utils/hostiles");
const roomCache = require("../utils/roomCache");
const cadence = require("../utils/cadence");
const cpuMeter = require("../utils/cpuMeter");
const rampartGates = require("../utils/rampartGates");

// One decision per room per tick (it used to be one per rampart, 82 a tick, each with its own
// distance checks): the "gate" ramparts - the few an ally crossing the room has to walk over,
// utils/rampartGates - are public while an ally is in the room and nobody threatening is.
// Every other rampart stays closed. A threat is a non-ally that is armed or has WORK (the
// definition of utils/hostiles, Invader included) or CLAIM (it could take the controller):
// closing is immediate, and a handful of intents (~0.2 CPU each) at most.
const SWEEP_TICKS = 60;
const swept = {};

function roomState(room) {
    let allies = 0;
    const foreign = roomCache.foreignCreeps(room);
    for (let i = 0; i < foreign.length; i++) {
        const creep = foreign[i];
        const name = creep.owner && creep.owner.username;
        if (isAlly(name)) {
            allies++;
        } else if (isHostile(creep, room) || bodyInfo(creep).parts[CLAIM]) {
            return { allies, threat: true };
        }
    }
    return { allies, threat: false };
}

var rampart = {
    /** @param {Room} room **/
    runRoom: function (room) {
        const { allies, threat } = roomState(room);
        const open = allies > 0 && !threat;
        const info = rampartGates.ensure(room);

        const start = Game.cpu.getUsed();
        let toggled = 0;
        for (let i = 0; i < info.ids.length; i++) {
            const gate = Game.getObjectById(info.ids[i]);
            if (gate && open !== !!gate.isPublic) {
                gate.setPublic(open);
                toggled++;
            }
        }

        // Anything public that is not a gate (left by the old per-rampart logic, or by a gate that
        // moved): closed once after a reset, when the gate set changes, and every SWEEP_TICKS.
        if (info.dirty || cadence.due(swept[room.name], SWEEP_TICKS)) {
            const isGate = {};
            info.ids.forEach((id) => { isGate[id] = true; });
            const ramparts = rampartGates.rampartsOf(room);
            for (let i = 0; i < ramparts.length; i++) {
                if (ramparts[i].isPublic && !isGate[ramparts[i].id]) {
                    ramparts[i].setPublic(false);
                    toggled++;
                }
            }
            info.dirty = false;
            swept[room.name] = Game.time;
        }
        if (toggled) cpuMeter.record("spans", "rampart.toggle", Game.cpu.getUsed() - start);
    },
};

rampart.resetSweep = function () {
    Object.keys(swept).forEach((name) => { delete swept[name]; });
};

module.exports = rampart;
