// Call this function at the end of your main loop

const roomCache = require("./roomCache");
const config = require("./config");
const energyLedger = require("./energyLedger");
const resourceTiers = require("./resourceTiers");

// heap-resident, survives ticks but not a global reset - a reset just means
// the very next call recomputes fresh instead of reusing a stale value, so
// losing this on reset is a non-issue (ROADMAP 0079)
let barrierHitsCache = {};

function hatcheryUptime(room) {
    const spawns = roomCache
        .myStructures(room)
        .filter((s) => s.structureType === STRUCTURE_SPAWN);
    if (!spawns.length) return 0;
    const spawning = spawns.filter((s) => s.spawning).length;
    return spawning / spawns.length;
}

// Average rampart/wall hits for the room, throttled (stats.barrierHitsInterval)
// - unlike hatcheryUptime this walks every barrier in the room, real work on
// a hardened base, so it isn't recomputed every tick (constitution §1).
// Between recomputes the last value stays put instead of disappearing/
// zeroing (ROADMAP 0079 acceptance criteria).
function avgBarrierHits(room) {
    const interval = config.get("stats.barrierHitsInterval", 50);
    const cached = barrierHitsCache[room.name];
    if (cached && Game.time - cached.tick < interval) return cached.value;

    const barriers = roomCache
        .myStructures(room)
        .filter(
            (s) =>
                s.structureType === STRUCTURE_RAMPART ||
                s.structureType === STRUCTURE_WALL
        );
    const value = barriers.length
        ? barriers.reduce((sum, s) => sum + s.hits, 0) / barriers.length
        : 0;
    barrierHitsCache[room.name] = { value, tick: Game.time };
    return value;
}

// heap-resident: absent after a global reset (Memory survives, heap doesn't)
// - the very first call following one is what marks persistent.lastGlobalReset
let globalResetSeen = false;

// the 7 base minerals (Screeps-provided constants, never hardcoded strings -
// same principle as REACTIONS/COMMODITIES elsewhere in this codebase)
const BASE_MINERALS = [
    RESOURCE_HYDROGEN,
    RESOURCE_OXYGEN,
    RESOURCE_UTRIUM,
    RESOURCE_KEANIUM,
    RESOURCE_LEMERGIUM,
    RESOURCE_ZYNTHIUM,
    RESOURCE_CATALYST,
];

// storage + terminal assets for each base mineral - only nonzero entries are
// kept (constitution §2, small Memory) rather than 7 zero-valued keys for
// every room, most of which won't have a mineral operation running at all
function minerals(room) {
    const result = {};
    for (const type of BASE_MINERALS) {
        const fromStorage = room.storage ? room.storage.store[type] || 0 : 0;
        const fromTerminal = room.terminal ? room.terminal.store[type] || 0 : 0;
        const total = fromStorage + fromTerminal;
        if (total > 0) result[type] = total;
    }
    return result;
}

function exportStats() {
    // persistent.* has to survive this tick's full Memory.stats.rooms/gcl/cpu
    // wipe below - it's the one section whose whole point is to outlive resets.
    const previousPersistent = (Memory.stats && Memory.stats.persistent) || {};

    // Reset stats object
    Memory.stats = {
        gcl: {},
        rooms: {},
        cpu: {},
        memory: {},
        market: {},
        persistent: previousPersistent,
    };

    Memory.stats.time = Game.time;

    if (!globalResetSeen) {
        globalResetSeen = true;
        Memory.stats.persistent.lastGlobalReset = Game.time;
    }

    // ROADMAP 0079: memory.used (RawMemory.get().length) - shard3's fixed
    // 2,048,000 byte cap is a dashboard-side constant, not collected here.
    Memory.stats.memory.used = RawMemory.get().length;

    // ROADMAP 0079: cpu.heap - only the 3 fields the dashboard actually
    // reads (total_heap_size/heap_size_limit/used_heap_size); isolated-VM
    // only, guarded for runtimes that don't support it (constitution §3).
    if (typeof Game.cpu.getHeapStatistics === "function") {
        const heap = Game.cpu.getHeapStatistics();
        Memory.stats.cpu.heap = {
            total_heap_size: heap.total_heap_size,
            heap_size_limit: heap.heap_size_limit,
            used_heap_size: heap.used_heap_size,
        };
    }

    // ROADMAP 0079: market.credits - Game.market is always present on the
    // real server, but guarded the same way hauler.js already guards
    // Game.market.incomingTransactions (constitution §3).
    Memory.stats.market.credits = (Game.market && Game.market.credits) || 0;

    // Collect room stats
    for (let roomName in Game.rooms) {
        let room = Game.rooms[roomName];
        let isMyRoom = room.controller ? room.controller.my : false;
        if (isMyRoom) {
            let roomStats = (Memory.stats.rooms[roomName] = {});
            roomStats.storageEnergy = room.storage
                ? room.storage.store.energy
                : 0;
            roomStats.terminalEnergy = room.terminal
                ? room.terminal.store.energy
                : 0;
            roomStats.energyAvailable = room.energyAvailable;
            roomStats.energyCapacityAvailable = room.energyCapacityAvailable;
            roomStats.controllerProgress = room.controller.progress;
            roomStats.controllerProgressTotal = room.controller.progressTotal;
            roomStats.controllerLevel = room.controller.level;
            // ROADMAP 0079
            roomStats.totalEnergyAssets =
                roomStats.storageEnergy + roomStats.terminalEnergy;
            roomStats.hatcheryUptime = hatcheryUptime(room);
            roomStats.avgBarrierHits = avgBarrierHits(room);
            roomStats.minerals = minerals(room);
            const economy = resourceTiers.getEconomySnapshot(room);
            roomStats.economyState = economy.state;
            roomStats.economyReason = economy.reason;
            roomStats.criticalConsumers = economy.criticalConsumers;
            // ROADMAP 0081: where the room's energy went this tick
            roomStats.energySpent = energyLedger.snapshot(roomName);
        }
    }

    // Collect GCL stats
    Memory.stats.gcl.progress = Game.gcl.progress;
    Memory.stats.gcl.progressTotal = Game.gcl.progressTotal;
    Memory.stats.gcl.level = Game.gcl.level;

    // Collect CPU stats
    Memory.stats.cpu.bucket = Game.cpu.bucket;
    Memory.stats.cpu.limit = Game.cpu.limit;
    Memory.stats.cpu.used = Game.cpu.getUsed();
}

module.exports = exportStats;
