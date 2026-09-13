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
const names = require("../utils/names");

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
// (3) - the same "critical" bar the main repair branch below uses (<30% for
// most structures, rampart via the shared utils/rampartRepair.isCritical
// tier instead of a flat ratio, since hitsMax for a rampart scales up to
// 300M at RCL8) - without interrupting the trip to the real objective. Only
// critical, so a passing-by builder never gets hijacked into topping off
// something merely under 35%/healthy; that's opportunisticWork's whole job -
// stop for what genuinely can't wait, keep walking for everything else. When
// the creep is in range of its actual target the state machine's own
// build/repair runs afterwards and takes over.
function opportunisticWork(creep) {
    if (creep.store[RESOURCE_ENERGY] === 0) return;

    // when several are in range, take the one closest to full / finished
    const hurt = _.sortBy(
        creep.pos.findInRange(roomCache.structures(creep.room), 3, {
            filter: (s) =>
                s.structureType !== STRUCTURE_CONTROLLER &&
                s.structureType !== STRUCTURE_WALL &&
                isPlanned(s) &&
                traffic.worthRepairing(s) &&
                (s.structureType === STRUCTURE_RAMPART
                    ? rampartRepair.isCritical(s)
                    : s.hits / s.hitsMax < 0.3),
        }),
        (s) => -(s.hits / s.hitsMax)
    )[0];
    if (hurt) {
        creep.repair(hurt);
        return;
    }

    const site = _.sortBy(
        creep.pos.findInRange(roomCache.constructionSites(creep.room), 3),
        (s) => -(s.progress / s.progressTotal)
    )[0];
    if (site) {
        creep.build(site);
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
            let repairTargets = _.filter(
                roomCache.structures(creep.room),
                (s) =>
                    s.structureType != STRUCTURE_CONTROLLER &&
                    s.structureType != STRUCTURE_WALL &&
                    s.hits < s.hitsMax &&
                    (s.structureType != STRUCTURE_RAMPART ||
                        rampartRepair.isCritical(s)) &&
                    isPlanned(s) &&
                    traffic.worthRepairing(s)
            );

            var repairTarget;
            if (repairTargets.length) {
                repairTargets = _.sortBy(
                    repairTargets,
                    (s) => s.hits / s.hitsMax
                );

                repairTarget = repairTargets[0];

                if (repairTargets[0].hits / repairTargets[0].hitsMax < 0.3) {
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
            var targetConstructionSite =
                priorityTarget(creep) ||
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

            if (repairTarget) {
                creep.pushState("Build", repairTarget.id);
                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            // dead-last fallback, reached only once there's nothing left to
            // build or repair - same utils/rampartRepair tiers as the
            // opportunistic check above and structures/tower.js, so all
            // three agree on what "still worth hardening" means.
            let damagedRamparts = _.filter(
                roomCache.structures(creep.room),
                (s) =>
                    s.structureType == STRUCTURE_RAMPART &&
                    isPlanned(s) &&
                    rampartRepair.worthHardening(s, creep.room)
            );

            if (damagedRamparts.length) {
                damagedRamparts = _.sortBy(
                    damagedRamparts,
                    (s) => s.hits / s.hitsMax
                );

                creep.pushState("Build", damagedRamparts[0].id);
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
