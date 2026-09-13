const { takeCover, silenceAttackAlerts } = require("../utils/combat");
const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const routing = require("../utils/routing");
const config = require("../utils/config");
const observer = require("../utils/observer");
const names = require("../utils/names");

// --- console: queue a controller-sign request -------------------------------
//   signRoom("W1N1", "my message")   -> queue it
//   signRoom("W1N1")                 -> clear it
//   signQueue()                      -> print the queue
global.signRoom = function (roomName, text) {
    if (!Memory.signQueue) Memory.signQueue = {};
    if (text === undefined || text === null || text === "") {
        delete Memory.signQueue[roomName];
        console.log("[sign] cleared " + roomName);
    } else {
        Memory.signQueue[roomName] = String(text);
        console.log("[sign] queued " + roomName + ": " + Memory.signQueue[roomName]);
    }
};
global.signQueue = function () {
    console.log(JSON.stringify(Memory.signQueue || {}));
};

function pendingSignRoom() {
    const q = Memory.signQueue || {};
    for (const rn in q) return rn; // first queued room
    return null;
}

// --- console: queue a base-layout preview -----------------------------
//   planLayout("W1N1")   -> preview the layout once the room has vision
//   cancelLayout("W1N1") -> drop a pending/in-progress request
//   layoutQueue()        -> print the queue
// The actual planning (rooms/architect.js, preview mode) runs from main.js
// every tick the room has vision. Vision comes from an observer in range
// when there is one (structures/observer.js, ROADMAP 0028 - no travel, no
// risk); otherwise the scout is dispatched to go park there.
global.planLayout = function (roomName) {
    if (!Memory.layoutRequests) Memory.layoutRequests = {};
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (mem && mem.my) {
        console.log(`[layout] ${roomName} is already ours - use replanRoom() instead`);
        return;
    }
    Memory.layoutRequests[roomName] = true;
    const obs = observer.observerFor(roomName);
    console.log(
        obs
            ? `[layout] ${roomName} queued - observer in ${obs.room.name} will preview the base layout`
            : `[layout] ${roomName} queued - scout dispatched to preview the base layout`
    );
};
global.cancelLayout = function (roomName) {
    if (Memory.layoutRequests) delete Memory.layoutRequests[roomName];
    console.log(`[layout] ${roomName} cancelled`);
};
global.layoutQueue = function () {
    console.log(JSON.stringify(Memory.layoutRequests || {}));
};

function pendingLayoutRoom() {
    const q = Memory.layoutRequests || {};
    // skip anything an observer already has covered - structures/observer.js
    // handles those without ever needing a creep there
    for (const rn in q) if (!observer.observerFor(rn)) return rn;
    return null;
}

// --- exploration blacklist: a room the scout couldn't path to (ROADMAP
// 0009) - without this the reselection below just picks the same
// never-visited/unreachable room again next tick, forever. -----------------
function isBlacklisted(roomName) {
    const mem = Memory.rooms[roomName];
    return !!(mem && mem.scoutBlacklistUntil && mem.scoutBlacklistUntil > Game.time);
}
function blacklistRoom(roomName) {
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    Memory.rooms[roomName].scoutBlacklistUntil =
        Game.time + config.get("scout.blacklistTicks", 5000);
}

var scout = {
    /** @param {Creep} creep **/
    run: function (creep) {
        silenceAttackAlerts(creep); // ROADMAP 0052 - entering hostile territory is routine here
        if (takeCover(creep)) return;

        // enforce a single scout empire-wide - extras retire themselves
        const scouts = census.all("scout");
        if (scouts.length > 1) {
            const keep = _.sortBy(scouts, (c) => c.name)[0];
            if (keep.id !== creep.id) {
                creep.suicide();
                return;
            }
        }

        if (!Memory.rooms[creep.room.name]) {
            Memory.rooms[creep.room.name] = {};
        }

        // --- controller-sign task takes priority over exploration ---
        // Heading somewhere specific (not exploring) - route through
        // highway rooms and steer around known hostiles where possible.
        const signRoom = pendingSignRoom();
        if (signRoom) {
            if (creep.room.name !== signRoom) {
                routing.moveToRoom(creep, signRoom, { range: 20, reusePath: 30 });
                return;
            }
            const ctrl = creep.room.controller;
            if (!ctrl) {
                delete Memory.signQueue[signRoom]; // nothing to sign here
                return;
            }
            const res = creep.signController(ctrl, Memory.signQueue[signRoom]);
            if (res === ERR_NOT_IN_RANGE) {
                creep.moveTo(ctrl, { range: 1, reusePath: 20 });
            } else {
                // OK, or an unrecoverable error - the request is done either way
                delete Memory.signQueue[signRoom];
            }
            return;
        }

        // --- layout-preview task: also a specific destination, same
        // highway/hostile-aware routing. Park in the room (giving vision)
        // until architect's preview plan finishes (Memory.rooms[x].planned)
        // - main.js drives the actual planning every tick we're there.
        const layoutRoom = pendingLayoutRoom();
        if (layoutRoom) {
            const lmem = Memory.rooms[layoutRoom];
            if (lmem && lmem.planned) {
                delete Memory.layoutRequests[layoutRoom];
                creep.memory.layoutWaitSince = undefined;
                console.log(`[layout] ${layoutRoom}: plan ready`);
            } else if (creep.room.name !== layoutRoom) {
                creep.memory.layoutWaitSince = undefined;
                routing.moveToRoom(creep, layoutRoom, { range: 20, reusePath: 30 });
                return;
            } else {
                // stall guard: give up if the plan never finishes (e.g. CPU
                // bucket chronically below planner.minBucket) instead of
                // camping here forever - planLayout() can be re-issued later
                if (!creep.memory.layoutWaitSince) {
                    creep.memory.layoutWaitSince = Game.time;
                }
                const waitLimit = config.get("routing.layoutWaitLimit", 500);
                if (Game.time - creep.memory.layoutWaitSince > waitLimit) {
                    delete Memory.layoutRequests[layoutRoom];
                    creep.memory.layoutWaitSince = undefined;
                    console.log(
                        `[layout] ${layoutRoom}: gave up waiting for the plan to finish ` +
                            `- run planLayout("${layoutRoom}") again if still needed`
                    );
                }
                return;
            }
        }

        // --- an observer takes over exploration once one exists (see
        // rooms/needs.js, which stops spawning scouts for it too) - this
        // scout was only spawned for an on-demand task above, or is a
        // leftover from before the observer was built. Retire instead of
        // wandering. ---
        if (observer.hasAnyObserver()) {
            creep.suicide();
            return;
        }

        // --- exploration: visit the least-recently-seen adjacent room ---
        // Routed via utils/routing.moveToRoom, same helper the sign/layout
        // tasks above use - it hands cross-room pathing to the native
        // engine, which actually knows how to walk a creep across a room
        // border (a hand-rolled border-tile moveTo here doesn't: see
        // spec.md for the bug that caused).
        if (creep.memory.targetRoom && creep.memory.targetRoom != creep.room.name) {
            const status = routing.moveToRoom(creep, creep.memory.targetRoom, {
                range: 20,
                reusePath: 20,
            });
            if (status === OK || status === ERR_TIRED) {
                return true;
            }

            if (status === ERR_NO_PATH || status === ERR_INVALID_TARGET) {
                blacklistRoom(creep.memory.targetRoom);
                creep.memory.targetRoom = undefined;
            }
            return;
        }

        if (!creep.memory.targetRoom || creep.memory.targetRoom == creep.room.name) {
            const exits = Memory.rooms[creep.room.name].exits || {};
            const cameFrom = creep.memory.cameFrom;
            let minLastVisit = Infinity;
            let targetRoom = null;

            // never immediately backtrack into the room we just left - with
            // only "least-recently-visited" as the rule, a dead-end room
            // (single exit, straight back the way we came) would ping-pong
            // forever: visiting either side keeps refreshing its lastVisit,
            // so it always looks like the freshest option to leave FROM,
            // never the staler one to avoid.
            for (const roomName of Object.values(exits)) {
                if (isBlacklisted(roomName) || roomName === cameFrom) continue;

                if (
                    !Memory.rooms[roomName] ||
                    !Memory.rooms[roomName].lastVisit
                ) {
                    targetRoom = roomName;
                    break;
                }

                const lastVisit = Memory.rooms[roomName].lastVisit;
                if (lastVisit < minLastVisit) {
                    minLastVisit = lastVisit;
                    targetRoom = roomName;
                }
            }

            if (!targetRoom && cameFrom && !isBlacklisted(cameFrom)) {
                // nothing new reachable from here - this room is a dead end
                // (or everything else is blacklisted). Retreat the way we
                // came, but blacklist this room first so the hub we're
                // retreating to doesn't just send us straight back here.
                blacklistRoom(creep.room.name);
                targetRoom = cameFrom;
            }

            if (!targetRoom) return;

            creep.memory.cameFrom = creep.room.name;
            creep.memory.targetRoom = targetRoom;
            const status = routing.moveToRoom(creep, targetRoom, {
                range: 20,
                reusePath: 20,
            });
            if (status === ERR_NO_PATH || status === ERR_INVALID_TARGET) {
                blacklistRoom(targetRoom);
                creep.memory.targetRoom = undefined;
            }
        }
    },

    // the number of scouts this room should have - see rooms/needs.js
    wanted: function (room) {
        return roomNeeds(room).scout;
    },

    // one scout, empire-wide
    spawn: function (room) {
        if (this.wanted(room) === 0) return false;
        if (census.total("scout", 0) > 0) return false;
        const alreadySpawning = _.some(
            Game.spawns,
            (s) => s.spawning && s.spawning.name.indexOf("Scout") === 0
        );
        return !alreadySpawning;
    },

    spawnData: function (room) {
        return {
            name: names.generate("scout"),
            body: [MOVE, MOVE],
            memory: { role: "scout", home: room.name },
        };
    },
};

module.exports = scout;
