// The single place that decides how many of each creep role a room wants.
// Every role's wanted() reads its slice from here; idealPopulation sums it.
// Cached per tick per room.

const census = require("../utils/census");
const claimDiagnostics = require("../utils/claimDiagnostics");
const roomCache = require("../utils/roomCache");
const { hasLinkNetwork } = require("../utils/energy");
const remotes = require("./remotes");
const config = require("../utils/config");
const cpuMeter = require("../utils/cpuMeter");
const observer = require("../utils/observer");
const pioneering = require("./pioneering");
const autoscale = require("../utils/autoscale");
const nonEnergyLogistics = require("../utils/nonEnergyLogistics");

let builtTick = -1;
let cache = {};

// Every key compute() puts in its returned object - the only roles a
// per-room override (Memory.rooms[name].wantedOverride, ROADMAP 0038) is
// allowed to touch. Kept in sync by hand with compute()'s return.
const ROLE_NAMES = [
    "miner", "hauler", "bootstrap", "upgrader", "builder", "defender",
    "defenderStriker", "defenderMedic", "scout", "reserver", "remoteMiner",
    "remoteHauler", "raider", "pioneer",
];

// Manual per-room override (console setWanted/clearWanted below) - applied
// on top of the computed formula so a room stuck idle (everything built,
// energy piling up) can be told "more upgraders" without touching a role's
// code. Never throws: an unknown role or non-number value is dropped
// silently (constitution §3) instead of corrupting `wanted`.
function applyOverride(name, wanted) {
    const mem = Memory.rooms[name];
    const override = mem && mem.wantedOverride;
    if (!override) return wanted;
    for (const role of Object.keys(override)) {
        const value = override[role];
        if (ROLE_NAMES.indexOf(role) !== -1 && typeof value === "number") {
            wanted[role] = value;
        }
    }
    if (typeof wanted.builder === "number") wanted.builder = Math.min(wanted.builder, 1);
    return wanted;
}

global.setWanted = function (roomName, role, count) {
    if (ROLE_NAMES.indexOf(role) === -1) {
        console.log(`[needs] role desconhecido: ${role} (esperado um de ${ROLE_NAMES.join(", ")})`);
        return;
    }
    if (typeof count !== "number" || count < 0) {
        console.log(`[needs] count precisa ser um número >= 0, recebi ${count}`);
        return;
    }
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    if (!Memory.rooms[roomName].wantedOverride) Memory.rooms[roomName].wantedOverride = {};
    Memory.rooms[roomName].wantedOverride[role] = count;
    invalidate(roomName);
    console.log(`[needs] ${roomName}: ${role} override -> ${count}`);
};

global.clearWanted = function (roomName, role) {
    const mem = Memory.rooms[roomName];
    if (!mem || !mem.wantedOverride) return;
    invalidate(roomName);
    if (role) {
        delete mem.wantedOverride[role];
        console.log(`[needs] ${roomName}: override de ${role} removido`);
    } else {
        delete mem.wantedOverride;
        console.log(`[needs] ${roomName}: todos os overrides removidos`);
    }
};

global.listWanted = function (roomName) {
    if (roomName) {
        const override = Memory.rooms[roomName] && Memory.rooms[roomName].wantedOverride;
        console.log(`[needs] ${roomName}: ${override ? JSON.stringify(override) : "sem override"}`);
        return;
    }
    let any = false;
    for (const name of Object.keys(Memory.rooms)) {
        const override = Memory.rooms[name].wantedOverride;
        if (override) {
            any = true;
            console.log(`[needs] ${name}: ${JSON.stringify(override)}`);
        }
    }
    if (!any) console.log("[needs] nenhuma sala com override ativo");
};

function sourceContainers(room) {
    return _.filter(
        roomCache.structuresByType(room, STRUCTURE_CONTAINER),
        (c) => nearSource(room, c)
    );
}

// A container within range 1 of an energy source (cached source list, no native find per container).
function nearSource(room, container) {
    return roomCache.sources(room).some(
        (src) => Math.abs(src.pos.x - container.pos.x) <= 1 && Math.abs(src.pos.y - container.pos.y) <= 1
    );
}

// Energy a builder could actually pick up right now: drops, tombstones, ruins,
// containers, storage, and receiving (non-collector) links.
function pickableEnergy(room) {
    let e = 0;
    if (room.storage && room.storage.store) {
        e += room.storage.store[RESOURCE_ENERGY] || 0;
    }
    for (const r of roomCache.droppedResources(room)) {
        if (r.resourceType === RESOURCE_ENERGY) e += r.amount;
    }
    for (const t of roomCache.tombstones(room)) {
        e += (t.store && t.store[RESOURCE_ENERGY]) || 0;
    }
    for (const ruin of roomCache.ruins(room)) {
        e += (ruin.store && ruin.store[RESOURCE_ENERGY]) || 0;
    }
    for (const s of roomCache.structures(room)) {
        if (
            s.structureType === STRUCTURE_CONTAINER ||
            (s.structureType === STRUCTURE_LINK && !s.isCollector())
        ) {
            e += (s.store && s.store[RESOURCE_ENERGY]) || 0;
        }
    }
    return e;
}

// True once the room is actively pulling a mineral out of the ground -
// extractor + container both planted (architect.js's job) next to a deposit
// that isn't currently depleted. Mirrors roles/mineralMiner.js's own
// mineralSite() gate (kept separate rather than imported - that role is
// deliberately never routed through this module, see its own header
// comment) so the two can never read the deposit's state differently.
// Depleted (mineralAmount <= 0) reads as inactive on purpose: nothing left
// to haul, so the extra hauler below wouldn't have a job either.
function mineralOperationActive(room) {
    const mineral = roomCache.minerals(room)[0];
    if (!mineral || mineral.mineralAmount <= 0) return false;
    const extractor = roomCache.structuresNear(room, mineral.pos, STRUCTURE_EXTRACTOR, 0)[0];
    if (!extractor) return false;
    return roomCache.structuresNear(room, mineral.pos, STRUCTURE_CONTAINER, 1).length > 0;
}

function pressuredOutputHaulerFloor(room, currentHaulers) {
    if (!room.storage && !room.terminal) return 0;
    const high = config.get("mineralHauler.pressureHigh", 0.75);
    const hasOutputAt = (threshold) =>
        nonEnergyLogistics.outputs(room).some(
            (output) =>
                output.kind !== "mineralContainer" && output.ratio >= threshold
        );
    if (hasOutputAt(high)) return 2;
    const low = config.get("mineralHauler.pressureLow", 0.5);
    return currentHaulers >= 2 && hasOutputAt(low) ? 2 : 0;
}

// source containers that don't yet have a collector link next to them - those
// still rely on a hauler even in a link-network room
function unlinkedSourceContainers(room) {
    return _.filter(
        sourceContainers(room),
        (c) =>
            c.pos.findInRange(FIND_MY_STRUCTURES, 2, {
                filter: (s) =>
                    s.structureType === STRUCTURE_LINK && s.isCollector(),
            }).length === 0
    ).length;
}

// True when every source container is full - has at least one, and every
// one of them has zero free energy capacity. A young room without
// STRUCTURE_STORAGE yet already stops the miner harvesting into a full
// container with nowhere else to send the overflow (ROADMAP 0023) - this
// is the same signal, read from rooms/needs.js instead.
function sourceContainersFull(room) {
    const containers = sourceContainers(room);
    return (
        containers.length > 0 &&
        containers.every((c) => c.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
    );
}

// True when the room has nothing left to build and nowhere left to put
// incoming energy: spawn/extensions already topped off, and every source
// container full (or, if it exists, the storage) - the room's income has
// no sink left except the controller/a helper mission. Shared by upgrader
// (grow into the controller) and pioneer (spare a helper elsewhere)
// below - each adds its own extra gate on top (RCL, a pending target).
function roomEnergySurplus(room) {
    if (roomCache.constructionSites(room).length > 0) return false;
    if (room.energyAvailable < room.energyCapacityAvailable) return false;
    const storageFull =
        room.storage && room.storage.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
    return sourceContainersFull(room) || storageFull;
}

function upgraderSurplusEligible(room) {
    const ctrl = room.controller;
    if (!ctrl || !ctrl.my || ctrl.level >= 8) return false;
    return roomEnergySurplus(room);
}

// hauler: source containers are backing up (full) while at least one of the
// room's OWN destinations (spawn/ext, or storage if it has one) still has
// room to receive more. The mirror image of upgraderSurplusEligible's
// "nowhere to put energy": here there IS somewhere, the hauler just isn't
// getting it there fast enough - a throughput problem, not a destination
// problem, so the fix is more hauler, not more upgrader. When EVERY
// destination is also full, this returns false on purpose - that's
// upgrader's case, not hauler's (adding a hauler wouldn't help, there'd be
// nowhere for it to unload either).
function haulerBacklogEligible(room) {
    if (!sourceContainersFull(room)) return false;
    const spawnsFull = room.energyAvailable >= room.energyCapacityAvailable;
    const storageFull =
        room.storage && room.storage.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
    const everyDestinationFull = spawnsFull && (!room.storage || storageFull);
    return !everyDestinationFull;
}

// hauler: no source container currently holds enough to be worth a trip
// (same bar roles/hauler.js's pickLoad already uses, ROADMAP 0025) - the
// sources simply aren't generating enough for the hauler capacity already
// in the room, an extra one would just make empty trips.
function haulerIdleEligible(room) {
    const containers = sourceContainers(room);
    if (!containers.length) return false;
    const minLoad = config.get("hauler.minContainerLoad", 1000);
    return containers.every((c) => (c.store[RESOURCE_ENERGY] || 0) < minLoad);
}

// builder: a real backlog exists AND the room can comfortably feed one more
// builder beyond the base formula's own ceiling (byEnergy already tops out
// at 4, see below) - pickableEnergy is the exact pool builder.js itself
// draws from.
function builderSurplusEligible(room) {
    if (roomCache.constructionSites(room).length === 0) return false;
    return pickableEnergy(room) > config.get("builder.autoscaleEnergyHigh", 50000);
}

// builder: either nothing left to build at all (minimize - the base
// formula's own floor already does most of this, but an autoscaled extra
// needs its own way back down), or pickable energy has dropped low enough
// that another builder would just idle/starve rather than help.
function builderScarceEligible(room) {
    if (roomCache.constructionSites(room).length === 0) return true;
    return pickableEnergy(room) < config.get("builder.autoscaleEnergyLow", 1500);
}

// pioneer: the mother room still has a real spawnless target in range
// (regardless of pioneer.maxConcurrent, which pioneersWanted() already
// caps - see hasPendingTarget) AND the mother itself has energy surplus -
// spare the extra hands only once home's own economy has nowhere left to
// put its own income either.
function pioneerSurplusEligible(room) {
    if (!pioneering.hasPendingTarget(room)) return false;
    return roomEnergySurplus(room);
}

// Registered once at module load (ROADMAP 0040/0041): each role grows by 1
// per cooldown window while its own eligibility holds, and gives a step
// back once it no longer does. `maxCount` is an ABSOLUTE ceiling on the
// role's total count (base tier + autoscale delta combined) - not just a
// "stop growing" threshold: rooms/needs.js's own tiers for builder/hauler
// can already sit above a low maxCount on their own (e.g. a big
// construction backlog alone drives builder to 4), and utils/autoscale.js
// clamps the final number down to maxCount regardless of how it got there.
// Registration order IS the tie-break order (utils/autoscale.js walks
// Object.keys(registry) and keeps the first role to reach the top score) -
// when more than one role is eligible for the same +1/-1 in the same
// room/window, this list decides who goes first:
// pioneer > hauler > builder > upgrader. Rescuing a spawnless sister room
// (pioneer) outranks this room's own throughput (hauler), which outranks
// finishing this room's own construction (builder), which outranks banking
// extra upgrade progress this room didn't ask for (upgrader) - each rung
// only ever competes with another when both are eligible at once, which is
// the exception, not the rule (see each predicate's own comment above).
autoscale.register("pioneer", {
    grow(room, wanted, delta) {
        if (!pioneerSurplusEligible(room)) return 0;
        const cap = config.get("pioneer.autoscaleMaxCount", 6);
        if (wanted.pioneer + delta >= cap) return 0;
        return 1;
    },
    shrink(room) {
        return pioneerSurplusEligible(room) ? 0 : 1;
    },
    maxCount() {
        return config.get("pioneer.autoscaleMaxCount", 6);
    },
});

autoscale.register("hauler", {
    grow(room, wanted, delta) {
        if (!haulerBacklogEligible(room)) return 0;
        const cap = config.get("hauler.autoscaleMaxCount", 3);
        if (wanted.hauler + delta >= cap) return 0;
        return 1;
    },
    shrink(room) {
        return haulerIdleEligible(room) ? 1 : 0;
    },
    maxCount() {
        return config.get("hauler.autoscaleMaxCount", 3);
    },
});

autoscale.register("builder", {
    grow(room, wanted, delta) {
        if (!builderSurplusEligible(room)) return 0;
        const cap = 1;
        if (wanted.builder + delta >= cap) return 0;
        return 1;
    },
    shrink(room) {
        return builderScarceEligible(room) ? 1 : 0;
    },
    maxCount() {
        return 1;
    },
});

autoscale.register("upgrader", {
    grow(room, wanted, delta) {
        if (!upgraderSurplusEligible(room)) return 0;
        const cap = config.get("upgrader.autoscaleMaxCount", 8);
        if (wanted.upgrader + delta >= cap) return 0;
        return 1;
    },
    shrink(room) {
        return upgraderSurplusEligible(room) ? 0 : 1;
    },
    maxCount() {
        return config.get("upgrader.autoscaleMaxCount", 8);
    },
});

function compute(room) {
    const name = room.name;
    const mem = Memory.rooms[name] || {};
    const ctrl = room.controller;
    const rcl = ctrl && ctrl.my ? ctrl.level : 0;

    const sources = roomCache.sources(room).length;
    const srcContainers = sourceContainers(room);
    const containers = srcContainers.length;
    const links = hasLinkNetwork(room);
    const hostiles = mem.enemies || 0;
    const storageEnergy = room.storage
        ? room.storage.store[RESOURCE_ENERGY]
        : 0;
    const sites = roomCache.constructionSites(room);

    const miners = census.count(name, "miner", 0);
    const haulers = census.count(name, "hauler", 0);

    // --- hauler / carrier ---
    let hauler;
    if (!containers && !room.storage) {
        hauler = 0; // pre-container: the bootstrap carries energy
    } else if (links) {
        // a full link network teleports the bulk of the energy; one hauler
        // handles the last mile (base link -> spawn/ext, drops, controller),
        // plus one per source whose collector link isn't up yet
        hauler = 1 + unlinkedSourceContainers(room);
    } else {
        hauler = Math.min(config.get("hauler.maxCountNoLinks", 5), containers + 1);
    }

    // an active mineral operation shares this room's haulers with the
    // energy loop (roles/hauler.js's pickMineralJob, lowest priority but
    // still a real trip) - floor the count at 2 while there's a deposit
    // worth hauling and somewhere (storage) to put it, so mineral hauling
    // doesn't come entirely out of the room's own energy throughput.
    if (room.storage && mineralOperationActive(room)) {
        hauler = Math.max(hauler, config.get("hauler.minCountWithMineral", 2));
    }
    hauler = Math.max(hauler, pressuredOutputHaulerFloor(room, haulers));

    // --- bootstrap: emergency only ---
    const bootstrap = miners > 0 && (haulers > 0 || links) ? 0 : 1;

    // --- upgrader: scale with the energy the room can spare. Beyond this
    //     fixed tier, an incremental autoscale (ROADMAP 0040, registered
    //     above) adds/removes 1 at a time, on its own room-wide cooldown,
    //     while the room stays surplus-eligible (upgraderSurplusEligible) -
    //     applied below, after every role's base count is computed. ---
    let upgrader;
    if (!ctrl || !ctrl.my) {
        upgrader = 0;
    } else if (rcl >= 8) {
        // RCL8 has no more RCL progress to bank, but the controller still
        // decays: ticksToDowngrade keeps ticking down, and upgradeController()
        // still resets it even past max (it just stops adding progress).
        // ROADMAP 0103 follow-up (real bug): this used to be a flat 0 -
        // nothing ever called upgradeController() again once a room hit
        // RCL8, so ticksToDowngrade only ever decayed and the room was on a
        // one-way trip to downgrading out of RCL8 entirely. Before that, it
        // used a tight `< CONTROLLER_DOWNGRADE[8]` trigger - but a single
        // upgrade always resets the timer straight to the max (not
        // incrementally), so the lone upkeep upgrader satisfied its own
        // trigger within a tick of spawning, converted to a builder, and
        // the whole cycle repeated every creep lifetime forever (the actual
        // bug 0103 was trying to fix). A wide low-water mark instead: only
        // want the 1 upkeep upgrader once the timer has decayed well below
        // max, so the post-upgrade reset buys far longer than a creep's
        // lifespan before it's needed again.
        // This is only the "needs one" mark, not "safe to demote" - that's
        // a separate, higher mark (upgrader.rcl8SafeRatio) checked in
        // roles/upgrader.js's isExcessUpgrader(), so an already-spawned
        // creep doesn't get benched mid-decay before it ever gets a turn.
        upgrader =
            ctrl.ticksToDowngrade <
            CONTROLLER_DOWNGRADE[8] * config.get("upgrader.rcl8UpkeepRatio", 0.5)
                ? 1
                : 0;
    } else if (storageEnergy > 400000) {
        upgrader = 4;
    } else if (storageEnergy > 150000) {
        upgrader = 2;
    } else {
        upgrader = 1;
    }

    // --- builder: demand from the construction/repair backlog, capped by the
    //     energy actually available to pick up (no point spawning builders that
    //     will just sit idle while the room is dry) ---
    const backlog = _.sum(sites, (s) => s.progressTotal - s.progress);
    const pickable = pickableEnergy(room);

    let byBacklog;
    if (backlog > 20000) byBacklog = 4;
    else if (backlog > 5000) byBacklog = 3;
    else if (sites.length) byBacklog = 2;
    else byBacklog = 1; // keep one around for repairs

    let byEnergy;
    if (pickable > 50000) byEnergy = 4;
    else if (pickable > 8000) byEnergy = 3;
    else if (pickable > 1500) byEnergy = 2;
    else if (pickable > 200) byEnergy = 1;
    else byEnergy = 0;

    let builder = Math.min(byBacklog, byEnergy, 1);
    if (rcl < 2) builder = Math.min(builder, 1);

    // --- defender: solo fallback, or a striker+medic pair per unit of
    //     threat once the room can actually afford a real pair (ROADMAP
    //     0032 D2) - below that energy, the solo body is still the only
    //     affordable option, so nothing changes for a young/poor room.
    const defenderUnits =
        hostiles > 0
            ? Math.min(config.get("defender.maxCount", 3), hostiles + 1)
            : 0;
    const usePairs =
        room.energyCapacityAvailable >= config.get("defender.pairEnergyThreshold", 500);
    const defender = usePairs ? 0 : defenderUnits;
    const defenderStriker = usePairs ? defenderUnits : 0;
    const defenderMedic = usePairs ? defenderUnits : 0;

    // --- scout: an observer takes over exploration once one exists
    //     (rooms/needs.js + structures/observer.js, ROADMAP 0028) - a scout
    //     then only spawns for an on-demand task an observer can't fully
    //     cover: signing always needs a physical creep, a layout preview
    //     only needs one for a room outside every observer's range.
    //     `scout.spawn` caps it at one empire-wide either way.
    const signPending = Object.keys(Memory.signQueue || {}).length > 0;
    const layoutNeedsScout = Object.keys(Memory.layoutRequests || {}).some(
        (rn) => !observer.observerFor(rn)
    );
    const onDemandPending = signPending || layoutNeedsScout;
    const wantsExploringScout = !observer.hasAnyObserver();
    const scout =
        !hostiles &&
        ((wantsExploringScout && rcl >= 3) || (rcl >= 2 && onDemandPending))
            ? 1
            : 0;

    // --- remote mining (ROADMAP 0020) ---
    // reserver: one per remote whose reservation needs (re)establishing, plus
    // one more if a claimController mission is pending and assigned here -
    // a room under attack sends no reservers, home comes first.
    const pendingReserve = mem.defenseActive
        ? 0
        : remotes.pendingReserves(room).length;

    // A claimer that dies before reaching/claiming the controller (combat,
    // most likely - travel time and reachability are already validated by
    // claimRoom() itself, ROADMAP 0033/0034) would otherwise respawn
    // forever: nothing else ever clears Memory.claimTarget for that case
    // (only success or "no controller here" do, both from inside the
    // creep's own run() while it's still alive). reserver.js marks
    // `creepSeen` once a claim-mission creep has actually run at least one
    // tick; if that flag is set but no such creep exists anymore, the
    // previous one died mid-mission - give up and say why instead of
    // quietly respawning another one every time.
    let claimPending = 0;
    if (!mem.defenseActive && Memory.claimTarget && Memory.claimTarget.from === name) {
        const hasLiveClaimer = census
            .all("reserver")
            .some((c) => c.memory.mission === "claim");
        if (hasLiveClaimer) {
            claimPending = 0;
        } else if (Memory.claimTarget.creepSeen) {
                claimDiagnostics.abandon(Memory.claimTarget);
            console.log(
                `[remotes] claim on ${Memory.claimTarget.room} abandoned - the ` +
                    `claimer disappeared before reaching/claiming the controller (from ${name}); cause unconfirmed`
            );
            delete Memory.claimTarget;
        } else {
            claimPending = 1;
        }
    }
    // A pending contest (ROADMAP 0046) wants a reserver spawned whenever no
    // live contester exists - unlike claimPending above, dying mid-siege is
    // the expected outcome of a long attackController() grind, not a dead
    // end, so there's no creepSeen/abandon check here: just keep respawning
    // while Memory.contestTarget is still set (the player cancels with
    // cancelContest() when they're done, reserver.js itself clears it on
    // success/unrecoverable error).
    let contestPending = 0;
    if (!mem.defenseActive && Memory.contestTarget && Memory.contestTarget.from === name) {
        const hasLiveContester = census
            .all("reserver")
            .some((c) => c.memory.mission === "contest");
        if (!hasLiveContester) contestPending = 1;
    }

    const reserver = pendingReserve + claimPending + contestPending;

    // raider (ROADMAP 0032 O2/O4): 1 while Memory.raidTarget is assigned to
    // this room and no live raider is already out there. Unlike the claim
    // mission (ROADMAP 0035), a raider that dies mid-raid does NOT need a
    // creepSeen-style abandon check - rooms/raiding.js's raidRoom()/
    // findWeakTarget() simply get asked again (console, or next autoRaid
    // scan) rather than a single Memory-tracked mission retrying forever.
    const raiderPending =
        !mem.defenseActive &&
        Memory.raidTarget &&
        Memory.raidTarget.from === name &&
        !census.all("raider").length
            ? 1
            : 0;

    // pioneer (ROADMAP 0037): this room sends pioneers to every owned,
    // spawnless, hostile-free sister room whose nearest rescuer (with a
    // spawn of its own) is this one - see rooms/pioneering.js. Zeroed under
    // attack, same caution as reserver/raider above - home defense first.
    const pioneer = mem.defenseActive ? 0 : pioneering.pioneersWanted(room);

    // remoteMiner/remoteHauler only count remotes that are ACTUALLY reserved
    // and safe right now (remotes.active) - not merely listed as candidates.
    const activeRemotes = remotes.active(room);
    const remoteMiner = _.sum(
        activeRemotes,
        (rn) => (Memory.rooms[rn] && Memory.rooms[rn].sourceNumber) || 0
    );
    // baseline: 1 hauler per active remote (throughput tuning is a later
    // refinement - out of scope for the first cut)
    const remoteHauler = activeRemotes.length;

    // Converted upgraders are already serving the room as builders. Count
    // them here, but apply the deduction after autoscale/clamps below so the
    // final desired upgrader population is reduced without persisting a
    // stale counter.
    const convertedUpgraders = census
        .creepsByRole(name, "builder")
        .filter((creep) => creep.memory.convertedFrom === "upgrader")
        .length;

    const wanted = {
        miner: sources,
        hauler,
        bootstrap,
        upgrader,
        builder,
        defender,
        defenderStriker,
        defenderMedic,
        scout,
        reserver,
        remoteMiner,
        remoteHauler,
        raider: raiderPending,
        pioneer,
    };
    autoscale.apply(room, wanted);

    // Apply manual controls before the hard RCL8 ceiling, so an old override
    // (or a stale autoscale delta from before the room hit RCL8) cannot
    // recreate more than the single upkeep slot above. This is an immediate
    // ceiling, not the exact 0-or-1 the formula above already computed - a
    // large stale delta can still show 1 for a while even when the timer is
    // fully topped off (base 0 + delta), same as any other role's autoscale
    // delta; shrink() (upgraderSurplusEligible is always false at RCL8, see
    // its own comment) drains it back down by 1 per cooldown window like
    // usual, this clamp just guarantees it can never show more than 1 in
    // the meantime.
    applyOverride(name, wanted);
    if (rcl >= 8) wanted.upgrader = Math.min(wanted.upgrader, 1);

    // Apply the conversion deduction after autoscale/clamps so it affects the
    // final desired upgrader population without persisting a stale counter.
    wanted.upgrader = Math.max(0, wanted.upgrader - convertedUpgraders);

    return wanted;
}

// The headcount a room wants moves slowly (RCL, structures, stock levels), but compute()
// costs ~0.3 CPU per room and was redone every tick (profile 2026-10-02: ~1 CPU/tick for
// 3 rooms). The result is kept needs.cacheTicks ticks (0/1 = every tick, as before). A
// room under attack is never served from the cache: defenders must follow the threat.
function roomNeeds(room) {
    if (builtTick !== Game.time) {
        builtTick = Game.time;
        cache = {};
    }
    if (cache[room.name]) return cache[room.name];
    const ttl = Number(config.get("needs.cacheTicks", 5)) || 1;
    const mem = Memory.rooms && Memory.rooms[room.name];
    const hit = heapNeeds[room.name];
    if (hit && ttl > 1 && Game.time >= hit.tick && Game.time - hit.tick < ttl && !(mem && mem.defenseActive)) {
        return (cache[room.name] = hit.value);
    }
    const value = cpuMeter.span("needs.compute", () => compute(room));
    heapNeeds[room.name] = { tick: Game.time, value };
    return (cache[room.name] = value);
}
const heapNeeds = {};
// Console overrides take effect at once, not after the cache window.
function invalidate(roomName) {
    delete heapNeeds[roomName];
    delete cache[roomName];
}

module.exports = { roomNeeds, pressuredOutputHaulerFloor, invalidate };
