const { scaledBody } = require("../utils/population");
const cpuMeter = require("../utils/cpuMeter");
const labReactions = require("../utils/labReactions");
const labReservations = require("../utils/labReservations");
const terminalClaims = require("../utils/terminalClaims");
const boostLogistics = require("../utils/boostLogistics");
const bootstrapStorage = require("../utils/bootstrapStorage");
const { receivingLink } = require("../utils/energy");
const { planEntriesAt } = require("../utils/plan");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const { takeCover, isDangerous, excludeDangerZone } = require("../utils/combat");
const { roomNeeds } = require("../rooms/needs");
const reservations = require("../utils/reservations");
const config = require("../utils/config");
const resourceTiers = require("../utils/resourceTiers");
const nonEnergyLogistics = require("../utils/nonEnergyLogistics");
const transientStock = require("../utils/transientStock");
const names = require("../utils/names");
const terminalOps = require("../utils/terminalOps");
const stockPolicy = require("../utils/resourcePolicy");

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
        d.sourceContainers = excludeDangerZone(
            _.filter(
                roomCache.structuresByType(room, STRUCTURE_CONTAINER),
                (c) => !bootstrapStorage.isBuffer(room, c) &&
                    roomCache.sources(room).some(
                        (src) => Math.abs(src.pos.x - c.pos.x) <= 1 && Math.abs(src.pos.y - c.pos.y) <= 1
                    )
            ),
            room
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
        // everything full (the usual case): skip the per-extension store scan
        d.spawnExt = resourceTiers.spawnsAndExtensionsFull(room) ? [] : excludeDangerZone(
            _.filter(
                roomCache.myStructures(room),
                (s) =>
                    (s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_EXTENSION) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            ),
            room
        );
    }
    return d.spawnExt;
}

function criticalTowers(room) {
    const d = derived(room);
    if (!d.criticalTowers) {
        d.criticalTowers = excludeDangerZone(
            _.filter(roomCache.myStructures(room), (s) =>
                isTowerCritical(s, room)
            ),
            room
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
        d.labs = excludeDangerZone(
            _.filter(
                roomCache.myStructures(room),
                (s) =>
                    (s.structureType === STRUCTURE_LAB && !((labReservations.entry(room.name, s.id) || {}).managedBy && labReservations.blocked(room.name, s.id)) ||
                        s.structureType === STRUCTURE_FACTORY ||
                        s.structureType === STRUCTURE_POWER_SPAWN) &&
                    // ROADMAP 0111: lab/factory are transitory - only what an
                    // active chain consumes, never up to full capacity
                    transientStock.energyNeed(s) > 0
            ),
            room
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
            ? excludeDangerZone(
                  _.filter(
                      roomCache.structuresNear(room, room.controller.pos, STRUCTURE_CONTAINER, 3),
                      (s) => !bootstrapStorage.isBuffer(room, s) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                  ),
                  room
              )
            : [];
    }
    return d.controllerContainers;
}

function optionalConsumer(creep) {
    const lab = creep.pos.findClosestByRange(
        labFactoryPowerSpawnNeedingEnergy(creep.room).filter(
            (s) => reservations.availableDeliver(creep, s) > 0
        )
    );
    if (lab) return lab;

    if (!creep.room.controller) return null;
    return controllerContainerCandidates(creep.room).find(
        (s) => reservations.availableDeliver(creep, s) > 0
    );
}

// A non-critical tower still worth topping off (towerDeliverable) - also
// genuinely optional, gated the same way as optionalConsumer above by the
// caller (resourceTiers.aboveReserve).
function toppableTowers(room) {
    const d = derived(room);
    if (!d.toppableTowers) {
        d.toppableTowers = excludeDangerZone(
            _.filter(roomCache.myStructures(room), (s) =>
                towerDeliverable(s, room)
            ),
            room
        );
    }
    return d.toppableTowers;
}

function toppableTower(creep) {
    return creep.pos.findClosestByRange(
        toppableTowers(creep.room).filter(
            (s) => reservations.availableDeliver(creep, s) > 0
        )
    );
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
function terminalWithdrawable(room, keepFloor, minimum = 0) {
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
    // terminal below the shared committed cargo and dynamic fuel floor
    // (ROADMAP 0054/0124). Applied at read time, not baked into the persisted
    // ledger value, so the ledger's own history stays accurate regardless
    // of what the floor happens to be at any given moment.
    const ledgerWithdrawable = Memory.rooms[room.name].terminalLedger.withdrawable;
    const current = terminal.store[RESOURCE_ENERGY] || 0;
    // Fuel protection can only reduce this upper bound. Still update the
    // ledger above, even when this selection cannot reach its pickup minimum.
    if (Math.min(ledgerWithdrawable, current) < minimum) return 0;
    const capacity = terminal.store.getCapacity(RESOURCE_ENERGY);
    if (!capacity) return ledgerWithdrawable;
    const floor = keepFloor === undefined ?
        cpuMeter.span("hauler.terminalFuel", () => require("../utils/terminalFuel").keep(room)) : keepFloor;
    return Math.max(0, Math.min(ledgerWithdrawable, current - floor));
}

// Dropped energy decays roughly 1/1000 of its amount per tick - a pile that
// looks worth the trip right now may not be by the time a hauler across the
// room actually gets there. Range is a cheap ETA proxy (ignores terrain,
// same tradeoff pioneer.js's own local-mining estimate makes) - running
// PathFinder per candidate pile just to compare two guesses isn't worth the
// CPU.
// The largest uncovered energy pile in the room (0 if none), once per tick. A pile only
// qualifies for a pickup when its ESTIMATED amount (decayed over the trip) beats a threshold, and
// that never exceeds its real amount - so when no pile is bigger than the threshold the
// findClosestByPath over the room's drops (a Room.find + a filter call per drop + a path
// search, per hauler, twice per pickLoad) cannot find anything and is skipped.
// Shared O(1) tile lookup, rebuilt once per room/tick with the derived cache.
// Use every container, not only source containers or safe-zone containers.
function dropUnderContainer(room, drop) {
    const d = derived(room);
    if (!d.containerTiles) {
        const tiles = new Set();
        const containers = roomCache.structuresByType(room, STRUCTURE_CONTAINER);
        for (let i = 0; i < containers.length; i++) {
            const pos = containers[i].pos;
            tiles.add(pos.y * 50 + pos.x);
        }
        d.containerTiles = tiles;
    }
    return d.containerTiles.has(drop.pos.y * 50 + drop.pos.x);
}

function biggestEnergyDrop(room) {
    const d = derived(room);
    if (d.biggestDrop === undefined) {
        let best = 0;
        const drops = roomCache.droppedResources(room);
        for (let i = 0; i < drops.length; i++) {
            if (drops[i].resourceType === RESOURCE_ENERGY && drops[i].amount > best && !dropUnderContainer(room, drops[i])) best = drops[i].amount;
        }
        d.biggestDrop = best;
    }
    return d.biggestDrop;
}

function estimatedDropAmount(creep, resource) {
    const eta = creep.pos.getRangeTo(resource);
    const perTick = Math.ceil(
        resource.amount / config.get("hauler.dropDecayDivisor", 1000)
    );
    return Math.max(0, resource.amount - perTick * eta);
}

// Where to pick energy up, closest-by-path within each tier. ROADMAP 0107
// (user request) put a decaying, one-shot tier ahead of EVERYTHING else,
// terminal/essentialConsumer included - a dropped pile that's about to
// shrink outranks a routine spawn refill, which can just wait a few more
// ticks without going critical: a dropped energy pile worth more than
// hauler.bigDropLoad (500) BY THE TIME IT'D ARRIVE (decay-aware, see
// estimatedDropAmount) - `tier: "bigDrop"` on the return value, so run()
// knows to short-circuit straight to it, skipping even battlefield loot.
// Tombstone/ruin loot (any resource, energy included) is NOT part of this
// function at all any more - it's a single all-in-one trip handled by
// battlefieldLootJob/runLootJob (checked by run() right after bigDrop,
// before falling through to the rest of the cascade below), since a
// hauler grabbing loot off a body now takes everything sitting there and
// delivers straight to storage, not just the energy slice.
// Below bigDrop: the terminal (only the withdrawable slice of it, see
// terminalWithdrawable above - tagged `dest: "storage"` so the delivery
// side routes it straight to storage instead of the normal spawn/tower/lab
// cascade, constitution §5: terminal energy is for the market/inter-room
// side of the economy, not this room's regular consumers) - then the base
// link (it bottlenecks the whole link network) - then storage:
// unconditionally when spawn/ext/a critical tower need it (essentialConsumer
// - keeping the room able to spawn and defend itself always outranks the
// reserve), or, once above the reserve (resourceTiers.aboveReserve, ROADMAP
// 0054), when any optional consumer needs it - a non-critical tower first,
// then a lab/factory/power spawn/controller container (satisfactoryConsumer,
// ROADMAP 0074 - both genuinely optional, but a tower still outranks the
// rest within that tier) - never storage -> storage either way - a smaller
// dropped energy pile (below bigDropLoad, still worth hauler.minDropLoad)
// - then the closest source container built up past hauler.minContainerLoad
// (not the fullest one - a far container isn't worth the trip when a closer
// one already qualifies).
// A hauler walking to its pick-up point re-ran the whole cascade every tick (3.6 calls/tick
// for 4 haulers, ~0.8 CPU/tick: path searches to the same container over and over). The pick
// is kept per creep (heap) for hauler.repickTicks (5) and re-checked each tick: the target must
// still exist and still hold 50+ energy, and no pile above the big-drop bar may have appeared
// (that tier outranks everything, so it forces a fresh pick the same tick). Picks that carry a
// fixed withdraw amount (the terminal's) are never reused - the number goes stale.
const loadPicks = {};
let loadPicksGc = 0;
function energyHeld(target) {
    return target.store ? target.store[RESOURCE_ENERGY] || 0 : target.amount || 0;
}
function pickLoad(creep) {
    const room = creep.room;
    const last = loadPicks[creep.name];
    if (
        last &&
        last.room === room.name &&
        Game.time >= last.tick &&
        Game.time - last.tick < config.get("hauler.repickTicks", 5) &&
        biggestEnergyDrop(room) <= config.get("hauler.bigDropLoad", 500)
    ) {
        const target = Game.getObjectById(last.src.id);
        if (target && energyHeld(target) >= 50 && (last.src.act !== "pickup" || !dropUnderContainer(room, target))) return last.src;
    }
    const src = cpuMeter.span("hauler.pickLoad", () => pickLoadNow(creep));
    if (src && src.amount === undefined) loadPicks[creep.name] = { tick: Game.time, room: room.name, src };
    else delete loadPicks[creep.name];
    if (Game.time - loadPicksGc >= 300 || Game.time < loadPicksGc) {
        loadPicksGc = Game.time;
        Object.keys(loadPicks).forEach((name) => {
            if (!Game.creeps[name] || Game.time - loadPicks[name].tick > 50) delete loadPicks[name];
        });
    }
    return src;
}

function pickLoadNow(creep) {
    const bigDropMin = config.get("hauler.bigDropLoad", 500);
    const bigDrop = biggestEnergyDrop(creep.room) <= bigDropMin ? null : creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (r) =>
            r.resourceType === RESOURCE_ENERGY &&
            !dropUnderContainer(creep.room, r) &&
            estimatedDropAmount(creep, r) > bigDropMin &&
            reservations.available(creep, r) >= 50 &&
            !isDangerous(r.pos, creep.room),
    });
    if (bigDrop) return { id: bigDrop.id, act: "pickup", tier: "bigDrop" };

    // Tombstone/ruin loot (energy included) is handled entirely by
    // battlefieldLootJob/runLootJob below (ROADMAP 0107, user request: one
    // trip grabs everything a body's holding, straight to storage) - not
    // this energy-only pipeline, so there's no separate tier for it here
    // any more.

    if (creep.room.terminal) {
        const minTerminal = config.get("hauler.minTerminalLoad", 100);
        const withdrawable = terminalWithdrawable(creep.room, undefined, minTerminal);
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

    // A funded recipe gets its own cargo after essential consumers. Preserve
    // the ordinary room floor and all other owners, including same-tick loads.
    const fundedOwner = craftOwner(creep.room, "factory");
    if (fundedOwner && resourceTiers.aboveReserve(creep.room)) {
        const factory = roomCache.structuresByType(creep.room, STRUCTURE_FACTORY)[0];
        const needed = factory && Math.min(transientStock.energyNeed(factory), reservations.availableDeliver(creep, factory)) || 0;
        const source = [creep.room.storage, creep.room.terminal].find((s) => s &&
            stockPolicy.consumerAvailable(creep.room, s, RESOURCE_ENERGY, fundedOwner) > 0);
        if (needed > 0 && source) {
            const q = Math.min(needed, creep.store.getFreeCapacity(RESOURCE_ENERGY),
                stockPolicy.consumerAvailable(creep.room, source, RESOURCE_ENERGY, fundedOwner),
                source === creep.room.storage ? Math.max(0, source.store.energy - resourceTiers.reserveFloor(creep.room)) : Infinity);
            if (q > 0) return { id: source.id, act: "withdraw", amount: q, dest: factory.id, craftOwner: fundedOwner };
        }
    }

    const minDrop = config.get("hauler.minDropLoad", 100);
    const dropped = biggestEnergyDrop(creep.room) <= minDrop ? null : creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (r) =>
            r.resourceType === RESOURCE_ENERGY &&
            !dropUnderContainer(creep.room, r) &&
            estimatedDropAmount(creep, r) > minDrop &&
            reservations.available(creep, r) >= 50 &&
            !isDangerous(r.pos, creep.room),
    });
    if (dropped) return { id: dropped.id, act: "pickup" };

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
        d.links = excludeDangerZone(
            _.filter(
                roomCache.myStructures(room),
                (s) =>
                    s.structureType === STRUCTURE_LINK &&
                    typeof s.isCollector === "function" &&
                    !s.isCollector() &&
                    s.store[RESOURCE_ENERGY] > 0
            ),
            room
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

// ROADMAP 0107 (user request): every candidate list below is filtered
// through reservations.availableDeliver before the closest-by pick, same
// idiom as pickLoad's reservations.available on the pickup side - a
// target another hauler already carries enough to fill (e.g. an
// extension with 50 free capacity and a hauler already en route with
// 50+ energy) drops out so a second hauler doesn't also head there to
// dump into an already-spoken-for slot.
// ROADMAP 0152: a hauler walking to its destination used to re-run the whole delivery cascade
// (a path search among hungry spawns/extensions included) every tick. The pick is now kept
// for up to hauler.deliverRepickTicks (5) while it is still the answer: the target exists and
// still takes energy, and nothing that outranks it appeared. Priority order of the cascade is
// 0 hungry spawn/extension, 1 critical tower, 2 storage below its reserve, 3 optional consumer,
// 4 storage, 5 last-resort tower. Ranks 3 and 5 are never kept (their rules are per-tick).
// A higher class with demand always forces the full cascade. 1 turns it off.
let deliverRank = -1;
const deliverPicks = {}; // creep name -> { id, rank, tick, room } (heap only)
let deliverPicksGc = 0;
function deliverPickValid(creep, last) {
    if (last.room !== creep.room.name || Game.time < last.tick || Game.time - last.tick >= config.get("hauler.deliverRepickTicks", 5)) return false;
    if (last.rank !== 0 && last.rank !== 1 && last.rank !== 2 && last.rank !== 4) return false;
    const target = Game.getObjectById(last.id);
    if (!target || !(reservations.availableDeliver(creep, target) > 0)) return false;
    const hungry = spawnExtNeedingEnergy(creep.room);
    if (last.rank === 0) return hungry.some((x) => x.id === last.id);
    if (hungry.length) return false;
    const critical = criticalTowers(creep.room);
    if (last.rank === 1) return critical.some((x) => x.id === last.id);
    if (critical.length) return false;
    const storage = creep.room.storage;
    if (!storage) return false;
    if (target.id !== storage.id) return false;
    return last.rank === 2 ? !resourceTiers.aboveReserve(creep.room) : resourceTiers.aboveReserve(creep.room);
}
function pickDeliver(creep) {
    if (config.get("hauler.deliverRepickTicks", 5) > 1) {
        const last = deliverPicks[creep.name];
        if (last && deliverPickValid(creep, last)) {
            cpuMeter.record("spans", "hauler.deliverKept", 0); // calls/tick = cascades avoided
            return last.id;
        }
    }
    deliverRank = -1;
    const id = cpuMeter.span("hauler.pickDeliver", () => pickDeliverNow(creep));
    if (id && deliverRank >= 0) {
        deliverPicks[creep.name] = { id, rank: deliverRank, tick: Game.time, room: creep.room.name };
        if (Game.time - deliverPicksGc >= 300 || Game.time < deliverPicksGc) {
            deliverPicksGc = Game.time;
            Object.keys(deliverPicks).forEach((name) => {
                if (!Game.creeps[name] || Game.time - deliverPicks[name].tick > 50) delete deliverPicks[name];
            });
        }
    } else delete deliverPicks[creep.name];
    return id;
}

function pickDeliverNow(creep) {
    // Production continuity comes before optional defense refill: a hungry
    // spawn/extension must win over a tower sitting below its refill ratio.
    const productionTargets = spawnExtNeedingEnergy(creep.room).filter(
        (s) => reservations.availableDeliver(creep, s) > 0
    );
    // A consumer already in transfer range needs no path selection.
    let target = productionTargets.find((s) => creep.pos.isNearTo(s));
    if (!target && productionTargets.length) target = creep.pos.findClosestByPath(productionTargets);
    if (target) { deliverRank = 0; return target.id; }

    target = creep.pos.findClosestByRange(
        criticalTowers(creep.room).filter(
            (s) => reservations.availableDeliver(creep, s) > 0
        )
    );
    if (target) { deliverRank = 1; return target.id; }

    // keep a minimum emergency buffer in storage - below the reserve it
    // outranks topping towers/labs beyond their essential needs, since an
    // empty storage means the room has nothing to fall back on
    if (creep.room.storage && !resourceTiers.aboveReserve(creep.room)) {
        deliverRank = 2;
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
    if (target) { deliverRank = 3; return target.id; }

    if (
        creep.room.storage &&
        creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    ) {
        deliverRank = 4;
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
    target = creep.pos.findClosestByRange(
        fallbackTowers(creep.room).filter(
            (s) => reservations.availableDeliver(creep, s) > 0
        )
    );
    if (target) { deliverRank = 5; return target.id; }

    return null;
}

function fallbackTowers(room) {
    const d = derived(room);
    if (!d.fallbackTowers) {
        d.fallbackTowers = excludeDangerZone(
            _.filter(
                roomCache.myStructures(room),
                (s) =>
                    s.structureType === STRUCTURE_TOWER &&
                    !isSourceDefenseTower(s) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            ),
            room
        );
    }
    return d.fallbackTowers;
}

// Shared delivery decision for a miner's adjacent source tower. The miner
// cannot reach spawn/extensions or storage, so those hauler destinations are
// represented by the collector link; only a tower that the hauler would
// accept may divert the miner's output away from that link.
function shouldMinerFeedTower(room, tower) {
    if (!tower) return false;
    // Several miners ask about the same tower in one tick; the answer depends
    // only on tower/room state, which does not change between their calls.
    if (feedTowerCache.tick !== Game.time) {
        feedTowerCache.tick = Game.time;
        feedTowerCache.byTower = {};
    }
    if (tower.id in feedTowerCache.byTower) return feedTowerCache.byTower[tower.id];
    return (feedTowerCache.byTower[tower.id] = cpuMeter.span("hauler.minerFeedTower", () => computeMinerFeedTower(room, tower)));
}
const feedTowerCache = { tick: -1, byTower: {} };

function computeMinerFeedTower(room, tower) {
    if (spawnExtNeedingEnergy(room).length) return false;

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
    const anchor = creep.room.storage || roomCache.mySpawns(creep.room)[0];
    if (anchor && !creep.pos.inRangeTo(anchor, 3)) {
        creep.moveTo(anchor, { range: 3 });
    }
}

// nothing to pick up anywhere: wait next to a receiving link so we're ready
// the moment a collector link sends energy over
// ROADMAP 0152: an idle hauler (empty, nothing to load, no mineral/chain job) used to repeat
// that whole search every tick - pickLoad + the mineral cascade, ~0,5 CPU per idle hauler-tick.
// It now looks once when it goes idle and then every hauler.idleRecheckTicks (default 5)
// ticks, standing by in between. Never while a spawn/extension is hungry (that errand is
// urgent and keeps its per-tick search), never while carrying anything, and a reset or a room
// change simply forgets the mark (the next tick searches). 1 turns it off.
const idleChecks = {}; // creep name -> { tick, room } of the last empty search (heap only)
let idleChecksGc = 0;
function idleSkip(creep) {
    const every = config.get("hauler.idleRecheckTicks", 5);
    if (!(every > 1)) return false;
    const mark = idleChecks[creep.name];
    if (!mark || mark.room !== creep.room.name || Game.time < mark.tick || Game.time - mark.tick >= every) return false;
    if (creep.store.getUsedCapacity() > 0) return false;
    const d = derived(creep.room);
    if (d.spawnHungry === undefined) d.spawnHungry = !spawnsAndExtensionsFull(creep.room);
    return !d.spawnHungry;
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

function mineralDeliveryTarget(room, resourceType) {
    if (config.get("stockPolicy.enabled", true) && resourceType) return stockPolicy.destination(room, resourceType);
    // ROADMAP 0111: a craft chain's FINAL product goes straight to the terminal
    // (its sale is already planned) - one trip fewer than storage -> terminal.
    const mem = Memory.rooms && Memory.rooms[room.name];
    if (resourceType && mem && mem.directToTerminal === resourceType && room.terminal &&
        room.terminal.store.getFreeCapacity(resourceType) > 0) {
        return room.terminal;
    }
    if (room.storage && room.storage.store.getFreeCapacity() > 0) {
        return room.storage;
    }
    if (room.terminal && room.terminal.store.getFreeCapacity() > 0) {
        return room.terminal;
    }
    return null;
}

function craftOwner(room, kind) {
    const c = Object.values(Memory.craft && Memory.craft.active || {}).find((c) => c.room === room.name && c.state === "working" &&
        (c.queue || []).slice(c.qi || 0).some((i) => i.kind === kind && i.started && !i.finished));
    return c ? "craft:" + (c.ownerId || c.id) : null;
}
function mineralWithdrawSource(room, resourceType, owner) {
    const honorClaims = config.get("stockPolicy.enabled", true) || labReservations.warehouseClaim(room.name, resourceType) > 0;
    const available = (source) => honorClaims ?
        stockPolicy.consumerAvailable(room, source, resourceType, owner) : source.store[resourceType] || 0;
    if (room.storage && available(room.storage) > 0) {
        return room.storage;
    }
    if (room.terminal && available(room.terminal) > 0) {
        return room.terminal;
    }
    return null;
}

// Whatever the mineral container is holding - always wins, a full
// container stalls roles/mineralMiner.js from harvesting further.
function mineralContainerJob(room) {
    const mineral = roomCache.minerals(room)[0];
    if (!mineral) return null;
    const container = roomCache.structuresNear(room, mineral.pos, STRUCTURE_CONTAINER, 1)[0];
    if (!container) return null;
    const resourceType = Object.keys(container.store).find(
        (k) => container.store[k] > 0
    );
    if (!resourceType) return null;
    const to = mineralDeliveryTarget(room, resourceType);
    if (!to) return null;
    return { kind: "mineralContainer", resourceType, from: container, to };
}

// A running reaction's output lab is only worth a trip once it holds a full
// hauler load or mineralHauler.labDrainRatio (80%) of its capacity, whichever is
// smaller (user request, 2026-10-02: the hauler was fetching 5 units at a time).
// Never above the pressure threshold, so a nearly full lab always drains. Whatever
// is left when the reaction ends is drained by transientDrainJob, not by this.
function labDrainFloor(room, lab) {
    return labReactions.drainThreshold(room, lab);
}

// Drain the output lab so a long-running reaction never stalls against
// LAB_MINERAL_CAPACITY.
function labOutputJob(room) {
    // ROADMAP 0111: a wide reaction has several output labs - drain the fullest.
    // ROADMAP 0115: a room may run several reactions at once - the fullest of all.
    let output = null;
    labReactions.list(room.name).forEach((reaction) => {
        // an intermediate that the next reaction phase consumes in place stays in its lab -
        // draining it would just force a round trip
        if (reaction.keep) return;
        labReactions.outputsOf(reaction).forEach((id) => {
            if (labReservations.blocked(room.name, id)) return;
            const candidate = Game.getObjectById(id);
            if (!candidate || !candidate.mineralType || !candidate.store[candidate.mineralType]) return;
            if (candidate.store[candidate.mineralType] < labDrainFloor(room, candidate)) return;
            if (!output || candidate.store[candidate.mineralType] > output.store[output.mineralType]) output = candidate;
        });
    });
    if (!output) return null;
    const to = mineralDeliveryTarget(room, output.mineralType);
    if (!to) return null;
    return {
        kind: "labOutput",
        resourceType: output.mineralType,
        from: output,
        to,
    };
}

// Top up whichever input lab is running low, from storage/terminal.
function labPolicyDrainJob(room) {
    const desired = Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].labPolicyDesired;
    for (const id of Object.keys(desired || {})) {
        if (labReservations.blocked(room.name, id)) continue;
        const lab = Game.getObjectById(id);
        if (!lab || !lab.mineralType || lab.mineralType === desired[id] || !lab.store[lab.mineralType]) continue;
        const to = mineralDeliveryTarget(room, lab.mineralType);
        if (to) return { kind: "transientDrain", resourceType: lab.mineralType, from: lab, to };
    }
    return null;
}
function labReagentJob(room) {
    const buffer = config.get("mineralHauler.labBuffer", 500);
    const sources = new Map();
    // ROADMAP 0115: every running reaction needs its two input labs stocked
    for (const reaction of labReactions.list(room.name)) {
        const pairs = [
            [reaction.a, reaction.input1],
            [reaction.b, reaction.input2],
        ];
        for (const [resourceType, labId] of pairs) {
            if (labReservations.blocked(room.name, labId)) continue;
            const lab = Game.getObjectById(labId);
            if (!lab) continue;
            if (lab.mineralType && lab.mineralType !== resourceType) continue;
            const limits = Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].labPolicyInputs;
            const target = reaction.owner ? limits && limits[labId] && limits[labId][0] === resourceType ? limits[labId][1] : 0 : buffer;
            if (reaction.owner && (!limits || !limits[labId] || limits[labId][2] === false)) continue;
            if ((lab.store[resourceType] || 0) >= target) continue;
            if (feedTaken(room, resourceType, lab.id)) continue;
            if (!sources.has(resourceType)) sources.set(resourceType, mineralWithdrawSource(room, resourceType, craftOwner(room, "lab")));
            const from = sources.get(resourceType);
            if (!from) continue;
            return { kind: "labReagent", resourceType, from, to: lab,
                policy: !!reaction.owner, amount: reaction.owner ? target - (lab.store[resourceType] || 0) : undefined };
        }
    }
    return null;
}

// ROADMAP 0111: with several haulers allowed on non-energy work at once, the
// reagent/component jobs must not be handed to two of them for the same thing -
// one hauler per (resource, destination) at a time; a different reagent (or
// another lab/factory) is a different job and runs in parallel.
function feedTaken(room, resourceType, toId) {
    return census.creepsByRole(room.name, "hauler").some((c) => {
        const j = c.memory.mineralJob;
        return !!(j && j.toId === toId && j.resourceType === resourceType &&
            (j.kind === "labReagent" || j.kind === "factoryComponent"));
    });
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
    const to = mineralDeliveryTarget(room, product);
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
        if (feedTaken(room, resourceType, factory.id)) continue;
        const from = mineralWithdrawSource(room, resourceType, craftOwner(room, "factory"));
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

// ROADMAP 0111: lab/factory are transitory - hand back to storage whatever
// nothing is going to consume (legacy standing energy, finished-reaction
// residue). Lowest priority of the cascade: real work always comes first.
function transientDrainJob(room) {
    for (const s of roomCache.myStructures(room)) {
        if (!transientStock.isTransient(s)) continue;
        const entry = transientStock.excess(s)[0];
        if (entry) {
            const to = mineralDeliveryTarget(room, entry.resourceType);
            if (to) return { kind: "transientDrain", resourceType: entry.resourceType, from: s, to };
        }
    }
    return null;
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

// A dead creep's tombstone (or a destroyed structure's ruin) can hold
// several resource types at once - energy plus whatever compounds a
// boosted invader/hostile carried - and either pile decays away for good
// if nobody grabs it in time. ROADMAP 0107 (user request): a hauler that
// goes for one of these grabs EVERYTHING sitting there in a single trip
// (not a separate pickLoad energy trip plus a separate mineralJob per
// compound) and dumps it all straight into storage, never terminal - so
// this doesn't fit the {kind, resourceType, from, to} single-resource
// shape every other mineral job here uses; see runLootJob below for the
// multi-resource pickup/delivery loop it drives instead. Checked first,
// ahead of the rest of the mineral cascade (pickMineralJob), because,
// unlike a container/lab/factory backlog, a decaying tombstone really can
// vanish for good before a hauler gets around to it.
function battlefieldLootJob(room) {
    const minLoot = config.get("hauler.minLootLoad", 50);
    // ROADMAP 0107 follow-up (user request): this is exactly the scenario
    // that motivated excludeDangerZone - a dead invader's own tombstone
    // sitting right where the fight happened, with a second, still-live
    // invader guarding the spot. Filtered before .find() so a pile still
    // being fought over loses out to the next-best one (or none) instead of
    // sending a hauler straight into it.
    const piles = excludeDangerZone(
        roomCache.tombstones(room).concat(roomCache.ruins(room)),
        room
    );
    const pile = piles.find((p) =>
        Object.keys(p.store).some((k) => p.store[k] > minLoot)
    );
    if (!pile) return null;
    const first = Object.keys(pile.store).find((r) => pile.store[r] > 0);
    const to = config.get("stockPolicy.enabled", true) ? stockPolicy.destination(room, first) : room.storage;
    if (!to || to.store.getFreeCapacity() <= 0) return null;
    return { kind: "battlefieldLoot", from: pile, to };
}

function clearLootJob(creep) {
    delete creep.memory.lootJob;
    nonEnergyLogistics.release(creep);
}

function assignLootJob(creep, job) {
    if (!job || !nonEnergyLogistics.claim(creep)) return false;
    reservations.release(creep);
    creep.memory.lootJob = { fromId: job.from.id, toId: job.to.id };
    return true;
}

// One pickup/delivery action per tick, same idiom as runMineralJob, but
// loops through every resource type present instead of committing to one:
// withdraw whatever's left on the pile while there's still room for it and
// still something to take, then once full (or the pile's drained/gone)
// switch to unloading everything carried into storage, one resource type
// per transfer() call - Screeps only allows a single resource type per
// pickup/withdraw/transfer, so a multi-resource pile takes one call per
// resource type either way, just all in the same trip instead of a
// separate mineralJob per compound.
function runLootJob(creep) {
    const job = creep.memory.lootJob;
    const from = Game.getObjectById(job.fromId);
    const pileHasLoot = from && _.some(from.store, (n) => n > 0);

    if (creep.store.getFreeCapacity() > 0 && pileHasLoot) {
        const resourceType = _.findKey(from.store, (n) => n > 0);
        const status = creep.withdraw(from, resourceType);
        if (status === ERR_NOT_IN_RANGE) creep.moveTo(from, { range: 1 });
        return;
    }

    if (creep.store.getUsedCapacity() === 0) {
        clearLootJob(creep);
        return;
    }

    const resourceType = _.findKey(creep.store, (n) => n > 0);
    const to = config.get("stockPolicy.enabled", true) ? stockPolicy.destination(creep.room, resourceType) : Game.getObjectById(job.toId) || creep.room.storage;
    if (!to || to.store.getFreeCapacity() <= 0) {
        // nowhere to dump it right now - hold near storage and wait rather
        // than lose it, same fail-soft spirit as runMineralJob's
        // preserveMineralCargo (storage-only here, so no terminal anchor)
        if (creep.room.storage && !creep.pos.inRangeTo(creep.room.storage, 1)) {
            creep.moveTo(creep.room.storage, { range: 1, reusePath: 10 });
        }
        return;
    }
    const max = to === creep.room.terminal && config.get("stockPolicy.enabled", true) ? stockPolicy.terminalFree(creep.room) : to.store.getFreeCapacity(resourceType);
    const status = creep.transfer(to, resourceType, Math.min(creep.store[resourceType], max));
    if (status === ERR_NOT_IN_RANGE) creep.moveTo(to, { range: 1 });
}

// battlefieldLootJob is deliberately NOT part of this cascade - its shape
// (multi-resource, no single resourceType) doesn't fit runMineralJob, so
// run() checks it separately via assignLootJob/runLootJob, at the same
// priority spot pickMineralJob() used to give it (first, ahead of every
// job below).
// A mineral/lab/factory/power errand whose source or destination sits in
// the attack zone is worse than useless (same reasoning as
// excludeDangerZone above, which doesn't fit here since each of these
// picks a single fixed structure rather than the closest of a list) -
// rejected once, centrally, since every job-picker below returns the same
// {from, to} shape.
function safeMineralJob(job, room) {
    if (!job) return null;
    if (isDangerous(job.from.pos, room) || isDangerous(job.to.pos, room)) {
        return null;
    }
    return job;
}

// ROADMAP 0111 (bug real, usuario reportou em producao, 2026-10-02): a craft
// chain's input delivery (factoryComponent / labReagent) and product pickup are
// ordinary mineral jobs, so they only ran when nothing else was going on -
// never while there was energy to load (mineral jobs are only assigned when
// pickLoad() finds nothing) and never while the mineral container held ANY
// amount (mineralContainerJob wins the whole cascade). The factory sat with its
// energy and no U for 1500 ticks while the U was in storage. While a chain is
// active in this room its feed/drain jobs come first; outside a chain nothing
// changes.
function chainActive(room) {
    const active = Memory.craft && Memory.craft.active;
    if (!active) return false;
    return Object.keys(active).some((key) => active[key] && (active[key].room || String(key).split(":")[0]) === room.name);
}

// Only a NULL answer is remembered for the rest of the tick (derived(), per room): when
// the first idle hauler finds no job the others - 2-3 a tick - cannot either, and each
// of them re-ran the whole cascade (0.3 CPU/tick, 2026-10-03). A job found is never
// reused: it may exclude what an earlier hauler just took, so each one still asks.
function pickChainFeedJob(room, checked) {
    if (!chainActive(room)) return null;
    const d = derived(room);
    if (d.noChainJob) return null;
    const job = cpuMeter.span("hauler.chainFeed", () => pickChainFeedJobNow(room));
    if (!job) {
        d.noChainJob = true;
        if (checked) for (const picker of [labPolicyDrainJob, labReagentJob, factoryComponentJob,
            factoryOutputJob, labOutputJob, transientDrainJob]) checked.add(picker);
    }
    return job;
}

function pickChainFeedJobNow(room) {
    const job =
        safeMineralJob(labPolicyDrainJob(room), room) ||
        safeMineralJob(labReagentJob(room), room) ||
        safeMineralJob(factoryComponentJob(room), room) ||
        safeMineralJob(factoryOutputJob(room), room) ||
        safeMineralJob(labOutputJob(room), room) ||
        safeMineralJob(transientDrainJob(room), room);
    return job ? Object.assign({}, job, { chain: true }) : null;
}

function pickMineralJob(room) {
    const d = derived(room);
    if (d.noMineralJob) return null;
    const job = cpuMeter.span("hauler.pickMineralJob", () => pickMineralJobNow(room));
    if (!job) d.noMineralJob = true;
    return job;
}

function pickMineralJobNow(room) {
    const checked = new Set();
    const chainJob = pickChainFeedJob(room, checked);
    if (chainJob) return chainJob;
    // Skip only selectors evaluated afresh in this same decision, not an
    // earlier cached absence whose stock or assignments could have changed.
    const pick = (picker) => checked.has(picker) ? null : safeMineralJob(picker(room), room);
    return (
        safeMineralJob(boostLogistics.feedJob(room), room) ||
        safeMineralJob(cpuMeter.span("hauler.stockPolicy", () => stockPolicyJob(room)), room) ||
        pick(mineralContainerJob) ||
        pick(labOutputJob) ||
        pick(labReagentJob) ||
        pick(factoryOutputJob) ||
        pick(factoryComponentJob) ||
        pick(powerFeedJob) ||
        pick(transientDrainJob) ||
        null
    );
}

function stockPolicyJob(room) {
    if (!config.get("stockPolicy.enabled", true) || !room.storage || !room.terminal) return null;
    const fuel = require("../utils/terminalFuel");
    const forecast = cpuMeter.span("hauler.terminalFuel", () => fuel.budget(room));
    const fuelNeed = forecast.keep - stockPolicy.value(room.terminal, RESOURCE_ENERGY) - fuel.transit(room, true);
    if (fuelNeed > 0 && stockPolicy.value(room.storage, RESOURCE_ENERGY) > 0)
        return { kind: "stockPolicy", resourceType: RESOURCE_ENERGY, from: room.storage, to: room.terminal, amount: fuelNeed };
    let roomOps, free;
    const operations = () => roomOps || (roomOps = terminalOps.activeForRoom(room.name));
    for (const r of Object.keys(room.storage.store)) {
        if (!(room.storage.store[r] > 0) || stockPolicy.used(room, r)) continue;
        if (operations().some((op) => op.resourceType === r && op.haulerName)) continue;
        if (free === undefined) free = stockPolicy.terminalFree(room, undefined, forecast.keep);
        if (free > 0)
            return { kind: "stockPolicy", resourceType: r, from: room.storage, to: room.terminal };
    }
    for (const r of Object.keys(stockPolicy.targets(room))) {
        const excess = r === RESOURCE_ENERGY ? Math.max(0, Math.min(fuel.releasable(room, forecast), terminalWithdrawable(room, forecast.keep)) - fuel.transit(room, false)) : stockPolicy.value(room.terminal, r);
        if (excess > 0 && (r === RESOURCE_ENERGY || !operations().some((op) => op.resourceType === r)) && room.storage.store.getFreeCapacity(r) > 0)
            return { kind: "stockPolicy", resourceType: r, from: room.terminal, to: room.storage, amount: excess };
    }
    return null;
}

function pickPressuredJob(room) {
    const pressured = nonEnergyLogistics.pressuredOutput(room);
    if (!pressured) return null;
    let job = null;
    if (pressured.kind === "mineralContainer") job = mineralContainerJob(room);
    else if (pressured.kind === "labOutput") job = labOutputJob(room);
    else if (pressured.kind === "factoryOutput") job = factoryOutputJob(room);
    job = safeMineralJob(job, room);
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
        chain: !!job.chain,
        amount: job.amount,
        policy: !!job.policy,
        boostReservationId: job.boostReservationId,
        boostGeneration: job.boostGeneration,
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
    return cpuMeter.span("hauler.runMineralJob", () => runMineralJobNow(creep));
}

function runMineralJobNow(creep) {
    const job = creep.memory.mineralJob;
    const resourceType = job.resourceType;

    if (creep.store[resourceType] > 0) {
        job.loaded = true;
        let to = Game.getObjectById(job.toId);
        if (bootstrapStorage.isBuffer(creep.room, to) && to !== creep.room.storage) to = creep.room.storage;
        let policyLimit = Infinity;
        if (job.kind === "boostFeed") {
            policyLimit = to && to.structureType === STRUCTURE_LAB ? boostLogistics.deliveryLimit(creep, job, to) : 0;
            if (!(policyLimit > 0)) to = mineralDeliveryTarget(creep.room, resourceType);
        } else if (to && to.structureType === STRUCTURE_LAB && labReservations.blocked(creep.room.name, to.id))
            to = mineralDeliveryTarget(creep.room, resourceType);
        if (job.policy && to && to.structureType === STRUCTURE_LAB) {
            policyLimit = labReactions.deliveryLimit(creep.room.name, to, resourceType);
            if (!(policyLimit > 0)) to = mineralDeliveryTarget(creep.room, resourceType);
        }
        if (config.get("stockPolicy.enabled", true) && to && (to === creep.room.storage || to === creep.room.terminal) && job.kind !== "stockPolicy")
            to = stockPolicy.destination(creep.room, resourceType);
        if (!canReceive(to, resourceType)) {
            to = mineralDeliveryTarget(creep.room, resourceType);
            if (to) job.toId = to.id;
        }
        if (!to) {
            preserveMineralCargo(creep, resourceType);
            return;
        }
        const fuel = require("../utils/terminalFuel");
        // Destination and amount belong to one decision; don't repeat its forecast.
        const terminalEnergyDelivery = job.kind === "stockPolicy" && resourceType === RESOURCE_ENERGY && to === creep.room.terminal;
        const keep = terminalEnergyDelivery ? fuel.keep(creep.room) : undefined;
        if (terminalEnergyDelivery && keep <= stockPolicy.value(to, RESOURCE_ENERGY)) to = creep.room.storage;
        const max = config.get("stockPolicy.enabled", true) && to === creep.room.terminal && job.kind !== "stockPolicy" ? stockPolicy.terminalFree(creep.room) : to.store.getFreeCapacity(resourceType);
        const amount = Math.min(creep.store[resourceType], max,
            terminalEnergyDelivery && to === creep.room.terminal ? Math.max(0, keep - stockPolicy.value(to, RESOURCE_ENERGY)) : Infinity,
            to.structureType === STRUCTURE_LAB ? policyLimit : Infinity);
        const status = creep.transfer(to, resourceType, amount);
        if (status === OK && job.policy && to.structureType === STRUCTURE_LAB) labReactions.recordDelivery(to.id, amount);
        if (status === OK && job.kind === "boostFeed" && to.structureType === STRUCTURE_LAB)
            boostLogistics.delivered(creep, job, to, amount);
        if (status === ERR_NOT_IN_RANGE) {
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
    // A queued job may predate the reservation. Cleanup still honors manual holds.
    const reservedLab = from.structureType === STRUCTURE_LAB && labReservations.blocked(creep.room.name, from.id);
    if (reservedLab && !(job.kind === "transientDrain" && transientStock.excess(from).some((e) => e.resourceType === resourceType))) {
        clearMineralJob(creep);
        return;
    }
    const fuel = require("../utils/terminalFuel");
    const fuelLimit = job.kind === "stockPolicy" && resourceType === RESOURCE_ENERGY ?
        Math.max(0, from === creep.room.terminal ? fuel.releasable(creep.room) - fuel.transit(creep.room, false, creep.name) :
            fuel.keep(creep.room) - stockPolicy.value(creep.room.terminal, RESOURCE_ENERGY) - fuel.transit(creep.room, true, creep.name)) : Infinity;
    const honorClaims = config.get("stockPolicy.enabled", true) || labReservations.warehouseClaim(creep.room.name, resourceType) > 0;
    const stockLimit = job.kind === "boostFeed" ? boostLogistics.withdrawalLimit(creep, job, from) : reservedLab ? Math.max(0, from.store[resourceType] - terminalClaims.withdrawn(from, resourceType)) :
        honorClaims && resourceType !== RESOURCE_ENERGY ?
        stockPolicy.consumerAvailable(creep.room, from, resourceType, craftOwner(creep.room, job.kind === "factoryComponent" ? "factory" : job.kind === "labReagent" ? "lab" : "none")) : Infinity;
    const request = Math.min(fuelLimit, stockLimit, from.store[resourceType], creep.store.getFreeCapacity(resourceType), job.amount === undefined ? Infinity : job.amount,
        config.get("stockPolicy.enabled", true) && job.toId === (creep.room.terminal && creep.room.terminal.id) && resourceType !== RESOURCE_ENERGY ? stockPolicy.terminalFree(creep.room) : Infinity);
    if (!(request > 0)) { clearMineralJob(creep); return; }
    const status = creep.withdraw(from, resourceType, request);
    if (status === OK && (job.kind === "boostFeed" || reservedLab || honorClaims && resourceType !== RESOURCE_ENERGY))
        stockPolicy.recordConsumerWithdraw(from, resourceType, request);
    if (status === OK && job.kind === "boostFeed") boostLogistics.withdrawn(creep, job, from, request);
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
    let borrowed = 0;
    if (src.act === "withdraw" && (target === creep.room.storage || target === creep.room.terminal) &&
        Object.values(Memory.craft && Memory.craft.active || {}).some((c) => c.room === creep.room.name && c.inventory)) {
        const free = stockPolicy.consumerAvailable(creep.room, target, RESOURCE_ENERGY, src.craftOwner);
        const request = Math.min(target.store.energy || 0, creep.store.getFreeCapacity(RESOURCE_ENERGY), src.amount === undefined ? Infinity : src.amount);
        const essential = !src.craftOwner && essentialConsumer(creep);
        const quantity = essential ? request : Math.min(request, free);
        if (!quantity) return false;
        if (essential) borrowed = Math.max(0, quantity - free);
        src = Object.assign({}, src, { amount: quantity });
    }
    reservations.claim(creep, src.id);
    if (src.dest) creep.memory.forcedDeliver = src.dest;
    if (src.craftOwner) { creep.memory.fundedCraft = src.craftOwner; reservations.claimDeliver(creep, src.dest); }
    const trackBoost = Memory.rooms && Memory.rooms[creep.room.name] && Memory.rooms[creep.room.name].labBoostReservations;
    const boostEnergyAmount = trackBoost && src.act === "withdraw" ? Math.min(target.store[RESOURCE_ENERGY] || 0,
        creep.store.getFreeCapacity(RESOURCE_ENERGY), src.amount === undefined ? Infinity : src.amount) : 0;
    const status =
        src.act === "pickup"
            ? creep.pickup(target)
            : creep.withdraw(target, RESOURCE_ENERGY, src.amount);
    if (status === OK && src.craftOwner) stockPolicy.recordConsumerWithdraw(target, RESOURCE_ENERGY, src.amount);
    if (status === OK && borrowed) {
        require("../utils/craftLedger").preempt(creep.room, target, RESOURCE_ENERGY, borrowed);
        stockPolicy.recordConsumerWithdraw(target, RESOURCE_ENERGY, src.amount);
    }
    if (status === OK && boostEnergyAmount)
        boostLogistics.energyWithdrawn(creep, target, boostEnergyAmount, !!src.craftOwner || borrowed > 0);
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

        if (cpuMeter.span("hauler.cover", () => takeCover(creep))) return;
        if (cpuMeter.span("hauler.terminalJob", () => terminalOps.runHauler(creep))) return;

        // ROADMAP 0107 (user request): an in-progress battlefield loot trip
        // always runs to completion - grab everything the body's still
        // holding, then dump it all in storage - before anything else below
        // gets a look in, same as the mineralJob commitment right after.
        if (creep.memory.lootJob) {
            runLootJob(creep);
            return;
        }

        if (bootstrapStorage.runHauler(creep, () => !!essentialConsumer(creep))) return;

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
                // ROADMAP 0107: a >500 dropped pile preempts even an
                // in-progress (not-yet-loaded) mineral job outright - same
                // priority as the fresh-pick case in the "load" branch below.
                if (energySource && energySource.tier === "bigDrop") {
                    clearMineralJob(creep);
                    loadEnergy(creep, energySource);
                    return;
                }
                // ROADMAP 0111: a chain's feed job, once taken, runs to the end
                if (job.chain && chainActive(creep.room)) {
                    runMineralJob(creep);
                    return;
                }
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
            delete creep.memory.fundedCraft;
            reservations.releaseDeliver(creep);
        } else if (creep.memory.job !== "deliver" && free === 0) {
            creep.memory.job = "deliver";
        } else if (!creep.memory.job) {
            creep.memory.job = carrying > 0 ? "deliver" : "load";
        }

        if (creep.memory.job === "load") {
            if (idleSkip(creep)) {
                cpuMeter.record("spans", "hauler.idleSkip", 0); // calls/tick = searches avoided
                waitForEnergy(creep);
                return;
            }
            delete idleChecks[creep.name];
            const src = pickLoad(creep);

            // ROADMAP 0107 (user request): a >500 dropped pile wins outright
            // - even over a pressured job - decay-aware (estimatedDropAmount)
            // and by far the biggest one-shot amount on the ground.
            if (src && src.tier === "bigDrop") {
                loadEnergy(creep, src);
                return;
            }

            // Tombstone/ruin loot (every resource a body is holding, energy
            // included - ROADMAP 0107, user request) is the next tier - it
            // decays away for good if nobody grabs it in time, so it
            // outranks the regular pressuredJob/terminal/essentialConsumer
            // cascade below, but never the bigDrop pile above. Only while
            // the tank's empty - already carrying energy rules out starting
            // a fresh lootJob mid-trip (runLootJob commits to finishing one
            // it's already on, same as the rest of this file's job idiom).
            if (creep.store.getUsedCapacity() === 0) {
                const loot = battlefieldLootJob(creep.room);
                if (loot && assignLootJob(creep, loot)) {
                    runLootJob(creep);
                    return;
                }
            }

            if (src) {
                const pressuredJob =
                    hasPressureCapacity(creep.room) && nonEnergyLogistics.keepsEnergyHauler(creep.room)
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
                // ROADMAP 0111: feed a running chain before loading more energy -
                // same guard as the pressured tier (2+ haulers, tank empty), so
                // one hauler is always left on energy
                const chainJob =
                    creep.store.getUsedCapacity() === 0 &&
                    hasPressureCapacity(creep.room) &&
                    nonEnergyLogistics.keepsEnergyHauler(creep.room)
                        ? pickChainFeedJob(creep.room)
                        : null;
                if (chainJob && assignMineralJob(creep, chainJob)) {
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
                markIdle(creep);
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
        } else if (creep.memory.fundedCraft && creep.memory.fundedCraft === craftOwner(creep.room, "factory") &&
            !essentialConsumer(creep) && resourceTiers.aboveReserve(creep.room) && Game.getObjectById(creep.memory.forcedDeliver) &&
            transientStock.energyNeed(Game.getObjectById(creep.memory.forcedDeliver)) > 0) {
            id = creep.memory.forcedDeliver;
        } else {
            id = pickDeliver(creep);
        }
        if (!id) {
            idleNear(creep);
            return;
        }
        const target = Game.getObjectById(id);
        if (!target) return;
        reservations.claimDeliver(creep, id);
        // ROADMAP 0111: a transitory lab/factory takes only its target, the
        // rest stays on the creep for the next delivery (storage)
        const amount = transientStock.isTransient(target)
            ? Math.max(1, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), transientStock.energyNeed(target)))
            : undefined;
        if (creep.transfer(target, RESOURCE_ENERGY, amount) === ERR_NOT_IN_RANGE) {
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
    runMineralJobNow,
    stockPolicyJob,
    pickMineralJob,
    pickLoad,
    pickChainFeedJob,
    battlefieldLootJob,
    runLootJob,
    optionalConsumer,
    spawnsAndExtensionsFull,
    shouldMinerFeedTower,
    idleSkip,
    markIdle,
    deliverPickValid,
};

module.exports = hauler;
