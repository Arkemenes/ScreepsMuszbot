const { getHostiles } = require("../utils/hostiles");
const census = require("../utils/census");
const combat = require("../utils/combat");
const { roomNeeds } = require("../rooms/needs");
const names = require("../utils/names");

// Solo generalist kiter (ranged + self-heal). Fallback for a room whose
// energyCapacityAvailable can't yet afford a real defenderStriker +
// defenderMedic pair (ROADMAP 0032 Fase 2) - once it can, roomNeeds()
// wants the pair instead and this role's count drops to 0 for that room.
// Targeting/shooting/healing/kiting all live in utils/combat.js, shared
// with the two roles above (constitution §5).

function getBody(energy) {
    // ~1:1 MOVE ratio so the defender can actually hold range while kiting
    // (a fatigue-locked ranged creep just gets run down by melee).
    //
    // MOVE parts come LAST deliberately (ROADMAP 0032 D1). Screeps damages
    // body parts in array order from index 0 - putting the cheap/disposable
    // part first is the right call for a body that stands still (a future
    // rampart tank, D3), but backwards for a kiter: losing a MOVE first
    // drops the MOVE:body ratio below 1:1, so the creep gets slower right
    // when it most needs to outrun melee, and ends up immobile (a sitting
    // duck) once all MOVE is gone while the weapon/heal are still intact.
    // With MOVE last, mobility survives until the very end - the defender
    // can always retreat, even reduced to "legs only" after losing its
    // weapon and heal.
    if (energy >= 700) {
        return [RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE, MOVE, MOVE];
    }
    if (energy >= 400) {
        return [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE];
    }
    return [RANGED_ATTACK, MOVE];
}

const defender = {
    run(creep) {
        const mem = Memory.rooms[creep.room.name] || {};
        const hostiles = mem.defenseActive ? getHostiles(creep.room) : [];

        // ---- nothing to fight: mend allies, otherwise wait near the spawn ----
        if (!hostiles.length) {
            const injured = mem.defenseActive
                ? creep.pos.findClosestByRange(FIND_MY_CREEPS, {
                      filter: (a) => a.hits < a.hitsMax,
                  })
                : null;
            if (injured) {
                const range = creep.pos.getRangeTo(injured);
                if (range <= 1) creep.heal(injured);
                else if (range <= combat.KITE_RANGE) creep.rangedHeal(injured);
                else creep.moveTo(injured, { reusePath: 10 });
                return;
            }
            if (creep.hits < creep.hitsMax) creep.heal(creep);
            const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
            if (spawn && creep.pos.getRangeTo(spawn) > 5) {
                creep.moveTo(spawn, { reusePath: 20 });
            }
            return;
        }

        // ---- combat: shoot + heal every tick, then reposition ----
        combat.shoot(creep, hostiles);
        combat.patch(creep);

        const meleeClosing = _.some(
            hostiles,
            (h) => combat.hasMelee(h) && creep.pos.getRangeTo(h) <= combat.KITE_RANGE
        );

        if (meleeClosing) {
            // back off around obstacles; if cornered, retreat to the spawn
            if (!combat.kiteAwayFrom(creep, hostiles)) {
                const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
                if (spawn) creep.moveTo(spawn, { reusePath: 5 });
            }
            return;
        }

        // no melee bearing down: sit at the edge of our range on the target
        const target = combat.pickTarget(creep.room);
        if (target) {
            const range = creep.pos.getRangeTo(target);
            if (range > combat.KITE_RANGE) {
                creep.moveTo(target, { range: combat.KITE_RANGE, reusePath: 3 });
            } else if (range < combat.KITE_RANGE) {
                // too close to a purely-ranged enemy - ease back out
                combat.kiteAwayFrom(creep, hostiles);
            }
        }
    },

    wanted(room) {
        return roomNeeds(room).defender;
    },

    spawn(room) {
        if (room.energyAvailable < 200) return;
        return census.count(room.name, "defender", 0) < this.wanted(room);
    },

    spawnData(room) {
        return {
            name: names.generate("defender"),
            body: getBody(room.energyAvailable),
            memory: { role: "defender", room: room.name },
        };
    },
};

module.exports = defender;
