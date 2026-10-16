const { takeCover, silenceAttackAlerts } = require("../utils/combat");
const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const routing = require("../utils/routing");
const nativePath = require("../utils/nativePath");
const config = require("../utils/config");
const observer = require("../utils/observer");
const names = require("../utils/names");
const mapExits = require("../utils/mapExits");

let scoutSpawnRequestedTick = -1;

// --- console: queue a controller-sign request -------------------------------
//   signRoom("W1N1", "my message", "W2N2") -> queue it from W2N2
//   signRoom("W1N1", "my message")         -> queue it
//   signRoom("W1N1")                       -> clear it
//   signQueue()                      -> print the queue
global.signRoom = function (roomName, text, fromRoomName) {
    if (!Memory.signQueue) Memory.signQueue = {};
    if (text === undefined || text === null || text === "") {
        delete Memory.signQueue[roomName];
        console.log("[sign] cleared " + roomName);
    } else {
        const message = String(text);
        if (fromRoomName) {
            Memory.signQueue[roomName] = { text: message, from: String(fromRoomName) };
        } else {
            Memory.signQueue[roomName] = message;
        }
        console.log("[sign] queued " + roomName + ": " + message);
    }
};
global.signQueue = function () {
    console.log(JSON.stringify(Memory.signQueue || {}));
};
global.scoutTrace = function (enabled) {
    if (typeof enabled === "boolean") {
        Memory.settings = Memory.settings || {};
        Memory.settings.debug = Memory.settings.debug || {};
        Memory.settings.debug.scoutTrace = enabled;
        console.log("[scoutTrace] " + (enabled ? "enabled" : "disabled"));
        return;
    }

    const scouts = Object.keys(Game.creeps)
        .map((name) => Game.creeps[name])
        .filter((creep) => creep.memory.role === "scout");
    if (scouts.length !== 1) {
        console.log("[scoutTrace] expected 1 scout, found " + scouts.length);
        return;
    }

    const creep = scouts[0];
    if (enabled === "step") {
        const step = nativePath.nextStep(creep);
        const direction = step && step.direction;
        if (direction < TOP || direction > TOP_LEFT) {
            console.log("[scoutTrace] no cached direction to probe");
            return;
        }
        const result = creep.move(direction);
        console.log("[scoutTrace] direct step direction=" + direction + " result=" + result);
        return;
    }

    const memory = creep.memory;
    console.log(JSON.stringify({
        tick: Game.time,
        name: creep.name,
        pos: creep.room.name + ":" + creep.pos.x + "," + creep.pos.y,
        fatigue: creep.fatigue,
        sign: {
            mission: memory._signMissionKey,
            phase: memory.signTravelTarget,
            since: memory.signTravelSince,
            sourceReached: memory._signSourceReached,
        },
        route: {
            moveDest: memory._move && memory._move.dest,
            realRoute: memory._realRoute,
            realRouteDest: memory._realRouteDest,
            realRouteFrom: memory._realRouteFrom,
            stack: memory._routeStack,
            stackDest: memory._routeStackDest,
            trail: memory._routeTrail,
            avoid: memory._routeAvoid,
            retreatTo: memory._routeRetreatTo,
            noPath: memory._routeNoPathTicks,
            progressKey: memory._routeProgressKey,
            progressPos: memory._routeProgressPos,
            noProgress: memory._routeNoProgressTicks,
        },
    }));
};

function pendingSignRoom() {
    const q = Memory.signQueue || {};
    for (const rn in q) return rn; // first queued room
    return null;
}

function signRequest(roomName) {
    const request = (Memory.signQueue || {})[roomName];
    if (request && typeof request === "object") {
        return { text: String(request.text || ""), from: request.from || null };
    }
    return { text: String(request || ""), from: null };
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

// --- room-flap detector: the reactive, cheap alternative to a live
// PathFinder.search (tried once, reverted - ROADMAP: cycling through a few
// dead-end candidate rooms in a row meant several fresh, uncached searches
// in a hurry, and that was enough to drain the CPU bucket). Same idea as
// utils/move.js's `m.stuck` / utils/squad.js's `stuckTicks`: just track what
// actually happened, no prediction. Only appends when the room actually
// changes (a border crossing), so this is pure bookkeeping, not a per-tick
// cost - a room stuck on the far side of a sealed pocket still enters and
// exits every few ticks (that's the bug), and each crossing pushes one
// entry. [A, B, A, B] means it's bouncing between exactly two rooms with no
// net progress; anything else (reaching a third room, or just sitting in
// one) clears itself out naturally.
function isFlapping(creep) {
    const trail = creep.memory._roomTrail || [];
    if (trail[trail.length - 1] !== creep.room.name) {
        trail.push(creep.room.name);
        if (trail.length > 4) trail.shift();
        creep.memory._roomTrail = trail;
    }
    return (
        trail.length === 4 &&
        trail[0] === trail[2] &&
        trail[1] === trail[3] &&
        trail[0] !== trail[1]
    );
}

var scout = {
    /** @param {Creep} creep **/
    run: function (creep) {
        silenceAttackAlerts(creep); // ROADMAP 0052 - entering hostile territory is routine here
        if (creep.spawning) return;
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
            const request = signRequest(signRoom);
            const sourceRoom = request.from && request.from !== signRoom ? request.from : null;
            const signMissionKey = signRoom + "|" + (sourceRoom || "") + "|" + request.text;
            if (creep.memory._signMissionKey !== signMissionKey) {
                creep.memory._signMissionKey = signMissionKey;
                delete creep.memory._move;
                delete creep.memory._routeAvoid;
                delete creep.memory._routeAvoidSeenLen;
                delete creep.memory._routeStack;
                delete creep.memory._routeStackDest;
                delete creep.memory._routeTrail;
                delete creep.memory._routeRetreatTo;
                delete creep.memory._routeNoPathTicks;
                delete creep.memory._routeProgressKey;
                delete creep.memory._routeProgressPos;
                delete creep.memory._routeNoProgressTicks;
                delete creep.memory._realRoute;
                delete creep.memory._realRouteDest;
                delete creep.memory._realRouteFrom;
                delete creep.memory._signSourceReached;
            }
            if (sourceRoom && creep.room.name === sourceRoom) {
                creep.memory._signSourceReached = true;
            }
            const travelRoom =
                sourceRoom && !creep.memory._signSourceReached ? sourceRoom : signRoom;
            if (creep.room.name !== signRoom) {
                const travelPhase = sourceRoom && !creep.memory._signSourceReached
                    ? "from:" + sourceRoom
                    : "to:" + signRoom;
                if (creep.memory.signTravelTarget !== travelPhase) {
                    // A fresh leg of the same mission must not inherit the old
                    // route/retreat/progress bookkeeping from the last room hop.
                    delete creep.memory._move;
                    delete creep.memory._routeAvoid;
                    delete creep.memory._routeAvoidSeenLen;
                    delete creep.memory._routeStack;
                    delete creep.memory._routeStackDest;
                    delete creep.memory._routeTrail;
                    delete creep.memory._routeRetreatTo;
                    delete creep.memory._routeNoPathTicks;
                    delete creep.memory._routeProgressKey;
                    delete creep.memory._routeProgressPos;
                    delete creep.memory._routeNoProgressTicks;
                    delete creep.memory._realRoute;
                    delete creep.memory._realRouteDest;
                    delete creep.memory._realRouteFrom;
                    creep.memory.signTravelTarget = travelPhase;
                    creep.memory.signTravelSince = Game.time;
                }
                // stall guard: give up on this one-off request if it never
                // gets there (e.g. the destination turned out unreachable -
                // moveToRoom now refuses it outright once blacklisted,
                // ROADMAP 0060, but that return value isn't checked here;
                // this catches it either way) instead of camping on it with
                // zero feedback for the life of the blacklist
                const travelLimit = config.get("routing.travelStallLimit", 500);
                if (Game.time - creep.memory.signTravelSince > travelLimit) {
                    delete Memory.signQueue[signRoom];
                    creep.memory.signTravelSince = undefined;
                    creep.memory.signTravelTarget = undefined;
                    console.log(
                        `[sign] ${signRoom}: gave up trying to reach ${travelRoom} - ` +
                            `run signRoom("${signRoom}", text) again if still needed`
                    );
                    return;
                }
                routing.travelToRoom(creep, travelRoom, {
                    range: 20,
                    reusePath: 30,
                });
                return;
            }
            creep.memory.signTravelSince = undefined;
            creep.memory.signTravelTarget = undefined;
            const ctrl = creep.room.controller;
            if (!ctrl) {
                delete Memory.signQueue[signRoom]; // nothing to sign here
                return;
            }
            const res = creep.signController(ctrl, request.text);
            if (res === ERR_NOT_IN_RANGE) {
                creep.moveTo(ctrl, { range: 1, reusePath: 20 });
            } else {
                // OK, or an unrecoverable error - the request is done either way
                delete Memory.signQueue[signRoom];
                delete creep.memory._signMissionKey;
                delete creep.memory._signSourceReached;
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
                creep.memory.layoutTravelSince = undefined;
                creep.memory.layoutTravelTarget = undefined;
                console.log(`[layout] ${layoutRoom}: plan ready`);
            } else if (creep.room.name !== layoutRoom) {
                creep.memory.layoutWaitSince = undefined;
                // stall guard: give up on this one-off request if it never
                // even gets there - separate from the post-arrival wait
                // guard below (that one only starts once the scout has
                // already reached layoutRoom); without this a destination
                // that turns out unreachable (moveToRoom now refuses it
                // outright once blacklisted, ROADMAP 0060) would camp here
                // with zero feedback for the life of the blacklist.
                if (creep.memory.layoutTravelTarget !== layoutRoom) {
                    creep.memory.layoutTravelTarget = layoutRoom;
                    creep.memory.layoutTravelSince = Game.time;
                }
                const travelLimit = config.get("routing.travelStallLimit", 500);
                if (Game.time - creep.memory.layoutTravelSince > travelLimit) {
                    delete Memory.layoutRequests[layoutRoom];
                    creep.memory.layoutTravelSince = undefined;
                    creep.memory.layoutTravelTarget = undefined;
                    console.log(
                        `[layout] ${layoutRoom}: gave up trying to reach it - ` +
                            `run planLayout("${layoutRoom}") again if still needed`
                    );
                    return;
                }
                routing.travelToRoom(creep, layoutRoom, { range: 20, reusePath: 30 });
                return;
            } else {
                creep.memory.layoutTravelSince = undefined;
                creep.memory.layoutTravelTarget = undefined;
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

        // room-flap guard: a sealed-off target room makes the native engine
        // walk the creep to the border and back forever (see isFlapping()
        // above) - catch that before either moveToRoom call below gets a
        // chance to send it back in.
        if (isFlapping(creep)) {
            if (creep.memory.targetRoom) blacklistRoom(creep.memory.targetRoom);
            creep.memory.targetRoom = undefined;
            creep.memory._roomTrail = [];
            return;
        }

        // stall guard: the engine won't let a creep rest on an exit tile
        // without a fresh move queued - it gets shoved back off, which can
        // happen before the next tick's script even reads the position, so
        // isFlapping()'s room-name trail above never sees a change at all
        // (see routing.isStuck's comment). Position bookkeeping catches it
        // instead - generalized (ROADMAP 0061) to also catch a creep stuck
        // wandering/frozen somewhere in the MIDDLE of a room, never at the
        // border, which isFlapping() can't see either (no room-name change
        // to catch). Own key prefix so this never collides with
        // routing.travelToRoom()'s own use of the same mechanism for the
        // sign/layout tasks above.
        if (routing.isStuck(creep, "_exploreStuck")) {
            if (creep.memory.targetRoom) blacklistRoom(creep.memory.targetRoom);
            creep.memory.targetRoom = undefined;
            creep.memory._roomTrail = [];
            if (!routing.nudgeAwayFromBorder(creep)) delete creep.memory._move;
            return;
        }

        // --- exploration: visit the least-recently-seen adjacent room ---
        // Routed via utils/routing.moveToRoom, same helper the sign/layout
        // tasks above use - it hands cross-room pathing to the native
        // engine, which actually knows how to walk a creep across a room
        // border (a hand-rolled border-tile moveTo here doesn't: see
        // spec.md for the bug that caused).
        if (creep.memory.targetRoom && creep.memory.targetRoom != creep.room.name) {
            // ROADMAP 0075: realRoute defaulted on for every other
            // moveToRoom() caller, but this one is exploration with no
            // fixed destination - always a direct neighbor (see the
            // "exploration" block below), re-picked every time this room
            // is reached. Validating terrain for a room that's already
            // adjacent buys nothing and would pay computeRealRoute's cost
            // on every single hop of a scout's endless wandering.
            const status = routing.travelToRoom(creep, creep.memory.targetRoom, {
                range: 20,
                reusePath: 20,
                realRoute: false,
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
            const exits = mapExits.known(creep.room.name) || {};
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
            // ROADMAP 0075 - see the other free-roam moveToRoom() call
            // above for why this one opts out of the new default.
            const status = routing.travelToRoom(creep, targetRoom, {
                range: 20,
                reusePath: 20,
                realRoute: false,
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
        const signRoom = pendingSignRoom();
        if (signRoom) {
            const request = signRequest(signRoom);
            if (request.from && request.from !== signRoom && room.name !== request.from) {
                return false;
            }
        }
        if (census.total("scout", 0) > 0) return false;
        if (scoutSpawnRequestedTick === Game.time) return false;
        const alreadySpawning = _.some(
            Game.spawns,
            (s) =>
                s.spawning &&
                Memory.creeps &&
                Memory.creeps[s.spawning.name] &&
                Memory.creeps[s.spawning.name].role === "scout"
        );
        if (alreadySpawning) return false;
        scoutSpawnRequestedTick = Game.time;
        return true;
    },

    spawnData: function (room) {
        return {
            name: names.generate("scout"),
            body: [MOVE, MOVE],
            memory: { role: "scout", home: room.name },
        };
    },

    // exposed for smoke.js - the room-flap detector is otherwise only
    // reachable indirectly through run()
    isFlapping: isFlapping,
};

module.exports = scout;
