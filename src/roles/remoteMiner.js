// Like the local miner (sits on a source, harvests), but works a source in a
// reserved remote room instead of the home room. No architect() runs in a
// remote room (it's not ours), so this role builds/repairs its own container
// directly, and there's no link/tower to feed there - the remoteHauler just
// drains the container. Travel uses utils/routing.moveToRoom() with the same
// mine-or-reserved-only restriction remoteHauler.js applies (ROADMAP 0075 -
// see its own comment for why: upfront terrain validation + retreat/
// backtrack instead of a raw moveTo() that could park on ERR_NO_PATH
// forever). A hostile in the remote sends it home empty-handed rather than
// fighting (ROADMAP 0020).

const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const remotes = require("../rooms/remotes");
const routing = require("../utils/routing");
const names = require("../utils/names");

function body(room) {
    if (room.energyCapacityAvailable < 550) return [MOVE, WORK, WORK];
    return [MOVE, WORK, WORK, WORK, WORK, WORK];
}

// A source in `targetRoom` (already visible) with no live remoteMiner
// assigned to it yet.
function openSource(targetRoom, targetRoomName) {
    const taken = {};
    for (const c of census.all("remoteMiner")) {
        if (c.memory.targetRoom === targetRoomName && c.memory.source) {
            taken[c.memory.source] = true;
        }
    }
    return targetRoom.find(FIND_SOURCES).find((s) => !taken[s.id]) || null;
}

var remoteMiner = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const home = creep.memory.home;
        const targetRoomName = creep.memory.targetRoom;
        if (!targetRoomName) {
            creep.suicide();
            return;
        }

        // hostile in the remote - recall home rather than fight or die idle
        if (
            creep.room.name === targetRoomName &&
            remotes.hasHostiles(targetRoomName)
        ) {
            routing.moveToRoom(creep, home, {
                range: 20,
                reusePath: 30,
                allowRoom: remotes.allowRoom(home),
            });
            return;
        }

        if (creep.room.name !== targetRoomName) {
            routing.moveToRoom(creep, targetRoomName, {
                range: 20,
                reusePath: 30,
                allowRoom: remotes.allowRoom(targetRoomName),
            });
            return;
        }

        if (!creep.memory.source) {
            const source = openSource(creep.room, targetRoomName);
            if (!source) return; // every source here is already covered
            creep.memory.source = source.id;
        }
        const source = Game.getObjectById(creep.memory.source);
        if (!source) {
            creep.memory.source = undefined;
            return;
        }

        // build/maintain its own container - no architect() in a room that
        // isn't ours
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER,
            })[0];
            const site = source.pos.findInRange(
                FIND_MY_CONSTRUCTION_SITES,
                1,
                { filter: (s) => s.structureType === STRUCTURE_CONTAINER }
            )[0];

            if (site) {
                creep.build(site);
            } else if (!container) {
                source.pos.createConstructionSite(STRUCTURE_CONTAINER);
            } else if (container.hits < container.hitsMax) {
                creep.repair(container);
            }
        }

        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { range: 1, reusePath: 5 });
        }
    },

    // rough headcount for the population heuristic - see rooms/needs.js
    wanted: function (room) {
        return roomNeeds(room).remoteMiner;
    },

    spawn: function (room) {
        return census.count(room.name, "remoteMiner", 0) < this.wanted(room);
    },

    spawnData: function (room) {
        const active = remotes.active(room);
        const roomMiners = census.creepsByRole(room.name, "remoteMiner");

        let target = null;
        for (const name of active) {
            const n = (Memory.rooms[name] && Memory.rooms[name].sourceNumber) || 0;
            const covered = roomMiners.filter(
                (c) => c.memory.targetRoom === name
            ).length;
            if (covered < n) {
                target = name;
                break;
            }
        }
        if (!target) target = active[0] || null;

        return {
            name: names.generate("remoteMiner"),
            body: body(room),
            memory: { role: "remoteMiner", home: room.name, targetRoom: target },
        };
    },
};

module.exports = remoteMiner;
