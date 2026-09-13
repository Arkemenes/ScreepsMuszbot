// Generic incremental per-room autoscale (ROADMAP 0040). A role registers a
// grow(room, wanted) and/or shrink(room, wanted, delta) predicate here
// instead of jumping straight to a fixed target (0039's blunt "jump to 4").
// A single room-wide cooldown throttles ANY one +1/-1 step, shared across
// every registered role - when it opens, the room picks whichever eligible
// role scores highest to grow (or, failing that, whichever eligible role
// scores highest to shrink) and moves that one role by 1. Growth is
// preferred over shrinking when both are on the table in the same window -
// an idle surplus is the more urgent problem to react to. A tie (equal
// scores) goes to whichever role called register() first - the call order
// in rooms/needs.js (or wherever a role registers) IS the tie-break
// priority, so that order is deliberate, not incidental.
//
// Memory.rooms[name].autoscale = { delta: {role: n}, lastAdjustTick }
// persists the running per-role adjustment (delta, can be negative-capped
// at 0 - see apply()) and the room's own cooldown clock. Nothing here
// scans Game.creeps/room.find - each registered predicate is responsible
// for using roomCache/census like every other rooms/needs.js formula
// (constitution §1).

const config = require("./config");

const registry = {};

// entry: { grow(room, wanted) -> pressure (>0 = eligible, higher = more
//          urgent) , shrink(room, wanted, delta) -> pressure (>0 =
//          eligible to give back one, higher = more urgent), maxCount(room)
//          -> the absolute ceiling for this role's TOTAL count (base tier
//          + delta combined), re-read live so a Memory.settings override
//          takes effect without redeploy }. grow/shrink can each be omitted
// for a role that only ever moves one direction; maxCount can be omitted
// for a role with no ceiling of its own (rare - most should set one, see
// apply()).
function register(role, entry) {
    registry[role] = entry;
}

function state(name) {
    if (!Memory.rooms[name]) Memory.rooms[name] = {};
    const mem = Memory.rooms[name];
    if (!mem.autoscale) mem.autoscale = { delta: {}, lastAdjustTick: 0 };
    if (!mem.autoscale.delta) mem.autoscale.delta = {};
    return mem.autoscale;
}

// Applies the room's current delta to `wanted`, and - once its cooldown has
// elapsed - lets the registry pick a single +1/-1 step for the next window.
// Never throws: a predicate that errors is skipped for that role rather
// than aborting the room's whole population calc (constitution §3).
function apply(room, wanted) {
    const st = state(room.name);
    const cooldown = config.get("autoscale.cooldown", 30000);

    if (Game.time - st.lastAdjustTick >= cooldown) {
        let growRole = null;
        let growScore = 0;
        let shrinkRole = null;
        let shrinkScore = 0;

        for (const role of Object.keys(registry)) {
            const entry = registry[role];
            const delta = st.delta[role] || 0;
            if (entry.grow) {
                let score = 0;
                try {
                    score = entry.grow(room, wanted, delta) || 0;
                } catch (e) {
                    console.log(`[autoscale] grow(${role}) threw: ${e}`);
                }
                if (score > growScore) {
                    growScore = score;
                    growRole = role;
                }
            }
            if (entry.shrink && delta > 0) {
                let score = 0;
                try {
                    score = entry.shrink(room, wanted, delta) || 0;
                } catch (e) {
                    console.log(`[autoscale] shrink(${role}) threw: ${e}`);
                }
                if (score > shrinkScore) {
                    shrinkScore = score;
                    shrinkRole = role;
                }
            }
        }

        if (growRole) {
            st.delta[growRole] = (st.delta[growRole] || 0) + 1;
            st.lastAdjustTick = Game.time;
        } else if (shrinkRole) {
            st.delta[shrinkRole] = (st.delta[shrinkRole] || 0) - 1;
            st.lastAdjustTick = Game.time;
        }
    }

    for (const role of Object.keys(st.delta)) {
        const delta = st.delta[role];
        if (delta && role in wanted) {
            wanted[role] = Math.max(0, wanted[role] + delta);
        }
    }

    // Absolute ceiling, independent of how the number got there - the base
    // tier alone can already sit above a role's own maxCount (e.g. a
    // backlog-driven tier that tops out higher than the ceiling someone
    // configured), and grow()'s own cap check only ever stops FURTHER
    // growth, it can't pull an already-too-high base tier back down. This
    // is the generic version of the RCL8 clamp rooms/needs.js applies to
    // upgrader by hand - any role with a maxCount gets the same guarantee.
    for (const role of Object.keys(registry)) {
        const entry = registry[role];
        if (!entry.maxCount || !(role in wanted)) continue;
        let cap;
        try {
            cap = entry.maxCount(room);
        } catch (e) {
            console.log(`[autoscale] maxCount(${role}) threw: ${e}`);
            continue;
        }
        if (typeof cap === "number") wanted[role] = Math.min(wanted[role], cap);
    }

    return wanted;
}

module.exports = { register, apply };
