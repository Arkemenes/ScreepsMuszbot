// Lockstep movement/coordination for a 2-4 creep squad (ROADMAP 0032 Fase
// 4, O5). Shared by defenderStriker.js/defenderMedic.js (squad mode) and
// squadDismantler.js - none of them know the formation/retreat mechanics,
// they just call advance() and then do their own combat action
// (constitution §5).
//
// See specs/features/0032-combat-overhaul/plan-phase4.md for the full
// design writeup - this file is a direct implementation of that algorithm.

const config = require("./config");
const routing = require("./routing");
const combat = require("./combat");

const DIR_VECTORS = {
    1: { dx: 0, dy: -1 }, 2: { dx: 1, dy: -1 }, 3: { dx: 1, dy: 0 },
    4: { dx: 1, dy: 1 }, 5: { dx: 0, dy: 1 }, 6: { dx: -1, dy: 1 },
    7: { dx: -1, dy: 0 }, 8: { dx: -1, dy: -1 },
};

const BLOCK_SHAPE = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }];

function columnShape(dir) {
    const v = DIR_VECTORS[dir] || DIR_VECTORS[5];
    const behind = { dx: -v.dx, dy: -v.dy };
    return [
        { dx: 0, dy: 0 },
        { dx: behind.dx, dy: behind.dy },
        { dx: behind.dx * 2, dy: behind.dy * 2 },
        { dx: behind.dx * 3, dy: behind.dy * 3 },
    ];
}

function shapeOffsets(shape, dir) {
    return shape === "column" ? columnShape(dir) : BLOCK_SHAPE;
}

// A room with known hostiles, or the squad's actual destination - lockstep
// only matters where there's something to fight or flee; everywhere else
// each member just travels independently (routing.moveToRoom), same as
// roles/raider.js already does.
function isDangerousRoom(roomName, targetRoomName) {
    if (roomName === targetRoomName) return true;
    const mem = Memory.rooms[roomName];
    return !!(mem && mem.enemies > 0);
}

function squadMembers(squad) {
    return squad.members.map((id) => Game.getObjectById(id)).filter(Boolean);
}

// Drops dead members from the roster, promotes a new leader if the old one
// died, and deletes the squad entirely once nobody is left. Returns the
// (possibly mutated) squad Memory object, or null if it no longer exists.
function pruneDeadMembers(squadId) {
    const squad = Memory.squads && Memory.squads[squadId];
    if (!squad) return null;

    const alive = squad.members.filter((id) => Game.getObjectById(id));
    if (!alive.length) {
        delete Memory.squads[squadId];
        return null;
    }
    squad.members = alive;
    if (alive.indexOf(squad.leader) === -1) {
        squad.leader = alive[0];
    }
    return squad;
}

// Exit tiles (x/y 0 or 49) are never a valid squad position inside the
// mission room: stepping on one teleports the creep to the next room and
// breaks the formation (live case: a striker hugging the border while
// closing on an invader core walked off the map).
function isBorder(x, y) {
    return x <= 0 || x >= 49 || y <= 0 || y >= 49;
}

function tileWalkable(room, x, y) {
    if (x < 0 || x > 49 || y < 0 || y > 49) return false;
    if (isBorder(x, y)) return false;
    if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false;
    return combat.blockingMatrix(room).get(x, y) < 255;
}

// Member id -> {dx, dy} for the given shape, leader always at {0,0}.
// Followers get the remaining shape slots in their fixed roster order (not
// tied to any particular creep identity, so a leader promotion doesn't
// need to reshuffle anyone else's slot).
function slotsFor(squad, shape) {
    const offsets = shapeOffsets(shape, squad.dir);
    const followers = squad.members.filter((id) => id !== squad.leader);
    const order = [squad.leader].concat(followers);
    const map = {};
    order.forEach((id, i) => {
        map[id] = offsets[i] || offsets[offsets.length - 1];
    });
    return map;
}

// True when every living member is standing exactly on its assigned slot
// relative to the leader's current position.
function formed(squad, shape) {
    const leader = Game.getObjectById(squad.leader);
    if (!leader) return false;
    const slots = slotsFor(squad, shape);
    return squad.members.every((id) => {
        if (id === squad.leader) return true;
        const c = Game.getObjectById(id);
        if (!c) return true; // dead - doesn't block "formed"
        const off = slots[id];
        return (
            c.pos.roomName === leader.pos.roomName &&
            c.pos.x === leader.pos.x + off.dx &&
            c.pos.y === leader.pos.y + off.dy
        );
    });
}

// Every member's tile after a 1-step move in `dir`, for the given shape,
// is walkable - i.e. this formation actually fits through here.
function shapeFits(leader, squad, shape, dir) {
    const v = DIR_VECTORS[dir];
    if (!v) return false;
    const slots = slotsFor(squad, shape);
    const leaderNext = { x: leader.pos.x + v.dx, y: leader.pos.y + v.dy };
    return squad.members.every((id) => {
        const off = id === squad.leader ? { dx: 0, dy: 0 } : slots[id];
        return tileWalkable(leader.room, leaderNext.x + off.dx, leaderNext.y + off.dy);
    });
}

// Where the leader is currently trying to get to: the target object's own
// position if it still exists, the target room's center once there, or
// (mid-transit through a dangerous room that isn't the destination yet)
// the nearest exit toward it - same idiom roles/scout.js already uses.
function leaderGoal(leader, squad) {
    if (squad.target.room === leader.room.name) {
        if (squad.target.id) {
            const obj = Game.getObjectById(squad.target.id);
            if (obj) return obj.pos;
        }
        return new RoomPosition(25, 25, squad.target.room);
    }
    const exitDir = Game.map.findExit(leader.room.name, squad.target.room);
    if (exitDir < 0) return new RoomPosition(25, 25, leader.room.name);
    return leader.pos.findClosestByRange(exitDir) || new RoomPosition(25, 25, leader.room.name);
}

function avoidMatrix(room, avoidList) {
    const base = combat.blockingMatrix(room).clone();
    for (let i = 0; i < 50; i++) {
        base.set(i, 0, 255);
        base.set(i, 49, 255);
        base.set(0, i, 255);
        base.set(49, i, 255);
    }
    for (const a of avoidList || []) {
        if (a.roomName === room.name && Game.time < a.until) base.set(a.x, a.y, 255);
    }
    return base;
}

function leaderNextDirection(leader, squad) {
    const goal = leaderGoal(leader, squad);
    const result = PathFinder.search(
        leader.pos,
        { pos: goal, range: 1 },
        {
            maxRooms: 1,
            plainCost: 2,
            swampCost: 10,
            roomCallback: (rn) =>
                rn === leader.room.name ? avoidMatrix(leader.room, squad.avoid) : false,
        }
    );
    if (!result.path.length) return null;
    const next = result.path[0];
    return leader.pos.getDirectionTo(next.x, next.y);
}

function bumpStuck(squad, leader, dir) {
    squad.stuckTicks = (squad.stuckTicks || 0) + 1;
    if (squad.stuckTicks < config.get("squad.stuckTicksLimit", 5)) return;
    squad.stuckTicks = 0;
    if (!dir) return; // no path at all - nothing specific to blacklist
    const v = DIR_VECTORS[dir];
    squad.avoid = squad.avoid || [];
    squad.avoid.push({
        x: leader.pos.x + v.dx,
        y: leader.pos.y + v.dy,
        roomName: leader.room.name,
        until: Game.time + config.get("squad.avoidTicks", 100),
    });
}

// The one expensive computation (PathFinder) per squad per tick, computed
// once by whichever member happens to run first (gated by Game.time, not
// by "only the leader may compute") and cached in Memory for the other
// three to just read.
function ensureDecision(squad) {
    if (squad.dirTick === Game.time) return;
    const leader = Game.getObjectById(squad.leader);
    if (!leader) return;
    squad.dirTick = Game.time;

    const dir = leaderNextDirection(leader, squad);
    if (!dir) {
        squad.dir = null;
        bumpStuck(squad, leader, null);
        return;
    }
    const shape = shapeFits(leader, squad, "block", dir)
        ? "block"
        : shapeFits(leader, squad, "column", dir)
        ? "column"
        : null;
    if (!shape) {
        squad.dir = null;
        bumpStuck(squad, leader, dir);
        return;
    }
    squad.shape = shape;
    squad.dir = dir;
    squad.stuckTicks = 0;
}

function avgHpRatio(squad) {
    const members = squadMembers(squad);
    if (!members.length) return 1;
    return _.sum(members, (c) => c.hits / c.hitsMax) / members.length;
}

function hasSafeExit(roomName) {
    const exits = (Memory.rooms[roomName] && Memory.rooms[roomName].exits) || {};
    return _.some(
        Object.values(exits),
        (rn) => !(Memory.rooms[rn] && Memory.rooms[rn].enemies > 0)
    );
}

function maybeRetreat(squad) {
    if (avgHpRatio(squad) >= config.get("squad.retreatHpRatio", 0.3)) return;
    if (!hasSafeExit(squad.target.room)) return;
    squad.state = "retreating";
    squad.target = { room: squad.from };
}

// ROADMAP 0047: is there anything left in the squad's mission room worth
// staying for? Pure Memory read - rooms/intel.js already refreshes
// `enemies`/`enemyStructures` for any room we currently have vision in
// (which the squad's own room always is, since it's physically there), so
// no room.find is needed here. A "siege" squad (dismantler+medic) has no
// way to fight a creep, so hostile creeps don't block its completion -
// only structures (its actual job) do; every other mission (just "combat"
// for now) needs both cleared.
function missionComplete(squad) {
    const mem = Memory.rooms[squad.room];
    if (!mem) return false;
    if (squad.mission === "siege") return !(mem.enemyStructures > 0);
    return !(mem.enemies > 0) && !(mem.enemyStructures > 0);
}

// Clears squadId on every surviving member (they fall back to their own
// role's normal solo behaviour - defenderStriker/defenderMedic already
// have one; squadDismantler doesn't, so it retires) and drops the squad.
function disband(squadId) {
    const squad = Memory.squads && Memory.squads[squadId];
    if (!squad) return;
    for (const id of squad.members) {
        const c = Game.getObjectById(id);
        if (c) c.memory.squadId = undefined;
    }
    delete Memory.squads[squadId];
}

// The main entry point - called from a squad-mode creep's run(), every
// tick, instead of its usual solo movement. Combat (shoot/heal/dismantle)
// stays the caller's job; this only ever moves the creep.
function advance(creep, squadId) {
    const squad = pruneDeadMembers(squadId);
    if (!squad) {
        creep.memory.squadId = undefined;
        return;
    }

    // squad.room is the ORIGINAL mission room and never changes; squad.
    // target.room does (it becomes the mother room while retreating) - the
    // danger check must use the fixed one, or the mother room would count
    // as "dangerous" for the sole reason that it's currently the retreat
    // destination, and a squad could never actually finish retreating.
    const dangerous = isDangerousRoom(creep.room.name, squad.room);
    if (!dangerous) {
        if (squad.state === "retreating") {
            if (creep.room.name === squad.from) {
                // actually home, not just "some safe room" - disband here,
                // not the moment danger clears, so a defenderStriker/Medic
                // never gets stranded solo-moded in unfamiliar territory
                // with no way to find its way back (it has no travel-home
                // logic outside squad mode)
                disband(squadId);
                return;
            }
            routing.moveToRoom(creep, squad.from, { range: 20, reusePath: 20 });
            return;
        }
        routing.moveToRoom(creep, squad.target.room, { range: 20, reusePath: 20 });
        return;
    }

    if (squad.state === "advancing") {
        maybeRetreat(squad);
        // ROADMAP 0047: nothing left to fight - head home instead of
        // idling at the room center forever (only if maybeRetreat() above
        // didn't already start a retreat for low HP).
        if (squad.state === "advancing" && missionComplete(squad)) {
            squad.state = "retreating";
            squad.target = { room: squad.from };
        }
    }

    ensureDecision(squad);

    const leader = Game.getObjectById(squad.leader);
    if (!leader) return;
    const shape = squad.shape || "block";
    const isLeader = creep.id === squad.leader;
    const offset = isLeader ? { dx: 0, dy: 0 } : slotsFor(squad, shape)[creep.id];
    const wantX = leader.pos.x + offset.dx;
    const wantY = leader.pos.y + offset.dy;

    if (creep.pos.x !== wantX || creep.pos.y !== wantY || creep.pos.roomName !== leader.pos.roomName) {
        creep.moveTo(new RoomPosition(wantX, wantY, leader.pos.roomName), { range: 0, reusePath: 3 });
        return;
    }

    if (squad.dirTick === Game.time && squad.dir) {
        creep.move(squad.dir);
    }
}

// Called from a spawned-but-not-yet-squadded creep's run() (memory.
// pendingSquad set, memory.squadId not yet) - registers itself into
// Memory.pendingSquad.spawned, and once every member the mission needs
// exists, promotes it into a real Memory.squads[id] and tags all four
// with the new squadId in the same tick.
function registerPending(creep) {
    const pending = Memory.pendingSquad;
    if (!pending || pending.room !== creep.memory.pendingSquad) {
        creep.memory.pendingSquad = undefined;
        return;
    }
    if (pending.spawned.indexOf(creep.id) === -1) pending.spawned.push(creep.id);
    if (pending.spawned.length < pending.need.length) return;

    const squadId = "squad" + Game.time;
    if (!Memory.squads) Memory.squads = {};
    Memory.squads[squadId] = {
        mission: pending.mission,
        room: pending.room,
        from: pending.from,
        target: { room: pending.room },
        members: pending.spawned.slice(),
        leader: pending.spawned[0],
        shape: "block",
        state: "advancing",
    };
    for (const id of pending.spawned) {
        const c = Game.getObjectById(id);
        if (c) {
            c.memory.squadId = squadId;
            c.memory.pendingSquad = undefined;
        }
    }
    delete Memory.pendingSquad;
}

module.exports = {
    isDangerousRoom,
    advance,
    disband,
    registerPending,
    missionComplete,
    // exposed for the offline smoke test only
    pruneDeadMembers,
    slotsFor,
    formed,
    shapeFits,
};
