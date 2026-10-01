const { getHostiles, isHostile } = require("../utils/hostiles");
const traffic = require("../utils/traffic");
const rampartRepair = require("../utils/rampartRepair");
const energyLedger = require("../utils/energyLedger");
let cacheTick;
let hostileTargets = {};
let repairLists = {};
let claimedRepairTargets = {};
let healingTargets = {};
// Heap: damaged-structure ids per room, rescanned every REPAIR_SCAN_TICKS.
const repairScan = {};
const REPAIR_SCAN_TICKS = 5;

const hostilePartPriority = {
    [HEAL]: 0,
    [RANGED_ATTACK]: 1,
    [ATTACK]: 2,
    [WORK]: 3,
    [CLAIM]: 4,
    [CARRY]: 5,
};

function getHostilePriority(creep) {
    const priorities = creep.body
        .filter((part) => hostilePartPriority[part.type] !== undefined)
        .map((part) => hostilePartPriority[part.type]);

    const priority = priorities.length ? Math.min(...priorities) : Infinity;
    return creep.body.some((part) => part.boost) ? priority - 0.5 : priority;
}

function getTowerDamage(tower, creep) {
    const range = tower.pos.getRangeTo(creep);
    const optimalRange = 5;
    const falloffRange = 20;
    const falloff = 0.75;
    const effectiveRange = Math.max(
        optimalRange,
        Math.min(range, falloffRange)
    );

    return 600 * (1 - falloff * (effectiveRange - optimalRange) / 15);
}

function resetCache() {
    if (cacheTick !== Game.time) {
        cacheTick = Game.time;
        hostileTargets = {};
        repairLists = {};
        claimedRepairTargets = {};
        healingTargets = {};
    }
}

function findHostileTarget(tower) {
    resetCache();
    if (Object.prototype.hasOwnProperty.call(hostileTargets, tower.room.name)) {
        return hostileTargets[tower.room.name];
    }

    const roomMemory = Memory.rooms[tower.room.name];
    if (
        roomMemory &&
        roomMemory.defenseTargetId &&
        Game.time - roomMemory.defenseTargetTick < 5
    ) {
        const rememberedTarget = Game.getObjectById(roomMemory.defenseTargetId);
        if (rememberedTarget && isHostile(rememberedTarget, tower.room)) {
            hostileTargets[tower.room.name] = rememberedTarget;
            return rememberedTarget;
        }
    }

    const hostiles = getHostiles(tower.room).filter(
        (creep) =>
            _.some(
                creep.body,
                (part) => hostilePartPriority[part.type] !== undefined
            ) &&
            creep.pos.x > 0 &&
            creep.pos.x < 49 &&
            creep.pos.y > 0 &&
                creep.pos.y < 49
            );

    hostileTargets[tower.room.name] = _.sortBy(hostiles, (creep) => {
        const damage = getTowerDamage(tower, creep);
        const timeToKill = creep.hits / damage;
        const distance = tower.pos.getRangeTo(creep);
        return getHostilePriority(creep) * 100000 + timeToKill * 1000 + distance;
    })[0];

    if (hostileTargets[tower.room.name]) {
        roomMemory.defenseTargetId = hostileTargets[tower.room.name].id;
        roomMemory.defenseTargetTick = Game.time;
    }

    return hostileTargets[tower.room.name];
}

function countNearbyHostiles(tower) {
    return getHostiles(tower.room).filter(
        (creep) =>
            tower.pos.getRangeTo(creep) <= 3 &&
            _.some(
                creep.body,
                (part) => hostilePartPriority[part.type] !== undefined
            )
    ).length;
}

function findHealingTarget(tower) {
    resetCache();
    const name = tower.room.name;
    if (!Object.prototype.hasOwnProperty.call(healingTargets, name)) {
        const injuredCreeps = tower.room.find(FIND_MY_CREEPS, {
            filter: (creep) => creep.hits < creep.hitsMax,
        });
        healingTargets[name] = _.sortBy(
            injuredCreeps,
            (creep) => creep.hits / Math.max(creep.hitsMax, 1)
        )[0];
    }
    return healingTargets[name];
}

// The expensive part (the one room.find/tick, constitution §1) - computed
// once per room per tick regardless of how many towers call findRepairTarget
// below, cached the same way findHostileTarget already is. A single
// tier+type+ratio-sorted list (utils/rampartRepair.priority, ROADMAP 0072 -
// user-specified: tower and builder now share the exact same ordering
// logic) - critical/satisfactory/optimal, normal-before-rampart-before-wall
// within a tier, ratio ascending as the finest tiebreak. Replaces the old
// two SEQUENTIAL pools (ROADMAP 0070 already fixed the worst symptom of
// that split - any trivial normal-structure damage permanently starving a
// critical rampart - but a single unified list is the cleaner fix the
// tier system was always meant to enable).
// Not gated on utils/plan's isPlanned - a structure that physically exists
// and is dying is worth repairing whether or not the current plan still
// reserves that tile for it (same reasoning as roles/builder.js's repair
// candidate pools - a rampart can fall out of the plan, e.g. a replan
// moving the mincut, and since nothing dismantles an unplanned structure
// either, gating repair on it used to leave a critical-tier rampart
// permanently unrepaired until it decayed and vanished).
function computeRepairCandidates(room) {
    if (Object.prototype.hasOwnProperty.call(repairLists, room.name)) {
        return repairLists[room.name];
    }

    // The full structure scan only runs every REPAIR_SCAN_TICKS; in between
    // the remembered ids are re-resolved and re-filtered for current hits.
    let scan = repairScan[room.name];
    if (!scan || Game.time - scan.tick >= REPAIR_SCAN_TICKS) {
        scan = repairScan[room.name] = {
            tick: Game.time,
            ids: room
                .find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.hits < structure.hitsMax &&
                        traffic.worthRepairing(structure),
                })
                .map((structure) => structure.id),
        };
    }
    const damagedStructures = scan.ids
        .map((id) => Game.getObjectById(id))
        .filter((structure) => structure && structure.hits < structure.hitsMax);

    repairLists[room.name] = _.sortBy(damagedStructures, rampartRepair.priority);
    return repairLists[room.name];
}

// ROADMAP 0071 (review finding): with 2+ towers in the same room, all of
// them used to share the exact same single cached target - never a bug in
// the sense of picking the WRONG structure, but a room with two
// simultaneously-critical ramparts always had every tower pile onto
// whichever sorted first, leaving the other completely unattended that
// tick. Each tower now claims the target it picks (per room, per tick,
// cleared by resetCache) and skips anything already claimed by an earlier
// tower this tick - spreading attention across distinct urgent targets
// first, and only doubling up once every one of them already has a tower
// on it (at which point piling on the single worst remaining target is
// exactly what you want).
//
// ROADMAP 0072: eligibility (utils/rampartRepair.towerMayRepair) now
// depends on THIS tower's own energy ratio, which can differ between
// towers in the same room - so a candidate that one tower can't yet
// afford might still be skippable in favor of one it can, rather than
// blocking on the single most-urgent target across the board.
function findRepairTarget(tower) {
    resetCache();
    const candidates = computeRepairCandidates(tower.room);
    if (!candidates.length) return null;

    const claimed =
        claimedRepairTargets[tower.room.name] ||
        (claimedRepairTargets[tower.room.name] = new Set());

    let target = candidates.find(
        (s) => !claimed.has(s.id) && rampartRepair.towerMayRepair(s, tower)
    );

    // nothing new to claim (or affordable) - double up on the single most
    // urgent target overall, but only if THIS tower can actually afford
    // it; never fall back to something less urgent it happens to be able
    // to pay for instead.
    if (!target && rampartRepair.towerMayRepair(candidates[0], tower)) {
        target = candidates[0];
    }

    if (target) claimed.add(target.id);
    return target;
}

var tower = {
    /** @param {Structure} tower **/
    run: function (tower) {
        const hostileTarget = findHostileTarget(tower);
        if (hostileTarget) {
            if (countNearbyHostiles(tower) >= 2) {
                tower.rangedMassAttack();
            } else {
                tower.attack(hostileTarget);
            }
            energyLedger.creditTower(tower, "towerAttack");
            return;
        }

        const healingTarget = findHealingTarget(tower);
        if (healingTarget) {
            tower.heal(healingTarget);
            energyLedger.creditTower(tower, "towerHeal");
            return;
        }

        // the tower's own energy-ratio gate is tier-dependent now
        // (utils/rampartRepair.towerMayRepair, ROADMAP 0072) - already
        // checked by findRepairTarget above, nothing left to gate here.
        const repairTarget = findRepairTarget(tower);
        if (repairTarget) {
            tower.repair(repairTarget);
            energyLedger.creditTower(tower, "towerRepair");
        }
    },
};

module.exports = tower;
