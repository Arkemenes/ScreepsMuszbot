// Single pass over Game.creeps per tick. Every role/intel counter should read
// from here instead of running its own _.filter(Game.creeps, ...).

let builtTick = -1;
let byRoomRole = {};
let ownedCreeps = [];

function build() {
    builtTick = Game.time;
    byRoomRole = {};
    ownedCreeps = [];

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        ownedCreeps.push(creep);
        const roomName = creep.room.name;
        const role = creep.memory.role;
        if (!role) continue;

        const slot = byRoomRole[roomName] || (byRoomRole[roomName] = {});
        (slot[role] || (slot[role] = [])).push(creep);
    }
}

function ensure() {
    if (builtTick !== Game.time) build();
}

// All owned cargo, including creeps without a role and creeps in transit.
function allOwned() {
    ensure();
    return ownedCreeps;
}

// All creeps of `role` whose current room is `roomName`.
function creepsByRole(roomName, role) {
    ensure();
    const slot = byRoomRole[roomName];
    return (slot && slot[role]) || [];
}

// Every creep (any role) whose current room is `roomName` - flattens the
// per-role buckets instead of a fresh room.find/Game.creeps scan.
function allInRoom(roomName) {
    ensure();
    const slot = byRoomRole[roomName];
    if (!slot) return [];
    let list = [];
    for (const role in slot) list = list.concat(slot[role]);
    return list;
}

// Count of `role` in `roomName`, ignoring creeps about to die (ttl <= minTtl).
function count(roomName, role, minTtl = 5) {
    return _.filter(
        creepsByRole(roomName, role),
        (c) => c.ticksToLive === undefined || c.ticksToLive > minTtl
    ).length;
}

// Every creep of `role` across the whole empire (roaming creeps move between
// rooms, so a per-room count under-reports them).
function all(role) {
    ensure();
    let list = [];
    for (const rn in byRoomRole) {
        if (byRoomRole[rn][role]) list = list.concat(byRoomRole[rn][role]);
    }
    return list;
}

function total(role, minTtl = 5) {
    return _.filter(
        all(role),
        (c) => c.ticksToLive === undefined || c.ticksToLive > minTtl
    ).length;
}

// Console: name + room of every creep of `role`, empire-wide.
global.findCreeps = function (role) {
    const list = all(role);
    console.log(role + ": " + list.length + " creep(s)");
    for (const creep of list) {
        console.log("  " + creep.name + " @ " + creep.room.name);
    }
    return list.map((creep) => ({ name: creep.name, room: creep.room.name }));
};

// The per-role buckets of `roomName` ({ role: [creep] }), shared and read-only - lets a
// caller walk every role without allInRoom's flattening copy.
function rolesInRoom(roomName) {
    ensure();
    return byRoomRole[roomName] || {};
}

module.exports = { creepsByRole, allInRoom, rolesInRoom, allOwned, count, all, total, build };
