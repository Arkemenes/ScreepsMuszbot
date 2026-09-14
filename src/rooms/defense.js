// Automatic safe mode trigger (ROADMAP 0032 D6, revised - see "Bug real" in
// specs/features/0036-safe-mode-and-remote-harassment/spec.md). Deliberately
// small and stateless - reads combat.threats()/room.controller each tick,
// nothing persisted.
//
// Original design fired on "hp ratio below threshold OR zero defenders
// alive". The OR branch turned out to be a false-positive magnet: defenders
// only get spawned reactively once a hostile shows up (rooms/needs.js), so
// "zero defenders alive" is trivially true in the first several ticks of
// ANY incursion - including a single unarmed-adjacent invader poke - not
// just a defense that was actually overwhelmed. It also ignored a spawn's
// own rampart, which absorbs all damage until destroyed (spawn.hits doesn't
// even move while one stands). Reported in production: an RCL2 room with no
// defenders yet (none were needed) activated safe mode off a weak invader
// that never seriously threatened the spawn.
//
// Replaced with a single projected time-to-kill: how many ticks until the
// most-endangered spawn's effective hp (its own rampart's hits, if any,
// else its own hits) hits zero at the *current* incoming dps. This
// generalizes both halves of the old gate without either failure mode: a
// weak hostile has low dps -> huge ticksToKill -> never fires; a lethal
// burst (boosted rush) has high dps -> fires fast even at full hp; a slow
// sustained siege erodes the spawn's *current* hits over time, so
// ticksToKill shrinks on its own as the fight actually goes badly - no
// separate hp-ratio leg needed.
const config = require("../utils/config");
const combat = require("../utils/combat");
const roomCache = require("../utils/roomCache");

// A hostile creep's own attack reach: RANGED_ATTACK connects at 3, ATTACK
// (or anything armed without ranged) only at 1.
function attackReach(hostile) {
    return _.some(hostile.body, (p) => p.type === RANGED_ATTACK)
        ? combat.KITE_RANGE
        : 1;
}

// The hp a hostile actually has to chew through before the spawn itself
// starts losing hits: a rampart on the same tile absorbs everything first
// (native Screeps mechanic - the structure under an intact rampart takes no
// damage), so a well-ramparted spawn is correctly treated as far tougher
// than its own hitsMax would suggest.
function effectiveHp(room, spawn) {
    const rampart = _.find(
        roomCache.structuresByType(room, STRUCTURE_RAMPART),
        (r) => r.my && r.hits > 0 && r.pos.isEqualTo(spawn.pos)
    );
    return rampart ? rampart.hits : spawn.hits;
}

// Ticks until `spawn` dies at the current incoming dps from whichever
// `dangers` can actually reach it - Infinity when none can, so it never
// wins the Math.min in checkSafeMode.
function ticksToKill(room, spawn, dangers) {
    const inRange = _.filter(
        dangers,
        (h) => spawn.pos.getRangeTo(h) <= attackReach(h)
    );
    if (!inRange.length) return Infinity;
    const dps = combat.incomingDps(inRange);
    return dps > 0 ? effectiveHp(room, spawn) / dps : Infinity;
}

function checkSafeMode(room) {
    if (!room.controller || !room.controller.my) return;
    if (room.controller.safeMode) return; // already active, nothing to do

    const spawns = roomCache.structuresByType(room, STRUCTURE_SPAWN);
    if (!spawns.length) return;

    const dangers = combat.threats(room);
    if (!dangers.length) return;

    const worst = Math.min(
        ..._.map(spawns, (s) => ticksToKill(room, s, dangers))
    );
    const threshold = config.get("combat.safeModeTicksToKillThreshold", 20);
    if (worst > threshold) return;

    const result = room.controller.activateSafeMode();
    if (result === OK) {
        console.log(
            `[defense] ${room.name}: spawn projected to fall in ~` +
                `${worst.toFixed(1)} ticks at current incoming dps - ` +
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
