// Loot relay chain (ROADMAP 0187): the tile path from a loot room to its
// mother's storage is split into one equal segment per live looter. Each
// looter carries cargo only along its own segment and hands it creep-to-creep
// to the next link; the last one delivers. Path, index and assignment live in
// the heap only - Memory carries at most loot.relay. Any missing piece (no
// path, no mother vision, fewer than 2 links) returns null so roles/looter.js
// falls back to the 0184 round trip.

const config = require("../utils/config");
const roomCache = require("../utils/roomCache");
const routing = require("../utils/routing");
const cpuMeter = require("../utils/cpuMeter");

const plans = new Map(); // loot id -> plan
let sweepTick = -1;

function enabled(loot) {
    return !!loot && loot.relay !== false && config.get("loot.relay", true) !== false;
}

function key(pos) {
    return pos.roomName + ":" + pos.x + ":" + pos.y;
}

function isEdge(pos) {
    return pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49;
}

// The fixed end of the chain: the mother's storage, else one of its containers.
function destination(loot) {
    const mother = Game.rooms[loot.from];
    if (!mother || !mother.controller || !mother.controller.my) return null;
    if (mother.storage) return mother.storage;
    return roomCache.structures(mother).find((s) => s.structureType === STRUCTURE_CONTAINER) || null;
}

// Searched from the mother's store toward the loot room and reversed: any
// interior tile of the loot room ends the search, so walls/ramparts around
// the room's center can no longer turn it into a full-maxOps failure.
function searchPath(loot, dest) {
    return cpuMeter.span("loot.relayPath", () => {
        const result = PathFinder.search(dest.pos, { pos: new RoomPosition(25, 25, loot.room), range: 23 }, {
            plainCost: 2,
            swampCost: 10,
            maxRooms: config.get("loot.relayMaxRooms", 16),
            maxOps: config.get("loot.relayMaxOps", 10000),
            roomCallback: routing.avoidCostCallback([], { currentRoomName: dest.pos.roomName }),
        });
        if (!result || result.incomplete || !result.path || !result.path.length) return null;
        const path = result.path.slice().reverse();
        return path[0].roomName === loot.room ? path : null;
    });
}

// A failed or skipped search must not repeat every tick for every looter.
const retryAt = new Map(); // loot id -> first tick another search may run
let searchTick = -1;

function canSearch(loot) {
    const retry = retryAt.get(loot.id);
    if (retry !== undefined && Game.time >= retry - config.get("loot.relayRetryTicks", 500) &&
        Game.time < retry) return false;
    if (searchTick === Game.time) return false; // one path search per tick in total
    const cpu = Game.cpu;
    return !cpu || !Number.isFinite(cpu.bucket) || cpu.bucket >= config.get("loot.relayMinBucket", 3000);
}

// Handoff indices: the giver waits on b-1 and the receiver on b, so neither
// may be an exit tile (standing there pushes the creep into the next room).
function boundaries(path, n) {
    const last = path.length - 1;
    if (n < 1 || last < 2 * n) return null;
    const bounds = [0];
    const usable = (b) => b >= 1 && b < last && !isEdge(path[b]) && !isEdge(path[b - 1]);
    for (let k = 1; k < n; k++) {
        const ideal = Math.round((k * path.length) / n);
        let found = -1;
        for (let d = 0; d <= last && found === -1; d++) {
            for (const b of [ideal + d, ideal - d]) {
                if (b > bounds[k - 1] + 1 && usable(b)) { found = b; break; }
            }
        }
        if (found === -1) return null;
        bounds.push(found);
    }
    if (bounds[n - 1] >= last) return null;
    bounds.push(last);
    return bounds;
}

// Path index of a creep: on the path exactly, else the closest tile of the
// path in its room, -1 in the loot room itself, the path end anywhere else.
function nearestIndex(plan, pos) {
    const exact = plan.index.get(key(pos));
    if (exact !== undefined) return exact;
    const inRoom = plan.byRoom.get(pos.roomName);
    if (!inRoom) return undefined;
    let best, bestRange = Infinity;
    for (const i of inRoom) {
        const p = plan.path[i];
        const range = Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y));
        if (range < bestRange) { best = i; bestRange = range; }
    }
    return best;
}

function progress(plan, loot, creep) {
    if (creep.room.name === loot.room && !plan.index.has(key(creep.pos))) return -1;
    const near = nearestIndex(plan, creep.pos);
    return near === undefined ? plan.path.length : near;
}

function newPlan(loot, dest) {
    const path = searchPath(loot, dest);
    if (!path) return null;
    const index = new Map();
    const byRoom = new Map();
    path.forEach((pos, i) => {
        index.set(key(pos), i);
        (byRoom.get(pos.roomName) || byRoom.set(pos.roomName, []).get(pos.roomName)).push(i);
    });
    return { destId: dest.id, tick: Game.time, used: Game.time, path, index, byRoom,
        members: null, bounds: null, assign: new Map() };
}

function sweep() {
    if (sweepTick === Game.time) return;
    sweepTick = Game.time;
    const missions = Memory.lootTargets || {};
    for (const [id, plan] of plans) {
        if (!missions[id] || Game.time < plan.used || Game.time - plan.used > 100) plans.delete(id);
    }
    for (const id of retryAt.keys()) {
        if (!missions[id]) retryAt.delete(id);
    }
}

// The plan for this mission (or null), re-dividing when the live set changes.
function planFor(loot, members) {
    sweep();
    if (!enabled(loot) || members.length < 2) return null;
    const dest = destination(loot);
    if (!dest) return null;
    let plan = plans.get(loot.id);
    const repath = config.get("loot.relayRepathTicks", 1500);
    const stale = !plan || plan.destId !== dest.id || Game.time < plan.tick || Game.time - plan.tick >= repath;
    if (stale) {
        // an expired plan for the same store keeps serving until a search may run
        const usable = plan && plan.destId === dest.id;
        if (!canSearch(loot)) {
            if (!usable) return null;
        } else {
            searchTick = Game.time;
            const fresh = newPlan(loot, dest);
            if (fresh) {
                retryAt.delete(loot.id);
                plan = fresh;
                plans.set(loot.id, plan);
            } else {
                retryAt.set(loot.id, Game.time + config.get("loot.relayRetryTicks", 500));
                if (!usable) {
                    plans.delete(loot.id);
                    return null;
                }
                plan.tick = Game.time; // keep the old path, retry after relayRepathTicks
            }
        }
    }
    plan.used = Game.time;
    const names = members.map((c) => c.name).sort().join(",");
    if (plan.members !== names) {
        const bounds = boundaries(plan.path, members.length);
        if (!bounds) return null;
        const order = members.map((c) => ({ name: c.name, at: progress(plan, loot, c) }))
            .sort((a, b) => a.at - b.at || (a.name < b.name ? -1 : 1));
        plan.bounds = bounds;
        plan.assign = new Map(order.map((entry, seg) => [entry.name, seg]));
        plan.members = names;
    }
    return plan;
}

// This creep's link in the chain, or null for the 0184 round trip.
function link(loot, creep, members) {
    const plan = planFor(loot, members);
    if (!plan) return null;
    const seg = plan.assign.get(creep.name);
    if (seg === undefined) return null;
    const n = plan.bounds.length - 1;
    const nextName = [...plan.assign].find(([, s]) => s === seg + 1);
    return { plan, seg, n, start: plan.bounds[seg], end: plan.bounds[seg + 1],
        next: nextName ? nextName[0] : null, dest: plan.destId };
}

function indexOf(plan, pos) {
    return plan.index.get(key(pos));
}

// Walk the stored path to `target` (forward or backward); off the path, rejoin
// it at its closest tile in this room or route toward the target's room.
function walk(creep, plan, target) {
    const here = indexOf(plan, creep.pos);
    if (here === target) return OK;
    if (here !== undefined) {
        const steps = here < target ? plan.path.slice(here, target + 1)
            : plan.path.slice(target, here + 1).reverse();
        return creep.moveByPath(steps);
    }
    const near = nearestIndex(plan, creep.pos);
    if (near !== undefined) return creep.moveTo(plan.path[near], { range: 0, reusePath: 10 });
    return routing.travelToRoom(creep, plan.path[target].roomName, { range: 20, reusePath: 20, blockHostiles: false });
}

function describe(loot) {
    const plan = plans.get(loot.id);
    if (!enabled(loot) || !plan || !plan.bounds) return null;
    const links = {};
    for (const [name, seg] of plan.assign) links[name] = seg;
    return {
        segments: plan.bounds.length - 1,
        length: plan.path.length,
        handoffs: plan.bounds.slice(1, -1).map((b) => plan.path[b].roomName + ":" + plan.path[b].x + "," + plan.path[b].y),
        links,
    };
}

module.exports = { enabled, boundaries, link, walk, indexOf, describe, isEdge };
