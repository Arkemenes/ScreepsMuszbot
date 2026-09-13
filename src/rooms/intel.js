const { getHostiles } = require("../utils/hostiles");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");

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

    mem.reservation = room.controller ? room.controller.reservation : undefined;
    mem.my = room.controller ? room.controller.my : undefined;
    mem.owner =
        room.controller && room.controller.owner
            ? room.controller.owner.username
            : undefined;
    // RCL of ANY scouted/observed room, not just our own (needs.js already
    // has its own copy for owned rooms) - rooms/raiding.js (ROADMAP 0032
    // O4) needs this to judge how dangerous a foreign room could be.
    mem.controllerLevel = room.controller ? room.controller.level : undefined;

    const hostiles = getHostiles(room);
    mem.enemies = hostiles.length;
    if (room.controller && room.controller.my) {
        mem.defenseActive = hostiles.length > 0;
    }

    const enemyStructures = room.find(FIND_HOSTILE_STRUCTURES, {
        filter: (s) => s.structureType != STRUCTURE_POWER_BANK,
    });
    mem.enemyStructures = enemyStructures.length;
    // ROADMAP 0032 O2 - console raidRoom() targets this directly.
    mem.hasInvaderCore = enemyStructures.some(
        (s) => s.structureType === STRUCTURE_INVADER_CORE
    );

    mem.lastVisit = Game.time;

    if (!mem.builds) {
        mem.builds = {};
    }

    // One pass over Game.creeps (via census) instead of ~13 _.sum scans.
    mem.numberOfDefenders = census.count(room.name, "defender");
    mem.numberOfUpgraders = census.count(room.name, "upgrader");
    mem.numberOfBuilders = census.count(room.name, "builder");
    mem.numberOfMiners = census.count(room.name, "miner");
    mem.numberOfHaulers = census.count(room.name, "hauler");
    mem.numberOfScouts = census.total("scout"); // scouts roam - count empire-wide
    // Roles that do not exist yet - kept at 0 so downstream stats never break.
    mem.numberOfRepairers = census.count(room.name, "repairer");
    mem.numberOfWallRepairers = census.count(room.name, "wallRepairer");
    mem.numberOfTransporters = census.count(room.name, "transporter");
    mem.numberOfLogistics = census.count(room.name, "logistic");
    mem.numberOfClaimers = census.count(room.name, "claimer");

    mem.numberOfLinks = roomCache.structuresByType(
        room,
        STRUCTURE_LINK
    ).length;
    mem.numberOfContainers = roomCache.structuresByType(
        room,
        STRUCTURE_CONTAINER
    ).length;
    mem.numberOfTowers = roomCache.structuresByType(
        room,
        STRUCTURE_TOWER
    ).length;
}

module.exports = getIntel;
