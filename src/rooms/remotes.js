// Which neighboring rooms are worth remote-mining, and the console surface
// (reserveRoom / unreserveRoom / claimRoom) to manage them. This module is
// the single place that decides room-level eligibility/safety - roles only
// execute the missions it hands out (constitution §6).
//
// A remote only ever gets miners/haulers once it's actually RESERVED by us
// (not merely listed as a candidate) - reservation is a prerequisite for
// mining, not a parallel goal.

const config = require("../utils/config");
const mapExits = require("../utils/mapExits");
const observerUtil = require("../utils/observer");
const claimDiagnostics = require("../utils/claimDiagnostics");
const { isAlly } = require("../utils/hostiles");
// Tunables (defaults + Memory.settings override path) live in utils/config:
// remotes.reserveHealthyTicks, remotes.maxDistance, remotes.maxPerRoom.

// Any owned room tells us our own username - cached forever, it never
// changes for the life of the bot account.
let cachedUsername = null;
function myUsername() {
    if (cachedUsername) return cachedUsername;
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (room.controller && room.controller.my && room.controller.owner) {
            cachedUsername = room.controller.owner.username;
            break;
        }
    }
    return cachedUsername;
}

function isMine(roomName) {
    const mem = Memory.rooms[roomName];
    return !!(mem && mem.my === true);
}

function isReservedByMe(roomName) {
    const mem = Memory.rooms[roomName];
    const reservation = mem && mem.reservation;
    return !!(reservation && reservation.username === myUsername());
}

// True when a hostile has been seen in `roomName` - either right now, or the
// last time we had visibility there (no fresher intel without a creep/room
// back in view, so treat stale "yes" conservatively and stale "no" as fine).
function hasHostiles(roomName) {
    const mem = Memory.rooms[roomName];
    return !!(mem && mem.enemies > 0);
}

// True when `roomName` is owned by someone else's empire - regardless of
// whether a hostile CREEP has ever been seen there (ROADMAP 0064 live
// follow-up: a claimer walked straight into an enemy-owned room because
// hasHostiles() above only tracks creep presence, never ownership - the
// room's own walls/ramparts, already built, blocked it just the same, with
// zero creeps required to do that). An ally's room is deliberately exempt
// here (utils/hostiles.isAlly) - that's the SAME judgment call routing
// already makes for actual hostile creeps, and an ally's own interior
// obstacles are a different, narrower problem (ROADMAP 0061's live
// incident - see utils/routing.js's routeCostCallback for the terrain-slack
// side of that one).
function isForeignOwned(roomName) {
    const mem = Memory.rooms[roomName];
    const owner = mem && mem.owner;
    const ownerName =
        owner && typeof owner === "object" ? owner.username : owner;
    return !!(ownerName && ownerName !== myUsername() && !isAlly(ownerName));
}

function isAllyOwned(roomName) {
    const mem = Memory.rooms[roomName];
    const owner = mem && mem.owner;
    const ownerName = owner && typeof owner === "object" ? owner.username : owner;
    return !!(ownerName && isAlly(ownerName));
}

// Room-to-room hop count (not path length) - cheap and cached per tick, used
// only to cap how far a remote is allowed to be.
let routeTick = -1;
let routeCache = {};
function roomDistance(fromRoomName, toRoomName) {
    if (routeTick !== Game.time) {
        routeTick = Game.time;
        routeCache = {};
    }
    const key = fromRoomName + ":" + toRoomName;
    if (routeCache[key] !== undefined) return routeCache[key];

    const route = Game.map.findRoute(fromRoomName, toRoomName);
    const dist = route === ERR_NO_PATH || !route ? Infinity : route.length;
    routeCache[key] = dist;
    return dist;
}

// The closest owned room to `targetRoomName` - where a reserveRoom/claimRoom
// request with no explicit mother room defaults to.
function nearestOwnedRoom(targetRoomName) {
    let best = null;
    let bestDist = Infinity;
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        const dist = roomDistance(name, targetRoomName);
        if (dist < bestDist) {
            bestDist = dist;
            best = name;
        }
    }
    return best;
}

// Candidate neighboring rooms for `room` to remote-mine: scouted, not owned
// by someone else, has at least one source, within the distance cap, and
// under the per-mother-room count cap (existing remotes are never bumped by
// the cap - only new candidates are).
function eligible(room) {
    const mem = Memory.rooms[room.name];
    const exits = mapExits.known(room.name) || {};
    const already = (mem && mem.remotes) || [];
    const results = [];

    for (const direction in exits) {
        const name = exits[direction];
        const nmem = Memory.rooms[name];
        if (!nmem || !nmem.lastVisit) continue; // never scouted
        if (nmem.my) continue; // already ours - not a "remote"
        if (nmem.owner && nmem.owner !== myUsername()) continue; // someone else's
        if (!nmem.sourceNumber) continue; // no sources worth the trip
        // Source Keeper detection isn't tracked by intel yet - out of scope,
        // see 0020 spec's "Out of scope".
        if (roomDistance(room.name, name) > config.get("remotes.maxDistance", 2)) {
            continue;
        }
        if (
            already.indexOf(name) === -1 &&
            already.length >= config.get("remotes.maxPerRoom", 2)
        ) {
            continue;
        }
        results.push(name);
    }
    return results;
}

// The subset of Memory.rooms[room.name].remotes that's actually reserved by
// us and currently safe - only these count for roomNeeds' remoteMiner /
// remoteHauler demand. Home under attack pulls everyone back regardless.
function active(room) {
    const mem = Memory.rooms[room.name];
    if (mem && mem.defenseActive) return [];

    const remoteList = (mem && mem.remotes) || [];
    return remoteList.filter(
        (name) => !hasHostiles(name) && isReservedByMe(name)
    );
}

// Remotes that need a reserver dispatched: listed, safe, and either not
// reserved by us yet or running low.
function pendingReserves(room) {
    const mem = Memory.rooms[room.name];
    const remoteList = (mem && mem.remotes) || [];
    return remoteList.filter((name) => {
        if (hasHostiles(name)) return false;
        const rmem = Memory.rooms[name];
        const reservation = rmem && rmem.reservation;
        if (!reservation || reservation.username !== myUsername()) return true;
        return (
            (reservation.ticksToEnd || 0) <
            config.get("remotes.reserveHealthyTicks", 3000)
        );
    });
}

// costCallback for native Creep.moveTo() / PathFinder.search(): every room
// that isn't mine or reserved by me is impassable, EXCEPT `allowRoomName`
// (a creep's own mission target - reserving/claiming it is the whole point,
// so it can't be reserved-by-me yet). This is what keeps remote traffic
// confined to owned/reserved territory end to end, not just at the
// eligibility stage.
function roomCallback(allowRoomName) {
    return function (roomName, matrix) {
        if (roomName === allowRoomName) return matrix;
        if (isMine(roomName) || isReservedByMe(roomName)) return matrix;
        return false;
    };
}

// ROADMAP 0075: the same rule as roomCallback() above (never cross a room
// that isn't mine, reserved by me, or the trip's own destination), but as a
// plain boolean predicate instead of a PathFinder-shaped costCallback - the
// shape utils/routing.moveToRoom()'s opts.allowRoom expects, so
// remoteHauler/remoteMiner can route through the shared retreat/backtrack +
// upfront real-terrain validation every other multi-room role already gets,
// while keeping the exact same "stay in owned/reserved territory" guarantee
// they always had.
function allowRoom(destRoomName) {
    return (roomName) =>
        roomName === destRoomName || isMine(roomName) || isReservedByMe(roomName);
}

// --- console -------------------------------------------------------------
//   reserveRoom("W2N5")            -> mother = nearest owned room
//   reserveRoom("W2N5", "W1N1")    -> explicit mother room
//   unreserveRoom("W2N5")          -> drop it, creeps recall next roomNeeds
//   claimRoom("W2N5")              -> dispatch a claimer (1 at a time, empire-wide)
global.reserveRoom = function (targetRoomName, motherRoomName) {
    const tmem = Memory.rooms[targetRoomName];
    if (!tmem || !tmem.lastVisit) {
        console.log(
            `[remotes] ${targetRoomName} hasn't been scouted yet - can't reserve it`
        );
        return;
    }
    if (tmem.my || (tmem.owner && tmem.owner !== myUsername())) {
        console.log(`[remotes] ${targetRoomName} is already owned - not eligible`);
        return;
    }

    const mother = motherRoomName || nearestOwnedRoom(targetRoomName);
    if (!mother) {
        console.log(`[remotes] no owned room found to reserve ${targetRoomName} from`);
        return;
    }
    const mmem = Memory.rooms[mother] || (Memory.rooms[mother] = {});
    if (!mmem.remotes) mmem.remotes = [];
    if (mmem.remotes.indexOf(targetRoomName) === -1) {
        mmem.remotes.push(targetRoomName);
    }
    console.log(`[remotes] ${mother} will reserve/mine ${targetRoomName}`);
};

global.unreserveRoom = function (targetRoomName) {
    let found = false;
    for (const name in Memory.rooms) {
        const mem = Memory.rooms[name];
        if (!mem || !mem.remotes) continue;
        const i = mem.remotes.indexOf(targetRoomName);
        if (i !== -1) {
            mem.remotes.splice(i, 1);
            found = true;
        }
    }
    console.log(
        found
            ? `[remotes] ${targetRoomName} dropped - creeps recall home`
            : `[remotes] ${targetRoomName} wasn't listed anywhere`
    );
};

function clearPendingClaimCheck(roomName) {
    const pending = Memory.claimCheck;
    if (!pending || (roomName && pending.room !== roomName)) return;
    const requests = Memory.observeRequests;
    if (requests && requests[pending.room] === pending.observeUntil) {
        if (pending.previousObserveUntil && pending.previousObserveUntil > Game.time) {
            requests[pending.room] = pending.previousObserveUntil;
        } else {
            delete requests[pending.room];
        }
    }
    delete Memory.claimCheck;
}

function processPendingClaimCheck() {
    const pending = Memory.claimCheck;
    if (!pending) return;
    if (!pending.room) {
        clearPendingClaimCheck();
        console.log("[remotes] invalid ownership check cleared; no claim was sent");
        return;
    }
    const room = Game.rooms && Game.rooms[pending.room];
    if (!room && (!pending.expiresAt || Game.time >= pending.expiresAt)) {
        const expiredRoom = pending.room;
        clearPendingClaimCheck(expiredRoom);
        console.log("[remotes] ownership check for " + expiredRoom + " expired; no claim was sent");
        return;
    }
    if (!room) return;
    const targetRoomName = pending.room;
    const motherRoomName = pending.from;
    clearPendingClaimCheck(targetRoomName);
    console.log("[remotes] fresh vision received for " + targetRoomName + "; validating current controller");
    global.claimRoom(targetRoomName, motherRoomName);
}

global.claimRoom = function (targetRoomName, motherRoomName) {
    if (Memory.claimTarget) {
        console.log(
            "[remotes] a claim is already pending: " + Memory.claimTarget.room +
                " (from " + Memory.claimTarget.from + ")"
        );
        return;
    }
    if (Memory.claimCheck && Memory.claimCheck.room !== targetRoomName) {
        console.log(
            "[remotes] ownership check is already pending for " + Memory.claimCheck.room +
                "; finish or cancel it before checking " + targetRoomName
        );
        return;
    }

    const targetStatus = Game.map.getRoomStatus && Game.map.getRoomStatus(targetRoomName);
    if (targetStatus && targetStatus.status !== "normal") {
        console.log(
            "[remotes] " + targetRoomName + " is not available to claim (status: " +
                targetStatus.status + " - novice/respawn zone protection, or out of bounds)"
        );
        return;
    }

    const visibleRoom = Game.rooms && Game.rooms[targetRoomName];
    if (!visibleRoom) {
        if (Memory.claimCheck) {
            console.log("[remotes] still waiting for current vision of " + targetRoomName + "; no claimer was sent");
            return;
        }
        const obs = observerUtil.observerFor(targetRoomName);
        if (!obs) {
            console.log(
                "[remotes] " + targetRoomName + " has no current vision and no Observer in range; " +
                    "ownership cannot be verified, so no claim was sent"
            );
            return;
        }
        const expiresAt = Game.time + 10;
        Memory.observeRequests = Memory.observeRequests || {};
        const previousObserveUntil = Memory.observeRequests[targetRoomName] || null;
        const observeUntil = Math.max(previousObserveUntil || 0, expiresAt);
        Memory.observeRequests[targetRoomName] = observeUntil;
        Memory.claimCheck = {
            room: targetRoomName,
            from: motherRoomName || null,
            requestedAt: Game.time,
            expiresAt,
            observeUntil,
            previousObserveUntil,
        };
        console.log(
            "[remotes] " + targetRoomName + " is not visible; Observer in " + obs.room.name +
                " will check its current owner before any claimer is dispatched"
        );
        return;
    }

    clearPendingClaimCheck(targetRoomName);
    const controller = visibleRoom.controller;
    Memory.rooms = Memory.rooms || {};
    const currentIntel = Memory.rooms[targetRoomName] ||
        (Memory.rooms[targetRoomName] = {});
    currentIntel.lastVisit = Game.time;
    currentIntel.hasController = !!controller;
    currentIntel.my = !!(controller && controller.my);
    if (controller && controller.owner && controller.owner.username) {
        currentIntel.owner = controller.owner.username;
    } else {
        delete currentIntel.owner;
    }
    if (!controller) {
        console.log(
            "[remotes] " + targetRoomName + " has no controller to claim (highway/Source Keeper/center room)"
        );
        return;
    }
    if (controller.my) {
        console.log("[remotes] " + targetRoomName + " is already mine");
        return;
    }
    const currentOwner = controller.owner && controller.owner.username;
    if (currentOwner && currentOwner !== myUsername()) {
        console.log("[remotes] " + targetRoomName + " is currently owned by " + currentOwner + "; cannot claim it");
        return;
    }

    const mother = motherRoomName || nearestOwnedRoom(targetRoomName);
    if (!mother) {
        console.log("[remotes] no owned room found to claim " + targetRoomName + " from");
        return;
    }

    // A creep with any CLAIM part is capped at CREEP_CLAIM_LIFE_TIME (600
    // ticks total), not the usual 1500 - no body/boost changes that. If the
    // trip alone would eat through the budget (with a safety margin), the
    // claimer is guaranteed to die before ever reaching the controller;
    // refuse instead of wasting the spawn. Room-hop count is a rough,
    // cheap stand-in for exact travel time (roomDistance is already
    // cached per tick) - it does not know the safe-routing detours
    // utils/routing.js highway/hostile preferences might add, so this is
    // deliberately conservative, not a precise ETA.
    const hops = roomDistance(mother, targetRoomName);
    const estimatedTicks = hops * config.get("claim.ticksPerRoomHop", 50);
    const margin = config.get("claim.travelMargin", 10);
    const budget = CREEP_CLAIM_LIFE_TIME - margin;
    if (estimatedTicks > budget) {
        console.log(
            "[remotes] " + targetRoomName + " is too far from " + mother +
                " to claim safely (~" + estimatedTicks + " ticks estimated travel, " + budget +
                " available after a " + margin + "-tick safety margin out of " +
                CREEP_CLAIM_LIFE_TIME + " total CLAIM lifetime) - pick a closer mother room"
        );
        return;
    }

    const ownedRooms = _.filter(
        Game.rooms,
        (r) => r.controller && r.controller.my
    ).length;
    if (Game.gcl.level <= ownedRooms) {
        console.log(
            "[remotes] warning: GCL " + Game.gcl.level + " may not cover another room (" +
                ownedRooms + " owned already) - dispatching anyway, claimController will fail if not"
        );
    }

    Memory.claimTarget = { room: targetRoomName, from: mother };
    console.log("[remotes] " + mother + " will claim " + targetRoomName);
};

// Drops a pending claim order. Mirrors cancelContest() (rooms/raiding.js,
// ROADMAP 0046): only clears Memory.claimTarget so rooms/needs.js stops
// spawning a replacement - a claimer already in flight isn't recalled, it
// finishes its own run() (reach the controller, or hit a dead end and
// suicide) same as always.
global.cancelClaim = function () {
    let cancelled = false;
    if (Memory.claimTarget) {
        claimDiagnostics.cancel(Memory.claimTarget);
        console.log("[remotes] claim on " + Memory.claimTarget.room + " cancelled");
        delete Memory.claimTarget;
        cancelled = true;
    }
    if (Memory.claimCheck) {
        const roomName = Memory.claimCheck.room;
        clearPendingClaimCheck(roomName);
        console.log("[remotes] ownership check for " + roomName + " cancelled");
        cancelled = true;
    }
    if (!cancelled) console.log("[remotes] no claim pending");
};

global.claimStatus = function () {
    const result = claimDiagnostics.status();
    console.log(`[claimStatus] ${JSON.stringify(result)}`);
    return result;
};

module.exports = {
    myUsername,
    isMine,
    isReservedByMe,
    hasHostiles,
    isForeignOwned,
    isAllyOwned,
    roomDistance,
    nearestOwnedRoom,
    eligible,
    active,
    pendingReserves,
    roomCallback,
    allowRoom,
    processPendingClaimCheck,
};
