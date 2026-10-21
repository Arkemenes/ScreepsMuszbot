const { getHostiles } = require("../utils/hostiles");
const roomCache = require("../utils/roomCache");
const cpuMeter = require("../utils/cpuMeter");
const transitSafety = require("../utils/transitSafety");
const keeperTransit = require("../utils/keeperTransit");
const mapExits = require("../utils/mapExits");

const STALE_COUNTERS = [
    "numberOfDefenders", "numberOfUpgraders", "numberOfBuilders", "numberOfMiners",
    "numberOfHaulers", "numberOfScouts", "numberOfRepairers", "numberOfWallRepairers",
    "numberOfTransporters", "numberOfLogistics", "numberOfClaimers", "numberOfLinks",
    "numberOfContainers",
];
const purgedRooms = {};

function getIntel(room) {
    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    // If there is no info about the room, create a variable
    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }
    const mem = Memory.rooms[room.name];

    // First look at this room: its neighbours get their (empty) record so the scouts know
    // them. The exits themselves are not stored - utils/mapExits.js (ROADMAP 0146).
    if (mem.lastVisit === undefined && !mem.exits) {
        const exits = mapExits.exits(room.name) || {};

        for (let exit in exits) {
            if (!Memory.rooms[exits[exit]]) {
                Memory.rooms[exits[exit]] = {};
            }
        }
    }

    if (mem.sourceNumber == undefined) {
        mem.sourceNumber = roomCache.sources(room).length;
    }

    if (mem.mineral == undefined) {
        let mineral = roomCache.minerals(room)[0];
        mem.mineral = mineral ? mineral.mineralType : null;
    }

    if (mem.hasController == undefined) {
        mem.hasController = room.controller ? true : false;
    }

    cpuMeter.span("intel.controller", () => {
        const controller = room.controller;
        mem.reservation = controller ? controller.reservation : undefined;
        mem.my = controller ? controller.my : undefined;
        mem.owner =
            controller && controller.owner
                ? controller.owner.username
                : undefined;
        // RCL of ANY scouted/observed room, not just our own (needs.js already
        // has its own copy for owned rooms) - rooms/raiding.js (ROADMAP 0032
        // O4) needs this to judge how dangerous a foreign room could be.
        mem.controllerLevel = controller ? controller.level : undefined;
    });

    cpuMeter.span("intel.transitSafety", () => transitSafety.observeRoom(room));
    const hostiles = cpuMeter.span("intel.hostiles", () => getHostiles(room));
    // ROADMAP 0146: the zero/false defaults are not stored (undefined is not serialised);
    // every reader treats a missing enemies/enemyStructures/numberOfTowers/hasInvaderCore as 0/false
    mem.enemies = hostiles.length || undefined;
    cpuMeter.span("intel.keeperTransit", () => keeperTransit.observe(room));
    if (room.controller && room.controller.my) {
        mem.defenseActive = hostiles.length > 0;
    }

    // Hostile structures change rarely (an invader core takes a long time to
    // appear), so the filtered find runs every 10 ticks, not every tick -
    // it was ~0.6 CPU/tick across the owned rooms (profile 2026-10-02). Rooms
    // with enemies present are rescanned every tick.
    if (
        mem.enemyScanTick === undefined ||
        mem.enemies > 0 ||
        Game.time - mem.enemyScanTick >= 10 ||
        Game.time < mem.enemyScanTick
    ) {
        mem.enemyScanTick = Game.time;
        cpuMeter.span("intel.enemyScan", () => {
            const enemyStructures = room.find(FIND_HOSTILE_STRUCTURES, {
                filter: (s) => s.structureType != STRUCTURE_POWER_BANK,
            });
            mem.enemyStructures = enemyStructures.length || undefined;
            // ROADMAP 0032 O2 - console raidRoom() targets this directly.
            mem.hasInvaderCore = enemyStructures.some(
                (s) => s.structureType === STRUCTURE_INVADER_CORE
            ) || undefined;
            // a room we do not own has no towers of ours: the hostile ones are all there are, so
            // observing a room needs no full FIND_STRUCTURES just to count them (see below)
            if (!(room.controller && room.controller.my)) {
                mem.numberOfTowers = enemyStructures.filter(
                    (s) => s.structureType === STRUCTURE_TOWER
                ).length || undefined;
            }
        });
    }

    mem.lastVisit = Game.time;

    // The numberOfDefenders/Upgraders/Builders/Miners/Haulers/Scouts/... counters (12
    // census lookups and as many Memory writes per room per tick) were read by nothing - gone
    // (2026-10-03 audit). census.count() is what to call for a live number. The stale keys are
    // dropped once per room after a global reset.
    if (!purgedRooms[room.name]) {
        purgedRooms[room.name] = true;
        STALE_COUNTERS.forEach((key) => { delete mem[key]; });
    }

    // read by rooms/raiding.js only, for rooms we do not own (counted by the enemy scan above)
    if (room.controller && room.controller.my) {
        // ARK-116: usually the first structure read of the tick, so it pays the room's shared
        // roomCache FIND_STRUCTURES fill - spanned to keep that apart from intel's own work
        mem.numberOfTowers = cpuMeter.span("intel.structures", () =>
            roomCache.structuresByType(room, STRUCTURE_TOWER).length) || undefined;
    }
}

module.exports = getIntel;
