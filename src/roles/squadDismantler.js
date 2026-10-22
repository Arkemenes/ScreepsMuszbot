const squad = require("../utils/squad");
const names = require("../utils/names");
const { silenceAttackAlerts } = require("../utils/combat");

// WORK half of a "siege" squad (ROADMAP 0032 Fase 4, O5) - breaches
// rampart/wall so a "combat" mission (or a follow-up one) can get through.
// Only ever exists inside a squad (spawned via rooms/raiding.js's
// spawnPendingSquad, never through the normal per-role spawn loop - see
// spawn()/wanted() below) - no solo mode, so it retires once its squad is
// gone rather than falling back to anything.

function getBody(energy) {
    // WORK + MOVE, 1:1 (same speed-matching reasoning as every other squad
    // body - ROADMAP 0032 D1/Fase 4), MOVE last.
    const unitCost = BODYPART_COST[WORK] + BODYPART_COST[MOVE];
    const n = Math.max(1, Math.min(25, Math.floor(energy / unitCost)));
    const body = [];
    for (let i = 0; i < n; i++) body.push(WORK);
    for (let i = 0; i < n; i++) body.push(MOVE);
    return body;
}

const squadDismantler = {
    run(creep) {
        silenceAttackAlerts(creep); // ROADMAP 0052 - always breaching a hostile structure by design
        if (!creep.memory.squadId) {
            if (creep.memory.pendingSquad) {
                squad.registerPending(creep);
                return;
            }
            // no squad, never had one, nothing else this role is for
            creep.suicide();
            return;
        }

        squad.advance(creep, creep.memory.squadId);

        const target = squad.attackTarget(creep, creep.memory.squadId);
        if (target && creep.pos.getRangeTo(target) <= 1) {
            creep.dismantle(target);
        }
    },

    // Never part of the normal per-room spawn queue - only
    // rooms/raiding.js's spawnPendingSquad() ever builds one.
    wanted() {
        return 0;
    },
    spawn() {
        return false;
    },

    spawnData(room) {
        return {
            name: names.generate("squadDismantler"),
            body: getBody(room.energyAvailable),
            memory: { role: "squadDismantler", home: room.name },
        };
    },
};

module.exports = squadDismantler;
