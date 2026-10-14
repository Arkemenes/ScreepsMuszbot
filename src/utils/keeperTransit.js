// Claim-only SK transit: retain static geometry in the heap and avoid danger tiles.
const config = require("./config");
const roomCache = require("./roomCache");
const observer = require("./observer");
const combat = require("./combat");
const nativePath = require("./nativePath");
const rooms = new Map();
let epoch = 0;

function isKeeperRoom(name) {
    const match = /^[WE](\d+)[NS](\d+)$/.exec(name);
    if (!match) return false;
    const x = Number(match[1]) % 10, y = Number(match[2]) % 10;
    return x >= 4 && x <= 6 && y >= 4 && y <= 6 && !(x === 5 && y === 5);
}

function observe(room) {
    if (!isKeeperRoom(room.name)) return;
    const previous = rooms.get(room.name);
    if (previous && previous.lastTick === Game.time) return;
    // Transit safety includes allies and unlisted players, independently of combat diplomacy.
    const hostiles = roomCache.foreignCreeps(room);
    const lairs = roomCache.structures(room).filter((s) => s.structureType === STRUCTURE_KEEPER_LAIR);
    const centers = lairs.concat(roomCache.sources(room), roomCache.minerals(room))
        .map((o) => ({ x: o.pos.x, y: o.pos.y }));
    const nonKeeperHostiles = hostiles.some((c) => !c.owner || c.owner.username !== "Source Keeper");
    const signature = JSON.stringify([centers, nonKeeperHostiles, lairs.length]);
    if (!previous || previous.signature !== signature) epoch++;
    rooms.set(room.name, { centers, nonKeeperHostiles, signature, hasLairs: lairs.length > 0,
        keepers: hostiles.filter((c) => c.owner && c.owner.username === "Source Keeper")
            .map((c) => ({ x: c.pos.x, y: c.pos.y })), lastTick: Game.time });
}

function expire() {
    const maxAge = config.get("claim.keeperIntelMaxAge", 200);
    for (const [name, entry] of rooms) {
        if (Game.time < entry.lastTick || Game.time - entry.lastTick > maxAge) {
            rooms.delete(name);
            epoch++;
        }
    }
}

function policyKey() {
    expire();
    return `${epoch}:${config.get("claim.keeperAvoidRange", 6)}:${config.get("claim.keeperIntelMaxAge", 200)}`;
}

function canTransit(name) {
    if (!isKeeperRoom(name)) return false;
    const visible = Game.rooms[name];
    if (visible) observe(visible);
    expire();
    const entry = rooms.get(name);
    if (entry) return entry.hasLairs && !entry.nonKeeperHostiles;
    // Refresh known SK only, so an exploratory search cannot enqueue the world.
    const intel = Memory.rooms[name];
    if (intel && intel.hasController === false && intel.sourceNumber >= 3 && observer.observerFor(name)) {
        if (!Memory.observeRequests) Memory.observeRequests = {};
        Memory.observeRequests[name] = Game.time + config.get("claim.keeperObserveTicks", 20);
    }
    return false;
}

function matrix(name, base) {
    if (!canTransit(name)) return null;
    const entry = rooms.get(name);
    const range = config.get("claim.keeperAvoidRange", 6);
    if (entry.matrix && entry.matrixTick === Game.time && entry.matrixRange === range && entry.matrixBase === base) {
        return entry.matrix;
    }
    const result = base ? base.clone() : new PathFinder.CostMatrix();
    for (const center of entry.centers.concat(entry.keepers)) {
        for (let x = Math.max(0, center.x - range); x <= Math.min(49, center.x + range); x++) {
            for (let y = Math.max(0, center.y - range); y <= Math.min(49, center.y + range); y++) {
                result.set(x, y, 255);
            }
        }
    }
    entry.matrix = result; entry.matrixTick = Game.time; entry.matrixRange = range; entry.matrixBase = base;
    return result;
}

function invalidateNextStep(creep) {
    if (!isKeeperRoom(creep.room.name) || !creep.memory._move) return;
    const mask = matrix(creep.room.name);
    if (!mask) { delete creep.memory._move; return; }
    const next = nativePath.nextStep(creep);
    if (!next || (next.x >= 0 && next.x <= 49 && next.y >= 0 && next.y <= 49 && mask.get(next.x, next.y) === 255)) {
        delete creep.memory._move;
    }
}

function evade(creep) {
    if (!isKeeperRoom(creep.room.name)) return false;
    const range = config.get("claim.keeperAvoidRange", 6);
    const hostiles = roomCache.foreignCreeps(creep.room);
    observe(creep.room);
    const entry = rooms.get(creep.room.name);
    const dangers = hostiles.concat((entry ? entry.centers : []).map((p) =>
        ({ pos: new RoomPosition(p.x, p.y, creep.room.name) })));
    if (!dangers.some((c) => Math.max(Math.abs(c.pos.x-creep.pos.x),Math.abs(c.pos.y-creep.pos.y)) <= range)) return false;
    if (!creep.fatigue) combat.flee(creep, dangers, range);
    return true;
}

module.exports = { isKeeperRoom, observe, policyKey, canTransit, matrix, invalidateNextStep, evade };
