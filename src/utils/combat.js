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
        const spawn = roomCache.mySpawns(creep.room)[0];
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

// Whether `pos` is exposed to `room`'s current threats - shared by
// takeCover (the creep's own position) and excludeDangerZone below (a
// candidate pickup/delivery target's position), so the two never drift
// apart into two different definitions of "safe" (constitution §5).
//
// Safe: far enough that ranged can't connect, or sitting on our own rampart
// with nothing about to melee it.
//
// Strictly greater than safeRange(), not >= - both sides can close 1 tile
// the same tick (a creep keeps working/approaching its job while the
// hostile advances toward it), and Screeps resolves that tick's attacks
// against pre-move positions. A position right AT safeRange() (5) can end
// the tick at range 3 - exactly RANGED_ATTACK's reach - and eat a hit next
// tick before takeCover's retreat check ever runs. Requiring one extra tile
// of headroom caps the worst case at range 4, still outside reach, and
// matches the flee target in retreatToCover (safeRange()+1).
function isDangerous(pos, room) {
    const mem = Memory.rooms[room.name];
    if (!mem || !mem.defenseActive) return false;

    const dangers = threats(room);
    if (!dangers.length) return false;

    const nearest = pos.findClosestByRange(dangers);
    if (!nearest || pos.getRangeTo(nearest) > safeRange()) return false;

    const onOwnRampart = _.some(
        pos.lookFor(LOOK_STRUCTURES),
        (s) => s.structureType === STRUCTURE_RAMPART && s.my
    );
    if (!onOwnRampart) return true;

    const meleeAdjacent = _.some(
        dangers,
        (h) => hasMelee(h) && pos.getRangeTo(h) <= 2
    );
    return meleeAdjacent;
}

// Called at the top of a non-combat role's run(). When the room is under attack
// and the creep is exposed, it moves the creep to safety (a rampart, or out of
// enemy range) and returns true so the caller skips its normal job this tick.
// Returns false when the creep is safe and free to work.
function takeCover(creep) {
    if (isArmed(creep)) return false;
    if (!isDangerous(creep.pos, creep.room)) return false;

    retreatToCover(creep, threats(creep.room));
    return true;
}

// Drops any candidate whose position is currently in the attack zone
// (isDangerous above) - so a job picker never even considers a pickup/
// delivery target a hostile is standing next to. Without this, a picker
// only reacts AFTER a creep is already exposed (via takeCover, one tick
// too late for the tick that closes the gap - see isDangerous' comment),
// and worse, re-picks the SAME nearest-but-unsafe target the very next
// tick once takeCover's retreat puts the creep back at a "safe" distance -
// walking the creep right back into the same spot instead of ever making
// progress (ROADMAP 0107 follow-up, user request). No-op (same array,
// nothing filtered) while the room isn't under attack - the common case -
// so this costs nothing beyond the one Memory read every other check here
// already pays.
function excludeDangerZone(candidates, room) {
    const mem = Memory.rooms[room.name];
    if (!mem || !mem.defenseActive) return candidates;
    return _.filter(candidates, (c) => !isDangerous(c.pos, room));
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

// ROADMAP 0175: which hostile structure an offensive creep goes for once no
// armed hostile creep is left - only what fights back or reinforces:
// 0 = a tower that can still fire, or an invader core; 1 = a spawn;
// 2 = an empty tower. Everything else (extension, storage, terminal, lab,
// container, walls...) is never a target, so it stays intact. Closest to
// `fromPos` within the best tier when given.
function structureTier(structure) {
    const type = structure.structureType;
    if (type === STRUCTURE_INVADER_CORE) return 0;
    if (type === STRUCTURE_TOWER) {
        const energy = structure.store ? structure.store[RESOURCE_ENERGY] || 0 : 0;
        const shotCost = typeof TOWER_ENERGY_COST === "number" ? TOWER_ENERGY_COST : 10;
        return energy >= shotCost ? 0 : 2;
    }
    if (type === STRUCTURE_SPAWN) return 1;
    return null;
}

// A tower only fires while active, and that needs a controller with an
// owner - in a room with no controller, or one whose controller is unowned
// (abandoned/unclaimed), leftover towers are dead weight. isActive() is the
// engine's own answer; the controller check is the fallback. Shared by
// rooms/looting.js (0177) and the squad medics (0178).
function towerCanFire(tower, room) {
    if (typeof tower.isActive === "function") return tower.isActive();
    return !!(room.controller && room.controller.owner);
}

// True when a hostile tower in `room` can shoot right now (active, with
// energy for at least one shot).
function hostileTowerThreat(room) {
    const shotCost = typeof TOWER_ENERGY_COST === "number" ? TOWER_ENERGY_COST : 10;
    return roomCache.structuresByType(room, STRUCTURE_TOWER).some(
        (t) => !t.my && t.store && (t.store[RESOURCE_ENERGY] || 0) >= shotCost && towerCanFire(t, room)
    );
}

function structureTarget(room, fromPos) {
    let best = null;
    let bestTier = Infinity;
    let bestRange = Infinity;
    for (const structure of roomCache.hostileStructures(room)) {
        const tier = structureTier(structure);
        if (tier === null || tier > bestTier) continue;
        const range = fromPos && fromPos.getRangeTo ? fromPos.getRangeTo(structure) : 0;
        if (tier < bestTier || range < bestRange) {
            best = structure;
            bestTier = tier;
            bestRange = range;
        }
    }
    return best;
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

// The closest (by real path, not straight-line range) rampart we own that
// isn't already occupied by another of our creeps, or null. defenderStriker.
// js's D3 tank stance: standing on it denies melee approach entirely (a
// hostile can't occupy/pass our own rampart tile) as long as the tile is
// actually enclosed by the base's perimeter - not verified in advance
// (expensive, fragile), just tried; if melee still reaches, the caller
// notices that same tick (range check fails) and falls back to kiting.
//
// Path-based, not findClosestByRange: in a tightly walled base the
// geometrically nearest rampart can sit behind our own walls, reachable
// only via a long detour (or, if PathFinder's maxOps runs out first, not
// reachable at all from the caller's moveTo - see utils/move.js's
// `incomplete` handling). Picking by range there hands the caller an
// unreachable destination it then can't tell apart from a reachable one
// until the moveTo itself fails.
//
// Excludes ramparts already held by another striker: every unit converging
// on the single range-nearest tile just jams the approach instead of
// spreading across the perimeter's other rampart tiles.
function nearestOwnRampart(creep) {
    const all = roomCache
        .structuresByType(creep.room, STRUCTURE_RAMPART)
        .filter((r) => r.my);
    const free = _.filter(
        all,
        (r) => !_.some(r.pos.lookFor(LOOK_CREEPS), (c) => c.my && c.id !== creep.id)
    );
    return creep.pos.findClosestByPath(free.length ? free : all);
}

// ROADMAP 0120 (ARK-28): a defender never goes "mute" - every branch that leaves it without
// a shot/heal/move toward a threat records why in creep.memory.idleReason (written only when
// the reason changes; idleSince marks when). act() clears it once the creep fights again.
const IDLE_REASONS = ["noHostile", "outOfRoom", "noTarget", "rampartBound", "noPartner"];
function idle(creep, reason) {
    if (creep.memory.idleReason === reason) return;
    creep.memory.idleReason = reason;
    creep.memory.idleSince = Game.time;
}
function act(creep) {
    if (creep.memory.idleReason === undefined) return;
    delete creep.memory.idleReason;
    delete creep.memory.idleSince;
}
// Per-reason count of the idle defenders standing in a room (census: current room), for Memory.stats.
function idleDefenders(roomName) {
    const out = {};
    ["defender", "defenderStriker", "defenderMedic"].forEach((role) =>
        census.creepsByRole(roomName, role).forEach((c) => {
            const reason = c.memory.idleReason;
            if (reason) out[reason] = (out[reason] || 0) + 1;
        }));
    return out;
}

module.exports = {
    IDLE_REASONS,
    idle,
    act,
    idleDefenders,
    silenceAttackAlerts,
    takeCover,
    isDangerous,
    excludeDangerZone,
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
    structureTarget,
    hostileTowerThreat,
    kiteAwayFrom,
    shoot,
    patch,
    ensurePartner,
    nearestOwnRampart,
};
