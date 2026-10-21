// Call this function at the end of your main loop

const roomCache = require("./roomCache");
const census = require("./census");
const config = require("./config");
const cpuMeter = require("./cpuMeter");
const energyLedger = require("./energyLedger");
const resourceTiers = require("./resourceTiers");
const market = require("./market");
const terminalOps = require("./terminalOps");
const energyBalancing = require("../rooms/energyBalancing");
const cpuTier = require("./cpuTier");
const combat = require("./combat");
const energyReport = require("./energyReport");
const onDemandPopulation = require("../rooms/onDemandPopulation");
const labReport = require("./labReport");

// ROADMAP 0162: the bucket band of this tick (bandLevel 0 critical .. 3 full, for Grafana)
// and how many guard() calls each tier gate skipped this tick
function publishBand(cpu) {
    cpu.band = cpuTier.band();
    cpu.bandLevel = cpuTier.level();
    cpu.skipped = cpuTier.skippedNow();
}

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

function compoundsT3(room) {
    const result = {};
    // The catalyst reactions define all T3 boost compounds, including catalyzed acids.
    const products = typeof REACTIONS !== "undefined" && REACTIONS[RESOURCE_CATALYST] || {};
    for (const type of new Set(Object.values(products))) {
        const total = (room.storage && room.storage.store[type] || 0) + (room.terminal && room.terminal.store[type] || 0);
        if (total > 0) result[type] = total;
    }
    return result;
}

function recentTelemetry(previousNetwork, previousMarket) {
    Memory.stats.terminalNetwork = terminalOps.terminalNetworkStats(previousNetwork);
    if (!Memory.stats.market) Memory.stats.market = {};
    Memory.stats.market.transactions = terminalOps.marketTransactionStats(previousMarket);
    const window = config.get("terminalOps.statsWindowTicks", 60);
    const telemetry = Memory.stats.telemetry || (Memory.stats.telemetry = {});
    telemetry.tick = Game.time;
    telemetry.windowStart = Game.time - window + 1;
    telemetry.windowTicks = window;
}

// Sparse physical inventory: reservations and orders are not additional assets.
function resourceAssets() {
    const resources = {};
    const seen = new Set();
    function addStore(store) {
        if (!store) return;
        for (const type of Object.keys(store)) {
            const amount = store[type];
            if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
                resources[type] = (resources[type] || 0) + amount;
            }
        }
    }
    function addObject(object) {
        if (!object || object.my === false) return;
        const key = object.id || object;
        if (seen.has(key)) return;
        seen.add(key);
        addStore(object.store);
    }
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;
        for (const structure of roomCache.structures(room)) addObject(structure);
        // Also support sparse room mocks; the Set prevents counting these twice.
        addObject(room.storage);
        addObject(room.terminal);
    }
    for (const creep of census.allOwned()) addObject(creep);
    for (const name in Game.powerCreeps) {
        const creep = Game.powerCreeps[name];
        if (creep.pos) addObject(creep);
    }
    addStore(Game.resources);
    return { resources };
}

function exportStats() {
    // The exporter polls on its own wall-clock cadence; publications use Game.time.
    // Rebuilding the whole
    // object every tick (~0.9 CPU/tick, 2026-10-03) published numbers nobody read.
    // Between publishes the last object stays as is, except what a dashboard reads as a
    // live gauge: cpu.used/bucket/limit follow every tick (held for 60 ticks, the global
    // reset tick - the costliest one, ~50 CPU of module loading - showed as the CPU
    // level of the next 3 minutes), and a freshly closed CPU-meter window is hung on it at
    // once. The first call after a global reset always publishes (marks persistent.lastGlobalReset).
    const interval = Math.max(1, Number(config.get("stats.publishInterval", 60)) || 60);
    const last = Memory.stats && Memory.stats.time;
    if (interval > 1 && globalResetSeen && last !== undefined && Game.time >= last && Game.time - last < interval) {
        recentTelemetry(Memory.stats.terminalNetwork, Memory.stats.market && Memory.stats.market.transactions);
        const fresh = cpuMeter.snapshot();
        if (Memory.stats.cpu) {
            Memory.stats.cpu.bucket = Game.cpu.bucket;
            Memory.stats.cpu.tick = Game.time; // ARK-116: the tick this bucket belongs to (stats.time moves every 60)
            publishBand(Memory.stats.cpu);
            Memory.stats.cpu.limit = Game.cpu.limit;
            Memory.stats.cpu.used = Game.cpu.getUsed();
            Memory.stats.cpu.accounting = cpuMeter.accounting();
            if (fresh && Memory.stats.cpu.meter !== fresh) Memory.stats.cpu.meter = fresh;
        }
        return;
    }
    // persistent.* has to survive this tick's full Memory.stats.rooms/gcl/cpu
    // wipe below - it's the one section whose whole point is to outlive resets.
    const previousPersistent = (Memory.stats && Memory.stats.persistent) || {};
    // the CPU meter publishes a window every N ticks; between a global reset and the
    // first window the last published one is kept instead of leaving a gap in Grafana
    const previousMeter = Memory.stats && Memory.stats.cpu && Memory.stats.cpu.meter;
    const previousNetwork = Memory.stats && Memory.stats.terminalNetwork;
    const previousMarket = Memory.stats && Memory.stats.market && Memory.stats.market.transactions;

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

    // ROADMAP 0154 T5: running experiments and how the last one ended (absent until the first)
    const experiments = require("./experiments").stats();
    if (experiments) Memory.stats.experiments = experiments;

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
    Memory.stats.assets = resourceAssets();

    // ROADMAP 0079 follow-up (2026-09-24): market.transactions/
    // terminalNetwork.transfers were "out of scope" because the bot never
    // called Game.market.deal()/terminal.send() - ROADMAP 0098 changed
    // that, so the "Mercado"/"Terminal Network" dashboard panels can be fed
    // for real now. Source is terminalOps' own event log, not Game.market,
    // so no extra guard is needed here.
    recentTelemetry(previousNetwork, previousMarket);

    // ROADMAP 0096: publish only liquid resources so the Grafana-facing
    // Memory snapshot stays sparse while the expensive calculation remains
    // heap-only in utils/market.js.
    const marketSnapshot = market.snapshot();
    if (marketSnapshot && marketSnapshot.resources) {
        const fairPrice = {};
        for (const resourceType in marketSnapshot.resources) {
            const result = marketSnapshot.resources[resourceType];
            if (!result || (
                result.fairPrice === null &&
                result.currentBuy === null &&
                result.currentSell === null
            )) continue;
            fairPrice[resourceType] = {
                fairPrice: result.fairPrice,
                buyPrice: result.buyPrice,
                sellPrice: result.sellPrice,
                currentBuy: result.currentBuy,
                currentSell: result.currentSell,
                sampleCount: result.sampleCount,
                windowCoverageTicks: result.windowCoverageTicks,
                confidence: result.confidence,
            };
        }
        Memory.stats.market.fairPrice = fairPrice;
    }

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
            roomStats.compoundsT3 = compoundsT3(room);
            const economy = resourceTiers.getEconomySnapshot(room);
            roomStats.economyState = economy.state;
            roomStats.economyReason = economy.reason;
            roomStats.criticalConsumers = economy.criticalConsumers;
            // Trailing modeled spend; quality and boosted effects are separate.
            roomStats.energySpent = energyLedger.snapshot(roomName);
            roomStats.energySpentQuality = energyLedger.snapshotInfo(roomName);
            roomStats.terminalOperations = terminalOps.stats(roomName);
            roomStats.energyBalancing = energyBalancing.stats(roomName);
            // ROADMAP 0120: idle defenders by reason (empty object when none)
            roomStats.defenderIdle = combat.idleDefenders(roomName);
            // ROADMAP 0154-B: energyReport over its full window (heap samples, rounded here)
            roomStats.energyReport = energyReport.summary(roomName);
            roomStats.labReport = labReport.summary(roomName); // ROADMAP 0155
            roomStats.terminalReport = require("./terminalReport").summary(roomName); // ROADMAP 0163
            roomStats.extractorEconomics = require("./extractorEconomics").summary(roomName); // ROADMAP 0164
            roomStats.boostBreakeven = require("./boostBreakeven").summary(room); // ROADMAP 0154 T4
            // ROADMAP 0149: the executor's last plan and the last confirmed application
            const boostPlan = require("./boostExecutor").status(roomName);
            const applied = Memory.rooms[roomName] && Memory.rooms[roomName].boostApplied;
            if (boostPlan || applied) roomStats.boost = { status: boostPlan ? String(boostPlan.result.status) : "",
                reason: boostPlan && boostPlan.result.reason ? String(boostPlan.result.reason) : "",
                lastParts: applied ? applied.parts : null, lastTick: applied ? applied.tick : null };
            // ROADMAP 0148: last on-demand builder decision (mode is exported as an info label)
            const onDemand = onDemandPopulation.status(roomName);
            if (onDemand) {
                roomStats.onDemand = { mode: onDemand.mode, builder: onDemand.builder, legacy: onDemand.legacy,
                    idleFor: onDemand.idleFor === undefined ? null : onDemand.idleFor, lead: onDemand.lead === undefined ? null : onDemand.lead,
                    active: onDemand.mode === "active" ? 1 : 0, floor: onDemand.floor ? 1 : 0,
                    reason: onDemand.reasons.length ? String(onDemand.reasons[0]) : "" };
                // T3: ticks from the pilot's end to a builder alive or spawning again
                const lastRecovery = Memory.rooms[roomName] && Memory.rooms[roomName].onDemandLast;
                if (lastRecovery) roomStats.onDemand.recoveryTicks = lastRecovery.recoveryTicks;
            }
        }
    }

    // Collect GCL stats
    Memory.stats.gcl.progress = Game.gcl.progress;
    Memory.stats.gcl.progressTotal = Game.gcl.progressTotal;
    Memory.stats.gcl.level = Game.gcl.level;
    // ROADMAP 0150: GPL and what the power spawns hold, for the processing decision
    if (Game.gpl) Memory.stats.gpl = { level: Game.gpl.level, progress: Game.gpl.progress, progressTotal: Game.gpl.progressTotal };
    Memory.stats.power = require("./powerEconomics").summary();
    // ROADMAP 0150 T8: managed operators (state, level, ttl) and the GPL levels still free
    const operators = require("../powerCreeps/operator");
    Memory.stats.power.freeLevels = operators.freeLevels();
    Memory.stats.power.operators = Object.fromEntries(operators.status().map((o) => [o.name, { state: o.state || "", level: o.level, ttl: o.ttl }]));

    // Collect CPU stats
    Memory.stats.cpu.bucket = Game.cpu.bucket;
    Memory.stats.cpu.tick = Game.time; // ARK-116: the tick this bucket belongs to (stats.time moves every 60)
    publishBand(Memory.stats.cpu);
    Memory.stats.cpu.limit = Game.cpu.limit;
    Memory.stats.cpu.used = Game.cpu.getUsed();
    Memory.stats.cpu.accounting = cpuMeter.accounting();
    const meter = cpuMeter.snapshot() || previousMeter;
    if (meter) Memory.stats.cpu.meter = meter;
    // ROADMAP 0147/0156: decision-cache probes - share of calls that repeated the previous inputs
    const probes = require("./probe").snapshot();
    if (probes.names.length) Memory.stats.cpu.probes = Object.fromEntries(probes.names.map((p) => [p.name, { rate: p.rate, calls: p.calls }]));
}

module.exports = exportStats;
