// Single source of truth for "is this rampart/wall worth repair effort right
// now" - shared by structures/tower.js and roles/builder.js so the two
// workers never disagree about it. Before this module existed, each had its
// own independently-tuned mechanism (a ratio pair + an absolute hits cap in
// tower.js, a different hardcoded ratio + a construction-site check in
// builder.js) that drifted apart instead of agreeing.
//
// Everything is a fraction of the structure's own hitsMax, never an
// absolute number - hitsMax already scales with RCL via the engine
// (RAMPART_HITS_MAX / WALL_HITS_MAX tables), so a ratio stays meaningful at
// every RCL instead of becoming a rounding error at RCL8 or overkill at
// RCL2. Three tiers:
//   < rampartCriticalRatio (0.1%) - critical, always the top pick among
//                                   defensive structures.
//   < rampartHealthyRatio  (1%)   - "healthy" - always fair game, same
//                                   priority as the critical tier above it
//                                   loses to nothing else defensive.
//   >= rampartHealthyRatio        - already plenty tanky for now - only
//                                   keeps improving while the room's storage
//                                   still has its emergency reserve intact
//                                   (utils/resourceTiers.aboveReserve, 1% of
//                                   capacity - ROADMAP 0054, replaced the old
//                                   50% rampartStorageFillGate). Otherwise
//                                   that effort is better spent elsewhere.
const config = require("./config");
const resourceTiers = require("./resourceTiers");

function isCritical(structure) {
    return (
        structure.hits < structure.hitsMax * config.get("tower.rampartCriticalRatio", 0.001)
    );
}

function isHealthy(structure) {
    return (
        structure.hits < structure.hitsMax * config.get("tower.rampartHealthyRatio", 0.01)
    );
}

// the single predicate both tower.js and builder.js call to decide whether
// a damaged rampart/wall is worth spending repair effort on right now.
function worthHardening(structure, room) {
    if (structure.hits >= structure.hitsMax) return false;
    return isHealthy(structure) || resourceTiers.aboveReserve(room);
}

module.exports = { isCritical, isHealthy, worthHardening };
