const { scaledBody } = require("../utils/population");
const { receivingLink } = require("../utils/energy");
const { planEntriesAt } = require("../utils/plan");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const { takeCover } = require("../utils/combat");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const config = require("../utils/config");
const resourceTiers = require("../utils/resourceTiers");
const nonEnergyLogistics = require("../utils/nonEnergyLogistics");
const names = require("../utils/names");
const terminalOps = require("../utils/terminalOps");

// Per-tick, per-room cache for the filtered structure lists below - every
// hauler in a room was independently re-running the same filter over
// roomCache.myStructures()/structuresByType() every tick (same duplication
// utils/roomCache.js and utils/census.js already collapsed for raw find()
// calls, just one layer up: on the derived lists built on top of them).
let derivedTick = -1;
let derivedCache = {};
function derived(room) {
    if (derivedTick !== Game.time) {
        derivedTick = Game.time;
        derivedCache = {};
    }
    return derivedCache[room.name] || (derivedCache[room.name] = {});
}

// Containers sitting next to an energy source - the piles a hauler drains.
function sourceContainers(room) {
    const d = derived(room);
    if (!d.sourceContainers) {
        d.sourceContainers = _.filter(
            roomCache.structuresByType(room, STRUCTURE_CONTAINER),
            (c) => c.pos.findInRange(FIND_SOURCES, 1).length > 0
        );
    }
    return d.sourceContainers;
}

// ROADMAP 0065 follow-up: any source container built up past this bar is a
// throughput ("vazão") symptom, not just an underused container - the miner
// is spilling overflow it couldn't unload into its collector link. A
// separate config key from hauler.minContainerLoad on purpose even though
// both default to 1000 today - they mean different things (this is "the
// pipeline is jammed", that one is "worth a hauler's trip") and tuning one
// shouldn't silently move the other.
function containersBackedUp(room) {
    const threshold = config.get("hauler.containerBackedUpThreshold", 1000);
    return sourceContainers(room).some(
        (c) => c.store[RESOURCE_ENERGY] >= threshold
    );
}

// ROADMAP 0054: the tower's critical delivery threshold, as a fraction of
// its own capacity - shifts up under defenseActive (a tower nearly full
// going into a fight is worth more than the same energy idle in storage).
function towerCriticalRatio(room) {
    const roomMem = Memory.rooms[room.name] || {};
    return roomMem.defenseActive
        ? config.get("tower.criticalRatioUnderAttack", 0.8)
        : config.get("tower.criticalRatio", 0.5);
}

// Below criticalRatio: the room's real emergency tier, resolved with
// whatever energy is available - never gated by the reserve (mirrors
// essentialConsumer's spawn/extension case, same urgency).
function isTowerCritical(s, room) {
    return (
        s.structureType === STRUCTURE_TOWER &&
        !isSourceDefenseTower(s) &&
        s.store[RESOURCE_ENERGY] <
            s.store.getCapacity(RESOURCE_ENERGY) * towerCriticalRatio(room)
    );
}

// ROADMAP 0072 same-day follow-up (user: "vamos matar essa zona morta do
// hauler"): any NON-critical tower with more than hauler.toppingOffThreshold
// free capacity is a valid optional-tier delivery target - full stop, no
// second floor in between. There used to be a separate satisfactoryRatio
// bar here (originally 0.8, later 0.7 - ROADMAP 0054/0072): a tower between
// criticalRatio and that bar matched NEITHER isTowerCritical above nor this
// function, "not urgent, not worth topping" - a real, admitted dead zone,
// with the only way out being pickDeliver's very last resort (fires only
// once literally nothing else in the room wants the energy at all). That
// gap never had to exist: everywhere else in this cascade, "not essential"
// already means "optional, gated by resourceTiers.aboveReserve" (see
// optionalConsumer below) - a non-critical tower deserves the exact same
// treatment as a lab or a controller-container, not a third, stricter
// bar of its own. Now it gets it: isTowerCritical and this function
// partition every tower into exactly two states, essential or optional,
// with nothing in between.
function towerDeliverable(s, room) {
    return (
        s.structureType === STRUCTURE_TOWER &&
        !isSourceDefenseTower(s) &&
        !isTowerCritical(s, room) &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) >
            s.store.getCapacity(RESOURCE_ENERGY) *
                config.get("hauler.toppingOffThreshold", 0.05)
    );
}

// Spawn / extension / a CRITICAL tower missing energy - keeping the room
// able to spawn and defend itself always outranks the storage reserve.
// This is the original (pre-floor) rule, deliberately kept unconditional: a
// young room's storage often never even reaches a modest floor, and gating
// the room's own creep production on that would starve it over a buffer
// nobody asked to protect that hard (ROADMAP 0043 follow-up - the floor
// below blocked this use case by accident when it was introduced). A
// non-critical tower is NOT essential (ROADMAP 0054) - see toppableTower
// below for that case.
function spawnExtNeedingEnergy(room) {
    const d = derived(room);
    if (!d.spawnExt) {
        d.spawnExt = _.filter(
            roomCache.myStructures(room),
            (s) =>
                (s.structureType === STRUCTURE_SPAWN ||
                    s.structureType === STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
    }
    return d.spawnExt;
}

function criticalTowers(room) {
    const d = derived(room);
    if (!d.criticalTowers) {
        d.criticalTowers = _.filter(roomCache.myStructures(room), (s) =>
            isTowerCritical(s, room)
        );
    }
    return d.criticalTowers;
}

function essentialConsumer(creep) {
    return creep.pos.findClosestByRange(
        spawnExtNeedingEnergy(creep.room).concat(criticalTowers(creep.room))
    );
}

// Lab / factory / power spawn / controller container - genuinely optional,
// so unlike essentialConsumer above these DO respect the room's reserve
// (resourceTiers.aboveReserve, checked by the caller) before pulling.
// Factory/power spawn added alongside lab (ROADMAP 0051) - same reasoning,
// pure RESOURCE_ENERGY need, no different from a lab's. Non-energy
// resources for these three (mineral reagents/components, Power) are a
// separate concern - see pickMineralJob() below, never mixed into this
// energy-only cascade.
function labFactoryPowerSpawnNeedingEnergy(room) {
    const d = derived(room);
    if (!d.labs) {
        d.labs = _.filter(
            roomCache.myStructures(room),
            (s) =>
                (s.structureType === STRUCTURE_LAB ||
                    s.structureType === STRUCTURE_FACTORY ||
                    s.structureType === STRUCTURE_POWER_SPAWN) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
    }
    return d.labs;
}

// The controller's position never moves, so this range-3 lookup is the
// same for every hauler in the room - cache it once per tick like the rest.
function controllerContainerCandidates(room) {
    const d = derived(room);
    if (d.controllerContainers === undefined) {
        d.controllerContainers = room.controller
            ? room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
                  filter: (s) =>
                      s.structureType === STRUCTURE_CONTAINER &&
                      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
              })
            : [];
    }
    return d.controllerContainers;
}

function optionalConsumer(creep) {
    const lab = creep.pos.findClosestByRange(
        labFactoryPowerSpawnNeedingEnergy(creep.room)
    );
    if (lab) return lab;

    if (!creep.room.controller) return null;
    return controllerContainerCandidates(creep.room)[0];
}

// A non-critical tower still worth topping off (towerDeliverable) - also
// genuinely optional, gated the same way as optionalConsumer above by the
// caller (resourceTiers.aboveReserve).
function toppableTowers(room) {
    const d = derived(room);
    if (!d.toppableTowers) {
        d.toppableTowers = _.filter(roomCache.myStructures(room), (s) =>
            towerDeliverable(s, room)
        );
    }
    return d.toppableTowers;
}

function toppableTower(creep) {
    return creep.pos.findClosestByRange(toppableTowers(creep.room));
}

// ROADMAP 0074 (user request, refined same-day): a non-critical tower
// (50%-100% energy) is "satisfactory" priority - genuinely optional,
// gated by resourceTiers.aboveReserve same as everything else here - but
// STILL outranks lab/factory/power spawn/controller container within that
// tier: defense readiness beats a lab/factory errand or a controller
// upgrade buffer even when neither is essential yet. Any non-critical
// tower needing energy wins outright; optionalConsumer is only consulted
// once no tower does. (An earlier version of this function compared the
// two by distance instead - user corrected that same-day: towers are
// priority, not just equal footing.)
function satisfactoryConsumer(creep) {
    return toppableTower(creep) || optionalConsumer(creep);
}

// Energy that arrived in the terminal since we last looked, backed by a
// recorded incoming transaction (Game.market.incomingTransactions - covers
// BOTH an incoming Terminal.send from a sister room and a market order
// settling in our favor). That's the signal for "the player didn't just
// drag this into the terminal by hand" - a manual deposit through the game
// UI leaves no transaction record, only a raw store increase. Only counts
// transactions newer than the ledger's own bookkeeping (`sinceTick`) so the
// same transaction is never counted twice across ticks - `incomingTransactions`
// is a rolling log of the last 100, not a queue that drains as it's read.
function incomingSince(room, sinceTick) {
    const log = (Game.market && Game.market.incomingTransactions) || [];
    let sum = 0;
    for (const t of log) {
        if (
            t.to === room.name &&
            t.resourceType === RESOURCE_ENERGY &&
            t.time > sinceTick &&
            t.time <= Game.time
        ) {
            sum += t.amount;
        }
    }
    return sum;
}

// Terminal energy the hauler is free to withdraw. Anything ALREADY there the
// first time we ever look is fair game immediately - there's no history to
// tell whether it was placed by hand or arrived some other way, and
// defaulting to "protected forever" left it permanently stuck the moment
// this shipped into a room whose terminal already had a balance (ROADMAP
// 0043 follow-up - a real deployment hit exactly this: energy sitting in
// the terminal from before this code existed never became available, no
// matter how long the room ran). From that baseline on, only an INCREASE
// backed by a matching incoming transaction (Game.market.incomingTransactions
// - covers both an incoming Terminal.send from a sister room and a market
// order settling in our favor) gets credited - the signal for "the player
// didn't just drag this into the terminal by hand" (a manual deposit leaves
// no transaction record, only a raw store increase). A decrease (this
// hauler's own withdrawal, a Terminal.send out, a market sell) shrinks the
// credited balance in lockstep - it never claims more than what's
// physically there. Computed once per tick **per room** (matches
// utils/roomCache.js's own per-tick, per-room memoization) since every
// hauler in the same room shares the same terminal and ledger.
// console: resetTerminalLedger(roomName) re-baselines a stuck ledger (e.g.
// one saved by an older build that protected the initial balance) - drops
// the Memory entry so the very next look treats the current amount as the
// fresh, fully-withdrawable baseline again.
global.resetTerminalLedger = function (roomName) {
    if (Memory.rooms[roomName]) delete Memory.rooms[roomName].terminalLedger;
    console.log("[hauler] terminal ledger reset for " + roomName);
};

let terminalLedgerTick = -1;
let terminalLedgerSeen = {};
function terminalWithdrawable(room) {
    const terminal = room.terminal;
    if (!terminal) return 0;

    if (terminalLedgerTick !== Game.time) {
        terminalLedgerTick = Game.time;
        terminalLedgerSeen = {};
    }

    if (!terminalLedgerSeen[room.name]) {
        terminalLedgerSeen[room.name] = true;
        const mem = Memory.rooms[room.name] || (Memory.rooms[room.name] = {});
        const current = terminal.store[RESOURCE_ENERGY] || 0;
        const ledger = mem.terminalLedger;
        let withdrawable;
        if (!ledger) {
            // first time we've ever looked - no history to judge it by, so
            // the existing balance is the baseline AND immediately withdrawable
            withdrawable = current;
        } else {
            const delta = current - ledger.amount;
            if (delta > 0) {
                // only the slice a real incoming transaction explains is
                // ever credited - the rest of the increase (if any) was
                // placed there by hand and stays off-limits
                withdrawable =
                    ledger.withdrawable +
                    Math.min(delta, incomingSince(room, ledger.sinceTick));
            } else {
                withdrawable = ledger.withdrawable + delta;
            }
        }
        mem.terminalLedger = {
            amount: current,
            withdrawable: Math.max(0, Math.min(withdrawable, current)),
            sinceTick: Game.time,
        };
    }

    // The ledger above tracks what's withdrawable IN THEORY (its own
    // bookkeeping, ROADMAP 0043); this floor controls how much of that can
    // actually be drawn out right now, on top - never enough to leave the
    // terminal below logistics.terminalReserveRatio of its own capacity
    // (ROADMAP 0054). Applied at read time, not baked into the persisted
    // ledger value, so the ledger's own history stays accurate regardless
    // of what the floor happens to be at any given moment.
    const ledgerWithdrawable = Memory.rooms[room.name].terminalLedger.withdrawable;
    const capacity = terminal.store.getCapacity(RESOURCE_ENERGY);
    if (!capacity) return ledgerWithdrawable;
    const floor = capacity * config.get("logistics.terminalReserveRatio", 0.1);
    const current = terminal.store[RESOURCE_ENERGY] || 0;
    return Math.max(0, Math.min(ledgerWithdrawable, current - floor));
}

// Dropped energy decays roughly 1/1000 of its amount per tick - a pile that
// looks worth the trip right now may not be by the time a hauler across the
// room actually gets there. Range is a cheap ETA proxy (ignores terrain,
// same tradeoff pioneer.js's own local-mining estimate makes) - running
// PathFinder per candidate pile just to compare two guesses isn't worth the
// CPU.
function estimatedDropAmount(creep, resource) {
    const eta = creep.pos.getRangeTo(resource);
    const perTick = Math.ceil(
        resource.amount / config.get("hauler.dropDecayDivisor", 1000)
    );
    return Math.max(0, resource.amount - perTick * eta);
}

// Where to pick energy up, closest-by-path within each tier: the terminal
// first (only the withdrawable slice of it, see terminalWithdrawable above -
// tagged `dest: "storage"` so the delivery side routes it straight to
// storage instead of the normal spawn/tower/lab cascade, constitution §5:
// terminal energy is for the market/inter-room side of the economy, not
// this room's regular consumers) - then dropped energy worth more than
// hauler.minDropLoad (100) BY THE TIME IT'D ARRIVE (decay-aware, see
// estimatedDropAmount) - then tombstones/ruins (one-shot piles same as
// drops, just not decaying per-tick) - then the base link (it bottlenecks
// the whole link network) - then storage: unconditionally when spawn/ext/
// a critical tower need it (essentialConsumer - keeping the room able to
// spawn and defend itself always outranks the reserve), or, once above the
// reserve (resourceTiers.aboveReserve, ROADMAP 0054), when any optional
// consumer needs it - a non-critical tower first, then a lab/factory/power
// spawn/controller container (satisfactoryConsumer, ROADMAP 0074 - both
// genuinely optional, but a tower still outranks the rest within that
// tier) - never storage -> storage either way - then the
// closest source container built up past hauler.minContainerLoad (not the
// fullest one - a far container isn't worth the trip when a closer one
// already qualifies).
function pickLoad(creep) {
    if (creep.room.terminal) {
        const minTerminal = config.get("hauler.minTerminalLoad", 100);
        const withdrawable = terminalWithdrawable(creep.room);
        if (
            withdrawable >= minTerminal &&
            reservations.available(creep, creep.room.terminal) >= 50
        ) {
            return {
                id: creep.room.terminal.id,
                act: "withdraw",
                amount: Math.min(
                    withdrawable,
                    creep.store.getFreeCapacity(RESOURCE_ENERGY)
                ),
                dest: "storage",
            };
        }
    }

    // ROADMAP 0065 follow-up: a source container backed up past
    // hauler.containerBackedUpThreshold (1000, same number as
    // minContainerLoad's own "worth a trip" bar, but a separate config key -
    // this one means something different, a throughput ("vazão") symptom,
    // not a pickup-worthiness bar) means the miner can't unload into its
    // collector link fast enough and is spilling the overflow into the
    // container instead - which in turn means the collector link itself is
    // full and can't send, almost always because nothing has been draining
    // the RECEIVING link on the other end. Pull straight from that receiving
    // link and force the delivery to storage (`dest: "storage"`, same
    // mechanism the terminal load above uses) - not to spawn/ext even if
    // they're hungry (essentialConsumer's own concern, checked next) -
    // because feeding spawn instead would leave the jam in place and this
    // same container backed-up check would just fire again next load,
    // spilling more energy at the source in the meantime. Checked before
    // essentialConsumer on purpose (user's call): unclogging the room's own
    // energy pipeline outranks a single delivery cycle to spawn/ext.
    if (containersBackedUp(creep.room)) {
        const backedUpLink = creep.pos.findClosestByRange(
            nonCollectorLinksWithEnergy(creep.room).filter(
                (s) => reservations.available(creep, s) >= 50
            )
        );
        if (backedUpLink) {
            return { id: backedUpLink.id, act: "withdraw", dest: "storage" };
        }
    }

    // ROADMAP 0065: spawn/extension/a critical tower going hungry outranks
    // opportunistic ground energy - go straight for the reliable, usually
    // close-to-base sources (receiving link, then storage) instead of
    // chasing whatever dropped pile happens to be closest-by-path, which can
    // sit clear across the room and stall the room's own spawning while the
    // hauler treks out to it. Unconditional, same as essentialConsumer's use
    // below - keeping the room able to spawn/defend always outranks the
    // reserve. Only fires while essential need exists; once it doesn't, the
    // cascade below (which still tries link/storage, just later) is
    // unchanged - dropped/tombstone/ruin energy decaying away is worth
    // grabbing first when nothing is actually urgent.
    if (essentialConsumer(creep)) {
        const urgentLink = creep.pos.findClosestByRange(
            nonCollectorLinksWithEnergy(creep.room).filter(
                (s) => reservations.available(creep, s) >= 50
            )
        );
        if (urgentLink) return { id: urgentLink.id, act: "withdraw" };

        if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
            return { id: creep.room.storage.id, act: "withdraw" };
        }
    }

    const minDrop = config.get("hauler.minDropLoad", 100);
    const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (r) =>
            r.resourceType === RESOURCE_ENERGY &&
            estimatedDropAmount(creep, r) > minDrop &&
            reservations.available(creep, r) >= 50,
    });
    if (dropped) return { id: dropped.id, act: "pickup" };

    const tomb = creep.pos.findClosestByPath(FIND_TOMBSTONES, {
        filter: (t) =>
            t.store[RESOURCE_ENERGY] > minDrop &&
            reservations.available(creep, t) >= 50,
    });
    if (tomb) return { id: tomb.id, act: "withdraw" };

    const ruin = creep.pos.findClosestByPath(FIND_RUINS, {
        filter: (r) =>
            r.store[RESOURCE_ENERGY] > minDrop &&
            reservations.available(creep, r) >= 50,
    });
    if (ruin) return { id: ruin.id, act: "withdraw" };

    const link = creep.pos.findClosestByRange(
        nonCollectorLinksWithEnergy(creep.room).filter(
            (s) => reservations.available(creep, s) >= 50
        )
    );
    if (link) return { id: link.id, act: "withdraw" };

    if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
        if (
            essentialConsumer(creep) ||
            (resourceTiers.aboveReserve(creep.room) &&
                satisfactoryConsumer(creep))
        ) {
            return { id: creep.room.storage.id, act: "withdraw" };
        }
    }

    // closest usable source container, not the one holding the most energy -
    // trekking across the room for a fuller container when a closer one has
    // plenty to give is exactly the kind of wasteful trip this should avoid.
    // Only worth a trip once it's built up hauler.minContainerLoad - a
    // near-empty container is better left to fill up more before someone
    // comes for it.
    const minLoad = config.get("hauler.minContainerLoad", 1000);
    const container = creep.pos.findClosestByPath(sourceContainers(creep.room), {
        filter: (c) =>
            c.store[RESOURCE_ENERGY] > minLoad &&
            reservations.available(creep, c) >= 50,
    });
    if (container) {
        return { id: container.id, act: "withdraw" };
    }

    return null;
}

// Where to drop it off: a critical tower first (defense), then spawn/ext,
// then storage if it's below its own reserve (an empty emergency buffer
// outranks topping anything off further), then the optional-tier
// consumers - a non-critical tower first, then a lab/factory/power spawn
// or the controller's upkeep container (satisfactoryConsumer, ROADMAP
// 0074) - then storage (general, whatever's left). Source-defense towers
// (tagged
// `sourceDefense` in the plan - the one right next to a source's container)
// are never a hauler target, in either branch: the miner sitting right
// there already keeps it fed (miner.js distribute()), and a hauler
// detouring all the way out to a source cluster just to top off a tower the
// miner already handles is a wasted trip.
function nonCollectorLinksWithEnergy(room) {
    const d = derived(room);
    if (!d.links) {
        d.links = _.filter(
            roomCache.myStructures(room),
            (s) =>
                s.structureType === STRUCTURE_LINK &&
                typeof s.isCollector === "function" &&
                !s.isCollector() &&
                s.store[RESOURCE_ENERGY] > 0
        );
    }
    return d.links;
}

function isSourceDefenseTower(structure) {
    const entries = planEntriesAt(
        structure.room.name,
        structure.pos.x,
        structure.pos.y
    );
    return !!(
        entries &&
        entries.some(
            (b) => b.structureType === STRUCTURE_TOWER && b.sourceDefense
        )
    );
}

function pickDeliver(creep) {
    // Production continuity comes before optional defense refill: a hungry
    // spawn/extension must win over a tower sitting below its refill ratio.
    let target = creep.pos.findClosestByPath(spawnExtNeedingEnergy(creep.room));
    if (target) return target.id;

    target = creep.pos.findClosestByRange(criticalTowers(creep.room));
    if (target) return target.id;

    // keep a minimum emergency buffer in storage - below the reserve it
    // outranks topping towers/labs beyond their essential needs, since an
    // empty storage means the room has nothing to fall back on
    if (creep.room.storage && !resourceTiers.aboveReserve(creep.room)) {
        return creep.room.storage.id;
    }

    // ROADMAP 0074: a non-critical tower first, then whichever other
    // optional consumer needs it - lab/factory/power spawn, or the
    // controller's upkeep container (satisfactoryConsumer) - only while
    // Optional consumers are paused whenever the room is economically
    // critical, even if the normal storage reserve still exists. A creep
    // already carrying a resource finishes its current delivery; this gate
    // only controls selecting a new optional destination.
    const economy = resourceTiers.getEconomySnapshot(creep.room);
    if (economy.state !== "critical") target = satisfactoryConsumer(creep);
    if (target) return target.id;

    if (
        creep.room.storage &&
        creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    ) {
        return creep.room.storage.id;
    }

    // Last resort - nothing else in the cascade above wants this energy
    // (spawn/ext full, storage at/above its reserve or full, no optional
    // consumer needs it). satisfactoryConsumer above already covers the
    // full non-critical range for a tower (ROADMAP 0072/0073 killed the
    // old satisfactory-band dead zone), so the only towers left uncaught
    // here are ones with LESS than hauler.toppingOffThreshold free
    // capacity - not worth a dedicated trip, but with the hauler already
    // idle and nothing else to do, topping one off anyway beats sitting
    // full nearby.
    target = creep.pos.findClosestByRange(fallbackTowers(creep.room));
    if (target) return target.id;

    return null;
}

function fallbackTowers(room) {
    const d = derived(room);
    if (!d.fallbackTowers) {
        d.fallbackTowers = _.filter(
            roomCache.myStructures(room),
            (s) =>
                s.structureType === STRUCTURE_TOWER &&
                !isSourceDefenseTower(s) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
    }
    return d.fallbackTowers;
}

// Shared delivery decision for a miner's adjacent source tower. The miner
// cannot reach spawn/extensions or storage, so those hauler destinations are
// represented by the collector link; only a tower that the hauler would
// accept may divert the miner's output away from that link.
function shouldMinerFeedTower(room, tower) {
    if (!tower || spawnExtNeedingEnergy(room).length) return false;

    const roomMem = Memory.rooms[room.name] || {};
    const criticalRatio = roomMem.defenseActive
        ? config.get("tower.criticalRatioUnderAttack", 0.8)
        : config.get("tower.criticalRatio", 0.5);
    const capacity = tower.store.getCapacity(RESOURCE_ENERGY);
    const energy = tower.store[RESOURCE_ENERGY] || 0;
    if (energy < capacity * criticalRatio) return true;

    if (
        !resourceTiers.aboveReserve(room) ||
        resourceTiers.getEconomySnapshot(room).state === "critical"
    ) {
        return false;
    }

    return (
        tower.store.getFreeCapacity(RESOURCE_ENERGY) >
        capacity * config.get("hauler.toppingOffThreshold", 0.05)
    );
}

function idleNear(creep) {
    const anchor = creep.room.storage || creep.room.find(FIND_MY_SPAWNS)[0];
    if (anchor && !creep.pos.inRangeTo(anchor, 3)) {
        creep.moveTo(anchor, { range: 3 });
    }
}

// nothing to pick up anywhere: wait next to a receiving link so we're ready
// the moment a collector link sends energy over
function waitForEnergy(creep) {
    const link = receivingLink(creep.room, creep.pos, {
        awayFromController: true,
    });
    if (link) {
        if (!creep.pos.inRangeTo(link, 1)) creep.moveTo(link, { range: 1 });
        return;
    }
    idleNear(creep);
}

// --- ROADMAP 0051: non-energy fallback (mineral/lab/factory/power) -------
// Deliberately the LOWEST priority thing this role ever does - only ever
// picked up from the "load, nothing energy to load, tank empty" branch
// below (never interrupts an energy job in progress), so it can't regress
// the room's actual energy economy. A dedicated hauler-like role for this
// was considered and rejected (constitution §7, prefer the no-op): mineral/
// lab/factory throughput is slow enough (regen/cooldown measured in
// thousands of ticks) that a creep dedicated to it would sit idle almost
// all the time - reusing an already-idle hauler's spare ticks costs
// nothing extra.

function mineralDeliveryTarget(room) {
    if (room.storage && room.storage.store.getFreeCapacity() > 0) {
        return room.storage;
    }
    if (room.terminal && room.terminal.store.getFreeCapacity() > 0) {
        return room.terminal;
    }
    return null;
}

function mineralWithdrawSource(room, resourceType) {
    if (room.storage && (room.storage.store[resourceType] || 0) > 0) {
        return room.storage;
    }
    if (room.terminal && (room.terminal.store[resourceType] || 0) > 0) {
        return room.terminal;
    }
    return null;
}

// Whatever the mineral container is holding - always wins, a full
// container stalls roles/mineralMiner.js from harvesting further.
function mineralContainerJob(room) {
    const mineral = roomCache.minerals(room)[0];
    if (!mineral) return null;
    const container = mineral.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    })[0];
    if (!container) return null;
    const resourceType = Object.keys(container.store).find(
        (k) => container.store[k] > 0
    );
    if (!resourceType) return null;
    const to = mineralDeliveryTarget(room);
    if (!to) return null;
    return { kind: "mineralContainer", resourceType, from: container, to };
}

function activeLabReaction(room) {
    const mem = Memory.rooms[room.name];
    return mem && mem.labReaction;
}

// Drain the output lab so a long-running reaction never stalls against
// LAB_MINERAL_CAPACITY.
function labOutputJob(room) {
    const reaction = activeLabReaction(room);
    if (!reaction) return null;
    const output = Game.getObjectById(reaction.output);
    if (!output || !output.mineralType || !output.store[output.mineralType]) {
        return null;
    }
    const to = mineralDeliveryTarget(room);
    if (!to) return null;
    return {
        kind: "labOutput",
        resourceType: output.mineralType,
        from: output,
        to,
    };
}

// Top up whichever input lab is running low, from storage/terminal.
function labReagentJob(room) {
    const reaction = activeLabReaction(room);
    if (!reaction) return null;
    const buffer = config.get("mineralHauler.labBuffer", 500);
    const pairs = [
        [reaction.a, reaction.input1],
        [reaction.b, reaction.input2],
    ];
    for (const [resourceType, labId] of pairs) {
        const lab = Game.getObjectById(labId);
        if (!lab) continue;
        if ((lab.store[resourceType] || 0) >= buffer) continue;
        const from = mineralWithdrawSource(room, resourceType);
        if (!from) continue;
        return { kind: "labReagent", resourceType, from, to: lab };
    }
    return null;
}

function activeFactoryProduct(room) {
    const mem = Memory.rooms[room.name];
    return mem && mem.factoryProduct;
}

// Drain a finished commodity batch back to storage.
function factoryOutputJob(room) {
    const product = activeFactoryProduct(room);
    if (!product) return null;
    const factory = roomCache.structuresByType(room, STRUCTURE_FACTORY)[0];
    if (!factory || !factory.store[product]) return null;
    const to = mineralDeliveryTarget(room);
    if (!to) return null;
    return { kind: "factoryOutput", resourceType: product, from: factory, to };
}

// Stock a missing (non-energy) ingredient - energy itself is
// optionalConsumer()'s job, above.
function factoryComponentJob(room) {
    const product = activeFactoryProduct(room);
    if (!product) return null;
    const recipe = COMMODITIES[product];
    if (!recipe) return null;
    const factory = roomCache.structuresByType(room, STRUCTURE_FACTORY)[0];
    if (!factory) return null;
    for (const resourceType in recipe.components) {
        if (resourceType === RESOURCE_ENERGY) continue;
        const need = recipe.components[resourceType];
        if ((factory.store[resourceType] || 0) >= need) continue;
        const from = mineralWithdrawSource(room, resourceType);
        if (!from) continue;
        return { kind: "factoryComponent", resourceType, from, to: factory };
    }
    return null;
}

// Power almost never shows up without a power bank raid (out of scope,
// ROADMAP "Later") or a market buy, but nothing here cares where it came
// from - if it's sitting in storage/terminal, feed the power spawn.
function powerFeedJob(room) {
    const powerSpawn = roomCache.structuresByType(room, STRUCTURE_POWER_SPAWN)[0];
    if (!powerSpawn) return null;
    if (powerSpawn.store.getFreeCapacity(RESOURCE_POWER) <= 0) return null;
    const from = mineralWithdrawSource(room, RESOURCE_POWER);
    if (!from) return null;
    return {
        kind: "powerFeed",
        resourceType: RESOURCE_POWER,
        from,
        to: powerSpawn,
    };
}

// Gate for the whole non-energy cascade below: spawns/extensions still
// wanting energy always outrank a mineral/lab/factory errand, so a hauler
// never gets pulled off energy distribution to chase mineral work while the
// room itself is still hungry.
function spawnsAndExtensionsFull(room) {
    return !roomCache.myStructures(room).some(
        (s) =>
            (s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
}

function pickMineralJob(room) {
    return (
        mineralContainerJob(room) ||
        labOutputJob(room) ||
        labReagentJob(room) ||
        factoryOutputJob(room) ||
        factoryComponentJob(room) ||
        powerFeedJob(room) ||
        null
    );
}

function pickPressuredJob(room) {
    const pressured = nonEnergyLogistics.pressuredOutput(room);
    if (!pressured) return null;
    let job = null;
    if (pressured.kind === "mineralContainer") job = mineralContainerJob(room);
    else if (pressured.kind === "labOutput") job = labOutputJob(room);
    else if (pressured.kind === "factoryOutput") job = factoryOutputJob(room);
    return job && job.from.id === pressured.sourceId ? job : null;
}

function clearMineralJob(creep) {
    delete creep.memory.mineralJob;
    nonEnergyLogistics.release(creep);
}

function assignMineralJob(creep, job) {
    if (!job || !nonEnergyLogistics.claim(creep)) return false;
    reservations.release(creep);
    creep.memory.mineralJob = {
        kind: job.kind,
        resourceType: job.resourceType,
        fromId: job.from.id,
        toId: job.to.id,
        loaded: false,
    };
    return true;
}

function canReceive(target, resourceType) {
    return !!(
        target &&
        target.store &&
        target.store.getFreeCapacity(resourceType) > 0
    );
}

function preserveMineralCargo(creep, resourceType) {
    const anchor = creep.room.storage || creep.room.terminal;
    if (!anchor) return;
    if (!creep.pos.inRangeTo(anchor, 1)) {
        creep.moveTo(anchor, { range: 1, reusePath: 10 });
        return;
    }
    if (creep.ticksToLive <= config.get("mineralHauler.deathDropTtl", 10)) {
        if (creep.drop(resourceType) === OK) clearMineralJob(creep);
    }
}

// Picks up (if empty of the job's resource) or delivers (if carrying it) -
// exactly one action per tick, same idiom as the rest of this file. Clears
// memory.mineralJob once delivered, or if the source dried up before this
// creep got there (fail-soft - just means the job is re-picked fresh next
// time this creep goes idle).
function runMineralJob(creep) {
    const job = creep.memory.mineralJob;
    const resourceType = job.resourceType;

    if (creep.store[resourceType] > 0) {
        job.loaded = true;
        let to = Game.getObjectById(job.toId);
        if (!canReceive(to, resourceType)) {
            to = mineralDeliveryTarget(creep.room);
            if (to) job.toId = to.id;
        }
        if (!to) {
            preserveMineralCargo(creep, resourceType);
            return;
        }
        if (creep.transfer(to, resourceType) === ERR_NOT_IN_RANGE) {
            creep.moveTo(to, { range: 1, reusePath: 10 });
        }
        return;
    }

    if (job.loaded) {
        clearMineralJob(creep);
        return;
    }

    const from = Game.getObjectById(job.fromId);
    if (!from || !(from.store && from.store[resourceType] > 0)) {
        clearMineralJob(creep);
        return;
    }
    const status = creep.withdraw(from, resourceType);
    if (status === ERR_NOT_IN_RANGE) {
        creep.moveTo(from, { range: 1, reusePath: 10 });
        return;
    }
    if (status === OK) job.loaded = true;
    else clearMineralJob(creep);
}

function loadEnergy(creep, src) {
    const target = Game.getObjectById(src.id);
    if (!target) return false;
    reservations.claim(creep, src.id);
    if (src.dest) creep.memory.forcedDeliver = src.dest;
    const status =
        src.act === "pickup"
            ? creep.pickup(target)
            : creep.withdraw(target, RESOURCE_ENERGY, src.amount);
    if (status === ERR_NOT_IN_RANGE) creep.moveTo(target, { range: 1 });
    return true;
}

function hasPressureCapacity(room) {
    return census.count(room.name, "hauler", 0) >= 2;
}

var hauler = {
    run(creep) {
        // legacy: fold pre-consolidation harvesters into this role
        if (creep.memory.role === "harvester") creep.memory.role = "hauler";

        if (takeCover(creep)) return;
        if (terminalOps.runHauler(creep)) return;

        // ROADMAP 0051: finish an in-progress non-energy job before
        // touching energy logic again - see the block's own comment above.
        // Exception: if the creep hasn't picked the resource up yet (nothing
        // carried, so nothing to waste by bailing) and a spawn/extension has
        // since gone hungry, drop the errand now rather than spending several
        // more ticks on it while the room can't spawn - the gate on picking a
        // NEW job (spawnsAndExtensionsFull, below) only stops the job from
        // being assigned in the first place, it doesn't get re-checked once
        // one is already in flight.
        if (creep.memory.mineralJob) {
            const job = creep.memory.mineralJob;
            const carryingJobResource = creep.store[job.resourceType] > 0;
            if (carryingJobResource || job.loaded) {
                runMineralJob(creep);
                return;
            }

            if (creep.store.getUsedCapacity() > 0) {
                clearMineralJob(creep);
            } else if (!nonEnergyLogistics.isOwner(creep)) {
                clearMineralJob(creep);
            } else {
                const energySource = pickLoad(creep);
                const pressuredJob = pickPressuredJob(creep.room);
                if (pressuredJob) {
                    assignMineralJob(creep, pressuredJob);
                    if (!energySource || hasPressureCapacity(creep.room)) {
                        runMineralJob(creep);
                        return;
                    }
                }
                if (!energySource) {
                    runMineralJob(creep);
                    return;
                }
                clearMineralJob(creep);
                loadEnergy(creep, energySource);
                return;
            }
        }

        const carrying = creep.store[RESOURCE_ENERGY];
        const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);

        // flip mode only at the extremes so the hauler doesn't dither
        if (creep.memory.job === "deliver" && carrying === 0) {
            creep.memory.job = "load";
            // whatever forced this delivery (e.g. terminal -> storage) is
            // done once the tank is empty again - the next load starts fresh
            delete creep.memory.forcedDeliver;
        } else if (creep.memory.job !== "deliver" && free === 0) {
            creep.memory.job = "deliver";
        } else if (!creep.memory.job) {
            creep.memory.job = carrying > 0 ? "deliver" : "load";
        }

        if (creep.memory.job === "load") {
            const src = pickLoad(creep);
            if (src) {
                const pressuredJob = hasPressureCapacity(creep.room)
                    ? pickPressuredJob(creep.room)
                    : null;
                if (
                    creep.store.getUsedCapacity() === 0 &&
                    pressuredJob &&
                    assignMineralJob(creep, pressuredJob)
                ) {
                    runMineralJob(creep);
                    return;
                }
                loadEnergy(creep, src);
                return;
            }
            reservations.release(creep);
            // nothing to pick up: deliver a partial load, else wait by a
            // link - but try a non-energy job first (ROADMAP 0051), this is
            // the ONLY place memory.mineralJob ever gets set
            if (carrying === 0 && creep.store.getUsedCapacity() === 0) {
                const mineralJob = pickPressuredJob(creep.room) ||
                    pickMineralJob(creep.room);
                if (assignMineralJob(creep, mineralJob)) {
                    runMineralJob(creep);
                    return;
                }
                waitForEnergy(creep);
                return;
            }
            creep.memory.job = "deliver";
        }

        // deliver - a forced route (e.g. terminal -> storage) skips the
        // normal cascade entirely as long as storage exists and has room;
        // otherwise falls back to it rather than getting stuck
        reservations.release(creep);
        let id;
        if (
            creep.memory.forcedDeliver === "storage" &&
            creep.room.storage &&
            creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        ) {
            id = creep.room.storage.id;
        } else {
            id = pickDeliver(creep);
        }
        if (!id) {
            idleNear(creep);
            return;
        }
        const target = Game.getObjectById(id);
        if (!target) return;
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { range: 1 });
        }
    },

    wanted(room) {
        return roomNeeds(room).hauler;
    },

    spawn(room) {
        return census.count(room.name, "hauler", 0) < this.wanted(room);
    },

    spawnData(room) {
        return {
            name: names.generate("hauler"),
            body: scaledBody(room, [CARRY, CARRY, MOVE]),
            memory: { role: "hauler", job: "load" },
        };
    },

    // exposed for the offline smoke test only
    pickMineralJob,
    optionalConsumer,
    spawnsAndExtensionsFull,
    shouldMinerFeedTower,
};

module.exports = hauler;
