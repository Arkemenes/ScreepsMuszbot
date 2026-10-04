const { getHostiles } = require("../utils/hostiles");
const roomCache = require("../utils/roomCache");
const cpuMeter = require("../utils/cpuMeter");

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

    if (!mem.exits) {
        mem.exits = Game.map.describeExits(room.name);

        for (let exit in mem.exits) {
            if (!Memory.rooms[mem.exits[exit]]) {
                Memory.rooms[mem.exits[exit]] = {};
            }
        }
    }

    if (mem.sourceNumber == undefined) {
        mem.sourceNumber = room.find(FIND_SOURCES).length;
    }

    if (mem.mineral == undefined) {
        let mineral = room.find(FIND_MINERALS)[0];
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

    const hostiles = cpuMeter.span("intel.hostiles", () => getHostiles(room));
    mem.enemies = hostiles.length;
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
            mem.enemyStructures = enemyStructures.length;
            // ROADMAP 0032 O2 - console raidRoom() targets this directly.
            mem.hasInvaderCore = enemyStructures.some(
                (s) => s.structureType === STRUCTURE_INVADER_CORE
            );
            // a room we do not own has no towers of ours: the hostile ones are all there are, so
            // observing a room needs no full FIND_STRUCTURES just to count them (see below)
            if (!(room.controller && room.controller.my)) {
                mem.numberOfTowers = enemyStructures.filter(
                    (s) => s.structureType === STRUCTURE_TOWER
                ).length;
            }
        });
    }

    mem.lastVisit = Game.time;

    if (!mem.builds) {
        mem.builds = {};
    }

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
        mem.numberOfTowers = roomCache.structuresByType(room, STRUCTURE_TOWER).length;
    }
}

module.exports = getIntel;
