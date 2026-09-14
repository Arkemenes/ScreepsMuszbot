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
const names = require("../utils/names");

// Containers sitting next to an energy source - the piles a hauler drains.
function sourceContainers(room) {
    return _.filter(
        roomCache.structuresByType(room, STRUCTURE_CONTAINER),
        (c) => c.pos.findInRange(FIND_SOURCES, 1).length > 0
    );
}

// ROADMAP 0054: the tower's 3-tier delivery bands, as a fraction of its own
// capacity - critical/satisfactory shift up together under defenseActive
// (a tower nearly full going into a fight is worth more than the same
// energy idle in storage).
function towerCriticalRatio(room) {
    const roomMem = Memory.rooms[room.name] || {};
    return roomMem.defenseActive
        ? config.get("tower.criticalRatioUnderAttack", 0.8)
        : config.get("tower.criticalRatio", 0.5);
}

function towerSatisfactoryRatio(room) {
    const roomMem = Memory.rooms[room.name] || {};
    return roomMem.defenseActive
        ? config.get("tower.satisfactoryRatioUnderAttack", 0.95)
        : config.get("tower.satisfactoryRatio", 0.8);
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

// At/above satisfactoryRatio (the ideal band): still worth topping off
// further, but only up to hauler.toppingOffThreshold free capacity - a
// tower nearer to full than that isn't worth another trip. Between
// criticalRatio and satisfactoryRatio (satisfactory) a tower matches
// NEITHER this nor isTowerCritical above - not urgent, not worth topping,
// simply left alone (ROADMAP 0054 - used to be a single reserve threshold
// with "anything above it is incondicionally toppable forever").
function towerDeliverable(s, room) {
    return (
        s.structureType === STRUCTURE_TOWER &&
        !isSourceDefenseTower(s) &&
        s.store[RESOURCE_ENERGY] >=
            s.store.getCapacity(RESOURCE_ENERGY) * towerSatisfactoryRatio(room) &&
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
// satisfactory or ideal-band tower is NOT essential (ROADMAP 0054) - see
// toppableTower below for the ideal-band case.
function essentialConsumer(creep) {
    return creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) =>
            ((s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
            isTowerCritical(s, creep.room),
    });
}

// Lab / factory / power spawn / controller container - genuinely optional,
// so unlike essentialConsumer above these DO respect the room's reserve
// (resourceTiers.aboveReserve, checked by the caller) before pulling.
// Factory/power spawn added alongside lab (ROADMAP 0051) - same reasoning,
// pure RESOURCE_ENERGY need, no different from a lab's. Non-energy
// resources for these three (mineral reagents/components, Power) are a
// separate concern - see pickMineralJob() below, never mixed into this
// energy-only cascade.
function optionalConsumer(creep) {
    const lab = creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) =>
            (s.structureType === STRUCTURE_LAB ||
                s.structureType === STRUCTURE_FACTORY ||
                s.structureType === STRUCTURE_POWER_SPAWN) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    if (lab) return lab;

    if (!creep.room.controller) return null;
    return creep.room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (s) =>
            s.structureType === STRUCTURE_CONTAINER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    })[0];
}

// A tower still in its ideal band worth topping off (towerDeliverable) -
// also genuinely optional, gated the same way as optionalConsumer above by
// the caller (resourceTiers.aboveReserve).
function toppableTower(creep) {
    return creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) => towerDeliverable(s, creep.room),
    });
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
// reserve (resourceTiers.aboveReserve, ROADMAP 0054), when a
// lab/controller-container (optionalConsumer) or an ideal-band tower
// (toppableTower) needs it - never storage -> storage either way - then the
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

    const link = creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) =>
            s.structureType === STRUCTURE_LINK &&
            !s.isCollector() &&
            s.store[RESOURCE_ENERGY] > 0 &&
            reservations.available(creep, s) >= 50,
    });
    if (link) return { id: link.id, act: "withdraw" };

    if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
        if (
            essentialConsumer(creep) ||
            (resourceTiers.aboveReserve(creep.room) &&
                (optionalConsumer(creep) || toppableTower(creep)))
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
// outranks topping anything off further), then an ideal-band tower still
// worth topping off, then labs, then storage (general, whatever's left),
// then the controller upgrade container. Source-defense towers (tagged
// `sourceDefense` in the plan - the one right next to a source's container)
// are never a hauler target, in either branch: the miner sitting right
// there already keeps it fed (miner.js distribute()), and a hauler
// detouring all the way out to a source cluster just to top off a tower the
// miner already handles is a wasted trip.
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
    let target = creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) => isTowerCritical(s, creep.room),
    });
    if (target) return target.id;

    target = creep.pos.findClosestByPath(roomCache.myStructures(creep.room), {
        filter: (s) =>
            (s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    if (target) return target.id;

    // keep a minimum emergency buffer in storage - below the reserve it
    // outranks topping towers/labs beyond their own satisfactory band,
    // since an empty storage means the room has nothing to fall back on
    if (creep.room.storage && !resourceTiers.aboveReserve(creep.room)) {
        return creep.room.storage.id;
    }

    // ideal-band tower still worth topping off - only while the reserve
    // above is intact (resourceTiers.aboveReserve, checked just above -
    // ROADMAP 0054, this used to be unconditional)
    target = creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) => towerDeliverable(s, creep.room),
    });
    if (target) return target.id;

    target = creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) =>
            s.structureType === STRUCTURE_LAB &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    if (target) return target.id;

    if (
        creep.room.storage &&
        creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    ) {
        return creep.room.storage.id;
    }

    if (creep.room.controller) {
        const upContainer = creep.room.controller.pos.findInRange(
            FIND_STRUCTURES,
            3,
            {
                filter: (s) =>
                    s.structureType === STRUCTURE_CONTAINER &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            }
        )[0];
        if (upContainer) return upContainer.id;
    }

    // Last resort - nothing else in the cascade above wants this energy
    // (spawn/ext full, storage at/above its reserve or full, no lab/
    // controller-container need it). A tower sitting in the satisfactory
    // dead zone (between criticalRatio and satisfactoryRatio - see
    // towerDeliverable's comment) was deliberately skipped above because
    // something better might come along, but with nothing else to do,
    // topping it off beats a hauler idling full nearby.
    target = creep.pos.findClosestByRange(roomCache.myStructures(creep.room), {
        filter: (s) =>
            s.structureType === STRUCTURE_TOWER &&
            !isSourceDefenseTower(s) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    if (target) return target.id;

    return null;
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
    return { resourceType, from: container, to };
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
    return { resourceType: output.mineralType, from: output, to };
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
        return { resourceType, from, to: lab };
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
    return { resourceType: product, from: factory, to };
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
        return { resourceType, from, to: factory };
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
    return { resourceType: RESOURCE_POWER, from, to: powerSpawn };
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

// Picks up (if empty of the job's resource) or delivers (if carrying it) -
// exactly one action per tick, same idiom as the rest of this file. Clears
// memory.mineralJob once delivered, or if the source dried up before this
// creep got there (fail-soft - just means the job is re-picked fresh next
// time this creep goes idle).
function runMineralJob(creep) {
    const job = creep.memory.mineralJob;
    const resourceType = job.resourceType;

    if (creep.store[resourceType] > 0) {
        const to = Game.getObjectById(job.toId);
        if (!to) {
            delete creep.memory.mineralJob;
            return;
        }
        if (creep.transfer(to, resourceType) === ERR_NOT_IN_RANGE) {
            creep.moveTo(to, { range: 1, reusePath: 10 });
        }
        if (!creep.store[resourceType]) delete creep.memory.mineralJob;
        return;
    }

    const from = Game.getObjectById(job.fromId);
    if (!from || !(from.store && from.store[resourceType] > 0)) {
        delete creep.memory.mineralJob;
        return;
    }
    const status = creep.withdraw(from, resourceType);
    if (status === ERR_NOT_IN_RANGE) {
        creep.moveTo(from, { range: 1, reusePath: 10 });
        return;
    }
    if (status !== OK) delete creep.memory.mineralJob;
}

var hauler = {
    run(creep) {
        // legacy: fold pre-consolidation harvesters into this role
        if (creep.memory.role === "harvester") creep.memory.role = "hauler";

        if (takeCover(creep)) return;

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
            if (carryingJobResource || spawnsAndExtensionsFull(creep.room)) {
                runMineralJob(creep);
                return;
            }
            delete creep.memory.mineralJob;
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
                const target = Game.getObjectById(src.id);
                if (target) {
                    reservations.claim(creep, src.id);
                    // sticky: don't clear a pending forced route just because
                    // this tick's remaining capacity came from a different
                    // pile than the one that set it (constitution §3 - don't
                    // lose track of intent on a partial/mixed load)
                    if (src.dest) creep.memory.forcedDeliver = src.dest;
                    const res =
                        src.act === "pickup"
                            ? creep.pickup(target)
                            : creep.withdraw(target, RESOURCE_ENERGY, src.amount);
                    if (res === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, { range: 1 });
                    }
                    return;
                }
            }
            reservations.release(creep);
            // nothing to pick up: deliver a partial load, else wait by a
            // link - but try a non-energy job first (ROADMAP 0051), this is
            // the ONLY place memory.mineralJob ever gets set
            if (carrying === 0) {
                const mineralJob = spawnsAndExtensionsFull(creep.room)
                    ? pickMineralJob(creep.room)
                    : null;
                if (mineralJob) {
                    creep.memory.mineralJob = {
                        resourceType: mineralJob.resourceType,
                        fromId: mineralJob.from.id,
                        toId: mineralJob.to.id,
                    };
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
};

module.exports = hauler;
