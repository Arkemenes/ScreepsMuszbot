const { receivingLink, energyPiles } = require("../utils/energy");
const { scaledBody } = require("../utils/population");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const damaged = require("../utils/damagedStructures");
const cpuMeter = require("../utils/cpuMeter");
const { takeCover } = require("../utils/combat");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const traffic = require("../utils/traffic");
const rampartRepair = require("../utils/rampartRepair");
const resourceTiers = require("../utils/resourceTiers");
const names = require("../utils/names");
const energyLedger = require("../utils/energyLedger");
const config = require("../utils/config");
const speak = require("../utils/speech");
const cpuTier = require("../utils/cpuTier");

function abandonUnsafeLinkLoad(creep) {
    if (creep.getState() !== "GetEnergy" || !creep.memory.stack) return false;
    const target = Game.getObjectById(creep.memory.stack[0][1]);
    if (
        target &&
        target.structureType === STRUCTURE_LINK &&
        !target.isCollector() &&
        !reservations.economyStable(creep.room)
    ) {
        creep.clearState();
        reservations.release(creep);
        return true;
    }
    return false;
}

// --- console: force specific construction sites to the front of the queue -
// prioritizeBuild(["id1", "id2", ...]) - builders finish these sites first,
// in this exact order, before falling back to the normal closest-to-finished
// heuristic. clearBuildPriority() drops the override.
let priorityTick = -1;
let priorityCache = null;

function priorityList() {
    if (priorityTick === Game.time) return priorityCache;
    priorityTick = Game.time;

    const raw = (Memory.settings && Memory.settings.buildPriority) || [];
    // self-cleaning: a site that finished, got cancelled, or was never valid
    // drops out on its own instead of sitting in Memory forever
    const alive = raw.filter(
        (id) => Game.constructionSites && Game.constructionSites[id]
    );
    if (alive.length !== raw.length && Memory.settings) {
        Memory.settings.buildPriority = alive;
    }
    priorityCache = alive;
    return alive;
}

// the highest-ranked prioritized site that sits in `creep`'s room, if any
function priorityTarget(creep) {
    for (const id of priorityList()) {
        const site = Game.constructionSites[id];
        if (site.pos.roomName === creep.room.name) return site;
    }
    return null;
}

global.prioritizeBuild = function (ids) {
    if (!Array.isArray(ids)) ids = [ids];
    if (!Memory.settings) Memory.settings = {};
    Memory.settings.buildPriority = ids.filter((id) => typeof id === "string");
    console.log(
        "[build] priority set: " + Memory.settings.buildPriority.join(", ")
    );
};

global.clearBuildPriority = function () {
    if (Memory.settings) delete Memory.settings.buildPriority;
    console.log("[build] priority cleared");
};

// Per-tick, per-room cache: every builder in a room was independently
// re-running worthRepairing/tier over the WHOLE structures list
// every tick - the filtered result is identical for all of them, only the
// findInRange range-check afterwards actually depends on the creep's own
// position, so that's the only part left per-creep below.
//
// Deliberately NOT gated on utils/plan's isPlanned: a rampart that just
// finished construction and hasn't decayed a single tick can already fall
// outside the current plan (mincut/replan moved on) - and since nothing
// dismantles an unplanned structure either, that gate used to leave it
// permanently unrepaired at critical HP until it decayed and vanished
// (user-reported, 2026-09). A structure that physically exists and is
// dying is worth repairing regardless of whether the plan still wants it.
// The critical list is the leading run of the shared per-room damaged list
// (utils/damagedStructures: scanned every 5 ticks, sorted once a tick, shared with the
// tower) - it used to be a filter + tier() over every structure of the room, every tick.
function criticalRepairCandidates(room) {
    return damaged.critical(room);
}

// While carrying energy, do a repair on anything critical within work range
// (3) - the exact same "critical" tier the main repair branch below uses
// (utils/rampartRepair.tier, ROADMAP 0072 - one shared tier system for
// every structure type, not just rampart/wall) - without interrupting the
// trip to the real objective. Only critical, so a passing-by builder never
// gets hijacked into topping off something merely satisfactory; that's
// opportunisticWork's whole job - stop for what genuinely can't wait, keep
// walking for everything else. When the creep is in range of its actual
// target the state machine's own build/repair runs afterwards and takes
// over.
// Same result as creep.pos.findInRange(list, range) for a list of objects, but with a
// plain coordinate check: the native call runs RoomPosition.inRangeTo once per
// candidate, and a room's "critical" list is long (profile 2026-10-02: ~1500
// inRangeTo calls per tick, ~1.2 CPU, all from this function).
function inRangeOf(creep, list, range) {
    const pos = creep.pos;
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const p = list[i].pos;
        if (p.roomName === pos.roomName && Math.abs(p.x - pos.x) <= range && Math.abs(p.y - pos.y) <= range) out.push(list[i]);
    }
    return out;
}

function opportunisticWork(creep) {
    return cpuMeter.span("builder.opportunistic", () => opportunisticWorkNow(creep));
}

function opportunisticWorkNow(creep) {
    if (creep.store[RESOURCE_ENERGY] === 0) return;
    // ARK-116: build and repair share one intent slot - with the Build state's own target
    // already in range, its call this same tick replaces ours, so ours was 0.2 CPU for nothing
    const top = creep.memory.stack && creep.memory.stack[0];
    if (top && top[0] === "Build") {
        const target = Game.getObjectById(top[1]);
        if (target && inRangeOf(creep, [target], 3).length) return;
    }

    // when several are in range, take the one closest to full / finished
    const hurt = _.sortBy(
        inRangeOf(creep, criticalRepairCandidates(creep.room), 3),
        (s) => -(s.hits / s.hitsMax)
    )[0];
    if (hurt) {
        energyLedger.invoke(creep, "repair", hurt);
        return;
    }

    if (resourceTiers.getEconomySnapshot(creep.room).state !== "critical") {
        const site = _.sortBy(
            inRangeOf(creep, roomCache.constructionSites(creep.room), 3),
            (s) => -(s.progress / s.progressTotal)
        )[0];
        if (site) {
            energyLedger.invoke(creep, "build", site);
        }
    }
}

// Per-tick, per-room cache: every builder recomputed this same
// filter+sort (worthRepairing/builderMayRepair, then rampartRepair.priority)
// from scratch, and neither depends on which builder is asking - only room
// state. Not gated on isPlanned either, same reasoning as
// criticalRepairCandidates above - a structure that exists is worth
// repairing whether or not the plan still reserves that tile for it.
function builderRepairTargets(room) {
    return cpuMeter.span("builder.repairList", () => {
        // same order as the tower's list, minus what this room's storage gates keep a builder
        // from repairing (sorting first and filtering after keeps the order)
        const list = damaged.sorted(room);
        const out = [];
        for (let i = 0; i < list.length; i++) {
            if (rampartRepair.builderMayRepair(list[i], room)) out.push(list[i]);
        }
        return out;
    });
}

// --- TEMPORARY diagnostic (CPU investigation, 2026-09) - gated behind
// Memory.settings.debug.builderStats, off by default. Measures
// opportunisticWork's own CPU (Game.cpu.getUsed() delta around the call,
// summed across every builder each tick) to answer "what would we save by
// disabling it" with a real number instead of a guess. Remove once the
// investigation is done - not meant to stay long-term.
function builderTraceEnabled() {
    return !!(
        Memory.settings &&
        Memory.settings.debug &&
        Memory.settings.debug.builderStats
    );
}
let builderTraceTick = -1;
let builderTraceCpu = 0;
let builderTraceCalls = 0;
function builderTrace(cpuDelta) {
    if (builderTraceTick !== Game.time) {
        if (builderTraceTick !== -1) {
            Memory.builderDebug = {
                tick: builderTraceTick,
                opportunisticCpu: builderTraceCpu,
                calls: builderTraceCalls,
            };
        }
        builderTraceTick = Game.time;
        builderTraceCpu = 0;
        builderTraceCalls = 0;
    }
    builderTraceCpu += cpuDelta;
    builderTraceCalls++;
}

// console: builderStats(true) turns the tally on, builderStats() prints the
// last finalized tick's numbers, builderStats(false) turns it back off.
// TEMPORARY - see the block comment above.
global.builderStats = function (enabled) {
    if (typeof enabled === "boolean") {
        Memory.settings = Memory.settings || {};
        Memory.settings.debug = Memory.settings.debug || {};
        Memory.settings.debug.builderStats = enabled;
        console.log("[builderStats] " + (enabled ? "enabled" : "disabled"));
        return;
    }
    console.log("[builderStats] " + JSON.stringify(Memory.builderDebug || {}));
};

// ROADMAP 0152: the empty-and-no-pile builder searches again every builder.idleRecheckTicks ticks.
// Heap only; a reset, a room change or a clock rewind forgets the mark (the next tick searches).
const idleChecks = {}; // creep name -> { tick, room }
let idleChecksGc = 0;
function idleSkip(creep) {
    const every = cpuTier.scaled("builder.idleRecheckTicks", 5);
    if (!(every > 1)) return false;
    const mark = idleChecks[creep.name];
    return !!mark && mark.room === creep.room.name && Game.time >= mark.tick && Game.time - mark.tick < every;
}
function markIdle(creep) {
    idleChecks[creep.name] = { tick: Game.time, room: creep.room.name };
    if (Game.time - idleChecksGc >= 300 || Game.time < idleChecksGc) {
        idleChecksGc = Game.time;
        Object.keys(idleChecks).forEach((name) => {
            if (!Game.creeps[name] || Game.time - idleChecks[name].tick > 50) delete idleChecks[name];
        });
    }
}

var builder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (takeCover(creep)) return;
        // ROADMAP 0149: a prepared boost lab takes this tick (walk there / boostCreep); until the
        // lab is ready the builder keeps working - a boost never makes it wait
        if (require("../utils/boostExecutor").claim(creep)) return;
        // ARK-116: nothing to build, repair or upgrade last time - look again later
        if (creep.memory.idleUntil) {
            if (Game.time < creep.memory.idleUntil && creep.memory.idleRoom === creep.room.name) return;
            delete creep.memory.idleUntil; delete creep.memory.idleRoom;
        }

        if (builderTraceEnabled()) {
            const start = Game.cpu.getUsed();
            opportunisticWork(creep);
            builderTrace(Game.cpu.getUsed() - start);
        } else {
            opportunisticWork(creep);
        }

        // A link selected while spawn/extensions were full may become
        // reserved for the economy before this creep reaches it.
        abandonUnsafeLinkLoad(creep);

        if (
            creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            creep.getState() == "GetEnergy"
        ) {
            creep.clearState();
        }
        if (creep.invokeState()) {
            return;
        }

        // Get Energy. Drops, tombstones, ruins, links, containers and storage
        // are all the same to a builder - take the closest by path. A builder
        // never harvests a source directly - that's the miner's seat, and
        // mining without a container/link/tower to receive it just spills
        // energy on the ground; a dry room means wait, not mine.
        if (creep.store[RESOURCE_ENERGY] == 0) {
            // ROADMAP 0152: an empty builder that found no pile (dry room) looks again every
            // builder.idleRecheckTicks (5) ticks instead of running the path search every tick
            if (idleSkip(creep)) {
                cpuMeter.record("spans", "builder.idleSkip", 0); // calls/tick = searches avoided
            } else {
                delete idleChecks[creep.name];
                // don't take a pile an economy creep (hauler / bootstrap) is going
                // for while the room still wants spawn / extensions filled
                const piles = energyPiles(creep.room);
                const linkSafe = reservations.economyStable(creep.room);
                const eligiblePiles = linkSafe
                    ? piles
                    : _.filter(piles, (p) => p.structureType !== STRUCTURE_LINK);
                const pile = cpuMeter.span("builder.pickPile", () => creep.pos.findClosestByPath(
                    reservations.usable(creep, eligiblePiles)
                ));
                if (pile) {
                    reservations.claim(creep, pile.id);
                    creep.pushState("GetEnergy", pile.id);
                    if (!creep.invokeState()) speak(creep, "zzz");
                    return;
                }

                reservations.release(creep);
                markIdle(creep);
            }

            // room is dry - wait by a receiving link for the network to fill
            // it, and grab whatever it's actually holding once in range. This
            // creep already lost every reservation race that mattered to get
            // here, so standing next to energy without ever taking it (e.g.
            // because a hauler's claim keeps eating the link's spare energy
            // tick after tick) helps no one - a partial, opportunistic
            // withdraw beats idling forever.
            const link = reservations.economyStable(creep.room)
                ? receivingLink(creep.room, creep.pos, {
                    awayFromController: true,
                })
                : null;
            if (link) {
                if (!creep.pos.inRangeTo(link, 1)) {
                    creep.moveTo(link, { range: 1 });
                } else if (link.store[RESOURCE_ENERGY] > 0) {
                    creep.withdraw(link, RESOURCE_ENERGY);
                }
            }
            return;
        }
        // Spend Energy
        else {
            reservations.release(creep);
            // ROADMAP 0072 (user-specified: tower and builder share the
            // exact same repair logic now): one tier+type+ratio-sorted pool
            // (utils/rampartRepair.priority) for every damaged structure -
            // critical/satisfactory/optimal, normal-before-rampart-before-
            // wall within a tier. builderMayRepair filters out an
            // optimal-tier rampart/wall unless the room's storage reserve
            // covers it (unchanged since ROADMAP 0054/0068 - builder is
            // population-limited, self-throttling, so it keeps the looser
            // gate tower.js no longer gets); a normal structure's optimal
            // tier is always eligible regardless (bounded/cheap repair, no
            // reserve concern).
            let repairTargets = builderRepairTargets(creep.room);

            var repairTarget;
            if (repairTargets.length) {
                repairTarget = repairTargets[0];

                if (rampartRepair.tier(repairTarget) === "critical") {
                    creep.pushState("Build", repairTarget.id);
                    if (!creep.invokeState()) {
                        speak(creep, "zzz");
                    }
                    return;
                }
            }

            // a console-forced priority site (prioritizeBuild()) always wins;
            // otherwise the sites closest to being finished, ties broken by
            // distance
            const constructionSites = roomCache.constructionSites(creep.room);
            const economy = resourceTiers.getEconomySnapshot(creep.room);
            var targetConstructionSite =
                economy.state === "critical" &&
                creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0
                    ? null
                    : priorityTarget(creep) ||
                        _.sortBy(
                            constructionSites,
                            (s) =>
                                -(s.progress / s.progressTotal) +
                                creep.pos.getRangeTo(s) / 10000
                        )[0];

            if (targetConstructionSite) {
                creep.pushState("Build", targetConstructionSite.id);
                if (!creep.invokeState()) {
                    speak(creep, "zzz");
                }
                return;
            }

            // repairTarget (whatever tier it landed at - satisfactory or
            // optimal, critical already returned above) is the dead-last
            // fallback now: nothing left to build, and it's already the
            // single most urgent thing worth repairing per the unified
            // tier+type+ratio pool above. No separate rampart/wall-only
            // pass needed anymore (ROADMAP 0072) - builderMayRepair already
            // filtered out anything past-target that the room can't
            // currently afford before this pool was ever built.
            if (repairTarget) {
                creep.pushState("Build", repairTarget.id);
                if (!creep.invokeState()) {
                    speak(creep, "zzz");
                }
                return;
            }

            let controller = creep.room.controller;

            // RCL8 controllers cannot bank more progress once literally
            // topped off, so a naive `>= CONTROLLER_DOWNGRADE[8]` gate
            // sounds like the right check on paper - but in practice
            // ticksToDowngrade pins exactly at that max the instant any
            // creep (this one or another) tops it off, and stays there for
            // a long time, so "literal max" in effect meant "never stop
            // upgrading" (ROADMAP 0103 fifth follow-up, real bug reported
            // in production, 2026-09-24: a builder was still spending on a
            // controller sitting at cap). Reuse the same rcl8SafeRatio mark
            // isExcessUpgrader() already treats as "safe" (99% of max) -
            // below it there's real room to take more, at or above it the
            // controller isn't genuinely at risk and a builder with energy
            // in hand should go look for actual building/repair work
            // instead of pinning it there. This is still an acquisition/
            // role mark being reused here, not a fresh literal-fullness
            // check - deliberately so, since "safe to stop" and "safe to
            // convert away" are the same question asked from two creeps.
            if (
                !controller ||
                (controller.level >= 8 &&
                    controller.ticksToDowngrade >=
                        CONTROLLER_DOWNGRADE[8] *
                            config.get("upgrader.rcl8SafeRatio", 0.99))
            ) {
                speak(creep, "zzz");
                const idle = cpuTier.scaled("builder.idleSpendRecheckTicks", 10);
                if (idle > 1) { creep.memory.idleUntil = Game.time + idle; creep.memory.idleRoom = creep.room.name; }
                return;
            }

            creep.pushState("Upgrade", controller.id);

            if (!creep.invokeState()) {
                speak(creep, "zzz");
                return;
            }

            speak(creep, "zzz");
            return;
        }
    },
    // the number of builders this room should have - see rooms/needs.js
    wanted: function (room) {
        return roomNeeds(room).builder;
    },
    // checks if the room needs to spawn a creep
    spawn: function (room) {
        return census.count(room.name, "builder", 0) < this.wanted(room);
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = names.generate("builder");
        let body = scaledBody(room, [WORK, CARRY, MOVE]);
        let memory = { role: "builder" };

        return { name, body, memory };
    },
};

// exposed for the offline smoke test only
builder.idleSkip = idleSkip;
builder.markIdle = markIdle;

module.exports = builder;
