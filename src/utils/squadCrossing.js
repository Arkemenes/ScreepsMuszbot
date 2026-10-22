// Shared room crossing: tactical slots only make sense once everyone is inside.
const config = require("./config");
const combat = require("./combat");
const routing = require("./routing");

function position(p, room) {
    return new RoomPosition(p.x, p.y, room);
}

function interior(p, inset) {
    return p.x >= inset && p.x <= 49 - inset && p.y >= inset && p.y <= 49 - inset;
}

function clearMovement(creep) {
    delete creep.memory._move;
    delete creep.memory._m;
}

function matrix(roomName, crossing, doorwayOnly) {
    if (roomName !== crossing.from && roomName !== crossing.to) return false;
    const room = Game.rooms[roomName];
    const costs = room ? combat.blockingMatrix(room).clone() : new PathFinder.CostMatrix();
    if (doorwayOnly) {
        const door = roomName === crossing.from ? crossing.exit : crossing.door;
        // Keep the chosen pair of exit tiles; every other border stays blocked.
        for (let i = 0; i < 50; i++) {
            for (const [x, y] of [[0, i], [49, i], [i, 0], [i, 49]]) {
                if (!door || x !== door.x || y !== door.y) costs.set(x, y, 255);
            }
        }
    }
    return costs;
}

function plan(crossing, leader, members) {
    const result = PathFinder.search(leader.pos,
        { pos: new RoomPosition(25, 25, crossing.to), range: 20 }, {
            maxRooms: 2, maxOps: config.get("squad.crossingMaxOps", 20000),
            plainCost: 2, swampCost: 10,
            roomCallback: (rn) => matrix(rn, crossing, false),
        });
    if (result.incomplete || !result.path.length) return false;
    const path = result.path;
    if (crossing.from === crossing.to) {
        const entry = path.find((p) => interior(p, 4));
        if (!entry) return false;
        crossing.entry = { x: entry.x, y: entry.y };
        crossing.phase = "cross";
        for (const c of members) clearMovement(c);
        return true;
    }
    const first = path.findIndex((p) => p.roomName === crossing.to);
    if (first <= 0) return false;
    const exit = path[first - 1];
    const door = path[first];
    const gather = path.slice(0, first).reverse().find((p) => interior(p, 2));
    const entry = path.slice(first).find((p) => interior(p, 4));
    if (!entry || interior(exit, 1) || interior(door, 1)) return false;
    crossing.exit = { x: exit.x, y: exit.y };
    crossing.door = { x: door.x, y: door.y };
    // A leader already at the exit may have no earlier interior step in path.
    crossing.gather = gather ? { x: gather.x, y: gather.y } : {
        x: leader.pos.x, y: leader.pos.y,
    };
    crossing.entry = { x: entry.x, y: entry.y };
    crossing.phase = members.some((c) => c.room.name === crossing.to) || !interior(leader.pos, 1)
        ? "cross" : "gather";

    // A complete, structure-aware passage disproves the old squad-induced
    // origin blacklist. Never clear unrelated rooms or other creeps' state.
    if (members.some((c) => (c.memory._routeAvoid || []).includes(crossing.from))) {
        if (Memory.rooms[crossing.from]) delete Memory.rooms[crossing.from].routeDeadEndUntil;
        for (const c of members) {
            if (c.memory._routeAvoid) c.memory._routeAvoid = c.memory._routeAvoid.filter((rn) => rn !== crossing.from);
            for (const key of ["_routeNoPathTicks", "_routeNoProgressTicks", "_routeProgressKey",
                "_routeProgressPos", "_routeRetreatTo", "_routeTrail", "_realRoute",
                "_realRouteFrom", "_realRouteDest", "_routeStackDest", "_routeStack"]) delete c.memory[key];
        }
    }
    for (const c of members) clearMovement(c);
    return true;
}

function begin(squad, leader, members) {
    let from = leader.room.name;
    let to;
    if (from === squad.target.room) {
        // Hot adoption: the leader got in first, before this phase existed.
        const behind = members.filter((c) => c.room.name !== from);
        if (!behind.length) {
            if (members.every((c) => interior(c.pos, 1))) return null;
            to = from; // recover an old squad whose last member is still on the border
        } else {
            const adjacent = behind.find((c) => {
                const route = Game.map.findRoute(c.room.name, from);
                return Array.isArray(route) && route.length === 1;
            });
            if (!adjacent) return null;
            to = from;
            from = adjacent.room.name;
        }
    } else {
        const route = Game.map.findRoute(from, squad.target.room);
        // Keep a bounded pending phase even when the room graph has no route.
        to = Array.isArray(route) && route.length ? route[0].room : squad.target.room;
    }
    const crossing = {
        from, to, destination: squad.target.room, phase: "plan",
        started: Game.time, lastProgress: Game.time,
    };
    // Plan from a member still outside if the leader has already entered.
    const origin = members.find((c) => c.room.name === from);
    if (origin) plan(crossing, origin.id === leader.id ? leader : origin, members);
    crossing.retryAt = Game.time + config.get("squad.crossingRetryTicks", 10);
    for (const c of members) clearMovement(c);
    return crossing;
}

// Returns true when this phase owns movement for the current creep.
function advance(creep, squad) {
    if (squad.crossingDoneTick === Game.time) return true;
    const members = squad.members.map((id) => Game.getObjectById(id)).filter(Boolean);
    const leader = Game.getObjectById(squad.leader);
    if (!leader) return true;
    let crossing = squad.crossing;
    if (crossing && crossing.destination !== squad.target.room) {
        delete squad.crossing;
        crossing = null;
        for (const c of members) clearMovement(c);
    }
    if (!crossing) {
        crossing = begin(squad, leader, members);
        if (!crossing) {
            // A staging timeout may leave someone several rooms behind. Let
            // it catch up normally until it reaches the final shared hop.
            if (creep.room.name !== squad.target.room) {
                routing.travelToRoom(creep, squad.target.room, { range: 20, reusePath: 20 });
                return true;
            }
            return false;
        }
        squad.crossing = crossing;
    }

    if (crossing.tick !== Game.time) {
        crossing.tick = Game.time;
        const positions = members.map((c) => c.id + ":" + c.room.name + ":" + c.pos.x + ":" + c.pos.y).join("|");
        if (positions !== crossing.positions) {
            crossing.positions = positions;
            crossing.lastProgress = Game.time;
        }
        const stalled = Game.time - crossing.lastProgress >= config.get("squad.crossingStallTicks", 50);
        const expired = Game.time - crossing.started >= config.get("squad.crossingTimeoutTicks", 300);
        if (stalled || expired) {
            squad.crossingFailure = { from: crossing.from, to: crossing.to, tick: Game.time,
                reason: stalled ? "noProgress" : "timeout" };
            for (const c of members) clearMovement(c);
            if (squad.state !== "retreating") {
                squad.state = "retreating";
                squad.target = { room: squad.from };
                delete squad.crossing;
                squad.crossingDoneTick = Game.time;
                return true;
            }
            crossing.phase = "plan";
            crossing.started = crossing.lastProgress = Game.time;
            crossing.retryAt = Game.time + config.get("squad.crossingRetryTicks", 10);
        }
        if (crossing.phase === "plan" && Game.time >= crossing.retryAt) {
            const origin = members.find((c) => c.room.name === crossing.from);
            if (origin) plan(crossing, origin, members);
            crossing.retryAt = Game.time + config.get("squad.crossingRetryTicks", 10);
        }
        if (crossing.phase === "gather") {
            const ready = members.every((c) => c.room.name === crossing.from &&
                interior(c.pos, 1) && c.pos.getRangeTo(position(crossing.gather, crossing.from)) <= 3 && !c.fatigue);
            if (ready || members.some((c) => c.room.name === crossing.to)) {
                crossing.phase = "cross";
                for (const c of members) clearMovement(c);
            }
        }
        if (crossing.phase === "cross" && members.every((c) => c.room.name === crossing.to &&
            interior(c.pos, 1) && c.pos.getRangeTo(position(crossing.entry, crossing.to)) <= 3) &&
            leader.pos.getRangeTo(position(crossing.entry, crossing.to)) === 0) {
            delete squad.crossing;
            squad.crossingDoneTick = Game.time;
            delete squad.dirTick;
            squad.dir = null;
            squad.go = false;
            squad.formWait = 0;
            for (const c of members) clearMovement(c);
            return true; // resume tactical decisions next tick, in every call order
        }
    }

    if (crossing.phase === "plan") return true;
    if (creep.room.name !== crossing.from && creep.room.name !== crossing.to) {
        routing.travelToRoom(creep, crossing.from, { range: 20, reusePath: 20 });
        return true;
    }
    if (creep.fatigue > 0) return true;
    const gathering = crossing.phase === "gather";
    const room = gathering ? crossing.from : crossing.to;
    let target = position(gathering ? crossing.gather : crossing.entry, room);
    let range = creep.id === squad.leader ? 0 : 1;
    if (!gathering && creep.id !== squad.leader && creep.room.name === room && creep.pos.getRangeTo(target) === 0) {
        // A follower arriving first must leave the leader's parking tile free.
        const costs = combat.blockingMatrix(creep.room);
        const back = crossing.door
            ? { dx: Math.sign(crossing.door.x - target.x), dy: Math.sign(crossing.door.y - target.y) }
            : { dx: 0, dy: 1 };
        const free = [back, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }]
            .map((v) => ({ x: target.x + v.dx, y: target.y + v.dy })).find((p) =>
            interior(p, 1) && costs.get(p.x, p.y) < 255 && creep.room.getTerrain().get(p.x, p.y) !== TERRAIN_MASK_WALL &&
            !members.some((c) => c.room.name === room && c.pos.x === p.x && c.pos.y === p.y));
        if (!free) return true;
        target = position(free, room);
        range = 0;
    }
    // Already-entered members stay inside; never request their old-room slot.
    if (creep.room.name === room && interior(creep.pos, 1) && creep.pos.getRangeTo(target) <= range) return true;
    creep.moveTo(target, {
        range, reusePath: config.get("squad.crossingReusePathTicks", 5), maxRooms: gathering ? 1 : 2,
        maxOps: config.get("squad.crossingMaxOps", 20000),
        costCallback: (rn) => matrix(rn, crossing, true),
    });
    return true;
}

module.exports = { advance };
