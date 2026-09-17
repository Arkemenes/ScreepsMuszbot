const { receivingLink, energyPiles } = require("../utils/energy");
const { scaledBody } = require("../utils/population");
const { isPlanned } = require("../utils/plan");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const { takeCover } = require("../utils/combat");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const traffic = require("../utils/traffic");
const rampartRepair = require("../utils/rampartRepair");
const resourceTiers = require("../utils/resourceTiers");
const names = require("../utils/names");
const energyLedger = require("../utils/energyLedger");

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
function opportunisticWork(creep) {
    if (creep.store[RESOURCE_ENERGY] === 0) return;

    // when several are in range, take the one closest to full / finished
    const hurt = _.sortBy(
        creep.pos.findInRange(roomCache.structures(creep.room), 3, {
            filter: (s) =>
                s.structureType !== STRUCTURE_CONTROLLER &&
                isPlanned(s) &&
                traffic.worthRepairing(s) &&
                rampartRepair.tier(s) === "critical",
        }),
        (s) => -(s.hits / s.hitsMax)
    )[0];
    if (hurt) {
        const status = creep.repair(hurt);
        if (status === OK) {
            energyLedger.creditRepair(creep, hurt);
        }
        return;
    }

    if (resourceTiers.getEconomySnapshot(creep.room).state !== "critical") {
        const site = _.sortBy(
            creep.pos.findInRange(roomCache.constructionSites(creep.room), 3),
            (s) => -(s.progress / s.progressTotal)
        )[0];
        if (site) {
            const status = creep.build(site);
            if (status === OK) {
                energyLedger.creditBuild(creep, site);
            }
        }
    }
}

var builder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (takeCover(creep)) return;

        opportunisticWork(creep);

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
            // don't take a pile an economy creep (hauler / bootstrap) is going
            // for while the room still wants spawn / extensions filled
            const pile = creep.pos.findClosestByPath(
                reservations.usable(creep, energyPiles(creep.room))
            );
            if (pile) {
                reservations.claim(creep, pile.id);
                creep.pushState("GetEnergy", pile.id);
                if (!creep.invokeState()) creep.say("zzz");
                return;
            }

            reservations.release(creep);

            // room is dry - wait by a receiving link for the network to fill
            // it, and grab whatever it's actually holding once in range. This
            // creep already lost every reservation race that mattered to get
            // here, so standing next to energy without ever taking it (e.g.
            // because a hauler's claim keeps eating the link's spare energy
            // tick after tick) helps no one - a partial, opportunistic
            // withdraw beats idling forever.
            const link = receivingLink(creep.room, creep.pos, {
                awayFromController: true,
            });
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
            let repairTargets = _.filter(
                roomCache.structures(creep.room),
                (s) =>
                    s.structureType != STRUCTURE_CONTROLLER &&
                    s.hits < s.hitsMax &&
                    isPlanned(s) &&
                    traffic.worthRepairing(s) &&
                    rampartRepair.builderMayRepair(s, creep.room)
            );

            var repairTarget;
            if (repairTargets.length) {
                repairTargets = _.sortBy(repairTargets, rampartRepair.priority);

                repairTarget = repairTargets[0];

                if (rampartRepair.tier(repairTarget) === "critical") {
                    creep.pushState("Build", repairTarget.id);
                    if (!creep.invokeState()) {
                        creep.say("zzz");
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
                economy.state === "critical"
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
                    creep.say("zzz");
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
                    creep.say("zzz");
                }
                return;
            }

            let controller = creep.room.controller;

            creep.pushState("Upgrade", controller.id);

            if (!creep.invokeState()) {
                creep.say("zzz");
                return;
            }

            creep.say("zzz");
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

module.exports = builder;
