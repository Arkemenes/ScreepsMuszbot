// Automatic safe mode trigger (ROADMAP 0032 D6). Deliberately small and
// stateless - reads combat.threats()/census/room.controller each tick,
// nothing persisted. See specs/features/0036-safe-mode-and-remote-
// harassment/spec.md for the decided (conservative) trigger.

const config = require("../utils/config");
const census = require("../utils/census");
const combat = require("../utils/combat");
const roomCache = require("../utils/roomCache");

// A hostile creep's own attack reach: RANGED_ATTACK connects at 3, ATTACK
// (or anything armed without ranged) only at 1.
function attackReach(hostile) {
    return _.some(hostile.body, (p) => p.type === RANGED_ATTACK)
        ? combat.KITE_RANGE
        : 1;
}

function spawnUnderThreat(room, spawns) {
    const dangers = combat.threats(room);
    if (!dangers.length) return false;
    return _.some(spawns, (spawn) =>
        _.some(dangers, (h) => spawn.pos.getRangeTo(h) <= attackReach(h))
    );
}

// defender + defenderStriker are the two roles that can actually deal
// damage back (defenderMedic alone can't fight) - "zero defenders alive"
// means neither is present in the room right now.
function defendersAlive(room) {
    return (
        census.creepsByRole(room.name, "defender").length +
        census.creepsByRole(room.name, "defenderStriker").length
    );
}

function checkSafeMode(room) {
    if (!room.controller || !room.controller.my) return;
    if (room.controller.safeMode) return; // already active, nothing to do

    const spawns = roomCache.structuresByType(room, STRUCTURE_SPAWN);
    if (!spawns.length) return;
    if (!spawnUnderThreat(room, spawns)) return;

    const lowestHpRatio = Math.min(..._.map(spawns, (s) => s.hits / s.hitsMax));
    const hpThreshold = config.get("combat.safeModeSpawnHpRatio", 0.5);
    if (lowestHpRatio > hpThreshold && defendersAlive(room) > 0) return;

    const result = room.controller.activateSafeMode();
    if (result === OK) {
        console.log(
            `[defense] ${room.name}: spawn under real threat (hp ratio ` +
                `${lowestHpRatio.toFixed(2)}, ${defendersAlive(room)} defenders alive) - ` +
                "activating safe mode"
        );
    } else if (result !== ERR_TIRED && result !== ERR_BUSY) {
        // ERR_TIRED/ERR_BUSY (cooldown/recently activated) aren't worth
        // logging every tick; anything else (no charges left, etc.) is
        // worth knowing about once.
        console.log(
            `[defense] ${room.name}: safe mode trigger fired but activateSafeMode() returned ${result}`
        );
    }
}

module.exports = { checkSafeMode };
