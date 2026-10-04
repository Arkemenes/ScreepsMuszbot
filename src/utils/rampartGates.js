"use strict";
// Which ramparts of a room an ally has to be let through (structures/rampart.js opens them).
//
// An ally crossing the room goes from one exit to another. If it can do that without setting
// foot on one of our ramparts (our base walls are built so the exits stay outside), no rampart
// ever needs to open. Only when every route between two exits runs through ramparts do the ones
// on the cheapest such route become the "gates". For each pair of exits:
//   1. a path with every rampart blocked: found -> nothing to open for that pair;
//   2. else a path with ramparts walkable at a high cost (so it crosses as few as possible):
//      the ramparts on it are gates.
// Derived data, heap only (constitution): recomputed when the room's number of ramparts changes
// and at least every RECHECK_TICKS (other structures can close or open a route too).
//
// Console: rampartGates() prints the computed gates of every owned room.
const roomCache = require("./roomCache");
const cadence = require("./cadence");
const config = require("./config");
const { terrainMatrix } = require("./terrain");

const RECHECK_TICKS = 600;
const states = {};

// Structures a creep can walk over; everything else on a tile blocks it.
function walkable(type) {
    return type === STRUCTURE_ROAD || type === STRUCTURE_CONTAINER || type === STRUCTURE_RAMPART;
}

// One representative tile (the middle one) per contiguous run of walkable tiles on each edge.
// Corners are always wall in Screeps, so edges run 1..48.
function exitSegments(roomName) {
    const terrain = terrainMatrix(roomName);
    const open = (x, y) => (terrain[x][y] & TERRAIN_MASK_WALL) === 0;
    const edges = [
        (i) => ({ x: i, y: 0 }),
        (i) => ({ x: i, y: 49 }),
        (i) => ({ x: 0, y: i }),
        (i) => ({ x: 49, y: i }),
    ];
    const out = [];
    edges.forEach((at) => {
        let run = [];
        for (let i = 1; i <= 49; i++) {
            const p = i <= 48 ? at(i) : null;
            if (p && open(p.x, p.y)) {
                run.push(p);
            } else if (run.length) {
                out.push(run[Math.floor(run.length / 2)]);
                run = [];
            }
        }
    });
    return out;
}

function rampartsOf(room) {
    return roomCache.structuresByType(room, STRUCTURE_RAMPART);
}

function buildMatrix(room, rampartCost) {
    const matrix = new PathFinder.CostMatrix();
    const all = roomCache.structures(room);
    for (let i = 0; i < all.length; i++) {
        const s = all[i];
        if (!walkable(s.structureType)) matrix.set(s.pos.x, s.pos.y, 255);
    }
    // sources and minerals cannot be walked on either
    roomCache.sources(room).forEach((o) => matrix.set(o.pos.x, o.pos.y, 255));
    roomCache.minerals(room).forEach((o) => matrix.set(o.pos.x, o.pos.y, 255));
    const ramparts = rampartsOf(room);
    for (let i = 0; i < ramparts.length; i++) {
        const p = ramparts[i].pos;
        // a rampart over a blocking structure stays blocked
        if (matrix.get(p.x, p.y) !== 255) matrix.set(p.x, p.y, rampartCost);
    }
    return matrix;
}

function search(room, from, to, matrix) {
    return PathFinder.search(
        new RoomPosition(from.x, from.y, room.name),
        { pos: new RoomPosition(to.x, to.y, room.name), range: 0 },
        {
            roomCallback: (name) => (name === room.name ? matrix : false),
            maxRooms: 1,
            maxOps: config.get("rampartGates.maxOps", 4000),
            plainCost: 2,
            swampCost: 10,
        }
    );
}

function compute(room) {
    const segments = exitSegments(room.name);
    const ramparts = rampartsOf(room);
    const rampartAt = {};
    ramparts.forEach((r) => { rampartAt[r.pos.x + ":" + r.pos.y] = r; });

    const free = buildMatrix(room, 255); // ramparts blocked
    let walled = null; // ramparts walkable, expensive - built only if a pair needs it
    const gates = {};
    let pairs = 0;
    let blocked = 0;
    let unreachable = 0;
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            pairs++;
            const direct = search(room, segments[i], segments[j], free);
            if (direct && !direct.incomplete) continue;
            if (!walled) walled = buildMatrix(room, config.get("rampartGates.rampartCost", 20));
            const through = search(room, segments[i], segments[j], walled);
            if (!through || through.incomplete) { unreachable++; continue; }
            blocked++;
            through.path.forEach((pos) => {
                const r = rampartAt[pos.x + ":" + pos.y];
                if (r) gates[r.id] = { x: r.pos.x, y: r.pos.y };
            });
        }
    }
    return {
        tick: Game.time,
        count: ramparts.length,
        exits: segments.length,
        pairs,
        blocked,
        unreachable,
        gates,
        ids: Object.keys(gates),
    };
}

// The gates of a room, recomputed when stale. `dirty` is true on the tick the set changed (the
// caller closes what stopped being a gate and clears it).
function ensure(room, force) {
    const old = states[room.name];
    const count = rampartsOf(room).length;
    if (!force && old && old.count === count && !cadence.due(old.tick, RECHECK_TICKS)) return old;
    const fresh = compute(room);
    fresh.dirty = !old || old.dirty || old.ids.join() !== fresh.ids.join();
    fresh.swept = old ? old.swept : undefined;
    states[room.name] = fresh;
    return fresh;
}

function reset() {
    Object.keys(states).forEach((name) => { delete states[name]; });
}

global.rampartGates = function () {
    const rooms = Game.myRooms && Game.myRooms.length ? Game.myRooms : _.filter(Game.rooms, (r) => r.controller && r.controller.my);
    const lines = [];
    rooms.forEach((room) => {
        const st = ensure(room, true);
        const open = st.ids.filter((id) => { const o = Game.getObjectById(id); return o && o.isPublic; }).length;
        lines.push(
            "[rampartGates] " + room.name + ": " + st.ids.length + " portão(ões) de " + st.count + " ramparts" +
            " (" + st.exits + " saídas, " + st.pairs + " pares, " + st.blocked + " exigem cruzar rampart, " +
            st.unreachable + " sem rota); abertos agora: " + open +
            (st.ids.length ? " -> " + st.ids.map((id) => st.gates[id].x + "," + st.gates[id].y).join(" ") : "")
        );
    });
    if (!lines.length) lines.push("[rampartGates] nenhuma sala própria visível");
    lines.forEach((l) => console.log(l));
};

module.exports = { ensure, exitSegments, rampartsOf, reset };
