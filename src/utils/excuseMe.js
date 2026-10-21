// "Excuse-me" traffic courtesy (ROADMAP 0044). utils/move.js's travel()
// calls ask() when the very next tile of a creep's cached path is occupied
// by a parked ally (a stationary-role worker, or anyone sitting on a
// container/link - see move.js's isParked()) instead of routing around it
// forever. The mover says SAY_ASK, the blocker (or a whole single-file line
// of them - a corridor jam can be several creeps deep) says SAY_REPLY and
// steps into a real free tile.
//
// The chain moves in one shot: the tail-most blocker steps into an actual
// empty tile, everyone ahead of it steps into the tile the next one just
// vacated, mover-ward. Screeps resolves a same-tick "everyone shifts one
// step down the line" chain natively (the same mechanic a moving train of
// creeps relies on) as long as the last link lands on a tile that is empty
// at the start of the tick - no separate swap bookkeeping needed.
//
// The tail's exit tile is picked to keep it inside whatever it looks like
// it's working near right now (anchorsFor()) - the controller for an
// upgrader, the container/link directly underfoot for anyone parked on one
// - so it can keep working right away instead of just wandering one step
// off and pathing back next tick. When no candidate tile satisfies any
// anchor, the choice falls back to whichever free tile comes first
// (straight ahead, then radially around the blocker) - unconstrained, same
// as before anchors existed.
//
// The miner is the one exception: it never gets asked at all (NEVER_ASKED
// in chain(), below) - its whole job is sitting on its container seat, and
// roles/miner.js already re-seats it there every tick on its own, so it has
// no business negotiating that away for anyone.

const config = require("./config");
const speak = require("./speech");

const SAY_ASK = "Excuse-me";
const SAY_REPLY = "Ok!";

function inBounds(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function blockedByStructure(room, x, y) {
    return _.some(
        room.lookForAt(LOOK_STRUCTURES, x, y),
        (s) =>
            s.structureType !== STRUCTURE_ROAD &&
            s.structureType !== STRUCTURE_CONTAINER &&
            !(s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic))
    );
}

function isFree(room, x, y) {
    if (!inBounds(x, y)) return false;
    if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false;
    if (room.lookForAt(LOOK_CREEPS, x, y).length) return false;
    if (blockedByStructure(room, x, y)) return false;
    return true;
}

// What (x, y) appears to be working near right now, so the exit tile we pick
// can favor staying in range instead of picking blind. Read-only, generic
// (no assumption beyond what move.js's own isParked() already relies on):
// a container/link directly underfoot (whatever it's loading/unloading from
// - covers any role, matches isParked()'s own "sitting on one" check) plus,
// for upgrader, the controller it's stationed at. The miner has no anchor
// here at all - it's in NEVER_ASKED (chain(), below) and never reaches this
// function in the first place; its own container seat is never up for
// negotiation.
function anchorsFor(blocker) {
    const anchors = [];
    const under = _.find(
        blocker.pos.lookFor(LOOK_STRUCTURES),
        (s) =>
            s.structureType === STRUCTURE_CONTAINER ||
            s.structureType === STRUCTURE_LINK
    );
    if (under) anchors.push({ pos: under.pos, range: 1 });

    const role = blocker.memory && blocker.memory.role;
    if (role === "upgrader" && blocker.room.controller) {
        anchors.push({ pos: blocker.room.controller.pos, range: 3 });
    }
    return anchors;
}

function anchorScore(anchors, x, y) {
    let score = 0;
    for (const a of anchors) {
        if (Math.max(Math.abs(x - a.pos.x), Math.abs(y - a.pos.y)) <= a.range) {
            score++;
        }
    }
    return score;
}

// Every free tile touching (x, y), other than `avoid` - straight-ahead
// (`straight`) listed first when it's free, so it still wins ties with no
// anchor to prefer one way or the other. At most 9 tiles ever looked at.
function freeCandidates(room, x, y, avoid, straight) {
    const tiles = [];
    const seen = {};
    const add = (nx, ny) => {
        const key = nx + ":" + ny;
        if (seen[key] || (avoid && nx === avoid.x && ny === avoid.y)) return;
        seen[key] = true;
        if (isFree(room, nx, ny)) tiles.push({ x: nx, y: ny });
    };
    if (straight) add(straight.x, straight.y);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            add(x + dx, y + dy);
        }
    }
    return tiles;
}

// Pick where `blocker` should step to: among every free tile touching it,
// prefer whichever keeps it inside its current work anchors (if any exist
// and any candidate actually satisfies one - otherwise the choice is
// unconstrained, same as before this feature existed).
function pickExitTile(room, blocker, straight, avoid) {
    const candidates = freeCandidates(
        room,
        blocker.pos.x,
        blocker.pos.y,
        avoid,
        straight
    );
    if (!candidates.length) return null;

    const anchors = anchorsFor(blocker);
    if (!anchors.length) return candidates[0];

    let best = candidates[0];
    let bestScore = anchorScore(anchors, best.x, best.y);
    for (let i = 1; i < candidates.length; i++) {
        const score = anchorScore(anchors, candidates[i].x, candidates[i].y);
        if (score > bestScore) {
            best = candidates[i];
            bestScore = score;
        }
    }
    return best;
}

// Roles that never accept an excuse-me request, no matter how convenient a
// free tile would be - the miner's whole job is sitting on its container
// seat (roles/miner.js's own re-seat logic), so it never moves for this.
const NEVER_ASKED = { miner: true };

// Walk the line of "my" creeps standing single-file from (x, y) in direction
// (dx, dy), up to `limit` deep - a corridor jam, not a general graph search.
// Stops (without including it) at a creep in NEVER_ASKED - it acts like a
// wall: its tile stays occupied, so nobody behind it can use it as an exit
// either, but whoever is queued in front of it can still sidestep out of the
// line on their own.
function chain(room, x, y, dx, dy, limit) {
    const creeps = [];
    let cx = x;
    let cy = y;
    for (let i = 0; i < limit; i++) {
        const blocker = room.lookForAt(LOOK_CREEPS, cx, cy).find((c) => c.my);
        if (!blocker) break;
        if (blocker.memory && NEVER_ASKED[blocker.memory.role]) break;
        creeps.push(blocker);
        cx += dx;
        cy += dy;
    }
    return { creeps, tailX: cx, tailY: cy };
}

// Ask the ally (or single-file line of allies, mover.js clamps this to a
// tile it actually intends to step onto) blocking (nx, ny) to make way.
// Returns true when the whole line is stepping aside this tick - the mover
// should hold its move intent and walk into (nx, ny) in the same tick, since
// that's exactly the tile the front of the line is vacating.
function ask(mover, nx, ny) {
    const room = mover.room;
    const dx = Math.sign(nx - mover.pos.x);
    const dy = Math.sign(ny - mover.pos.y);
    const limit = config.get("excuseMe.maxChain", 4);

    const { creeps, tailX, tailY } = chain(room, nx, ny, dx, dy, limit);
    if (!creeps.length) return false;
    if (creeps.some((c) => c.fatigue > 0)) return false;

    const last = creeps[creeps.length - 1];
    const exit = pickExitTile(room, last, { x: tailX, y: tailY }, mover.pos);
    if (!exit) return false;

    speak(mover, SAY_ASK);

    let target = exit;
    for (let i = creeps.length - 1; i >= 0; i--) {
        const c = creeps[i];
        speak(c, SAY_REPLY);
        c.move(c.pos.getDirectionTo(target.x, target.y));
        target = { x: c.pos.x, y: c.pos.y };
    }
    return true;
}

module.exports = { ask };
