const census = require("../utils/census");
const combat = require("../utils/combat");
const squad = require("../utils/squad");
const { roomNeeds } = require("../rooms/needs");
const names = require("../utils/names");

// HEAL half of the striker+medic pair (ROADMAP 0032 D2). Follows its
// defenderStriker partner and keeps it alive.
//
// Deliberately does NOT use utils/combat.js's takeCover() - that one gives
// any unarmed creep a wide berth (safeRange, default 5 tiles) from any
// threat, which is right for a builder/upgrader but would fight the
// medic's entire job: staying within healing range of its partner through
// an actual firefight, which routinely puts it within 5 tiles of a
// hostile. Instead it only backs off when a melee hostile is directly
// adjacent to IT specifically (real, immediate danger - it has no
// ATTACK/RANGED_ATTACK to answer with).

function getBody(energy) {
    // HEAL + MOVE, 1:1 ratio, MOVE last (same reasoning as defender.js's
    // D1 - protect the ability to keep up with its partner longest; a
    // medic that falls behind is a medic that stops mattering).
    const unitCost = BODYPART_COST[HEAL] + BODYPART_COST[MOVE];
    const n = Math.max(1, Math.min(16, Math.floor(energy / unitCost)));
    const body = [];
    for (let i = 0; i < n; i++) body.push(HEAL);
    for (let i = 0; i < n; i++) body.push(MOVE);
    return body;
}

const defenderMedic = {
    run(creep) {
        // squad mode (ROADMAP 0032 Fase 4, O5) - same idea as
        // defenderStriker.js: positioning comes from utils/squad.js, this
        // role just keeps healing whoever's hurt nearby (usually a
        // squad-mate, combat.patch doesn't care which).
        if (creep.memory.squadId) {
            squad.advance(creep, creep.memory.squadId);
            combat.patch(creep);
            return;
        }
        if (creep.memory.pendingSquad) {
            squad.registerPending(creep);
            return;
        }

        const partner = combat.ensurePartner(creep, "defenderStriker");

        const mem = Memory.rooms[creep.room.name] || {};
        if (mem.defenseActive) {
            const dangers = combat.threats(creep.room);
            const meleeAdjacent = _.some(
                dangers,
                (h) => combat.hasMelee(h) && creep.pos.getRangeTo(h) <= 1
            );
            if (meleeAdjacent) {
                combat.act(creep);
                combat.kiteAwayFrom(creep, dangers);
                combat.patch(creep);
                return;
            }
        }

        if (!mem.defenseActive) combat.idle(creep, creep.memory.room && creep.room.name !== creep.memory.room ? "outOfRoom" : "noHostile");
        else if (!partner) combat.idle(creep, "noPartner");
        else combat.act(creep);

        if (partner && creep.pos.getRangeTo(partner) > combat.KITE_RANGE - 1) {
            creep.moveTo(partner, { range: combat.KITE_RANGE - 1, reusePath: 5 });
        }

        // heals self first, then the nearest wounded ally in reach - no
        // partner yet (or it died): still useful, patches up whoever's
        // hurt nearby instead of standing idle
        combat.patch(creep);
    },

    wanted(room) {
        return roomNeeds(room).defenderMedic;
    },

    spawn(room) {
        if (room.energyAvailable < BODYPART_COST[HEAL] + BODYPART_COST[MOVE]) {
            return false;
        }
        return census.count(room.name, "defenderMedic", 0) < this.wanted(room);
    },

    spawnData(room) {
        return {
            name: names.generate("defenderMedic"),
            body: getBody(room.energyAvailable),
            memory: { role: "defenderMedic", room: room.name },
        };
    },
};

module.exports = defenderMedic;
