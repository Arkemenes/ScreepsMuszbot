// A caching wrapper around Creep.moveTo. Most creep travel in Screeps is
// between fixed points, so we compute the path once, cache it on the creep,
// re-walk it, and only call PathFinder again when the path breaks (blocked,
// destination changed, wandered off). Cross-room moves fall back to native.

const roomCache = require("./roomCache");
const excuseMe = require("./excuseMe");

// Captured before anything overrides it (prototypes/move.js).
const nativeMoveTo = Creep.prototype.moveTo;

const ROAD_COST = 1;
const PLAIN_COST = 2;
const SWAMP_COST = 10;

// Per-room CostMatrix, cached on the heap. Rebuilt only when the number of
// structures / construction sites in the room changes (roads etc. are stable).
const matrices = {};
function roomMatrix(room) {
    const structs = roomCache.structures(room);
    const sites = roomCache.constructionSites(room);
    const version = structs.length + ":" + sites.length;

    const cached = matrices[room.name];
    if (cached && cached.version === version) return cached.matrix;

    const m = new PathFinder.CostMatrix();
    for (const s of structs) {
        if (s.structureType === STRUCTURE_ROAD) {
            if (m.get(s.pos.x, s.pos.y) === 0) {
                m.set(s.pos.x, s.pos.y, ROAD_COST);
            }
        } else if (
            s.structureType === STRUCTURE_CONTAINER ||
            (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic))
        ) {
            // walkable - leave as terrain default
        } else {
            m.set(s.pos.x, s.pos.y, 255);
        }
    }
    for (const cs of sites) {
        if (
            cs.structureType !== STRUCTURE_ROAD &&
            cs.structureType !== STRUCTURE_RAMPART &&
            cs.structureType !== STRUCTURE_CONTAINER
        ) {
            m.set(cs.pos.x, cs.pos.y, 255);
        }
    }

    matrices[room.name] = { version, matrix: m };
    return m;
}

function findPath(creep, destPos, range, avoidCreeps) {
    const base = roomMatrix(creep.room);
    let matrix = base;
    if (avoidCreeps) {
        matrix = base.clone();
        for (const c of creep.room.find(FIND_CREEPS)) {
            if (c.id !== creep.id) matrix.set(c.pos.x, c.pos.y, 255);
        }
    }

    return PathFinder.search(
        creep.pos,
        { pos: destPos, range: range },
        {
            plainCost: PLAIN_COST,
            swampCost: SWAMP_COST,
            maxRooms: 1,
            maxOps: 2000,
            roomCallback: (rn) => (rn === creep.room.name ? matrix : false),
        }
    );
}

function isAt(pos, x, y) {
    return pos.x === x && pos.y === y;
}

// Roles / creeps that hold a fixed work post - never shove these, route around.
const STATIONARY_ROLES = { miner: true, upgrader: true };
function isParked(creep) {
    if (STATIONARY_ROLES[creep.memory.role]) return true;
    if (creep.memory.onContainer) return true;
    return _.some(
        creep.pos.lookFor(LOOK_STRUCTURES),
        (s) =>
            s.structureType === STRUCTURE_CONTAINER ||
            s.structureType === STRUCTURE_LINK
    );
}

function travel(creep, target, opts) {
    opts = opts || {};
    if (!target) return ERR_INVALID_TARGET;

    const destPos = target.pos || target;
    if (!(destPos instanceof RoomPosition)) {
        return nativeMoveTo.call(creep, target, opts);
    }

    // cross-room: let the engine handle route finding
    if (destPos.roomName !== creep.room.name) {
        return nativeMoveTo.call(creep, target, opts);
    }

    const range = opts.range == null ? 1 : opts.range;

    if (creep.pos.inRangeTo(destPos, range)) {
        delete creep.memory._m;
        return OK;
    }
    if (creep.fatigue > 0) return ERR_TIRED;

    const key =
        destPos.x + ":" + destPos.y + ":" + destPos.roomName + ":" + range;
    let m = creep.memory._m;

    // did we actually move since last tick?
    if (m && m.last) {
        if (isAt(creep.pos, m.last[0], m.last[1])) {
            m.stuck = (m.stuck || 0) + 1;
        } else {
            m.stuck = 0;
        }
    }

    let repath =
        !m ||
        m.key !== key ||
        !m.path ||
        m.path.length === 0 ||
        (m.stuck || 0) >= 3 ||
        Game.time - m.t > 50;

    let blockedByParked = false;

    if (!repath) {
        // advance the cursor past tiles we already stand on
        while (m.path.length) {
            const [px, py] = m.path[0];
            if (isAt(creep.pos, px, py)) m.path.shift();
            else break;
        }
        if (!m.path.length) {
            repath = true;
        } else {
            const [nx, ny] = m.path[0];
            // shoved off the path -> recompute
            if (
                Math.max(
                    Math.abs(nx - creep.pos.x),
                    Math.abs(ny - creep.pos.y)
                ) !== 1
            ) {
                repath = true;
            } else if (
                _.some(
                    creep.room.lookForAt(LOOK_CREEPS, nx, ny),
                    (c) => c.my && c.id !== creep.id && isParked(c)
                )
            ) {
                // a static worker (or a single-file line of them) is on our
                // path - ask it to step aside (ROADMAP 0044) instead of
                // shoving it blind or routing around; only fall back to
                // routing around when there's nowhere valid for it to go
                if (!excuseMe.ask(creep, nx, ny)) {
                    repath = true;
                    blockedByParked = true;
                }
            }
        }
    }

    if (repath) {
        const avoidCreeps =
            blockedByParked || (m && (m.stuck || 0) >= 3);
        const result = findPath(creep, destPos, range, avoidCreeps);
        // incomplete means PathFinder never reached range of the goal (e.g. a
        // pocket sealed by walls/ramparts) - the partial path it hands back
        // only leads to a dead end, so treat it the same as no path at all
        // instead of walking into the pocket and finding out ticks later.
        if (!result.path.length || result.incomplete) return ERR_NO_PATH;
        m = creep.memory._m = {
            key,
            path: result.path.map((p) => [p.x, p.y]),
            t: Game.time,
            stuck: 0,
        };
    }

    const [nx, ny] = m.path[0];
    const dir = creep.pos.getDirectionTo(nx, ny);
    m.last = [creep.pos.x, creep.pos.y];

    // stuck behind a mobile creep of ours -> ask it to swap (the engine
    // resolves reciprocal moves). Parked workers are never shoved.
    if ((m.stuck || 0) >= 2) {
        const blocker = creep.room
            .lookForAt(LOOK_CREEPS, nx, ny)
            .find((c) => c.my && c.id !== creep.id);
        if (
            blocker &&
            !isParked(blocker) &&
            blocker.fatigue === 0 &&
            blocker.memory._swapped !== Game.time
        ) {
            blocker.move(blocker.pos.getDirectionTo(creep.pos.x, creep.pos.y));
            blocker.memory._swapped = Game.time;
        }
    }

    return creep.move(dir);
}

module.exports = { travel, roomMatrix, nativeMoveTo };
