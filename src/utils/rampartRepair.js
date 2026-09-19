// Single source of truth for repair-tier classification and priority
// ordering - shared by structures/tower.js and roles/builder.js so the two
// workers never disagree about which of two damaged structures is more
// urgent (ROADMAP 0072, user-specified: "eu quero tanto torre quanto worker
// seguindo a mesma lógica de reparo"). Despite the filename (kept from when
// this only covered rampart/wall - ROADMAP 0032 D4), it now classifies
// EVERY structure type into one of three tiers:
//   critical      - about to break, always the top priority.
//   satisfactory  - the target: notably damaged, worth fixing before
//                   anything less urgent, but not an emergency.
//   optimal       - already at or past the target - a nice-to-have.
//
// Rampart/wall use a FRACTION of their own hitsMax (tower.rampartCriticalRatio
// / rampartSatisfactoryRatio, 0.1%/1%) - RAMPART_HITS_MAX (300k) and
// WALL_HITS_MAX (300M) are fixed engine constants (not RCL-scaled) that
// differ from each other by 1000x, so a ratio of each structure's own
// ceiling stays meaningful for both instead of picking one absolute number
// that's trivial for a wall or unreachable for a rampart. Every OTHER
// structure type uses a much coarser pair (repair.normalCriticalRatio /
// normalSatisfactoryRatio, 10%/50%) - a container/spawn/extension/road's
// hitsMax is small enough that the rampart/wall pair would basically never
// fire.
const config = require("./config");
const resourceTiers = require("./resourceTiers");

const TIER_RANK = { critical: 0, satisfactory: 1, optimal: 2 };

// Type tiebreak WITHIN the same tier (ROADMAP 0072, user request: "caso
// tenha empate, rampart tem menor prioridade e wall menor ainda") - a
// normal structure always outranks a rampart in the same tier, which
// always outranks a wall in the same tier. Rationale: rampart (300k) and
// wall (300M) hitsMax dwarf any normal structure's, so an equally-ranked
// rampart/wall is comparatively far tougher in absolute terms than a
// normal structure landing in the same tier would be - type ranks the
// whole tier, not just exact ratio ties, so this is checked BEFORE ratio
// as the second sort key, not a last-resort break for numerical ties only.
const TYPE_RANK = {
    [STRUCTURE_RAMPART]: 1,
    [STRUCTURE_WALL]: 2,
};

function isDefensive(structure) {
    return (
        structure.structureType === STRUCTURE_RAMPART ||
        structure.structureType === STRUCTURE_WALL
    );
}

function typeRank(structure) {
    return TYPE_RANK[structure.structureType] || 0;
}

// "critical" | "satisfactory" | "optimal" - see module header for the
// rationale behind the two independent ratio pairs.
function tier(structure) {
    const ratio = structure.hits / structure.hitsMax;
    const criticalRatio = isDefensive(structure)
        ? config.get("tower.rampartCriticalRatio", 0.001)
        : config.get("repair.normalCriticalRatio", 0.1);
    const satisfactoryRatio = isDefensive(structure)
        ? config.get("tower.rampartSatisfactoryRatio", 0.01)
        : config.get("repair.normalSatisfactoryRatio", 0.5);

    if (ratio < criticalRatio) return "critical";
    if (ratio < satisfactoryRatio) return "satisfactory";
    return "optimal";
}

function isCritical(structure) {
    return tier(structure) === "critical";
}

// The single sort key both structures/tower.js and roles/builder.js use to
// order repair candidates: tier first (critical always before satisfactory
// before optimal), then type (normal before rampart before wall, within
// the SAME tier - see TYPE_RANK above), then ratio ascending as the finest
// tiebreak (within the same type+tier). Meant for `_.sortBy(list,
// priority)` - lodash sorts by each returned array element in order.
function priority(structure) {
    return [
        TIER_RANK[tier(structure)],
        typeRank(structure),
        structure.hits / structure.hitsMax,
    ];
}

// roles/builder.js's eligibility gate: critical is unconditional, while
// defensive satisfactory repair needs >10% storage and defensive optimal
// repair (hardening) needs >=70%. Normal structures keep their old behavior.
function builderMayRepair(structure, room) {
    if (structure.hits >= structure.hitsMax) return false;
    const t = tier(structure);
    if (!isDefensive(structure) || t === "critical") return true;
    if (t === "satisfactory") {
        return resourceTiers.isStorageAbove(
            room,
            config.get("logistics.rampartHealthyStorageRatio", 0.1)
        );
    }
    return resourceTiers.isStorageAtLeast(
        room,
        config.get("logistics.rampartHardeningStorageRatio", 0.7)
    );
}

// structures/tower.js's eligibility gate: depends on the TOWER's own
// energy ratio (ROADMAP 0072, user-specified) - stricter for a less urgent
// tier, since a tower reacts every tick with no population cost to
// self-limit it the way roles/builder.js's own creep count does:
//   critical      - energyRatio >= tower.repairEnergyRatio (50%)
//   satisfactory  - energyRatio >= tower.satisfactoryRepairEnergyRatio (70%)
//   optimal       - same 70% tower-energy floor, plus defensive storage
//                   gates shared with builderMayRepair (10% for satisfactory,
//                   70% for hardening). Normal structures only use the tower
//                   energy floor.
function towerMayRepair(structure, tower) {
    if (structure.hits >= structure.hitsMax) return false;

    const t = tier(structure);
    const energyRatio =
        tower.store.energy / tower.store.getCapacity(RESOURCE_ENERGY);

    if (t === "critical") {
        return energyRatio >= config.get("tower.repairEnergyRatio", 0.5);
    }

    if (energyRatio < config.get("tower.satisfactoryRepairEnergyRatio", 0.7)) {
        return false;
    }

    if (isDefensive(structure)) {
        if (t === "satisfactory") {
            return resourceTiers.isStorageAbove(
                tower.room,
                config.get("logistics.rampartHealthyStorageRatio", 0.1)
            );
        }
        if (t === "optimal") {
            return resourceTiers.isStorageAtLeast(
                tower.room,
                config.get("logistics.rampartHardeningStorageRatio", 0.7)
            );
        }
    }

    return true;
}

module.exports = { tier, isCritical, priority, builderMayRepair, towerMayRepair };
