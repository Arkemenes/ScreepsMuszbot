const roomCache = require("./roomCache");
const { getHostiles } = require("./hostiles");
const config = require("./config");
const census = require("./census");

// RANGED_ATTACK optimal range - the distance a kiter tries to keep.
// Shared by defender.js/defenderStriker.js (ROADMAP 0032).
const KITE_RANGE = 3;

// Enemy RANGED_ATTACK reaches 3 tiles and the enemy can step 1 tile/tick, so a
// non-combat creep wants to stay at least this far from any threat. Looked up
// live (not cached) so Memory.settings.combat.safeRange can be tuned without
// a redeploy - see utils/config.js.
function safeRange() {
    return config.get("combat.safeRange", 5);
}

function isArmed(creep) {
    return _.some(
        creep.body,
        (part) => part.type === ATTACK || part.type === RANGED_ATTACK
    );
}

function hasMelee(creep) {
    return _.some(creep.body, (part) => part.type === ATTACK);
}

// Hostiles that can actually deal damage.
function threats(room) {
    return _.filter(
        getHostiles(room),
        (h) =>
            _.some(
                h.body,
                (part) =>
                    part.type === ATTACK || part.type === RANGED_ATTACK
            )
    );
}

// Per-tick damage of one body part, boost multiplier read live from the
// native BOOSTS table - never hardcoded, same principle already used for
// REACTIONS/COMMODITIES (structures/lab.js|factory.js, ROADMAP 0051) - so a
// real boosted rush is weighed correctly instead of assumed unboosted.
function partDamage(part) {
    const base =
        part.type === ATTACK
            ? ATTACK_POWER
            : part.type === RANGED_ATTACK
            ? RANGED_ATTACK_POWER
            : 0;
    if (!base || !part.boost) return base;
    const key = part.type === ATTACK ? "attack" : "rangedAttack";
    const boostTable = BOOSTS[part.type] && BOOSTS[part.type][part.boost];
    const mult = boostTable && boostTable[key];
    return base * (mult || 1);
}

// Rough total damage/tick `hostiles` can inflict on whatever they're each
// attacking - used by rooms/defense.js's checkSafeMode() (ROADMAP 0036
// revision) to project time-to-kill instead of reacting to raw proximity.
function incomingDps(hostiles) {
    let total = 0;
    for (const h of hostiles) {
        for (const part of h.body) total += partDamage(part);
    }
    return total;
}

// CostMatrix that keeps paths off walls / blocking structures and prefers our
// roads and ramparts. Memoised per room per tick.
let matTick = -1;
let matCache = {};
function blockingMatrix(room) {
    if (matTick !== Game.time) {
        matTick = Game.time;
        matCache = {};
    }
    if (matCache[room.name]) return matCache[room.name];

    const cm = new PathFinder.CostMatrix();
    for (const s of roomCache.structures(room)) {
        if (
            s.structureType === STRUCTURE_ROAD ||
            (s.structureType === STRUCTURE_RAMPART && s.my)
        ) {
            cm.set(s.pos.x, s.pos.y, 1);
        } else if (s.structureType === STRUCTURE_CONTAINER) {
            // walkable, default cost
        } else {
            cm.set(s.pos.x, s.pos.y, 255);
        }
    }
    matCache[room.name] = cm;
    return cm;
}

// Move away from `dangers`, routing around obstacles. Returns false when there
// is nowhere to run.
function flee(creep, dangers, range) {
    const goals = dangers.map((h) => ({ pos: h.pos, range: range }));
    const result = PathFinder.search(creep.pos, goals, {
        flee: true,
        maxRooms: 1,
        plainCost: 2,
        swampCost: 6,
        roomCallback: (roomName) =>
            roomName === creep.room.name ? blockingMatrix(creep.room) : false,
    });
    if (result.path && result.path.length) {
        creep.moveByPath(result.path);
        return true;
    }
    return false;
}

function retreatToCover(creep, dangers) {
    // nearest reachable friendly rampart that no melee hostile is standing next to
    const ramparts = _.filter(
        roomCache.structures(creep.room),
        (s) =>
            s.structureType === STRUCTURE_RAMPART &&
            s.my &&
            !_.some(
                dangers,
                (h) => hasMelee(h) && h.pos.getRangeTo(s) <= 1
            )
    );
    const rampart = creep.pos.findClosestByPath(ramparts);
    if (rampart) {
        creep.moveTo(rampart, { reusePath: 5 });
        return;
    }

    if (!flee(creep, dangers, safeRange() + 1)) {
        const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
        if (spawn) creep.moveTo(spawn, { reusePath: 5 });
    }
}

// ROADMAP 0052, old_1 parity: a role that routinely travels through/works in
// hostile or foreign territory (scout, raider, squadDismantler, pioneer, a
// reserver on a "contest" siege) doesn't want the default "you were
// attacked" email every time - that's expected there, not an emergency.
// Safe to call every tick (idempotent, no CPU/Memory cost beyond the intent
// itself - same class of cost as any other native creep call this tick).
function silenceAttackAlerts(creep) {
    creep.notifyWhenAttacked(false);
}

// Called at the top of a non-combat role's run(). When the room is under attack
// and the creep is exposed, it moves the creep to safety (a rampart, or out of
// enemy range) and returns true so the caller skips its normal job this tick.
// Returns false when the creep is safe and free to work.
function takeCover(creep) {
    const mem = Memory.rooms[creep.room.name];
    if (!mem || !mem.defenseActive) return false;
    if (isArmed(creep)) return false;

    const dangers = threats(creep.room);
    if (!dangers.length) return false;

    const nearest = creep.pos.findClosestByRange(dangers);
    if (!nearest) return false;

    const onOwnRampart = _.some(
        creep.pos.lookFor(LOOK_STRUCTURES),
        (s) => s.structureType === STRUCTURE_RAMPART && s.my
    );
    const meleeAdjacent = _.some(
        dangers,
        (h) => hasMelee(h) && creep.pos.getRangeTo(h) <= 2
    );

    // Safe: far enough that ranged can't connect, or hunkered on our rampart
    // with nothing about to melee us.
    if (
        creep.pos.getRangeTo(nearest) >= safeRange() ||
        (onOwnRampart && !meleeAdjacent)
    ) {
        return false;
    }

    retreatToCover(creep, dangers);
    return true;
}

// --- shared combat primitives (ROADMAP 0032) - used by defender.js and
// defenderStriker.js/defenderMedic.js so the three roles never duplicate
// targeting/shooting/healing/kiting logic (constitution §5). ------------

// Lower number = higher priority target: healers first (they undo our
// damage), then ranged, then melee, then anything unarmed we can hit.
function threatPriority(hostile) {
    if (_.some(hostile.body, (part) => part.type === HEAL)) return 0;
    if (_.some(hostile.body, (part) => part.type === RANGED_ATTACK)) return 1;
    if (_.some(hostile.body, (part) => part.type === ATTACK)) return 2;
    return 3;
}

function pickTarget(room) {
    return _.sortBy(getHostiles(room), threatPriority)[0];
}

// Step away from every hostile, routing around obstacles. Returns false when
// there is nowhere to run (cornered).
function kiteAwayFrom(creep, hostiles) {
    return flee(creep, hostiles, KITE_RANGE + 3);
}

// Fire the ranged weapon: mass attack when swarmed / anything adjacent,
// otherwise a single shot at the highest-priority target in range.
function shoot(creep, hostiles) {
    const inRange = creep.pos.findInRange(hostiles, KITE_RANGE);
    if (!inRange.length) return;

    const adjacent = creep.pos.findInRange(hostiles, 1).length;
    if (adjacent >= 1 || inRange.length >= 3) {
        creep.rangedMassAttack();
        return;
    }
    creep.rangedAttack(_.sortBy(inRange, threatPriority)[0]);
}

// Heal: self first (kiters expect to take some chip damage), then the nearest
// wounded ally within reach. Only meaningful for a creep with a HEAL part -
// defenderStriker.js never calls this (it has none).
function patch(creep) {
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
        return;
    }
    const ally = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: (a) => a.id !== creep.id && a.hits < a.hitsMax,
    });
    if (!ally) return;
    const range = creep.pos.getRangeTo(ally);
    if (range <= 1) creep.heal(ally);
    else if (range <= KITE_RANGE) creep.rangedHeal(ally);
}

// Pair `creep` with the first unpaired creep of `partnerRole` in the same
// room, via memory.partnerId set on both sides the same tick a match is
// found - deliberately not a shared Memory.squads structure (ROADMAP 0032:
// deferred to Fase 4, when a real N-creep squad primitive gets designed).
// A stale id (partner died) is dropped and searched again. Returns the
// live partner creep, or null when unpaired.
function ensurePartner(creep, partnerRole) {
    const mem = creep.memory;
    if (mem.partnerId) {
        const partner = Game.getObjectById(mem.partnerId);
        if (partner) return partner;
        mem.partnerId = undefined;
    }
    const candidate = _.find(
        census.creepsByRole(creep.room.name, partnerRole),
        (c) => !c.memory.partnerId
    );
    if (!candidate) return null;
    mem.partnerId = candidate.id;
    candidate.memory.partnerId = creep.id;
    return candidate;
}

// The closest rampart we own, or null. defenderStriker.js's D3 tank
// stance: standing on it denies melee approach entirely (a hostile can't
// occupy/pass our own rampart tile) as long as the tile is actually
// enclosed by the base's perimeter - not verified in advance (expensive,
// fragile), just tried; if melee still reaches, the caller notices that
// same tick (range check fails) and falls back to kiting.
function nearestOwnRampart(creep) {
    const ramparts = roomCache
        .structuresByType(creep.room, STRUCTURE_RAMPART)
        .filter((r) => r.my);
    return creep.pos.findClosestByRange(ramparts);
}

module.exports = {
    silenceAttackAlerts,
    takeCover,
    blockingMatrix,
    flee,
    isArmed,
    hasMelee,
    threats,
    incomingDps,
    safeRange,
    KITE_RANGE,
    threatPriority,
    pickTarget,
    kiteAwayFrom,
    shoot,
    patch,
    ensurePartner,
    nearestOwnRampart,
};
