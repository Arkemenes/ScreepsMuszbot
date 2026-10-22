// Transit permission is independent of diplomatic/combat allegiance.
const config = require("./config");
const { isAlly } = require("./hostiles");
const census = require("./census");
const roomCache = require("./roomCache");

let seenTick = -1;
let scannedRooms = new Set();
let ownIds = new Map();
let territories = new Map();
let territoryVersion = 0;
let epoch;
const emptyAggressors = {};
let learnedCacheTick = -1;
let learnedCacheSource = null;
let learnedCache = [];

function manualPlayers() {
    const list = config.get("routing.avoidPlayers", []);
    return Array.isArray(list) ? list.filter((name) => typeof name === "string" && name) : [];
}

function avoidTicks() {
    const value = Number(config.get("routing.allyAttackAvoidTicks", 10000));
    return Number.isFinite(value) && value > 0 ? value : 10000;
}

function learnedPlayers() {
    const records = Memory.routingAggressors || emptyAggressors;
    if (learnedCacheTick === Game.time && learnedCacheSource === records) return learnedCache;
    learnedCacheTick = Game.time;
    learnedCacheSource = records;
    learnedCache = Object.keys(records).filter((name) => {
        const record = records[name];
        if (record && Number.isFinite(record.tick) && Game.time >= record.tick &&
            Game.time - record.tick < avoidTicks()) return true;
        delete records[name];
        return false;
    });
    return learnedCache;
}

function invalidateLearnedPlayers() {
    learnedCacheTick = -1;
    learnedCacheSource = null;
    learnedCache = [];
}

function roomPlayer(roomName) {
    const room = Game.rooms[roomName];
    if (room) {
        const ctrl = room.controller;
        if (!ctrl || ctrl.my) return null;
        return (ctrl.owner && ctrl.owner.username) || (ctrl.reservation && ctrl.reservation.username) || null;
    }
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (!mem || mem.my) return null;
    return mem.owner || (mem.reservation && mem.reservation.username) || null;
}

function isBlockedRoom(roomName) {
    const player = roomPlayer(roomName);
    return !!player && (manualPlayers().includes(player) || learnedPlayers().includes(player));
}

// Cached native paths must be discarded even when only ownership changes.
function policyKey() {
    if (epoch === undefined) epoch = Game.time;
    return epoch + ":" + territoryVersion + ":" +
        JSON.stringify(Array.from(new Set(manualPlayers().concat(learnedPlayers()))).sort());
}

function restrictionKey() {
    // Unrelated observer intel must not invalidate every traveler's route.
    if (epoch === undefined) epoch = Game.time;
    return epoch + ":" + JSON.stringify(Array.from(new Set(manualPlayers().concat(learnedPlayers()))).sort());
}

function observeRoom(room) {
    if (seenTick !== Game.time) {
        seenTick = Game.time;
        scannedRooms = new Set();
        for (const [id, tick] of ownIds) {
            if (tick < Game.time - 1 || tick > Game.time) ownIds.delete(id);
        }
    }
    if (scannedRooms.has(room.name)) return;
    scannedRooms.add(room.name);
    const player = roomPlayer(room.name);
    if (territories.get(room.name) !== player) {
        territories.set(room.name, player);
        territoryVersion++;
    }
    learnedPlayers(); // bound persistent incident records by their lifetime
    // ARK-116: only a foreign creep, or a tower in a room another player owns, can attack
    // ours. An attacker is visible in the room on the tick it attacks, so with neither present
    // there is no victim to remember now and no event to read - skip both.
    const controller = room.controller;
    if (!(controller && controller.owner && !controller.my) && !roomCache.foreignCreeps(room).length) return;
    // Reuse the census; never scan Game.creeps or call room.find here.
    for (const creep of census.allInRoom(room.name)) {
        if (creep.id) ownIds.set(creep.id, Game.time);
    }
    if (!config.get("routing.learnAllyAttacks", true) ||
        typeof room.getEventLog !== "function" || typeof EVENT_ATTACK === "undefined") return;
    for (const event of room.getEventLog()) {
        const data = event.data;
        if (event.event !== EVENT_ATTACK || !data || !(data.damage > 0)) continue;
        const target = Game.getObjectById(data.targetId);
        const previousTick = ownIds.get(data.targetId);
        const ownCreep = target && target.my && Array.isArray(target.body);
        if (!ownCreep && previousTick !== Game.time - 1 && previousTick !== Game.time) continue;
        const actor = Game.getObjectById(event.objectId);
        const attacker = actor && actor.owner && actor.owner.username;
        if (!isAlly(attacker)) continue;
        const active = learnedPlayers().includes(attacker);
        const records = Memory.routingAggressors || (Memory.routingAggressors = {});
        // Define an own property so arbitrary player names cannot hit Object.prototype.
        Object.defineProperty(records, attacker, { enumerable: true, configurable: true,
            writable: true, value: { room: room.name, tick: Game.time - 1 } });
        invalidateLearnedPlayers();
        if (!active) console.log(`[transit] ${attacker} attacked our creep in ${room.name}; avoiding known territory for ${avoidTicks()} ticks`);
    }
}

global.avoidPlayer = function (name) {
    if (typeof name !== "string" || !name.trim()) return false;
    Memory.settings = Memory.settings || {};
    Memory.settings.routing = Memory.settings.routing || {};
    Memory.settings.routing.avoidPlayers = Array.from(new Set(manualPlayers().concat(name)));
    console.log(`[transit] avoiding ${name}`);
    return true;
};

global.allowPlayer = function (name) {
    if (typeof name !== "string" || !name.trim()) return false;
    Memory.settings = Memory.settings || {};
    Memory.settings.routing = Memory.settings.routing || {};
    Memory.settings.routing.avoidPlayers = manualPlayers().filter((player) => player !== name);
    if (Memory.routingAggressors) delete Memory.routingAggressors[name];
    invalidateLearnedPlayers();
    console.log(`[transit] transit allowed for ${name}; a new confirmed attack can block it again`);
    return true;
};

global.routeAvoidStatus = function () {
    const learned = learnedPlayers().map((name) => ({ name,
        room: Memory.routingAggressors[name].room, tick: Memory.routingAggressors[name].tick,
        remaining: avoidTicks() - (Game.time - Memory.routingAggressors[name].tick) }));
    const status = { manual: manualPlayers(), learned, learnAllyAttacks: config.get("routing.learnAllyAttacks", true) };
    console.log(JSON.stringify(status));
    return status;
};

function reset() {
    seenTick = -1;
    scannedRooms = new Set();
    ownIds = new Map();
    territories = new Map();
    territoryVersion = 0;
    epoch = undefined;
    invalidateLearnedPlayers();
}

module.exports = { observeRoom, isBlockedRoom, policyKey, restrictionKey, reset };
