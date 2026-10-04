const { getHostiles } = require("../utils/hostiles");
const census = require("../utils/census");
const combat = require("../utils/combat");
const config = require("../utils/config");
const squad = require("../utils/squad");
const { roomNeeds } = require("../rooms/needs");
const names = require("../utils/names");
const roomCache = require("../utils/roomCache");

// RANGED_ATTACK half of the striker+medic pair (ROADMAP 0032 D2) - a
// room spawns this (+ a defenderMedic) once it can afford a real pair
// (rooms/needs.js's pairEnergyThreshold gate); below that it still uses
// the solo defender.js. Targeting/shooting/kiting come from
// utils/combat.js, shared with defender.js so neither duplicates the
// other (constitution §5).

function getBody(energy) {
    // pure RANGED_ATTACK + MOVE, 1:1 ratio, MOVE last (same reasoning as
    // defender.js's D1: protect the ability to reposition longest). No
    // HEAL at all - that's defenderMedic's entire job, so every part here
    // goes to offense instead of splitting the body like the old solo
    // defender had to.
    const unitCost = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
    const n = Math.max(1, Math.min(25, Math.floor(energy / unitCost)));
    const body = [];
    for (let i = 0; i < n; i++) body.push(RANGED_ATTACK);
    for (let i = 0; i < n; i++) body.push(MOVE);
    return body;
}

function isOnOwnRampart(creep) {
    return _.some(
        creep.pos.lookFor(LOOK_STRUCTURES),
        (s) => s.structureType === STRUCTURE_RAMPART && s.my
    );
}

const defenderStriker = {
    run(creep) {
        // squad mode (ROADMAP 0032 Fase 4, O5): a raidSquad() mission owns
        // positioning entirely (lockstep, not home's D3/mop-up posture,
        // which doesn't make sense away from our own rampart) - this role
        // still fires its own weapon, just doesn't decide where to stand.
        if (creep.memory.squadId) {
            squad.advance(creep, creep.memory.squadId);
            const threats = combat.threats(creep.room);
            if (threats.length) {
                combat.shoot(creep, threats);
            } else {
                // ROADMAP 0047: no hostile creep left - mop up a hostile
                // structure instead of standing idle (excludes power banks,
                // same convention raider.js/squadDismantler.js already use).
                const structureTarget = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                    filter: (s) => s.structureType !== STRUCTURE_POWER_BANK,
                })[0];
                if (structureTarget && creep.pos.getRangeTo(structureTarget) <= combat.KITE_RANGE) {
                    creep.rangedAttack(structureTarget);
                }
            }
            return;
        }
        if (creep.memory.pendingSquad) {
            squad.registerPending(creep);
            return;
        }

        // no medic yet (or it died) - still useful alone, same posture as
        // the solo defender below just minus the self-heal it has no
        // HEAL part for
        combat.ensurePartner(creep, "defenderMedic");

        const mem = Memory.rooms[creep.room.name] || {};
        const hostiles = mem.defenseActive ? getHostiles(creep.room) : [];

        if (!hostiles.length) {
            const spawn = roomCache.mySpawns(creep.room)[0];
            if (spawn && creep.pos.getRangeTo(spawn) > 5) {
                creep.moveTo(spawn, { reusePath: 20 });
            }
            return;
        }

        combat.shoot(creep, hostiles);

        // D3: standing on our own rampart denies melee approach entirely,
        // as long as the tile is actually enclosed by the perimeter - not
        // predicted in advance, just tried; a gap shows up as "melee still
        // in range" this same tick and falls through to kiting below.
        const onRampart = isOnOwnRampart(creep);
        const dangerRange = onRampart ? 1 : combat.KITE_RANGE;
        const meleeClosing = _.some(
            hostiles,
            (h) => combat.hasMelee(h) && creep.pos.getRangeTo(h) <= dangerRange
        );

        if (meleeClosing) {
            if (!onRampart) {
                const rampart = combat.nearestOwnRampart(creep);
                if (rampart) {
                    const status = creep.moveTo(rampart, { range: 0, reusePath: 5 });
                    // OK: under way (or arriving next tick); ERR_TIRED: fatigued,
                    // resumes on its own - both are fine, stand on this move
                    // rather than fight it. Anything else (chiefly ERR_NO_PATH -
                    // nearestOwnRampart() picks by range, not guaranteed
                    // reachable, especially through a tightly walled base) means
                    // this rampart isn't happening: fall through to kiting
                    // instead of silently retrying the same failing move every
                    // tick while melee closes the gap (live case, 2026-09-25 -
                    // a defenderStriker never moved at all because this return
                    // fired unconditionally, even when the moveTo had failed).
                    if (status === OK || status === ERR_TIRED) return;
                }
            }
            // already on rampart and still reached (a gap), rampart
            // unreachable, or nowhere to run to - kite like the solo defender
            if (!combat.kiteAwayFrom(creep, hostiles)) {
                const spawn = roomCache.mySpawns(creep.room)[0];
                if (spawn) creep.moveTo(spawn, { reusePath: 5 });
            }
            return;
        }

        if (!onRampart) {
            const rampart = combat.nearestOwnRampart(creep);
            if (rampart) {
                const status = creep.moveTo(rampart, { range: 0, reusePath: 5 });
                if (status === OK || status === ERR_TIRED) return;
                // unreachable - don't sit here doing nothing, fall through to
                // the normal hold-at-range-and-shoot logic below instead.
            }
        }

        // no melee threat (or safely on rampart already): hold at range on
        // the top-priority target - except a WOUNDED one within
        // defender.mopUpRange of home, which gets closed in on and
        // finished instead of poked at from max range forever (ROADMAP
        // 0032 O1, scoped to same-room pursuit during implementation).
        const target = combat.pickTarget(creep.room);
        if (!target) return;
        const range = creep.pos.getRangeTo(target);
        const spawn = roomCache.mySpawns(creep.room)[0];
        const wounded = target.hits < target.hitsMax;
        const withinMopUpRange =
            !spawn ||
            spawn.pos.getRangeTo(target) <= config.get("defender.mopUpRange", 10);

        if (wounded && withinMopUpRange && range > 1) {
            creep.moveTo(target, { range: 1, reusePath: 3 });
        } else if (range > combat.KITE_RANGE) {
            creep.moveTo(target, { range: combat.KITE_RANGE, reusePath: 3 });
        } else if (!onRampart && range < combat.KITE_RANGE) {
            // too close to a purely-ranged enemy - ease back out (skip
            // when safely on rampart - no benefit to giving up melee
            // protection just because ranged still reaches either way)
            combat.kiteAwayFrom(creep, hostiles);
        }
    },

    wanted(room) {
        return roomNeeds(room).defenderStriker;
    },

    spawn(room) {
        if (room.energyAvailable < BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) {
            return false;
        }
        return census.count(room.name, "defenderStriker", 0) < this.wanted(room);
    },

    spawnData(room) {
        return {
            name: names.generate("defenderStriker"),
            body: getBody(room.energyAvailable),
            memory: { role: "defenderStriker", room: room.name },
        };
    },
};

module.exports = defenderStriker;
