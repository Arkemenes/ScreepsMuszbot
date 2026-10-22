// Lockstep movement/coordination for a 2-4 creep squad (ROADMAP 0032 Fase
// 4, O5). Shared by defenderStriker.js/defenderMedic.js (squad mode) and
// squadDismantler.js - none of them know the formation/retreat mechanics,
// they just call advance() and then do their own combat action
// (constitution §5).
//
// See specs/features/0032-combat-overhaul/plan-phase4.md for the full
// design writeup - this file is a direct implementation of that algorithm.

const config = require("./config");
const mapExits = require("./mapExits");
const routing = require("./routing");
const combat = require("./combat");
const crossing = require("./squadCrossing");
const breach = require("./squadBreach");
const assembly = require("./squadAssembly");

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
function slotsFor(squad, shape, dir) {
    const offsets = shapeOffsets(shape, dir === undefined ? squad.dir : dir);
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
    const slots = slotsFor(squad, shape, dir);
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
        // ROADMAP 0175: a combat squad walks to its priority structure
        // (combat.structureTarget) so the strikers end up in range of it
        if (squad.mission !== "siege" && squad.state !== "retreating") {
            const structure = combat.structureTarget(leader.room, leader.pos);
            if (structure) return structure.pos;
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
    const assault = breach.get(squad);
    if (assault && assault.reason) return null;
    const goal = assault ? assault.approach : leaderGoal(leader, squad);
    const result = PathFinder.search(
        leader.pos,
        { pos: goal, range: assault ? 0 : 1 },
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

// Both ranged and dismantle roles share the first obstacle on the route.
// Strategic targets stay tower/spawn; walls are only intermediate objectives.
function attackTarget(creep, squadId) {
    const squad = Memory.squads && Memory.squads[squadId];
    if (squad && creep.room.name === squad.target.room) {
        const plan = breach.get(squad);
        if (plan) return plan.target;
    }
    return combat.structureTarget(creep.room, creep.pos);
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

    // ROADMAP 0178: the leader only steps once every member is on its slot -
    // otherwise everyone moves at the same speed and a straggler never
    // catches up (live: the striker reached the tower ahead of the medics).
    // A border tile is exempt (the squad has to step in first), and after
    // squad.formTimeoutTicks of waiting it takes one step anyway so a
    // blocked member can't freeze the whole squad.
    if (formed(squad, shape) || isBorder(leader.pos.x, leader.pos.y)) {
        squad.formWait = 0;
        squad.go = true;
    } else {
        squad.formWait = (squad.formWait || 0) + 1;
        squad.go = squad.formWait >= config.get("squad.formTimeoutTicks", 5);
        if (squad.go) squad.formWait = 0;
    }
}

// ROADMAP 0178: the last room before the target on the mother's route -
// every member travels there on its own and waits for the rest before
// anyone enters the target room. The mother itself when they're neighbours.
function stagingRoom(squad) {
    if (squad.staging === undefined) {
        const route = Game.map.findRoute(squad.from, squad.room);
        squad.staging = Array.isArray(route) && route.length >= 2
            ? route[route.length - 2].room
            : squad.from;
    }
    return squad.staging;
}

// True once the squad may leave the staging room: every living member is
// there (and done spawning), or squad.stageTimeoutTicks passed.
function regrouped(squad, creep) {
    if (squad.staged) return true;
    const staging = stagingRoom(squad);
    if (creep.room.name !== staging) return false;
    if (!squad.stageSince) squad.stageSince = Game.time;
    const members = squadMembers(squad);
    const all = members.every((c) => c.room.name === staging && !c.spawning);
    const timedOut = Game.time - squad.stageSince >= config.get("squad.stageTimeoutTicks", 300);
    if (all || timedOut) {
        squad.staged = true;
        if (!all) console.log(`[squad] regroup in ${staging} timed out - entering ${squad.room} with whoever is there`);
    }
    return squad.staged;
}

function avgHpRatio(squad) {
    const members = squadMembers(squad);
    if (!members.length) return 1;
    return _.sum(members, (c) => c.hits / c.hitsMax) / members.length;
}

function hasSafeExit(roomName) {
    const exits = mapExits.known(roomName) || {};
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
    // ROADMAP 0175: combat only ever targets armed creeps and towers/spawns,
    // so with vision it's done once those are gone - leftover extensions or
    // storage must not keep the squad in the room forever
    const room = Game.rooms[squad.room];
    if (room) return !combat.threats(room).length && !combat.structureTarget(room);
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
    if (squad.state === "advancing" && dangerous) {
        maybeRetreat(squad);
        if (squad.state === "advancing" && missionComplete(squad)) {
            squad.state = "retreating";
            squad.target = { room: squad.from };
        }
    }
    if (squad.state === "retreating" && squadMembers(squad).every((c) =>
        c.room.name === squad.from && !isBorder(c.pos.x, c.pos.y))) {
        disband(squadId);
        return;
    }
    if (squad.crossing || squad.staged || dangerous) {
        if (crossing.advance(creep, squad)) return;
    }
    if (!dangerous) {
        if (squad.state === "retreating") {
            if (creep.room.name === squad.from) {
                // actually home, not just "some safe room" - disband here,
                // not the moment danger clears, so a defenderStriker/Medic
                // never gets stranded solo-moded in unfamiliar territory
                // with no way to find its way back (it has no travel-home
                // logic outside squad mode)
                // Wait for the rest of the squad before releasing the roles.
                return;
            }
            routing.travelToRoom(creep, squad.from, { range: 20, reusePath: 20 });
            return;
        }
        // ROADMAP 0178: regroup in the staging room before the target
        if (!squad.staged) {
            const staging = stagingRoom(squad);
            if (creep.room.name !== staging) {
                routing.travelToRoom(creep, staging, { range: 20, reusePath: 20 });
                return;
            }
            if (!regrouped(squad, creep)) {
                const center = new RoomPosition(25, 25, staging);
                if (creep.pos.getRangeTo(center) > 5) creep.moveTo(center, { range: 5, reusePath: 10 });
                return;
            }
        }
        crossing.advance(creep, squad);
        return;
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

    if (squad.dirTick === Game.time && squad.dir && squad.go) {
        creep.move(squad.dir);
    }
}

// ROADMAP 0178: a squad medic's heal for this tick. The squad member that
// lost the most hits comes first (itself included, no "self first" rule) -
// heal() when adjacent, rangedHeal() within 3. Nobody hurt but something
// can shoot (armed hostile or an active tower with energy): pre-heal the
// leader, the one walking point - damage and healing resolve in the same
// tick, so the heal lands on the very shot it takes. Otherwise falls back
// to combat.patch() (any wounded ally nearby).
function heal(creep, squadId) {
    const squad = Memory.squads && Memory.squads[squadId];
    if (!squad) {
        combat.patch(creep);
        return;
    }
    const sameRoom = squadMembers(squad).filter((c) => c.room.name === creep.room.name);
    const hurt = sameRoom
        .filter((c) => c.hits < c.hitsMax)
        .sort((a, b) => (b.hitsMax - b.hits) - (a.hitsMax - a.hits));
    const healAt = (target) => {
        const range = creep.pos.getRangeTo(target);
        if (range <= 1) return creep.heal(target) === OK || true;
        if (range <= combat.KITE_RANGE) return creep.rangedHeal(target) === OK || true;
        return false;
    };
    for (const target of hurt) {
        if (healAt(target)) return;
    }
    const underFire = combat.threats(creep.room).length > 0 || combat.hostileTowerThreat(creep.room);
    const leader = Game.getObjectById(squad.leader);
    if (underFire && leader && leader.room.name === creep.room.name && healAt(leader)) return;
    combat.patch(creep);
}

// Called from a spawned-but-not-yet-squadded creep's run() (memory.
// pendingSquad set, memory.squadId not yet) - registers itself into
// Memory.pendingSquads[id].spawned, and once the complete recipe has
// finished spawning, promotes it into Memory.squads[id] and tags all four
// with the new squadId in the same tick.
function registerPending(creep) {
    const pending = assembly.find(creep.memory.pendingSquad);
    if (!pending || !pending.need.includes(creep.memory.role)) {
        creep.memory.pendingSquad = undefined;
        return;
    }
    creep.memory.pendingSquad = pending.id;
    if (creep.spawning) return;
    if (pending.spawned.indexOf(creep.id) === -1) pending.spawned.push(creep.id);
    const available = assembly.population(pending).filter((c) => !c.spawning);
    const chosen = [];
    for (const role of pending.need) {
        const index = available.findIndex((c) => c.memory.role === role);
        if (index < 0) return;
        chosen.push(available.splice(index, 1)[0]);
    }
    const squadId = pending.id;
    if (!Memory.squads) Memory.squads = {};
    Memory.squads[squadId] = {
        mission: pending.mission,
        room: pending.room,
        from: pending.from,
        target: { room: pending.room },
        members: chosen.map((c) => c.id),
        leader: chosen[0].id,
        shape: "block",
        state: "advancing",
    };
    for (const c of chosen) {
        c.memory.squadId = squadId;
        c.memory.pendingSquad = undefined;
    }
    delete Memory.pendingSquads[squadId];
}

// Runs even when no surviving creep can call advance() anymore.
function maintain() {
    for (const entry of Object.values(assembly.pending())) assembly.prune(entry);
    for (const id of Object.keys(Memory.squads || {})) pruneDeadMembers(id);
}

module.exports = {
    isDangerousRoom,
    advance,
    attackTarget,
    disband,
    registerPending,
    maintain,
    missionComplete,
    heal,
    // exposed for the offline smoke test only
    pruneDeadMembers,
    slotsFor,
    formed,
    shapeFits,
};
