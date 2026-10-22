// ROADMAP 0185 (ARK-236): headcount of a room with no storage and no link network
// (low RCL). The fixed hauler tier (containers + 1) left 2-3 haulers idle as soon as
// spawn/extensions were full - with no storage there is nowhere else to put energy -
// while the surplus piled up in the source containers and upgraders only grew by one
// every autoscale.cooldown (30000) ticks.
//
// Two smoothed signals per room, sampled whenever rooms/needs.js recomputes:
//   pressure  spawn/extensions have room AND a source container holds a full trip
//             -> the haulers are not keeping up (1 extra hauler while it stays high)
//   surplus   spawn/extensions full AND every source container full -> energy has no
//             sink left but the controller (one more upgrader every surplusCooldown)
// Memory.rooms[name].noStorageEco = { p, s, h, up, upTick } (numbers only).

const config = require("../utils/config");
const census = require("../utils/census");
const cpuTier = require("../utils/cpuTier");
const { hasLinkNetwork } = require("../utils/energy");

function applies(room) {
    const ctrl = room.controller;
    return !!(config.get("noStorageEconomy.enabled", true) && ctrl && ctrl.my && ctrl.level < 8 &&
        !room.storage && !hasLinkNetwork(room));
}

function ema(prev, sample) {
    const alpha = config.get("noStorageEconomy.alpha", 0.2);
    return (prev === undefined ? sample : prev + alpha * (sample - prev));
}

// Update the signals and return { hauler, upgraderExtra }: the hauler count for the room
// (1 + the extra one while pressure holds) and the upgraders added on top of the base tier.
// `pressure` / `surplus` are this sample's booleans, worked out by rooms/needs.js.
function observe(room, mem, pressure, surplus, baseUpgraders) {
    const st = mem.noStorageEco || (mem.noStorageEco = { h: 0, up: 0, upTick: Game.time });
    st.p = Math.round(ema(st.p, pressure ? 1 : 0) * 1000) / 1000;
    st.s = Math.round(ema(st.s, surplus ? 1 : 0) * 1000) / 1000;

    // hysteresis: the extra hauler comes at p >= high and leaves at p <= low
    if (st.p >= config.get("noStorageEconomy.pressureHigh", 0.5)) st.h = 1;
    else if (st.p <= config.get("noStorageEconomy.pressureLow", 0.2)) st.h = 0;

    const cooldown = config.get("noStorageEconomy.surplusCooldown", 1500);
    if (Game.time - st.upTick >= cooldown || Game.time < st.upTick) {
        const cap = config.get("noStorageEconomy.maxUpgraders", 5);
        if (st.s >= config.get("noStorageEconomy.surplusHigh", 0.6) && baseUpgraders + st.up < cap &&
            cpuTier.band() !== "critical") {
            st.up++;
            st.upTick = Game.time;
        } else if (st.s <= config.get("noStorageEconomy.surplusLow", 0.2) && st.up > 0) {
            st.up--;
            st.upTick = Game.time;
        }
    }
    return { hauler: 1 + st.h, upgraderExtra: st.up };
}

// The excess hauler that should go back to the spawn: when the room has more haulers
// than it wants, the one closest to dying goes (one at a time, only once it is idle).
function isExcessHauler(creep, wanted) {
    if (!applies(creep.room)) return false;
    const haulers = census.creepsByRole(creep.room.name, "hauler");
    if (haulers.length <= wanted) return false;
    let oldest = null;
    for (const c of haulers) {
        if (c.memory.recycle) return false; // one already on its way
        if (!oldest || (c.ticksToLive || Infinity) < (oldest.ticksToLive || Infinity)) oldest = c;
    }
    return oldest === creep;
}

// Walk to the closest spawn and recycle (part of the body's cost comes back as energy).
function recycle(creep) {
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) { delete creep.memory.recycle; return false; }
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) creep.moveTo(spawn, { range: 1 });
    return true;
}

module.exports = { applies, observe, isExcessHauler, recycle };
