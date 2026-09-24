/* Offline smoke test: load the bot and run main.loop() over three consecutive
 * ticks with a small populated world (1 owned room, spawn, source, controller,
 * tower, and one creep per economy role). Catches module-load errors, main-loop
 * plumbing, the Memory de-serialization cache path (C2), that terrain stays out
 * of Memory (C3), and any exception in the hot role/structure paths (surfaced
 * via the per-subsystem guard's console.log). */

const path = require("path");
const fs = require("fs");
// repo root: argv override, else one level up from test/
const PROJECT = process.argv[2] || path.resolve(__dirname, "..");

global._ = require(path.join(PROJECT, "node_modules/lodash"));

const constants = {
    OK: 0, ERR_NOT_IN_RANGE: -9, ERR_NOT_ENOUGH_ENERGY: -6, ERR_BUSY: -4,
    ERR_NO_PATH: -2, ERR_INVALID_TARGET: -7, ERR_TIRED: -11,
    ERR_NOT_ENOUGH_RESOURCES: -6, ERR_FULL: -8, ERR_INVALID_ARGS: -10,
    FIND_SOURCES: 105, FIND_SOURCES_ACTIVE: 104, FIND_MINERALS: 116,
    FIND_STRUCTURES: 107, FIND_MY_STRUCTURES: 108, FIND_MY_SPAWNS: 112,
    FIND_MY_CONSTRUCTION_SITES: 114, FIND_DROPPED_RESOURCES: 106,
    FIND_HOSTILE_CREEPS: 103, FIND_MY_CREEPS: 102, FIND_HOSTILE_STRUCTURES: 109,
    FIND_CREEPS: 101, FIND_RUINS: 123, FIND_TOMBSTONES: 118,
    FIND_EXIT_TOP: 1, FIND_EXIT_RIGHT: 3, FIND_EXIT_BOTTOM: 5, FIND_EXIT_LEFT: 7,
    TOP: 1, TOP_RIGHT: 2, RIGHT: 3, BOTTOM_RIGHT: 4,
    BOTTOM: 5, BOTTOM_LEFT: 6, LEFT: 7, TOP_LEFT: 8,
    LOOK_CREEPS: "creep", LOOK_SOURCES: "source", LOOK_MINERALS: "mineral",
    LOOK_TERRAIN: "terrain", LOOK_STRUCTURES: "structure",
    LOOK_CONSTRUCTION_SITES: "constructionSite",
    TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2,
    STRUCTURE_SPAWN: "spawn", STRUCTURE_EXTENSION: "extension",
    STRUCTURE_ROAD: "road", STRUCTURE_WALL: "constructedWall",
    STRUCTURE_RAMPART: "rampart", STRUCTURE_LINK: "link",
    STRUCTURE_STORAGE: "storage", STRUCTURE_TOWER: "tower",
    STRUCTURE_CONTAINER: "container", STRUCTURE_LAB: "lab",
    STRUCTURE_TERMINAL: "terminal", STRUCTURE_NUKER: "nuker",
    STRUCTURE_FACTORY: "factory", STRUCTURE_OBSERVER: "observer",
    STRUCTURE_POWER_SPAWN: "powerSpawn", STRUCTURE_EXTRACTOR: "extractor",
    STRUCTURE_CONTROLLER: "controller", STRUCTURE_POWER_BANK: "powerBank",
    STRUCTURE_INVADER_CORE: "invaderCore",
    RESOURCE_ENERGY: "energy", RESOURCE_POWER: "power",
    RESOURCES_ALL: ["energy", "power", "pixel"],
    INTERSHARD_RESOURCES: ["pixel"],
    ORDER_BUY: "buy", ORDER_SELL: "sell",
    WORK: "work", CARRY: "carry", MOVE: "move", TOUGH: "tough",
    HEAL: "heal", ATTACK: "attack", RANGED_ATTACK: "ranged_attack", CLAIM: "claim",
    BODYPART_COST: { work: 100, carry: 50, move: 50, tough: 10, heal: 250,
        attack: 80, ranged_attack: 150, claim: 600 },
    CREEP_SPAWN_TIME: 3, CREEP_LIFE_TIME: 1500, CREEP_CLAIM_LIFE_TIME: 600,
    OBSERVER_RANGE: 10, HARVEST_POWER: 2, ATTACK_POWER: 30, RANGED_ATTACK_POWER: 10,
    // ROADMAP 0081: real, unboosted per-WORK-part power for each action -
    // used by utils/energyLedger.js's formula-based spend estimate
    BUILD_POWER: 5, REPAIR_POWER: 100, UPGRADE_CONTROLLER_POWER: 1,
    TOWER_ENERGY_COST: 10,
    LINK_LOSS_RATIO: 0.03,
    // ROADMAP 0036 revision: BOOSTS is a genuine Screeps-provided global
    // constant (src/ never hardcodes boost multipliers, only consults this
    // live, same principle as REACTIONS/COMMODITIES below) - a small
    // internally-consistent MOCK of just the attack/ranged_attack corner for
    // exercising the code path offline, not the real (much larger) table.
    BOOSTS: {
        attack: { UH: { attack: 2 }, UH2O: { attack: 3 }, XUH2O: { attack: 4 } },
        ranged_attack: {
            KO: { rangedAttack: 2 }, KHO2: { rangedAttack: 3 }, XKHO2: { rangedAttack: 4 },
        },
        work: { LH: { build: 1.5, repair: 1.5 }, LH2O: { upgradeController: 1.5 } },
    },
    CONTROLLER_DOWNGRADE: { 1: 20000, 2: 10000, 3: 20000, 4: 50000, 5: 100000,
        6: 150000, 7: 150000, 8: 200000 },
    // ROADMAP 0051: REACTIONS/COMMODITIES are genuine Screeps-provided
    // global constants - src/ never hardcodes chemistry/recipes, only
    // consults these live. This is a small internally-consistent MOCK for
    // exercising the code paths offline, not the real (much larger)
    // production table the actual server supplies.
    REACTIONS: { H: { O: "OH" }, O: { H: "OH" }, Z: { K: "ZK" }, K: { Z: "ZK" } },
    COMMODITIES: {
        widgetA: { level: 0, amount: 1, cooldown: 20, components: { Z: 20, energy: 20 } },
        widgetB: { level: 3, amount: 1, cooldown: 20, components: { widgetA: 10 } },
    },
};
Object.assign(global, constants);

const big = (arr) => {
    const o = {};
    for (let r = 0; r <= 8; r++) o[r] = arr[r] || 0;
    return o;
};
global.CONTROLLER_DOWNGRADE = {
    1: 20000, 2: 10000, 3: 20000, 4: 40000, 5: 80000, 6: 120000, 7: 150000, 8: 200000,
};
global.CONTROLLER_STRUCTURES = {
    spawn: big([0, 1, 1, 1, 1, 1, 1, 2, 3]),
    extension: big([0, 0, 5, 10, 20, 30, 40, 50, 60]),
    tower: big([0, 0, 0, 1, 1, 2, 2, 3, 6]),
    storage: big([0, 0, 0, 0, 1, 1, 1, 1, 1]),
    link: big([0, 0, 0, 0, 0, 2, 3, 4, 6]),
    terminal: big([0, 0, 0, 0, 0, 0, 1, 1, 1]),
    lab: big([0, 0, 0, 0, 0, 0, 3, 6, 10]),
    tower_: 0,
    extractor: big([0, 0, 0, 0, 0, 0, 1, 1, 1]),
    container: big([5, 5, 5, 5, 5, 5, 5, 5, 5]),
    nuker: big([0, 0, 0, 0, 0, 0, 0, 0, 1]),
    observer: big([0, 0, 0, 0, 0, 0, 0, 0, 1]),
    powerSpawn: big([0, 0, 0, 0, 0, 0, 0, 0, 1]),
    factory: big([0, 0, 0, 0, 0, 0, 0, 1, 1]),
    rampart: big([0, 0, 2500, 2500, 2500, 2500, 2500, 2500, 2500]),
    constructedWall: big([0, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500]),
    road: big([2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500]),
};

// visual-room.js uses dozens of RESOURCE_*/RESOURCE_SYMBOL_* as computed keys at
// load; define every such token found in src/ so bare identifiers don't throw.
const seen = new Set();
(function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) {
            (fs.readFileSync(p, "utf8").match(
                /\b(RESOURCE|SUBSCRIPTION|PIXEL|CPU|ACCESS)_[A-Z_]+\b/g
            ) || []).forEach((k) => seen.add(k));
        }
    }
})(path.join(PROJECT, "src"));
for (const k of seen) if (global[k] === undefined) global[k] = k.toLowerCase();

// --- fake engine ---------------------------------------------------------
const REG = {}; // id -> object, for Game.getObjectById

class RoomObject {}
class RoomPosition {
    constructor(x, y, roomName) { this.x = x; this.y = y; this.roomName = roomName; }
    _filt(a, opts) {
        let list = Array.isArray(a) ? a.slice() : [];
        if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
        return list;
    }
    _closest(a, opts) {
        const list = this._filt(a, opts);
        let best = null;
        for (const o of list) {
            const p = o.pos || o;
            if (!p || p.x === undefined) { if (!best) best = { o, d: Infinity }; continue; }
            const d = Math.max(Math.abs(p.x - this.x), Math.abs(p.y - this.y));
            if (!best || d < best.d) best = { o, d };
        }
        return best ? best.o : null;
    }
    findClosestByPath(a, opts) { return this._closest(a, opts); }
    findClosestByRange(a, opts) { return this._closest(a, opts); }
    findInRange(a, range, opts) { return this._filt(a, opts); }
    lookFor() { return []; }
    createConstructionSite(t) {
        (global.__sites = global.__sites || []).push([this.x, this.y, t]);
        return 0;
    }
    _xy(a, b) {
        if (b !== undefined) return [a, b];
        const p = a && a.pos ? a.pos : a;
        return [p.x, p.y];
    }
    getDirectionTo(a, b) {
        const [tx, ty] = this._xy(a, b);
        const dx = Math.sign(tx - this.x), dy = Math.sign(ty - this.y);
        return { "0,-1": 1, "1,-1": 2, "1,0": 3, "1,1": 4, "0,1": 5,
            "-1,1": 6, "-1,0": 7, "-1,-1": 8 }[dx + "," + dy] || 1;
    }
    getRangeTo(a, b) {
        const [tx, ty] = this._xy(a, b);
        return Math.max(Math.abs(tx - this.x), Math.abs(ty - this.y));
    }
    inRangeTo(a, b, c) {
        // matches real Screeps: a 2-arg call takes a RoomPosition OR any
        // RoomObject (unwraps .pos, like _xy already does for getRangeTo)
        let tx, ty, r;
        if (c === undefined) { [tx, ty] = this._xy(a); r = b; }
        else { tx = a; ty = b; r = c; }
        return Math.max(Math.abs(tx - this.x), Math.abs(ty - this.y)) <= r;
    }
    isNearTo(a, b) {
        const [tx, ty] = this._xy(a, b);
        return Math.max(Math.abs(tx - this.x), Math.abs(ty - this.y)) <= 1;
    }
    isEqualTo(a, b) {
        const [tx, ty] = this._xy(a, b);
        return tx === this.x && ty === this.y;
    }
}
class Structure extends RoomObject {}
class OwnedStructure extends Structure {}
class StructureLink extends OwnedStructure {}
class StructureContainer extends Structure {}
class Creep extends RoomObject {}
// every real creep has this natively (ROADMAP 0052) - a harmless default so
// fixtures that don't care about it don't need their own stub
Creep.prototype.notifyWhenAttacked = function () { return OK; };
class Spawn extends OwnedStructure {}
class Source extends RoomObject {}
class Flag extends RoomObject {}
class Ruin extends RoomObject {}
class Tombstone extends RoomObject {}
class Resource extends RoomObject {}
class ConstructionSite extends RoomObject {}
class RoomVisual {
    line() { return this; } circle() { return this; } text() { return this; }
    rect() { return this; } poly() { return this; } clear() { return this; }
}
class CostMatrix {
    constructor() { this._d = Object.create(null); }
    set(x, y, v) { this._d[x + ":" + y] = v; }
    get(x, y) { return this._d[x + ":" + y] || 0; }
    clone() { const c = new CostMatrix(); Object.assign(c._d, this._d); return c; }
}
const PathFinder = {
    CostMatrix,
    // straight-line path from origin toward the goal, respecting goal.range
    search: (origin, goal, opts) => {
        const g = (goal && goal.pos) || goal || origin;
        const range = (goal && goal.range) || 0;
        const path = [];
        let x = origin.x, y = origin.y, guard = 0;
        while (
            Math.max(Math.abs(g.x - x), Math.abs(g.y - y)) > range &&
            guard++ < 60
        ) {
            x += Math.sign(g.x - x);
            y += Math.sign(g.y - y);
            path.push(new RoomPosition(x, y, origin.roomName));
        }
        return { path, incomplete: false, ops: path.length };
    },
};
class Terrain { get() { return 0; } }
class Room {
    constructor(name) { this.name = name; this.visual = new RoomVisual(); }
    getTerrain() { return new Terrain(); }
    lookForAt() { return []; }
    lookForAtArea() { return []; }
}
Room.Terrain = Terrain;

// exists so utils/move.js can capture a native moveTo at load time
Creep.prototype.moveTo = function () { return OK; };
Creep.prototype.move = function () { return OK; };
Creep.prototype.moveByPath = function () { return OK; };

Object.assign(global, {
    RoomObject, RoomPosition, Structure, OwnedStructure, StructureLink,
    StructureContainer, Creep, Spawn, Source, Flag, Ruin, Tombstone, Resource,
    ConstructionSite, RoomVisual, PathFinder, Room,
});
global.RawMemory = {
    _parsed: null,
    segments: {},
    setActiveSegments: () => {},
    // ROADMAP 0079: utils/stats.js's memory.used - real length isn't
    // important, just that it's a positive number derived from Memory
    get: () => JSON.stringify(Memory),
};
global.Memory = { creeps: {}, rooms: {}, structures: {} };

// --- world --------------------------------------------------------------
function store(energy, cap) {
    return {
        [RESOURCE_ENERGY]: energy,
        getFreeCapacity: () => cap - energy,
        getUsedCapacity: () => energy,
        getCapacity: () => cap,
        energy,
    };
}
const noop = () => OK;

const room = new Room("W1N1");
const controller = Object.assign(new RoomObject(), {
    id: "ctrl", my: true, level: 4, progress: 10, progressTotal: 100,
    ticksToDowngrade: 200000, pos: new RoomPosition(10, 10, "W1N1"),
    owner: { username: "me" }, room,
    // ROADMAP 0036 (D6) - not active by default; tests that need to
    // simulate an error path override activateSafeMode locally
    safeMode: undefined,
    activateSafeMode: () => OK,
});
const source = Object.assign(new Source(), {
    id: "src1", energy: 3000, energyCapacity: 3000,
    pos: new RoomPosition(5, 5, "W1N1"), room,
});
const source2 = Object.assign(new Source(), {
    id: "src2", energy: 3000, energyCapacity: 3000,
    pos: new RoomPosition(44, 8, "W1N1"), room,
});
const mineral = Object.assign(new RoomObject(), {
    id: "min1", mineralType: "H", mineralAmount: 5000,
    pos: new RoomPosition(40, 40, "W1N1"), room,
});
const spawn = Object.assign(new Spawn(), {
    id: "spawn1", name: "Spawn1", my: true, spawning: null,
    energy: 300, energyCapacity: 300, store: store(300, 300),
    hits: 5000, hitsMax: 5000,
    structureType: STRUCTURE_SPAWN, pos: new RoomPosition(25, 25, "W1N1"), room,
    spawnCreep: () => OK,
});
const tower = Object.assign(new OwnedStructure(), {
    id: "tower1", my: true, owner: { username: "me" },
    structureType: STRUCTURE_TOWER, hits: 3000, hitsMax: 3000,
    store: store(1000, 1000), pos: new RoomPosition(26, 26, "W1N1"), room,
    attack: noop, heal: noop, repair: noop, rangedMassAttack: noop,
});
room.controller = controller;
room.storage = null;
[controller, source, source2, mineral, spawn, tower].forEach((o) => (REG[o.id] = o));

// record real (non-dryRun) spawn requests
// {name, role} per real (non-dryRun) spawn - role (not the flavored name,
// ROADMAP 0048) is what tests should key assertions off of.
const spawnCalls = [];
spawn.spawnCreep = (body, name, opts) => {
    if (!opts || !opts.dryRun) {
        spawnCalls.push({ name, role: opts && opts.memory && opts.memory.role });
    }
    return OK;
};

const hostile = Object.assign(new Creep(), {
    id: "hostile1", name: "inv_1", owner: { username: "Invader" },
    pos: new RoomPosition(21, 21, "W1N1"), room,
    hits: 500, hitsMax: 500,
    body: [{ type: "attack" }, { type: "move" }],
});
REG[hostile.id] = hostile;

const findMap = {
    [FIND_SOURCES]: [source, source2],
    [FIND_SOURCES_ACTIVE]: [source, source2],
    [FIND_MINERALS]: [mineral],
    [FIND_STRUCTURES]: [spawn, tower],
    [FIND_MY_STRUCTURES]: [spawn, tower],
    [FIND_MY_SPAWNS]: [spawn],
    [FIND_MY_CONSTRUCTION_SITES]: [],
    [FIND_DROPPED_RESOURCES]: [],
    [FIND_HOSTILE_CREEPS]: [],
    [FIND_MY_CREEPS]: [],
    [FIND_HOSTILE_STRUCTURES]: [],
};
room.find = function (type, opts) {
    let list = findMap[type] || [];
    if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
    else if (opts && typeof opts.filter === "object") {
        list = list.filter((o) =>
            Object.keys(opts.filter).every((k) => o[k] === opts.filter[k])
        );
    }
    return list;
};

function makeCreep(name, role, extra) {
    global.Memory.creeps[name] = { role };
    const c = Object.assign(new Creep(), {
        id: "creep_" + name, name,
        pos: new RoomPosition(20, 20, "W1N1"), room,
        ticksToLive: 500, hits: 100, hitsMax: 100,
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        owner: { username: "me" },
        store: store(25, 50),
        harvest: noop, upgradeController: noop, build: noop, repair: noop,
        transfer: noop, withdraw: noop, pickup: noop, move: noop, moveTo: noop,
        moveByPath: noop, drop: noop, rangedAttack: noop, rangedMassAttack: noop,
        heal: noop, rangedHeal: noop, attack: noop,
    }, extra || {});
    Object.defineProperty(c, "memory", {
        get: () => global.Memory.creeps[name],
    });
    REG[c.id] = c;
    return c;
}

const Game = {
    time: 1000,
    rooms: { W1N1: room },
    creeps: {
        Harv1: makeCreep("Harv1", "harvester"),
        Build1: makeCreep("Build1", "builder"),
        Miner1: makeCreep("Miner1", "miner"),
        Up1: makeCreep("Up1", "upgrader"),
        Boot1: makeCreep("Boot1", "bootstrap"),
        Def1: makeCreep("Def1", "defender", {
            body: [{ type: RANGED_ATTACK }, { type: MOVE }, { type: HEAL }, { type: MOVE }],
        }),
    },
    structures: { spawn1: spawn, tower1: tower },
    spawns: { Spawn1: spawn },
    constructionSites: {},
    gcl: { progress: 1, progressTotal: 10, level: 1 },
    cpu: {
        bucket: 10000, limit: 20, getUsed: () => 1.23,
        // ROADMAP 0079: utils/stats.js's cpu.heap - values are arbitrary,
        // just distinct enough to prove they made it through untouched
        getHeapStatistics: () => ({
            total_heap_size: 20000000, heap_size_limit: 200000000,
            used_heap_size: 15000000, total_available_size: 5000000,
            does_zap_garbage: 0,
        }),
    },
    map: {
        describeExits: () => ({ 1: "W1N2", 3: "W2N1" }),
        getRoomTerrain: () => new Terrain(),
        findExit: () => 1,
        // every distinct pair of rooms is 1 hop apart by default - tests that
        // need a specific distance override this locally
        findRoute: (from, to) => (from === to ? [] : [{ exit: 1, room: to }]),
        // real Chebyshev/"linear" distance math - observer-range tests rely
        // on this being accurate, not a stub
        getRoomLinearDistance: (a, b) => {
            const parse = (n) => {
                const m = /^([EW])(\d+)([NS])(\d+)$/.exec(n);
                let x = Number(m[2]), y = Number(m[4]);
                if (m[1] === "W") x = -x - 1;
                if (m[3] === "N") y = -y - 1;
                return [x, y];
            };
            const [ax, ay] = parse(a);
            const [bx, by] = parse(b);
            return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
        },
        // novice/respawn zone protection - "normal" (available) by default,
        // tests that need to simulate a blocked room override this locally
        getRoomStatus: () => ({ status: "normal", timestamp: null }),
    },
    getObjectById: (id) => REG[id] || null,
    notify: () => {},
};
global.Game = Game;

const census = require(path.join(PROJECT, "src/utils/census"));

// --- run ---------------------------------------------------------------
const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.join(" ")); };

let threw = null;
try {
    const bot = require(path.join(PROJECT, "src/main"));
    for (let i = 0; i < 60; i++) { bot.loop(); Game.time++; }
} catch (e) { threw = e; }

console.log = origLog;

function assert(cond, msg) {
    if (!cond) { console.error("FAIL: " + msg); process.exitCode = 1; }
    else console.log("ok  : " + msg);
}

assert(!threw, "main.loop() ran 3 ticks without throwing" +
    (threw ? "\n      " + (threw.stack || threw) : ""));

const guarded = logs.filter((l) =>
    /^\[(plan|intel|spawn|creep|structure|stats):/.test(l)
);
assert(guarded.length === 0,
    "no subsystem caught an exception" +
    (guarded.length ? "\n      " + guarded.join("\n      ") : ""));

const memStr = JSON.stringify(global.Memory);
assert(!/terrainMatrix|walkMatrix/.test(memStr), "no terrainMatrix/walkMatrix in Memory");
assert(typeof global.Memory.rooms.W1N1 === "object", "intel populated Memory.rooms.W1N1");
assert(Game.creeps.Harv1.memory.role === "hauler",
    "legacy harvester creep was folded into the hauler role");
assert(global.Memory.rooms.W1N1.numberOfHaulers >= 1, "census counted the migrated hauler");

// ROADMAP 0098: public API rejects malformed requests without persisting an
// operation or scheduling a terminal intent.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const before = Memory.terminalOps && Object.keys(Memory.terminalOps.operations || {}).length;
    const invalid = terminalOps.transfer("missing", "also-missing", RESOURCE_ENERGY, 0);
    const after = Memory.terminalOps && Object.keys(Memory.terminalOps.operations || {}).length;
    assert(!invalid.ok && before === after,
        "0098 terminalTransfer rejects invalid rooms/amount without persisting an operation");

    const savedRooms = Game.rooms;
    const terminalStore = (energy, capacity) => ({
        [RESOURCE_ENERGY]: energy,
        getFreeCapacity: () => capacity - energy,
        getUsedCapacity: () => energy,
        getCapacity: () => capacity,
    });
    const makeTerminalRoom = (name, energy) => {
        const testRoom = new Room(name);
        testRoom.controller = { my: true };
        testRoom.storage = { id: name + "-storage", store: terminalStore(energy, 300000) };
        testRoom.terminal = { id: name + "-terminal", cooldown: 0, store: terminalStore(0, 300000), send: () => {
            throw new Error("transfer creation must not call send");
        } };
        return testRoom;
    };
    const from = makeTerminalRoom("W8N8", 10000);
    const to = makeTerminalRoom("W8N9", 0);
    Game.rooms = Object.assign({}, savedRooms, { W8N8: from, W8N9: to });
    const created = terminalOps.transfer("W8N8", "W8N9", RESOURCE_ENERGY, 1000);
    assert(created.ok && Memory.terminalOps.operations[created.id].state === "queued" &&
        Memory.terminalOps.operations[created.id].sourceRoom === "W8N8" &&
        Memory.terminalOps.operations[created.id].targetRoom === "W8N9",
    "0098 terminalTransfer persists source, destination, resource, amount and queued state without send()");
    Game.rooms = savedRooms;
}

{
    const traffic = require(path.join(PROJECT, "src/utils/traffic"));
    const traceCreep = Game.creeps.Harv1;
    const originalSettings = Memory.settings;
    Memory.settings = Memory.settings || {};
    const originalDebug = Memory.settings.debug;
    delete Memory.settings.debug;
    let traceError = null;
    try {
        traffic.recordDirectionIntent(traceCreep, RIGHT);
        traffic.flushScoutTrace();
    } catch (error) { traceError = error; }
    assert(!traceError, "disabled scout intent tracing is a no-op");
    Memory.settings.debug = { scoutTrace: true };
    traceError = null;
    try {
        traffic.recordDirectionIntent(traceCreep, RIGHT);
        traffic.recordMoveToIntent(traceCreep);
        traffic.flushScoutTrace();
    } catch (error) { traceError = error; }
    assert(!traceError, "enabled scout intent tracing records and flushes without throwing");
    Memory.settings.debug = originalDebug;
    Memory.settings = originalSettings;
}

// --- ROADMAP 0079: Memory.stats fields collected on every tick ---------
// (the throttled/dedicated ones - avgBarrierHits, market.credits,
// totalEnergyAssets, hatcheryUptime - get their own block further down,
// they need room/structure state this fixture doesn't have by default)
assert(typeof global.Memory.stats.memory === "object" &&
    global.Memory.stats.memory.used > 0,
    "Memory.stats.memory.used is a positive number (got " +
        (global.Memory.stats.memory && global.Memory.stats.memory.used) + ")");
{
    const heap = global.Memory.stats.cpu.heap;
    assert(heap &&
        heap.total_heap_size === 20000000 &&
        heap.heap_size_limit === 200000000 &&
        heap.used_heap_size === 15000000 &&
        heap.total_available_size === undefined &&
        heap.does_zap_garbage === undefined,
        "Memory.stats.cpu.heap carries only the 3 fields the dashboard reads, " +
            "not total_available_size/does_zap_garbage (got " + JSON.stringify(heap) + ")");
}
assert(global.Memory.stats.persistent &&
    global.Memory.stats.persistent.lastGlobalReset === 1000,
    "Memory.stats.persistent.lastGlobalReset is set once, on the first tick " +
        "(module load = the only 'global reset' a single test process can see), " +
        "and stays there across the other 59 ticks (got " +
        (global.Memory.stats.persistent && global.Memory.stats.persistent.lastGlobalReset) + ")");

// --- ROADMAP 0096: market fair-price engine ----------------------------
const market = require(path.join(PROJECT, "src/utils/market"));
const marketHistoryStore = require(path.join(PROJECT, "src/utils/marketHistoryStore"));
assert(market.weightedMedian([
    { price: 60, volume: 100 },
    { price: 70, volume: 100 },
    { price: 80, volume: 100 },
]) === 70,
    "market temporal median is weighted by snapshot volume");
assert(market.pointwiseFairPrice([
    { buyPrice: 60, sellPrice: 100, buyVolume: 100, sellVolume: 100 },
    { buyPrice: 100, sellPrice: 140, buyVolume: 100, sellVolume: 100 },
]) === 100,
    "market fairPrice is the median of pointwise buy/sell midpoints");
assert(!Object.prototype.hasOwnProperty.call(market, "historyMetrics") &&
    !Object.prototype.hasOwnProperty.call(market, "vwap") &&
    !Object.prototype.hasOwnProperty.call(market, "vwapDepths") &&
    !Object.prototype.hasOwnProperty.call(market, "fairPrice"),
    "market exports only the active temporal fair-price API");
const orderGroups = market.groupOrders([
    { resourceType: "energy", type: ORDER_SELL, price: 20, amount: 100 },
    { resourceType: "pixel", type: ORDER_BUY, price: 500, amount: 2 },
]);
assert(orderGroups.energy.length === 1 && orderGroups.pixel.length === 1,
    "market orders are grouped by resource, including an intershard resource");
{
    let historyCalls = 0;
    let orderCalls = 0;
    Game.market = {
        getAllOrders: () => {
            orderCalls++;
            return [
                { resourceType: "energy", type: ORDER_SELL, price: 70, remainingAmount: 1000, amount: 2000 },
                { resourceType: "energy", type: ORDER_BUY, price: 60, remainingAmount: 1000, amount: 2000 },
                { resourceType: "pixel", type: ORDER_BUY, price: 500, amount: 2 },
            ];
        },
    };
    Memory.settings = Memory.settings || {};
    Memory.settings.market = {
        currentInterval: 10,
        snapshotInterval: 10,
        snapshotWindowTicks: 1000,
    };
 marketHistoryStore.clear(); market.reset();
    Game.time += 100;
    const first = market.scan();
    market.scan();
    assert(orderCalls === 1,
        "market snapshot reads one unfiltered order book");
    assert(first.resources.energy.sellPrice === 70 &&
        first.resources.energy.buyPrice === 60 &&
        first.resources.energy.fairPrice === 65 &&
        first.resources.energy.sampleCount === 1,
        "market snapshot exposes temporal buy/sell medians and fair price");
    Game.time += 9;
    market.scan();
    assert(orderCalls === 1,
        "market scan remains throttled before scanInterval elapses");
    Game.time += 1;
    market.scan();
    assert(orderCalls === 2 && market.snapshot().resources.energy.sampleCount === 2,
        "market scan records another temporal snapshot after snapshotInterval elapses");
    const statsForMarket = require(path.join(PROJECT, "src/utils/stats"));
    statsForMarket();
    assert(Memory.stats.market.fairPrice.energy.fairPrice === 65 &&
        Memory.stats.market.fairPrice.energy.buyPrice === 60 &&
        Memory.stats.market.fairPrice.energy.sellPrice === 70,
        "temporal fair-price snapshot is exported sparsely to Memory.stats for Grafana");
    const marketSummary = global.marketPrice();
    assert(marketSummary.length === 1 && marketSummary[0].resourceType === "energy" &&
        marketSummary[0].fairPrice === 65,
        "marketPrice() without a resource lists only items with temporal fair prices");
    const savedMarket = Game.market;
    delete Game.market;
    let marketCommandError = null;
    try { global.marketPrice("energy"); } catch (error) { marketCommandError = error; }
    assert(!marketCommandError,
        "marketPrice remains null-safe when Game.market is absent");
    Game.market = savedMarket;
    delete Memory.settings.market;
}

// Market temporal history survives a module/global reset through the
// dedicated RawMemory segment, without creating an extra snapshot on reload.
{
    const marketModulePath = path.join(PROJECT, "src/utils/market");
    const historyModulePath = path.join(PROJECT, "src/utils/marketHistoryStore");
    const savedSegment = RawMemory.segments[9];
    const savedTime = Game.time;
    const persistedSegment = RawMemory.segments[9];
    assert(typeof persistedSegment === "string" && persistedSegment.length > 0,
        "market history is persisted in its RawMemory segment");
    delete require.cache[require.resolve(marketModulePath)];
    delete require.cache[require.resolve(historyModulePath)];
    const reloadedMarket = require(marketModulePath);
    Game.time = savedTime;
    const reloadedSnapshot = reloadedMarket.scan();
    assert(reloadedSnapshot.resources.energy.sampleCount === 2,
        "market history rehydrates sampleCount after a global reset");
    assert(reloadedSnapshot.resources.energy.windowCoverageTicks === 10,
        "market history rehydrates its original snapshot window");
 reloadedMarket.reset();
 assert(RawMemory.segments[9] === persistedSegment, "market reset preserves persistent history segment");
 RawMemory.segments[9] = savedSegment;
}

// --- ROADMAP 0096 follow-up: current book vs derived commodity price ---
{
    const originalResources = RESOURCES_ALL;
    const originalMarket = Game.market;
    const originalCommodities = COMMODITIES;
    RESOURCES_ALL = [RESOURCE_ENERGY, "O", "Z", "widgetA"];
    COMMODITIES = Object.assign({}, originalCommodities, {
        energy: { amount: 1, components: { energy: 1 } },
        O: { amount: 1, components: { oxidant: 1 } },
        oxidant: { amount: 1, components: { O: 1 } },
    });
    Game.market = {
        getAllOrders: () => [
            { resourceType: RESOURCE_ENERGY, type: ORDER_BUY, price: 60, remainingAmount: 100 },
            { resourceType: RESOURCE_ENERGY, type: ORDER_SELL, price: 70, remainingAmount: 100 },
            { resourceType: "O", type: ORDER_BUY, price: 30, remainingAmount: 100 },
            { resourceType: "O", type: ORDER_SELL, price: 40, remainingAmount: 100 },
            { resourceType: "Z", type: ORDER_BUY, price: 10, remainingAmount: 100 },
            { resourceType: "Z", type: ORDER_SELL, price: 20, remainingAmount: 100 },
            { resourceType: "widgetA", type: ORDER_BUY, price: 500, remainingAmount: 100 },
            { resourceType: "widgetA", type: ORDER_SELL, price: 600, remainingAmount: 100 },
        ],
    };
    Memory.settings = Memory.settings || {};
    Memory.settings.market = { currentInterval: 10, snapshotInterval: 1000 };
 marketHistoryStore.clear(); market.reset();
    Game.time += 10;
    const commoditySnapshot = market.scan();
    const widget = commoditySnapshot.resources.widgetA;
    const energy = commoditySnapshot.resources[RESOURCE_ENERGY];
    const oxygen = commoditySnapshot.resources.O;
    assert(energy.buyPrice === 60 && energy.sellPrice === 70 && energy.fairPrice === 65 &&
        oxygen.buyPrice === 30 && oxygen.sellPrice === 40 && oxygen.fairPrice === 35,
    "market keeps direct temporal prices for primary resources with reversible commodity recipes");
    assert(widget.currentBuy === 500 && widget.currentSell === 600,
        "market currentBuy/currentSell expose the current best commodity orders");
    assert(widget.buyPrice === 1400 && widget.sellPrice === 1800 && widget.fairPrice === 1600,
        "commodity reference prices derive recursively from components per output unit using direct cyclic inputs");
    const statsForCommodity = require(path.join(PROJECT, "src/utils/stats"));
    statsForCommodity();
    assert(Memory.stats.market.fairPrice.widgetA.currentBuy === 500 &&
        Memory.stats.market.fairPrice.widgetA.currentSell === 600 &&
        Memory.stats.market.fairPrice.widgetA.fairPrice === 1600,
        "Grafana receives current and derived commodity reference prices");
    Game.time += 10;
    Game.market.getAllOrders = () => [
        { resourceType: RESOURCE_ENERGY, type: ORDER_BUY, price: 61, remainingAmount: 100 },
        { resourceType: RESOURCE_ENERGY, type: ORDER_SELL, price: 71, remainingAmount: 100 },
        { resourceType: "Z", type: ORDER_BUY, price: 11, remainingAmount: 100 },
        { resourceType: "Z", type: ORDER_SELL, price: 21, remainingAmount: 100 },
        { resourceType: "widgetA", type: ORDER_BUY, price: 501, remainingAmount: 100 },
        { resourceType: "widgetA", type: ORDER_SELL, price: 601, remainingAmount: 100 },
    ];
    const currentRefresh = market.scan();
    assert(currentRefresh.resources.widgetA.currentBuy === 501 &&
        currentRefresh.resources.widgetA.currentSell === 601,
        "current prices refresh on their own interval");
    assert(currentRefresh.resources.widgetA.sampleCount === 1,
        "a current price refresh does not create an hourly temporal snapshot");
    RESOURCES_ALL = originalResources;
    COMMODITIES = originalCommodities;
    Game.market = originalMarket;
    delete Memory.settings.market;
}

// --- rampart / tower plan checks --------------------------------------
// 0007: the plan lives in a RawMemory segment behind planStore, not in Memory
const planStore = require(path.join(PROJECT, "src/utils/planStore"));
const plan = () => planStore.getPlan("W1N1") || { buildings: [], mincutBoundries: [] };

assert(global.Memory.rooms.W1N1.buildings === undefined &&
    global.Memory.rooms.W1N1.mincutBoundries === undefined,
    "0007: the city plan is no longer stored in Memory.rooms");

const B = plan().buildings;
const towers = B.filter((b) => b.structureType === "tower");
const srcTowers = towers.filter((b) => b.sourceDefense);
const baseTowers = towers.filter((b) => !b.sourceDefense);
const srcRamparts = B.filter((b) => b.structureType === "rampart" && b.sourceDefense);
const bnd = plan().mincutBoundries;

const extractors = B.filter((b) => b.structureType === "extractor");
assert(B.length > 0, "plan produced buildings (planStep=" + global.Memory.rooms.W1N1.planStep + ")");
assert(srcTowers.length === 2, "2 source-defense towers for 2 sources (got " + srcTowers.length + ")");
assert(
    srcTowers.map((t) => t.minimalRCL).sort().join(",") === "5,7",
    "source towers at minimalRCL 5 and 7 (got " + srcTowers.map((t) => t.minimalRCL).sort().join(",") + ")"
);
{
    const conts = B.filter((b) => b.structureType === "container");
    const links = B.filter((b) => b.structureType === "link");
    const cheb = (a, b) =>
        Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    assert(
        srcTowers.every((t) => conts.some((c) => cheb(t, c) === 1)),
        "every source-defense tower is range 1 from a container (miner-feedable)"
    );
    for (const s of findMap[FIND_SOURCES]) {
        const c = conts.find((cc) => cheb(cc, s.pos) <= 1);
        if (!c) continue;
        const nLinks = links.filter((l) => cheb(l, c) === 1).length;
        const nTower = srcTowers.filter((t) => cheb(t, c) === 1).length;
        assert(nLinks >= 1, "source cluster has a collector link at range 1");
        assert(
            nLinks < 2 || nTower === 1,
            "a source cluster only gets a second link if it also has a tower"
        );
    }
}
assert(towers.length <= 6, "total towers within the RCL8 cap of 6 (got " + towers.length + ")");
assert(baseTowers.length === 4, "base keeps 4 towers (1 core + 3 perimeter) (got " + baseTowers.length + ")");
assert(srcRamparts.length >= 6, "ramparts on both source clusters + mineral cluster (got " + srcRamparts.length + ")");
assert(srcRamparts.every((r) => r.minimalRCL === 3), "source ramparts at minimalRCL 3");
assert(extractors.length === 1, "mineral extractor still planned (got " + extractors.length + ")");
assert(
    !B.some((b) =>
        b.structureType === "link" &&
        Math.max(Math.abs(b.x - mineral.pos.x), Math.abs(b.y - mineral.pos.y)) <= 1
    ),
    "no link is planned next to the mineral cluster - a link can only ever move RESOURCE_ENERGY (ROADMAP 0051)"
);

const nukers = B.filter((b) => b.structureType === "nuker");
const observers = B.filter((b) => b.structureType === "observer");
assert(nukers.length === 1 && observers.length === 1,
    "exactly one nuker and one observer are planned, both RCL8-capped in real Screeps (got " +
        nukers.length + " nuker(s), " + observers.length + " observer(s))");
assert(
    nukers.every((n) => Number(n.minimalRCL) === 8) &&
        observers.every((o) => Number(o.minimalRCL) === 8),
    "the nuker and observer only become construction sites at RCL8"
);
assert(
    B.some((b) =>
        b.structureType === "rampart" &&
        b.sourceDefense &&
        Math.max(Math.abs(b.x - mineral.pos.x), Math.abs(b.y - mineral.pos.y)) <= 1
    ),
    "the mineral container also gets a defense rampart"
);
// the container tile must NOT be a mincut boundary anymore
const cont = B.find((b) => b.structureType === "container");
if (cont) {
    const boxed = bnd.some((r) =>
        cont.x >= r.x1 && cont.x <= r.x2 && cont.y >= r.y1 && cont.y <= r.y2
    );
    assert(!boxed, "source container is outside the base perimeter (not in mincutBoundries)");
}

// --- 0007: planStore round-trip + legacy migration -------------------
planStore.setPlan("Wrt1", {
    buildings: [{ x: 1, y: 1, structureType: "spawn" }],
    mincutBoundries: [{ x1: 0, y1: 0, x2: 2, y2: 2 }],
});
assert(planStore.getPlan("Wrt1").buildings[0].structureType === "spawn",
    "planStore set -> get round-trips through the segment");

global.Memory.rooms.Wmig = {
    my: true,
    buildings: [{ x: 9, y: 9, structureType: "tower", minimalRCL: 3 }],
    mincutBoundries: [{ x1: 8, y1: 8, x2: 10, y2: 10 }],
};
const migrated = planStore.getPlan("Wmig");
assert(migrated && migrated.buildings[0].structureType === "tower",
    "planStore migrates a legacy Memory.rooms[x].buildings plan");
assert(global.Memory.rooms.Wmig.buildings === undefined &&
    global.Memory.rooms.Wmig.mincutBoundries === undefined,
    "the legacy plan keys are removed from Memory after migration");

// --- 0013: stamp scoring sums each covered tile's depth, not the origin's -
{
    const architect = require(path.join(PROJECT, "src/rooms/architect"));
    // a fresh, unplanned room - so the scoring isn't confused by W1N1's
    // already-built plan sitting on some of the test coordinates
    Game.rooms.Wscore = {};
    // two candidate 1x2 "?" (road) placements, same origin depth (5) but P2's
    // second cell is deeper (9 vs 5) - the fix should prefer P2.
    const depths = { "5,5": 5, "6,5": 5, "10,5": 5, "11,5": 9 };
    const flood = {
        get: (x, y) => {
            const k = x + "," + y;
            return depths[k] !== undefined ? depths[k] : 1;
        },
    };
    const roadStamp = {
        structures: ["??"],
        rcl: ["33"],
        ramparts: ["  "],
    };
    const picked = architect.findStampLocation("Wscore", roadStamp, flood);
    assert(picked.length && picked[0].x === 10 && picked[0].y === 5,
        "stamp scoring picks the placement with deeper covered tiles, not " +
        "just a deeper origin (got x=" + (picked[0] && picked[0].x) + ")");
    delete Game.rooms.Wscore;
}

// --- 0010: a planned room's planCity early-exits before floodFill ----
{
    const architect = require(path.join(PROJECT, "src/rooms/architect"));
    global.Memory.rooms.W1N1.planned = true;
    let floodCalled = false;
    const origFlood = room.floodFill;
    room.floodFill = (...a) => { floodCalled = true; return origFlood.apply(room, a); };
    let threwPlan = null;
    try { architect(room); } catch (e) { threwPlan = e; }
    room.floodFill = origFlood;
    assert(!threwPlan, "planCity on a planned room does not throw" +
        (threwPlan ? "\n      " + (threwPlan.stack || threwPlan) : ""));
    assert(!floodCalled,
        "0010: planCity early-exits (no floodFill) once a room is planned");
}

// --- scouts only after everything else is satisfied ------------------
assert(
    spawnCalls.length > 0 && !spawnCalls.some((c) => c.role === "scout"),
    "no scout spawned while economy roles still want creeps (phase 1)"
);

// --- ROADMAP 0094: spawn passes energy structures in anchor order -------
{
    const spawning = require(path.join(PROJECT, "src/rooms/spawning"));
    const storage = {
        pos: new RoomPosition(25, 25, "W1N1"),
    };
    const nearStorageExtension = Object.assign(new OwnedStructure(), {
        id: "nearStorageExtension",
        structureType: STRUCTURE_EXTENSION,
        pos: new RoomPosition(26, 25, "W1N1"),
    });
    const farStorageExtension = Object.assign(new OwnedStructure(), {
        id: "farStorageExtension",
        structureType: STRUCTURE_EXTENSION,
        pos: new RoomPosition(5, 5, "W1N1"),
    });
    const storageSpawn = Object.assign(new Spawn(), {
        id: "storageOrderSpawn",
        structureType: STRUCTURE_SPAWN,
        pos: new RoomPosition(40, 40, "W1N1"),
    });
    const storageRoom = {
        name: "StorageOrderRoom",
        storage,
        find: () => [storageSpawn, farStorageExtension, nearStorageExtension],
    };
    const storageOrder = spawning.energyStructuresForSpawn(
        storageRoom,
        storageSpawn
    );
    assert(
        storageOrder[0] === nearStorageExtension,
        "spawn energy structures are ordered closest to storage first"
    );

    const spawnAnchor = Object.assign(new Spawn(), {
        id: "spawnAnchor",
        structureType: STRUCTURE_SPAWN,
        pos: new RoomPosition(10, 10, "W1N1"),
    });
    const nearSpawnExtension = Object.assign(new OwnedStructure(), {
        id: "nearSpawnExtension",
        structureType: STRUCTURE_EXTENSION,
        pos: new RoomPosition(11, 10, "W1N1"),
    });
    const farSpawnExtension = Object.assign(new OwnedStructure(), {
        id: "farSpawnExtension",
        structureType: STRUCTURE_EXTENSION,
        pos: new RoomPosition(40, 40, "W1N1"),
    });
    const noStorageRoom = {
        name: "NoStorageOrderRoom",
        storage: null,
        find: () => [spawnAnchor, farSpawnExtension, nearSpawnExtension],
    };
    const noStorageOrder = spawning.energyStructuresForSpawn(
        noStorageRoom,
        spawnAnchor
    );
    assert(
        noStorageOrder[0] === spawnAnchor &&
            noStorageOrder[1] === nearSpawnExtension,
        "without storage, spawn energy structures are ordered closest to spawn"
    );
}

// --- under attack: spawns should focus on defenders ------------------
console.log = (...a) => { logs.push(a.join(" ")); };
findMap[FIND_HOSTILE_CREEPS] = [hostile];
spawnCalls.length = 0;
let threw2 = null;
try {
    const bot = require(path.join(PROJECT, "src/main"));
    for (let i = 0; i < 6; i++) { bot.loop(); Game.time++; }
} catch (e) { threw2 = e; }
console.log = origLog;

assert(!threw2, "loop survived 6 ticks under attack" +
    (threw2 ? "\n      " + (threw2.stack || threw2) : ""));
const guarded2 = logs.filter((l) =>
    /^\[(plan|intel|spawn|creep|structure|stats):/.test(l)
);
assert(guarded2.length === 0,
    "no subsystem caught an exception under attack" +
    (guarded2.length ? "\n      " + guarded2.slice(0, 4).join("\n      ") : ""));
assert(global.Memory.rooms.W1N1.defenseActive === true, "intel flagged defenseActive");
assert(spawnCalls.length > 0, "something was spawned while under attack");
assert(
    spawnCalls.every((c) =>
        ["defender", "defenderStriker", "defenderMedic", "bootstrap"].includes(c.role)
    ),
    "under attack only defense-related roles (+ bootstrap) spawned (got: " +
        spawnCalls.map((c) => c.role).join(", ") + ")"
);
assert(
    spawnCalls.some((c) => c.role === "defender"),
    "at least one defender spawned under attack"
);

// --- take-cover behavior for unarmed creeps --------------------------
const combat = require(path.join(PROJECT, "src/utils/combat"));
assert(combat.takeCover(Game.creeps.Harv1) === true,
    "unarmed creep takes cover while a threat is close");
assert(combat.takeCover(Game.creeps.Def1) === false,
    "armed defender does not take cover (fights instead)");
// move the creep far away -> safe -> keeps working
Game.creeps.Harv1.pos.getRangeTo = () => 8;
assert(combat.takeCover(Game.creeps.Harv1) === false,
    "unarmed creep out of range keeps working");
Game.creeps.Harv1.pos.getRangeTo = () => 3;
// no defenseActive -> never takes cover
global.Memory.rooms.W1N1.defenseActive = false;
assert(combat.takeCover(Game.creeps.Harv1) === false,
    "no takeCover when the room is not under attack");
global.Memory.rooms.W1N1.defenseActive = true;

// --- planner stall guard: a stamp that never fits must not loop forever ---
console.log = (...a) => { logs.push(a.join(" ")); };
findMap[FIND_HOSTILE_CREEPS] = [];
global.replanRoom("W1N1");
const origFlood3 = room.floodFill;
room.floodFill = () => ({ get: () => 0 }); // nothing ever passes the depth check
let threw3 = null;
try {
    const bot = require(path.join(PROJECT, "src/main"));
    for (let i = 0; i < 130; i++) { bot.loop(); Game.time++; }
} catch (e) { threw3 = e; }
room.floodFill = origFlood3; // don't leak the stub into later tests
console.log = origLog;

assert(!threw3, "planner survived 130 ticks with an unplaceable stamp" +
    (threw3 ? "\n      " + (threw3.stack || threw3) : ""));
assert(
    global.Memory.rooms.W1N1.planned === true ||
        global.Memory.rooms.W1N1.planStep > 7,
    "stuck stamp steps are forced forward (planStep=" +
        global.Memory.rooms.W1N1.planStep + ", planned=" +
        global.Memory.rooms.W1N1.planned + ")"
);
assert(
    logs.some((l) => /stamp could not be placed|stalled, forcing advance/.test(l)),
    "planner logged the forced skip"
);

// --- construction queue: priority order (B) --------------------------
const sites = global.__sites || [];
assert(sites.length > 0, "construction sites were queued (" + sites.length + ")");
assert(
    sites[0][2] === "extension" &&
        sites.slice(0, 7).every(
            (s) => !["road", "rampart", "constructedWall"].includes(s[2])
        ),
    "economy structures are queued before roads/walls (" +
        sites.slice(0, 8).map((s) => s[2]).join(",") + ")"
);
assert(
    (sites.filter((s) => s[2] === "spawn").length || 0) <= 1,
    "does not queue spawns past the RCL cap"
);

// --- hauler role (C) -------------------------------------------------
const hauler = require(path.join(PROJECT, "src/roles/hauler"));
assert(hauler.wanted(room) === 0, "no haulers wanted without source containers");

const srcContainer = Object.assign(new StructureContainer(), {
    id: "cont1", structureType: STRUCTURE_CONTAINER,
    pos: new RoomPosition(6, 5, "W1N1"), room,
    store: Object.assign(store(1800, 2000), {
        getFreeCapacity: () => 200, getUsedCapacity: () => 1800,
    }),
});
srcContainer.pos.findInRange = (type, range, opts) => {
    let list = type === FIND_SOURCES ? [source] : findMap[type] || [];
    list = list.filter((o) => {
        const p = o.pos || o;
        return (
            p && p.x !== undefined &&
            Math.max(Math.abs(p.x - 6), Math.abs(p.y - 5)) <= (range || 1)
        );
    });
    if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
    return list;
};
REG[srcContainer.id] = srcContainer;
findMap[FIND_STRUCTURES].push(srcContainer);
findMap[FIND_MY_STRUCTURES].push(srcContainer);
Game.time++; // bust the per-tick roomCache

assert(hauler.wanted(room) >= 1, "haulers wanted once a source container exists");

const hla = makeCreep("Hla1", "hauler", { store: store(0, 200) });
let hThrew = null;
try { hauler.run(hla); } catch (e) { hThrew = e; }
assert(!hThrew, "hauler.run (empty) does not throw" +
    (hThrew ? "\n      " + (hThrew.stack || hThrew) : ""));
assert(hla.memory.job === "load", "empty hauler is in load mode");

const hlb = makeCreep("Hlb1", "hauler", {
    store: Object.assign(store(200, 200), { getFreeCapacity: () => 0 }),
});
hlb.memory.job = "deliver";
try { hauler.run(hlb); } catch (e) { hThrew = e; }
assert(!hThrew, "hauler.run (full) does not throw" +
    (hThrew ? "\n      " + (hThrew.stack || hThrew) : ""));

// partial load + nothing left to pick up -> must go deliver, not idle
const storageStruct = Object.assign(new Structure(), {
    id: "stor1", structureType: STRUCTURE_STORAGE,
    pos: new RoomPosition(26, 24, "W1N1"), room,
    store: Object.assign(store(5000, 1000000), { getFreeCapacity: () => 995000 }),
});
REG[storageStruct.id] = storageStruct;
room.storage = storageStruct;
srcContainer.store = Object.assign(store(0, 2000), {
    getFreeCapacity: () => 2000, getUsedCapacity: () => 0,
});
Game.time++;

const hlc = makeCreep("Hlc1", "hauler", {
    store: Object.assign(store(80, 200), { getFreeCapacity: () => 120 }),
});
hlc.memory.job = "load";
try { hauler.run(hlc); } catch (e) { hThrew = e; }
assert(!hThrew, "hauler.run (partial load) does not throw" +
    (hThrew ? "\n      " + (hThrew.stack || hThrew) : ""));
assert(hlc.memory.job === "deliver",
    "hauler with a partial load and nothing to pick up switches to deliver");
room.storage = null;

// empty hauler, room dry, but a receiving link exists -> go wait by it
const recvLink = Object.assign(new StructureLink(), {
    id: "rlnk", structureType: STRUCTURE_LINK, my: true,
    pos: new RoomPosition(25, 24, "W1N1"), room,
    store: store(0, 800), isCollector: () => false,
});
REG.rlnk = recvLink;
findMap[FIND_MY_STRUCTURES].push(recvLink);
srcContainer.store = Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 });
Game.time++;
const hld0 = makeCreep("Hld0", "hauler", {
    store: store(0, 200), pos: new RoomPosition(20, 20, "W1N1"),
});
hld0.memory.job = "load";
hld0.moveTo = (t, o) => { hld0._toLink = t && t.id; hld0._range = o && o.range; return OK; };
hauler.run(hld0);
assert(hld0._toLink === "rlnk" && hld0._range === 1,
    "an idle hungry hauler waits next to a receiving link");
findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "rlnk");

// hauler pulls from the base link before anything else
const linkStruct = Object.assign(new StructureLink(), {
    id: "lnk1", structureType: STRUCTURE_LINK, room,
    pos: new RoomPosition(25, 26, "W1N1"),
    store: store(500, 800),
    isCollector: () => false,
});
REG[linkStruct.id] = linkStruct;
findMap[FIND_MY_STRUCTURES].push(linkStruct);
Game.time++;
const hld = makeCreep("Hld1", "hauler", { store: store(0, 200) });
hld.withdraw = (t) => { hld._from = t && t.id; return OK; };
hld.memory.job = "load";
hauler.run(hld);
assert(hld._from === "lnk1", "hauler pulls from the base link first");

// hauler loads from the CLOSEST source container with enough energy, not the
// one holding the most - a far container full of energy isn't worth the trip
// when a nearby one has plenty to give
findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "lnk1");
srcContainer.store = Object.assign(store(1200, 2000), { getFreeCapacity: () => 800 });
const farContainer = Object.assign(new StructureContainer(), {
    id: "farcont", structureType: STRUCTURE_CONTAINER,
    pos: new RoomPosition(44, 9, "W1N1"), room,
    store: Object.assign(store(1900, 2000), { getFreeCapacity: () => 100 }),
});
farContainer.pos.findInRange = (type, range, opts) => {
    let list = type === FIND_SOURCES ? [source2] : findMap[type] || [];
    list = list.filter((o) => {
        const p = o.pos || o;
        return (
            p && p.x !== undefined &&
            Math.max(Math.abs(p.x - 44), Math.abs(p.y - 9)) <= (range || 1)
        );
    });
    if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
    return list;
};
REG.farcont = farContainer;
findMap[FIND_STRUCTURES].push(farContainer);
Game.time++;
const hlf = makeCreep("Hlf1", "hauler", {
    store: store(0, 200), pos: new RoomPosition(7, 5, "W1N1"),
});
hlf.withdraw = (t) => { hlf._from = t && t.id; return OK; };
hlf.memory.job = "load";
hauler.run(hlf);
assert(hlf._from === "cont1",
    "hauler loads from the closest source container, not the far one with more energy (got " +
        hlf._from + ")");
findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "farcont");

// hauler ignores a source container that hasn't built up more than 1000
// energy yet - not worth a trip for a small amount
srcContainer.store = Object.assign(store(900, 2000), { getFreeCapacity: () => 1100 });
Game.time++;
const hlg = makeCreep("Hlg1", "hauler", {
    store: store(0, 200), pos: new RoomPosition(7, 5, "W1N1"),
});
hlg.withdraw = (t) => { hlg._from = t && t.id; return OK; };
hlg.memory.job = "load";
hauler.run(hlg);
assert(hlg._from !== "cont1",
    "hauler does not load from a source container with 1000 energy or less");

// hauler does NOT pull from storage when no consumer needs energy
findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "lnk1");
room.storage = Object.assign(new Structure(), {
    id: "stor3", structureType: STRUCTURE_STORAGE, room,
    pos: new RoomPosition(26, 24, "W1N1"),
    store: Object.assign(store(5000, 1000000), { getFreeCapacity: () => 990000 }),
});
REG.stor3 = room.storage;
spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 });
tower.store = Object.assign(store(1000, 1000), { getFreeCapacity: () => 0 });
srcContainer.store = Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 });
Game.time++;
const hle = makeCreep("Hle1", "hauler", { store: store(0, 200) });
hle.withdraw = (t) => { hle._from = t && t.id; return OK; };
hle.memory.job = "load";
hauler.run(hle);
assert(hle._from !== "stor3",
    "hauler does not pull from storage with no consumer to feed");
room.storage = null;

// hauler delivers to a normal tower below reserve, but never to a
// source-defense one (tagged in the plan) - the miner sitting right next to
// it is the only one that feeds it (see miner.js distribute())
tower.store = Object.assign(store(0, 1000), { getFreeCapacity: () => 1000 });
Game.time++;
const hlTowerBaseline = makeCreep("HlTowerBase", "hauler", { store: store(200, 200) });
hlTowerBaseline.transfer = (t) => { hlTowerBaseline._to = t && t.id; return OK; };
hauler.run(hlTowerBaseline);
assert(hlTowerBaseline._to === "tower1",
    "baseline: hauler delivers to a normal tower below reserve");

// A tower at 497/1000 is below the critical refill ratio, but production
// continuity still wins when the spawn is empty (global priority policy).
{
    const savedSpawnStoreHaulerPriority = spawn.store;
    const savedTowerStoreHaulerPriority = tower.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
    tower.store = Object.assign(store(497, 1000), { getFreeCapacity: () => 503 });
    Game.time++;
    const hSpawnPriority = makeCreep("HSpawnPriority", "hauler", { store: store(200, 200) });
    hSpawnPriority.transfer = (t) => { hSpawnPriority._to = t && t.id; return OK; };
    hSpawnPriority.memory.job = "deliver";
    hauler.run(hSpawnPriority);
    assert(hSpawnPriority._to === "spawn1",
        "hauler prioritizes an empty spawn over a tower at 497/1000 (0091)");
    spawn.store = savedSpawnStoreHaulerPriority;
    tower.store = savedTowerStoreHaulerPriority;
}

planStore.mutate("W1N1", (plan) => {
    plan.buildings.push({
        x: tower.pos.x, y: tower.pos.y,
        structureType: STRUCTURE_TOWER, sourceDefense: true, minimalRCL: 5,
    });
});
Game.time++;
const hlTowerTagged = makeCreep("HlTowerTag", "hauler", { store: store(200, 200) });
hlTowerTagged.transfer = (t) => { hlTowerTagged._to = t && t.id; return OK; };
hauler.run(hlTowerTagged);
assert(hlTowerTagged._to !== "tower1",
    "hauler never delivers to a source-defense tower, even below reserve");

// --- ROADMAP 0043: decay-aware dropped-energy floor, storage now outranks
// a source container, and the new storage-floor/lab delivery tiers --------
// RoomPosition.findClosestByPath/findClosestByRange only understand an
// array in this test harness (see the shared RoomPosition._closest at the
// top of the file) - real Screeps also accepts a FIND_* constant. Patch it
// onto one position instance for the FIND_* types the caller asks for,
// falling back to the prototype default (array form) for everything else -
// every other hauler fixture above relies on that default.
function withFindLookup(pos, lists) {
    const origByPath = RoomPosition.prototype.findClosestByPath;
    pos.findClosestByPath = (a, opts) => {
        if (lists[a] === undefined) return origByPath.call(pos, a, opts);
        let list = lists[a];
        if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
        return RoomPosition.prototype._closest.call(pos, list, {});
    };
    return pos;
}

{
    // a 120-energy drop 25 tiles away decays (perTick ~1) to <=100 by the
    // time a hauler would arrive - not worth the trip
    const farDrop = Object.assign(new Resource(), {
        id: "decayfar", resourceType: RESOURCE_ENERGY, amount: 120,
        pos: new RoomPosition(25, 25, "W1N1"),
    });
    REG[farDrop.id] = farDrop;
    Game.time++;
    const hDecayFar = makeCreep("HDecayFar", "hauler", {
        store: store(0, 200),
        pos: withFindLookup(new RoomPosition(0, 0, "W1N1"),
            { [FIND_DROPPED_RESOURCES]: [farDrop] }),
    });
    hDecayFar.pickup = (t) => { hDecayFar._picked = t && t.id; return OK; };
    hDecayFar.memory.job = "load";
    hauler.run(hDecayFar);
    assert(hDecayFar._picked !== "decayfar",
        "a 120-energy drop that would decay to <=100 by arrival is skipped (ROADMAP 0043)");

    // same 120-energy pile, but 1 tile away - barely decays, still worth it
    const nearDrop = Object.assign(new Resource(), {
        id: "decaynear", resourceType: RESOURCE_ENERGY, amount: 120,
        pos: new RoomPosition(20, 21, "W1N1"),
    });
    REG[nearDrop.id] = nearDrop;
    Game.time++;
    const hDecayNear = makeCreep("HDecayNear", "hauler", {
        store: store(0, 200),
        pos: withFindLookup(new RoomPosition(20, 20, "W1N1"),
            { [FIND_DROPPED_RESOURCES]: [nearDrop] }),
    });
    hDecayNear.pickup = (t) => { hDecayNear._picked = t && t.id; return OK; };
    hDecayNear.memory.job = "load";
    hauler.run(hDecayNear);
    assert(hDecayNear._picked === "decaynear",
        "the same pile close enough to still clear 100 by arrival is picked up (ROADMAP 0043)");
}

// --- ROADMAP 0065: spawn/extension hunger (essentialConsumer) skips
// opportunistic ground energy and goes straight for a reliable nearby source
// (receiving link, then storage) instead of chasing whatever dropped pile
// happens to be closest-by-path - a distant one can stall the room's own
// spawning while the hauler treks out to fetch it. tower1 is permanently
// tagged source-defense by this point in the file (see the planStore.mutate
// above), so it never counts toward essentialConsumer here - only spawn does.
{
    const savedSpawnStoreUrgent = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });

    // right next to the hauler - would win findClosestByPath outright
    const urgentDrop = Object.assign(new Resource(), {
        id: "urgentdrop", resourceType: RESOURCE_ENERGY, amount: 200,
        pos: new RoomPosition(20, 21, "W1N1"),
    });
    REG[urgentDrop.id] = urgentDrop;

    const urgentLink = Object.assign(new StructureLink(), {
        id: "urgentlink", structureType: STRUCTURE_LINK, room, my: true,
        pos: new RoomPosition(21, 20, "W1N1"),
        store: store(400, 800), isCollector: () => false,
    });
    REG.urgentlink = urgentLink;
    findMap[FIND_MY_STRUCTURES].push(urgentLink);

    room.storage = Object.assign(new Structure(), {
        id: "urgentstor", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(40, 40, "W1N1"), store: store(50000, 100000),
    });
    REG.urgentstor = room.storage;

    Game.time++;
    const hUrgentLink = makeCreep("HUrgentLink", "hauler", {
        store: store(0, 200),
        pos: withFindLookup(new RoomPosition(20, 20, "W1N1"),
            { [FIND_DROPPED_RESOURCES]: [urgentDrop] }),
    });
    hUrgentLink.pickup = (t) => { hUrgentLink._picked = t && t.id; return OK; };
    hUrgentLink.withdraw = (t) => { hUrgentLink._from = t && t.id; return OK; };
    hUrgentLink.memory.job = "load";
    hauler.run(hUrgentLink);
    assert(hUrgentLink._from === "urgentlink" && !hUrgentLink._picked,
        "spawn hungry (essentialConsumer): hauler pulls from the receiving link " +
            "instead of a closer dropped pile (ROADMAP 0065, got from=" +
            hUrgentLink._from + " picked=" + hUrgentLink._picked + ")");

    // link now dry - storage is next, still ahead of the dropped pile
    findMap[FIND_MY_STRUCTURES] =
        findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "urgentlink");
    Game.time++;
    const hUrgentStor = makeCreep("HUrgentStor", "hauler", {
        store: store(0, 200),
        pos: withFindLookup(new RoomPosition(20, 20, "W1N1"),
            { [FIND_DROPPED_RESOURCES]: [urgentDrop] }),
    });
    hUrgentStor.pickup = (t) => { hUrgentStor._picked = t && t.id; return OK; };
    hUrgentStor.withdraw = (t) => { hUrgentStor._from = t && t.id; return OK; };
    hUrgentStor.memory.job = "load";
    hauler.run(hUrgentStor);
    assert(hUrgentStor._from === "urgentstor" && !hUrgentStor._picked,
        "spawn hungry, no link: hauler pulls from storage instead of a closer " +
            "dropped pile (ROADMAP 0065, got from=" + hUrgentStor._from +
            " picked=" + hUrgentStor._picked + ")");

    // control: same dropped pile, but spawn is satisfied again (no essential
    // consumer) - the old opportunistic behavior (closest dropped pile wins
    // over storage) is unchanged
    spawn.store = savedSpawnStoreUrgent;
    Game.time++;
    const hNotUrgent = makeCreep("HNotUrgent", "hauler", {
        store: store(0, 200),
        pos: withFindLookup(new RoomPosition(20, 20, "W1N1"),
            { [FIND_DROPPED_RESOURCES]: [urgentDrop] }),
    });
    hNotUrgent.pickup = (t) => { hNotUrgent._picked = t && t.id; return OK; };
    hNotUrgent.withdraw = (t) => { hNotUrgent._from = t && t.id; return OK; };
    hNotUrgent.memory.job = "load";
    hauler.run(hNotUrgent);
    assert(hNotUrgent._picked === "urgentdrop",
        "spawn satisfied: hauler still prefers the closer dropped pile over storage " +
            "(unchanged opportunistic behavior, got picked=" + hNotUrgent._picked +
            " from=" + hNotUrgent._from + ")");

    room.storage = null;
}

// --- ROADMAP 0065 follow-up: a backed-up source container (throughput /
// "vazão" problem) makes the hauler drain the receiving link straight into
// storage, even overriding a hungry spawn (essentialConsumer) - draining the
// receiving link is what lets the collector link (and the miner behind it)
// unjam; feeding spawn instead would just leave the jam in place and the
// same check would fire again next load.
{
    const savedSpawnStoreBackup = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });

    const backedLink = Object.assign(new StructureLink(), {
        id: "backedlink", structureType: STRUCTURE_LINK, room, my: true,
        pos: new RoomPosition(21, 20, "W1N1"),
        store: store(400, 800), isCollector: () => false,
    });
    REG.backedlink = backedLink;
    findMap[FIND_MY_STRUCTURES].push(backedLink);

    room.storage = Object.assign(new Structure(), {
        id: "backedstor", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(40, 40, "W1N1"), store: store(50000, 100000),
    });
    REG.backedstor = room.storage;

    // source container backed up right at the threshold (1000)
    srcContainer.store = Object.assign(store(1000, 2000), { getFreeCapacity: () => 1000 });
    Game.time++;
    const hBackedUp = makeCreep("HBackedUp", "hauler", { store: store(0, 200) });
    hBackedUp.withdraw = (t) => { hBackedUp._from = t && t.id; return OK; };
    hBackedUp.memory.job = "load";
    hauler.run(hBackedUp);
    assert(hBackedUp._from === "backedlink" && hBackedUp.memory.forcedDeliver === "storage",
        "a backed-up source container (>=1000) makes the hauler drain the receiving link " +
            "and force delivery to storage, even with spawn hungry (ROADMAP 0065 follow-up, " +
            "got from=" + hBackedUp._from + " forcedDeliver=" + hBackedUp.memory.forcedDeliver + ")");

    // just below the threshold - not backed up, falls back to the plain
    // essentialConsumer link grab (ROADMAP 0065), no forced delivery
    srcContainer.store = Object.assign(store(999, 2000), { getFreeCapacity: () => 1001 });
    Game.time++;
    const hNotBackedUp = makeCreep("HNotBackedUp", "hauler", { store: store(0, 200) });
    hNotBackedUp.withdraw = (t) => { hNotBackedUp._from = t && t.id; return OK; };
    hNotBackedUp.memory.job = "load";
    hauler.run(hNotBackedUp);
    assert(hNotBackedUp._from === "backedlink" && !hNotBackedUp.memory.forcedDeliver,
        "a source container just below the backed-up threshold does not force delivery to " +
            "storage - falls back to the plain essentialConsumer link grab (got from=" +
            hNotBackedUp._from + " forcedDeliver=" + hNotBackedUp.memory.forcedDeliver + ")");

    // backed up, but the receiving link is dry - fails soft into the plain
    // essentialConsumer cascade (storage, since spawn is still hungry)
    srcContainer.store = Object.assign(store(1000, 2000), { getFreeCapacity: () => 1000 });
    backedLink.store = store(0, 800);
    Game.time++;
    const hBackedUpDryLink = makeCreep("HBackedUpDryLink", "hauler", { store: store(0, 200) });
    hBackedUpDryLink.withdraw = (t) => { hBackedUpDryLink._from = t && t.id; return OK; };
    hBackedUpDryLink.memory.job = "load";
    hauler.run(hBackedUpDryLink);
    assert(hBackedUpDryLink._from === "backedstor" && !hBackedUpDryLink.memory.forcedDeliver,
        "backed up but the receiving link is dry: falls back to the plain essentialConsumer " +
            "cascade (storage, spawn still hungry), no forced delivery (got from=" +
            hBackedUpDryLink._from + " forcedDeliver=" + hBackedUpDryLink.memory.forcedDeliver + ")");

    findMap[FIND_MY_STRUCTURES] =
        findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "backedlink");
    room.storage = null;
    spawn.store = savedSpawnStoreBackup;
    srcContainer.store = Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 });
}

{
    // storage above its reserve floor, with a genuine consumer (spawn needs
    // energy - tower1 is tagged source-defense by this point and no longer
    // counts, see essentialConsumer), now outranks a qualifying source
    // container - order used to be container before storage
    const savedSpawnStoreA = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
    srcContainer.store = Object.assign(store(1500, 2000), { getFreeCapacity: () => 500 });
    room.storage = Object.assign(new Structure(), {
        id: "stor5", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(50000, 100000),
    });
    REG.stor5 = room.storage;
    Game.time++;
    const hStorFirst = makeCreep("HStorFirst", "hauler", { store: store(0, 200) });
    hStorFirst.withdraw = (t) => { hStorFirst._from = t && t.id; return OK; };
    hStorFirst.memory.job = "load";
    hauler.run(hStorFirst);
    assert(hStorFirst._from === "stor5",
        "storage above its reserve floor with a real consumer now outranks a qualifying " +
            "source container (ROADMAP 0043, got " + hStorFirst._from + ")");
    room.storage = null;
    spawn.store = savedSpawnStoreA;
    // restore the ambient (empty) container level the roomNeeds tests below expect
    srcContainer.store = Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 });
}

{
    // spawn full, tower permanently tagged source-defense (from the test
    // above) - a lab with free capacity is the next thing worth topping off
    const lab1 = Object.assign(new OwnedStructure(), {
        id: "lab1", structureType: STRUCTURE_LAB, my: true,
        pos: new RoomPosition(30, 30, "W1N1"), room,
        store: Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 }),
    });
    REG.lab1 = lab1;
    findMap[FIND_MY_STRUCTURES].push(lab1);
    room.storage = null;
    Game.time++;
    const hLab = makeCreep("HLab1", "hauler", { store: store(200, 200) });
    hLab.transfer = (t) => { hLab._to = t && t.id; return OK; };
    hauler.run(hLab);
    assert(hLab._to === "lab1",
        "hauler tops off a lab once towers/spawn/storage are all satisfied (ROADMAP 0043)");

    const savedDowngradeTicks = controller.ticksToDowngrade;
    controller.ticksToDowngrade = 1;
    room.storage = Object.assign(new Structure(), {
        id: "storcritlab", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(50000, 100000),
    });
    REG.storcritlab = room.storage;
    Game.time++;
    const hCriticalLab = makeCreep("HCriticalLab", "hauler", { store: store(200, 200) });
    hCriticalLab.transfer = (t) => { hCriticalLab._to = t && t.id; return OK; };
    hauler.run(hCriticalLab);
    assert(hCriticalLab._to !== "lab1",
        "a critical controller blocks new optional lab delivery (0091)");
    controller.ticksToDowngrade = savedDowngradeTicks;
    room.storage = null;
    delete REG.storcritlab;
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "lab1");

    // storage below its own 5% reserve floor outranks topping that same lab
    // off - an empty emergency buffer matters more than a lab's convenience
    findMap[FIND_MY_STRUCTURES].push(lab1);
    room.storage = Object.assign(new Structure(), {
        id: "storlow", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(1000, 100000), // 1%
    });
    REG.storlow = room.storage;
    Game.time++;
    const hStorLow = makeCreep("HStorLow", "hauler", { store: store(200, 200) });
    hStorLow.transfer = (t) => { hStorLow._to = t && t.id; return OK; };
    hauler.run(hStorLow);
    assert(hStorLow._to === "storlow",
        "storage below its 5% reserve floor is filled before topping off a lab (ROADMAP 0043)");
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "lab1");
    room.storage = null;
}

// --- ROADMAP 0043 follow-up: a source-defense tower alone must NOT unlock
// storage as a pickup source - the miner alone feeds it (ROADMAP 0026),
// pickDeliver never targets one, so treating it as "essential" drained
// storage for a need the hauler could never actually satisfy: the withdrawn
// energy had nowhere to go but back into storage on delivery, a pointless
// round trip that looked, from outside, exactly like storage -> storage
// (this was a real bug, not a hypothetical) ---------------------------
{
    const savedSpawnStoreTag = spawn.store;
    const savedTowerStoreTag = tower.store;
    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 });
    tower.store = Object.assign(store(0, 1000), { getFreeCapacity: () => 1000 }); // needy, but tagged source-defense
    room.storage = Object.assign(new Structure(), {
        id: "stornodefense", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(50000, 100000), // well above the floor
    });
    REG.stornodefense = room.storage;
    Game.time++;
    const hNoDefense = makeCreep("HNoDefense", "hauler", { store: store(0, 200) });
    hNoDefense.withdraw = (t) => { hNoDefense._from = t && t.id; return OK; };
    hNoDefense.memory.job = "load";
    hauler.run(hNoDefense);
    assert(hNoDefense._from !== "stornodefense",
        "a source-defense tower alone does not unlock storage as a pickup source " +
            "(ROADMAP 0043 follow-up bug fix, got " + hNoDefense._from + ")");
    room.storage = null;
    spawn.store = savedSpawnStoreTag;
    tower.store = savedTowerStoreTag;
}

// --- ROADMAP 0043 follow-up: a near-full tower (98%, well under
// hauler.toppingOffThreshold free capacity - not the removed satisfactoryRatio
// band, ROADMAP 0072 killed that one entirely) does not count as essential
// either, for the same reason as the source-defense tower above: pickDeliver
// would never actually deliver to it (not critical, and towerDeliverable
// itself excludes anything this close to full), so treating it as needy just
// drains storage for nothing and the energy comes right back on the general
// fallback tier. Towers spend a lot of time near-full (topped off
// periodically, draining slowly), so this was a routine, repeatable bug, not
// a rare corner case -------------------------------------------
{
    const deadZoneTower = Object.assign(new OwnedStructure(), {
        id: "towerdeadzone", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(27, 27, "W1N1"), room,
        store: Object.assign(store(980, 1000), { getFreeCapacity: () => 20 }), // 98% full
    });
    REG.towerdeadzone = deadZoneTower;
    findMap[FIND_MY_STRUCTURES].push(deadZoneTower);
    const savedSpawnStoreDZ = spawn.store;
    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 });
    room.storage = Object.assign(new Structure(), {
        id: "stordeadzone", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(50000, 100000),
    });
    REG.stordeadzone = room.storage;
    Game.time++;
    const hDeadZone = makeCreep("HDeadZone", "hauler", { store: store(0, 200) });
    hDeadZone.withdraw = (t) => { hDeadZone._from = t && t.id; return OK; };
    hDeadZone.memory.job = "load";
    hauler.run(hDeadZone);
    assert(hDeadZone._from !== "stordeadzone",
        "a near-full tower (98%, under hauler.toppingOffThreshold free " +
            "capacity) does not unlock storage as a pickup source " +
            "(ROADMAP 0043 follow-up bug fix, got " + hDeadZone._from + ")");
    room.storage = null;
    spawn.store = savedSpawnStoreDZ;
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter(
        (s) => s.id !== "towerdeadzone"
    );

    // control: a tower with MORE than the topping-off slice missing (90%
    // full, 10% free) still counts and still unlocks storage - the fix only
    // closes the dead zone, it doesn't make towers stop counting altogether
    const toppableTower = Object.assign(new OwnedStructure(), {
        id: "towertoppable", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(28, 28, "W1N1"), room,
        store: Object.assign(store(900, 1000), { getFreeCapacity: () => 100 }), // 90% full
    });
    REG.towertoppable = toppableTower;
    findMap[FIND_MY_STRUCTURES].push(toppableTower);
    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 });
    room.storage = Object.assign(new Structure(), {
        id: "stortoppable", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(50000, 100000),
    });
    REG.stortoppable = room.storage;
    Game.time++;
    const hToppable = makeCreep("HToppable", "hauler", { store: store(0, 200) });
    hToppable.withdraw = (t) => { hToppable._from = t && t.id; return OK; };
    hToppable.memory.job = "load";
    hauler.run(hToppable);
    assert(hToppable._from === "stortoppable",
        "a tower with more than the topping-off slice missing still unlocks storage " +
            "(got " + hToppable._from + ")");
    room.storage = null;
    spawn.store = savedSpawnStoreDZ;
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter(
        (s) => s.id !== "towertoppable"
    );
}

// --- a near-full tower (98%, under hauler.toppingOffThreshold free
// capacity - towerDeliverable's own cutoff, ROADMAP 0072) is deliberately
// skipped by pickDeliver's normal cascade above - not worth a DEDICATED
// trip. With nothing else in the room wanting energy (spawn/ext full, no
// storage to fall back to), a hauler idling full right next to a tower
// that still has room helps nobody -----
{
    const deadZoneTowerFallback = Object.assign(new OwnedStructure(), {
        id: "towerdeadzonefallback", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(27, 27, "W1N1"), room,
        store: Object.assign(store(980, 1000), { getFreeCapacity: () => 20 }), // 98% full - dead zone
    });
    REG.towerdeadzonefallback = deadZoneTowerFallback;
    findMap[FIND_MY_STRUCTURES].push(deadZoneTowerFallback);
    const savedSpawnStoreFB = spawn.store;
    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 });
    room.storage = null;
    Game.time++;
    const hFallback = makeCreep("HFallback", "hauler", { store: store(200, 200) });
    hFallback.transfer = (t) => { hFallback._to = t && t.id; return OK; };
    hauler.run(hFallback);
    assert(hFallback._to === "towerdeadzonefallback",
        "with nothing else to deliver to, a dead-zone tower still gets topped off " +
            "rather than the hauler idling full (got " + hFallback._to + ")");
    spawn.store = savedSpawnStoreFB;
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter(
        (s) => s.id !== "towerdeadzonefallback"
    );
}

// --- ROADMAP 0072 same-day follow-up (user: "vamos matar essa zona morta
// do hauler"): a tower at 55% energy - well past criticalRatio (50%) but
// short of the OLD satisfactoryRatio floor (70%) - used to be invisible to
// towerDeliverable entirely, reachable only via pickDeliver's very last
// resort. Proven here by pitting it against a SECOND, farther tower that
// was already eligible under the old rule (90% full) - if the old dead
// zone still existed, towerDeliverable would only ever match the far one
// (closer one excluded), and findClosestByRange would deliver there
// instead, even though the near one is closer. With the dead zone killed,
// both are equally valid optional-consumer targets and the closer one
// wins, same as any other optionalConsumer tie-break -----------------------
{
    const towerNear = Object.assign(new OwnedStructure(), {
        id: "towernear55", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(21, 21, "W1N1"), room, // close to the hauler's (20,20)
        store: Object.assign(store(550, 1000), { getFreeCapacity: () => 450 }), // 55%
    });
    const towerFar = Object.assign(new OwnedStructure(), {
        id: "towerfar90", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(45, 45, "W1N1"), room, // far from the hauler
        store: Object.assign(store(900, 1000), { getFreeCapacity: () => 100 }), // 90%
    });
    REG.towernear55 = towerNear;
    REG.towerfar90 = towerFar;
    findMap[FIND_MY_STRUCTURES].push(towerNear, towerFar);
    const savedSpawnStoreKZ = spawn.store;
    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 }); // not essential
    room.storage = Object.assign(new Structure(), {
        id: "storkillzone", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"),
        store: Object.assign(store(99999, 100000), { getFreeCapacity: () => 0 }), // above reserve, but full
    });
    REG.storkillzone = room.storage;
    Game.time++;
    const hKillZone = makeCreep("HKillZone", "hauler", { store: store(200, 200) });
    hKillZone.transfer = (t) => { hKillZone._to = t && t.id; return OK; };
    hauler.run(hKillZone);
    assert(hKillZone._to === "towernear55",
        "a 55%-energy tower (above criticalRatio, below the OLD " +
            "satisfactoryRatio floor) is now a valid optional-consumer " +
            "delivery target and wins on proximity over a farther, " +
            "already-toppable 90% tower - the dead zone between the two " +
            "old bands is gone (ROADMAP 0072 same-day follow-up, got " +
            hKillZone._to + ")");
    room.storage = null;
    spawn.store = savedSpawnStoreKZ;
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter(
        (s) => s.id !== "towernear55" && s.id !== "towerfar90"
    );
}

// --- ROADMAP 0074 (user request, refined same-day): a non-critical tower
// is "satisfactory" priority - genuinely optional, gated by
// resourceTiers.aboveReserve like everything else here - but still
// outranks lab/factory/power spawn/controller container within that tier;
// an earlier version of this fix compared the two by distance instead,
// corrected same-day ("torres devem ser prioritárias vs
// lab/factory/container"). Proven here with a farther non-critical tower
// pitted against a CLOSER lab - the tower wins anyway, not the nearer lab -
{
    const towerFarSC = Object.assign(new OwnedStructure(), {
        id: "towerfarsc", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(45, 45, "W1N1"), room, // far from the hauler
        store: Object.assign(store(800, 1000), { getFreeCapacity: () => 200 }), // 80%, non-critical
    });
    const labNearSC = Object.assign(new OwnedStructure(), {
        id: "labnearsc", structureType: STRUCTURE_LAB, my: true,
        pos: new RoomPosition(21, 21, "W1N1"), room, // close to the hauler's (20,20)
        store: Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 }),
    });
    REG.towerfarsc = towerFarSC;
    REG.labnearsc = labNearSC;
    findMap[FIND_MY_STRUCTURES].push(towerFarSC, labNearSC);
    const savedSpawnStoreSC = spawn.store;
    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 }); // not essential
    room.storage = Object.assign(new Structure(), {
        id: "storsatcons", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"),
        store: Object.assign(store(99999, 100000), { getFreeCapacity: () => 0 }), // above reserve, but full
    });
    REG.storsatcons = room.storage;
    Game.time++;
    const hSatCons = makeCreep("HSatCons", "hauler", { store: store(200, 200) });
    hSatCons.transfer = (t) => { hSatCons._to = t && t.id; return OK; };
    hauler.run(hSatCons);
    assert(hSatCons._to === "towerfarsc",
        "a non-critical tower outranks a lab within the satisfactory tier " +
            "even when the lab is closer - defense readiness beats a lab " +
            "errand (satisfactoryConsumer, ROADMAP 0074, got " +
            hSatCons._to + ")");
    room.storage = null;
    spawn.store = savedSpawnStoreSC;
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter(
        (s) => s.id !== "towerfarsc" && s.id !== "labnearsc"
    );
}

// --- ROADMAP 0043 follow-up: the storage reserve floor only protects the
// OPTIONAL uses (lab/controller container) - spawn/ext/tower (essential,
// keeping the room able to spawn/defend itself) must still be able to pull
// from storage even below the floor, since a young room's storage often
// never even reaches 5% of a 1M capacity and blocking that would starve the
// room's own creep production over a buffer nobody asked to protect that
// hard --------------------------------------------------------------------
{
    // spawn needs energy (tower1 is tagged source-defense by this point, so
    // it no longer counts as essential - see essentialConsumer/ROADMAP 0043
    // follow-up) - storage below its 5% floor must still be tapped for it
    const savedSpawnStoreB = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
    room.storage = Object.assign(new Structure(), {
        id: "storcrit", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(1000, 100000), // 1%
    });
    REG.storcrit = room.storage;
    Game.time++;
    const hCritical = makeCreep("HCritical", "hauler", { store: store(0, 200) });
    hCritical.withdraw = (t) => { hCritical._from = t && t.id; return OK; };
    hCritical.memory.job = "load";
    hauler.run(hCritical);
    assert(hCritical._from === "storcrit",
        "an essential consumer (spawn) still pulls from storage below its 5% floor " +
            "(ROADMAP 0043 follow-up, got " + hCritical._from + ")");
    room.storage = null;
    spawn.store = savedSpawnStoreB;
}

{
    // only a lab is needy this time (spawn/tower both full) - storage below
    // its 5% floor must NOT be tapped for it, unlike the essential case above
    const savedSpawnStore = spawn.store;
    const savedTowerStore = tower.store;
    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 });
    tower.store = Object.assign(store(1000, 1000), { getFreeCapacity: () => 0 });
    const lab2 = Object.assign(new OwnedStructure(), {
        id: "lab2", structureType: STRUCTURE_LAB, my: true,
        pos: new RoomPosition(31, 31, "W1N1"), room,
        store: Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 }),
    });
    REG.lab2 = lab2;
    findMap[FIND_MY_STRUCTURES].push(lab2);
    room.storage = Object.assign(new Structure(), {
        id: "storoptional", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(1000, 100000), // 1%
    });
    REG.storoptional = room.storage;
    Game.time++;
    const hOptional = makeCreep("HOptional", "hauler", { store: store(0, 200) });
    hOptional.withdraw = (t) => { hOptional._from = t && t.id; return OK; };
    hOptional.memory.job = "load";
    hauler.run(hOptional);
    assert(hOptional._from !== "storoptional",
        "an optional consumer (lab) does NOT pull storage below its 5% floor " +
            "(ROADMAP 0043 follow-up, got " + hOptional._from + ")");
    findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "lab2");
    room.storage = null;
    spawn.store = savedSpawnStore;
    tower.store = savedTowerStore;
}

// --- ROADMAP 0043 follow-up: terminal - top collection priority, but only
// the ledger-credited (withdrawable) slice, and always straight to storage
// on delivery -------------------------------------------------------------
// ROADMAP 0054 adds a SEPARATE floor on top of the ledger (never drain the
// terminal below logistics.terminalReserveRatio of its own capacity, see
// the dedicated test further below) - disabled here (ratio 0) so this
// block keeps testing only the ledger bookkeeping it was written for,
// against balances that predate that floor's existence.
{
    Memory.settings = Memory.settings || {};
    Memory.settings.logistics = { terminalReserveRatio: 0 };
    const term = Object.assign(new Structure(), {
        id: "term1", structureType: STRUCTURE_TERMINAL, room,
        pos: new RoomPosition(24, 24, "W1N1"), store: store(5000, 300000),
    });
    REG.term1 = term;
    room.terminal = term;
    delete Memory.rooms.W1N1.terminalLedger;

    // first time the terminal is ever seen, with an existing balance (e.g.
    // energy sitting there from before this feature ever shipped) - that
    // balance is the baseline AND immediately withdrawable, not stuck
    // "protected forever" (ROADMAP 0043 follow-up - a real deployment hit
    // exactly that: energy already in the terminal never became available,
    // no matter how long the room ran, because the old rule only ever
    // credited future increases and never re-judged the starting balance)
    Game.time++;
    const hTermFirst = makeCreep("HTermFirst", "hauler", { store: store(0, 200) });
    hTermFirst.withdraw = (t, r, amt) => { hTermFirst._from = t && t.id; hTermFirst._amt = amt; return OK; };
    hTermFirst.memory.job = "load";
    hauler.run(hTermFirst);
    assert(hTermFirst._from === "term1" && hTermFirst._amt === 200,
        "a terminal's existing balance, seen for the first time, is immediately withdrawable " +
            "(ROADMAP 0043 follow-up bug fix, got " + hTermFirst._from + "/" + hTermFirst._amt + ")");
    assert(hTermFirst.memory.forcedDeliver === "storage",
        "picking up from the terminal marks the load for direct delivery to storage");

    // from that baseline on, an increase with NO matching incoming
    // transaction (Game.market.incomingTransactions) - a manual deposit
    // through the game UI leaves no such record - is NOT credited; drain
    // the baseline to 0 first so this increase is the only thing in play
    Memory.rooms.W1N1.terminalLedger = { amount: 0, withdrawable: 0, sinceTick: Game.time };
    term.store = Object.assign(store(1000, 300000), {}); // +1000, unexplained
    Game.time++;
    const hManual = makeCreep("HTermManual", "hauler", { store: store(0, 200) });
    hManual.withdraw = (t) => { hManual._from = t && t.id; return OK; };
    hManual.memory.job = "load";
    hauler.run(hManual);
    assert(hManual._from !== "term1",
        "an increase with no matching incoming transaction (a manual deposit) is never " +
            "credited (ROADMAP 0043 follow-up)");

    // the next increase IS backed by a recorded incoming transaction (an
    // incoming Terminal.send from a sister room, or a market buy settling)
    // - that slice is credited and becomes top pickup priority
    Game.time++;
    Game.market = {
        incomingTransactions: [
            { to: "W1N1", resourceType: RESOURCE_ENERGY, amount: 500, time: Game.time },
        ],
    };
    term.store = Object.assign(store(1500, 300000), {}); // +500, transaction-backed
    const hAuto = makeCreep("HTermAuto", "hauler", { store: store(0, 200) });
    hAuto.withdraw = (t, r, amt) => { hAuto._from = t && t.id; hAuto._amt = amt; return OK; };
    hAuto.memory.job = "load";
    hauler.run(hAuto);
    assert(hAuto._from === "term1" && hAuto._amt === 200,
        "an increase backed by an incoming transaction is credited and picked up first " +
            "(ROADMAP 0043 follow-up, got " + hAuto._from + "/" + hAuto._amt + ")");
    delete Game.market;

    // resetTerminalLedger() console command - the manual lever for a ledger
    // that's already stuck (e.g. saved by an older build that protected the
    // initial balance forever)
    assert(typeof global.resetTerminalLedger === "function",
        "resetTerminalLedger() console command is registered");
    term.store = Object.assign(store(9000, 300000), {}); // pretend a big unexplained pile got stuck
    global.resetTerminalLedger("W1N1");
    assert(Memory.rooms.W1N1.terminalLedger === undefined,
        "resetTerminalLedger() clears the stuck ledger");
    Game.time++;
    const hReset = makeCreep("HReset", "hauler", { store: store(0, 200) });
    hReset.withdraw = (t, r, amt) => { hReset._from = t && t.id; hReset._amt = amt; return OK; };
    hReset.memory.job = "load";
    hauler.run(hReset);
    assert(hReset._from === "term1" && hReset._amt === 200,
        "after a reset, the terminal's current balance is immediately withdrawable again " +
            "(got " + hReset._from + "/" + hReset._amt + ")");

    delete Memory.rooms.W1N1.terminalLedger;
    room.terminal = null;
    delete Memory.settings.logistics;
}

// --- ROADMAP 0054: terminalWithdrawable() never returns a value that would
// drain the terminal below logistics.terminalReserveRatio (10%) of its own
// capacity, even when the ledger says more is withdrawable in theory -----
{
    const floorTerm = Object.assign(new Structure(), {
        id: "termfloor", structureType: STRUCTURE_TERMINAL, room,
        pos: new RoomPosition(24, 24, "W1N1"), store: store(1200, 10000), // 12% full, floor is 10% (1000)
    });
    REG.termfloor = floorTerm;
    room.terminal = floorTerm;
    delete Memory.rooms.W1N1.terminalLedger;

    // first look: the whole 1200 becomes the ledger's baseline/withdrawable,
    // but only 200 of it (1200 - the 1000 floor) may actually be drawn out
    Game.time++;
    const hFloor = makeCreep("HTermFloor", "hauler", { store: store(0, 200) });
    hFloor.withdraw = (t, r, amt) => { hFloor._from = t && t.id; hFloor._amt = amt; return OK; };
    hFloor.memory.job = "load";
    hauler.run(hFloor);
    assert(hFloor._from === "termfloor" && hFloor._amt === 200,
        "near the floor but still 200 above it: exactly that much is withdrawable " +
            "(got " + hFloor._from + "/" + hFloor._amt + ")");

    // right at the floor (10% exactly) - nothing left to withdraw, even
    // though the ledger itself still shows a positive withdrawable balance
    floorTerm.store = Object.assign(store(1000, 10000), {});
    Game.time++;
    const hAtFloor = makeCreep("HTermAtFloor", "hauler", { store: store(0, 200) });
    hAtFloor.withdraw = (t) => { hAtFloor._from = t && t.id; return OK; };
    hAtFloor.memory.job = "load";
    hauler.run(hAtFloor);
    assert(hAtFloor._from !== "termfloor",
        "at the terminal reserve floor: nothing is withdrawable (ROADMAP 0054, got " +
            hAtFloor._from + ")");

    delete Memory.rooms.W1N1.terminalLedger;
    room.terminal = null;
}

{
    // a terminal-sourced load (forcedDeliver: "storage") goes straight to
    // storage, bypassing the normal spawn/tower cascade entirely - even
    // with spawn hungry right now, which would otherwise win
    room.storage = Object.assign(new Structure(), {
        id: "stordest", structureType: STRUCTURE_STORAGE, room,
        pos: new RoomPosition(26, 24, "W1N1"), store: store(0, 100000),
    });
    REG.stordest = room.storage;
    const savedSpawnStore2 = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
    Game.time++;
    const hForced = makeCreep("HForced", "hauler", { store: store(200, 200) });
    hForced.memory.job = "deliver";
    hForced.memory.forcedDeliver = "storage";
    hForced.transfer = (t) => { hForced._to = t && t.id; return OK; };
    hauler.run(hForced);
    assert(hForced._to === "stordest",
        "a terminal-sourced load goes straight to storage, bypassing spawn/tower " +
            "(ROADMAP 0043 follow-up, got " + hForced._to + ")");
    room.storage = null;
    spawn.store = savedSpawnStore2;
}

// --- roomNeeds: one source of truth, scales with room state ----------
const needs = require(path.join(PROJECT, "src/rooms/needs"));
Game.time++;
const n = needs.roomNeeds(room);
assert(n === needs.roomNeeds(room), "roomNeeds is cached within a tick");
assert(n.bootstrap === 0, "bootstrap not wanted with a miner + a hauler present");

const savedMiner = Game.creeps.Miner1;
delete Game.creeps.Miner1;
Game.time++;
assert(needs.roomNeeds(room).bootstrap === 1,
    "bootstrap wanted when the room has no miner");
Game.creeps.Miner1 = savedMiner;

// builder scales with backlog AND is capped by pickable energy
findMap[FIND_MY_CONSTRUCTION_SITES] = [];
room.storage = Object.assign(new Structure(), {
    id: "bst", structureType: STRUCTURE_STORAGE, store: store(3000, 1e6),
});
Game.time++;
assert(needs.roomNeeds(room).builder === 1,
    "builder = 1 with no backlog but energy to repair with");

room.storage = null;
findMap[FIND_DROPPED_RESOURCES] = [];
Game.time++;
assert(needs.roomNeeds(room).builder === 0,
    "builder = 0 when the room has no pickable energy");

findMap[FIND_MY_CONSTRUCTION_SITES] = _.range(10).map((i) => ({
    structureType: "extension", progress: 0, progressTotal: 3000,
    pos: new RoomPosition(30 + i, 30, "W1N1"),
}));
room.storage = Object.assign(new Structure(), {
    id: "bst2", structureType: STRUCTURE_STORAGE, store: store(500000, 1e6),
});
Game.time++;
assert(needs.roomNeeds(room).builder === 1,
    "builder never exceeds 1 with a big backlog and a fat storage");

room.storage = Object.assign(new Structure(), {
    id: "bst3", structureType: STRUCTURE_STORAGE, store: store(800, 1e6),
});
Game.time++;
assert(needs.roomNeeds(room).builder === 1,
    "big backlog but little energy -> only 1 builder");
findMap[FIND_MY_CONSTRUCTION_SITES] = [];
room.storage = null;

room.storage = Object.assign(new Structure(), {
    id: "stor4", store: store(500000, 1000000),
});
Game.time++;
assert(needs.roomNeeds(room).upgrader === 4, "upgrader = 4 with a fat storage");
room.storage = null;
Game.time++;
assert(needs.roomNeeds(room).upgrader === 1, "upgrader = 1 with no storage");

// --- upgrader: incremental autoscale with a per-room cooldown (0040) --
// no storage at all, but nothing left to build and every sink (spawn/ext,
// source container) already topped off - energy has nowhere else to go
room.energyAvailable = 300;
room.energyCapacityAvailable = 300;
srcContainer.store = Object.assign(store(2000, 2000), { getFreeCapacity: () => 0 });
Game.time++;
assert(needs.roomNeeds(room).upgrader === 1,
    "surplus-eligible but the room's autoscale cooldown hasn't elapsed yet - no jump, no step");

Game.time += 30000;
assert(needs.roomNeeds(room).upgrader === 2,
    "cooldown elapsed while eligible -> steps up by exactly 1, never straight to a fixed target");

Game.time += 1;
assert(needs.roomNeeds(room).upgrader === 2,
    "still eligible, but the cooldown hasn't elapsed again yet - stays put");

Game.time += 30000;
assert(needs.roomNeeds(room).upgrader === 3,
    "cooldown elapsed a second time while still eligible -> another +1 step");

// the autoscale delta is capped so an eligible room can't grow forever
Memory.rooms[room.name].autoscale.delta.upgrader = 6;
Memory.rooms[room.name].autoscale.lastAdjustTick = Game.time - 30000;
Game.time += 1;
assert(needs.roomNeeds(room).upgrader === 8,
    "steps up to upgrader.autoscaleMaxCount (8) exactly");
Memory.rooms[room.name].autoscale.lastAdjustTick = Game.time - 30000;
Game.time += 1;
assert(needs.roomNeeds(room).upgrader === 8,
    "does not grow past the cap even with the cooldown open and still eligible");

// no longer eligible (a construction site reappears) -> the SAME cooldown
// now gives steps back one at a time, choosing upgrader because it's the
// only role currently holding a positive delta (hauler stays out of this -
// spawn/ext are full and there's no storage, so its own criterion still
// reads this as upgrader's problem, not a throughput one - see
// haulerBacklogEligible)
findMap[FIND_MY_CONSTRUCTION_SITES] = [{
    structureType: "extension", progress: 0, progressTotal: 3000,
    pos: new RoomPosition(30, 30, "W1N1"),
}];
Memory.rooms[room.name].autoscale.lastAdjustTick = Game.time - 30000;
Game.time += 1;
assert(needs.roomNeeds(room).upgrader === 7,
    "no longer eligible (a construction site is pending) -> steps DOWN by 1 on the next open cooldown");
Memory.rooms[room.name].autoscale.lastAdjustTick = Game.time - 30000;
Game.time += 1;
assert(needs.roomNeeds(room).upgrader === 6,
    "keeps stepping down by 1 per cooldown window while ineligible");

// once the accumulated delta is back to 0, it stops - never goes negative
Memory.rooms[room.name].autoscale.delta.upgrader = 0;
Memory.rooms[room.name].autoscale.lastAdjustTick = Game.time - 30000;
Game.time += 1;
assert(needs.roomNeeds(room).upgrader === 1,
    "delta back to 0 -> plain formula tier, no shrink below the baseline");

findMap[FIND_MY_CONSTRUCTION_SITES] = [];
srcContainer.store = Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 });
room.energyAvailable = undefined;
room.energyCapacityAvailable = undefined;
delete Memory.rooms[room.name].autoscale;

// --- upgrader: RCL8 keeps exactly 1 upkeep upgrader once the downgrade
// timer decays past the wide low-water mark, converts it back to a
// builder once topped off, and never wants more than 1 regardless of a
// stale delta (ROADMAP 0103 follow-up: reverted 0103's unconditional
// zero-demand rule, which left nothing to ever reset ticksToDowngrade
// again - see rooms/needs.js's own comment on the RCL8 branch)
const priorLevel = controller.level;
const priorTicksToDowngrade = controller.ticksToDowngrade;
controller.level = 8;
controller.ticksToDowngrade = 50000; // well below the 50% low-water mark -> wants 1
Memory.rooms[room.name].autoscale = { delta: { upgrader: 5 }, lastAdjustTick: Game.time };
Game.time++;
assert(needs.roomNeeds(room).upgrader === 1,
    "RCL8 wants exactly 1 upkeep upgrader once the downgrade timer is low, even with a stale +5 delta");
controller.ticksToDowngrade = 200000; // == CONTROLLER_DOWNGRADE[8], fully topped off
Game.time++;
assert(needs.roomNeeds(room).upgrader === 1,
    "a stale positive delta still clamps to at most 1 even once topped off - shrink() drains it over time, not instantly");
delete Memory.rooms[room.name].autoscale;

Game.time++;
assert(needs.roomNeeds(room).upgrader === 0,
    "with no stale delta, a fully topped off RCL8 controller wants zero upgraders");

controller.ticksToDowngrade = 100000; // exactly the 50% low-water mark -> not low enough yet
Game.time++;
assert(needs.roomNeeds(room).upgrader === 0,
    "RCL8 does not want the upkeep upgrader right at the low-water mark, only once it decays past it");

controller.ticksToDowngrade = 99999; // 1 tick below the low-water mark
Game.time++;
assert(needs.roomNeeds(room).upgrader === 1,
    "RCL8 wants the upkeep upgrader again once the downgrade timer decays past the low-water mark");

controller.level = priorLevel;
controller.ticksToDowngrade = priorTicksToDowngrade;

// --- hauler: autoscale grow/shrink (ROADMAP 0041) ----------------------
// containers backing up, but spawn/ext still have room to receive more -
// a throughput problem, not "nowhere to put it" (that's upgrader's case,
// see haulerBacklogEligible vs. upgraderSurplusEligible)
room.energyAvailable = 200;
room.energyCapacityAvailable = 300;
srcContainer.store = Object.assign(store(2000, 2000), { getFreeCapacity: () => 0 });
Memory.rooms[room.name].autoscale = { delta: {}, lastAdjustTick: Game.time };
Game.time++;
const haulerBase = needs.roomNeeds(room).hauler;

Game.time += 30000;
assert(needs.roomNeeds(room).hauler === haulerBase + 1,
    "container backing up with spawn/ext still open -> hauler steps up by 1 (throughput problem, not upgrader's)");

// containers now idle (never reach hauler.minContainerLoad) -> gives the
// step back
srcContainer.store = Object.assign(store(0, 2000), { getFreeCapacity: () => 2000 });
Memory.rooms[room.name].autoscale.lastAdjustTick = Game.time - 30000;
Game.time += 1;
assert(needs.roomNeeds(room).hauler === haulerBase,
    "containers idle (never reach hauler.minContainerLoad) -> hauler steps back down");

room.energyAvailable = undefined;
room.energyCapacityAvailable = undefined;
delete Memory.rooms[room.name].autoscale;

// --- builder: absolute autoscale cap ---------------------
// The builder base tier and autoscale must never request more than one.
findMap[FIND_MY_CONSTRUCTION_SITES] = _.range(10).map((i) => ({
    structureType: "extension", progress: 0, progressTotal: 3000,
    pos: new RoomPosition(30 + i, 30, "W1N1"),
}));
room.storage = Object.assign(new Structure(), {
    id: "bstCap1", structureType: STRUCTURE_STORAGE, store: store(600000, 1000000),
});
Memory.rooms[room.name].autoscale = { delta: {}, lastAdjustTick: Game.time };
Game.time++;
assert(needs.roomNeeds(room).builder === 1,
    "big backlog + fat storage still clamps the builder count to 1");

// with the tier already at the cap, autoscale's own grow adds nothing on
// top either, even though builderSurplusEligible is true this whole time
// (backlog pending, pickable energy well above the surplus threshold)
Game.time += 30000;
assert(needs.roomNeeds(room).builder === 1,
    "at the cap already -> autoscale grow does not add on top");
assert((Memory.rooms[room.name].autoscale.delta.builder || 0) === 0,
    "...and doesn't accumulate a delta that would only matter if the cap were raised later");

// a delta accumulated from BEFORE the cap was lowered (e.g. a
// Memory.settings change made after this room had already grown) is
// clamped immediately too - same immediate guarantee as the RCL8 clamp
// for upgrader, no need to wait for shrink to drain it window by window
Memory.rooms[room.name].autoscale.delta.builder = 3;
Game.time++;
assert(needs.roomNeeds(room).builder === 1,
    "a stale delta from before the cap was lowered is clamped immediately too");

// pickable energy drops scarce -> shrink still drains that stale delta by
// 1 per cooldown window, same mechanism as always (checked directly on
// the delta - the visible count was already clamped to 1 either way)
room.storage = Object.assign(new Structure(), {
    id: "bstCap2", structureType: STRUCTURE_STORAGE, store: store(500, 1000000),
});
Memory.rooms[room.name].autoscale.lastAdjustTick = Game.time - 30000;
Game.time += 1;
needs.roomNeeds(room);
assert(Memory.rooms[room.name].autoscale.delta.builder === 2,
    "pickable energy scarce -> shrink still drains the stale delta by 1 per window");

findMap[FIND_MY_CONSTRUCTION_SITES] = [];
room.storage = null;
delete Memory.rooms[room.name].autoscale;

// --- per-room wanted override (0038) ----------------------------------
setWanted(room.name, "upgrader", 4);
Game.time++;
assert(needs.roomNeeds(room).upgrader === 4,
    "setWanted overrides the formula (upgrader would be 1 with no storage)");
setWanted(room.name, "builder", 3);
Game.time++;
assert(needs.roomNeeds(room).upgrader === 4 && needs.roomNeeds(room).builder === 1,
    "overrides on different roles in the same room coexist, but builder stays capped at 1");

setWanted(room.name, "bogusRole", 9);
setWanted(room.name, "upgrader", "not-a-number");
Game.time++;
assert(needs.roomNeeds(room).upgrader === 4 && needs.roomNeeds(room).bogusRole === undefined,
    "unknown role / non-number value is ignored, doesn't corrupt real roles");

clearWanted(room.name, "upgrader");
Game.time++;
assert(needs.roomNeeds(room).upgrader === 1,
    "clearWanted(room, role) reverts just that role to the formula");
assert(needs.roomNeeds(room).builder === 1,
    "clearing one role leaves the other override intact");

clearWanted(room.name);
Game.time++;
assert(needs.roomNeeds(room).builder === 0,
    "clearWanted(room) with no role clears every override for that room (back to 0 - no backlog, no pickable energy here)");

// hauler count: no link network scales with source containers; a full link
// network needs just one, even with a storage
assert(needs.roomNeeds(room).hauler >= 2,
    "hauler count scales with source containers when there is no link network");
const nLink = (col) =>
    Object.assign(new StructureLink(), {
        id: "nl" + (col ? "c" : "r"),
        structureType: STRUCTURE_LINK, my: true,
        pos: new RoomPosition(col ? 6 : 25, col ? 6 : 25, "W1N1"),
        store: store(0, 800), isCollector: () => col,
    });
findMap[FIND_MY_STRUCTURES].push(nLink(true), nLink(false));
room.storage = Object.assign(new Structure(), { id: "st5", store: store(1000, 1e6) });
Game.time++;
assert(needs.roomNeeds(room).hauler === 1,
    "a full link network needs exactly one hauler (even with a storage)");

// an active mineral operation (extractor + container next to the deposit,
// mineral not depleted) shares this room's haulers with the energy loop
// (roles/hauler.js's pickMineralJob) - the base tier bumps from 1 to 2
// while there's real storage to deliver into
const mineralExtractor = Object.assign(new OwnedStructure(), {
    id: "needsMinExtractor1", structureType: STRUCTURE_EXTRACTOR, my: true,
});
const mineralContainer = Object.assign(new StructureContainer(), {
    id: "needsMinContainer1", structureType: STRUCTURE_CONTAINER,
});
const realNeedsMineralFindInRange = mineral.pos.findInRange;
mineral.pos.findInRange = (type, range, opts) => {
    let list = type === FIND_STRUCTURES ? [mineralExtractor, mineralContainer] : [];
    if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
    return list;
};
const savedNeedsMineralAmount = mineral.mineralAmount;
mineral.mineralAmount = 5000;
Game.time++;
assert(needs.roomNeeds(room).hauler === 2,
    "an active mineral operation (extractor + container) bumps the hauler floor to 2 once storage exists");

// depleted deposit -> nothing left to haul, back to the room's normal count
mineral.mineralAmount = 0;
Game.time++;
assert(needs.roomNeeds(room).hauler === 1,
    "a depleted mineral deposit drops the hauler count back down (nothing left to haul)");

mineral.mineralAmount = savedNeedsMineralAmount;
mineral.pos.findInRange = realNeedsMineralFindInRange;
findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter(
    (s) => s.id !== "nlc" && s.id !== "nlr"
);
room.storage = null;

// --- builder: closest energy wins, all types equal -------------------
const builder = require(path.join(PROJECT, "src/roles/builder"));
const nearContainer = Object.assign(new StructureContainer(), {
    id: "bc1", structureType: STRUCTURE_CONTAINER,
    pos: new RoomPosition(24, 25, "W1N1"), room,
    store: store(500, 2000), hits: 250000, hitsMax: 250000,
});
const farDrop = Object.assign(new Resource(), {
    id: "bd1", resourceType: RESOURCE_ENERGY, amount: 300,
    pos: new RoomPosition(5, 20, "W1N1"), room,
});
REG[nearContainer.id] = nearContainer;
REG[farDrop.id] = farDrop;
findMap[FIND_STRUCTURES].push(nearContainer);
findMap[FIND_DROPPED_RESOURCES] = [farDrop];
Game.time++;

const bld = makeCreep("Bld9", "builder", {
    store: store(0, 100), pos: new RoomPosition(23, 25, "W1N1"),
});
let bThrew = null;
try { builder.run(bld); } catch (e) { bThrew = e; }
assert(!bThrew, "builder.run does not throw" +
    (bThrew ? "\n      " + (bThrew.stack || bThrew) : ""));
assert(
    bld.memory.stack &&
        bld.memory.stack[0] &&
        bld.memory.stack[0][0] === "GetEnergy" &&
        bld.memory.stack[0][1] === nearContainer.id,
    "builder takes the closest energy (container), not the far dropped pile"
);
findMap[FIND_DROPPED_RESOURCES] = [];

// a collector link is off-limits: only the miner feeds it
const collectorLink = Object.assign(new StructureLink(), {
    id: "coll1", structureType: STRUCTURE_LINK,
    pos: new RoomPosition(23, 24, "W1N1"), room,
    store: store(700, 800), isCollector: () => true,
});
REG[collectorLink.id] = collectorLink;
findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "bc1");
findMap[FIND_STRUCTURES].push(collectorLink);
Game.time++;
const bld2 = makeCreep("Bld10", "builder", {
    store: store(0, 100), pos: new RoomPosition(23, 25, "W1N1"),
});
builder.run(bld2);
assert(
    !bld2.memory.stack ||
        !bld2.memory.stack.length ||
        bld2.memory.stack[0][1] !== "coll1",
    "builder never withdraws from a collector link"
);
findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "coll1");

// a receiving link is protected while spawn/extensions are critical, even
// when reservations would otherwise deny the link to this builder.
const dryLink = Object.assign(new StructureLink(), {
    id: "drylnk", structureType: STRUCTURE_LINK, my: true,
    pos: new RoomPosition(23, 24, "W1N1"), room,
    store: store(500, 800), isCollector: () => false,
});
REG.drylnk = dryLink;
findMap[FIND_STRUCTURES].push(dryLink);
findMap[FIND_MY_STRUCTURES].push(dryLink);
const dryHauler = makeCreep("DryHaul", "hauler", { store: store(0, 600) });
dryHauler.memory.loadTarget = "drylnk";
Game.creeps.DryHaul = dryHauler;
room.energyAvailable = 200;
room.energyCapacityAvailable = 300;
Game.time++;
const bld3 = makeCreep("Bld11", "builder", {
    store: store(0, 100), pos: new RoomPosition(23, 25, "W1N1"),
});
bld3._withdrew = null;
bld3.withdraw = (t) => { bld3._withdrew = t && t.id; return OK; };
builder.run(bld3);
assert(
    (!bld3.memory.stack || !bld3.memory.stack.length) &&
        bld3._withdrew === null,
    "a builder does not withdraw from a receiving link while spawn/extensions are critical"
);
room.energyAvailable = 300;
findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "drylnk");
Game.time++;
const bld4 = makeCreep("Bld12", "builder", {
    store: store(0, 100), pos: new RoomPosition(23, 25, "W1N1"),
});
bld4._withdrew = null;
bld4.withdraw = (t) => { bld4._withdrew = t && t.id; return OK; };
builder.run(bld4);
assert(
    (!bld4.memory.stack || !bld4.memory.stack.length) &&
        bld4._withdrew === "drylnk",
    "a builder may withdraw from a receiving link once spawn/extensions are stable"
);
delete Game.creeps.DryHaul;
findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "drylnk");
findMap[FIND_MY_STRUCTURES] = findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "drylnk");

// --- builder: prioritizeBuild() forces a specific site first ---------
{
    const nearFinished = Object.assign(new ConstructionSite(), {
        id: "site_near", structureType: "extension",
        progress: 900, progressTotal: 1000,
        pos: new RoomPosition(21, 21, "W1N1"), room,
    });
    const priority = Object.assign(new ConstructionSite(), {
        id: "site_prio", structureType: "road",
        progress: 0, progressTotal: 1000,
        pos: new RoomPosition(40, 40, "W1N1"), room,
    });
    REG[nearFinished.id] = nearFinished;
    REG[priority.id] = priority;
    findMap[FIND_MY_CONSTRUCTION_SITES] = [nearFinished, priority];
    Game.constructionSites = { site_near: nearFinished, site_prio: priority };

    global.prioritizeBuild("site_prio");
    assert(
        global.Memory.settings.buildPriority.length === 1 &&
        global.Memory.settings.buildPriority[0] === "site_prio",
        "prioritizeBuild() records the priority list (single id coerced to array)"
    );

    Game.time++;
    const pbld = makeCreep("PBld1", "builder", {
        store: store(50, 100), pos: new RoomPosition(20, 20, "W1N1"),
    });
    builder.run(pbld);
    assert(
        pbld.memory.stack && pbld.memory.stack[0] &&
            pbld.memory.stack[0][1] === "site_prio",
        "a prioritized site wins over one that is closer to finished"
    );

    // the prioritized site finishes / disappears -> self-cleans and falls
    // back to the normal closest-to-finished heuristic
    delete Game.constructionSites.site_prio;
    findMap[FIND_MY_CONSTRUCTION_SITES] = [nearFinished];
    Game.time++;
    const pbld2 = makeCreep("PBld2", "builder", {
        store: store(50, 100), pos: new RoomPosition(20, 20, "W1N1"),
    });
    builder.run(pbld2);
    assert(
        pbld2.memory.stack && pbld2.memory.stack[0] &&
            pbld2.memory.stack[0][1] === "site_near",
        "a finished/gone priority site is dropped and the builder falls back"
    );
    assert(
        !(global.Memory.settings.buildPriority || []).includes("site_prio"),
        "prioritizeBuild() self-cleans an id that no longer exists"
    );

    global.clearBuildPriority();
    assert(global.Memory.settings.buildPriority === undefined,
        "clearBuildPriority() removes the override");

    findMap[FIND_MY_CONSTRUCTION_SITES] = [];
    Game.constructionSites = {};
}

// --- ROADMAP 0093: builder waits for economic stability ----------------
{
    const builderSite = Object.assign(new ConstructionSite(), {
        id: "builder-stability-site", structureType: STRUCTURE_EXTENSION,
        progress: 0, progressTotal: 1000,
        pos: new RoomPosition(21, 21, "W1N1"), room,
    });
    REG[builderSite.id] = builderSite;
    findMap[FIND_MY_CONSTRUCTION_SITES] = [builderSite];
    Game.constructionSites = { [builderSite.id]: builderSite };

    const savedSpawnStoreBuilderGate = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
    Game.time++;
    const unstableBuilder = makeCreep("BuilderUnstable", "builder", {
        store: store(50, 100), pos: new RoomPosition(20, 20, "W1N1"),
    });
    unstableBuilder._built = false;
    unstableBuilder.build = () => { unstableBuilder._built = true; return OK; };
    builder.run(unstableBuilder);
    assert(unstableBuilder._built,
        "builder with energy keeps working while the room economy is critical (0093)");

    spawn.store = Object.assign(store(300, 300), { getFreeCapacity: () => 0 });
    Game.time++;
    const stableBuilder = makeCreep("BuilderStable", "builder", {
        store: store(50, 100), pos: new RoomPosition(20, 20, "W1N1"),
    });
    stableBuilder._built = false;
    stableBuilder.build = () => { stableBuilder._built = true; return OK; };
    builder.run(stableBuilder);
    assert(stableBuilder._built,
        "builder builds once the room economy is stable (0093)");

    spawn.store = savedSpawnStoreBuilderGate;
    findMap[FIND_MY_CONSTRUCTION_SITES] = [];
    Game.constructionSites = {};
    delete REG[builderSite.id];
}

// --- reservations: economy pickers win a contested pile -------------
const reservations = require(path.join(PROJECT, "src/utils/reservations"));
const contested = Object.assign(new Resource(), {
    id: "rzv1", resourceType: RESOURCE_ENERGY, amount: 400,
    pos: new RoomPosition(25, 25, "W1N1"), room,
});
REG[contested.id] = contested;
const rHaul = makeCreep("Rzv_Haul", "hauler", { store: store(0, 100) });
rHaul.memory.loadTarget = "rzv1";
const rBld = makeCreep("Rzv_Bld", "builder", { store: store(0, 100) });
Game.creeps.Rzv_Haul = rHaul;
Game.creeps.Rzv_Bld = rBld;

Game.time++;
room.energyAvailable = 200;
room.energyCapacityAvailable = 300;
assert(reservations.available(rBld, contested) === 0,
    "a builder yields a contested pile to a hauler while spawn/extensions are hungry");
assert(reservations.available(rHaul, contested) === 400,
    "the hauler still sees the pile it claimed");

Game.time++;
room.energyAvailable = 300;
assert(reservations.available(rBld, contested) >= 50,
    "once spawn/extensions are full the builder may use the contested pile");

// --- reservations: a hauler claim on a big/refilling container only takes
// what it needs, not the whole thing - a builder can still draw the rest --
const contestedContainer = Object.assign(new StructureContainer(), {
    id: "rzv_cont", structureType: STRUCTURE_CONTAINER,
    store: store(1350, 2000),
    pos: new RoomPosition(26, 25, "W1N1"), room,
});
REG[contestedContainer.id] = contestedContainer;
const rHaul2 = makeCreep("Rzv_Haul2", "hauler", { store: store(0, 100) });
rHaul2.memory.loadTarget = "rzv_cont";
const rBld2 = makeCreep("Rzv_Bld2", "builder", { store: store(0, 100) });
Game.creeps.Rzv_Haul2 = rHaul2;
Game.creeps.Rzv_Bld2 = rBld2;

Game.time++;
room.energyAvailable = 200;
room.energyCapacityAvailable = 300;
assert(reservations.available(rBld2, contestedContainer) === 1250,
    "a builder only yields what a hauler still needs from a big container, not the whole 1350 energy");
assert(reservations.available(rHaul2, contestedContainer) === 1350,
    "the hauler claiming the container still sees the full amount");

delete Game.creeps.Rzv_Haul2;
delete Game.creeps.Rzv_Bld2;

delete Game.creeps.Rzv_Haul;
delete Game.creeps.Rzv_Bld;
room.energyAvailable = 300;
room.energyCapacityAvailable = 300;

// --- reservations: pioneer always outranks everyone (ROADMAP 0037
// follow-up) - unlike hauler/bootstrap, this holds even once the room is
// stable (spawn/extensions full) --------------------------------------
{
    const pioneerPile = Object.assign(new Resource(), {
        id: "rzv_pio1", resourceType: RESOURCE_ENERGY, amount: 400,
        pos: new RoomPosition(25, 25, "W1N1"), room,
    });
    REG[pioneerPile.id] = pioneerPile;
    const rPio = makeCreep("Rzv_Pio", "pioneer", { store: store(0, 100) });
    rPio.memory.loadTarget = "rzv_pio1";
    const rHaul3 = makeCreep("Rzv_Haul3", "hauler", { store: store(0, 100) });
    const rBld3 = makeCreep("Rzv_Bld3", "builder", { store: store(0, 100) });
    Game.creeps.Rzv_Pio = rPio;
    Game.creeps.Rzv_Haul3 = rHaul3;
    Game.creeps.Rzv_Bld3 = rBld3;

    Game.time++;
    room.energyAvailable = 200;
    room.energyCapacityAvailable = 300; // room NOT stable
    assert(reservations.available(rHaul3, pioneerPile) === 0,
        "a hauler yields to a pioneer on a contested pile, even though hauler normally outranks it");
    assert(reservations.available(rBld3, pioneerPile) === 0,
        "a builder yields to a pioneer on a contested pile");
    assert(reservations.available(rPio, pioneerPile) === 400,
        "the pioneer sees the full pile regardless of who else wants it");

    Game.time++;
    room.energyAvailable = 300; // room now stable - hauler/builder would be
    room.energyCapacityAvailable = 300; // peers here, but the pioneer still wins
    assert(reservations.available(rHaul3, pioneerPile) === 0,
        "a pioneer still outranks a hauler even once the room is stable (unlike hauler vs builder)");
    assert(reservations.available(rPio, pioneerPile) === 400,
        "the pioneer still sees the full pile once the room is stable");

    // a replenishing container: the loser only cedes what the pioneer needs
    const pioneerContainer = Object.assign(new StructureContainer(), {
        id: "rzv_pio_cont", structureType: STRUCTURE_CONTAINER,
        store: store(1350, 2000), pos: new RoomPosition(26, 25, "W1N1"), room,
    });
    REG[pioneerContainer.id] = pioneerContainer;
    rPio.memory.loadTarget = "rzv_pio_cont";
    Game.time++;
    assert(reservations.available(rHaul3, pioneerContainer) === 1250,
        "a hauler only yields what the pioneer still needs from a big container, not the whole 1350");
    assert(reservations.available(rPio, pioneerContainer) === 1350,
        "the pioneer claiming the container still sees the full amount");

    // two pioneers competing for the same pile split by name, like any peer
    // (same tie-break formula already used for two same-rank creeps
    // anywhere else in this module - untouched by this change)
    rPio.memory.loadTarget = "rzv_pio1"; // back from the container claim above
    const rPio2 = makeCreep("Rzv_Pio2", "pioneer", { store: store(0, 100) });
    rPio2.memory.loadTarget = "rzv_pio1";
    Game.creeps.Rzv_Pio2 = rPio2;
    Game.time++;
    assert(
        reservations.available(rPio, pioneerPile) === 400 &&
            reservations.available(rPio2, pioneerPile) === 300,
        "two competing pioneers split a contested pile by name (peer tie-break) - " +
            "'Rzv_Pio' sorts first and sees the full pile, 'Rzv_Pio2' sees the remainder"
    );

    delete Game.creeps.Rzv_Pio;
    delete Game.creeps.Rzv_Pio2;
    delete Game.creeps.Rzv_Haul3;
    delete Game.creeps.Rzv_Bld3;
    room.energyAvailable = 300;
    room.energyCapacityAvailable = 300;
}

// --- miner: stay seated + feed adjacent tower ------------------------
const miner = require(path.join(PROJECT, "src/roles/miner"));
global.Memory.rooms.W1N1.defenseActive = false;

const mSource = Object.assign(new Source(), {
    id: "msrc", energy: 3000, energyCapacity: 3000,
    pos: new RoomPosition(5, 5, "W1N1"), room,
});
const mContainer = Object.assign(new StructureContainer(), {
    id: "mcont", structureType: STRUCTURE_CONTAINER,
    pos: new RoomPosition(4, 5, "W1N1"), room, store: store(500, 2000),
});
const mTower = Object.assign(new OwnedStructure(), {
    id: "mtwr", structureType: STRUCTURE_TOWER, my: true,
    pos: new RoomPosition(3, 5, "W1N1"), room, store: store(100, 1000),
});
const mLink = Object.assign(new OwnedStructure(), {
    id: "mlink", structureType: STRUCTURE_LINK, my: true,
    pos: new RoomPosition(3, 4, "W1N1"), room, store: store(0, 800),
    isCollector: () => true,
});
REG.msrc = mSource; REG.mcont = mContainer; REG.mtwr = mTower; REG.mlink = mLink;
mSource.pos.findInRange = (type, r, opts) => {
    const all = type === FIND_STRUCTURES ? [mContainer] : [];
    return opts && opts.filter ? all.filter(opts.filter) : all;
};

// 1. a miner shoved onto another source-adjacent tile heads back to its seat
const mDisplaced = Object.assign(Object.create(Creep.prototype), {
    id: "mdis", room, store: store(0, 50),
    pos: new RoomPosition(6, 5, "W1N1"),
    body: [{ type: MOVE }, { type: WORK }, { type: CARRY }],
    harvest: () => OK, transfer: () => OK, withdraw: () => OK, pickup: () => OK,
    move: () => OK,
});
mDisplaced.memory = { role: "miner", target: "msrc", seat: [4, 5], onContainer: true };
mDisplaced.moveTo = (t) => { mDisplaced._to = t && (t.id || t); return OK; };
miner.run(mDisplaced);
assert(mDisplaced._to === "mcont" && mDisplaced.memory.onContainer === false,
    "a displaced miner walks back to its container seat");

// 2. seated miner with energy feeds an adjacent tower that is below reserve,
//    but only once spawns + extensions are full
function seatedMiner(towerEnergy, containerFull, consumersFull) {
    room.energyAvailable = consumersFull === false ? 250 : 300;
    room.energyCapacityAvailable = 300;
    const c = Object.assign(Object.create(Creep.prototype), {
        id: "mseat", room, store: store(50, 50),
        pos: new RoomPosition(4, 5, "W1N1"),
        body: [{ type: MOVE }, { type: WORK }, { type: CARRY }],
        harvest: () => OK, pickup: () => OK, withdraw: () => OK, move: () => OK,
        moveTo: () => OK,
    });
    c.memory = { role: "miner", target: "msrc", seat: [4, 5], onContainer: true };
    c._xfer = null;
    c.transfer = (t) => { c._xfer = t && t.id; return OK; };
    mTower.store = Object.assign(store(towerEnergy, 1000), {
        getCapacity: () => 1000,
        getFreeCapacity: () => 1000 - towerEnergy,
    });
    mContainer.store = containerFull
        ? Object.assign(store(2000, 2000), { getFreeCapacity: () => 0 })
        : Object.assign(store(500, 2000), { getFreeCapacity: () => 1500 });
    c.pos.lookFor = () => [mContainer];
    c.pos.findInRange = (type, r, opts) => {
        const all =
            type === FIND_STRUCTURES
                ? [mContainer, mTower, mLink]
                : type === FIND_MY_STRUCTURES
                ? [mTower, mLink]
                : [];
        return opts && opts.filter ? all.filter(opts.filter) : all;
    };
    Game.time++;
    const savedSpawnStore = spawn.store;
    spawn.store = consumersFull ? store(300, 300) : store(0, 300);
    miner.run(c);
    spawn.store = savedSpawnStore;
    return c._xfer;
}
assert(seatedMiner(100, false, true) === "mtwr",
    "with spawns/extensions full, miner feeds a critical tower");
assert(seatedMiner(600, false, true) === "mlink",
    "without a tower destination, miner uses the collector link");
assert(seatedMiner(600, true, true) === "mlink",
    "a non-critical tower below the topping threshold still uses the link");
assert(seatedMiner(100, false, false) === "mlink",
    "hungry spawn/extensions route miner energy to the link");
assert(seatedMiner(100, true, false) === "mlink",
    "spawn/extension hunger keeps miner on the link even with full buffers");

// 2a. The global economy snapshot uses the real spawn store, not only the
// room energy summary. A hungry spawn routes source energy into the shared
// container before the source-defense tower; active defense keeps the tower
// reservation first.
{
    const savedSpawnStoreMinerPolicy = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
    Game.time++;
    assert(seatedMiner(100, false, false) === "mlink",
        "global critical spawn routes miner energy to the link (0105)");

    Memory.rooms.W1N1.defenseActive = true;
    Game.time++;
    assert(seatedMiner(100, false, false) === "mlink",
        "active defense keeps the critical tower destination (0105)");
    Memory.rooms.W1N1.defenseActive = false;
    spawn.store = savedSpawnStoreMinerPolicy;
}

// 2b. harvesting only happens when it actually goes somewhere: a full
// container with nothing downstream to take the overflow should not be mined
// into further (it would just spill on the ground and decay for nothing)
function seatedMinerHarvest({ containerFull, hasTower, towerEnergy }) {
    room.energyAvailable = 300;
    room.energyCapacityAvailable = 300;
    const c = Object.assign(Object.create(Creep.prototype), {
        id: "mharv", room, store: store(0, 50),
        pos: new RoomPosition(4, 5, "W1N1"),
        body: [{ type: MOVE }, { type: WORK }, { type: CARRY }],
        pickup: () => OK, withdraw: () => OK, move: () => OK, moveTo: () => OK,
        transfer: () => OK,
    });
    c.memory = { role: "miner", target: "msrc", seat: [4, 5], onContainer: true };
    c._harvested = false;
    c.harvest = () => { c._harvested = true; return OK; };
    mContainer.store = containerFull
        ? Object.assign(store(2000, 2000), { getFreeCapacity: () => 0 })
        : Object.assign(store(500, 2000), { getFreeCapacity: () => 1500 });
    if (hasTower) {
        mTower.store = Object.assign(store(towerEnergy, 1000), {
            getCapacity: () => 1000,
            getFreeCapacity: () => 1000 - towerEnergy,
        });
    }
    c.pos.lookFor = () => [mContainer];
    c.pos.findInRange = (type, r, opts) => {
        const all =
            type === FIND_STRUCTURES
                ? hasTower ? [mContainer, mTower] : [mContainer]
                : type === FIND_MY_STRUCTURES
                ? hasTower ? [mTower] : []
                : [];
        return opts && opts.filter ? all.filter(opts.filter) : all;
    };
    miner.run(c);
    return c._harvested;
}
assert(seatedMinerHarvest({ containerFull: false, hasTower: true, towerEnergy: 600 }) === true,
    "container still has room -> miner keeps harvesting");
assert(seatedMinerHarvest({ containerFull: true, hasTower: false }) === false,
    "container full, no link, no tower -> miner stops harvesting instead of spilling energy on the ground");
assert(seatedMinerHarvest({ containerFull: true, hasTower: true, towerEnergy: 100 }) === true,
    "container full but the tower still has room -> miner keeps harvesting for it");
assert(seatedMinerHarvest({ containerFull: true, hasTower: true, towerEnergy: 1000 }) === false,
    "container full and the tower is also full -> miner stops harvesting");

// 3. a non-miner sitting on the seat gets shoved off as the miner arrives
const squatter = Object.assign(Object.create(Creep.prototype), {
    id: "squat", room, fatigue: 0,
    pos: new RoomPosition(4, 5, "W1N1"),
    memory: { role: "builder" },
});
squatter.move = () => { squatter._shoved = true; return OK; };
mContainer.pos.lookFor = () => [squatter];
room.lookForAt = () => [];
const mArriving = Object.assign(Object.create(Creep.prototype), {
    id: "marr", room, store: store(0, 50),
    pos: new RoomPosition(5, 5, "W1N1"),
    body: [{ type: MOVE }, { type: WORK }],
    harvest: () => OK, transfer: () => OK, move: () => OK, moveTo: () => OK,
});
mArriving.memory = { role: "miner", target: "msrc" };
miner.run(mArriving);
assert(squatter._shoved === true,
    "a non-miner on the seat is shoved off when the miner arrives");
mContainer.pos.lookFor = () => [];

// 4. the container was destroyed (or never built) - the miner still parks on
// the plan's container tile instead of wherever `harvest`'s ERR_NOT_IN_RANGE
// fallback happens to walk it, so the energy pile stays on one predictable
// tile for the hauler / the eventual rebuild. A dedicated source far from
// the base plan's real source clusters ((4,4)/(43,7)/(39,39)) avoids one of
// those unrelated containers coincidentally falling within its own 1-tile
// search radius.
const mSource3 = Object.assign(new Source(), {
    id: "msrc3", energy: 3000, energyCapacity: 3000,
    pos: new RoomPosition(20, 20, "W1N1"), room,
});
REG.msrc3 = mSource3;
planStore.mutate("W1N1", (p) => {
    p.buildings.push({ x: 21, y: 21, structureType: STRUCTURE_CONTAINER, minimalRCL: 1 });
});
const mNoContainer = Object.assign(Object.create(Creep.prototype), {
    id: "mnocont", room, store: store(0, 50),
    pos: new RoomPosition(22, 20, "W1N1"),
    body: [{ type: MOVE }, { type: WORK }],
    harvest: () => OK, transfer: () => OK, move: () => OK,
});
mNoContainer.memory = { role: "miner", target: "msrc3" };
let mNoContainerTo = null;
mNoContainer.moveTo = (t) => { mNoContainerTo = t; return OK; };
miner.run(mNoContainer);
assert(mNoContainerTo && mNoContainerTo.x === 21 && mNoContainerTo.y === 21,
    "with the container destroyed, a miner without a seat heads for the plan's container tile instead of the bare source");
assert(mNoContainer.memory.seat && mNoContainer.memory.seat[0] === 21 && mNoContainer.memory.seat[1] === 21,
    "the plan's container tile becomes the miner's seat even without a built container");

// --- traffic: per-tile footfall counter + road repair policy (0008) --
{
    const traffic = require(path.join(PROJECT, "src/utils/traffic"));
    // an isolated room name, untouched by the ~130 main.loop() ticks the
    // rest of the suite already ran against W1N1 - keeps these counts exact
    const TR = "W9N9";
    const trafficRoom = { name: TR };
    const trafficCreep = Object.assign(Object.create(Creep.prototype), {
        pos: new RoomPosition(30, 30, TR), room: trafficRoom,
    });

    assert(traffic.hot(TR).length === 0,
        "hot() is empty for a room with no recorded traffic yet");

    for (let i = 0; i < 60; i++) traffic.record(trafficCreep);
    assert(
        traffic.hot(TR, 50).some((t) => t.x === 30 && t.y === 30) &&
            traffic.isHot(TR, 30, 30, 50),
        "record() accumulates footfall and hot()/isHot() see it once above the threshold"
    );
    assert(!traffic.isHot(TR, 31, 31, 50),
        "isHot() is false for a tile that was never recorded");

    const beforeDecay = traffic.hot(TR, 1)[0].count;
    Game.time += 100; // DECAY_INTERVAL
    traffic.decay();
    const afterDecay = traffic.hot(TR, 1)[0].count;
    assert(afterDecay < beforeDecay,
        "decay() ages the counter down (" + beforeDecay + " -> " + afterDecay + ")");

    // road repair policy: only a road below the floor AND with recent
    // traffic is worth queueing; everything else is either not a road
    // (always worth it) or a cold/healthy road (skip, let it decay)
    const hotRoad = Object.assign(new Structure(), {
        structureType: STRUCTURE_ROAD, hits: 100, hitsMax: 5000,
        pos: new RoomPosition(30, 30, TR), room: trafficRoom,
    });
    const coldRoad = Object.assign(new Structure(), {
        structureType: STRUCTURE_ROAD, hits: 100, hitsMax: 5000,
        pos: new RoomPosition(31, 31, TR), room: trafficRoom,
    });
    const healthyHotRoad = Object.assign(new Structure(), {
        structureType: STRUCTURE_ROAD, hits: 4000, hitsMax: 5000,
        pos: new RoomPosition(30, 30, TR), room: trafficRoom,
    });
    const wall = Object.assign(new Structure(), {
        structureType: STRUCTURE_WALL, hits: 1, hitsMax: 5000,
        pos: new RoomPosition(31, 31, TR), room: trafficRoom,
    });
    assert(traffic.worthRepairing(hotRoad) === true,
        "a road below the repair floor with recent traffic is worth repairing");
    assert(traffic.worthRepairing(coldRoad) === false,
        "a road below the repair floor with NO recent traffic is left to decay");
    assert(traffic.worthRepairing(healthyHotRoad) === false,
        "a road still above the repair floor is skipped even with traffic");
    assert(traffic.worthRepairing(wall) === true,
        "the traffic rule only applies to roads - any other structure type is always worth repairing");
}

// --- builder actually skips a cold planned road end-to-end, and queues it
// once it has recent traffic (0008 acceptance criterion 5) ------------
{
    const traffic2 = require(path.join(PROJECT, "src/utils/traffic"));
    const planStore3 = require(path.join(PROJECT, "src/utils/planStore"));

    // every other damaged structure heals up first, so the cold road below
    // is unambiguously the only repair candidate in the room
    for (const s of findMap[FIND_STRUCTURES]) {
        if (s.hits !== undefined && s.hitsMax !== undefined) s.hits = s.hitsMax;
    }

    planStore3.mutate("W1N1", (plan) => {
        plan.buildings.push({ x: 2, y: 48, structureType: STRUCTURE_ROAD, minimalRCL: 3 });
    });
    const coldPlannedRoad = Object.assign(new Structure(), {
        id: "cold_road", structureType: STRUCTURE_ROAD, hits: 100, hitsMax: 5000,
        pos: new RoomPosition(2, 48, "W1N1"), room,
    });
    REG.cold_road = coldPlannedRoad;
    findMap[FIND_STRUCTURES].push(coldPlannedRoad);
    findMap[FIND_MY_CONSTRUCTION_SITES] = [];
    Game.time++;

    const bRoad = makeCreep("BldRoad", "builder", {
        store: store(50, 50), pos: new RoomPosition(2, 47, "W1N1"),
    });
    builder.run(bRoad);
    assert(
        !bRoad.memory.stack || bRoad.memory.stack[0][1] !== "cold_road",
        "builder does not queue repair for a planned road with no recent traffic, even though it's damaged"
    );

    // the same tile with recent traffic recorded - now it's worth repairing
    for (let i = 0; i < 60; i++) {
        traffic2.record({ pos: coldPlannedRoad.pos, room });
    }
    Game.time++;
    const bRoad2 = makeCreep("BldRoad2", "builder", {
        store: store(50, 50), pos: new RoomPosition(2, 47, "W1N1"),
    });
    builder.run(bRoad2);
    assert(
        bRoad2.memory.stack && bRoad2.memory.stack[0][1] === "cold_road",
        "once the tile has recent traffic, the same damaged road is queued for repair"
    );

    findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "cold_road");
}

// --- travel(): route caching + follow + stuck repath -----------------
const move = require(path.join(PROJECT, "src/utils/move"));
findMap[FIND_CREEPS] = [];
const DIRV = { 1: [0, -1], 2: [1, -1], 3: [1, 0], 4: [1, 1], 5: [0, 1],
    6: [-1, 1], 7: [-1, 0], 8: [-1, -1] };
function stepPos(pos, dir) {
    const d = DIRV[dir] || [0, 0];
    return new RoomPosition(pos.x + d[0], pos.y + d[1], pos.roomName);
}

const walker = Object.assign(Object.create(Creep.prototype), {
    id: "walker", room, fatigue: 0,
    pos: new RoomPosition(10, 10, "W1N1"),
    _moves: [],
});
walker.move = function (dir) {
    this._moves.push(dir);
    this.pos = stepPos(this.pos, dir);
    return OK;
};
walker.memory = {};
const dest = new RoomPosition(15, 10, "W1N1");

walker.moveTo(dest, { range: 0 });
assert(
    walker.memory._m && walker.memory._m.path && walker.memory._m.path.length >= 3,
    "travel cached a path (" +
        (walker.memory._m && walker.memory._m.path.length) + " steps)"
);
assert(walker._moves.length === 1, "travel issued one move on tick 1");
const path1len = walker.memory._m.path.length;

Game.time++;
walker.moveTo(dest, { range: 0 });
assert(walker._moves.length === 2, "travel kept walking the cached path");
assert(walker.memory._m.path.length < path1len,
    "cached path cursor advanced past a reached tile");

walker.pos = new RoomPosition(15, 10, "W1N1");
Game.time++;
const arriveR = walker.moveTo(dest, { range: 0 });
assert(arriveR === OK && !walker.memory._m, "travel clears cache on arrival");

// frozen creep -> must repath
walker.pos = new RoomPosition(10, 10, "W1N1");
walker.move = () => OK;
const realSearch = PathFinder.search;
let searches = 0;
PathFinder.search = function () { searches++; return realSearch.apply(this, arguments); };
for (let i = 0; i < 6; i++) { Game.time++; walker.moveTo(dest, { range: 0 }); }
PathFinder.search = realSearch;
assert(searches >= 2,
    "a frozen creep triggers repathing (" + searches + " searches / 6 ticks)");

const originalRoomTerrain = room.getTerrain;
room.getTerrain = () => ({
    get: (x, y) => x === 46 && y === 11 ? TERRAIN_MASK_WALL : 0,
});
const crossRoomWalker = Object.assign(Object.create(Creep.prototype), {
    id: "crossRoomWalker",
    room,
    fatigue: 0,
    pos: new RoomPosition(45, 10, "W1N1"),
    memory: { _move: { path: "4", dest: { x: 24, y: 0, room: "W1N2" } } },
});
crossRoomWalker.moveTo(new RoomPosition(24, 0, "W1N2"), { reusePath: 30 });
room.getTerrain = originalRoomTerrain;
assert(!crossRoomWalker.memory._move,
    "cross-room movement drops a native path cache whose next tile is a wall");

// --- 0009: an incomplete PathFinder result (a pocket sealed by
// walls/ramparts, best-effort partial path) is refused outright instead of
// being walked as if it reached the destination -----------------------
walker.pos = new RoomPosition(20, 20, "W1N1");
walker.memory = {};
walker.move = () => { throw new Error("travel() must not move on an incomplete path"); };
const pocketDest = new RoomPosition(25, 20, "W1N1");
const realSearch2 = PathFinder.search;
PathFinder.search = () => ({
    path: [new RoomPosition(21, 20, "W1N1")], // a real, non-empty, but partial path
    incomplete: true,
});
const pocketResult = walker.moveTo(pocketDest, { range: 0 });
PathFinder.search = realSearch2;
assert(pocketResult === ERR_NO_PATH,
    "travel() rejects an incomplete PathFinder result as ERR_NO_PATH instead of following the partial path");
assert(!walker.memory._m, "no path gets cached from an incomplete PathFinder result");

// --- 0044: "excuse-me" traffic courtesy -----------------------------
// a parked worker on the path steps aside into a free tile (instead of
// being routed around forever, or shoved blind) when one is available.
// Role "hauler" here just to be a generic non-miner "parked via
// onContainer" worker (isParked() doesn't care about role for this case) -
// the miner is deliberately excluded from excuse-me (see (e)/(f) below), so
// it can't stand in as "a parked worker" in general anymore.
function mkParked(id, x, y) {
    const c = Object.assign(Object.create(Creep.prototype), {
        id, room, my: true, fatigue: 0, _moved: false,
        memory: { role: "hauler", onContainer: true },
        pos: new RoomPosition(x, y, "W1N1"),
    });
    c.move = (d) => { c._moved = true; c._moveDir = d; return OK; };
    return c;
}
function mkMover(id, x, y) {
    const c = Object.assign(Object.create(Creep.prototype), {
        id, room, fatigue: 0, pos: new RoomPosition(x, y, "W1N1"), _moves: [],
    });
    c.move = function (d) { this._moves.push(d); this.pos = stepPos(this.pos, d); return OK; };
    c.memory = {};
    return c;
}
const realLookForAt = room.lookForAt;
const d2 = new RoomPosition(15, 10, "W1N1");

// (a) a single parked blocker with a free tile available steps aside
const parkedMiner = mkParked("pm1", 12, 10);
room.lookForAt = (type, x, y) =>
    type === LOOK_CREEPS && x === 12 && y === 10 ? [parkedMiner] : [];
const w2 = mkMover("w2", 10, 10);
Game.time++; w2.moveTo(d2, { range: 0 });          // step to 11,10
Game.time++; w2.moveTo(d2, { range: 0 });          // next tile 12,10 is the miner
Game.time++; w2.moveTo(d2, { range: 0 });
assert(parkedMiner._moved === true,
    "a parked worker with a free tile to go to steps aside instead of being routed around");
room.lookForAt = realLookForAt;

// (b) a parked blocker with nowhere valid to go is still never shoved -
// the mover routes around it instead (terrain wall on every side)
const parkedBoxedIn = mkParked("pm2", 12, 20);
room.lookForAt = (type, x, y) =>
    type === LOOK_CREEPS && x === 12 && y === 20 ? [parkedBoxedIn] : [];
const realGetTerrain = room.getTerrain;
room.getTerrain = () => ({ get: () => TERRAIN_MASK_WALL });
const w3 = mkMover("w3", 10, 20);
const d3 = new RoomPosition(15, 20, "W1N1");
Game.time++; w3.moveTo(d3, { range: 0 });
Game.time++; w3.moveTo(d3, { range: 0 });
Game.time++; w3.moveTo(d3, { range: 0 });
assert(parkedBoxedIn._moved === false,
    "a parked worker with nowhere valid to go is never shoved");
room.getTerrain = realGetTerrain;
room.lookForAt = realLookForAt;

// (c) a single-file line of TWO parked blockers both step aside at once
// (a corridor jam several creeps deep - moves the whole line in one call)
const parkedFront = mkParked("pm3", 12, 30);
const parkedBack = mkParked("pm4", 13, 30);
room.lookForAt = (type, x, y) => {
    if (type !== LOOK_CREEPS) return [];
    if (x === 12 && y === 30) return [parkedFront];
    if (x === 13 && y === 30) return [parkedBack];
    return [];
};
const w4 = mkMover("w4", 10, 30);
const d4 = new RoomPosition(15, 30, "W1N1");
Game.time++; w4.moveTo(d4, { range: 0 });
Game.time++; w4.moveTo(d4, { range: 0 });
Game.time++; w4.moveTo(d4, { range: 0 });
assert(parkedFront._moved === true && parkedBack._moved === true,
    "a single-file line of parked blockers steps aside together, not just the immediate one");
room.lookForAt = realLookForAt;

// (d) anchor preference: an upgrader prefers a step-aside tile that stays
// within range 3 of the controller (at 10,10) over the first free tile
// (straight ahead would leave range 3 - a tile to the side stays in range)
const upgraderBlocker = Object.assign(Object.create(Creep.prototype), {
    id: "pmU", room, my: true, fatigue: 0,
    memory: { role: "upgrader" },
    pos: new RoomPosition(10, 13, "W1N1"),
});
upgraderBlocker.move = (d) => {
    upgraderBlocker._moved = true;
    upgraderBlocker.pos = stepPos(upgraderBlocker.pos, d);
    return OK;
};
room.lookForAt = (type, x, y) =>
    type === LOOK_CREEPS && x === 10 && y === 13 ? [upgraderBlocker] : [];
const w5 = mkMover("w5", 10, 11);
const d5 = new RoomPosition(10, 20, "W1N1");
Game.time++; w5.moveTo(d5, { range: 0 });          // step to 10,12
Game.time++; w5.moveTo(d5, { range: 0 });          // next tile 10,13 is the upgrader
Game.time++; w5.moveTo(d5, { range: 0 });
assert(
    upgraderBlocker.pos.x === 9 && upgraderBlocker.pos.y === 12,
    "an upgrader steps aside to a tile that stays within range 3 of the controller, not just the first free tile (got " +
        upgraderBlocker.pos.x + "," + upgraderBlocker.pos.y + ")"
);
room.lookForAt = realLookForAt;

// (e) a miner never accepts an excuse-me request, even with a free tile
// available right next to it (unlike the upgrader above) - its job is
// staying on its container seat, so it's always routed around instead
REG.anchorSrc = { id: "anchorSrc", pos: new RoomPosition(20, 40, "W1N1") };
const minerBlocker = Object.assign(Object.create(Creep.prototype), {
    id: "pmM", room, my: true, fatigue: 0, _moved: false,
    memory: { role: "miner", target: "anchorSrc" },
    pos: new RoomPosition(21, 40, "W1N1"),
});
minerBlocker.move = (d) => {
    minerBlocker._moved = true;
    minerBlocker.pos = stepPos(minerBlocker.pos, d);
    return OK;
};
room.lookForAt = (type, x, y) =>
    type === LOOK_CREEPS && x === 21 && y === 40 ? [minerBlocker] : [];
const w6 = mkMover("w6", 19, 40);
const d6 = new RoomPosition(25, 40, "W1N1");
Game.time++; w6.moveTo(d6, { range: 0 });          // step to 20,40 (the source tile itself, walkable)
Game.time++; w6.moveTo(d6, { range: 0 });          // next tile 21,40 is the miner
Game.time++; w6.moveTo(d6, { range: 0 });
assert(minerBlocker._moved === false && minerBlocker.pos.x === 21 && minerBlocker.pos.y === 40,
    "a miner never accepts an excuse-me request, even with a free tile available - it always keeps its container seat");
room.lookForAt = realLookForAt;

// (f) a miner blocking further down a single-file line still stops the
// whole chain from cascading through it - only the creep(s) in front of it
// (between it and the mover) may sidestep on their own, the miner itself
// never moves and the line can't push past its tile
const sidestepper = Object.assign(Object.create(Creep.prototype), {
    id: "pm5", room, my: true, fatigue: 0, _moved: false,
    memory: { role: "upgrader" }, // not a miner - free to sidestep
    pos: new RoomPosition(12, 45, "W1N1"),
});
sidestepper.move = () => { sidestepper._moved = true; return OK; };
REG.anchorSrc2 = { id: "anchorSrc2", pos: new RoomPosition(13, 45, "W1N1") };
const minerBehind = Object.assign(Object.create(Creep.prototype), {
    id: "pmM2", room, my: true, fatigue: 0, _moved: false,
    memory: { role: "miner", target: "anchorSrc2" },
    pos: new RoomPosition(13, 45, "W1N1"),
});
minerBehind.move = () => { minerBehind._moved = true; return OK; };
room.lookForAt = (type, x, y) => {
    if (type !== LOOK_CREEPS) return [];
    if (x === 12 && y === 45) return [sidestepper];
    if (x === 13 && y === 45) return [minerBehind];
    return [];
};
const w7 = mkMover("w7", 10, 45);
const d7 = new RoomPosition(15, 45, "W1N1");
Game.time++; w7.moveTo(d7, { range: 0 });
Game.time++; w7.moveTo(d7, { range: 0 });
Game.time++; w7.moveTo(d7, { range: 0 });
assert(sidestepper._moved === true && minerBehind._moved === false,
    "a miner further down a single-file line still refuses to move, but the mobile creep in front of it can still sidestep");
room.lookForAt = realLookForAt;

{
    const routing = require(path.join(PROJECT, "src/utils/routing"));
    const excuseMe = require(path.join(PROJECT, "src/utils/excuseMe"));
    const originalAsk = excuseMe.ask;
    const crossMover = {
        id: "cross-mover",
        name: "cross-mover",
        room,
        pos: new RoomPosition(10, 10, "W1N1"),
        fatigue: 0,
        body: [{ type: MOVE, hits: 100 }],
        store: { getUsedCapacity: () => 0 },
        memory: { role: "scout" },
        move: (direction) => {
            crossMover.directMoveDirection = direction;
            return OK;
        },
        moveTo: () => {
            crossMover.memory._move = { path: "3" };
            return OK;
        },
    };
    const crossBlocker = { id: "cross-blocker", my: true };
    let askCalls = 0;
    excuseMe.ask = (creep, x, y) => {
        askCalls++;
        return creep === crossMover && x === 11 && y === 10;
    };
    room.lookForAt = (type, x, y) =>
        type === LOOK_CREEPS && x === 11 && y === 10 ? [crossBlocker] : [];
    const occupiedResult = routing.moveToRoom(crossMover, "W2N1", {
        nativeRoute: true,
        realRoute: false,
    });
    assert(occupiedResult === OK && askCalls === 1 && crossMover.directMoveDirection === RIGHT,
        "a multi-room route asks an allied creep blocking its next cached step to make way and enters it");
    room.lookForAt = () => [];
    crossMover.directMoveDirection = null;
    const clearResult = routing.moveToRoom(crossMover, "W2N1", {
        nativeRoute: true,
        realRoute: false,
    });
    assert(clearResult === OK && askCalls === 1 && crossMover.directMoveDirection === null,
        "a multi-room route leaves an empty normal step to native moveTo");
    crossMover.directMoveDirection = null;
    crossMover.moveTo = () => {
        delete crossMover.memory._move;
        return ERR_NO_PATH;
    };
    const noPathResult = routing.moveToRoom(crossMover, "W2N1", {
        nativeRoute: true,
        realRoute: false,
    });
    assert(noPathResult === ERR_NO_PATH && crossMover.directMoveDirection === null,
        "a multi-room ERR_NO_PATH never follows a cached step directly");
    crossMover.moveTo = () => {
        crossMover.memory._move = { path: "3" };
        return OK;
    };
    crossMover.memory._routeStackDest = "W2N1";
    delete crossMover.memory._routeProgressKey;
    delete crossMover.memory._routeProgressPos;
    delete crossMover.memory._routeNoProgressTicks;
    crossMover.directMoveDirection = null;
    Memory.settings.routing = { noProgressTicks: 2 };
    routing.moveToRoom(crossMover, "W2N1", { realRoute: false });
    routing.moveToRoom(crossMover, "W2N1", { realRoute: false });
    const stalledResult = routing.moveToRoom(crossMover, "W2N1", { realRoute: false });
    assert(stalledResult === OK && crossMover.directMoveDirection === RIGHT,
        "a confirmed multi-room no-progress stall follows one freshly cached step directly");
    delete Memory.settings.routing;
    excuseMe.ask = originalAsk;
    room.lookForAt = realLookForAt;
}

const B3 = plan().buildings;
assert(B3.filter((b) => b.structureType === "container").length >= 2,
    "replanned plan still has source containers (got " +
        B3.filter((b) => b.structureType === "container").length + ")");
assert(!B3.some((b) => b.structureType === "spawn"),
    "no spawn stamp placed when every stamp is unplaceable");

// --- alliance list --------------------------------------------------
const hostiles = require(path.join(PROJECT, "src/utils/hostiles"));
assert(
    ["vlc6wsw0l", "fR1dj", "PhilipSchlump", "Netloc", "Dustinc555",
        "Ricardo306", "TimelessTacticianEon"].every((n) => hostiles.isAlly(n)),
    "the seven default names are allies by default"
);
assert(!hostiles.isAlly("SomeRandom") && !hostiles.isAlly("Invader"),
    "non-listed players are not allies");
assert(hostiles.isHostile({ owner: { username: "vlc6wsw0l" } }) === false,
    "an ally creep is never hostile");
assert(hostiles.isHostile({ owner: { username: "Invader" } }) === true,
    "an Invader is still hostile");
global.Memory.settings = { allies: ["Onlyfriend"] };
assert(hostiles.isAlly("Onlyfriend") && !hostiles.isAlly("vlc6wsw0l"),
    "Memory.settings.allies overrides the default list");
assert(typeof global.listAlly === "function", "listAlly() is registered on global");
{
    const listAllyLogs = [];
    console.log = (...a) => { listAllyLogs.push(a.join(" ")); };
    global.listAlly();
    console.log = origLog;
    assert(listAllyLogs.join("\n").includes("Onlyfriend"),
        "listAlly() prints the current allies (override in effect)");
}
delete global.Memory.settings.allies;

// --- 0012: in an owned room, hostile = armed + not an ally (no whitelist
// needed); outside an owned room, the whitelist still governs -----------
{
    const ownedRoom = { controller: { my: true } };
    const foreignRoom = { controller: { my: false } };
    const armedUnknown = {
        owner: { username: "SomeRandomPlayer" },
        body: [{ type: RANGED_ATTACK }, { type: MOVE }],
    };
    const unarmedUnknown = {
        owner: { username: "SomeRandomPlayer" },
        body: [{ type: WORK }, { type: MOVE }],
    };
    const armedAlly = {
        owner: { username: "vlc6wsw0l" },
        body: [{ type: ATTACK }, { type: MOVE }],
    };

    assert(hostiles.isHostile(armedUnknown, ownedRoom) === true,
        "an unknown armed player is hostile in a room I own, whitelist or not");
    assert(hostiles.isHostile(unarmedUnknown, ownedRoom) === false,
        "an unknown but UNARMED player is not hostile in a room I own");
    assert(hostiles.isHostile(armedAlly, ownedRoom) === false,
        "an armed ally is still never hostile, even in a room I own");
    assert(hostiles.isHostile(armedUnknown, foreignRoom) === false,
        "outside a room I own, an unknown armed player not on the whitelist is NOT hostile");
    assert(hostiles.isHostile(armedUnknown) === false,
        "with no room passed at all, the whitelist-only behavior is preserved");

    global.Memory.settings = { hostilePlayers: ["SomeRandomPlayer"] };
    assert(hostiles.isHostile(armedUnknown, foreignRoom) === true,
        "Memory.settings.hostilePlayers overrides the whitelist outside an owned room");
    delete global.Memory.settings.hostilePlayers;
}

// --- 0012: config.get() overrides / defaults --------------------------
{
    const config = require(path.join(PROJECT, "src/utils/config"));
    assert(config.get("defender.maxCount", -1) === 3,
        "config.get() returns the built-in default with no override");
    global.Memory.settings = { defender: { maxCount: 7 } };
    assert(config.get("defender.maxCount", -1) === 7,
        "config.get() returns the Memory.settings override when set");
    assert(config.get("nonexistent.path.at.all", "fallback") === "fallback",
        "config.get() falls back to the caller's default for an unknown path, never throws");
    delete global.Memory.settings.defender;
}

// --- 0091: global tier state and priority ordering --------------------
{
    const resourceTiers = require(path.join(PROJECT, "src/utils/resourceTiers"));
    const priority = require(path.join(PROJECT, "src/utils/priority"));
    const room = {
        name: "W1N1",
        storage: {
            store: { energy: 2000, getCapacity: () => 10000 },
        },
        controller: { my: true, level: 5, ticksToDowngrade: 20000 },
        find: () => [],
    };
    const criticalRoom = {
        name: "W1N2",
        storage: { store: { energy: 50, getCapacity: () => 10000 } },
        controller: { my: true, level: 5, ticksToDowngrade: 1000 },
        find: () => [],
    };

    assert(resourceTiers.getEconomyState(room) === "stable",
        "resourceTiers.getEconomyState() is stable above reserve and without a critical controller");
    assert(resourceTiers.getEconomyState(criticalRoom) === "critical",
        "resourceTiers.getEconomyState() goes critical when the controller is at risk");
    assert(resourceTiers.getEconomyReason(criticalRoom) === "controller",
        "resourceTiers.getEconomyReason() reports the dominant critical trigger");
    assert(resourceTiers.getEconomySnapshot(room) ===
        resourceTiers.getEconomySnapshot(room),
        "resourceTiers reuses one economy snapshot per room and tick");
    assert(priority.pick([
        { id: "lab", tier: "optional", priority: 2 },
        { id: "tower", tier: "satisfactory", priority: 9 },
        { id: "spawn", tier: "critical", priority: 1 },
    ]).id === "spawn",
        "priority.pick() prefers critical targets before satisfactory and optional ones");
    assert(priority.pick([
        { id: "a", tier: "satisfactory", priority: 2 },
        { id: "b", tier: "satisfactory", priority: 2 },
    ]).id === "a",
        "priority.pick() preserves original order as the final tiebreaker");
    assert(priority.pick([
        { id: "blocked", tier: "critical", priority: 9, allowed: false },
        { id: "open", tier: "satisfactory", priority: 1, allowed: true },
    ]).id === "open",
        "priority.pick() excludes declaratively disallowed candidates");
}

// --- rampart opens for an approaching ally --------------------------
const rampartLogic = require(path.join(PROJECT, "src/structures/rampart"));
const mkRampart = () => {
    const r = Object.assign(new OwnedStructure(), {
        id: "rmp", structureType: STRUCTURE_RAMPART, my: true,
        pos: new RoomPosition(10, 20, "W1N1"), room, isPublic: false,
    });
    r.setPublic = (v) => { r.isPublic = v; };
    r.pos.findInRange = (arr, range) =>
        (Array.isArray(arr) ? arr : []).filter(
            (c) => Math.max(Math.abs((c.pos || c).x - 10),
                Math.abs((c.pos || c).y - 20)) <= range
        );
    return r;
};
const ally = { id: "a1", owner: { username: "fR1dj" },
    pos: new RoomPosition(11, 20, "W1N1") };
const enemy = { id: "e1", owner: { username: "Invader" },
    pos: new RoomPosition(11, 21, "W1N1"), body: [{ type: "attack" }] };

findMap[FIND_HOSTILE_CREEPS] = [ally];
Game.time++;
let rmp = mkRampart();
rampartLogic.run(rmp);
assert(rmp.isPublic === true, "rampart opens when an ally is adjacent");

findMap[FIND_HOSTILE_CREEPS] = [];
Game.time++;
rampartLogic.run(rmp);
assert(rmp.isPublic === false, "rampart closes when the ally leaves");

findMap[FIND_HOSTILE_CREEPS] = [ally, enemy];
Game.time++;
rmp = mkRampart();
rampartLogic.run(rmp);
assert(rmp.isPublic === false,
    "rampart stays shut when a hostile is also right there");
findMap[FIND_HOSTILE_CREEPS] = [];

// --- combat overhaul Fase 1+2 (ROADMAP 0032 D1/D4, D2/D3/O1) -----------
{
    // --- D1: defender body - MOVE last, not first (protects the kite) --
    const defenderMod = require(path.join(PROJECT, "src/roles/defender"));
    const bodyHigh = defenderMod.spawnData({ energyAvailable: 700 }).body;
    assert(
        JSON.stringify(bodyHigh) ===
            JSON.stringify([RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE, MOVE, MOVE]),
        "defender body >=700 energy: RANGED_ATTACK/HEAL first, MOVE last (got " +
            JSON.stringify(bodyHigh) + ")"
    );
    const bodyMid = defenderMod.spawnData({ energyAvailable: 400 }).body;
    assert(
        JSON.stringify(bodyMid) === JSON.stringify([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE]),
        "defender body >=400 energy: RANGED_ATTACK first, MOVE last (got " +
            JSON.stringify(bodyMid) + ")"
    );
    const bodyLow = defenderMod.spawnData({ energyAvailable: 200 }).body;
    assert(
        JSON.stringify(bodyLow) === JSON.stringify([RANGED_ATTACK, MOVE]),
        "defender body below 400 energy: unchanged, just RANGED_ATTACK + MOVE"
    );

    // --- D4: tower rampart repair target scales with hitsMax, not a
    // fixed number - isolated fixture so isPlanned() (no plan for
    // "TestRoom" -> "everything counts as planned") and a custom find()
    // keep this independent of W1N1's real plan/hostiles/creeps.
    const towerMod = require(path.join(PROJECT, "src/structures/tower"));
    Memory.rooms.TestRoom = { defenseActive: false };

    function mkTestRampart(id, hits, hitsMax) {
        return Object.assign(new OwnedStructure(), {
            id, structureType: STRUCTURE_RAMPART, hits, hitsMax, my: true,
            pos: new RoomPosition(10, 10, "TestRoom"),
            room: { name: "TestRoom" },
        });
    }
    function mkTestWall(id, hits, hitsMax) {
        return Object.assign(new OwnedStructure(), {
            id, structureType: STRUCTURE_WALL, hits, hitsMax, my: true,
            pos: new RoomPosition(12, 10, "TestRoom"),
            room: { name: "TestRoom" },
        });
    }
    function testFind(structures) {
        return (type, opts) => {
            let list = type === FIND_STRUCTURES ? structures : [];
            if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
            return list;
        };
    }
    function mkTestTower(structures, storage, energy) {
        let repaired = null;
        const t = Object.assign(new OwnedStructure(), {
            id: "testtower", structureType: STRUCTURE_TOWER,
            store: store(energy === undefined ? 1000 : energy, 1000),
            pos: new RoomPosition(25, 25, "TestRoom"),
            room: { name: "TestRoom", storage, find: testFind(structures) },
            attack: noop, heal: noop, rangedMassAttack: noop,
            repair: (target) => { repaired = target; return OK; },
        });
        return { tower: t, getRepaired: () => repaired };
    }
    function mkTestNormal(id, structureType, hits, hitsMax) {
        return Object.assign(new OwnedStructure(), {
            id, structureType, hits, hitsMax, my: true,
            pos: new RoomPosition(11, 11, "TestRoom"),
            room: { name: "TestRoom" },
        });
    }

    // --- D4 + follow-up + ROADMAP 0072 (user-specified, unified 3-tier
    // repair system for both structures/tower.js and roles/builder.js): C
    // is critical (0.05% < 0.1%), H is satisfactory (0.5%, between 0.1%
    // and 1%), S is optimal (5% >= 1%). A tower's own eligibility
    // (utils/rampartRepair.towerMayRepair) now depends on ITS OWN energy
    // ratio, tier-dependent - critical needs tower.repairEnergyRatio
    // (50%), satisfactory/optimal need
    // tower.satisfactoryRepairEnergyRatio (70%) - PLUS, for a rampart/wall
    // satisfactory defensive repair requires storage >10%; optimal defensive
    // hardening requires storage >=70%. These gates are separate from the
    // general 50% economy/link threshold.
    const C = mkTestRampart("c", 500, 1000000);
    const H = mkTestRampart("h", 5000, 1000000);
    const S = mkTestRampart("s", 50000, 1000000);

    {
        const { tower, getRepaired } = mkTestTower([C], null, 500); // 50% energy - right at the critical gate
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === C,
            "a critical target is repaired once the tower's own energy " +
                "crosses the critical gate (50%) - no storage needed at all");
    }
    {
        const { tower, getRepaired } = mkTestTower([C], null, 499); // just below 50%
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === null,
            "a critical target is NOT repaired with tower energy just " +
                "below the critical gate (49.9%)");
    }
    {
 const satisfactoryStorage = { store: store(110, 1000) }; // >10% fill
 const { tower, getRepaired } = mkTestTower([H], satisfactoryStorage, 700); // 70% energy
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === H,
            "a satisfactory target is repaired once the tower's own " +
                "energy crosses the satisfactory gate (70%) - no storage " +
                "reserve needed anymore (ROADMAP 0072 replaces the old " +
                "ROADMAP 0069 aboveReserve gate for this tier)");
    }
    {
        const { tower, getRepaired } = mkTestTower([H], null, 600); // 60% - above critical, below satisfactory
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === null,
            "a satisfactory target is NOT repaired with tower energy at " +
                "60% - above the critical gate but below the satisfactory " +
                "one; the target also remains blocked without the " +
                "defensive storage gate (ROADMAP 0101)");
    }
    {
        const { tower, getRepaired } = mkTestTower([S], null, 1000); // full tower energy, NO storage at all
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === null,
            "an optimal-tier rampart is NOT repaired by the tower even at " +
                "full tower energy, without an abundant storage reserve " +
                "(a tower has no natural brake on this spend, so it needs " +
                "real abundance, not just critical/satisfactory energy)");
    }
    {
 const belowAbundant = { store: store(600, 1000) }; // 60% fill - below the 70% hardening bar
        const { tower, getRepaired } = mkTestTower([S], belowAbundant, 1000);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === null,
            "an optimal-tier rampart is still NOT repaired with storage " +
                "at 60% fill - below the 70% defensive hardening bar " +
                "(defensive hardening uses logistics.rampartHardeningStorageRatio)");
    }
    {
        const abundant = { store: store(700, 1000) }; // 70% fill - hardening gate
        const { tower, getRepaired } = mkTestTower([S], abundant, 1000);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === S,
            "an optimal-tier rampart IS repaired once storage is " +
                "at least 70% storage and the tower itself has " +
                "the satisfactory energy floor");
    }
    {
 const abundant = { store: store(700, 1000) };
        const { tower, getRepaired } = mkTestTower([C, H, S], abundant, 1000);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === C,
            "with all three tiers simultaneously eligible, critical (C) " +
                "always wins over satisfactory (H) and optimal (S)");
    }
    {
        const abundant = { store: store(600, 1000) };
        const { tower, getRepaired } = mkTestTower([H, S], abundant, 1000);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === H,
            "with no critical target, satisfactory (H) wins over optimal " +
                "(S) even though both are individually eligible");
    }

    // A normal structure's optimal tier (unlike rampart/wall's) never
    // needs storage abundance - just the tower's own satisfactory energy
    // floor, since a normal structure's hitsMax is small/bounded (no
    // "sink energy forever" risk the way a 300M-hitsMax wall has).
    {
        const optimalContainer = mkTestNormal("opt-cont", STRUCTURE_CONTAINER, 200000, 250000); // 80% health -> optimal (>=50%)
        const { tower, getRepaired } = mkTestTower([optimalContainer], null, 1000); // full energy, NO storage at all
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === optimalContainer,
            "an optimal-tier NORMAL structure is repaired at the " +
                "satisfactory energy floor alone, no storage abundance " +
                "requirement at all - unlike a rampart/wall in the same tier");
    }

    // ROADMAP 0072 (user request): "caso tenha empate, rampart tem menor
    // prioridade e wall menor ainda" - within the SAME tier, a normal
    // structure always outranks a rampart, which always outranks a wall,
    // regardless of exact ratio (a type-priority rule spanning the whole
    // tier, not just a last-resort break for exact numeric ties).
    {
        const critNormal = mkTestNormal("crit-normal", STRUCTURE_EXTENSION, 5, 1000); // 0.5% -> critical (<10%)
        const critRampart = mkTestRampart("crit-rampart-tb", 50, 1000000); // 0.005% -> critical, objectively WORSE ratio
        const critWall = mkTestWall("crit-wall-tb", 1, 1000000); // 0.0001% -> critical, even worse ratio still
        const { tower, getRepaired } = mkTestTower([critWall, critRampart, critNormal], null, 1000);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === critNormal,
            "within the same tier, a normal structure outranks a rampart " +
                "and a wall even though both have objectively worse " +
                "ratios (ROADMAP 0072 type tiebreak)");
    }
    {
        // same shape, but the normal structure is already claimed by a
        // first tower this same tick - the second tower should land on
        // the rampart next, not the wall
        const critNormal = mkTestNormal("crit-normal2", STRUCTURE_EXTENSION, 5, 1000);
        const critRampart = mkTestRampart("crit-rampart-tb2", 50, 1000000);
        const critWall = mkTestWall("crit-wall-tb2", 1, 1000000);
        Game.time++;
        const towerA = mkTestTower([critWall, critRampart, critNormal], null, 1000);
        towerMod.run(towerA.tower);
        const towerB = mkTestTower([critWall, critRampart, critNormal], null, 1000); // same Game.time
        towerMod.run(towerB.tower);
        assert(towerB.getRepaired() === critRampart,
            "rampart outranks wall within the same tier, once the normal " +
                "structure is already claimed this tick");
    }

    // --- ROADMAP 0070 (real bug found in review): findRepairTarget used to
    // check ALL normal structures unconditionally before EVER looking at
    // rampart/wall, so any trivial decay (a road missing 1 hit) starved a
    // critical rampart seconds from collapsing. Now both share one
    // ratio-sorted pool, mirroring roles/builder.js.
    {
        // barely scratched (99.9% health) vs C (critical, 0.05% health) -
        // the old code always picked the normal structure first, no matter
        // how trivial the damage, because it never even looked at
        // defensiveStructures while normalStructures was non-empty
        const scratchedExtension = mkTestNormal("ext1", STRUCTURE_EXTENSION, 999, 1000);
        const { tower, getRepaired } = mkTestTower([C, scratchedExtension], null);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === C,
            "a critical rampart (C) outranks a barely-scratched normal " +
                "structure (999/1000) - repair priority is no longer " +
                "unconditionally normal-structures-first (ROADMAP 0070)");
    }
    {
        // among normal structures alone: a container proportionally far
        // worse off (80% damaged) must still win over an extension that's
        // barely touched (0.1% damaged), even though the extension's raw
        // remaining hits (999) is far SMALLER than the container's
        // (50000) - sorting by raw hits (the old bug) picked the
        // extension here, which is exactly backwards
        const scratchedExtension = mkTestNormal("ext2", STRUCTURE_EXTENSION, 999, 1000);
        const hurtContainer = mkTestNormal("cont1", STRUCTURE_CONTAINER, 50000, 250000);
        const { tower, getRepaired } = mkTestTower([scratchedExtension, hurtContainer], null);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === hurtContainer,
            "the proportionally-worse container (20% health) wins over a " +
                "barely-scratched extension (99.9% health), even though the " +
                "extension has far fewer raw hits remaining - ratio, not " +
                "raw hits (ROADMAP 0070)");
    }

    // --- ROADMAP 0071 (review finding): 2+ towers in the same room used to
    // always share the exact same single cached target - both piling onto
    // whichever sorted first even with two DISTINCT urgent targets, leaving
    // the other completely unattended that tick. Each tower now claims what
    // it picks and skips anything an earlier tower this tick already
    // claimed, falling back to doubling up only once nothing distinct is
    // left.
    {
        const crit1 = mkTestRampart("crit1", 100, 1000000); // 0.01% - worse
        const crit2 = mkTestRampart("crit2", 200, 1000000); // 0.02% - also critical
        Game.time++;

        const towerA = mkTestTower([crit1, crit2], null);
        towerMod.run(towerA.tower);
        assert(towerA.getRepaired() === crit1,
            "first tower in the room picks the worst critical target (crit1)");

        const towerB = mkTestTower([crit1, crit2], null);
        towerMod.run(towerB.tower); // same Game.time -> same cached candidate list
        assert(towerB.getRepaired() === crit2,
            "a second tower in the same room/tick claims the OTHER urgent " +
                "target instead of piling onto the one the first tower " +
                "already claimed (ROADMAP 0071)");

        const towerC = mkTestTower([crit1, crit2], null);
        towerMod.run(towerC.tower);
        assert(towerC.getRepaired() === crit1,
            "a third tower, with every distinct urgent target already " +
                "claimed, falls back to doubling up on the single worst " +
                "one (crit1) instead of sitting idle");
    }

    {
        // no storage at all must never throw (constitution §3)
        const { tower } = mkTestTower([H, S], null);
        let threw = null;
        Game.time++;
        try { towerMod.run(tower); } catch (e) { threw = e; }
        assert(!threw, "tower.run() with no room.storage never throws" +
            (threw ? "\n      " + (threw.stack || threw) : ""));
    }

    {
        const exactHealthyGate = { store: store(100, 1000) };
        const { tower, getRepaired } = mkTestTower([H], exactHealthyGate, 1000);
        Game.time++;
        towerMod.run(tower);
        assert(getRepaired() === null,
            "a satisfactory rampart is NOT repaired at exactly 10% storage");
    }

    // --- builder: rampart repair (opportunistic AND the dead-last
    // damagedRamparts fallback) reads the exact same utils/rampartRepair
    // tiers/gate as structures/tower.js above - one shared rule instead of
    // two independently-tuned mechanisms drifting apart.
    {
        Memory.rooms.BCapRoom = {};
        const bCapController = Object.assign(new RoomObject(), {
            id: "bcap-ctrl", my: true, level: 4, progress: 0, progressTotal: 1,
            ticksToDowngrade: 200000, pos: new RoomPosition(25, 25, "BCapRoom"),
        });
        REG[bCapController.id] = bCapController;

        function mkBCapRampart(hits, hitsMax) {
            const r = Object.assign(new OwnedStructure(), {
                id: "bcap-rampart", structureType: STRUCTURE_RAMPART,
                hits, hitsMax, my: true,
                pos: new RoomPosition(10, 10, "BCapRoom"),
                room: { name: "BCapRoom" },
            });
            REG[r.id] = r;
            return r;
        }
        function bCapFind(structures) {
            return (type, opts) => {
                let list = type === FIND_STRUCTURES ? structures : [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            };
        }
        function mkBCapCreep(structures, storage) {
            const repairs = [];
            const c = Object.assign(new Creep(), {
                id: "bcap-creep", name: "BCap1",
                pos: new RoomPosition(10, 11, "BCapRoom"),
                room: Object.assign(new Room("BCapRoom"), {
                    controller: bCapController, storage,
                    find: bCapFind(structures),
                }),
                store: store(50, 50), memory: {},
                hits: 100, hitsMax: 100,
                body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
                owner: { username: "me" },
                harvest: noop, upgradeController: noop, build: noop,
                repair: (t) => { repairs.push(t); return OK; },
                transfer: noop, withdraw: noop, pickup: noop, move: noop,
                moveTo: noop, moveByPath: noop, drop: noop,
                rangedAttack: noop, rangedMassAttack: noop, heal: noop,
                rangedHeal: noop, attack: noop,
            });
            return { creep: c, getRepairs: () => repairs };
        }

        const RCap = mkBCapRampart(5000000, 100000000); // 5% - past the healthy tier
        const RHealthy = mkBCapRampart(500000, 100000000); // 0.5% - satisfactory
        RHealthy.id = "bcap-healthy";
        REG[RHealthy.id] = RHealthy;
        REG[RCap.id] = RCap;

        {
            const exactHealthyGate = { store: store(100, 1000) };
            const { creep, getRepairs } = mkBCapCreep([RHealthy], exactHealthyGate);
            Game.time++;
            builder.run(creep);
            assert(!getRepairs().includes(RHealthy),
                "builder does not repair a satisfactory rampart at exactly 10% storage");
        }
        {
            const aboveHealthyGate = { store: store(110, 1000) };
            const { creep, getRepairs } = mkBCapCreep([RHealthy], aboveHealthyGate);
            Game.time++;
            builder.run(creep);
            assert(getRepairs().includes(RHealthy),
                "builder repairs a satisfactory rampart above the 10% storage gate");
        }

        {
            const { creep, getRepairs } = mkBCapCreep([RCap], null);
            Game.time++;
            let threw = null;
            try { builder.run(creep); } catch (e) { threw = e; }
            assert(!threw, "builder.run with no storage surplus never throws" +
                (threw ? "\n      " + (threw.stack || threw) : ""));
            assert(!getRepairs().includes(RCap),
                "no storage surplus: a past-healthy-tier rampart is left " +
                    "alone (got " + JSON.stringify(getRepairs().map((r) => r && r.id)) + ")");
        }
        {
 const fullEnoughStorage = { store: store(700, 1000) }; // 70% fill
            const { creep, getRepairs } = mkBCapCreep([RCap], fullEnoughStorage);
            Game.time++;
            let threw = null;
            try { builder.run(creep); } catch (e) { threw = e; }
            assert(!threw, "builder.run with storage surplus never throws" +
                (threw ? "\n      " + (threw.stack || threw) : ""));
            assert(getRepairs().includes(RCap),
                "storage past the 1% reserve: the same rampart is fair game " +
                    "again for the builder (structures/tower.js would " +
                    "refuse it past the healthy tier regardless of reserve " +
                    "since ROADMAP 0068 - see the tower fixtures above)");
        }

        // ROADMAP 0068: builder.js previously never touched STRUCTURE_WALL
        // at all (only rampart) - this fallback now covers wall too, since
        // "past 1%, builder-only" is meaningless for a type builder.js
        // never repaired in the first place.
        function mkBCapWall(hits, hitsMax) {
            const w = Object.assign(new OwnedStructure(), {
                id: "bcap-wall", structureType: STRUCTURE_WALL,
                hits, hitsMax, my: true,
                pos: new RoomPosition(12, 10, "BCapRoom"),
                room: { name: "BCapRoom" },
            });
            REG[w.id] = w;
            return w;
        }
        const WCap = mkBCapWall(3000000, 300000000); // 1% - past the healthy tier

        {
            const { creep, getRepairs } = mkBCapCreep([WCap], null);
            Game.time++;
            let threw = null;
            try { builder.run(creep); } catch (e) { threw = e; }
            assert(!threw, "builder.run on a wall with no storage surplus never throws" +
                (threw ? "\n      " + (threw.stack || threw) : ""));
            assert(!getRepairs().includes(WCap),
                "no storage surplus: a past-healthy-tier wall is left alone " +
                    "same as a rampart would be");
        }
        {
            const fullEnoughStorage = { store: store(700, 1000) }; // 70% fill
            const { creep, getRepairs } = mkBCapCreep([WCap], fullEnoughStorage);
            Game.time++;
            let threw = null;
            try { builder.run(creep); } catch (e) { threw = e; }
            assert(!threw, "builder.run on a wall with storage surplus never throws" +
                (threw ? "\n      " + (threw.stack || threw) : ""));
            assert(getRepairs().includes(WCap),
                "storage past the 1% reserve: builder now hardens a wall " +
                    "past its healthy tier too, not just a rampart " +
                    "(ROADMAP 0068 - previously builder.js never repaired " +
                    "STRUCTURE_WALL at all)");
        }

        // ROADMAP 0072 (user request): builder now shares the exact same
        // tier+type priority as structures/tower.js
        // (utils/rampartRepair.priority) for its own main repair pool, not
        // just the dead-last defensive fallback above - "caso tenha
        // empate, rampart tem menor prioridade e wall menor ainda" applies
        // here too. Positions kept far from the creep (range > 3) so
        // opportunisticWork's own separate in-passing check (range 3,
        // ratio-only, no type tiebreak by design) never fires and
        // interferes with what's being tested here.
        function mkBCapFar(id, structureType, hits, hitsMax, y) {
            const s = Object.assign(new OwnedStructure(), {
                id, structureType, hits, hitsMax, my: true,
                pos: new RoomPosition(40, y, "BCapRoom"),
                room: { name: "BCapRoom" },
            });
            REG[s.id] = s;
            return s;
        }
        {
            const critNormal = mkBCapFar("bcap-normal", STRUCTURE_EXTENSION, 5, 1000, 40); // 0.5% -> critical
            const rampartTb = mkBCapFar("bcap-rampart-tb", STRUCTURE_RAMPART, 50, 1000000, 41); // 0.005% -> critical
            const wallTb = mkBCapFar("bcap-wall-tb", STRUCTURE_WALL, 1, 1000000, 42); // 0.0001% -> critical

            const { creep, getRepairs } = mkBCapCreep([critNormal, rampartTb, wallTb], null);
            Game.time++;
            let threw = null;
            try { builder.run(creep); } catch (e) { threw = e; }
            assert(!threw, "builder.run with a same-tier type tiebreak never throws" +
                (threw ? "\n      " + (threw.stack || threw) : ""));
            assert(getRepairs().includes(critNormal),
                "builder's main repair pool picks the normal structure " +
                    "over an equally-critical rampart/wall, matching " +
                    "structures/tower.js's own type tiebreak (got " +
                    JSON.stringify(getRepairs().map((r) => r && r.id)) + ")");
        }
    }

    // --- ROADMAP 0054 "Link tiers": the collector link decides between a
    // controller link and a storage link by ticksToDowngrade/storage fill,
    // not just "whichever non-collector link has more free capacity" ------
    {
        const linkMod = require(path.join(PROJECT, "src/structures/link"));

        function mkLink(id, x, y, isCollectorVal) {
            return Object.assign(new StructureLink(), {
                id, structureType: STRUCTURE_LINK,
                pos: new RoomPosition(x, y, "LinkRoom"),
                store: store(0, 800),
                isCollector: () => isCollectorVal,
                cooldown: 0,
                isActive: () => true,
            });
        }

        function linkFind(structures) {
            return (type, opts) => {
                let list = type === FIND_STRUCTURES ? structures : [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            };
        }

        function runLinkScenario({ rcl, ticksToDowngrade, storageEnergy, storageCapacity }) {
            const linkController = Object.assign(new RoomObject(), {
                id: "link-ctrl", my: true, level: rcl, ticksToDowngrade,
                pos: new RoomPosition(25, 25, "LinkRoom"),
            });
            const storage = storageCapacity
                ? { store: store(storageEnergy, storageCapacity) }
                : null;

            const collector = mkLink("lk-col", 5, 5, true);
            const controllerLink = mkLink("lk-ctrl", 24, 25, false); // range 1 to controller
            const storageLink = mkLink("lk-stor", 40, 40, false); // far from controller

            let transferredTo = null;
            collector.transferEnergy = (t) => { transferredTo = t && t.id; return OK; };
            collector.store = store(200, 800);

            collector.room = Object.assign(new Room("LinkRoom"), {
                controller: linkController, storage,
                find: linkFind([collector, controllerLink, storageLink]),
            });

            Game.time++;
            linkMod.run(collector);
            return transferredTo;
        }

        // The engine rejects transferEnergy() with ERR_FULL when the
        // requested amount exceeds the target's free capacity, so the
        // request must never exceed it - even for a target close to full.
        // The collector still needs the existing 50-energy floor before it
        // may spend a cooldown.
        {
            const collector = mkLink("lk-small-col", 5, 5, true);
            const target = mkLink("lk-small-target", 40, 40, false);
            const room = Object.assign(new Room("LinkSmallCapacityRoom"), {
                controller: null,
                find: linkFind([collector, target]),
            });
            let transferAmount = null;
            collector.room = room;
            target.store = store(750, 800); // 93.75% full, still under the receive gate
            collector.store = store(200, 800);
            collector.transferEnergy = (receivedTarget, amount) => {
                assert(receivedTarget === target, "small-capacity link chooses the receiving link");
                transferAmount = amount;
                return OK;
            };
            Game.time++;
            linkMod.run(collector);
            assert(transferAmount === 50,
                "collector never requests more than the target's free capacity (got " +
                    transferAmount + ")");

            transferAmount = null;
            collector.store = store(49, 800);
            Game.time++;
            linkMod.run(collector);
            assert(transferAmount === null,
                "collector below 50 energy does not spend a link cooldown");
        }

        // ROADMAP: a non-collector link at/above logistics.linkReceiveFillRatio
        // (95%) is skipped even with free capacity left - reported bug was a
        // collector spending its cooldown sending into a 799/800 link.
        {
            const collector = mkLink("lk-fullgate-col", 5, 5, true);
            const nearFullTarget = mkLink("lk-fullgate-target", 40, 40, false);
            const room = Object.assign(new Room("LinkFullGateRoom"), {
                controller: null,
                find: linkFind([collector, nearFullTarget]),
            });
            collector.room = room;
            nearFullTarget.store = store(799, 800); // 99.875% full
            collector.store = store(200, 800);
            let sent = false;
            collector.transferEnergy = () => { sent = true; return OK; };
            Game.time++;
            linkMod.run(collector);
            assert(!sent,
                "collector does not send to a non-collector link already at/above " +
                    "the receive fill ratio, even with free capacity left");
        }

        // Two collectors in the same room both target the same (not yet
        // updated within this tick) receiving link - only the first one to
        // run may actually send; the second must not spend its cooldown on
        // a transfer the engine would reject once the first lands.
        {
            const collectorA = mkLink("lk-multi-col-a", 5, 5, true);
            const collectorB = mkLink("lk-multi-col-b", 6, 6, true);
            const target = mkLink("lk-multi-target", 40, 40, false);
            const room = Object.assign(new Room("LinkMultiCollectorRoom"), {
                controller: null,
                find: linkFind([collectorA, collectorB, target]),
            });
            collectorA.room = room;
            collectorB.room = room;
            collectorA.store = store(200, 800);
            collectorB.store = store(200, 800);
            target.store = store(0, 800);

            let sends = [];
            collectorA.transferEnergy = (t, amount) => { sends.push({ from: "a", t, amount }); return OK; };
            collectorB.transferEnergy = (t, amount) => { sends.push({ from: "b", t, amount }); return OK; };

            Game.time++;
            linkMod.run(collectorA);
            linkMod.run(collectorB);
            assert(sends.length === 1,
                "only one collector link sends energy per room per tick (got " +
                    sends.length + ")");
            assert(sends[0].from === "a",
                "the first collector to run in the tick keeps the claim");

            // Next tick, the room's send claim resets and the other
            // collector may send.
            sends = [];
            Game.time++;
            linkMod.run(collectorB);
            assert(sends.length === 1 && sends[0].from === "b",
                "the per-room send claim resets on the next tick");
        }

        // (a) controller near downgrade wins, even over an empty storage
        // link (and even with no storage at all) - risk of losing RCL beats
        // everything else
        {
            const rcl = 4;
            const limit = CONTROLLER_DOWNGRADE[rcl];
            const got = runLinkScenario({
                rcl, ticksToDowngrade: Math.floor(limit * 0.05), // below the 10% threshold
                storageEnergy: 0, storageCapacity: 0,
            });
            assert(got === "lk-ctrl",
                "controller near downgrade wins over the storage link, even with no " +
                    "storage at all (got " + got + ")");
        }

        // (b) controller not critical, storage below its 1% reserve ->
        // storage link (the symmetric emergency)
        {
            const rcl = 4;
            const limit = CONTROLLER_DOWNGRADE[rcl];
            const got = runLinkScenario({
                rcl, ticksToDowngrade: limit, // nowhere near critical
                storageEnergy: 50, storageCapacity: 100000, // 0.05%, below the 1% reserve
            });
            assert(got === "lk-stor",
                "storage below its 1% reserve wins when the controller isn't critical " +
                    "(got " + got + ")");
        }

        // (c) storage comfortable (>=50% fill) and controller still short of
        // RCL8 -> controller link (real RCL to gain beats a storage that's
        // already fine)
        {
            const rcl = 6;
            const limit = CONTROLLER_DOWNGRADE[rcl];
            const got = runLinkScenario({
                rcl, ticksToDowngrade: limit,
                storageEnergy: 60000, storageCapacity: 100000, // 60% fill
            });
            assert(got === "lk-ctrl",
                "a comfortable storage below RCL8 favors the controller link " +
                    "(got " + got + ")");
        }

        // (d) default: none of the above -> storage link (RCL8, nothing left
        // to gain from the controller)
        {
            const rcl = 8;
            const limit = CONTROLLER_DOWNGRADE[rcl];
            const got = runLinkScenario({
                rcl, ticksToDowngrade: limit,
                storageEnergy: 60000, storageCapacity: 100000, // 60% fill, but RCL8
            });
            assert(got === "lk-stor",
                "RCL8 with a comfortable storage falls back to the storage link by " +
                    "default (got " + got + ")");
        }
    }

    // --- builder: opportunistic repair (range 3) only fires for critical
    // targets (<30%, same bar as the main repair branch) - a merely-damaged
    // (32%) structure sitting in range no longer preempts a real
    // construction site also in range on the same tick (ROADMAP 0043: used
    // to be a flat 35%, so anything under it hijacked opportunisticWork's
    // early return before the site ever got a look) --------------------
    {
        Memory.rooms.BOppRoom = {};
        const oppController = Object.assign(new RoomObject(), {
            id: "bopp-ctrl", my: true, level: 4, progress: 0, progressTotal: 1,
            ticksToDowngrade: 200000, pos: new RoomPosition(25, 25, "BOppRoom"),
        });
        REG[oppController.id] = oppController;

        const hurtExt = Object.assign(new OwnedStructure(), {
            id: "bopp-hurt", structureType: STRUCTURE_EXTENSION,
            hits: 32, hitsMax: 100, my: true,
            pos: new RoomPosition(10, 10, "BOppRoom"),
            room: { name: "BOppRoom" },
        });
        REG[hurtExt.id] = hurtExt;

        const oppSite = Object.assign(new ConstructionSite(), {
            id: "bopp-site", structureType: STRUCTURE_EXTENSION,
            progress: 0, progressTotal: 100,
            pos: new RoomPosition(11, 10, "BOppRoom"),
        });
        REG[oppSite.id] = oppSite;

        function oppFind(type, opts) {
            let list = [];
            if (type === FIND_STRUCTURES) list = [hurtExt];
            if (type === FIND_MY_CONSTRUCTION_SITES) list = [oppSite];
            if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
            return list;
        }

        const oppRepairs = [];
        const oppBuilds = [];
        const oppCreep = Object.assign(new Creep(), {
            id: "bopp-creep", name: "BOpp1",
            pos: new RoomPosition(10, 11, "BOppRoom"), // range 1 to both
            room: Object.assign(new Room("BOppRoom"), {
                controller: oppController, storage: null, find: oppFind,
            }),
            store: store(50, 50), memory: {},
            hits: 100, hitsMax: 100,
            body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
            owner: { username: "me" },
            harvest: noop, upgradeController: noop,
            build: (t) => { oppBuilds.push(t); return OK; },
            repair: (t) => { oppRepairs.push(t); return OK; },
            transfer: noop, withdraw: noop, pickup: noop, move: noop,
            moveTo: noop, moveByPath: noop, drop: noop,
            rangedAttack: noop, rangedMassAttack: noop, heal: noop,
            rangedHeal: noop, attack: noop,
        });

        Game.time++;
        builder.run(oppCreep);
        assert(
            !oppRepairs.includes(hurtExt) && oppBuilds.includes(oppSite),
            "a 32% structure in range no longer preempts a real construction " +
                "site in range - only a <30%/critical target still short-circuits " +
                "opportunisticWork (got repairs=" +
                JSON.stringify(oppRepairs.map((r) => r && r.id)) +
                " builds=" + JSON.stringify(oppBuilds.map((b) => b && b.id)) + ")"
        );
    }

    // --- Fase 2: needs.js alternates solo defender vs a striker+medic
    // pair by room.energyCapacityAvailable ---------------------------
    const needsMod = require(path.join(PROJECT, "src/rooms/needs"));
    const combat = require(path.join(PROJECT, "src/utils/combat"));
    const priorEnergyCap = room.energyCapacityAvailable;
    const priorEnemies = Memory.rooms.W1N1.enemies;
    Memory.rooms.W1N1.enemies = 2;

    room.energyCapacityAvailable = 300; // below defender.pairEnergyThreshold (500)
    Game.time++;
    let n4 = needsMod.roomNeeds(room);
    assert(n4.defender > 0 && n4.defenderStriker === 0 && n4.defenderMedic === 0,
        "below pairEnergyThreshold: wants the solo defender, not a pair (got " +
            JSON.stringify(n4) + ")");

    room.energyCapacityAvailable = 600; // at/above defender.pairEnergyThreshold
    Game.time++;
    n4 = needsMod.roomNeeds(room);
    assert(
        n4.defender === 0 && n4.defenderStriker > 0 &&
            n4.defenderMedic === n4.defenderStriker,
        "at/above pairEnergyThreshold: wants a striker+medic pair (1:1), not the solo defender (got " +
            JSON.stringify(n4) + ")"
    );

    room.energyCapacityAvailable = priorEnergyCap;
    Memory.rooms.W1N1.enemies = priorEnemies;
    Game.time++;

    // --- Fase 2: defenderStriker/defenderMedic body shape --------------
    const strikerMod = require(path.join(PROJECT, "src/roles/defenderStriker"));
    const medicMod = require(path.join(PROJECT, "src/roles/defenderMedic"));
    const strikerBody = strikerMod.spawnData({ energyAvailable: 1000 }).body;
    assert(
        strikerBody.filter((p) => p === RANGED_ATTACK).length === 5 &&
            strikerBody.filter((p) => p === MOVE).length === 5 &&
            strikerBody.indexOf(MOVE) === 5,
        "defenderStriker body: 1:1 RANGED_ATTACK:MOVE, no HEAL, MOVE last (got " +
            JSON.stringify(strikerBody) + ")"
    );
    const medicBody = medicMod.spawnData({ energyAvailable: 900 }).body;
    assert(
        medicBody.filter((p) => p === HEAL).length === 3 &&
            medicBody.filter((p) => p === MOVE).length === 3 &&
            medicBody.indexOf(MOVE) === 3,
        "defenderMedic body: 1:1 HEAL:MOVE, no RANGED_ATTACK, MOVE last (got " +
            JSON.stringify(medicBody) + ")"
    );

    // --- Fase 2: pairing (memory.partnerId, no Memory.squads) ----------
    {
        const combatMod = require(path.join(PROJECT, "src/utils/combat"));
        const s = Object.assign(Object.create(Creep.prototype), {
            id: "pairstriker1", room: { name: "TestRoom" },
            pos: new RoomPosition(25, 25, "TestRoom"),
            memory: { role: "defenderStriker", room: "TestRoom" },
        });
        const m = Object.assign(Object.create(Creep.prototype), {
            id: "pairmedic1", room: { name: "TestRoom" },
            pos: new RoomPosition(26, 25, "TestRoom"),
            memory: { role: "defenderMedic", room: "TestRoom" },
        });
        Game.creeps.PairStriker1 = s;
        Game.creeps.PairMedic1 = m;
        Game.time++;
        const found = combatMod.ensurePartner(s, "defenderMedic");
        assert(
            found === m && s.memory.partnerId === "pairmedic1" &&
                m.memory.partnerId === "pairstriker1",
            "ensurePartner() pairs two unpaired creeps, sets partnerId on both sides"
        );
        delete Game.creeps.PairStriker1;
        delete Game.creeps.PairMedic1;
    }

    // --- Fase 2: D3 tank stance - on our own rampart, a melee hostile at
    // the same range is held off (no flee) when adjacency (range 1) is
    // the only real danger, but still flees if melee actually reaches
    // (a gap in the perimeter) - isolated "TestRoom" fixture -----------
    {
        // the smoke PathFinder mock doesn't implement opts.flee (it only
        // walks straight toward a goal) - combat.flee() always "fails"
        // here and falls through to its own cornered-retreat-to-spawn
        // fallback, which IS observable (moveTo the spawn). That fallback
        // is what these assertions check for "fled".
        const spawnFixture = Object.assign(new Spawn(), {
            id: "dsspawn", my: true, pos: new RoomPosition(40, 40, "TestRoom"),
        });
        function combatFind(hostiles, structures) {
            return (type, opts) => {
                let list = [];
                if (type === FIND_HOSTILE_CREEPS) list = hostiles;
                else if (type === FIND_STRUCTURES) list = structures || [];
                else if (type === FIND_MY_SPAWNS) list = [spawnFixture];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            };
        }
        function mkMelee(id, pos) {
            return Object.assign(new Creep(), {
                id, name: id, owner: { username: "Invader" }, pos,
                hits: 100, hitsMax: 100,
                body: [{ type: ATTACK }, { type: MOVE }],
            });
        }
        function mkStriker(hostiles, structures, onRampart) {
            let moveToArg = null, massAttacked = false;
            const creep = Object.assign(Object.create(Creep.prototype), {
                id: "dsx", room: { name: "TestRoom", find: combatFind(hostiles, structures) },
                pos: new RoomPosition(25, 25, "TestRoom"),
                memory: { role: "defenderStriker", room: "TestRoom" },
                moveTo: (t, o) => { moveToArg = { t, o }; return OK; },
                moveByPath: noop, rangedAttack: noop,
                rangedMassAttack: () => { massAttacked = true; return OK; },
            });
            creep.pos.lookFor = () => (onRampart ? [{ structureType: STRUCTURE_RAMPART, my: true }] : []);
            return {
                creep,
                movedTo: () => moveToArg,
                fledToSpawn: () => moveToArg && moveToArg.t === spawnFixture,
                shot: () => massAttacked,
            };
        }

        Memory.rooms.TestRoom = { defenseActive: true };

        // range 2 (not adjacent), on rampart -> holds, no flee
        let melee = mkMelee("m1", new RoomPosition(25, 27, "TestRoom"));
        let t = mkStriker([melee], [], true);
        Game.time++;
        strikerMod.run(t.creep);
        assert(!t.movedTo() && t.shot(),
            "D3: on our rampart, melee 2 tiles away - holds position and keeps shooting");

        // same range 2, NOT on rampart -> flees (matches the old defender)
        melee = mkMelee("m2", new RoomPosition(25, 27, "TestRoom"));
        t = mkStriker([melee], [], false);
        Game.time++;
        strikerMod.run(t.creep);
        assert(t.fledToSpawn(),
            "D3: same range (2), no rampart available - flees like the solo defender");

        // range 1 (adjacent) even while on rampart -> a gap, flees anyway
        melee = mkMelee("m3", new RoomPosition(25, 26, "TestRoom"));
        t = mkStriker([melee], [], true);
        Game.time++;
        strikerMod.run(t.creep);
        assert(t.fledToSpawn(),
            "D3: melee actually adjacent despite the rampart (a gap) - flees, self-corrects");

        delete Memory.rooms.TestRoom;
    }

    // --- Fase 2: O1 mop-up - closes in on a WOUNDED target within
    // defender.mopUpRange to finish it (range 1), but only holds at the
    // usual KITE_RANGE for a healthy one --------------------------------
    {
        function combatFind(hostiles) {
            return (type, opts) => {
                let list = type === FIND_HOSTILE_CREEPS ? hostiles : [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            };
        }
        function mkRangedHostile(id, hits) {
            return Object.assign(new Creep(), {
                id, name: id, owner: { username: "Invader" },
                pos: new RoomPosition(30, 25, "TestRoom"),
                hits, hitsMax: 100,
                body: [{ type: RANGED_ATTACK }, { type: MOVE }],
            });
        }
        function mkStriker2(hostiles) {
            let moveToArg = null;
            const creep = Object.assign(Object.create(Creep.prototype), {
                id: "dsy", room: { name: "TestRoom", find: combatFind(hostiles) },
                pos: new RoomPosition(25, 25, "TestRoom"),
                memory: { role: "defenderStriker", room: "TestRoom" },
                moveTo: (t, o) => { moveToArg = { t, o }; return OK; },
                moveByPath: noop, rangedAttack: noop, rangedMassAttack: noop,
            });
            creep.pos.lookFor = () => [];
            return { creep, movedTo: () => moveToArg };
        }

        Memory.rooms.TestRoom = { defenseActive: true };

        let hostile = mkRangedHostile("r1", 40); // wounded
        let t = mkStriker2([hostile]);
        Game.time++;
        strikerMod.run(t.creep);
        assert(t.movedTo() && t.movedTo().o.range === 1,
            "O1: closes to range 1 on a wounded target to finish it (got " +
                JSON.stringify(t.movedTo() && t.movedTo().o) + ")");

        hostile = mkRangedHostile("r2", 100); // full health
        t = mkStriker2([hostile]);
        Game.time++;
        strikerMod.run(t.creep);
        assert(t.movedTo() && t.movedTo().o.range === combat.KITE_RANGE,
            "O1: a healthy target is only held at the usual KITE_RANGE, not pursued (got " +
                JSON.stringify(t.movedTo() && t.movedTo().o) + ")");

        delete Memory.rooms.TestRoom;
    }

    // --- Fase 2: defenderMedic follows its partner, heals, and only
    // flees for real (adjacent melee) - never the generic takeCover 5-
    // tile berth, which would fight its whole job -----------------------
    {
        Memory.rooms.TestRoom = { defenseActive: true };
        const striker = Object.assign(Object.create(Creep.prototype), {
            id: "medstriker1", room: { name: "TestRoom" },
            pos: new RoomPosition(28, 25, "TestRoom"),
        });
        REG.medstriker1 = striker;

        let healed = null, moveToArg = null;
        const medic = Object.assign(Object.create(Creep.prototype), {
            id: "medic2", room: { name: "TestRoom", find: () => [] },
            pos: new RoomPosition(25, 25, "TestRoom"),
            hits: 100, hitsMax: 100,
            memory: { role: "defenderMedic", room: "TestRoom", partnerId: "medstriker1" },
            moveTo: (t, o) => { moveToArg = { t, o }; return OK; },
            heal: (t) => { healed = t; return OK; },
            rangedHeal: (t) => { healed = t; return OK; },
        });
        Game.time++;
        medicMod.run(medic);
        assert(moveToArg && moveToArg.t === striker,
            "defenderMedic follows its partner when farther than kite range - 1");

        delete REG.medstriker1;
        delete Memory.rooms.TestRoom;
    }

    delete Memory.rooms.TestRoom;
}

// --- scout: max one, empire-wide ----------------------------------
const scout = require(path.join(PROJECT, "src/roles/scout"));
assert(census.total("scout", 0) === 0, "no scouts yet");
Game.time++;
assert(scout.spawn(room) === true, "a scout is wanted when there is none");
Game.creeps.Sc1 = Object.assign(new Creep(), {
    id: "sc1", name: "Sc1", room, memory: { role: "scout", home: "W1N1" },
    ticksToLive: 100, pos: new RoomPosition(1, 1, "W1N1"),
});
Game.time++;
assert(scout.spawn(room) === false, "no second scout is spawned");

// A flavored scout name no longer starts with "Scout". The spawn guard must
// inspect the persisted role instead of the cosmetic name.
spawn.spawning = { name: "Kessa Farrow" };
Memory.creeps[spawn.spawning.name] = { role: "scout" };
Game.time++;
assert(scout.spawn(room) === false,
    "a scout already spawning is detected by role, not by its flavored name");
spawn.spawning = null;
delete Memory.creeps["Kessa Farrow"];

// an extra scout retires itself
Game.creeps.Sc2 = Object.assign(new Creep(), {
    id: "sc2", name: "Sc2", room, memory: { role: "scout", home: "W1N1" },
    ticksToLive: 100, pos: new RoomPosition(2, 2, "W1N1"),
    signController: () => OK, moveTo: () => OK,
});
Game.creeps.Sc2.suicide = () => { Game.creeps.Sc2._dead = true; return OK; };
Game.creeps.Sc1.signController = () => OK;
Game.creeps.Sc1.moveTo = () => OK;
Game.creeps.Sc1.suicide = () => { Game.creeps.Sc1._dead = true; return OK; };
Game.time++;
scout.run(Game.creeps.Sc1);
scout.run(Game.creeps.Sc2);
assert(!Game.creeps.Sc1._dead && Game.creeps.Sc2._dead === true,
    "with two scouts, the later one suicides");

// --- sign queue -------------------------------------------------
global.signRoom("W1N1", "hello world");
assert((Memory.signQueue || {}).W1N1 === "hello world", "signRoom queues a message");
Game.creeps.Sc1._signed = null;
Game.creeps.Sc1.signController = (c, t) => { Game.creeps.Sc1._signed = t; return OK; };
Game.creeps.Sc1.pos = new RoomPosition(10, 10, "W1N1"); // in the room, at the controller
scout.run(Game.creeps.Sc1);
assert(Game.creeps.Sc1._signed === "hello world" && !(Memory.signQueue || {}).W1N1,
    "the scout signs the controller and clears the request");
delete Game.creeps.Sc1;
delete Game.creeps.Sc2;

// A creep remains visible in Game.creeps while it is still being spawned, but
// the engine rejects movement intents with ERR_BUSY until spawning ends.
// Scout missions must remain queued and avoid routing/recovery during that
// interval.
{
    let spawningMoveCalled = false;
    global.signRoom("W9N9", "wait for spawn");
    const spawningScout = Object.assign(new Creep(), {
        id: "scSpawning", name: "ScSpawning", room,
        spawning: true,
        memory: { role: "scout", home: "W1N1" },
        pos: new RoomPosition(20, 20, "W1N1"),
        moveTo: () => { spawningMoveCalled = true; return ERR_BUSY; },
    });
    Game.creeps.ScSpawning = spawningScout;
    scout.run(spawningScout);
    assert(!spawningMoveCalled && Memory.signQueue.W9N9 === "wait for spawn",
        "a spawning scout does not attempt movement or consume its pending mission");
    delete Game.creeps.ScSpawning;
    delete Memory.signQueue.W9N9;
}

// --- sign queue: travel stall guard (ROADMAP 0060 follow-up) - moveToRoom()
// now refuses a blacklisted destination outright with zero feedback of its
// own, and signRoom's travel branch never checked its return value anyway,
// so without this a signRoom() destination that turns out unreachable would
// camp here silently for the life of the blacklist -----------------------
{
    Memory.settings = Memory.settings || {};
    Memory.settings.routing = { travelStallLimit: 2 };
    global.signRoom("W7N7", "stuck");
    const stuckSignScout = Object.assign(new Creep(), {
        id: "scSign", name: "ScSign", room, memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(20, 20, "W1N1"),
        signController: () => OK, suicide: () => OK, moveTo: () => OK,
    });
    Game.creeps.ScSign = stuckSignScout;
    Game.time++; // census.all() caches by Game.time - bust the stale scan
    // that still shows the just-deleted Sc1/Sc2 (>1 "scout" would suicide
    // this new one via the census-based single-scout enforcement)
    scout.run(stuckSignScout); // tick 1: starts the travel clock
    assert((Memory.signQueue || {}).W7N7 === "stuck",
        "the sign request is still pending right after starting to travel");
    Game.time += 5; // past the (test-lowered) travel stall limit
    scout.run(stuckSignScout);
    assert(!(Memory.signQueue || {}).W7N7,
        "the scout gives up on a signRoom() destination it never reaches and drops the request");
    delete Memory.settings.routing;
    delete Game.creeps.ScSign;
}

// --- sign queue: optional source room (ROADMAP 0082) -----------------------
{
    const routing = require(path.join(PROJECT, "src/utils/routing"));
    const originalMoveToRoom = routing.moveToRoom;
    const routedTo = [];
    const routedOptions = [];
    routing.moveToRoom = (creep, roomName, opts) => {
        routedTo.push(roomName);
        routedOptions.push(opts);
        return OK;
    };
    const sourceRoom = Object.assign({}, room, { name: "W2N2" });
    const targetRoom = Object.assign({}, room, {
        name: "W3N3",
        controller: {},
    });
    const sourceScout = Object.assign(new Creep(), {
        id: "scSource", name: "ScSource", room,
        memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(20, 20, "W1N1"),
        signController: (controller, text) => {
            sourceScout._signed = text;
            return OK;
        },
        suicide: () => OK,
    });
    sourceScout.memory._routeAvoid = ["WStaleRoom"];
    sourceScout.memory._realRoute = ["WStaleRoom"];
    Game.creeps.ScSource = sourceScout;
    global.signRoom("W3N3", "from home", "W2N2");
    assert(
        Memory.signQueue.W3N3.text === "from home" &&
        Memory.signQueue.W3N3.from === "W2N2",
        "signRoom stores the optional source room"
    );
    Game.time++;
    scout.run(sourceScout);
    assert(routedTo[0] === "W2N2",
        "signRoom scout travels to the source room first");
    assert(!routedOptions[0].nativeRoute,
        "signRoom uses the standard route flow with ERR_NO_PATH recovery");
    assert(!sourceScout.memory._routeAvoid && !sourceScout.memory._realRoute,
        "a new signRoom mission clears stale route state before travelling");
    sourceScout.room = sourceRoom;
    sourceScout.pos = new RoomPosition(20, 20, "W2N2");
    Game.time++;
    scout.run(sourceScout);
    assert(routedTo[1] === "W3N3",
        "signRoom scout travels to the destination after reaching the source");
    sourceScout.room = Object.assign({}, room, { name: "W2N3" });
    Game.time++;
    scout.run(sourceScout);
    assert(routedTo[2] === "W3N3",
        "signRoom scout keeps travelling to the destination after leaving the source");
    sourceScout.room = targetRoom;
    sourceScout.pos = new RoomPosition(20, 20, "W3N3");
    Game.time++;
    scout.run(sourceScout);
    assert(sourceScout._signed === "from home" && !Memory.signQueue.W3N3,
        "signRoom scout signs and clears a request with a source room");

    sourceScout.memory._move = { path: "4" };
    let directScoutDirection = null;
    sourceScout.move = (direction) => {
        directScoutDirection = direction;
        return OK;
    };
    global.scoutTrace("step");
    assert(directScoutDirection === BOTTOM_RIGHT,
        "scoutTrace(step) sends the cached direction to the single scout directly");
    global.scoutTrace(true);
    assert(Memory.settings.debug.scoutTrace === true,
        "scoutTrace(true) enables opt-in scout route logs");
    let scoutTraceError = null;
    try { global.scoutTrace(); } catch (error) { scoutTraceError = error; }
    assert(!scoutTraceError,
        "scoutTrace() snapshots the single scout without throwing");
    global.scoutTrace(false);
    assert(Memory.settings.debug.scoutTrace === false,
        "scoutTrace(false) disables opt-in scout route logs");

    global.signRoom("W3N3", "legacy");
    assert(Memory.signQueue.W3N3 === "legacy",
        "signRoom without a source preserves the legacy queue format");
    global.signRoom("W3N3");
    assert(!Memory.signQueue.W3N3,
        "signRoom cancellation removes both legacy and structured requests");
    routing.moveToRoom = originalMoveToRoom;
    delete Game.creeps.ScSource;
}

Memory.rooms.E1N46 = {
    owner: { username: "vlc6wsw0l" },
    routeDeadEndUntil: Game.time + 1000,
};
const routingForAlly = require(path.join(PROJECT, "src/utils/routing"));
assert(!routingForAlly.isKnownDeadEnd("E1N46"),
    "an allied room is not blocked by a stale shared route dead-end mark");
delete Memory.rooms.E1N46.routeDeadEndUntil;
routingForAlly.markDeadEnd("E1N46");
assert(!Memory.rooms.E1N46.routeDeadEndUntil,
    "an allied room is never marked as a shared route dead-end");

    // A sourced sign mission must be spawned by the requested origin room, not by
    // whichever owned room happens to be processed first.
    {
        Memory.signQueue = {};
        delete Game.creeps.Sc1;
        delete Game.creeps.Sc2;
        global.signRoom("E1N45", "Glory to CtrlAltDefeat!", "E1N47");
        const originRoom = Object.assign({}, room, { name: "E1N47" });
        const wrongRoom = Object.assign({}, room, { name: "E1N45" });
        Game.time++;
        assert(scout.spawn(wrongRoom) === false,
            "a sourced sign request is not spawned from the destination room");
        Game.time++;
        assert(scout.spawn(originRoom) === true,
            "a sourced sign request is spawned from its origin room");
        global.signRoom("E1N45");
    }

// --- scout: free-roam exploration actually crosses room borders, and an
// unreachable target room gets blacklisted instead of retried forever
// (ROADMAP 0009) -----------------------------------------------------
{
    Memory.rooms.W1N1.exits = { 1: "W1N2", 3: "W2N1" };
    delete Memory.rooms.W1N2;
    delete Memory.rooms.W2N1;

    let moveArg = null;
    const explorer = Object.assign(new Creep(), {
        id: "scExplore", name: "ScExplore", room,
        memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(25, 25, "W1N1"),
        signController: () => OK,
        moveTo: (t, o) => { moveArg = { t, o }; return OK; },
    });
    Game.creeps.ScExplore = explorer;

    Game.time++;
    scout.run(explorer);
    assert(moveArg && moveArg.t.roomName === "W1N2",
        "an idle scout picks the least-recently-seen exit and moves toward a position IN that room, " +
            "not a border tile of its own room (got " + (moveArg && JSON.stringify(moveArg.t)) + ")");
    assert(explorer.memory.targetRoom === "W1N2",
        "the scout remembers which room it's heading to");
    assert(explorer.memory.target === undefined,
        "no separate x/y border-tile target is kept - routing.moveToRoom owns the crossing now");

    // the target room turns out unreachable -> blacklist it, don't retarget it
    explorer.moveTo = () => ERR_NO_PATH;
    Game.time++;
    scout.run(explorer);
    assert(Memory.rooms.W1N2.scoutBlacklistUntil > Game.time,
        "an unreachable target room is blacklisted instead of being retried every tick");
    assert(explorer.memory.targetRoom === undefined,
        "the failed target is cleared once blacklisted");

    // reselection must skip the blacklisted room even though it's still the
    // least-recently-seen one (lastVisit undefined), and pick the other exit
    moveArg = null;
    explorer.moveTo = (t, o) => { moveArg = { t, o }; return OK; };
    Game.time++;
    scout.run(explorer);
    assert(moveArg && moveArg.t.roomName === "W2N1",
        "reselection skips the blacklisted room and picks the other exit (got " +
            (moveArg && JSON.stringify(moveArg.t)) + ")");

    delete Game.creeps.ScExplore;
    delete Memory.rooms.W1N2.scoutBlacklistUntil;
}

// --- scout: a dead-end room (single exit, straight back the way the scout
// came) must not cause an infinite backtrack ping-pong. The scout remembers
// the room it just left (memory.cameFrom), refuses to immediately reselect
// it, and - once that's the only option - blacklists the dead end before
// retreating, so the NEXT selection at the hub picks something new instead
// of bouncing straight back in ----------------------------------------
{
    const savedExits = Memory.rooms.W1N1.exits;
    Memory.rooms.W1N1.exits = { 1: "W5N1" };
    Memory.rooms.W5N1 = { exits: { 5: "W1N1" } }; // a dead end: only leads back home
    delete Memory.rooms.W6N1;

    let moveArg = null;
    const pinger = Object.assign(new Creep(), {
        id: "scPing", name: "ScPing", room,
        memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(25, 25, "W1N1"),
        signController: () => OK,
        moveTo: (t, o) => { moveArg = { t, o }; return OK; },
    });
    Game.creeps.ScPing = pinger;

    Game.time++;
    scout.run(pinger);
    assert(moveArg && moveArg.t.roomName === "W5N1",
        "scout heads into the only known neighbor first (the dead end)");
    assert(pinger.memory.cameFrom === "W1N1",
        "cameFrom records the room being left, to detect backtracking later");

    // simulate arrival: the scout is now physically in the dead end
    pinger.room = { name: "W5N1" };
    moveArg = null;
    Game.time++;
    scout.run(pinger);
    assert(Memory.rooms.W5N1.scoutBlacklistUntil > Game.time,
        "a dead end (only exit leads back the way we came) is blacklisted instead of just bouncing back forever");
    assert(moveArg && moveArg.t.roomName === "W1N1",
        "with nothing new reachable from here, the scout retreats the way it came (got " +
            (moveArg && JSON.stringify(moveArg.t)) + ")");

    // back at the hub: a fresh room is now known too - the scout must NOT
    // bounce straight back into the (now blacklisted) dead end
    pinger.room = room; // back in W1N1
    Memory.rooms.W1N1.exits = { 1: "W5N1", 3: "W6N1" };
    moveArg = null;
    Game.time++;
    scout.run(pinger);
    assert(moveArg && moveArg.t.roomName === "W6N1",
        "back at the hub, the scout picks the fresh room instead of the blacklisted dead end (got " +
            (moveArg && JSON.stringify(moveArg.t)) + ")");

    delete Game.creeps.ScPing;
    delete Memory.rooms.W5N1;
    delete Memory.rooms.W6N1;
    Memory.rooms.W1N1.exits = savedExits;
}

// --- remote mining (0020): eligibility, reservation, roomNeeds, console --
{
    const remotesMod = require(path.join(PROJECT, "src/rooms/remotes"));
    const reserver = require(path.join(PROJECT, "src/roles/reserver"));
    const remoteMiner = require(path.join(PROJECT, "src/roles/remoteMiner"));
    const remoteHauler = require(path.join(PROJECT, "src/roles/remoteHauler"));

    Memory.rooms.W1N2 = { lastVisit: Game.time, my: false, sourceNumber: 1 };
    Memory.rooms.W2N1 = { lastVisit: Game.time, my: false, owner: "Enemy", sourceNumber: 1 };

    // --- eligible() ------------------------------------------------------
    let elig = remotesMod.eligible(room);
    assert(elig.indexOf("W1N2") !== -1,
        "a scouted, unowned neighbor with sources is eligible");
    assert(elig.indexOf("W2N1") === -1,
        "a neighbor owned by someone else is not eligible");

    delete Memory.rooms.W1N2.lastVisit;
    assert(remotesMod.eligible(room).indexOf("W1N2") === -1,
        "an un-scouted neighbor is not eligible");
    Memory.rooms.W1N2.lastVisit = Game.time;

    const realFindRoute = Game.map.findRoute;
    Game.map.findRoute = (from, to) =>
        to === "W1N2"
            ? [{ exit: 1, room: "Wfar1" }, { exit: 1, room: "Wfar2" }, { exit: 1, room: to }]
            : realFindRoute(from, to);
    Game.time++; // bust roomDistance()'s per-tick cache from the calls above
    assert(remotesMod.eligible(room).indexOf("W1N2") === -1,
        "a neighbor beyond the distance cap is not eligible");
    Game.map.findRoute = realFindRoute;
    Game.time++; // bust it again so the restored findRoute is re-read fresh

    // --- reservation / active() ------------------------------------------
    Memory.rooms.W1N1.remotes = ["W1N2"];
    assert(remotesMod.pendingReserves(room).indexOf("W1N2") !== -1,
        "an unreserved remote needs a reserver dispatched");

    Memory.rooms.W1N2.reservation = { username: "someone-else", ticksToEnd: 4000 };
    assert(remotesMod.isReservedByMe("W1N2") === false,
        "a room reserved by someone else is not reserved by me");
    assert(remotesMod.active(room).length === 0,
        "a remote reserved by someone else never becomes active");

    Memory.rooms.W1N2.reservation = { username: "me", ticksToEnd: 100 };
    assert(remotesMod.pendingReserves(room).indexOf("W1N2") !== -1,
        "a low (about to expire) reservation still needs a reserver");

    Memory.rooms.W1N2.reservation = { username: "me", ticksToEnd: 4000 };
    assert(remotesMod.isReservedByMe("W1N2") === true,
        "a healthy reservation under my username is reserved by me");
    assert(remotesMod.pendingReserves(room).indexOf("W1N2") === -1,
        "a healthy reservation doesn't need a reserver");
    assert(remotesMod.active(room).indexOf("W1N2") !== -1,
        "a reserved, safe remote is active");

    Memory.rooms.W1N2.enemies = 3;
    assert(remotesMod.active(room).length === 0,
        "a remote with hostiles seen is not active, even if reserved");
    Memory.rooms.W1N2.enemies = 0;

    // --- isForeignOwned() (ROADMAP 0064 live follow-up): ownership alone,
    // no hostile creep required - a claimer walked straight into an
    // enemy-owned room with zero creeps visible there, and got blocked
    // anyway by walls/ramparts the owner had already built ---------------
    assert(remotesMod.isForeignOwned("W2N1") === true,
        "a room owned by someone else's empire is foreign-owned, even with zero enemies seen");
    Memory.rooms.WAllyOwned = { owner: "fR1dj" }; // one of utils/hostiles.js's default allies
    assert(remotesMod.isForeignOwned("WAllyOwned") === false,
        "an ally's own room is exempt - their interior obstacles are the reactive backtrack's " +
            "job (ROADMAP 0061), not something routing refuses to enter outright");
    delete Memory.rooms.WAllyOwned;
    Memory.rooms.WAllyOwnedObject = { owner: { username: "fR1dj" } };
    assert(remotesMod.isForeignOwned("WAllyOwnedObject") === false,
        "an ally's own room with object-form owner is also exempt from routing refusal");
    delete Memory.rooms.WAllyOwnedObject;
    assert(remotesMod.isForeignOwned("W1N2") === false,
        "an unowned room is never foreign-owned");
    assert(remotesMod.isForeignOwned("WNeverVisited") === false,
        "no intel at all for a room is never foreign-owned - never a guess");

    Memory.rooms.W1N1.defenseActive = true;
    assert(remotesMod.active(room).length === 0,
        "home under attack pulls back every active remote");
    Memory.rooms.W1N1.defenseActive = false;

    // --- roomNeeds wires the counts through --------------------------
    Game.time++;
    let n2 = needs.roomNeeds(room);
    assert(n2.remoteMiner === 1 && n2.remoteHauler === 1 && n2.reserver === 0,
        "roomNeeds wants 1 remoteMiner/remoteHauler per active remote, 0 reservers once healthy (got " +
            JSON.stringify({ m: n2.remoteMiner, h: n2.remoteHauler, r: n2.reserver }) + ")");

    delete Memory.rooms.W1N1.remotes;
    Game.time++;
    n2 = needs.roomNeeds(room);
    assert(n2.remoteMiner === 0 && n2.remoteHauler === 0 && n2.reserver === 0,
        "no remotes listed -> every remote-mining count is 0");
    Memory.rooms.W1N1.remotes = ["W1N2"];

    // --- console: reserveRoom / unreserveRoom / claimRoom -----------------
    delete Memory.rooms.W1N1.remotes;
    global.reserveRoom("W1N2");
    assert(
        Memory.rooms.W1N1.remotes &&
            Memory.rooms.W1N1.remotes.indexOf("W1N2") !== -1,
        "reserveRoom() adds the target to the nearest owned room's remotes list"
    );
    global.unreserveRoom("W1N2");
    assert(
        !Memory.rooms.W1N1.remotes ||
            Memory.rooms.W1N1.remotes.indexOf("W1N2") === -1,
        "unreserveRoom() removes it again"
    );

    delete Memory.claimTarget;
    global.claimRoom("W1N2");
    assert(
        Memory.claimTarget &&
            Memory.claimTarget.room === "W1N2" &&
            Memory.claimTarget.from === "W1N1",
        "claimRoom() records a pending claim from the nearest owned room"
    );
    global.claimRoom("W2N1");
    assert(Memory.claimTarget.room === "W1N2",
        "a second claimRoom() call is ignored while one is already pending");

    // --- cancelClaim() ----------------------------------------------------
    const logsBeforeCancelClaim = logs.length;
    console.log = (...a) => { logs.push(a.join(" ")); };
    global.cancelClaim();
    console.log = origLog;
    assert(!Memory.claimTarget, "cancelClaim() clears a pending claim");
    assert(logs.slice(logsBeforeCancelClaim).some((l) => l.includes("cancelled")),
        "cancelClaim() logs the cancellation");
    global.cancelClaim();
    assert(!Memory.claimTarget, "cancelClaim() with nothing pending is a no-op, not a throw");

    // --- claimRoom(): owner / controller / novice-zone validations ------
    Memory.rooms.W1N2.owner = "SomeoneElse";
    global.claimRoom("W1N2");
    assert(!Memory.claimTarget,
        "claimRoom() refuses a target already owned by another player");
    delete Memory.rooms.W1N2.owner;

    Memory.rooms.W1N2.hasController = false;
    global.claimRoom("W1N2");
    assert(!Memory.claimTarget,
        "claimRoom() refuses a target with no controller (highway/SK/center room)");
    delete Memory.rooms.W1N2.hasController;

    const realGetRoomStatus = Game.map.getRoomStatus;
    Game.map.getRoomStatus = () => ({ status: "novice", timestamp: 123 });
    global.claimRoom("W1N2");
    assert(!Memory.claimTarget,
        "claimRoom() refuses a target blocked by novice/respawn zone protection");
    Game.map.getRoomStatus = realGetRoomStatus;

    // --- claimRoom(): refuses a target the CLAIM lifetime can't reach ----
    // (CREEP_CLAIM_LIFE_TIME=600, not the usual 1500 - any body with a
    // CLAIM part is capped at that)
    {
        const realFindRoute = Game.map.findRoute;
        Game.map.findRoute = (from, to) =>
            to === "W1N2"
                ? _.range(20).map(() => ({ exit: 1, room: "Wfar" })) // 20 hops - far too many
                : realFindRoute(from, to);
        Game.time++; // bust roomDistance()'s per-tick cache
        global.claimRoom("W1N2");
        assert(!Memory.claimTarget,
            "claimRoom() refuses a target too far for a CLAIM creep to survive the trip");
        Game.map.findRoute = realFindRoute;
        Game.time++; // bust it again so the restored findRoute is re-read fresh
    }

    // --- claim mission: a claimer that dies mid-trip doesn't respawn
    // forever - reserver.js marks creepSeen once alive, needs.js notices
    // when it's gone without ever completing (success/dead-end both clear
    // Memory.claimTarget themselves, from inside the creep's own run()) --
    {
        delete Memory.claimTarget;
        global.claimRoom("W1N2");
        assert(Memory.claimTarget && !Memory.claimTarget.creepSeen,
            "a freshly queued claim has no creepSeen yet");

        Game.time++;
        assert(needs.roomNeeds(room).reserver >= 1,
            "first attempt (no creepSeen yet, no live claimer): still wants one spawned");

        const claimCreep = Object.assign(Object.create(Creep.prototype), {
            id: "claimtest1", room, pos: new RoomPosition(20, 20, "W1N1"),
            body: [{ type: CLAIM }, { type: MOVE }],
            memory: { role: "reserver", mission: "claim", targetRoom: "W1N2", home: "W1N1" },
            moveTo: () => OK, claimController: () => OK, suicide: () => OK,
        });
        Game.creeps.ClaimTest1 = claimCreep;
        reserver.run(claimCreep);
        assert(Memory.claimTarget.creepSeen === true,
            "reserver.run() marks creepSeen once a claim creep has actually run");

        // dies mid-mission (combat, most likely) - never reaches the
        // controller, never calls claimController, never suicides cleanly
        delete Game.creeps.ClaimTest1;

        const logsBefore = logs.length;
        console.log = (...a) => { logs.push(a.join(" ")); };
        Game.time++;
        const n3 = needs.roomNeeds(room);
        console.log = origLog;
        assert(n3.reserver === 0 && !Memory.claimTarget,
            "once the claimer is gone without completing, the mission is abandoned, not retried");
        assert(logs.slice(logsBefore).some((l) => l.includes("claim on W1N2 abandoned")),
            "abandoning the claim logs why");
    }

    // --- claim mission: a hostile in the TARGET room itself is never
    // walked into - routing.moveToRoom/findRoute deliberately never block
    // the destination room (contest needs to enter one on purpose, reserve
    // targets are already pre-filtered by remotes.pendingReserves()), so
    // this mission-level check in reserver.js is what actually stops the
    // claimer from marching an unarmed CLAIM/MOVE body straight into a room
    // with a hostile creep camping it -------------------------------------
    {
        delete Memory.claimTarget;
        global.claimRoom("W1N2");
        Memory.rooms.W1N2.enemies = 1; // a hostile is camping the target now

        let moveToCalled = false;
        const hostileClaimCreep = Object.assign(Object.create(Creep.prototype), {
            id: "claimtest2", room, pos: new RoomPosition(20, 20, "W1N1"),
            body: [{ type: CLAIM }, { type: MOVE }],
            memory: { role: "reserver", mission: "claim", targetRoom: "W1N2", home: "W1N1" },
            moveTo: () => { moveToCalled = true; return OK; },
            claimController: () => OK, suicide: () => OK,
        });
        reserver.run(hostileClaimCreep);
        assert(!moveToCalled,
            "a claim mission never moves toward a target room that currently has a hostile in it");

        Memory.rooms.W1N2.enemies = 0; // the hostile is gone
        reserver.run(hostileClaimCreep);
        assert(moveToCalled,
            "once the target room is clear again, the claim mission resumes moving toward it");

        delete Memory.claimTarget;
    }

    // --- Fase 3: targetEnemies + raiding (ROADMAP 0032 O2/O4) ----------
    {
        const raidingMod = require(path.join(PROJECT, "src/rooms/raiding"));
        const combat = require(path.join(PROJECT, "src/utils/combat"));

        assert(hostiles.targetEnemies().length === 0, "targetEnemies is empty by default");
        global.addTargetEnemy("Rival1");
        assert(hostiles.isTargetEnemy("Rival1"), "addTargetEnemy() adds a player");
        assert(!hostiles.isTargetEnemy("SomeoneElse"), "a non-listed player is not a targetEnemy");
        global.removeTargetEnemy("Rival1");
        assert(!hostiles.isTargetEnemy("Rival1"), "removeTargetEnemy() removes it again");
        global.addTargetEnemy("Rival1"); // re-add for the rest of this block

        // --- isHostile() fix (ROADMAP 0036): targetEnemies counts as
        // hostile outside our own rooms too, not just hostilePlayers/
        // systemHostiles - without this, mem.enemies/combat.threats()
        // silently missed a guard a targetEnemy posted in their own/remote
        // room (affected O4 and would've affected O3 the same way) --------
        const foreignRoom = { controller: { my: false } };
        const rivalCreep = { owner: { username: "Rival1" }, body: [] };
        assert(hostiles.isHostile(rivalCreep, foreignRoom),
            "a targetEnemy's creep counts as hostile outside our own room, even unarmed and not in hostilePlayers");
        const randomCreep = { owner: { username: "SomeRandomPlayer" }, body: [] };
        assert(!hostiles.isHostile(randomCreep, foreignRoom),
            "a player in neither hostilePlayers nor targetEnemies is still not hostile outside our room");

        // --- isWeakEnemyRoom() -------------------------------------------
        Memory.rooms.E77N77 = {
            lastVisit: Game.time, owner: "Rival1", enemies: 0,
            numberOfTowers: 0, controllerLevel: 2,
        };
        assert(raidingMod.isWeakEnemyRoom("E77N77"),
            "a low-RCL, tower-less, hostile-free targetEnemy room is weak");

        Memory.rooms.E77N77.owner = "SomeoneElse";
        assert(!raidingMod.isWeakEnemyRoom("E77N77"),
            "not in targetEnemies - never weak, never a valid raid target");
        Memory.rooms.E77N77.owner = "Rival1";

        Memory.rooms.E77N77.numberOfTowers = 1;
        assert(!raidingMod.isWeakEnemyRoom("E77N77"), "a tower seen makes it not weak");
        Memory.rooms.E77N77.numberOfTowers = 0;

        Memory.rooms.E77N77.enemies = 1;
        assert(!raidingMod.isWeakEnemyRoom("E77N77"), "a hostile creep seen makes it not weak");
        Memory.rooms.E77N77.enemies = 0;

        Memory.rooms.E77N77.controllerLevel = 6;
        assert(!raidingMod.isWeakEnemyRoom("E77N77"),
            "RCL above the configured ceiling (raiding.maxTargetRcl) makes it not weak");
        Memory.rooms.E77N77.controllerLevel = 2;

        // --- raidRoom(): O4 (targetEnemy, gated by isWeakEnemyRoom) ------
        delete Memory.raidTarget;
        Memory.rooms.E77N77.owner = "SomeoneElse";
        global.raidRoom("E77N77");
        assert(!Memory.raidTarget, "raidRoom() refuses a player room that's not in targetEnemies");

        Memory.rooms.E77N77.owner = "Rival1";
        Memory.rooms.E77N77.numberOfTowers = 1;
        global.raidRoom("E77N77");
        assert(!Memory.raidTarget, "raidRoom() refuses a targetEnemy room that isn't weak enough");
        Memory.rooms.E77N77.numberOfTowers = 0;

        global.raidRoom("E77N77");
        assert(
            Memory.raidTarget && Memory.raidTarget.room === "E77N77" &&
                Memory.raidTarget.from === "W1N1",
            "raidRoom() dispatches against a weak targetEnemy room"
        );
        delete Memory.raidTarget;

        // --- raidRoom(): O2 (PvE, no targetEnemies involved) -------------
        Memory.rooms.E77N77 = { lastVisit: Game.time }; // no owner - neutral
        global.raidRoom("E77N77");
        assert(!Memory.raidTarget, "raidRoom() refuses a neutral room with nothing hostile to raid");

        Memory.rooms.E77N77.hasInvaderCore = true;
        global.raidRoom("E77N77");
        assert(
            Memory.raidTarget && Memory.raidTarget.room === "E77N77",
            "raidRoom() dispatches against a neutral room with an invader core - no targetEnemies check"
        );
        delete Memory.raidTarget;
        delete Memory.rooms.E77N77;

        // --- isEnemyRemote() / raidRemote() (ROADMAP 0036, O3) -----------
        Memory.rooms.W6N6 = {
            lastVisit: Game.time, reservation: { username: "Rival1" }, enemies: 0,
        };
        assert(raidingMod.isEnemyRemote("W6N6"),
            "a scouted, unowned room reserved by a targetEnemy with no hostile seen is a valid harass target");

        Memory.rooms.W6N6.owner = "Rival1";
        assert(!raidingMod.isEnemyRemote("W6N6"),
            "an owned room is not a remote - that's raidRoom's job, not raidRemote's");
        delete Memory.rooms.W6N6.owner;

        Memory.rooms.W6N6.reservation = { username: "SomeoneElse" };
        assert(!raidingMod.isEnemyRemote("W6N6"),
            "reserved by a non-targetEnemy player is never a valid harass target");
        Memory.rooms.W6N6.reservation = { username: "Rival1" };

        Memory.rooms.W6N6.enemies = 1;
        assert(!raidingMod.isEnemyRemote("W6N6"),
            "a hostile creep seen there means it's not undefended - refuse");
        Memory.rooms.W6N6.enemies = 0;

        delete Memory.raidTarget;
        Memory.rooms.W6N7 = { lastVisit: Game.time }; // never reserved
        global.raidRemote("W6N7");
        assert(!Memory.raidTarget, "raidRemote() refuses a room nobody is reserving");

        Memory.rooms.W6N7.reservation = { username: "SomeoneElse" };
        global.raidRemote("W6N7");
        assert(!Memory.raidTarget,
            "raidRemote() refuses a room reserved by a player not in targetEnemies");

        Memory.rooms.W6N7.reservation = { username: "Rival1" };
        global.raidRemote("W6N7");
        assert(
            Memory.raidTarget && Memory.raidTarget.room === "W6N7" &&
                Memory.raidTarget.from === "W1N1" && Memory.raidTarget.mission === "harass",
            "raidRemote() dispatches a harass mission against a targetEnemy's undefended remote"
        );
        delete Memory.raidTarget;
        delete Memory.rooms.W6N6;
        delete Memory.rooms.W6N7;

        // --- raider.run(): fight creeps first, then attack a structure,
        // then retire once nothing's left ---------------------------------
        const raiderMod = require(path.join(PROJECT, "src/roles/raider"));
        function raiderFind(hostileCreeps, hostileStructures) {
            return (type, opts) => {
                let list = [];
                if (type === FIND_HOSTILE_CREEPS) list = hostileCreeps || [];
                else if (type === FIND_HOSTILE_STRUCTURES) list = hostileStructures || [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            };
        }
        function mkRaider(hostileCreeps, hostileStructures, mission) {
            let attacked = null, massAttacked = false, moveToArg = null, suicided = false;
            const creep = Object.assign(Object.create(Creep.prototype), {
                id: "raidertest1",
                room: { name: "RaidRoom", find: raiderFind(hostileCreeps, hostileStructures) },
                pos: new RoomPosition(25, 25, "RaidRoom"),
                memory: { role: "raider", targetRoom: "RaidRoom", mission: mission || "raid", home: "W1N1" },
                moveTo: (t, o) => { moveToArg = { t, o }; return OK; },
                moveByPath: noop,
                rangedAttack: (t) => { attacked = t; return OK; },
                rangedMassAttack: () => { massAttacked = true; return OK; },
                suicide: () => { suicided = true; return OK; },
            });
            creep.pos.lookFor = () => [];
            return {
                creep,
                attacked: () => attacked, shot: () => massAttacked,
                movedTo: () => moveToArg, retired: () => suicided,
            };
        }
        function mkHostileCreep(id) {
            return Object.assign(new Creep(), {
                id, name: id, owner: { username: "Invader" },
                pos: new RoomPosition(26, 25, "RaidRoom"),
                hits: 100, hitsMax: 100,
                body: [{ type: RANGED_ATTACK }, { type: MOVE }],
            });
        }
        function mkHostileStructure(id, dist) {
            return Object.assign(new OwnedStructure(), {
                id, structureType: STRUCTURE_INVADER_CORE,
                pos: new RoomPosition(25 + dist, 25, "RaidRoom"),
                hits: 1000, hitsMax: 1000,
            });
        }

        Game.time++;
        let r = mkRaider([mkHostileCreep("rh1")], [mkHostileStructure("core1", 5)]);
        raiderMod.run(r.creep);
        assert(r.shot() && !r.attacked(),
            "raider fights a hostile creep instead of the structure while one's around");

        Game.time++;
        r = mkRaider([], [mkHostileStructure("core2", 5)]); // far - out of KITE_RANGE
        raiderMod.run(r.creep);
        assert(r.movedTo() && r.movedTo().o.range === combat.KITE_RANGE,
            "raider closes in on a distant hostile structure to KITE_RANGE");

        Game.time++;
        r = mkRaider([], [mkHostileStructure("core3", 2)]); // within KITE_RANGE
        raiderMod.run(r.creep);
        assert(r.attacked() && !r.movedTo(),
            "raider attacks a hostile structure once in range instead of moving");

        Game.time++;
        Memory.raidTarget = { room: "RaidRoom", from: "W1N1" };
        r = mkRaider([], []); // nothing left at all
        raiderMod.run(r.creep);
        assert(r.retired() && !Memory.raidTarget,
            "raider retires and clears Memory.raidTarget once nothing is left to fight");

        // --- raider.run(): mission "harass" (ROADMAP 0036, O3) -----------
        function mkUnarmedHostile(id) {
            return Object.assign(new Creep(), {
                id, name: id, owner: { username: "Rival1" }, // targetEnemy, not systemHostiles
                pos: new RoomPosition(26, 25, "RaidRoom"),
                hits: 50, hitsMax: 50,
                body: [{ type: WORK }, { type: CARRY }, { type: MOVE }], // reserver/miner-like
            });
        }

        Game.time++;
        r = mkRaider([mkUnarmedHostile("uh1")], [], "harass");
        raiderMod.run(r.creep);
        assert(r.attacked() && !r.retired(),
            "harass mission attacks an unarmed enemy creep (reserver/miner) directly - " +
                "combat.threats() ignores unarmed hostiles, but harass mode doesn't filter by armament"
        );

        Game.time++;
        Memory.raidTarget = { room: "RaidRoom", from: "W1N1", mission: "harass" };
        r = mkRaider([], [mkHostileStructure("coreH", 2)], "harass"); // structure in range, ignored
        raiderMod.run(r.creep);
        assert(r.retired() && !Memory.raidTarget && !r.attacked(),
            "harass mission retires once no creep (armed or not) is left - never attacks a structure"
        );

        const spawnDataResult = raiderMod.spawnData({ name: "W1N1", energyAvailable: 200 });
        assert(spawnDataResult.memory.mission === "raid",
            "spawnData() defaults mission to 'raid' when Memory.raidTarget.mission is unset");

        Memory.raidTarget = { room: "W6N7", from: "W1N1", mission: "harass" };
        const spawnDataHarass = raiderMod.spawnData({ name: "W1N1", energyAvailable: 200 });
        assert(spawnDataHarass.memory.mission === "harass",
            "spawnData() carries mission:'harass' through from Memory.raidTarget");
        delete Memory.raidTarget;
    }

    // --- rooms/defense.js: checkSafeMode() (ROADMAP 0032/0036 D6, revised -
    //     see "Bug real" in specs/features/0036-.../spec.md: the old "hp
    //     ratio OR zero defenders alive" gate fired off a weak invader in
    //     production because defenders only exist reactively - "zero
    //     defenders" was trivially true in the opening ticks of ANY
    //     incursion, not just one the defense had actually lost. Replaced by
    //     a projected ticks-to-kill from real incoming dps.) -------------
    {
        const defenseMod = require(path.join(PROJECT, "src/rooms/defense"));

        function mkDefenseRoom(opts) {
            let safeModeCalls = 0;
            let safeModeResult = OK;
            const ctrl = {
                my: true,
                safeMode: opts.alreadyActive ? 1000 : undefined,
                activateSafeMode: () => { safeModeCalls++; return safeModeResult; },
            };
            const spawnFixture = Object.assign(new Spawn(), {
                id: "defspawn_" + Math.random(), structureType: STRUCTURE_SPAWN, my: true,
                hits: opts.spawnHits === undefined ? 5000 : opts.spawnHits, hitsMax: 5000,
                pos: new RoomPosition(25, 25, "DefRoom"),
            });
            const structs = [spawnFixture];
            if (opts.rampartHits) {
                structs.push(Object.assign(new Structure(), {
                    structureType: STRUCTURE_RAMPART, my: true,
                    hits: opts.rampartHits, hitsMax: 300000,
                    pos: new RoomPosition(25, 25, "DefRoom"),
                }));
            }
            const hostileCreep = opts.hostileRange === undefined ? null : Object.assign(new Creep(), {
                id: "defhostile_" + Math.random(), owner: { username: "Warrobot10" },
                pos: new RoomPosition(25 + opts.hostileRange, 25, "DefRoom"),
                hits: 100, hitsMax: 100,
                body: opts.hostileBody || [{ type: RANGED_ATTACK }, { type: MOVE }],
            });
            const roomFixture = {
                name: "DefRoom", controller: ctrl,
                find: (type, findOpts) => {
                    let list = [];
                    if (type === FIND_STRUCTURES) list = structs;
                    if (type === FIND_HOSTILE_CREEPS) list = hostileCreep ? [hostileCreep] : [];
                    if (findOpts && typeof findOpts.filter === "function") list = list.filter(findOpts.filter);
                    return list;
                },
            };
            return { room: roomFixture, calls: () => safeModeCalls, setResult: (r) => { safeModeResult = r; } };
        }

        // no hostile in attack range at all - never even considers it
        Game.time++;
        let d = mkDefenseRoom({ hostileRange: 10 });
        defenseMod.checkSafeMode(d.room);
        assert(d.calls() === 0,
            "checkSafeMode() does nothing when no armed hostile is in attack range of any spawn");

        // the reported production bug: a weak, unboosted invader (1 ATTACK
        // part - 30 dps) at melee range of a FULL-hp spawn. Projected
        // ticks-to-kill is ~167, nowhere near the threshold - the old "zero
        // defenders alive" branch fired here regardless, this must not.
        Game.time++;
        d = mkDefenseRoom({ hostileRange: 1, hostileBody: [{ type: ATTACK }, { type: MOVE }] });
        defenseMod.checkSafeMode(d.room);
        assert(d.calls() === 0,
            "checkSafeMode() does NOT fire for a weak invader against a healthy spawn, even with zero defenders (ROADMAP 0036 production bug fix)");

        // a real lethal rush: 10 boosted ATTACK parts (XUH2O, x4 -> 1200
        // dps) against a still-FULL-hp spawn. ticksToKill ~4.2, well under
        // the threshold - must fire fast, before hp ever visibly drops.
        Game.time++;
        const heavyBody = [];
        for (let i = 0; i < 10; i++) heavyBody.push({ type: ATTACK, boost: "XUH2O" });
        heavyBody.push({ type: MOVE }, { type: MOVE });
        d = mkDefenseRoom({ hostileRange: 1, hostileBody: heavyBody });
        defenseMod.checkSafeMode(d.room);
        assert(d.calls() === 1,
            "checkSafeMode() fires fast against a boosted lethal rush even while the spawn is still at full hp");

        // a moderate, unboosted attacker (3 ATTACK - 90 dps) but the spawn
        // is already down to a sliver of hp from sustained damage - this is
        // the "real sustained siege" case the old hp-ratio leg covered;
        // ticksToKill (200/90 ~ 2.2) still catches it without that leg.
        Game.time++;
        d = mkDefenseRoom({
            spawnHits: 200,
            hostileRange: 1,
            hostileBody: [{ type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: MOVE }],
        });
        defenseMod.checkSafeMode(d.room);
        assert(d.calls() === 1,
            "checkSafeMode() fires once sustained damage has actually driven the spawn's current hp low");

        // same lethal rush as above, but the spawn sits on its own healthy
        // rampart - attacks land on the rampart first (native mechanic), so
        // effective hp is the rampart's ~300000, not the spawn's 5000.
        // Must NOT fire: the spawn is in no real danger.
        Game.time++;
        d = mkDefenseRoom({ hostileRange: 1, hostileBody: heavyBody, rampartHits: 300000 });
        defenseMod.checkSafeMode(d.room);
        assert(d.calls() === 0,
            "checkSafeMode() does not fire when a healthy own rampart on the spawn's tile absorbs the damage");

        // already active - never calls activateSafeMode again
        Game.time++;
        d = mkDefenseRoom({ hostileRange: 1, hostileBody: heavyBody, alreadyActive: true });
        defenseMod.checkSafeMode(d.room);
        assert(d.calls() === 0, "checkSafeMode() is a no-op once safe mode is already active");

        // activateSafeMode() erroring never throws, and is logged
        Game.time++;
        d = mkDefenseRoom({ hostileRange: 1, hostileBody: heavyBody });
        d.setResult(ERR_NOT_ENOUGH_RESOURCES);
        const logsBeforeSafeMode = logs.length;
        const origLogSafeMode = console.log;
        console.log = (...a) => { logs.push(a.join(" ")); };
        let threw = false;
        try { defenseMod.checkSafeMode(d.room); } catch (e) { threw = true; }
        console.log = origLogSafeMode;
        assert(!threw, "checkSafeMode() never throws even when activateSafeMode() errors");
        assert(logs.slice(logsBeforeSafeMode).some((l) => l.includes("activateSafeMode")),
            "an unexpected activateSafeMode() error result is logged");
    }

    // --- Fase 4: utils/squad.js (2x2 lockstep quad, O5) --------------
    {
        const squadMod = require(path.join(PROJECT, "src/utils/squad"));
        let squadWalls = [];
        const squadRoom = {
            name: "SquadRoom",
            find: (type, opts) => {
                let list = type === FIND_STRUCTURES ? squadWalls : [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            },
        };
        function mkWall(x, y) {
            return Object.assign(new Structure(), {
                structureType: STRUCTURE_WALL, pos: new RoomPosition(x, y, "SquadRoom"),
            });
        }
        function mkSquadCreep(id, x, y, room) {
            const c = Object.assign(Object.create(Creep.prototype), {
                id, pos: new RoomPosition(x, y, (room || squadRoom).name),
                room: room || squadRoom, hits: 100, hitsMax: 100,
                memory: {}, moveTo: noop, move: noop,
            });
            REG[id] = c;
            return c;
        }

        // --- pruneDeadMembers: drops dead ids, promotes a new leader ----
        Memory.squads = { sq1: { members: ["a", "b", "c", "d"], leader: "a" } };
        mkSquadCreep("a", 10, 10);
        mkSquadCreep("b", 11, 10);
        // "c"/"d" never registered - Game.getObjectById resolves them to null
        let sq = squadMod.pruneDeadMembers("sq1");
        assert(sq.members.length === 2 && sq.members.indexOf("c") === -1,
            "pruneDeadMembers() drops member ids that no longer resolve");
        assert(sq.leader === "a", "a still-living leader is left alone");

        Memory.squads.sq1 = { members: ["a", "b", "c", "d"], leader: "z" }; // unknown/dead leader
        sq = squadMod.pruneDeadMembers("sq1");
        assert(sq.leader === "a", "an unresolvable leader is replaced by the first survivor");

        delete REG.a;
        delete REG.b;
        sq = squadMod.pruneDeadMembers("sq1");
        assert(sq === null && !Memory.squads.sq1,
            "a squad with no living members left at all is deleted entirely");

        // --- formed() -----------------------------------------------------
        mkSquadCreep("lead", 20, 20);
        mkSquadCreep("f1", 21, 20);
        mkSquadCreep("f2", 20, 21);
        mkSquadCreep("f3", 21, 21);
        Memory.squads.sq2 = { members: ["lead", "f1", "f2", "f3"], leader: "lead", shape: "block" };
        assert(squadMod.formed(Memory.squads.sq2, "block") === true,
            "formed() is true when every member sits on its block offset relative to the leader");

        REG.f3.pos = new RoomPosition(25, 25, "SquadRoom");
        assert(squadMod.formed(Memory.squads.sq2, "block") === false,
            "formed() is false the moment one member drifts off its slot");
        REG.f3.pos = new RoomPosition(21, 21, "SquadRoom");

        // --- shapeFits(): block blocked by a wall, column threads through -
        squadWalls = [mkWall(22, 20), mkWall(22, 21)]; // block's f1/f3 slots after moving east
        Game.time++;
        assert(squadMod.shapeFits(REG.lead, Memory.squads.sq2, "block", 3) === false,
            "shapeFits('block') is false when a wall blocks one of the 4 next tiles");
        assert(squadMod.shapeFits(REG.lead, Memory.squads.sq2, "column", 3) === true,
            "shapeFits('column') is still true - single file threads between the same walls");
        squadWalls = [];
        Game.time++;

        // --- advance(): reforms a member that's out of its slot -----------
        Memory.squads.sq3 = {
            mission: "combat", room: "SquadRoom", from: "W1N1",
            target: { room: "SquadRoom" }, members: ["lead", "f1"], leader: "lead",
            shape: "block", state: "advancing",
        };
        REG.f1.pos = new RoomPosition(30, 30, "SquadRoom"); // way out of position
        let f1MoveTo = null;
        REG.f1.moveTo = (t, o) => { f1MoveTo = { t, o }; return OK; };
        Game.time++;
        squadMod.advance(REG.f1, "sq3");
        assert(f1MoveTo && f1MoveTo.t.x === 21 && f1MoveTo.t.y === 20,
            "advance() reforms an out-of-position member back to leader+offset (got " +
                JSON.stringify(f1MoveTo && f1MoveTo.t) + ")");
        REG.f1.pos = new RoomPosition(21, 20, "SquadRoom"); // back in formation

        // --- advance(): lockstep - every formed member gets the same dir --
        let leadDir = null, f1Dir = null;
        REG.lead.move = (d) => { leadDir = d; return OK; };
        REG.f1.move = (d) => { f1Dir = d; return OK; };
        Game.time++;
        squadMod.advance(REG.lead, "sq3");
        squadMod.advance(REG.f1, "sq3");
        assert(leadDir !== null && leadDir === f1Dir,
            "advance() moves every formed member in the exact same direction (lockstep)");

        // --- advance(): retreats when hp is low AND a safe exit exists ----
        Memory.squads.sq5 = {
            mission: "combat", room: "SquadRoom", from: "W1N1",
            target: { room: "SquadRoom" }, members: ["lead"], leader: "lead",
            shape: "block", state: "advancing",
        };
        REG.lead.hits = 20; REG.lead.hitsMax = 100; // 20% - below the 30% default threshold
        Memory.rooms.SquadRoom = { exits: { 1: "SafeExitRoom" } };
        Memory.rooms.SafeExitRoom = {}; // no known enemies - a safe way out
        Game.time++;
        squadMod.advance(REG.lead, "sq5");
        assert(Memory.squads.sq5.state === "retreating" && Memory.squads.sq5.target.room === "W1N1",
            "advance() retreats toward the mother room when hp is low and an exit is safe");

        // --- advance(): does NOT retreat when every exit is also dangerous -
        Memory.squads.sq6 = {
            mission: "combat", room: "SquadRoom", from: "W1N1",
            target: { room: "SquadRoom" }, members: ["lead"], leader: "lead",
            shape: "block", state: "advancing",
        };
        REG.lead.hits = 20; REG.lead.hitsMax = 100;
        // enemies:3 - still actively fighting here (ROADMAP 0047's
        // missionComplete() must not mistake "no intel on this field yet"
        // for "nothing left to fight" and send it home instead)
        Memory.rooms.SquadRoom = { exits: { 1: "DangerExitRoom" }, enemies: 3 };
        Memory.rooms.DangerExitRoom = { enemies: 3 }; // the only way out is also hostile
        Game.time++;
        squadMod.advance(REG.lead, "sq6");
        assert(Memory.squads.sq6.state === "advancing",
            "advance() keeps fighting instead of retreating when no exit is safe");

        // --- advance(): disbands once a retreating squad actually reaches
        // the mother room (not just "any safe room") ------------------------
        const homeRoom = { name: "W1N1" };
        const leadHome = mkSquadCreep("leadHome", 25, 25, homeRoom);
        Memory.squads.sq7 = {
            mission: "combat", room: "SquadRoom", from: "W1N1",
            target: { room: "W1N1" }, members: ["leadHome"], leader: "leadHome",
            shape: "block", state: "retreating",
        };
        delete Memory.rooms.W1N1.enemies;
        Game.time++;
        squadMod.advance(leadHome, "sq7");
        assert(!Memory.squads.sq7 && leadHome.memory.squadId === undefined,
            "advance() disbands the squad once a retreating member is actually back home");

        delete Memory.squads;
        delete Memory.rooms.SquadRoom;
        delete Memory.rooms.SafeExitRoom;
        delete Memory.rooms.DangerExitRoom;
        for (const id of ["a", "b", "lead", "f1", "f2", "f3", "leadHome"]) delete REG[id];
    }

    // --- Fase 4: raidSquad() + spawnPendingSquad() + registerPending() -
    {
        const squadMod2 = require(path.join(PROJECT, "src/utils/squad"));
        const raidingMod2 = require(path.join(PROJECT, "src/rooms/raiding"));
        delete Memory.pendingSquad;
        delete Memory.squads;
        Memory.rooms.E77N77 = { lastVisit: Game.time, hasInvaderCore: true }; // O2, PvE-eligible

        global.raidSquad("E77N77", "combat");
        assert(
            Memory.pendingSquad && Memory.pendingSquad.room === "E77N77" &&
                Memory.pendingSquad.from === "W1N1" &&
                JSON.stringify(Memory.pendingSquad.need) ===
                    JSON.stringify(["defenderStriker", "defenderStriker", "defenderMedic", "defenderMedic"]),
            "raidSquad('combat') queues the right 4-member recipe"
        );

        global.raidSquad("E77N77", "combat");
        assert(Memory.pendingSquad.spawned.length === 0,
            "a second raidSquad() call while one is already assembling is refused");

        const data = raidingMod2.spawnPendingSquad(room);
        assert(data && data.memory.role === "defenderStriker" && data.memory.pendingSquad === "E77N77",
            "spawnPendingSquad() returns the next needed role's spawn data, tagged pendingSquad");

        const pend1 = Object.assign(Object.create(Creep.prototype), {
            id: "pend1", memory: { role: "defenderStriker", pendingSquad: "E77N77" },
        });
        REG.pend1 = pend1;
        squadMod2.registerPending(pend1);
        assert(Memory.pendingSquad.spawned.indexOf("pend1") !== -1,
            "registerPending() records the creep in Memory.pendingSquad.spawned");
        assert(!Memory.squads || !Object.keys(Memory.squads).length,
            "not promoted yet - only 1 of the 4 needed members exists so far");

        ["pend2", "pend3", "pend4"].forEach((id) => {
            const c = Object.assign(Object.create(Creep.prototype), { id, memory: { pendingSquad: "E77N77" } });
            REG[id] = c;
            squadMod2.registerPending(c);
        });
        assert(!Memory.pendingSquad, "Memory.pendingSquad is gone once all 4 needed members are registered");
        const squadIds = Object.keys(Memory.squads || {});
        assert(squadIds.length === 1, "exactly one squad got promoted from the pending queue");
        const promoted = Memory.squads[squadIds[0]];
        assert(
            promoted.members.length === 4 && promoted.leader === "pend1" &&
                promoted.state === "advancing" && promoted.shape === "block" &&
                promoted.room === "E77N77" && promoted.from === "W1N1",
            "the promoted squad has all 4 members, the first-registered as leader, advancing in block formation"
        );
        assert(
            pend1.memory.squadId === squadIds[0] && pend1.memory.pendingSquad === undefined,
            "every member is tagged with the new squadId and its pendingSquad marker is cleared"
        );

        for (const id of ["pend1", "pend2", "pend3", "pend4"]) delete REG[id];
        delete Memory.squads;
        delete Memory.rooms.E77N77;
    }

    // --- Fase 4: squadDismantler ----------------------------------------
    {
        const dismantlerMod = require(path.join(PROJECT, "src/roles/squadDismantler"));
        const core = Object.assign(new OwnedStructure(), {
            id: "coreX", structureType: STRUCTURE_INVADER_CORE, hits: 500, hitsMax: 500,
        });
        let dismantled = null;
        const d1 = Object.assign(Object.create(Creep.prototype), {
            id: "dismantler1", memory: {},
            room: { name: "SquadRoom2", find: (type, opts) => {
                let list = type === FIND_HOSTILE_STRUCTURES ? [core] : [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            } },
            pos: new RoomPosition(25, 25, "SquadRoom2"),
            moveTo: noop, move: noop,
            dismantle: (t) => { dismantled = t; return OK; },
        });
        core.pos = new RoomPosition(25, 25, "SquadRoom2"); // adjacent (same tile is fine for range check)
        REG.dismantler1 = d1;

        // no squadId, no pendingSquad - nothing else this role is for
        let suicided = false;
        d1.suicide = () => { suicided = true; return OK; };
        dismantlerMod.run(d1);
        assert(suicided, "squadDismantler retires immediately if it's never part of a squad");

        // in a (fake, solo) squad - dismantles the adjacent hostile structure
        Memory.squads = {
            sqd1: {
                mission: "siege", room: "SquadRoom2", from: "W1N1",
                target: { room: "SquadRoom2" }, members: ["dismantler1"], leader: "dismantler1",
                shape: "block", state: "advancing",
            },
        };
        d1.memory = { squadId: "sqd1" };
        Game.time++;
        dismantlerMod.run(d1);
        assert(dismantled === core, "squadDismantler dismantles the hostile structure once adjacent");

        delete REG.dismantler1;
        delete Memory.squads;
    }

    Memory.rooms.W1N1.remotes = ["W1N2"];

    // --- roomCallback: inter-room CostMatrix gate --------------------
    const cb = remotesMod.roomCallback("W1N2");
    const cm = new PathFinder.CostMatrix();
    assert(cb("W1N1", cm) === cm, "roomCallback allows my own room");
    assert(cb("W1N2", cm) === cm,
        "roomCallback allows the creep's own mission target, reserved or not");
    assert(cb("W2N1", cm) === false,
        "roomCallback blocks a room that's neither mine, reserved by me, nor the target");

    // --- reserver / remoteMiner / remoteHauler: no throws travelling or on
    // site ------------------------------------------------------------
    let rsvMoveOpts = null;
    const rsv = Object.assign(Object.create(Creep.prototype), {
        id: "rsv1", room, pos: new RoomPosition(20, 20, "W1N1"),
        body: [{ type: CLAIM }, { type: MOVE }],
        memory: { role: "reserver", mission: "reserve", targetRoom: "W1N2", home: "W1N1" },
        moveTo: (pos, opts) => { rsvMoveOpts = opts; return OK; },
        reserveController: () => OK, claimController: () => OK,
        suicide: () => OK,
    });
    let threw = null;
    try { reserver.run(rsv); } catch (e) { threw = e; }
    assert(!threw, "reserver.run does not throw while travelling" +
        (threw ? "\n      " + (threw.stack || threw) : ""));

    // --- reserver routing: route-aware, blocks any room outside the
    // computed route (utils/routing), always allows the mission target ----
    assert(rsvMoveOpts && typeof rsvMoveOpts.costCallback === "function",
        "the reserver travels with a route-aware costCallback");
    const rsvCm = new PathFinder.CostMatrix();
    assert(rsvMoveOpts.costCallback("W1N2", rsvCm) === rsvCm,
        "the reserver's costCallback always allows the mission target");
    // ROADMAP 0077: W1N1 is in vision in this test (Game.rooms.W1N1), so the
    // callback now layers move.roomMatrix()'s known-structure matrix over it
    // instead of passing the empty rsvCm through unchanged - "allows" means
    // "not blocked" (!== false), not "identical object" any more.
    assert(rsvMoveOpts.costCallback("W1N1", rsvCm) !== false,
        "the reserver's costCallback always allows its own current room");
    assert(rsvMoveOpts.costCallback("SomeUnrelatedRoom", rsvCm) === false,
        "the reserver's costCallback blocks a room outside the computed route");

    let rmMinerMoveOpts = null;
    const rmMiner = Object.assign(Object.create(Creep.prototype), {
        id: "rm1", room, pos: new RoomPosition(20, 20, "W1N1"),
        store: store(0, 100),
        body: [{ type: MOVE }, { type: WORK }],
        memory: { role: "remoteMiner", home: "W1N1", targetRoom: "W1N2" },
        moveTo: (pos, opts) => { rmMinerMoveOpts = opts; return OK; },
        harvest: () => OK, build: () => OK, repair: () => OK,
        suicide: () => OK,
    });
    threw = null;
    try { remoteMiner.run(rmMiner); } catch (e) { threw = e; }
    assert(!threw, "remoteMiner.run does not throw while travelling" +
        (threw ? "\n      " + (threw.stack || threw) : ""));

    // ROADMAP 0075: remoteMiner now routes through utils/routing.moveToRoom()
    // (a raw creep.moveTo() + remotes.roomCallback() before this - no upfront
    // terrain validation, no retreat/backtrack) with opts.allowRoom keeping
    // the exact same "never cross a room that isn't mine/reserved/the target"
    // guarantee remotes.roomCallback used to enforce on its own.
    assert(rmMinerMoveOpts && typeof rmMinerMoveOpts.costCallback === "function",
        "remoteMiner travels with a route-aware costCallback now");
    const rmMinerCm = new PathFinder.CostMatrix();
    assert(rmMinerMoveOpts.costCallback("W1N2", rmMinerCm) === rmMinerCm,
        "remoteMiner's costCallback always allows the assigned remote (its own mission target)");
    // ROADMAP 0077 - see the reserver's own W1N1 assertion above.
    assert(rmMinerMoveOpts.costCallback("W1N1", rmMinerCm) !== false,
        "remoteMiner's costCallback always allows its own home room");
    assert(rmMinerMoveOpts.costCallback("SomeUnrelatedRoom", rmMinerCm) === false,
        "remoteMiner's costCallback blocks a room that's neither mine, reserved, nor the target " +
            "(AC4 - same guarantee remotes.roomCallback used to give directly)");

    let rmHaulerMoveOpts = null;
    const rmHauler = Object.assign(Object.create(Creep.prototype), {
        id: "rh1", room, pos: new RoomPosition(20, 20, "W1N1"),
        store: store(0, 100),
        body: [{ type: CARRY }, { type: MOVE }],
        memory: { role: "remoteHauler", home: "W1N1", targetRoom: "W1N2", job: "load" },
        moveTo: (pos, opts) => { rmHaulerMoveOpts = opts; return OK; },
        withdraw: () => OK, pickup: () => OK, transfer: () => OK,
        suicide: () => OK,
    });
    threw = null;
    try { remoteHauler.run(rmHauler); } catch (e) { threw = e; }
    assert(!threw, "remoteHauler.run does not throw while travelling" +
        (threw ? "\n      " + (threw.stack || threw) : ""));

    // ROADMAP 0075 - same migration as remoteMiner above.
    assert(rmHaulerMoveOpts && typeof rmHaulerMoveOpts.costCallback === "function",
        "remoteHauler travels with a route-aware costCallback now");
    const rmHaulerCm = new PathFinder.CostMatrix();
    assert(rmHaulerMoveOpts.costCallback("W1N2", rmHaulerCm) === rmHaulerCm,
        "remoteHauler's costCallback always allows the assigned remote (its own mission target)");
    // ROADMAP 0077 - see the reserver's own W1N1 assertion above.
    assert(rmHaulerMoveOpts.costCallback("W1N1", rmHaulerCm) !== false,
        "remoteHauler's costCallback always allows its own home room");
    assert(rmHaulerMoveOpts.costCallback("SomeUnrelatedRoom", rmHaulerCm) === false,
        "remoteHauler's costCallback blocks a room that's neither mine, reserved, nor the target " +
            "(AC4 - same guarantee remotes.roomCallback used to give directly)");

    // and now "on site" (creep.room.name === targetRoom)
    const remoteRoom = { name: "W1N2", controller: { my: false }, find: room.find };
    rsv.room = remoteRoom;
    threw = null;
    try { reserver.run(rsv); } catch (e) { threw = e; }
    assert(!threw, "reserver.run does not throw on site" +
        (threw ? "\n      " + (threw.stack || threw) : ""));

    rmMiner.room = remoteRoom;
    rmMiner.pos = new RoomPosition(20, 20, "W1N2");
    rmMiner.pos.findInRange = () => [];
    findMap[FIND_SOURCES] = [source, source2]; // reuse existing source fixtures
    threw = null;
    try { remoteMiner.run(rmMiner); } catch (e) { threw = e; }
    assert(!threw, "remoteMiner.run does not throw on site" +
        (threw ? "\n      " + (threw.stack || threw) : ""));
    findMap[FIND_SOURCES] = [source, source2]; // restore (unchanged, kept explicit)

    rmHauler.room = remoteRoom;
    rmHauler.pos = new RoomPosition(20, 20, "W1N2");
    threw = null;
    try { remoteHauler.run(rmHauler); } catch (e) { threw = e; }
    assert(!threw, "remoteHauler.run does not throw on site" +
        (threw ? "\n      " + (threw.stack || threw) : ""));

    // --- ROADMAP 0059: remoteHauler.pickDeliver's last-resort tower fallback
    // -----------------------------------------------------------------------
    // same class of bug as hauler.js's own dead-zone fallback: storage and
    // spawn/extension both give it nothing to deliver to, but a tower back
    // home still has room - top it off instead of idling home full.
    function withMyStructuresLookup(pos, structures) {
        const filtered = (opts) =>
            opts && typeof opts.filter === "function"
                ? structures.filter(opts.filter)
                : structures.slice();
        pos.findClosestByPath = (a, opts) =>
            a === FIND_MY_STRUCTURES
                ? RoomPosition.prototype._closest.call(pos, filtered(opts), {})
                : RoomPosition.prototype.findClosestByPath.call(pos, a, opts);
        pos.findClosestByRange = (a, opts) =>
            a === FIND_MY_STRUCTURES
                ? RoomPosition.prototype._closest.call(pos, filtered(opts), {})
                : RoomPosition.prototype.findClosestByRange.call(pos, a, opts);
        return pos;
    }
    {
        const towerFallback = Object.assign(new OwnedStructure(), {
            id: "rhtowerfallback", structureType: STRUCTURE_TOWER, my: true,
            pos: new RoomPosition(20, 20, "W1N1"), room,
            store: Object.assign(store(500, 1000), { getFreeCapacity: () => 500 }),
        });
        REG.rhtowerfallback = towerFallback;

        room.storage = null;
        const rhFallback = Object.assign(Object.create(Creep.prototype), {
            id: "rhfallback", room,
            pos: withMyStructuresLookup(new RoomPosition(20, 20, "W1N1"), [towerFallback]),
            store: store(100, 100),
            body: [{ type: CARRY }, { type: MOVE }],
            memory: { role: "remoteHauler", home: "W1N1", targetRoom: "W1N2", job: "deliver" },
            moveTo: () => OK, suicide: () => OK,
        });
        rhFallback.transfer = (t) => { rhFallback._to = t && t.id; return OK; };
        remoteHauler.run(rhFallback);
        assert(rhFallback._to === "rhtowerfallback",
            "remoteHauler tops off a tower when storage and spawn/extension are both full " +
                "(ROADMAP 0059, got " + rhFallback._to + ")");

        const savedSpawnStoreRemote = spawn.store;
        const savedStorageRemote = room.storage;
        spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
        room.storage = Object.assign(new Structure(), {
            id: "rhstoragecritical", structureType: STRUCTURE_STORAGE, room,
            pos: new RoomPosition(26, 24, "W1N1"), store: store(50000, 100000),
        });
        REG.rhstoragecritical = room.storage;
        Game.time++;
        const rhCritical = Object.assign(Object.create(Creep.prototype), {
            id: "rhcritical", room,
            pos: withMyStructuresLookup(new RoomPosition(20, 20, "W1N1"), [
                spawn, room.storage,
            ]),
            store: store(100, 100),
            body: [{ type: CARRY }, { type: MOVE }],
            memory: { role: "remoteHauler", home: "W1N1", targetRoom: "W1N2", job: "deliver" },
            moveTo: () => OK, suicide: () => OK,
        });
        rhCritical.transfer = (t) => { rhCritical._to = t && t.id; return OK; };
        remoteHauler.run(rhCritical);
        assert(rhCritical._to === "spawn1",
            "remoteHauler delivers to a critical home-room spawn before storage (0091, got " +
                rhCritical._to + ")");
        spawn.store = savedSpawnStoreRemote;
        room.storage = savedStorageRemote;
        delete REG.rhstoragecritical;
    }

    // --- ROADMAP 0091: bootstrap keeps a critical spawn ahead of the
    // collector link/container fallback --------------------------------
    {
        const bootstrap = require(path.join(PROJECT, "src/roles/bootstrap"));
        const savedSpawnStoreBootstrap = spawn.store;
        spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
        const bootstrapContainer = Object.assign(new StructureContainer(), {
            id: "bootstrap-container", structureType: STRUCTURE_CONTAINER,
            room, pos: new RoomPosition(22, 20, "W1N1"),
            store: store(0, 2000),
        });
        const bootstrapLink = Object.assign(new StructureLink(), {
            id: "bootstrap-link", structureType: STRUCTURE_LINK,
            room, pos: new RoomPosition(21, 20, "W1N1"),
            store: store(0, 800), isCollector: () => true,
        });
        const bootstrapPos = new RoomPosition(20, 20, "W1N1");
        bootstrapPos.findClosestByRange = (type, opts) => {
            if (type !== FIND_MY_STRUCTURES) return null;
            const targets = [spawn, bootstrapLink, bootstrapContainer];
            const filtered = opts && opts.filter ? targets.filter(opts.filter) : targets;
            return filtered[0] || null;
        };
        bootstrapPos.findClosestByPath = () => null;
        const bootstrapCreep = Object.assign(Object.create(Creep.prototype), {
            id: "bootstrap-critical", room, pos: bootstrapPos,
            body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
            memory: { role: "bootstrap", source: source.id },
            store: store(50, 50),
            transfer: (target) => { bootstrapCreep._to = target && target.id; return OK; },
            moveTo: () => OK, move: () => OK, drop: () => OK,
        });
        Game.time++;
        bootstrap.run(bootstrapCreep);
        assert(bootstrapCreep._to === "spawn1",
            "bootstrap delivers to a critical spawn before link/container (0091)");
        spawn.store = savedSpawnStoreBootstrap;
    }

    // --- ROADMAP 0091: optional mineral jobs are preemptible only before
    // their resource has been withdrawn -----------------------------------
    {
        const savedSpawnStoreJob = spawn.store;
        spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });
        const emptyJob = makeCreep("MineralJobEmpty", "hauler", {
            store: store(0, 200),
        });
        emptyJob.memory.mineralJob = {
            resourceType: RESOURCE_HYDROGEN,
            fromId: "missing-mineral-source", toId: "missing-mineral-dest",
        };
        Game.time++;
        hauler.run(emptyJob);
        assert(!emptyJob.memory.mineralJob,
            "hauler abandons an unstarted mineral job for a critical spawn (0091)");

        const mineralDest = Object.assign(new Structure(), {
            id: "mineral-job-dest", room,
            store: store(0, 1000),
        });
        REG[mineralDest.id] = mineralDest;
        const loadedJob = makeCreep("MineralJobLoaded", "hauler", {
            store: Object.assign(store(0, 200), { [RESOURCE_HYDROGEN]: 10 }),
        });
        loadedJob.memory.mineralJob = {
            resourceType: RESOURCE_HYDROGEN,
            fromId: "missing-mineral-source", toId: mineralDest.id,
        };
        loadedJob.transfer = (target, resourceType) => {
            loadedJob._jobTarget = target && target.id;
            loadedJob._jobResource = resourceType;
            return OK;
        };
        Game.time++;
        hauler.run(loadedJob);
        assert(loadedJob._jobTarget === mineralDest.id &&
            loadedJob._jobResource === RESOURCE_HYDROGEN,
            "hauler finishes a loaded mineral job during a critical spawn (0091)");
        spawn.store = savedSpawnStoreJob;
        delete REG[mineralDest.id];
    }

    delete Memory.rooms.W1N1.remotes;
    // reset back to the bare state intel.js itself would leave an
    // unvisited neighbor in - later tests (the edge-road gate, further
    // down) expect these to still exist as plain objects
    Memory.rooms.W1N2 = {};
    Memory.rooms.W2N1 = {};
}

// --- utils/routing: highway-priority / hostile-avoidance route planning
// (scout sign/layout tasks, reserver reserve/claim - never the scout's
// exploratory wandering) ------------------------------------------------
{
    const routing = require(path.join(PROJECT, "src/utils/routing"));

    assert(routing.isHighwayRoom("E10N23") === true,
        "a room with x%10==0 is a highway room");
    assert(routing.isHighwayRoom("E23N30") === true,
        "a room with y%10==0 is a highway room");
    assert(routing.isHighwayRoom("E13N23") === false,
        "a room with neither coordinate %10==0 is not a highway room");
    assert(routing.isHighwayRoom("not-a-room") === false,
        "a malformed room name is never a highway room");

    // routeCostCallback: only the creep's current room, the destination,
    // and whatever findRoute() picked stay passable
    const routingCm = new PathFinder.CostMatrix();
    const routingCb = routing.routeCostCallback(
        [{ exit: 1, room: "E10N10" }, { exit: 1, room: "E10N20" }],
        "W1N1", "E10N20"
    );
    // ROADMAP 0077 - see the reserver's own W1N1 assertion above.
    assert(routingCb("W1N1", routingCm) !== false,
        "routeCostCallback allows the creep's own room");
    assert(routingCb("E10N10", routingCm) === routingCm,
        "routeCostCallback allows a room on the chosen route");
    assert(routingCb("E10N20", routingCm) === routingCm,
        "routeCostCallback always allows the destination");
    assert(routingCb("E15N15", routingCm) === false,
        "routeCostCallback blocks a room that's neither current, destination, nor on the route");

    // ROADMAP 0061 (researched from screeps-cartographer's findRoute
    // enhancement): routeCostCallback also allows each route hop's known
    // neighbors (Memory.rooms[x].exits) as slack, so the PathFinder isn't
    // locked to the exact minimal room sequence with zero room to route
    // around an internal obstacle findRoute (room-graph only, no terrain
    // knowledge) could never see coming
    Memory.rooms["E10N10"] = { exits: { 1: "E10N9", 3: "E11N10Hostile" } };
    const slackCb = routing.routeCostCallback(
        [{ exit: 1, room: "E10N10" }, { exit: 1, room: "E10N20" }],
        "W1N1", "E10N20"
    );
    assert(slackCb("E10N9", routingCm) === routingCm,
        "routeCostCallback's allowed set includes a hop's known neighbor as slack, on top of the exact route");
    delete Memory.rooms["E10N10"];

    Memory.rooms["E10N10x"] = { exits: { 3: "E11N10Hostile" } };
    Memory.rooms["E11N10Hostile"] = { enemies: 1 };
    const slackHostileCb = routing.routeCostCallback(
        [{ exit: 1, room: "E10N10x" }, { exit: 1, room: "E10N20" }],
        "W1N1", "E10N20",
        { blockHostiles: true }
    );
    assert(slackHostileCb("E11N10Hostile", routingCm) === false,
        "routeCostCallback's slack never adds a known-hostile neighbor under blockHostiles");
    delete Memory.rooms["E10N10x"];
    delete Memory.rooms["E11N10Hostile"];

    const noIntelCb = routing.routeCostCallback(
        [{ exit: 1, room: "E10N10NoIntel" }, { exit: 1, room: "E10N20" }],
        "W1N1", "E10N20"
    );
    assert(noIntelCb("E10N9", routingCm) === false,
        "routeCostCallback adds no slack for a hop with no exits intel yet");

    // ROADMAP 0064 live follow-up: avoidCostCallback - the blocklist twin
    // of routeCostCallback's allowlist, used once a route has actually
    // been validated against real terrain (see moveToRoom() and its own
    // comment for the full "raw PathFinder.search from the console"
    // diagnosis) - only opts.avoid/hostile-under-blockHostiles excludes a
    // room; every other room, whether or not it's anywhere near the
    // validated sequence, stays fully open
    {
        const avoidCb = routing.avoidCostCallback(["WAvoidedRoom"], {});
        assert(avoidCb("WAvoidedRoom", routingCm) === false,
            "avoidCostCallback excludes a room in the avoid list outright");
        assert(avoidCb("WTotallyUnrelatedRoom", routingCm) === routingCm,
            "avoidCostCallback leaves every other room open, unlike routeCostCallback's " +
                "curated allowlist - this is the whole point: computeRealRoute() itself used " +
                "this same freedom to validate the route, so execution gets it too");

        Memory.rooms.WAvoidHostile = { enemies: 1 };
        const avoidHostileCb = routing.avoidCostCallback([], { blockHostiles: true });
        assert(avoidHostileCb("WAvoidHostile", routingCm) === false,
            "avoidCostCallback also excludes a known-hostile room under blockHostiles");
        assert(routing.avoidCostCallback([], {})("WAvoidHostile", routingCm) === routingCm,
            "but not without blockHostiles - matches routeCostCallback's own gating");
        delete Memory.rooms.WAvoidHostile;

        assert(routing.avoidCostCallback()("WNoOptsAtAll", routingCm) === routingCm,
            "avoidCostCallback is safe to call with no avoid list/opts at all - never throws");
    }

    // --- ROADMAP 0077: computeRealRoute/routeCostCallback/avoidCostCallback
    // now layer utils/move.js's roomMatrix() (already cached, structure-
    // aware) over a room that's currently in vision, instead of reasoning
    // about terrain alone - closes the ROADMAP.md "Later" gap where an
    // ally's own interior rampart/wall (isDangerousRoom exempts ally
    // ownership on purpose, ROADMAP 0064) went undetected even in a room
    // the creep already had vision of that same tick.
    {
        const visibleRoomName = "WStructVision";
        const blockingWall = {
            id: "struct-wall",
            structureType: STRUCTURE_WALL,
            pos: { x: 10, y: 10 },
            my: false,
            isPublic: false,
        };
        const privateRampart = {
            id: "struct-private-rampart",
            structureType: STRUCTURE_RAMPART,
            pos: { x: 11, y: 10 },
            my: false,
            isPublic: false,
        };
        const publicRampart = {
            id: "struct-public-rampart",
            structureType: STRUCTURE_RAMPART,
            pos: { x: 12, y: 10 },
            my: false,
            isPublic: true,
        };
        const visibleRoom = new Room(visibleRoomName);
        visibleRoom.find = (type) => (type === FIND_STRUCTURES
            ? [blockingWall, privateRampart, publicRampart]
            : []);
        Game.rooms[visibleRoomName] = visibleRoom;

        // AC2
        const structRouteCb = routing.routeCostCallback(
            [{ exit: 1, room: visibleRoomName }], "W1N1", visibleRoomName
        );
        const outCm1 = structRouteCb(visibleRoomName, new PathFinder.CostMatrix());
        assert(outCm1 && outCm1.get(10, 10) === 255,
            "routeCostCallback layers a known-structure matrix over a room in vision, " +
                "blocking the wall's tile (AC2)");
        assert(outCm1.get(11, 10) === 255,
            "routeCostCallback blocks a known private rampart in another player's room (AC2)");
        assert(outCm1.get(12, 10) !== 255,
            "routeCostCallback keeps another player's public rampart walkable (AC2)");

        // AC3
        const structAvoidCb = routing.avoidCostCallback([], {});
        const outCm2 = structAvoidCb(visibleRoomName, new PathFinder.CostMatrix());
        assert(outCm2 && outCm2.get(10, 10) === 255,
            "avoidCostCallback layers a known-structure matrix over a room in vision, " +
                "blocking the wall's tile (AC3)");
        assert(outCm2.get(11, 10) === 255,
            "avoidCostCallback blocks a known private rampart in another player's room (AC3)");
        assert(outCm2.get(12, 10) !== 255,
            "avoidCostCallback keeps another player's public rampart walkable (AC3)");

        // AC1
        const realSearch2 = PathFinder.search;
        let seenVisible;
        PathFinder.search = (origin, goal, o) => {
            seenVisible = o.roomCallback(visibleRoomName);
            return { path: [], incomplete: true };
        };
        routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {});
        PathFinder.search = realSearch2;
        assert(seenVisible && typeof seenVisible.get === "function" && seenVisible.get(10, 10) === 255,
            "computeRealRoute's roomCallback returns a known-structure matrix for a room in " +
                "vision, blocking the wall's tile (AC1)");
        assert(seenVisible.get(11, 10) === 255,
            "computeRealRoute's roomCallback blocks a known private rampart (AC1)");
        assert(seenVisible.get(12, 10) !== 255,
            "computeRealRoute's roomCallback keeps a known public rampart walkable (AC1)");

        // AC4 - the exact same room, now WITHOUT vision, falls back to
        // today's terrain-only behavior in all three - nothing regresses.
        delete Game.rooms[visibleRoomName];

        const noVisRouteCb = routing.routeCostCallback(
            [{ exit: 1, room: visibleRoomName }], "W1N1", visibleRoomName
        );
        const emptyCm3 = new PathFinder.CostMatrix();
        assert(noVisRouteCb(visibleRoomName, emptyCm3) === emptyCm3,
            "routeCostCallback passes the matrix through unchanged for a room with no vision (AC4)");

        const noVisAvoidCb = routing.avoidCostCallback([], {});
        const emptyCm4 = new PathFinder.CostMatrix();
        assert(noVisAvoidCb(visibleRoomName, emptyCm4) === emptyCm4,
            "avoidCostCallback passes the matrix through unchanged for a room with no vision (AC4)");

        let seenNoVis;
        PathFinder.search = (origin, goal, o) => {
            seenNoVis = o.roomCallback(visibleRoomName);
            return { path: [], incomplete: true };
        };
        routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {});
        PathFinder.search = realSearch2;
        assert(seenNoVis === undefined,
            "computeRealRoute's roomCallback falls back to terrain-only (undefined) for a room " +
                "with no vision (AC4)");
    }

    // findRoute(): highway rooms are cheapened, hostile rooms are
    // penalized - or, with blockHostiles, excluded outright (Infinity)
    function routeCostFor(probeRoomName, opts) {
        const realFindRoute = Game.map.findRoute;
        let cost = null;
        Game.map.findRoute = (from, to, o) => {
            cost = o.routeCallback(probeRoomName);
            return cost === Infinity ? ERR_NO_PATH : [{ exit: 1, room: to }];
        };
        routing.findRoute("W1N1", "W9N9", opts);
        Game.map.findRoute = realFindRoute;
        return cost;
    }
    assert(routeCostFor("E10N23", {}) === 1,
        "a highway room costs just the route-selection baseline");
    assert(routeCostFor("E13N23", {}) === 1 + 2,
        "a non-highway room adds the configured nonHighwayPenalty");
    Memory.rooms.Whostile = { enemies: 2 };
    assert(routeCostFor("Whostile", {}) === 1 + 10 + 2,
        "a hostile, non-highway room stacks hostilePenalty and nonHighwayPenalty");
    assert(routeCostFor("Whostile", { blockHostiles: true }) === Infinity,
        "blockHostiles gives a known-hostile room an infinite (fully excluded) route cost");
    delete Memory.rooms.Whostile;

    // ROADMAP 0064: a room owned by someone else's empire is just as
    // dangerous as a known-hostile creep, even with zero enemies ever seen
    // there - a claimer walked straight into one and got physically
    // blocked by walls/ramparts the owner had already built
    Memory.rooms.WEnemyOwned = { owner: "SomeEnemyPlayer" };
    assert(routeCostFor("WEnemyOwned", {}) === 1 + 10 + 2,
        "a foreign-owned room stacks the same penalty as a known-hostile room");
    assert(routeCostFor("WEnemyOwned", { blockHostiles: true }) === Infinity,
        "blockHostiles excludes a foreign-owned room outright too, not just a hostile-creep one");
    delete Memory.rooms.WEnemyOwned;

    // an ally's own room is exempt - their interior obstacles (if any) are
    // the reactive backtrack's job (ROADMAP 0061), not something routing
    // refuses to even approach
    Memory.rooms.WAllyRoom = { owner: "fR1dj" };
    assert(routeCostFor("WAllyRoom", { blockHostiles: true }) === 1 + 2,
        "an ally's room is never excluded by blockHostiles just because they own it");
    delete Memory.rooms.WAllyRoom;

    // ROADMAP 0062: a room in opts.avoid (per-creep, set by moveToRoom() -
    // see below) is excluded outright, even without blockHostiles and even
    // for a room that isn't otherwise flagged hostile at all
    assert(routeCostFor("Wavoided", { avoid: ["Wavoided"] }) === Infinity,
        "a room in opts.avoid is excluded outright, regardless of blockHostiles or hostile status");
    assert(routeCostFor("Wavoided", {}) === 1 + 2,
        "a room NOT in opts.avoid is never excluded just because some other room's avoid list exists");

    // ROADMAP 0075: opts.allowRoom - an extra restriction ON TOP of
    // avoid/hostile, letting a caller (remoteHauler/remoteMiner) confine the
    // whole trip to a subset of rooms it decides (mine/reserved-by-me), the
    // same rule remotes.roomCallback used to enforce on its own narrower
    // costCallback.
    assert(routeCostFor("WNotAllowed", { allowRoom: (n) => n === "WOk" }) === Infinity,
        "a room allowRoom rejects is excluded outright, just like opts.avoid");
    assert(routeCostFor("WOk", { allowRoom: (n) => n === "WOk" }) === 1 + 2,
        "a room allowRoom accepts is never excluded just because allowRoom is set");
    assert(routeCostFor("WAnyRoom", {}) === 1 + 2,
        "without opts.allowRoom at all, no room is excluded by it (nothing to opt into)");

    // findRoute() itself returns null when the engine can't find a route
    // under those constraints (a stand-in for "the only path crosses a
    // blocked room" - the default test-harness findRoute stub always
    // succeeds, so simulate the engine's ERR_NO_PATH response here)
    {
        const realFindRoute = Game.map.findRoute;
        Game.map.findRoute = () => ERR_NO_PATH;
        assert(routing.findRoute("W1N1", "W9N9", { blockHostiles: true }) === null,
            "findRoute() returns null when the engine reports no route");
        Game.map.findRoute = realFindRoute;
    }
    delete Memory.rooms.Whostile;

    // ROADMAP 0075: moveToRoom() now runs computeRealRoute()'s
    // PathFinder.search on a fresh trip's first leg BY DEFAULT - opts.realRoute
    // flipped from opt-in to opt-out. Only the reachability pre-check that
    // was tried and reverted (PathFinder.search once per room ENTERED, no
    // caching) is still off the table - a scout cycling through several
    // dead-end candidate rooms in a row meant several fresh searches in a
    // hurry, enough in practice to drain the CPU bucket. This is a
    // completely different cost profile (once per trip leg, not once per
    // room), which is exactly why it can now be the default.
    {
        const realSearch = PathFinder.search;
        let searches = 0;
        PathFinder.search = () => { searches++; return { path: [], incomplete: true }; };

        const plainCreep = {
            pos: new RoomPosition(25, 25, "W1N1"),
            room: { name: "W1N1" },
            memory: {},
            moveTo: () => "moved",
        };
        const result = routing.moveToRoom(plainCreep, "W9N9", { range: 20 });
        assert(result === "moved" && searches === 1,
            "moveToRoom() calls computeRealRoute's PathFinder.search by default now (ROADMAP 0075)");
        PathFinder.search = realSearch;
    }

    // ROADMAP 0075: the one deliberate opt-out - roles/scout.js's own
    // free-roam exploration (no fixed destination, always a direct
    // neighbor, a fresh target picked every cycle) passes `realRoute: false`
    // to keep the old zero-PathFinder.search behavior.
    {
        const realSearch = PathFinder.search;
        let searches = 0;
        PathFinder.search = () => { searches++; return { path: [], incomplete: true }; };

        const optOutCreep = {
            pos: new RoomPosition(25, 25, "W1N1"),
            room: { name: "W1N1" },
            memory: {},
            moveTo: () => "moved",
        };
        routing.moveToRoom(optOutCreep, "W9N9", { range: 20, realRoute: false });
        assert(searches === 0,
            "realRoute: false still skips computeRealRoute entirely, for scout's free-roam exploration");
        PathFinder.search = realSearch;
    }

    // ROADMAP 0064 live follow-up: confirmed live, a leg that computeRealRoute
    // (200000-op budget) had JUST validated as genuinely walkable still came
    // back ERR_NO_PATH from the very next native moveTo() call and triggered
    // another (wrong) retreat anyway - that call was never given a matching
    // maxOps/maxRooms, so it silently fell back to the engine's own defaults
    // (2000 ops, 16 rooms), nowhere near enough once routeCostCallback's
    // "allowed" room set spans a long validated route with real natural-wall
    // clutter in it. ROADMAP 0075: this bump now tracks the same opt-out
    // default as computeRealRoute itself - every caller that reaches this
    // branch already ran computeRealRoute, so the budgets stay matched;
    // only realRoute:false (scout's free-roam exploration) keeps the
    // engine's own silent defaults, since it never runs computeRealRoute
    // to validate anything the native search would need the bigger budget
    // for in the first place.
    {
        const realSearch = PathFinder.search;
        PathFinder.search = () => ({ path: [], incomplete: true });

        let seenMaxOps = null, seenMaxRooms = null;
        const opsCreep = {
            pos: new RoomPosition(25, 25, "W1N1"),
            room: { name: "W1N1" },
            memory: {},
            moveTo: (pos, o) => { seenMaxOps = o.maxOps; seenMaxRooms = o.maxRooms; return OK; },
        };
        routing.moveToRoom(opsCreep, "W9N9", { range: 20 }); // realRoute defaults on now
        assert(seenMaxOps === 200000,
            "by default now, moveToRoom()'s main routed moveTo() call gets " +
                "routing.moveMaxOps, not the engine's silent 2000 default");
        assert(seenMaxRooms === 64,
            "by default now, moveToRoom()'s main routed moveTo() call gets " +
                "routing.moveMaxRooms, not the engine's silent 16 default - a validated route " +
                "longer than 16 hops (confirmed live) could never complete otherwise, no matter " +
                "how many ops it's allowed");

        let seenMaxOps2 = "untouched", seenMaxRooms2 = "untouched";
        const noOpsCreep = {
            pos: new RoomPosition(25, 25, "W1N1"),
            room: { name: "W1N1" },
            memory: {},
            moveTo: (pos, o) => { seenMaxOps2 = o.maxOps; seenMaxRooms2 = o.maxRooms; return OK; },
        };
        routing.moveToRoom(noOpsCreep, "W9N9", { range: 20, realRoute: false }); // scout free-roam shape
        assert(seenMaxOps2 === undefined && seenMaxRooms2 === undefined,
            "with realRoute:false, maxOps/maxRooms are never set at all - scout's free-roam " +
                "exploration keeps the engine's own defaults");

        PathFinder.search = realSearch;
    }

    // --- ROADMAP 0064: computeRealRoute() - a one-time PathFinder.search
    // validation that a room sequence is actually WALKABLE (real terrain,
    // available even without vision), not just adjacent on the map graph
    // the way Game.map.findRoute sees things. Diagnosed live the same day
    // as the 0063 fix: even with the dead end correctly excluded and the
    // creep correctly backed out to a real, wide-open room, the native
    // PathFinder (restricted to routeCostCallback's narrow "allowed" room
    // set) STILL came back ERR_NO_PATH from there, because the real detour
    // needed a room outside that restricted set entirely - no amount of
    // reacting after the fact can fix a search that was never allowed to
    // look in the right place. This validates the whole trip upfront
    // instead, for the one mission that can't afford to burn travel ticks
    // discovering that reactively (the claimer - CREEP_CLAIM_LIFE_TIME is a
    // fixed 600-tick budget, ROADMAP 0033) --------------------------------
    {
        const realSearch = PathFinder.search;

        // excludes opts.avoid, (blockHostiles) known-hostile rooms, AND
        // (ROADMAP 0064 live follow-up) foreign-owned rooms outright - never
        // just penalized - but an ally's own room is exempt from the
        // ownership check (their interior obstacles are the reactive
        // backtrack's job, ROADMAP 0061, not something this precheck
        // refuses to even approach)
        {
            let seenAvoid = null, seenHostile = null, seenEnemyOwned = null, seenAllyOwned = null;
            Memory.rooms.WRealHostile = { enemies: 1 };
            Memory.rooms.WRealEnemyOwned = { owner: "SomeEnemyPlayer" };
            Memory.rooms.WRealAllyOwned = { owner: "fR1dj" };
            PathFinder.search = (origin, goal, o) => {
                seenAvoid = o.roomCallback("WRealAvoided");
                seenHostile = o.roomCallback("WRealHostile");
                seenEnemyOwned = o.roomCallback("WRealEnemyOwned");
                seenAllyOwned = o.roomCallback("WRealAllyOwned");
                return { path: [], incomplete: true };
            };
            routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {
                avoid: ["WRealAvoided"],
                blockHostiles: true,
            });
            assert(seenAvoid === false,
                "computeRealRoute excludes every room in opts.avoid");
            assert(seenHostile === false,
                "computeRealRoute excludes known-hostile rooms under blockHostiles");
            assert(seenEnemyOwned === false,
                "computeRealRoute excludes a foreign-owned room outright, even with zero " +
                    "hostile creeps ever seen there");
            assert(seenAllyOwned !== false,
                "computeRealRoute never excludes an ally's own room just because they own it");
            delete Memory.rooms.WRealHostile;
            delete Memory.rooms.WRealEnemyOwned;
            delete Memory.rooms.WRealAllyOwned;
            PathFinder.search = realSearch;
        }

        // ROADMAP 0075: opts.allowRoom - same extra restriction as
        // findRoute()'s own allowRoom test above, here for computeRealRoute's
        // roomCallback (remoteHauler/remoteMiner's actual code path).
        {
            let seenNotAllowed = null, seenAllowed = null;
            PathFinder.search = (origin, goal, o) => {
                seenNotAllowed = o.roomCallback("WNotAllowed");
                seenAllowed = o.roomCallback("WOk");
                return { path: [], incomplete: true };
            };
            routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {
                allowRoom: (n) => n === "WOk",
            });
            assert(seenNotAllowed === false,
                "computeRealRoute excludes a room opts.allowRoom rejects (AC3)");
            assert(seenAllowed !== false,
                "computeRealRoute never excludes a room opts.allowRoom accepts (AC3)");
            PathFinder.search = realSearch;
        }

        // collapses the tile path into a deduped room-name sequence,
        // excluding the room the search started FROM (same convention
        // Game.map.findRoute's own hop list already uses)
        {
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(49, 25, "W1N1"),
                    new RoomPosition(0, 25, "W2N1"),
                    new RoomPosition(25, 25, "W2N1"),
                    new RoomPosition(49, 25, "W2N1"),
                    new RoomPosition(0, 25, "W3N1"),
                    new RoomPosition(25, 25, "W3N1"),
                ],
                incomplete: false,
            });
            const rooms = routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {});
            assert(rooms.length === 2 && rooms[0] === "W2N1" && rooms[1] === "W3N1",
                "computeRealRoute collapses the tile path into a deduped room sequence, " +
                    "excluding the origin room");
            PathFinder.search = realSearch;
        }

        // A malformed collapsed trace must never become a multi-room hop plan.
        {
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(25, 25, "W1N1"),
                    new RoomPosition(25, 25, "W3N1"),
                ],
                incomplete: false,
            });
            assert(routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {}) === null,
                "computeRealRoute rejects a non-adjacent room hop after collapsing the path");
            PathFinder.search = realSearch;
        }

        // an incomplete (or empty) search is never trusted - null, not a
        // partial/misleading sequence
        {
            PathFinder.search = () => ({ path: [new RoomPosition(30, 25, "W1N1")], incomplete: true });
            assert(routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {}) === null,
                "computeRealRoute returns null when the search comes back incomplete");
            PathFinder.search = () => ({ path: [], incomplete: false });
            assert(routing.computeRealRoute(new RoomPosition(25, 25, "W1N1"), "W9N9", {}) === null,
                "computeRealRoute returns null when the search comes back empty");
            PathFinder.search = realSearch;
        }
    }

    // --- ROADMAP 0064: moveToRoom(..., {realRoute: true}) - the cached
    // route takes over from Game.map.findRoute entirely while it lasts, and
    // falls back cleanly the moment ROADMAP 0063's reactive backtrack ever
    // discards it -------------------------------------------------------
    {
        const realSearch = PathFinder.search;
        const realFindRouteRR = Game.map.findRoute;

        // computed once per trip, not once per tick
        {
            let searches = 0;
            PathFinder.search = () => {
                searches++;
                return {
                    path: [
                        new RoomPosition(49, 25, "W1N1"),
                        new RoomPosition(25, 25, "W2N1"),
                    ],
                    incomplete: false,
                };
            };
            const rrCreep = {
                pos: new RoomPosition(25, 25, "W1N1"),
                room: { name: "W1N1" },
                memory: {},
                moveTo: () => OK,
            };
            routing.moveToRoom(rrCreep, "W9N9", { range: 20, realRoute: true });
            routing.moveToRoom(rrCreep, "W9N9", { range: 20, realRoute: true });
            routing.moveToRoom(rrCreep, "W9N9", { range: 20, realRoute: true });
            assert(searches === 1,
                "moveToRoom computes the real route once per trip, not once per tick");
            assert(rrCreep.memory._realRoute && rrCreep.memory._realRoute[0] === "W2N1",
                "the validated sequence is cached on the creep");
            PathFinder.search = realSearch;
        }

        // the cached route drives execution instead of calling
        // Game.map.findRoute at all - and (ROADMAP 0064 live follow-up: a
        // raw PathFinder.search from the console, no code of ours in the
        // way, found a complete path straight through rooms this module
        // had been blaming as dead ends - EXACT rooms a validated
        // _realRoute already said were fine) a validated real route now
        // gets avoidCostCallback's BLOCKLIST freedom (only opts.avoid/
        // hostile excluded, everything else open - matching the freedom
        // computeRealRoute() itself used to validate the route in the
        // first place), never routeCostCallback's narrower allowlist
        {
            let findRouteCalls = 0;
            Game.map.findRoute = () => { findRouteCalls++; return [{ exit: 1, room: "W9N9" }]; };
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(49, 25, "WCache1"),
                    new RoomPosition(25, 25, "WCache2"),
                    new RoomPosition(25, 25, "WCache3"),
                ],
                incomplete: false,
            });
            let seenCostCallback = null;
            const cacheCreep = {
                pos: new RoomPosition(25, 25, "WCache1"),
                room: { name: "WCache1" },
                memory: {},
                moveTo: (pos, o) => { seenCostCallback = o.costCallback; return OK; },
            };
            routing.moveToRoom(cacheCreep, "W9N9", { range: 20, realRoute: true });
            assert(findRouteCalls === 0,
                "Game.map.findRoute is never called while a validated real route is active");
            const cm = new PathFinder.CostMatrix();
            assert(seenCostCallback("WCache2", cm) === cm,
                "the cached real route's next hop is allowed");
            assert(seenCostCallback("WSomeUnrelatedRoom", cm) === false,
                "a validated hop excludes rooms outside the current room and next hop");
            PathFinder.search = realSearch;
            Game.map.findRoute = realFindRouteRR;
        }

        // and opts.avoid still genuinely excludes a room even while a
        // validated real route is driving execution
        {
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(49, 25, "WBlockStart"),
                    new RoomPosition(25, 25, "WBlockNext"),
                ],
                incomplete: false,
            });
            let seenCostCallback2 = null;
            const blockCreep = {
                pos: new RoomPosition(25, 25, "WBlockStart"),
                room: { name: "WBlockStart" },
                memory: { _routeAvoid: ["WBlockedRoom"] },
                moveTo: (pos, o) => { seenCostCallback2 = o.costCallback; return OK; },
            };
            routing.moveToRoom(blockCreep, "W9N9", { range: 20, realRoute: true });
            const cm2 = new PathFinder.CostMatrix();
            assert(seenCostCallback2("WBlockedRoom", cm2) === false,
                "opts.avoid still excludes a room outright under the blocklist-based callback");
            assert(seenCostCallback2("WAnyOtherRoom", cm2) === false,
                "a validated hop still excludes unrelated rooms");
            PathFinder.search = realSearch;
        }

        // A validated route remains cached when the creep's room differs from
        // the recorded sequence, but execution still stays within one hop.
        {
            let findRouteCallsDetour = 0;
            Game.map.findRoute = () => { findRouteCallsDetour++; return [{ exit: 1, room: "W9N9" }]; };
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(49, 25, "WDetourStart"),
                    new RoomPosition(25, 25, "WDetourStepA"),
                    new RoomPosition(25, 25, "WDetourStepB"),
                ],
                incomplete: false,
            });
            let seenCostCallback3 = null;
            const detourCreep = {
                pos: new RoomPosition(25, 25, "WDetourStart"),
                room: { name: "WDetourStart" },
                memory: {},
                moveTo: (pos, o) => { seenCostCallback3 = o.costCallback; return OK; },
            };
            routing.moveToRoom(detourCreep, "W9N9", { range: 20, realRoute: true });
            // now physically in a room the recorded sequence never named -
            // the native search's own choice under the blocklist, not a
            // dead end and not a retreat
            detourCreep.room = { name: "WNeverRecorded" };
            detourCreep.pos = new RoomPosition(25, 25, "WNeverRecorded");
            routing.moveToRoom(detourCreep, "W9N9", { range: 20, realRoute: true });
            assert(findRouteCallsDetour === 0,
                "Game.map.findRoute is still never called - deviating off the recorded sequence " +
                    "does not discard the validated real route");
            assert(
                detourCreep.memory._realRoute && detourCreep.memory._realRouteDest === "W9N9",
                "_realRoute stays cached across the deviation instead of being deleted"
            );
            const cm3 = new PathFinder.CostMatrix();
            assert(seenCostCallback3("WSomeRoomNeverInTheRoute", cm3) === false,
                "a deviation does not reopen arbitrary rooms during a validated hop");
            PathFinder.search = realSearch;
            Game.map.findRoute = realFindRouteRR;
        }

        // ROADMAP 0064 same-day, the actual root cause: native moveTo()'s
        // own internal multi-room search proved measurably less reliable
        // than computeRealRoute()'s raw PathFinder.search() under identical
        // constraints - confirmed live across 3 separate legs via the
        // queriedRooms diagnostic (it asked about and was correctly told
        // open/blocked for exactly the right rooms, and still gave up,
        // sometimes without even trying the room the real detour needed).
        // Fix: once a real route is cached, hand native moveTo() only the
        // NEXT hop as its target, never the whole multi-room trip at once -
        // so it only ever has to solve searches it's proven reliable at.
        {
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(49, 25, "WHopStart"),
                    new RoomPosition(25, 25, "WHop1"),
                    new RoomPosition(25, 25, "WHop2"),
                    new RoomPosition(25, 25, "WHopFinal"),
                ],
                incomplete: false,
            });
            let seenTarget = null, seenRange = null;
            const hopCreep = {
                pos: new RoomPosition(25, 25, "WHopStart"),
                room: { name: "WHopStart" },
                memory: {},
                moveTo: (pos, o) => { seenTarget = pos.roomName; seenRange = o.range; return OK; },
            };
            routing.moveToRoom(hopCreep, "WHopFinal", { range: 20, realRoute: true });
            assert(seenTarget === "WHop1",
                "with a 3-hop cached real route, moveTo() targets only the NEXT hop, not the " +
                    "final destination directly - live evidence across 3 legs showed native " +
                    "moveTo()'s own multi-room search failing routes computeRealRoute solved fine");
            assert(seenRange === 0, "each hop requires entering the target room");

            // creep physically enters WHop1 - the next call should aim at WHop2
            hopCreep.room = { name: "WHop1" };
            hopCreep.pos = new RoomPosition(25, 25, "WHop1");
            routing.moveToRoom(hopCreep, "WHopFinal", { range: 20, realRoute: true });
            assert(seenTarget === "WHop2",
                "once the first hop is reached, the next call targets the hop after it");

            // creep reaches WHop2 - the LAST intermediate hop before the
            // real destination - the next call should target the true
            // destination directly, same as before this fix for the final leg
            hopCreep.room = { name: "WHop2" };
            hopCreep.pos = new RoomPosition(25, 25, "WHop2");
            routing.moveToRoom(hopCreep, "WHopFinal", { range: 20, realRoute: true });
            assert(seenTarget === "WHopFinal",
                "once only the final destination remains in the cached route, moveTo() targets " +
                    "it directly again - single-hop targeting is only for intermediate hops");
            PathFinder.search = realSearch;
        }

        // Every room hop now targets a walkable entry tile and requires
        // entering that room. This avoids treating a wall at the room center
        // as the destination or considering an adjacent room reached early.
        {
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(49, 25, "WHopStart2"),
                    new RoomPosition(25, 25, "WHopA"),
                    new RoomPosition(25, 25, "WHopFinal2"),
                ],
                incomplete: false,
            });
            let seenTarget2 = null, seenRange2 = null;
            const hopCreep2 = {
                pos: new RoomPosition(25, 25, "WHopStart2"),
                room: { name: "WHopStart2" },
                memory: {},
                moveTo: (pos, o) => { seenTarget2 = pos.roomName; seenRange2 = o.range; return OK; },
            };
            routing.moveToRoom(hopCreep2, "WHopFinal2", { range: 30, realRoute: true });
            assert(seenTarget2 === "WHopA" && seenRange2 === 0,
                "an intermediate hop requires entering the target room");

            hopCreep2.room = { name: "WHopA" };
            hopCreep2.pos = new RoomPosition(25, 25, "WHopA");
            routing.moveToRoom(hopCreep2, "WHopFinal2", { range: 30, realRoute: true });
            assert(seenTarget2 === "WHopFinal2" && seenRange2 === 0,
                "the final hop also requires entering the destination room");
            PathFinder.search = realSearch;
        }

        // ROADMAP 0064 live follow-up: once _routeAvoid grows enough that
        // computeRealRoute can't find ANY complete route avoiding it, the
        // OLD behavior fell through to plain findRoute() - a long, entirely
        // unvalidated room sequence that fails on its own and gets the
        // CURRENT room (never actually attempted!) wrongly blacklisted for
        // it. Confirmed live with a full trace: this compounded across
        // several legs (each wrongful blacklist forcing an even longer next
        // detour) until the claimer's CREEP_CLAIM_LIFE_TIME ran out mid-
        // cascade - and the "blamed" rooms were independently confirmed
        // clean (checked their terrain directly) once the cascade was
        // diagnosed. Fix: retreat one more hop instead, WITHOUT touching
        // _routeAvoid, and never call findRoute()/moveTo() with an
        // unvalidated route at all in this case ---------------------------
        {
            let findRouteCalls2 = 0;
            Game.map.findRoute = () => { findRouteCalls2++; return [{ exit: 1, room: "E1N45" }]; };
            PathFinder.search = () => ({ path: [], incomplete: true }); // computeRealRoute finds nothing
            const noRouteCreep = {
                pos: new RoomPosition(25, 25, "W3N51"),
                room: { name: "W3N51" },
                memory: {
                    _routeStackDest: "E1N45",
                    _routeStack: ["W2N51", "W3N51"], // already retreated once - a real earlier room exists
                    _routeAvoid: ["E1N46", "E0N46"], // some genuinely-confirmed dead ends already
                    _routeRetreatTo: "W3N51", // retreat just completed, arriving here
                },
                moveTo: (pos) => pos.roomName,
            };
            const result = routing.moveToRoom(noRouteCreep, "E1N45", { range: 20, realRoute: true });
            assert(findRouteCalls2 === 0,
                "when computeRealRoute finds nothing, findRoute() is never called at all - no " +
                    "unvalidated room sequence is ever attempted");
            assert(noRouteCreep.memory._routeAvoid.length === 2,
                "the current room (W3N51) is NOT added to _routeAvoid - it was never actually " +
                    "attempted, so blaming it would be wrong");
            assert(noRouteCreep.memory._routeRetreatTo === "W2N51",
                "instead, it retreats one more hop to the room before it in its own real history");
            assert(result === "W2N51",
                "and the creep is walked there the same tick, never toward the real destination " +
                    "using an unvalidated route");
            Game.map.findRoute = realFindRouteRR;
            PathFinder.search = realSearch;
        }

        // a confirmed dead end (ROADMAP 0063's retreat) discards the cached
        // real route immediately - see the NEXT block below for what
        // happens once the retreat actually completes (ROADMAP 0064 same-day
        // follow-up: it used to stay on findRoute()-only routing for the
        // rest of the trip, which reintroduced the exact narrow-search-space
        // bug 0064 exists to fix, just one room further out - confirmed live)
        {
            PathFinder.search = () => ({
                path: [
                    new RoomPosition(49, 25, "WGoodStart"),
                    new RoomPosition(25, 25, "WDeadEndReal"),
                ],
                incomplete: false,
            });
            const rrDeadEndCreep = {
                pos: new RoomPosition(25, 25, "WGoodStart"),
                room: { name: "WGoodStart" },
                memory: {},
                moveTo: () => OK,
            };
            routing.moveToRoom(rrDeadEndCreep, "E9N9", { range: 20, realRoute: true });
            assert(rrDeadEndCreep.memory._realRoute,
                "sanity: the real route was cached for this trip");
            PathFinder.search = realSearch;

            // now the cached hop actually fails - routing.noPathTicks (2)
            // consecutive ERR_NO_PATH ticks confirms the dead end
            rrDeadEndCreep.room = { name: "WDeadEndReal" };
            rrDeadEndCreep.pos = new RoomPosition(25, 25, "WDeadEndReal");
            rrDeadEndCreep.moveTo = () => ERR_NO_PATH;
            routing.moveToRoom(rrDeadEndCreep, "E9N9", { range: 20, realRoute: true });
            routing.moveToRoom(rrDeadEndCreep, "E9N9", { range: 20, realRoute: true });
            assert(!rrDeadEndCreep.memory._realRoute && !rrDeadEndCreep.memory._realRouteDest,
                "a confirmed dead end discards the cached real route");
            assert(rrDeadEndCreep.memory._routeAvoid.indexOf("WDeadEndReal") !== -1,
                "and falls back to the ordinary reactive backtrack (ROADMAP 0063) from here on");

            // ROADMAP 0064 same-day follow-up: once the retreat actually
            // completes (creep physically back in WGoodStart), that's a new
            // leg of the trip starting from known-good ground - re-validate
            // it against real terrain again, not just findRoute() for good
            let secondSearchAvoid = null;
            let searchCalls = 0;
            PathFinder.search = (origin, goal, o) => {
                searchCalls++;
                secondSearchAvoid = o.roomCallback("WDeadEndReal");
                return {
                    path: [
                        new RoomPosition(49, 25, "WGoodStart"),
                        new RoomPosition(25, 25, "WViaDetour"),
                    ],
                    incomplete: false,
                };
            };
            rrDeadEndCreep.room = { name: "WGoodStart" }; // arrived back
            rrDeadEndCreep.pos = new RoomPosition(25, 25, "WGoodStart");
            rrDeadEndCreep.moveTo = () => OK;
            routing.moveToRoom(rrDeadEndCreep, "E9N9", { range: 20, realRoute: true });
            assert(searchCalls === 1,
                "a completed retreat re-validates the rest of the trip against real terrain " +
                    "again, not just once at the start");
            assert(secondSearchAvoid === false,
                "the re-validation's own search correctly excludes the dead end just found");
            assert(rrDeadEndCreep.memory._realRoute && rrDeadEndCreep.memory._realRoute[0] === "WViaDetour",
                "and caches the newly-validated (detoured) sequence for the rest of the trip");
            PathFinder.search = realSearch;
        }

        // a failed precompute (incomplete search) never blocks the trip -
        // moveToRoom falls back to the normal findRoute()-based flow the
        // same tick, exactly as if opts.realRoute had never been passed
        {
            PathFinder.search = () => ({ path: [], incomplete: true });
            const failedCreep = {
                pos: new RoomPosition(25, 25, "WPrecomputeFails"),
                room: { name: "WPrecomputeFails" },
                memory: {},
                moveTo: () => "moved",
            };
            const result = routing.moveToRoom(failedCreep, "W9N9", { range: 20, realRoute: true });
            assert(result === "moved" && !failedCreep.memory._realRoute,
                "a failed real-route precompute falls back to normal findRoute-based routing " +
                    "instead of blocking the trip");
            PathFinder.search = realSearch;
        }
    }

    // --- ROADMAP 0064 live follow-up: native moveTo()'s own reusePath
    // cache isn't invalidated just because a fresh costCallback closure is
    // handed to it this tick - confirmed live, a claimer kept re-entering a
    // room already sitting in its own _routeAvoid, because the cached path
    // being walked predated that room joining the list and nothing forced
    // a recompute in between. retreatFrom() already clears the cache the
    // moment IT fires, but that's not the only way _routeAvoid can grow
    // relative to whatever path is currently cached - this closes the gap
    // generally, off _routeAvoid's own length rather than any one call site --
    {
        const staleCreep = {
            pos: new RoomPosition(25, 25, "WStale"),
            room: { name: "WStale" },
            memory: { _routeAvoid: ["WSomeDeadEnd"], _move: { path: "stale" } },
            moveTo: () => OK,
        };
        routing.moveToRoom(staleCreep, "E9N9", { range: 20 });
        assert(staleCreep.memory._move === undefined,
            "a creep whose _routeAvoid already has an entry the cached path never accounted " +
                "for gets that stale path dropped, forcing a fresh (avoid-respecting) one");

        // avoid unchanged on the next call - no reason to keep dropping a
        // perfectly good fresh path every single tick
        staleCreep.memory._move = { path: "fresh" };
        routing.moveToRoom(staleCreep, "E9N9", { range: 20 });
        assert(staleCreep.memory._move !== undefined,
            "with _routeAvoid unchanged since the last recompute, a freshly-cached path is " +
                "left alone - this isn't an unconditional clear-every-tick");

        // _routeAvoid grows again (a real retreat) - the cache must drop
        // again too, not just the one time at creep creation
        staleCreep.memory._routeAvoid.push("WAnotherDeadEnd");
        routing.moveToRoom(staleCreep, "E9N9", { range: 20 });
        assert(staleCreep.memory._move === undefined,
            "_routeAvoid growing again drops the cached path again, however it grew");
    }

    // --- ROADMAP 0063: the actual fix for the bug five specs straight
    // (0057/0058/0060/0061/0062) failed to close. Diagnosis: Game.map.
    // findRoute()'s routeCallback is only ever invoked for rooms the search
    // CONSIDERS ENTERING, never for the room it starts FROM - so every one
    // of those five fixes' core move ("push the room the creep is stuck in
    // onto its own avoid list, then recompute findRoute() from that SAME
    // room") changed nothing at all: the next findRoute() call still starts
    // there, and routeCallback never once reads that room's own avoid
    // entry. A creep standing in a dead-end room can never make findRoute()
    // route around that room by avoiding it - only a DIFFERENT room's
    // search can. Fix: retreat one hop back to the room this creep was
    // last known to be in (creep.memory._routeStack, its own real path -
    // never a guess from room-name geometry or linear distance, the two
    // ways ROADMAP 0061's fixes broke), exclude the dead end from THERE,
    // and let findRoute() pick a genuinely different room (B>D>E instead
    // of B>C>E, once C proves to be the dead end).
    //
    // Live follow-up the same day: gating this on mere POSITION freeze was
    // itself a false-positive trap - a creep froze in a perfectly good room
    // (confirmed by checking its terrain directly: wide open on both
    // sides) because of ordinary highway traffic on the very next tile,
    // and got backed out of a room it never needed to leave. The trigger
    // now reads native moveTo()'s own ERR_NO_PATH instead - the engine's
    // authoritative "no route exists", not a guess from "hasn't moved" ---
    {
        const backtrackCreep = {
            pos: new RoomPosition(25, 25, "W1N50"),
            room: { name: "W1N50" },
            memory: {},
            moveTo: () => OK, // a real path exists - nothing wrong with W1N50 itself
        };
        routing.moveToRoom(backtrackCreep, "E1N45", { range: 20 }); // still in W1N50
        assert(
            backtrackCreep.memory._routeStack.length === 1 &&
                backtrackCreep.memory._routeStack[0] === "W1N50",
            "moveToRoom() records each room actually visited toward the current destination"
        );

        // crosses into W1N49 - the dead end - where native moveTo() itself
        // reports no path at all toward the real destination
        backtrackCreep.room = { name: "W1N49" };
        backtrackCreep.pos = new RoomPosition(25, 25, "W1N49");
        backtrackCreep.moveTo = (pos) => (pos.roomName === "E1N45" ? ERR_NO_PATH : OK);
        routing.moveToRoom(backtrackCreep, "E1N45", { range: 20 }); // 1st ERR_NO_PATH tick
        assert(!backtrackCreep.memory._routeAvoid,
            "a single ERR_NO_PATH tick isn't a confirmed dead end yet (routing.noPathTicks " +
                "default is 2 - traffic or a one-tick fluke doesn't blacklist a room)");

        let retreatTarget = null;
        backtrackCreep.moveTo = (pos) => {
            if (pos.roomName === "E1N45") return ERR_NO_PATH; // still no path to the real target
            retreatTarget = pos.roomName; // any other target is the retreat move itself
            return OK;
        };
        routing.moveToRoom(backtrackCreep, "E1N45", { range: 20 }); // 2nd ERR_NO_PATH tick - confirmed
        assert(
            backtrackCreep.memory._routeAvoid.length === 1 &&
                backtrackCreep.memory._routeAvoid[0] === "W1N49",
            "the dead end itself goes into _routeAvoid - never the room behind it, which the " +
                "creep still needs to retreat through"
        );
        assert(backtrackCreep.memory._routeRetreatTo === "W1N50",
            "the room right before the dead end in this creep's OWN visited history becomes " +
                "the retreat target - read from its real path, never guessed from geometry");
        assert(retreatTarget === "W1N50",
            "moveToRoom() immediately walks the creep back there the SAME tick it gives up on " +
                "the dead end, instead of repeating the identical doomed crossing again");

        // still crossing back - moveToRoom keeps steering it toward W1N50,
        // ignoring the real destination for now, until it actually arrives
        retreatTarget = null;
        routing.moveToRoom(backtrackCreep, "E1N45", { range: 20 });
        assert(retreatTarget === "W1N50",
            "still short of the retreat target - moveToRoom keeps walking it there");

        // arrives back in W1N50 - routing now resumes FROM here, with the
        // dead end correctly excluded: it's a real candidate this search
        // actually evaluates, unlike when it was the search's own origin
        backtrackCreep.room = { name: "W1N50" };
        backtrackCreep.pos = new RoomPosition(25, 25, "W1N50");
        backtrackCreep.moveTo = () => OK; // back on known-good ground
        const realFindRoute1 = Game.map.findRoute;
        let sawFrom = null, sawAvoidCost = null;
        Game.map.findRoute = (from, to, o) => {
            sawFrom = from;
            sawAvoidCost = o.routeCallback("W1N49");
            return [{ exit: 1, room: to }];
        };
        routing.moveToRoom(backtrackCreep, "E1N45", { range: 20 });
        assert(sawFrom === "W1N50",
            "the route is recomputed FROM the room behind the dead end, not from inside it");
        assert(sawAvoidCost === Infinity,
            "and from there, the dead end is genuinely excluded - routeCallback actually gets " +
                "asked about it this time");
        assert(!backtrackCreep.memory._routeRetreatTo,
            "retreat clears once the creep is actually back");
        Game.map.findRoute = realFindRoute1;
    }

    // --- ROADMAP 0062's original finding, still true, now fixed properly
    // (ROADMAP 0063): a creep that crosses a border back and forth every
    // cycle never sits still for two ticks running, so the freeze-based
    // isStuck() above can never see it - only a room-NAME trail can. Real
    // geometry from the live incident: W1N49 (an ally's room, interior
    // closed by their own rampart/wall) and W1N50 (the corridor in front of
    // it). ROADMAP 0062's own reaction here was the unsound part, not the
    // detection: it pushed BOTH trail rooms into the avoid list, "no
    // guessing which one is really the trap" - except W1N50, the safe
    // corridor the creep needed to retreat THROUGH, was never actually safe
    // to avoid; blocking it could sever the creep's only way back. Once
    // caught, this now feeds the exact same retreatFrom() as a frozen
    // stall: only the room the pattern closes on (the one the creep keeps
    // failing to get past) is excluded, and the creep is walked back to the
    // room before it - never the reverse -----------------------------------
    {
        const bounceCreep = {
            pos: new RoomPosition(25, 25, "W1N50"),
            room: { name: "W1N50" },
            memory: {},
            moveTo: () => OK,
        };
        routing.moveToRoom(bounceCreep, "E1N45", { range: 20 }); // W1N50
        bounceCreep.room = { name: "W1N49" };
        bounceCreep.pos = new RoomPosition(25, 40, "W1N49");
        routing.moveToRoom(bounceCreep, "E1N45", { range: 20 }); // W1N50, W1N49
        bounceCreep.room = { name: "W1N50" };
        bounceCreep.pos = new RoomPosition(25, 25, "W1N50");
        routing.moveToRoom(bounceCreep, "E1N45", { range: 20 }); // W1N50, W1N49, W1N50
        assert(!bounceCreep.memory._routeAvoid,
            "W1N50, W1N49, W1N50 alone isn't a confirmed bounce yet - could be normal backtracking");

        bounceCreep.room = { name: "W1N49" };
        bounceCreep.pos = new RoomPosition(25, 41, "W1N49"); // different tile each visit - never frozen
        let retreatTarget = null;
        bounceCreep.moveTo = (pos) => { retreatTarget = pos.roomName; return OK; };
        routing.moveToRoom(bounceCreep, "E1N45", { range: 20 }); // W1N50, W1N49, W1N50, W1N49 - bouncing
        assert(
            bounceCreep.memory._routeAvoid.length === 1 &&
                bounceCreep.memory._routeAvoid[0] === "W1N49",
            "bouncing excludes only the room the pattern closes on (the one the creep keeps " +
                "failing to get past) - never the safe corridor behind it"
        );
        assert(bounceCreep.memory._routeTrail.length === 0,
            "the trail resets once the bounce is caught, so it doesn't immediately re-trigger");
        assert(retreatTarget === "W1N50",
            "and the creep is walked straight back to that corridor room, the same tick");
    }

    // --- ROADMAP 0060/0061: a creep confirmed live sitting still (with no
    // fatigue) for several ticks running - originally checked only at a
    // room's edge coordinate (the engine shoves an unmoving creep off an
    // exit tile without a fresh move queued, which can happen before the
    // next tick's script even reads its position, so isRouteFlapping()'s
    // room-name trail above can miss it completely - no room-name change to
    // ever catch), generalized (0061, researched from screeps-cartographer's
    // creepIsStuck) to ANY tile - a creep frozen in the middle of a maze
    // room never produces a room-name change either, and the old
    // border-only check ignored that case outright. isStuck() catches both
    // by position instead; isOnBorder() (split out of the old border check)
    // tells callers which remedy applies; nudgeAwayFromBorder() steps a
    // border-stuck creep off the edge directly rather than leaving it to
    // another moveTo() call that might just propose the same doomed step
    // again -----------------------------------------------------------
    {
        const centerCreep = { pos: new RoomPosition(25, 25, "W1N1"), room: { name: "W1N1" }, memory: {}, fatigue: 0 };
        assert(routing.isOnBorder(centerCreep) === false, "the room center is never a border tile");
        assert(routing.isStuck(centerCreep, "_k") === false,
            "first tick anywhere isn't a stall yet");
        assert(routing.isStuck(centerCreep, "_k") === false,
            "second tick unmoved in the exact same spot still isn't a stall yet");
        assert(routing.isStuck(centerCreep, "_k") === false,
            "third tick unmoved in the exact same spot still isn't a stall yet");
        assert(routing.isStuck(centerCreep, "_k") === true,
            "fourth tick unmoved anywhere - not just the border - is a stall (ROADMAP 0061)");

        const edgeCreep = { pos: new RoomPosition(49, 10, "W1N1"), room: { name: "W1N1" }, memory: {}, fatigue: 0 };
        assert(routing.isOnBorder(edgeCreep) === true, "x/y 49 is a border tile");
        routing.isStuck(edgeCreep, "_k");
        routing.isStuck(edgeCreep, "_k");
        routing.isStuck(edgeCreep, "_k");
        assert(routing.isStuck(edgeCreep, "_k") === true,
            "the same stall detection applies on a border tile too");

        edgeCreep.pos = new RoomPosition(48, 10, "W1N1");
        assert(routing.isStuck(edgeCreep, "_k") === false,
            "moving off the exact spot resets the stall count immediately");

        // a tick with fatigue > 0 never counts toward the counter - ordinary
        // terrain/body fatigue keeping a creep from moving isn't "stuck"
        const fatiguedCreep = { pos: new RoomPosition(25, 25, "W1N1"), room: { name: "W1N1" }, memory: {}, fatigue: 2 };
        routing.isStuck(fatiguedCreep, "_k");
        routing.isStuck(fatiguedCreep, "_k");
        routing.isStuck(fatiguedCreep, "_k");
        assert(routing.isStuck(fatiguedCreep, "_k") === false,
            "a tick with fatigue never counts toward the stuck counter, even at the same position");
        fatiguedCreep.fatigue = 0;
        routing.isStuck(fatiguedCreep, "_k");
        routing.isStuck(fatiguedCreep, "_k");
        routing.isStuck(fatiguedCreep, "_k");
        assert(routing.isStuck(fatiguedCreep, "_k") === true,
            "once fatigue clears, the same-position count resumes normally");

        // independent key prefixes never share state on the same creep - a
        // scout doing both a fixed-destination task (routing's own
        // tracking) and free exploration (its own tracking) needs both to
        // work independently without clobbering each other
        const dualCreep = { pos: new RoomPosition(0, 5, "W1N1"), room: { name: "W1N1" }, memory: {}, fatigue: 0 };
        routing.isStuck(dualCreep, "_routeStuck");
        routing.isStuck(dualCreep, "_routeStuck");
        routing.isStuck(dualCreep, "_routeStuck");
        assert(routing.isStuck(dualCreep, "_routeStuck") === true,
            "the first key prefix reaches a stall after 4 ticks");
        assert(routing.isStuck(dualCreep, "_exploreStuck") === false,
            "a different key prefix on the same creep/tick starts its own count from zero");

        const nudgeCreep = {
            pos: new RoomPosition(0, 25, "W1N1"), room: { name: "W1N1" }, moveDir: null,
            move: function (d) { this.moveDir = d; },
        };
        assert(routing.nudgeAwayFromBorder(nudgeCreep) === true,
            "a creep on the edge gets nudged");
        assert(nudgeCreep.moveDir !== null, "nudging actually queues a move");

        const noNudgeCreep = {
            pos: new RoomPosition(25, 25, "W1N1"),
            move: () => { throw new Error("should not move"); },
        };
        assert(routing.nudgeAwayFromBorder(noNudgeCreep) === false,
            "a creep nowhere near the edge has nothing to nudge away from, and move() is never called");
    }

    // moveToRoom() itself: a creep stuck with no OTHER room in its visited
    // history (this IS the trip's own origin) has nowhere to retreat to -
    // only the current room goes into _routeAvoid, and the creep still
    // gets a normal moveTo() call every tick (not a border tile here - the
    // nudge fallback is covered separately below) since it always falls
    // through to the regular findRoute()+moveTo() path now
    {
        let moveCalls = 0;
        const parkedCreep = {
            pos: new RoomPosition(25, 25, "WNoHistoryRoom"),
            room: { name: "WNoHistoryRoom" },
            memory: {},
            moveTo: () => { moveCalls++; return ERR_NO_PATH; },
            move: () => { throw new Error("not on a border - nudge fallback should never fire here"); },
        };
        routing.moveToRoom(parkedCreep, "W9N9", { range: 20 }); // 1st ERR_NO_PATH tick
        assert(!parkedCreep.memory._routeAvoid,
            "a single ERR_NO_PATH tick isn't a confirmed dead end yet");

        routing.moveToRoom(parkedCreep, "W9N9", { range: 20 }); // 2nd - confirmed
        assert(
            parkedCreep.memory._routeAvoid.length === 1 &&
                parkedCreep.memory._routeAvoid[0] === "WNoHistoryRoom",
            "with no earlier room in this trip's history to retreat to, only the room the " +
                "creep is stuck in goes into _routeAvoid"
        );
        assert(moveCalls === 2,
            "moveTo() is called every tick including the confirming one - no special " +
                "early-return needed since there's nowhere to retreat to");
    }

    // the destination itself is already in _routeAvoid (a previous stall
    // already proved this exact room can't be entered from here) - refuse
    // outright, no move()/moveTo() call at all, instead of walking up to
    // its border and trying the identical crossing every few ticks forever
    {
        let moveCalls2 = 0;
        const refusedCreep = {
            pos: new RoomPosition(25, 25, "E77N77"),
            room: { name: "E77N77" },
            memory: { _routeAvoid: ["E77N78"] },
            moveTo: () => { moveCalls2++; return OK; },
            move: () => { moveCalls2++; return OK; },
        };
        const result = routing.moveToRoom(refusedCreep, "E77N78", { range: 20 });
        assert(result === ERR_NO_PATH && moveCalls2 === 0,
            "moveToRoom() refuses outright (no move()/moveTo() call at all) once the " +
                "destination itself is already in _routeAvoid, instead of retrying the same " +
                "crossing every few ticks forever");
    }

    // a creep in a genuine maze/pocket (native moveTo() itself reports no
    // path, not just "hasn't moved") - adds the room it's actually stuck IN
    // to _routeAvoid and drops the cached path (creep.memory._move) so the
    // moveTo() call right after recomputes from scratch instead of walking
    // the same dead-end path again
    {
        let moveCalls3 = 0;
        const mazeCreep = {
            pos: new RoomPosition(25, 25, "WMazeRoom"), // not a border tile
            room: { name: "WMazeRoom" },
            memory: { _move: { path: "stale" } },
            moveTo: () => { moveCalls3++; return ERR_NO_PATH; },
            move: () => { throw new Error("should never nudge - not on a border"); },
        };
        routing.moveToRoom(mazeCreep, "W9N9", { range: 20 }); // 1st ERR_NO_PATH tick
        assert(!mazeCreep.memory._routeAvoid,
            "a single ERR_NO_PATH tick doesn't touch _routeAvoid yet");

        routing.moveToRoom(mazeCreep, "W9N9", { range: 20 }); // 2nd - confirmed dead end
        assert(
            mazeCreep.memory._routeAvoid.length === 1 &&
                mazeCreep.memory._routeAvoid[0] === "WMazeRoom",
            "a confirmed dead end (not a border tile) adds the current room to _routeAvoid " +
                "and drops the cached path"
        );
        assert(mazeCreep.memory._move === undefined,
            "the stale cached path is dropped once the dead end is confirmed");
        assert(moveCalls3 === 2,
            "moveTo() is called every tick including the confirming one - the cached path " +
                "is dropped, not the movement intent itself");

        // ROADMAP 0076: the same confirmed dead end also gets shared -
        // Memory.rooms[x].routeDeadEndUntil, not just this one creep's own
        // _routeAvoid - so every OTHER creep skips discovering it too.
        assert(routing.isKnownDeadEnd("WMazeRoom"),
            "retreatFrom() also marks the confirmed room as a shared dead end (AC1)");
        assert(
            Memory.rooms.WMazeRoom && Memory.rooms.WMazeRoom.routeDeadEndUntil > Game.time,
            "the shared mark has a future TTL (routing.deadEndTicks), not permanent"
        );

        // A completely fresh, independent creep (no _routeAvoid history of
        // its own) heading the same way must never be routed through the
        // shared dead end - checked directly against the cost-callback
        // layer (moveToRoom()'s own choice between real-route/findRoute
        // internals isn't relevant here, only that whichever one is in
        // play excludes it).
        {
            const cm = new PathFinder.CostMatrix();
            const cb = routing.routeCostCallback(
                [{ exit: 1, room: "WMazeRoom" }, { exit: 1, room: "W9N9" }],
                "WMazeHub", "W9N9", {}
            );
            assert(cb("WMazeRoom", cm) === false,
                "routeCostCallback excludes a shared dead end even though findRoute() itself " +
                    "picked it as part of the route (AC3)");
        }
        {
            const cbAvoid = routing.avoidCostCallback([], {});
            assert(cbAvoid("WMazeRoom", new PathFinder.CostMatrix()) === false,
                "avoidCostCallback excludes a shared dead end too (AC3)");
        }

        // AC2 - findRoute() itself refuses to route through a shared dead
        // end, before routeCostCallback ever gets involved
        {
            let probedCost = null;
            const realFindRoute = Game.map.findRoute;
            Game.map.findRoute = (from, to, o) => {
                probedCost = o.routeCallback("WMazeRoom");
                return [{ exit: 1, room: "W9N9" }];
            };
            routing.findRoute("WMazeHub", "W9N9", {});
            Game.map.findRoute = realFindRoute;
            assert(probedCost === Infinity,
                "findRoute() gives a shared dead end an infinite (fully excluded) cost (AC2)");
        }

        // AC4 - moveToRoom() refuses outright when the DESTINATION itself
        // is the shared dead end, even for a creep with zero history of
        // its own ever having been there
        {
            let refusedMoveCalls = 0;
            const targetIsDeadEndCreep = {
                pos: new RoomPosition(25, 25, "WMazeHub"),
                room: { name: "WMazeHub" },
                memory: {},
                moveTo: () => { refusedMoveCalls++; return OK; },
            };
            const result = routing.moveToRoom(targetIsDeadEndCreep, "WMazeRoom", { range: 20 });
            assert(result === ERR_NO_PATH && refusedMoveCalls === 0,
                "moveToRoom() refuses outright when the destination itself is a shared dead " +
                    "end, without this creep ever having tried it (AC4)");
        }

        // AC5 - clearRouteDeadEnd() console command resets the mark early
        global.clearRouteDeadEnd("WMazeRoom");
        assert(!routing.isKnownDeadEnd("WMazeRoom"),
            "clearRouteDeadEnd() clears a shared dead-end mark before its TTL expires (AC5)");

        // TTL actually expires on its own too, not just via the console
        // command
        routing.markDeadEnd("WMazeRoom");
        const beforeExpiry = Memory.rooms.WMazeRoom.routeDeadEndUntil;
        Memory.rooms.WMazeRoom.routeDeadEndUntil = Game.time - 1; // simulate TTL elapsed
        assert(!routing.isKnownDeadEnd("WMazeRoom"),
            "a dead-end mark past its own TTL is no longer honored (got until=" +
                beforeExpiry + ", now=" + Game.time + ")");
        delete Memory.rooms.WMazeRoom;
    }

    // ROADMAP 0078 - confirmed live: a pioneer's own OWNED home room got
    // blamed and shared as a route dead end. Root cause: a SECOND-OR-LATER
    // retreat cycle landing back on ground with nothing earlier to retreat
    // to (the exact "accumulated avoid list over-constrained the search"
    // pattern retreatWithoutBlame() already exists for) still fell through
    // to the ordinary retreatFrom() blame path once native moveTo() failed
    // again from there. Fix: retreatFrom() now delegates to
    // retreatWithoutBlame() itself instead of blaming, but ONLY when this
    // creep already confirmed another dead end this trip (_routeAvoid
    // non-empty) AND has nowhere earlier to go now either - never for a
    // creep's genuine FIRST stall (that case is covered by the mazeCreep/
    // parkedCreep tests above, which must keep blaming normally).
    {
        let moveCallsSecondCycle = 0;
        const secondCycleCreep = {
            pos: new RoomPosition(25, 25, "E1N47"),
            room: { name: "E1N47" },
            // already confirmed ONE dead end this trip (e.g. E1N46) and is
            // now back at E1N47 with nothing earlier in its own history -
            // exactly the state moveToRoom() leaves a creep in right after
            // retreatWithoutBlame()'s own "no earlier room either" fallthrough
            memory: { _routeAvoid: ["E1N46"], _routeStack: ["E1N47"] },
            moveTo: () => { moveCallsSecondCycle++; return ERR_NO_PATH; },
            move: () => { throw new Error("should never nudge - not on a border"); },
        };
        routing.moveToRoom(secondCycleCreep, "W9N9", { range: 20 }); // 1st ERR_NO_PATH tick
        routing.moveToRoom(secondCycleCreep, "W9N9", { range: 20 }); // 2nd - would confirm, IF blamed

        assert(
            secondCycleCreep.memory._routeAvoid.length === 1 &&
                secondCycleCreep.memory._routeAvoid[0] === "E1N46",
            "E1N47 is NOT added to _routeAvoid on this second-cycle failure - only the " +
                "original E1N46 stays (got " + JSON.stringify(secondCycleCreep.memory._routeAvoid) + ")"
        );
        assert(!routing.isKnownDeadEnd("E1N47"),
            "E1N47 is NOT shared as a route dead end either - the false-blame this reproduces");
    }

    // Same scenario, but the room is one the bot OWNS - markDeadEnd() (and
    // retreatFrom()'s own per-creep avoid push) must refuse to touch it
    // even on a creep's genuine FIRST stall, independent of the
    // second-cycle guard above: architect.js plans roads to every exit by
    // design, so an owned room is never a real dead end, and a creep that
    // can't leave it needs to keep trying to go HOME, not learn to avoid it.
    {
        Memory.rooms.EOwnedRoom = { my: true };
        let moveCallsOwned = 0;
        const ownedRoomCreep = {
            pos: new RoomPosition(25, 25, "EOwnedRoom"),
            room: { name: "EOwnedRoom" },
            memory: {},
            moveTo: () => { moveCallsOwned++; return ERR_NO_PATH; },
            move: () => { throw new Error("should never nudge - not on a border"); },
        };
        routing.moveToRoom(ownedRoomCreep, "W9N9", { range: 20 });
        routing.moveToRoom(ownedRoomCreep, "W9N9", { range: 20 }); // confirms, on a genuine first stall

        assert(!ownedRoomCreep.memory._routeAvoid || ownedRoomCreep.memory._routeAvoid.length === 0,
            "an owned room is never added to this creep's own _routeAvoid, even on a genuine " +
                "first-stall confirmation (got " + JSON.stringify(ownedRoomCreep.memory._routeAvoid) + ")");
        assert(!routing.isKnownDeadEnd("EOwnedRoom"),
            "an owned room is never shared as a route dead end either");

        // markDeadEnd() itself refuses directly too - defense in depth for
        // any OTHER caller, not just retreatFrom()
        routing.markDeadEnd("EOwnedRoom");
        assert(!routing.isKnownDeadEnd("EOwnedRoom"),
            "markDeadEnd() has its own independent guard against marking an owned room");
        delete Memory.rooms.EOwnedRoom;
    }

    // fallback safety net (ROADMAP 0060's original finding, kept under the
    // simpler 0062 design): if moveTo() itself can't find ANY path at all
    // (even after the avoid list update) and the creep is sitting exactly
    // on a border, nudge it off directly - the engine won't let a creep
    // rest on an exit tile without a fresh move queued that tick
    {
        let nudgeDir = null;
        const noPathCreep = {
            pos: new RoomPosition(0, 25, "WDeadEnd"),
            room: { name: "WDeadEnd" },
            memory: {},
            moveTo: () => ERR_NO_PATH,
            move: (d) => { nudgeDir = d; return OK; },
        };
        routing.moveToRoom(noPathCreep, "W9N9", { range: 20 });
        assert(nudgeDir !== null,
            "moveTo() returning ERR_NO_PATH while on a border falls back to a direct nudge " +
                "off the exit tile");

        const noPathCenterCreep = {
            pos: new RoomPosition(25, 25, "WDeadEnd"),
            room: { name: "WDeadEnd" },
            memory: {},
            moveTo: () => ERR_NO_PATH,
            move: () => { throw new Error("should never nudge - not on a border"); },
        };
        routing.moveToRoom(noPathCenterCreep, "W9N9", { range: 20 });
    }
}

// --- scout: room-flap guard (the cheap replacement for the reverted
// PathFinder-based reachability check above) - a sealed-off target room
// makes the native moveTo walk the creep to the border and back forever;
// isFlapping() catches that the same way utils/move.js's m.stuck and
// utils/squad.js's stuckTicks catch their own stalls: purely reactive
// tick/position bookkeeping, no pathfinding call of any kind -------------
{
    const scoutMod = require(path.join(PROJECT, "src/roles/scout"));
    const flapCreep = { room: { name: "W1N1" }, memory: {} };

    assert(scoutMod.isFlapping(flapCreep) === false,
        "a single room is never flapping");

    flapCreep.room = { name: "W1N2" };
    assert(scoutMod.isFlapping(flapCreep) === false,
        "two different rooms in a row (A, B) isn't flapping yet - could just be normal travel");

    flapCreep.room = { name: "W1N1" };
    assert(scoutMod.isFlapping(flapCreep) === false,
        "A, B, A isn't flapping yet either - needs the repeat to confirm it's not just backtracking once");

    flapCreep.room = { name: "W1N2" };
    assert(scoutMod.isFlapping(flapCreep) === true,
        "A, B, A, B - bouncing between exactly two rooms with no net progress - is flapping");

    // reaching a genuinely new third room clears it - this was real progress,
    // not a bounce
    const progressingCreep = { room: { name: "W1N1" }, memory: {} };
    scoutMod.isFlapping(progressingCreep);
    progressingCreep.room = { name: "W1N2" };
    scoutMod.isFlapping(progressingCreep);
    progressingCreep.room = { name: "W2N1" };
    assert(scoutMod.isFlapping(progressingCreep) === false,
        "reaching a third distinct room is real progress, not flapping");

    // staying in the same room tick after tick (not moving at all) never
    // flags as flapping either - the trail only grows on an actual room
    // change, so this is cheap: no bookkeeping work at all while parked
    const parkedCreep = { room: { name: "W1N1" }, memory: {} };
    for (let i = 0; i < 6; i++) {
        assert(scoutMod.isFlapping(parkedCreep) === false,
            "sitting in one room, tick after tick, is never flapping");
    }
    assert(parkedCreep.memory._roomTrail.length === 1,
        "the trail only records actual room changes, not every tick spent parked");
}

// --- planLayout(): scout dispatch + architect preview mode for a room we
// don't own -------------------------------------------------------------
{
    const scoutMod = require(path.join(PROJECT, "src/roles/scout"));
    const architectPreview = require(path.join(PROJECT, "src/rooms/architect"));
    const planStore3 = require(path.join(PROJECT, "src/utils/planStore"));

    const previewRoomName = "W9N9";
    const previewRoom = new Room(previewRoomName);
    previewRoom.find = room.find; // reuse the existing findMap-backed stub
    Game.rooms[previewRoomName] = previewRoom;

    // --- console queue ---------------------------------------------------
    global.planLayout(previewRoomName);
    assert(Memory.layoutRequests && Memory.layoutRequests[previewRoomName] === true,
        "planLayout() queues the room");
    global.layoutQueue(); // exercised for a throw, output not asserted on
    global.cancelLayout(previewRoomName);
    assert(!Memory.layoutRequests[previewRoomName],
        "cancelLayout() drops a pending request");
    global.planLayout(previewRoomName); // re-queue for the rest of this test

    // --- scout dispatch: heads toward the pending layout room, same
    // route-aware travel as the sign task -----------------------------
    let layoutMovedTo = null;
    const layoutScout = Object.assign(new Creep(), {
        id: "sc3", name: "Sc3", room, memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(20, 20, "W1N1"),
        signController: () => OK, suicide: () => OK,
        moveTo: (pos) => { layoutMovedTo = pos; return OK; },
    });
    Game.creeps.Sc3 = layoutScout;
    scoutMod.run(layoutScout);
    assert(layoutMovedTo && layoutMovedTo.roomName === previewRoomName,
        "a scout with no other task heads to the pending layout-preview room");

    // --- architect preview mode --------------------------------------
    // without preview: a room we don't own is refused, exactly like today
    architectPreview(previewRoom);
    assert(!Memory.rooms[previewRoomName].planned &&
        !planStore3.getPlan(previewRoomName),
        "architect(room) without preview still refuses to plan a room we don't own");

    // with preview: plans it fully, never creates a construction site
    const sitesBefore = (global.__sites || []).length;
    console.log = (...a) => { logs.push(a.join(" ")); }; // mute stall-guard noise
    for (let i = 0; i < 400 && !Memory.rooms[previewRoomName].planned; i++) {
        Game.time++;
        architectPreview(previewRoom, { preview: true });
    }
    console.log = origLog;
    assert(Memory.rooms[previewRoomName].planned === true,
        "architect(room, {preview:true}) completes a layout for a room we don't own");
    const previewPlan = planStore3.getPlan(previewRoomName);
    assert(previewPlan && previewPlan.buildings.length > 0,
        "the preview plan has buildings");
    assert((global.__sites || []).length === sitesBefore,
        "a layout preview never creates a real construction site");

    // --- scout dequeues once the plan is ready ------------------------
    layoutScout.room = previewRoom;
    layoutMovedTo = null;
    scoutMod.run(layoutScout);
    assert(!Memory.layoutRequests[previewRoomName],
        "the scout drops the request once the preview plan is ready");
    assert(!layoutMovedTo, "the scout doesn't keep travelling once the plan is ready");
    delete Game.creeps.Sc3; // single-scout enforcement would otherwise suicide Sc4 below

    // --- stall guard: gives up instead of camping forever if the plan
    // never finishes (e.g. CPU bucket chronically below planner.minBucket) --
    Memory.settings = Memory.settings || {};
    Memory.settings.routing = { layoutWaitLimit: 2 };
    const stalledRoomName = "W8N8";
    const stalledRoom = new Room(stalledRoomName);
    stalledRoom.find = room.find;
    Game.rooms[stalledRoomName] = stalledRoom;
    Memory.rooms[stalledRoomName] = {}; // never gets .planned - simulates a permanent stall
    global.planLayout(stalledRoomName);
    const stallScout = Object.assign(new Creep(), {
        id: "sc4", name: "Sc4", room: stalledRoom, memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(20, 20, stalledRoomName),
        signController: () => OK, suicide: () => OK, moveTo: () => OK,
    });
    Game.creeps.Sc4 = stallScout;
    scoutMod.run(stallScout); // tick 1: starts the wait clock
    assert(Memory.layoutRequests[stalledRoomName],
        "the stalled request is still pending right after arriving");
    Game.time += 5; // past the (test-lowered) wait limit
    scoutMod.run(stallScout);
    assert(!Memory.layoutRequests[stalledRoomName],
        "the scout gives up on a layout preview that never finishes and drops the request");
    delete Memory.settings.routing;
    delete Game.creeps.Sc4;

    // --- travel stall guard (ROADMAP 0060 follow-up): separate from the
    // post-arrival wait guard just above - this one covers never even
    // GETTING there (moveToRoom() now refuses a blacklisted destination
    // outright, but planLayout's travel branch never checked its return
    // value, so without this it would camp silently for the life of the
    // blacklist instead of giving up and freeing the scout for other work)
    Memory.settings.routing = { travelStallLimit: 2 };
    const unreachableRoomName = "W7N6";
    global.planLayout(unreachableRoomName);
    const travelStallScout = Object.assign(new Creep(), {
        id: "sc5b", name: "Sc5b", room, memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(20, 20, "W1N1"),
        signController: () => OK, suicide: () => OK, moveTo: () => OK,
    });
    Game.creeps.Sc5b = travelStallScout;
    Game.time++; // census.all() caches by Game.time - bust the stale scan
    // that still shows the just-deleted Sc4 (>1 "scout" would suicide this
    // new one via the census-based single-scout enforcement)
    scoutMod.run(travelStallScout); // tick 1: starts the travel clock
    assert(Memory.layoutRequests[unreachableRoomName],
        "the layout request is still pending right after starting to travel");
    Game.time += 5; // past the (test-lowered) travel stall limit
    scoutMod.run(travelStallScout);
    assert(!Memory.layoutRequests[unreachableRoomName],
        "the scout gives up on a layout destination it never reaches and drops the request");
    delete Memory.settings.routing;
    delete Game.creeps.Sc5b;

    delete Game.rooms[previewRoomName];
    delete Game.rooms[stalledRoomName];
    delete Memory.rooms[previewRoomName];
    delete Memory.rooms[stalledRoomName];
    delete Memory.rooms[unreachableRoomName];
    delete Memory.layoutRequests;
}

// --- observer takes over the scout's job (ROADMAP 0028): utils/observer.js
// (range math), structures/observer.js (on-demand priority + exploration),
// rooms/needs.js (no background scout once an observer exists), and
// roles/scout.js (skip an observer-covered room, retire instead of
// wandering) ---------------------------------------------------------------
{
    const observerUtil = require(path.join(PROJECT, "src/utils/observer"));
    const observerLogic = require(path.join(PROJECT, "src/structures/observer"));

    // --- room name <-> coords -------------------------------------------
    // (0,0) is E0S0 - the room just east/south of the map's center, where
    // all four quadrants (E/W, N/S) meet
    const origin = observerLogic.roomNameToXY("E0S0");
    assert(origin[0] === 0 && origin[1] === 0, "E0S0 is the coordinate origin");
    assert(observerLogic.xyToRoomName(0, 0) === "E0S0", "origin round-trips to E0S0");
    assert(observerLogic.xyToRoomName(-1, -1) === "W0N0",
        "crossing the 0 boundary flips E/S->W/N without a negative room number");
    const rt = observerLogic.roomNameToXY("W5S3");
    assert(observerLogic.xyToRoomName(rt[0], rt[1]) === "W5S3",
        "W5S3 round-trips through xy and back");

    // --- utils/observer: hasAnyObserver / observerFor (range) -----------
    assert(observerUtil.hasAnyObserver() === false, "no observer built yet");
    assert(observerUtil.observerFor("W1N2") === null, "nothing covered without an observer");

    let observed = null;
    const obs1 = Object.assign(new OwnedStructure(), {
        id: "obs1", my: true, structureType: STRUCTURE_OBSERVER, room,
        observeRoom: (rn) => { observed = rn; return OK; },
    });
    Game.structures.obs1 = obs1;

    assert(observerUtil.hasAnyObserver() === true, "hasAnyObserver() sees the built observer");
    assert(observerUtil.observerFor("W1N1") === obs1, "observerFor covers the observer's own room");
    assert(observerUtil.observerFor("W1N11") === obs1,
        "observerFor covers a room exactly OBSERVER_RANGE (10) away");
    assert(observerUtil.observerFor("W1N12") === null,
        "observerFor does not cover a room 1 beyond OBSERVER_RANGE");

    // --- structures/observer.js: on-demand layout requests come first ---
    Memory.rooms.W1N11 = { lastVisit: Game.time - 100 };
    Memory.layoutRequests = { W1N11: true };
    observed = null;
    observerLogic.run(obs1);
    assert(observed === "W1N11",
        "the observer serves a pending, in-range layout request before exploring");

    Memory.rooms.W1N11.planned = true; // architect finished
    observerLogic.run(obs1);
    assert(!Memory.layoutRequests.W1N11,
        "the observer dequeues a layout request once its preview plan is ready");

    Memory.layoutRequests = { W1N12: true }; // 11 away - out of range
    observed = null;
    observerLogic.run(obs1);
    assert(observed !== "W1N12",
        "the observer never observes a layout request outside its range");

    delete Memory.rooms.W1N11;
    delete Memory.layoutRequests;

    // --- console: observe(roomName, ticks=10) - plain, no-completion-
    // condition watch, lower priority than a layout request ---------------
    assert(typeof global.observe === "function", "observe() is registered on global");
    Game.time = 5000;
    global.observe("W1N11"); // default ticks
    assert(Memory.observeRequests.W1N11 === 5010,
        "observe() with no ticks arg defaults to 10 and stores an absolute expiry tick");
    delete Memory.observeRequests.W1N11;

    global.observe("W1N11", 3);
    assert(Memory.observeRequests.W1N11 === 5003, "observe() honors an explicit ticks count");

    observed = null;
    observerLogic.run(obs1);
    assert(observed === "W1N11", "the observer serves a pending observe() request");
    assert(Memory.observeRequests.W1N11 === 5003,
        "serving an observe() request doesn't consume it - only the expiry does");

    // a layout request (even for a different room) wins the tick over a
    // pending observe() request - the observer only acts once per tick
    Memory.rooms.W2N1 = {}; // not planned
    Memory.layoutRequests = { W2N1: true }; // adjacent, in range
    observed = null;
    observerLogic.run(obs1);
    assert(observed === "W2N1",
        "a pending layout request takes priority over a pending observe() request");
    assert(Memory.observeRequests.W1N11 === 5003,
        "the observe() request is untouched - not served, not consumed - while it loses the tick");
    delete Memory.layoutRequests;

    // out of range alone: skipped, not consumed, never served
    Memory.observeRequests = { W1N12: 5003 }; // 11 away
    observed = null;
    observerLogic.run(obs1);
    assert(observed !== "W1N12", "an out-of-range observe() request is never served");
    assert(Memory.observeRequests.W1N12 === 5003,
        "an out-of-range observe() request is skipped, not consumed");

    // an out-of-range request doesn't block an in-range one further down
    // the same queue
    Memory.observeRequests = { W1N12: 5003, W1N11: 5003 };
    observed = null;
    observerLogic.run(obs1);
    assert(observed === "W1N11",
        "the observer keeps looking past an out-of-range request for one it can actually serve");

    // expiry: once Game.time reaches the stored tick, it's dequeued and no
    // longer served
    Game.time = 5003;
    observerLogic.run(obs1);
    assert(!Memory.observeRequests.W1N11,
        "an observe() request is dequeued once its tick countdown is up");
    delete Memory.observeRequests;

    // --- structures/observer.js: exploration (least-recently-seen room) -
    // isolated at a coordinate with no pre-existing Memory.rooms noise
    const obs2 = Object.assign(new OwnedStructure(), {
        id: "obs2", my: true, structureType: STRUCTURE_OBSERVER,
        room: { name: "E20N20" },
        observeRoom: (rn) => { observed = rn; return OK; },
    });
    const [ox, oy] = observerLogic.roomNameToXY("E20N20");

    // the priority-scoring assertions below expect every run() call to
    // actually explore - neutralize the exploreInterval throttle (default
    // 10 ticks) for them; the throttle itself gets its own assertions
    // further down.
    Memory.settings = Memory.settings || {};
    Memory.settings.observer = { exploreInterval: 1 };

    observed = null;
    observerLogic.run(obs2);
    assert(observed !== null, "with nothing pending, the observer explores some room");
    const [tx0, ty0] = observerLogic.roomNameToXY(observed);
    assert(Math.max(Math.abs(ox - tx0), Math.abs(oy - ty0)) <= 10,
        "the explored room is within OBSERVER_RANGE");

    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -10; dy <= 10; dy++) {
            Memory.rooms[observerLogic.xyToRoomName(ox + dx, oy + dy)] = { lastVisit: 1000 };
        }
    }
    const target = observerLogic.xyToRoomName(ox + 3, oy - 4);
    delete Memory.rooms[target].lastVisit;
    observed = null;
    observerLogic.run(obs2);
    assert(observed === target,
        "a never-visited room in range wins over every already-visited one");

    Memory.rooms[target] = { lastVisit: 1 }; // now visited, but oldest by far
    observed = null;
    observerLogic.run(obs2);
    assert(observed === target,
        "with everything visited, the least-recently-visited room in range wins");

    // --- exploration priority: hostile presence weighs in, but a stale
    // enough quiet room still eventually wins - nothing goes unwatched
    // forever (ROADMAP 0031) --------------------------------------------
    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -10; dy <= 10; dy++) {
            Memory.rooms[observerLogic.xyToRoomName(ox + dx, oy + dy)] = { lastVisit: 5000 };
        }
    }
    const warmRoom = observerLogic.xyToRoomName(ox - 2, oy + 1);
    const hotRoom = observerLogic.xyToRoomName(ox + 2, oy - 1);
    Memory.rooms[warmRoom] = { lastVisit: 4990 }; // staler, no enemies -> score 13
    Memory.rooms[hotRoom] = { lastVisit: 5000, enemies: 10 }; // fresher, but armed -> score 33

    observed = null;
    observerLogic.run(obs2);
    assert(observed === hotRoom,
        "a room with more hostiles is re-observed more often than a merely stale quiet one");

    Memory.settings = Memory.settings || {};
    Memory.settings.observer = { exploreInterval: 1, militaryWeight: 0 };
    observed = null;
    observerLogic.run(obs2);
    assert(observed === warmRoom,
        "militaryWeight=0 falls back to plain least-recently-seen (staleness only)");
    Memory.settings.observer = { exploreInterval: 1 };

    const ancientRoom = observerLogic.xyToRoomName(ox - 5, oy - 5);
    Memory.rooms[ancientRoom] = { lastVisit: 1 }; // enormous staleness, no enemies
    observed = null;
    observerLogic.run(obs2);
    assert(observed === ancientRoom,
        "a room left unwatched long enough wins over a hostile-heavy one - nothing starves forever");
    delete Memory.rooms[warmRoom];
    delete Memory.rooms[hotRoom];
    delete Memory.rooms[ancientRoom];

    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -10; dy <= 10; dy++) {
            delete Memory.rooms[observerLogic.xyToRoomName(ox + dx, oy + dy)];
        }
    }

    // --- exploration throttle (observer.exploreInterval, default 10 ticks)
    // - the priority scan is real per-tick cost (a (2*OBSERVER_RANGE+1)^2
    // square of Memory.rooms lookups), so a repeat decision is throttled;
    // serveLayoutRequests/serveObserveRequests stay unthrottled (tested
    // above, both fire every call regardless).
    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -10; dy <= 10; dy++) {
            Memory.rooms[observerLogic.xyToRoomName(ox + dx, oy + dy)] = { lastVisit: 1000 };
        }
    }
    delete Memory.settings.observer; // back to the default exploreInterval (10)
    Game.time += 20; // clear of any interval window left by the tests above
    observed = null;
    observerLogic.run(obs2);
    assert(observed !== null, "an explore decision fires once the interval has elapsed");
    observed = null;
    observerLogic.run(obs2);
    assert(observed === null,
        "a repeat explore decision is throttled within observer.exploreInterval");
    Memory.settings.observer = { exploreInterval: 1 };
    observed = null;
    observerLogic.run(obs2);
    assert(observed !== null, "exploreInterval=1 explores again immediately");
    delete Memory.settings.observer;
    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -10; dy <= 10; dy++) {
            delete Memory.rooms[observerLogic.xyToRoomName(ox + dx, oy + dy)];
        }
    }
    delete Game.structures.obs2;

    // --- rooms/needs.js: no background scout once an observer exists,
    // still wants one for an on-demand task the observer can't reach ------
    Memory.signQueue = {};
    Memory.layoutRequests = {};
    Game.time++;
    assert(needs.roomNeeds(room).scout === 0,
        "with an observer and nothing pending, no background exploratory scout is wanted");

    global.signRoom("W1N1", "hi");
    Game.time++;
    assert(needs.roomNeeds(room).scout === 1,
        "a pending sign request still wants a scout - the observer can't touch a controller");
    global.signRoom("W1N1");

    Memory.layoutRequests = { W1N11: true }; // in range of obs1 (W1N1)
    Game.time++;
    assert(needs.roomNeeds(room).scout === 0,
        "a layout request the observer already covers doesn't want a scout");

    Memory.layoutRequests = { W1N12: true }; // out of range
    Game.time++;
    assert(needs.roomNeeds(room).scout === 1,
        "a layout request outside every observer's range still wants a scout");
    delete Memory.layoutRequests;
    Game.time++;

    // --- roles/scout.js: skip an observer-covered room, retire instead of
    // wandering once an observer exists -----------------------------------
    const scoutMod2 = require(path.join(PROJECT, "src/roles/scout"));
    Memory.layoutRequests = { W1N11: true, W1N12: true }; // in range, out of range
    let scoutMoved = null;
    const obsScout = Object.assign(new Creep(), {
        id: "sc5", name: "Sc5", room, memory: { role: "scout", home: "W1N1" },
        ticksToLive: 500, pos: new RoomPosition(20, 20, "W1N1"),
        signController: () => OK,
        suicide: () => { obsScout._dead = true; return OK; },
        moveTo: (pos) => { scoutMoved = pos; return OK; },
    });
    Game.creeps.Sc5 = obsScout;
    scoutMod2.run(obsScout);
    assert(scoutMoved && scoutMoved.roomName === "W1N12",
        "the scout skips the layout room the observer covers, heads to the one out of range");

    delete Memory.layoutRequests;
    Game.time++;
    scoutMoved = null;
    scoutMod2.run(obsScout);
    assert(obsScout._dead === true,
        "an idle scout retires instead of wandering once an observer exists");

    delete Game.creeps.Sc5;
    delete Game.structures.obs1;
    delete Memory.layoutRequests;
    delete Memory.signQueue.W1N1;
}

// --- ROADMAP 0056: with 2+ observers, the whole empire still only observes
// ONE room per tick total - chosen across every room any observer can
// reach, not one room per observer. Two observers far enough apart that
// their OBSERVER_RANGE squares never overlap (E60N60 / E90N60), so a room
// only one of them can reach still proves the other is being consulted. ---
{
    const observerLogic = require(path.join(PROJECT, "src/structures/observer"));
    const now = Game.time;
    // exploration assertions below expect every run() call to actually
    // explore when idle - neutralize the exploreInterval throttle (already
    // covered by its own assertions in the single-observer block above).
    Memory.settings = Memory.settings || {};
    Memory.settings.observer = { exploreInterval: 1 };

    let observed = null;
    let observedBy = null;
    const obsX = Object.assign(new OwnedStructure(), {
        id: "obsX", my: true, structureType: STRUCTURE_OBSERVER,
        room: { name: "E60N60" },
        observeRoom: (rn) => { observed = rn; observedBy = "X"; return OK; },
    });
    const obsY = Object.assign(new OwnedStructure(), {
        id: "obsY", my: true, structureType: STRUCTURE_OBSERVER,
        room: { name: "E90N60" },
        observeRoom: (rn) => { observed = rn; observedBy = "Y"; return OK; },
    });
    Game.structures.obsX = obsX;
    Game.structures.obsY = obsY;

    const [oxX, oxY] = observerLogic.roomNameToXY("E60N60");
    const [oyX, oyY] = observerLogic.roomNameToXY("E90N60");
    const farRoom = observerLogic.xyToRoomName(oyX + 5, oyY); // in obsY's range only

    // --- a layout request only obsY can reach is still served this tick,
    // even though obsX (which can't reach it) is the one that runs first --
    Memory.layoutRequests = { [farRoom]: true };
    observed = null;
    observedBy = null;
    observerLogic.run(obsX);
    assert(observed === farRoom && observedBy === "Y",
        "a layout request only one observer can reach is still served the same tick, even when a different observer runs first");

    // --- with the tick's one observation already spent, the other
    // observer's run() this same tick is a no-op ------------------------
    observed = null;
    observerLogic.run(obsY);
    assert(observed === null,
        "a second observer's run() is a no-op once another observer already acted this tick");

    // --- next tick, the guard resets and a fresh decision is made -------
    Game.time = now + 1;
    observed = null;
    observedBy = null;
    observerLogic.run(obsY);
    assert(observed === farRoom && observedBy === "Y",
        "the per-tick observation guard resets on the next tick");
    delete Memory.layoutRequests;

    // --- idle exploration considers the union of both observers' ranges -
    // fill both squares so the never-visited shortcut can't short-circuit
    // the comparison, then make one room deep in obsY's square by far the
    // stalest - it must win even though run() is called on obsX ----------
    Game.time = now + 2;
    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -10; dy <= 10; dy++) {
            Memory.rooms[observerLogic.xyToRoomName(oxX + dx, oxY + dy)] = { lastVisit: Game.time - 100 };
            Memory.rooms[observerLogic.xyToRoomName(oyX + dx, oyY + dy)] = { lastVisit: Game.time - 100 };
        }
    }
    const unionTarget = observerLogic.xyToRoomName(oyX + 3, oyY - 4);
    Memory.rooms[unionTarget] = { lastVisit: Game.time - 100000 };

    observed = null;
    observedBy = null;
    observerLogic.run(obsX);
    assert(observed === unionTarget && observedBy === "Y",
        "idle exploration with two observers picks the best room across the union of both ranges");

    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -10; dy <= 10; dy++) {
            delete Memory.rooms[observerLogic.xyToRoomName(oxX + dx, oxY + dy)];
            delete Memory.rooms[observerLogic.xyToRoomName(oyX + dx, oyY + dy)];
        }
    }
    delete Game.structures.obsX;
    delete Game.structures.obsY;
    delete Memory.settings.observer;
}

// --- determinism: replanning from the same starting state twice gives the
// same plan (no RNG / iteration-order dependence in the algorithm itself) --
{
    const architect2 = require(path.join(PROJECT, "src/rooms/architect"));
    const planStore2 = require(path.join(PROJECT, "src/utils/planStore"));

    // room.find() order is NOT guaranteed stable across ticks in real
    // Screeps - run once with sources in their normal order, once reversed,
    // to make sure that alone can't move a tower/link.
    function runFreshPlan(sourceOrder) {
        findMap[FIND_SOURCES] = sourceOrder;
        findMap[FIND_SOURCES_ACTIVE] = sourceOrder;

        const mem = global.Memory.rooms.W1N1;
        delete mem.planned;
        delete mem.planStep;
        delete mem.planStepSeen;
        delete mem.planStepTries;
        planStore2.dropPlan("W1N1");
        // a from-scratch plan can need several hundred ticks worth of
        // stampStep retries (minDepth loosens every 4 tries, up to 12 per
        // stamp) across all 13 steps - budget generously
        for (let i = 0; i < 400 && !global.Memory.rooms.W1N1.planned; i++) {
            Game.time++;
            architect2(room);
        }
        const plan = planStore2.getPlan("W1N1");
        return JSON.stringify(
            (plan ? plan.buildings : []).slice().sort((a, b) =>
                a.x - b.x || a.y - b.y ||
                a.structureType.localeCompare(b.structureType)
            )
        );
    }

    console.log = (...a) => { logs.push(a.join(" ")); }; // mute stall-guard noise
    const runA = runFreshPlan([source, source2]);
    const runB = runFreshPlan([source2, source]);
    findMap[FIND_SOURCES] = [source, source2];
    findMap[FIND_SOURCES_ACTIVE] = [source, source2];
    console.log = origLog;
    assert(
        global.Memory.rooms.W1N1.planned === true,
        "determinism check: the re-run plan completed"
    );
    assert(runA === runB,
        "planCity produces the same plan regardless of the order room.find(FIND_SOURCES) returns them in"
    );

    // --- the real bug this hunt turned up: the id->room mapping used to
    // live in Memory.settings.planSegments. A player typing
    // `Memory.settings = { profiler: true }` in the console (exactly what
    // main.js's own comment suggests) wholesale-replaces Memory.settings,
    // wiping that mapping while RawMemory.segments keeps the old payloads.
    // The next room to request a segment id could then be handed an ALREADY
    // OCCUPIED slot and silently inherit a stranger's stale plan - which
    // looks exactly like "towers/links keep landing somewhere different".
    // Fixed two ways: (1) the mapping now lives in its own Memory.planSegments
    // key, outside Memory.settings; (2) every segment is tagged with its
    // room name and getPlan() refuses a mismatched tag, so even a genuine id
    // collision can never resurface as the wrong room's plan.
    global.Memory.settings = { profiler: true }; // wholesale-reassign, like the console example
    delete global.Memory.settings.profiler;
    assert(global.Memory.settings.planSegments === undefined,
        "planSegments no longer lives under Memory.settings (so a settings reassignment can't touch it)");
    assert(
        planStore2.getPlan("W1N1") !== null &&
            planStore2.getPlan("W1N1").buildings.length > 0,
        "the room's plan survives a wholesale Memory.settings reassignment"
    );

    planStore2.setPlan("Wowner", {
        buildings: [{ x: 2, y: 2, structureType: "road", minimalRCL: 3 }],
        mincutBoundries: [],
    });
    const ownerId = planStore2.segmentId("Wowner");
    // force an unrelated, never-touched room onto the SAME segment slot -
    // simulates the mapping being rebuilt from scratch after a wipe and
    // handing out an id that's still physically occupied
    global.Memory.planSegments.Wintruder = ownerId;
    assert(planStore2.getPlan("Wintruder") === null,
        "a segment tagged for a different room never resurfaces as this room's plan (id collision safety)");
    assert(planStore2.getPlan("Wowner").buildings[0].structureType === "road",
        "the rightful owner of the segment still reads its own plan correctly");

    // --- a replan adopts already-built link/tower positions instead of
    // recomputing them (the exact report that started this hunt) ----------
    const fakeLink = Object.assign(new StructureLink(), {
        id: "reuse_link", structureType: STRUCTURE_LINK, my: true,
        pos: new RoomPosition(6, 6, "W1N1"), room, store: store(0, 800),
        isCollector: () => true,
    });
    const fakeTower = Object.assign(new OwnedStructure(), {
        id: "reuse_tower", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(7, 5, "W1N1"), room, store: store(0, 1000),
    });
    const fakeContainer = Object.assign(new StructureContainer(), {
        id: "reuse_cont", structureType: STRUCTURE_CONTAINER,
        pos: new RoomPosition(6, 5, "W1N1"), room, store: store(0, 2000),
    });
    findMap[FIND_STRUCTURES].push(fakeLink, fakeTower, fakeContainer);

    console.log = (...a) => { logs.push(a.join(" ")); };
    findMap[FIND_SOURCES] = [source, source2];
    findMap[FIND_SOURCES_ACTIVE] = [source, source2];
    const reused = runFreshPlan([source, source2]);
    console.log = origLog;

    const reusedPlan = JSON.parse(reused);
    assert(
        reusedPlan.some((b) => b.structureType === "container" && b.x === 6 && b.y === 5) &&
        reusedPlan.some((b) => b.structureType === "link" && b.x === 6 && b.y === 6) &&
        reusedPlan.some((b) => b.structureType === "tower" && b.x === 7 && b.y === 5),
        "a replan adopts the already-built container/link/tower positions next to a source instead of recomputing new ones"
    );

    findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter(
        (s) => !["reuse_link", "reuse_tower", "reuse_cont"].includes(s.id)
    );

    // --- same, but for a container/link/tower that's only a QUEUED
    // construction site, not built yet -------------------------------
    const queuedContainer = Object.assign(new ConstructionSite(), {
        id: "queued_cont", structureType: STRUCTURE_CONTAINER, my: true,
        pos: new RoomPosition(43, 8, "W1N1"), room,
    });
    const queuedLink = Object.assign(new ConstructionSite(), {
        id: "queued_link", structureType: STRUCTURE_LINK, my: true,
        pos: new RoomPosition(43, 7, "W1N1"), room,
    });
    const queuedTower = Object.assign(new ConstructionSite(), {
        id: "queued_tower", structureType: STRUCTURE_TOWER, my: true,
        pos: new RoomPosition(44, 7, "W1N1"), room,
    });
    findMap[FIND_MY_CONSTRUCTION_SITES] = [queuedContainer, queuedLink, queuedTower];

    console.log = (...a) => { logs.push(a.join(" ")); };
    const reusedQueued = runFreshPlan([source, source2]);
    console.log = origLog;

    const reusedQueuedPlan = JSON.parse(reusedQueued);
    assert(
        reusedQueuedPlan.some((b) => b.structureType === "container" && b.x === 43 && b.y === 8) &&
        reusedQueuedPlan.some((b) => b.structureType === "link" && b.x === 43 && b.y === 7) &&
        reusedQueuedPlan.some((b) => b.structureType === "tower" && b.x === 44 && b.y === 7),
        "a replan adopts a queued (not yet built) construction site's position too, not just already-built structures"
    );

    findMap[FIND_MY_CONSTRUCTION_SITES] = [];

    // --- ROADMAP 0008: the plan reaches the controller, and never paves to
    // the edge of the map unless the neighboring room is mine or already a
    // remote (0020) ------------------------------------------------------
    console.log = (...a) => { logs.push(a.join(" ")); };
    const noEdge = runFreshPlan([source, source2]);
    console.log = origLog;
    const noEdgePlan = JSON.parse(noEdge);
    assert(
        noEdgePlan.some(
            (b) =>
                b.structureType === "road" &&
                Math.max(
                    Math.abs(b.x - controller.pos.x),
                    Math.abs(b.y - controller.pos.y)
                ) <= 3
        ),
        "the plan includes a road within 3 tiles of the controller"
    );
    assert(
        !noEdgePlan.some(
            (b) =>
                b.structureType === "road" &&
                (b.x === 0 || b.x === 49 || b.y === 0 || b.y === 49)
        ),
        "no road reaches the edge of the map when no neighboring room is mine or a remote"
    );

    // W1N2 sits off exit direction 1 (top, y=0) per the Game.map.describeExits
    // stub - listing it as a remote should pave a road to that edge only
    global.Memory.rooms.W1N1.remotes = ["W1N2"];
    console.log = (...a) => { logs.push(a.join(" ")); };
    const remoteEdge = runFreshPlan([source, source2]);
    console.log = origLog;
    const remoteEdgePlan = JSON.parse(remoteEdge);
    assert(
        remoteEdgePlan.some((b) => b.structureType === "road" && b.y === 0),
        "a road reaches the top edge toward a room listed in Memory.rooms[x].remotes"
    );
    delete global.Memory.rooms.W1N1.remotes;

    // W2N1 sits off exit direction 3 (right, x=49) - a neighboring room
    // that's mine (already owned) gets the same treatment as a remote
    global.Memory.rooms.W2N1.my = true;
    console.log = (...a) => { logs.push(a.join(" ")); };
    const ownedEdge = runFreshPlan([source, source2]);
    console.log = origLog;
    const ownedEdgePlan = JSON.parse(ownedEdge);
    assert(
        ownedEdgePlan.some((b) => b.structureType === "road" && b.x === 49),
        "a road reaches the right edge toward a neighboring room that's mine"
    );
    delete global.Memory.rooms.W2N1.my;
}

// --- console command reference (help()) -------------------------------
{
    assert(typeof global.help === "function", "help() is registered on global");
    const helpLogs = [];
    console.log = (...a) => { helpLogs.push(a.join(" ")); };
    global.help();
    console.log = origLog;
    const helpOutput = helpLogs.join("\n");
    assert(
        ["replanRoom", "prioritizeBuild", "addAlly", "listAlly", "signRoom", "GCStructureMemory",
            "reserveRoom", "unreserveRoom", "claimRoom", "cancelClaim", "planLayout", "cancelLayout", "layoutQueue", "observe",
            "addTargetEnemy", "removeTargetEnemy", "listTargetEnemies", "raidRoom", "raidSquad", "raidRemote",
            "contestRoom", "cancelContest", "pioneerStatus"]
            .every((name) => helpOutput.includes(name)),
        "help() lists the known console commands"
    );
}

// --- rooms/pioneering.js + roles/pioneer.js (ROADMAP 0037) -------------
{
    const pioneeringMod = require(path.join(PROJECT, "src/rooms/pioneering"));
    const pioneerMod = require(path.join(PROJECT, "src/roles/pioneer"));

    function mkOwnedRoom(name, hasSpawnFlag) {
        const structs = hasSpawnFlag
            ? [Object.assign(new Spawn(), {
                  id: name + "_spawn", structureType: STRUCTURE_SPAWN, my: true,
                  pos: new RoomPosition(25, 25, name),
              })]
            : [];
        return {
            name, controller: { my: true },
            find: (type, opts) => {
                let list = type === FIND_STRUCTURES ? structs : [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            },
        };
    }

    // --- isSpawnless() --------------------------------------------------
    const pMother = mkOwnedRoom("PMother", true);
    const pMother2 = mkOwnedRoom("PMother2", true);
    const pNew = mkOwnedRoom("PNew", false);
    assert(!pioneeringMod.isSpawnless(pMother), "a room with a spawn is not spawnless");
    assert(pioneeringMod.isSpawnless(pNew), "an owned room with zero spawns is spawnless");

    // --- spawnlessRooms() / mothersFor() ---------------------------------
    // Two candidate mothers in range of the same spawnless room - every
    // owned room with a spawn helps, not just the single closest one.
    const realMyRooms = Game.myRooms;
    Game.myRooms = [pMother, pMother2, pNew];
    Memory.rooms.PNew = { enemies: 0 };
    Memory.rooms.PMother = {};
    Memory.rooms.PMother2 = {};
    Game.time++;

    const spawnless = pioneeringMod.spawnlessRooms().map((r) => r.name);
    assert(spawnless.indexOf("PNew") !== -1 && spawnless.indexOf("PMother") === -1,
        "spawnlessRooms() lists only the owned room without a spawn");

    const rescuers = pioneeringMod.mothersFor("PNew").map((r) => r.name);
    assert(rescuers.indexOf("PMother") !== -1 && rescuers.indexOf("PMother2") !== -1,
        "mothersFor() lists EVERY owned room with a spawn in range, not just the nearest one");

    // out of range - the default findRoute stub gives every distinct pair
    // distance 1, so force a route far beyond pioneer.maxDistance (30)
    const realFindRoute = Game.map.findRoute;
    Game.map.findRoute = () => _.range(40).map(() => ({ exit: 1, room: "Wfar" }));
    Game.time++;
    assert(pioneeringMod.mothersFor("PNew").length === 0,
        "mothersFor() is empty when every candidate is beyond pioneer.maxDistance");
    Game.map.findRoute = realFindRoute;
    Game.time++;

    // a hostile-held target room is never assigned help
    Memory.rooms.PNew.enemies = 1;
    assert(pioneeringMod.spawnlessRooms().map((r) => r.name).indexOf("PNew") === -1,
        "a spawnless room with a hostile visible is not rescued yet");
    Memory.rooms.PNew.enemies = 0;

    // --- pioneersWanted() / nextTarget() ---------------------------------
    // Each mother independently wants its own pioneer.maxConcurrent (2) -
    // one mother already having pioneers out doesn't reduce what the OTHER
    // mother wants, since the cap is per (mother, target) pair.
    Game.time++;
    assert(pioneeringMod.pioneersWanted(pMother) === 2,
        "pioneersWanted() defaults to pioneer.maxConcurrent (2) with nobody assigned yet");
    assert(pioneeringMod.pioneersWanted(pMother2) === 2,
        "a second mother in range wants its own 2 pioneers too - the cap isn't shared across mothers");
    assert(pioneeringMod.nextTarget(pMother) === "PNew",
        "nextTarget() picks the assigned spawnless room");

    // --- end-to-end through rooms/needs.js + roles/pioneer.js -----------
    // Exercises the exact path rooms/spawning.js uses (roomNeeds(room).pioneer
    // -> pioneer.wanted()/spawn()) instead of calling pioneering.pioneersWanted()
    // directly - a real bug (pioneer computed in compute() but never added to
    // the returned object, so roomNeeds().pioneer was always undefined and
    // `0 < undefined` is false) shipped past every other assertion here
    // because none of them went through needs.js's actual return value.
    assert(needs.roomNeeds(pMother).pioneer === 2,
        "roomNeeds(motherRoom).pioneer matches pioneersWanted() (catches the field being dropped from compute()'s return)");
    assert(pioneerMod.wanted(pMother) === 2,
        "pioneer.wanted() reads the same value through roomNeeds()");
    assert(pioneerMod.spawn(pMother) === true,
        "pioneer.spawn() returns true when under the wanted count (0 pioneers < 2 wanted)");

    Game.creeps.PioneeringTest1 = Object.assign(Object.create(Creep.prototype), {
        memory: { role: "pioneer", targetRoom: "PNew", home: "PMother" },
        room: { name: "PMother" },
    });
    Game.time++;
    assert(pioneeringMod.pioneersWanted(pMother) === 1,
        "pioneersWanted() subtracts pioneers already assigned BY this mother");
    assert(pioneeringMod.pioneersWanted(pMother2) === 2,
        "a pioneer PMother already sent doesn't count against PMother2's own cap - each mother tracks its own contribution");
    delete Game.creeps.PioneeringTest1;

    Memory.rooms.PMother.defenseActive = true;
    Game.time++;
    assert(pioneeringMod.pioneersWanted(pMother) === 0,
        "pioneersWanted() is zero while the mother room itself is under attack");
    delete Memory.rooms.PMother.defenseActive;

    // pioneerStatus() console command - read-only trace, must never throw
    assert(typeof global.pioneerStatus === "function", "pioneerStatus() is registered on global");
    const pioneerStatusLogsBefore = logs.length;
    console.log = (...a) => { logs.push(a.join(" ")); };
    let pioneerStatusThrew = false;
    try { global.pioneerStatus(); } catch (e) { pioneerStatusThrew = true; }
    console.log = origLog;
    assert(!pioneerStatusThrew, "pioneerStatus() runs without throwing");
    assert(logs.slice(pioneerStatusLogsBefore).some((l) => l.includes("PNew")),
        "pioneerStatus() reports the spawnless room by name");

    // --- pioneer: autoscale grow/shrink beyond pioneer.maxConcurrent ------
    // (ROADMAP 0041) PMother's own cap (pioneer.maxConcurrent, 2) already
    // caps pioneersWanted() - hasPendingTarget() is the UNCAPPED "is there
    // still a real job" signal the autoscale grow criterion needs to
    // justify pushing past that cap while home also has energy to spare.
    // RCL8 keeps upgrader out of this room's growth contention (it shares
    // roomEnergySurplus with pioneer and is registered first, so it would
    // otherwise win every tie).
    const pioneerBase = needs.roomNeeds(pMother).pioneer;
    assert(pioneerBase === 2,
        "sanity: base tier is pioneer.maxConcurrent with nobody assigned yet");

    pMother.controller.level = 8;
    pMother.controller.ticksToDowngrade = 200000;
    pMother.energyAvailable = 300;
    pMother.energyCapacityAvailable = 300;
    pMother.storage = { store: { [RESOURCE_ENERGY]: 1000000, getFreeCapacity: () => 0 } };
    Memory.rooms.PMother.autoscale = { delta: {}, lastAdjustTick: Game.time };
    Game.time++;
    assert(needs.roomNeeds(pMother).pioneer === pioneerBase,
        "eligible, but the room's autoscale cooldown hasn't elapsed yet");

    Game.time += 30000;
    assert(needs.roomNeeds(pMother).pioneer === pioneerBase + 1,
        "a pending target (PNew) plus real surplus at home -> pioneer steps up by 1 beyond pioneer.maxConcurrent");

    // PNew is still a pending target (still spawnless, base tier unchanged
    // at pioneer.maxConcurrent), but home no longer has a surplus to spare
    // -> the extra step comes back. (Making PNew itself ineligible instead
    // would zero pioneersWanted()'s own base tier too, since it shares the
    // same target list - that would test the base formula, not autoscale.)
    pMother.storage.store.getFreeCapacity = () => 500000;
    Memory.rooms.PMother.autoscale.lastAdjustTick = Game.time - 30000;
    Game.time += 1;
    assert(needs.roomNeeds(pMother).pioneer === pioneerBase,
        "home no longer has a surplus to spare -> the autoscaled extra pioneer is given back");

    delete pMother.storage;
    pMother.energyAvailable = undefined;
    pMother.energyCapacityAvailable = undefined;
    delete pMother.controller.level;
    delete pMother.controller.ticksToDowngrade;
    delete Memory.rooms.PMother.autoscale;

    // --- autoscale tie-break: pioneer outranks upgrader (ROADMAP 0042) ---
    // Both share roomEnergySurplus; pioneer additionally needs a pending
    // target, upgrader additionally needs RCL < 8. Leaving RCL unset (so
    // upgrader's own gate doesn't block it either) makes both genuinely
    // tied - confirms the registration order in rooms/needs.js (pioneer
    // before upgrader), not accidental luck, decides who gets the step.
    pMother.energyAvailable = 300;
    pMother.energyCapacityAvailable = 300;
    pMother.storage = { store: { [RESOURCE_ENERGY]: 1000000, getFreeCapacity: () => 0 } };
    Memory.rooms.PMother.autoscale = { delta: {}, lastAdjustTick: Game.time - 30000 };
    Game.time++;
    needs.roomNeeds(pMother);
    assert((Memory.rooms.PMother.autoscale.delta.pioneer || 0) === 1,
        "pioneer and upgrader tie on the same grow window -> pioneer wins (registered first)");
    assert(!Memory.rooms.PMother.autoscale.delta.upgrader,
        "...and upgrader does not also get a step in that same window");

    delete pMother.storage;
    pMother.energyAvailable = undefined;
    pMother.energyCapacityAvailable = undefined;
    delete Memory.rooms.PMother.autoscale;

    Game.myRooms = realMyRooms;
    delete Memory.rooms.PNew;
    delete Memory.rooms.PMother;
    delete Memory.rooms.PMother2;

    // --- roles/pioneer.js: run() -----------------------------------------
    const homeRoomName = "PHome";
    const targetRoomName = "PTarget";

    function mkRoom(name, opts) {
        opts = opts || {};
        return {
            name,
            energyAvailable: 300, energyCapacityAvailable: 300,
            controller: { my: true },
            find: (type, findOpts) => {
                let list = [];
                if (type === FIND_STRUCTURES) list = opts.structures || [];
                if (type === FIND_MY_CONSTRUCTION_SITES) list = opts.sites || [];
                if (type === FIND_SOURCES) list = opts.sources || [];
                if (findOpts && typeof findOpts.filter === "function") list = list.filter(findOpts.filter);
                return list;
            },
        };
    }

    // RoomPosition.findClosestByRange only understands an array in this test
    // harness (see the shared RoomPosition._closest above) - real Screeps
    // also accepts a FIND_* constant and searches the room. pioneer.js's
    // local-mining comparison needs that second form for FIND_SOURCES, so
    // patch it onto one position instance rather than the shared prototype
    // (every other fixture in this file relies on the array-only default).
    function withSourceLookup(pos, sources) {
        pos.findClosestByRange = (a, findOpts) => {
            if (a === FIND_SOURCES) {
                let list = sources;
                if (findOpts && typeof findOpts.filter === "function") list = list.filter(findOpts.filter);
                return RoomPosition.prototype._closest.call(pos, list, {});
            }
            return RoomPosition.prototype.findClosestByRange.call(pos, a, findOpts);
        };
        return pos;
    }

    function mkPioneerCreep(opts) {
        let moveToArg = null, withdrawn = null, built = null, suicided = false;
        let harvested = null;
        const cap = opts.capacity !== undefined ? opts.capacity : 100;
        const energyNow = opts.energy || 0;
        const creepStore = {
            [RESOURCE_ENERGY]: energyNow,
            getFreeCapacity: () => cap - energyNow,
            getCapacity: () => cap,
        };
        const creep = Object.assign(Object.create(Creep.prototype), {
            id: "pioneertest_" + Math.random(),
            name: "PioneerTest" + Math.random(),
            room: opts.room,
            pos: opts.pos,
            store: creepStore,
            body: opts.body || [{ type: WORK }, { type: CARRY }, { type: MOVE }],
            memory: { role: "pioneer", targetRoom: opts.targetRoom, home: opts.home },
            moveTo: (t, o) => { moveToArg = { t, o }; return OK; },
            withdraw: (t) => { withdrawn = t; return OK; },
            build: (t) => { built = t; return OK; },
            harvest: (t) => { harvested = t; return OK; },
            suicide: () => { suicided = true; return OK; },
        });
        return {
            creep,
            movedTo: () => moveToArg, withdrew: () => withdrawn,
            built: () => built, retired: () => suicided,
            harvested: () => harvested,
        };
    }

    Game.time++;
    let pc = mkPioneerCreep({
        room: mkRoom("Nowhere"), pos: new RoomPosition(25, 25, "Nowhere"),
        targetRoom: undefined, home: undefined,
    });
    pioneerMod.run(pc.creep);
    assert(pc.retired(), "pioneer with no targetRoom/home retires immediately");

    const targetWithSpawn = mkRoom(targetRoomName, {
        structures: [Object.assign(new Spawn(), {
            id: "tspawn1", structureType: STRUCTURE_SPAWN, my: true,
            pos: new RoomPosition(25, 25, targetRoomName),
        })],
    });
    Game.time++;
    pc = mkPioneerCreep({
        room: targetWithSpawn, pos: new RoomPosition(25, 25, targetRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 50,
    });
    pioneerMod.run(pc.creep);
    assert(!pc.retired(),
        "pioneer does NOT retire once the target room already has a real spawn - it keeps working");
    assert(pc.creep.memory.role === "bootstrap",
        "pioneer relabels itself into a bootstrap once the target room's spawn is real, instead of retiring");
    assert(pc.creep.memory.targetRoom === undefined && pc.creep.memory.home === undefined,
        "pioneer-specific memory (targetRoom/home) is cleared once converted to bootstrap");

    const farPile = Object.assign(new StructureContainer(), {
        id: "farpile1", structureType: STRUCTURE_CONTAINER,
        pos: new RoomPosition(40, 40, homeRoomName), store: store(500, 2000),
    });
    Game.time++;
    pc = mkPioneerCreep({
        room: mkRoom(homeRoomName, { structures: [farPile] }),
        pos: new RoomPosition(25, 25, homeRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 0,
    });
    pioneerMod.run(pc.creep);
    assert(pc.movedTo() && !pc.withdrew(),
        "pioneer not yet full moves toward a distant energy pile in the home room");

    const nearPile = Object.assign(new StructureContainer(), {
        id: "nearpile1", structureType: STRUCTURE_CONTAINER,
        pos: new RoomPosition(26, 25, homeRoomName), store: store(500, 2000),
    });
    Game.time++;
    pc = mkPioneerCreep({
        room: mkRoom(homeRoomName, { structures: [nearPile] }),
        pos: new RoomPosition(25, 25, homeRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 0,
    });
    pioneerMod.run(pc.creep);
    assert(pc.withdrew() && pc.withdrew().id === "nearpile1",
        "pioneer withdraws once adjacent to an energy pile in the home room");

    Game.time++;
    pc = mkPioneerCreep({
        room: mkRoom(homeRoomName), pos: new RoomPosition(25, 25, homeRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 100,
    });
    pioneerMod.run(pc.creep);
    assert(pc.movedTo() && pc.movedTo().t.roomName === targetRoomName,
        "a full pioneer leaves the home room and heads for the target room");

    const targetNoSpawn = mkRoom(targetRoomName, {});
    Game.time++;
    pc = mkPioneerCreep({
        room: targetNoSpawn, pos: new RoomPosition(25, 25, targetRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 0,
    });
    pioneerMod.run(pc.creep);
    assert(pc.movedTo() && pc.movedTo().t.roomName === homeRoomName,
        "an empty pioneer heads back home for a refill when the target's spawn still isn't built");

    Game.time++;
    pc = mkPioneerCreep({
        room: targetNoSpawn, pos: new RoomPosition(10, 10, targetRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 50,
    });
    pioneerMod.run(pc.creep);
    assert(pc.movedTo() && !pc.built(),
        "pioneer waits near the room center when architect.js hasn't placed the spawn site yet");

    const spawnSite = Object.assign(new ConstructionSite(), {
        id: "spawnsite1", structureType: STRUCTURE_SPAWN,
        pos: new RoomPosition(25, 25, targetRoomName), my: true,
    });
    const targetWithSite = mkRoom(targetRoomName, { sites: [spawnSite] });
    Game.time++;
    pc = mkPioneerCreep({
        room: targetWithSite, pos: new RoomPosition(5, 5, targetRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 50,
    });
    pioneerMod.run(pc.creep);
    assert(pc.movedTo() && pc.movedTo().o.range === 3 && !pc.built(),
        "pioneer moves toward a distant spawn construction site");

    Game.time++;
    pc = mkPioneerCreep({
        room: targetWithSite, pos: new RoomPosition(24, 24, targetRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 50,
    });
    pioneerMod.run(pc.creep);
    assert(pc.built() === spawnSite && !pc.movedTo(),
        "pioneer builds the spawn construction site once in range");

    // --- ROADMAP 0043: spawn built but other sites still pending -> keep
    // building instead of converting to bootstrap right away -------------
    const builtSpawn = Object.assign(new Spawn(), {
        id: "tspawn2", structureType: STRUCTURE_SPAWN, my: true,
        pos: new RoomPosition(25, 25, targetRoomName),
    });
    const otherSite = Object.assign(new ConstructionSite(), {
        id: "othersite1", structureType: STRUCTURE_EXTENSION,
        pos: new RoomPosition(25, 26, targetRoomName), my: true,
    });
    const targetSpawnPlusSite = mkRoom(targetRoomName, {
        structures: [builtSpawn], sites: [otherSite],
    });
    Game.time++;
    pc = mkPioneerCreep({
        room: targetSpawnPlusSite, pos: new RoomPosition(25, 26, targetRoomName),
        targetRoom: targetRoomName, home: homeRoomName, energy: 50,
    });
    pioneerMod.run(pc.creep);
    assert(pc.creep.memory.role === "pioneer",
        "spawn built but another site remains: pioneer keeps working instead of becoming bootstrap");
    assert(pc.built() === otherSite,
        "spawn built but another site remains: pioneer builds it instead");

    // once every site is gone (from the earlier "does NOT retire" fixture,
    // targetWithSpawn has zero sites) the original conversion-to-bootstrap
    // behavior above still holds - see "pioneer relabels itself into a
    // bootstrap" further up.

    // --- ROADMAP 0043: empty-handed in the target room compares mining a
    // source right here against the round trip home, and takes whichever is
    // faster -------------------------------------------------------------
    const localSource = Object.assign(new Source(), {
        id: "localsource1", energy: 3000,
        pos: new RoomPosition(25, 25, targetRoomName),
    });
    const targetWithSource = mkRoom(targetRoomName, { sites: [spawnSite] });
    const realFindRouteForPioneer = Game.map.findRoute;
    // home is far (40 hops) - a nearby source easily beats that round trip
    Game.map.findRoute = () => _.range(40).map(() => ({ exit: 1, room: "Wfar" }));
    Game.time++;
    pc = mkPioneerCreep({
        room: targetWithSource,
        pos: withSourceLookup(new RoomPosition(24, 25, targetRoomName), [localSource]),
        targetRoom: targetRoomName, home: homeRoomName, energy: 0,
    });
    pioneerMod.run(pc.creep);
    assert(pc.harvested() === localSource && !pc.movedTo() && !pc.creep.memory.returning,
        "empty-handed with a nearby source and a far home: mines locally instead of heading home");
    assert(pc.creep.memory.miningLocal === true,
        "the local-mining decision is latched (memory.miningLocal) so it doesn't re-derive every tick");

    // same nearby source and home a single hop away, but a much bigger tank
    // to fill (500) - topping it off locally now takes longer than the
    // round trip, so fetching from home wins instead
    Game.map.findRoute = (from, to) => (from === to ? [] : [{ exit: 1, room: to }]);
    Game.time++;
    pc = mkPioneerCreep({
        room: targetWithSource,
        pos: withSourceLookup(new RoomPosition(24, 25, targetRoomName), [localSource]),
        targetRoom: targetRoomName, home: homeRoomName, energy: 0, capacity: 500,
    });
    pioneerMod.run(pc.creep);
    assert(!pc.harvested() && pc.creep.memory.returning === true,
        "empty-handed with a big tank and home just one hop away: heads home instead of mining locally");

    Game.map.findRoute = realFindRouteForPioneer;
}

// --- ROADMAP 0045: idle-spawn creep renewal + CPU bucket pixel generation
{
    const spawning = require(path.join(PROJECT, "src/rooms/spawning"));

    const renewSpawn = Object.assign(new Spawn(), {
        id: "renewspawn1", structureType: STRUCTURE_SPAWN, my: true, spawning: null,
        pos: new RoomPosition(25, 25, "W1N1"), room, store: store(900, 1000),
    });
    let renewedWith = null;
    renewSpawn.renewCreep = (c) => { renewedWith = c; renewSpawn.store[RESOURCE_ENERGY] -= 50; return OK; };

    function mkRenewCandidate(id, body) {
        const name = "RenewCand_" + id;
        global.Memory.creeps[name] = { role: "hauler" };
        const c = Object.assign(new Creep(), {
            id, name, room, pos: new RoomPosition(25, 26, "W1N1"),
            ticksToLive: 100, body, hits: 100, hitsMax: 100,
        });
        Object.defineProperty(c, "memory", { get: () => global.Memory.creeps[name] });
        Game.creeps[name] = c;
        return c;
    }
    function dropRenewCandidate(id) {
        delete Game.creeps["RenewCand_" + id];
        delete global.Memory.creeps["RenewCand_" + id];
    }

    room.energyAvailable = 900;
    room.energyCapacityAvailable = 1000; // 90% - above the 0.8 floor

    // (a) an expensive, near-death creep adjacent to an idle spawn gets
    // renewed - 10 CARRY + 10 MOVE = 1000 energy, right at the floor
    const expensiveBody = _.range(10).map(() => ({ type: CARRY }))
        .concat(_.range(10).map(() => ({ type: MOVE })));
    // totalSpawns=2 with this single spawn idle => 1 of 2 busy (50%),
    // right at the minBusySpawnRatio floor, so these cases still exercise
    // the cost/energy checks below it
    const expensive = mkRenewCandidate("r1", expensiveBody);
    Game.time++;
    let idle = spawning.renewIdleSpawns(room, [renewSpawn], 2);
    assert(renewedWith === expensive,
        "an idle spawn renews an adjacent expensive dying creep instead of letting it die");
    assert(idle.length === 0,
        "a spawn that renews this tick is excluded from the same tick's spawn queue");
    dropRenewCandidate("r1");

    // (b) a cheap creep next to the same spawn is never renewed
    renewedWith = null;
    const cheap = mkRenewCandidate("r2", [{ type: MOVE }, { type: CARRY }]); // 100 energy
    Game.time++;
    idle = spawning.renewIdleSpawns(room, [renewSpawn], 2);
    assert(renewedWith === null, "a cheap creep next to an idle spawn is not renewed");
    assert(idle.length === 1, "a spawn with nothing worth renewing stays in the idle list");
    dropRenewCandidate("r2");

    // (c) below the energy ratio floor, no renewal fires even for a
    // qualifying creep
    renewedWith = null;
    room.energyAvailable = 200; // 20% of 1000 - below the 0.8 floor
    mkRenewCandidate("r3", expensiveBody);
    Game.time++;
    spawning.renewIdleSpawns(room, [renewSpawn], 2);
    assert(renewedWith === null, "renewal never fires below the room's energy ratio floor");
    dropRenewCandidate("r3");
    room.energyAvailable = 900;
    room.energyCapacityAvailable = 1000; // restore for the busy-ratio check below

    // (d) below the busy-spawn-ratio floor, no renewal fires even for a
    // qualifying creep with plenty of energy - a single-spawn room where
    // that spawn is idle is 0% busy, well under the 50% floor
    renewedWith = null;
    mkRenewCandidate("r4", expensiveBody);
    Game.time++;
    idle = spawning.renewIdleSpawns(room, [renewSpawn], 1);
    assert(renewedWith === null,
        "renewal never fires when fewer than half the room's spawns are busy spawning");
    assert(idle.length === 1, "the spawn stays in the idle list when renewal doesn't fire");
    dropRenewCandidate("r4");
    room.energyAvailable = 300;
    room.energyCapacityAvailable = 300; // restore the shared default other tests expect

    // --- pixel generation --------------------------------------------------
    const mainForPixel = require(path.join(PROJECT, "src/main"));
    let pixelCalls = 0;
    Game.cpu.generatePixel = () => { pixelCalls++; };

    Game.cpu.bucket = 10000;
    let before = pixelCalls;
    console.log = (...a) => { logs.push(a.join(" ")); };
    mainForPixel.loop();
    console.log = origLog;
    assert(pixelCalls === before + 1, "a full CPU bucket generates a pixel every tick");

    Game.cpu.bucket = 9999;
    before = pixelCalls;
    console.log = (...a) => { logs.push(a.join(" ")); };
    mainForPixel.loop();
    console.log = origLog;
    assert(pixelCalls === before, "generatePixel() is not called below the bucket threshold");

    Game.cpu.bucket = 10000; // restore the shared default
    delete Game.cpu.generatePixel;

    // --- console: profile(ticks) enables itself, then turns itself back off
    const mainForProfiler = require(path.join(PROJECT, "src/main"));

    delete Memory.settings;
    global.profile(3);
    assert(Memory.settings.profiler === true,
        "profile(ticks) turns Memory.settings.profiler on");
    assert(Memory.profiler && Memory.profiler.type === "profile",
        "profile(ticks) writes a profile-type session to Memory.profiler");
    const disableTick = Memory.profiler.disableTick;
    assert(disableTick === Game.time + 3,
        "profile(ticks) schedules disableTick 3 ticks ahead of the call");

    const logsBefore = logs.length;
    console.log = (...a) => { logs.push(a.join(" ")); };
    mainForProfiler.loop(); // first tick after the call: wraps prototypes
    const profilerBuilt = Game.profiler && typeof Game.profiler.profile === "function";
    Game.time++;

    // run through the disableTick itself (screeps-profiler prints its report
    // there), plus one more tick for maybeAutoDisableProfiler() to notice the
    // window closed and flip the setting back off
    while (Game.time <= disableTick + 1) {
        mainForProfiler.loop();
        Game.time++;
    }
    console.log = origLog;

    assert(profilerBuilt, "the tick after profile() call builds Game.profiler");
    assert(logs.slice(logsBefore).some((l) => l.indexOf("calls") !== -1 && l.indexOf("function") !== -1),
        "profile(ticks) prints a calls/time/avg report on the disableTick");
    assert(Memory.settings.profiler === false,
        "profile(ticks) turns Memory.settings.profiler back off once its window closes");
    assert(Memory.profiler === null,
        "profile(ticks) clears Memory.profiler once its window closes");
}

// --- ROADMAP 0046: contestRoom() - siege an already-claimed/reserved room
{
    const reserverMod2 = require(path.join(PROJECT, "src/roles/reserver"));

    delete Memory.rooms.W8N8;
    delete Memory.contestTarget;

    global.contestRoom("W8N8");
    assert(!Memory.contestTarget, "contestRoom() refuses an unscouted room");

    Memory.rooms.W8N8 = { lastVisit: Game.time };
    global.contestRoom("W8N8");
    assert(!Memory.contestTarget,
        "contestRoom() refuses a room with no owner/reservation (neutral)");

    global.addTargetEnemy("Warbot9");
    Memory.rooms.W8N8.owner = "Warbot9";
    global.addAlly("Warbot9"); // also an ally now - the ally check must win over targetEnemies
    global.contestRoom("W8N8");
    assert(!Memory.contestTarget,
        "contestRoom() refuses a room owned by an ally, even if also a targetEnemy");
    global.removeAlly("Warbot9");

    delete Memory.rooms.W8N8.owner;
    Memory.rooms.W8N8.reservation = { username: "NotListed", ticksToEnd: 3000 };
    global.contestRoom("W8N8");
    assert(!Memory.contestTarget,
        "contestRoom() refuses a room reserved by a player not in targetEnemies");

    Memory.rooms.W8N8.reservation.username = "Warbot9"; // in targetEnemies (added above)
    Memory.rooms.W8N8.hasController = false;
    global.contestRoom("W8N8");
    assert(!Memory.contestTarget, "contestRoom() refuses a room with no controller");
    delete Memory.rooms.W8N8.hasController;

    global.contestRoom("W8N8");
    assert(
        Memory.contestTarget &&
            Memory.contestTarget.room === "W8N8" &&
            Memory.contestTarget.from === "W1N1",
        "contestRoom() records a pending contest"
    );

    global.contestRoom("W8N8");
    assert(Memory.contestTarget.room === "W8N8",
        "a second contestRoom() call is ignored while one is already pending");
    delete Memory.contestTarget;

    // --- travel budget: too far for a CLAIM creep's 600-tick lifetime -----
    const realFindRouteContest = Game.map.findRoute;
    Game.map.findRoute = (from, to) =>
        to === "W8N8"
            ? _.range(20).map(() => ({ exit: 1, room: "Wfar" }))
            : realFindRouteContest(from, to);
    Game.time++;
    global.contestRoom("W8N8");
    assert(!Memory.contestTarget,
        "contestRoom() refuses a target too far for a CLAIM creep to survive the trip");
    Game.map.findRoute = realFindRouteContest;
    Game.time++;

    global.contestRoom("W8N8");
    assert(Memory.contestTarget && Memory.contestTarget.room === "W8N8",
        "contestRoom() succeeds again once the route is back to normal");

    // --- cancelContest() ----------------------------------------------------
    const logsBeforeCancel = logs.length;
    console.log = (...a) => { logs.push(a.join(" ")); };
    global.cancelContest();
    console.log = origLog;
    assert(!Memory.contestTarget, "cancelContest() clears a pending contest");
    assert(logs.slice(logsBeforeCancel).some((l) => l.includes("cancelled")),
        "cancelContest() logs the cancellation");

    global.removeTargetEnemy("Warbot9");
    delete Memory.rooms.W8N8;

    // --- reserver.run() "contest" mission -----------------------------------
    const contestController = Object.assign(new RoomObject(), {
        id: "contestctrl1", owner: { username: "Warbot9" }, reservation: undefined,
        pos: new RoomPosition(25, 25, "ContestRoom"),
    });
    let attackCalls = 0, claimCalls2 = 0;
    const contestCreep = Object.assign(Object.create(Creep.prototype), {
        id: "contestc1",
        room: { name: "ContestRoom", controller: contestController },
        pos: new RoomPosition(20, 20, "ContestRoom"),
        memory: { role: "reserver", mission: "contest", targetRoom: "ContestRoom", home: "W1N1" },
        attackController: () => { attackCalls++; return OK; },
        claimController: () => { claimCalls2++; return OK; },
        moveTo: () => OK,
    });
    Memory.contestTarget = { room: "ContestRoom", from: "W1N1" };

    reserverMod2.run(contestCreep);
    assert(attackCalls === 1 && claimCalls2 === 0,
        "reserver 'contest' mission attacks the controller while it's still owned/reserved");
    assert(Memory.contestTarget && Memory.contestTarget.room === "ContestRoom",
        "attacking an owned/reserved controller never ends the contest mission");

    contestController.owner = undefined; // controller just went neutral
    reserverMod2.run(contestCreep);
    assert(claimCalls2 === 1 && attackCalls === 1,
        "reserver 'contest' mission switches to claimController once the controller is neutral");
    assert(!Memory.contestTarget,
        "a successful claimController() closes the contest mission");
}

// --- ROADMAP 0047: combat squad clears hostile structures, then goes home
{
    const squadMod2 = require(path.join(PROJECT, "src/utils/squad"));
    const strikerMod2 = require(path.join(PROJECT, "src/roles/defenderStriker"));

    // --- missionComplete() --------------------------------------------------
    Memory.rooms.CombatRoom = { enemies: 1, enemyStructures: 1 };
    assert(squadMod2.missionComplete({ mission: "combat", room: "CombatRoom" }) === false,
        "missionComplete('combat') is false with hostile creeps AND structures present");
    Memory.rooms.CombatRoom.enemies = 0;
    assert(squadMod2.missionComplete({ mission: "combat", room: "CombatRoom" }) === false,
        "missionComplete('combat') is false with a hostile structure still standing");
    Memory.rooms.CombatRoom.enemyStructures = 0;
    assert(squadMod2.missionComplete({ mission: "combat", room: "CombatRoom" }) === true,
        "missionComplete('combat') is true once both creeps and structures are clear");

    Memory.rooms.CombatRoom.enemies = 3; // "siege" doesn't care about creeps
    Memory.rooms.CombatRoom.enemyStructures = 0;
    assert(squadMod2.missionComplete({ mission: "siege", room: "CombatRoom" }) === true,
        "missionComplete('siege') only cares about hostile structures, not creeps");

    // --- advance(): heads home once nothing is left to fight ---------------
    const csLead = Object.assign(Object.create(Creep.prototype), {
        id: "csLead", pos: new RoomPosition(25, 25, "CombatRoom"),
        room: { name: "CombatRoom", find: () => [] },
        hits: 100, hitsMax: 100, memory: {}, moveTo: noop, move: noop,
    });
    REG.csLead = csLead;
    Memory.squads = {
        csq1: {
            mission: "combat", room: "CombatRoom", from: "W1N1",
            target: { room: "CombatRoom" }, members: ["csLead"], leader: "csLead",
            shape: "block", state: "advancing",
        },
    };
    Memory.rooms.CombatRoom = { enemies: 0, enemyStructures: 0, exits: {} };
    Game.time++;
    squadMod2.advance(csLead, "csq1");
    assert(
        Memory.squads.csq1.state === "retreating" && Memory.squads.csq1.target.room === "W1N1",
        "a squad with nothing left to fight heads home instead of idling"
    );
    delete Memory.squads;
    delete REG.csLead;

    // --- defenderStriker squad mode: structure mop-up -----------------------
    const hostileTower = Object.assign(new OwnedStructure(), {
        id: "hostileTower1", structureType: STRUCTURE_TOWER, hits: 500, hitsMax: 500,
        my: false, pos: new RoomPosition(25, 25, "CombatRoom"),
    });
    let strikerAttacked = null;
    const strikerCreep2 = Object.assign(Object.create(Creep.prototype), {
        id: "combatStriker1", memory: { squadId: "csq2" },
        room: {
            name: "CombatRoom",
            find: (type, opts) => {
                let list = type === FIND_HOSTILE_STRUCTURES ? [hostileTower] : [];
                if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
                return list;
            },
        },
        pos: new RoomPosition(25, 25, "CombatRoom"),
        moveTo: noop, move: noop,
        rangedAttack: (t) => { strikerAttacked = t; return OK; },
    });
    REG.combatStriker1 = strikerCreep2;
    Memory.squads = {
        csq2: {
            mission: "combat", room: "CombatRoom", from: "W1N1",
            target: { room: "CombatRoom" }, members: ["combatStriker1"], leader: "combatStriker1",
            shape: "block", state: "advancing",
        },
    };
    Memory.rooms.CombatRoom = { enemies: 0, enemyStructures: 1, exits: {} };
    Game.time++;
    strikerMod2.run(strikerCreep2);
    assert(strikerAttacked === hostileTower,
        "a combat squad striker attacks a hostile structure once no hostile creeps remain");

    strikerAttacked = null;
    strikerCreep2.room.find = (type, opts) => {
        let list = [];
        if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
        return list;
    };
    Memory.rooms.CombatRoom = { enemies: 0, enemyStructures: 0, exits: {} };
    Game.time++;
    strikerMod2.run(strikerCreep2);
    assert(strikerAttacked === null,
        "a combat squad striker holds fire with nothing hostile left to shoot");

    delete Memory.squads;
    delete REG.combatStriker1;
    delete Memory.rooms.CombatRoom;
}

// --- ROADMAP 0048: flavored creep names (4-part, role-relevant title) ----
{
    const names = require(path.join(PROJECT, "src/utils/names"));

    // --- format + per-role title pool ---------------------------------------
    for (let i = 0; i < 30; i++) {
        Game.time++; // vary the fallback suffix path's seed, not load-bearing
        const n = names.generate("miner");
        const parts = n.split(",\n");
        assert(
            parts.length === 2 && /^\S+ \S+$/.test(parts[0]),
            "names.generate() produces a 4-part 'Name Surname,\\nPart1 Part2' string (got " +
                JSON.stringify(n) + ")"
        );
        if (parts.length === 2) {
            const titleLine = parts[1];
            const matches = names.TITLE_POOLS.miner.part1.some((p1) =>
                names.TITLE_POOLS.miner.part2.some((p2) => titleLine === p1 + " " + p2)
            );
            assert(matches,
                "the title line is exactly '<part1 from the pool> <part2 from the pool>' (got " +
                    JSON.stringify(titleLine) + ")");
        }
    }

    // --- mission-specific pools differ --------------------------------------
    const claimTitles = names.TITLE_POOLS["reserver:claim"];
    const reserveTitles = names.TITLE_POOLS["reserver:reserve"];
    assert(
        claimTitles && reserveTitles && claimTitles !== reserveTitles,
        "reserver mission-specific titles differ by mission"
    );

    // --- never collides with a live creep when a free combination exists ---
    const savedPool = names.TITLE_POOLS.__test = { part1: ["Solo"], part2: ["Title"] };
    const savedFirst = names.FIRST_NAMES.slice();
    const savedSurnames = names.SURNAMES.slice();
    names.FIRST_NAMES.length = 0;
    names.FIRST_NAMES.push("Ann", "Bob");
    names.SURNAMES.length = 0;
    names.SURNAMES.push("X");
    const taken = "Ann X,\nSolo Title";
    global.Memory.creeps["Ann X,\nSolo Title"] = { role: "x" };
    Game.creeps["Ann X,\nSolo Title"] = { id: "namecolltest" };
    let sawFree = false;
    for (let i = 0; i < 20; i++) {
        const n = names.generate("__test");
        if (n !== taken) { sawFree = true; break; }
    }
    assert(sawFree, "generate() finds the other free combination instead of the one taken name");
    delete Game.creeps["Ann X,\nSolo Title"];
    delete global.Memory.creeps["Ann X,\nSolo Title"];
    delete names.TITLE_POOLS.__test;
    names.FIRST_NAMES.length = 0;
    Array.prototype.push.apply(names.FIRST_NAMES, savedFirst);
    names.SURNAMES.length = 0;
    Array.prototype.push.apply(names.SURNAMES, savedSurnames);

    // --- every role's spawnData() uses the new generator, not the old
    // "<Role>" + Game.time literal ------------------------------------------
    assert(
        spawnCalls.length > 0 && spawnCalls.every((c) => !/^[A-Za-z]+\d+$/.test(c.name)),
        "no spawned creep uses the old '<Role><tick>' name format"
    );
    assert(
        spawnCalls.every((c) => c.name.indexOf(",\n") !== -1),
        "every spawned creep's name has the 4-part 'Name Surname,\\nTitle' shape"
    );
}

// --- ROADMAP 0050: runBuild() says "~Pew!~" on a successful build/repair -
{
    const site = Object.assign(new ConstructionSite(), { id: "sayBuildSite1" });
    REG.sayBuildSite1 = site;
    let said = null;
    const builderCreep = Object.assign(Object.create(Creep.prototype), {
        id: "sayCreep1", room: { name: "SayRoom" }, store: { [RESOURCE_ENERGY]: 50, getUsedCapacity: () => 50 },
        body: [{ type: WORK, hits: 100 }],
        build: () => OK, say: (t) => { said = t; },
    });
    builderCreep.runBuild("sayBuildSite1");
    assert(said === "~Pew!~", "runBuild says '~Pew!~' on a successful build");
    delete REG.sayBuildSite1;

    const wall = Object.assign(new Structure(), { id: "sayWall1", hits: 50, hitsMax: 100 });
    REG.sayWall1 = wall;
    said = null;
    const repairerCreep = Object.assign(Object.create(Creep.prototype), {
        id: "sayCreep2", room: { name: "SayRoom" }, store: { [RESOURCE_ENERGY]: 50, getUsedCapacity: () => 50 },
        body: [{ type: WORK, hits: 100 }],
        repair: () => OK, say: (t) => { said = t; },
    });
    repairerCreep.runBuild("sayWall1");
    assert(said === "~Pew!~", "runBuild says '~Pew!~' on a successful repair");
    delete REG.sayWall1;
}

// --- ROADMAP 0081: energy spend accounting ------------------------------
{
    const energyLedger = require(path.join(PROJECT, "src/utils/energyLedger"));

    // (a) the ledger itself: accumulation, isolation per room, ignoring
    // non-positive amounts, always the full category set on snapshot
    Game.time++;
    energyLedger.record("LedgerRoomA", "build", 40);
    energyLedger.record("LedgerRoomA", "build", 15);
    energyLedger.record("LedgerRoomA", "upgrade", 5);
    energyLedger.record("LedgerRoomA", "build", 0);
    energyLedger.record("LedgerRoomA", "build", -10);
    energyLedger.record("LedgerRoomB", "spawn", 100);

    const snapA = energyLedger.snapshot("LedgerRoomA");
    assert(snapA.build === 55, "record() accumulates multiple calls in the same tick/room (got " + snapA.build + ")");
    assert(snapA.upgrade === 5, "record() tracks a different category independently (got " + snapA.upgrade + ")");
    assert(snapA.spawn === 0, "record() ignoring amount<=0 never creates a phantom category (got " + snapA.spawn + ")");
    assert(
        Object.keys(snapA).length === 10 &&
            ["spawn", "renew", "build", "repairNormal", "repairRampart", "repairWall",
                "upgrade", "towerAttack", "towerHeal", "towerRepair"].every((k) => typeof snapA[k] === "number"),
        "snapshot() always returns all 10 categories, defaulted to 0 (got " + JSON.stringify(snapA) + ")"
    );

    const snapB = energyLedger.snapshot("LedgerRoomB");
    assert(snapB.spawn === 100 && snapB.build === 0,
        "snapshot() isolates rooms from each other (got " + JSON.stringify(snapB) + ")");

    // ROADMAP 0081 follow-up (usuário pediu soma dos últimos 60 segundos):
    // snapshot() sums a trailing WINDOW of ticks (energyLedger.windowTicks,
    // "last N seconds" - the usual 1-tick-~1-second approximation, no real
    // wall-clock signal is available), not just the current one - a room
    // that goes quiet the very next tick still reports what it just spent.
    Game.time++; // a fresh tick with no new record() calls
    const snapACarried = energyLedger.snapshot("LedgerRoomA");
    assert(snapACarried.build === 55,
        "spend from a previous tick still counts while inside the trailing window (got " + snapACarried.build + ")");

    // recordRepair() maps structure type to the right category
    Game.time++;
    energyLedger.recordRepair("LedgerRoomA", STRUCTURE_RAMPART, 10);
    energyLedger.recordRepair("LedgerRoomA", STRUCTURE_WALL, 20);
    energyLedger.recordRepair("LedgerRoomA", STRUCTURE_EXTENSION, 30);
    const snapRepair = energyLedger.snapshot("LedgerRoomA");
    assert(
        snapRepair.repairRampart === 10 && snapRepair.repairWall === 20 && snapRepair.repairNormal === 30,
        "recordRepair() maps rampart/wall/anything-else to their own category (got " + JSON.stringify(snapRepair) + ")"
    );

    // the window itself is configurable (Memory.settings.energyLedger.
    // windowTicks) and spend genuinely drops off once it ages past it -
    // isolated to its own room/override so it can't affect anything above
    Memory.settings = Memory.settings || {};
    Memory.settings.energyLedger = { windowTicks: 3 };
    Game.time++;
    energyLedger.record("LedgerWindowRoom", "build", 77);
    assert(energyLedger.snapshot("LedgerWindowRoom").build === 77,
        "a freshly recorded amount is inside its own configured window");
    Game.time += 2; // still inside a 3-tick window (recorded tick + 2 more)
    assert(energyLedger.snapshot("LedgerWindowRoom").build === 77,
        "spend stays in the sum for the rest of the configured window");
    Game.time += 1; // now outside the 3-tick window
    assert(energyLedger.snapshot("LedgerWindowRoom").build === 0,
        "spend drops out of the sum once it ages past energyLedger.windowTicks (got " +
            energyLedger.snapshot("LedgerWindowRoom").build + ")");
    delete Memory.settings.energyLedger;

    // (b) creep.js's runBuild/runUpgrade estimate spend from WORK power
    // (BUILD_POWER/REPAIR_POWER/UPGRADE_CONTROLLER_POWER, boost-aware),
    // capped by the creep's own energy and the target's remaining need -
    // NOT a store diff (ROADMAP 0081 bug real: the real server only
    // applies build/repair/upgradeController intents after every player's
    // script has run, so store never actually changes mid-tick from the
    // script's own point of view - a diff always measured 0 in production
    // even though towers/creeps/spawns were visibly acting). Only credits
    // when the intent returns OK. Each sub-case uses its own room name so
    // the trailing window can't mix one case's spend into the next.
    Game.time++;
    const buildSite1 = Object.assign(new ConstructionSite(), {
        id: "energyBuildSite1", progress: 0, progressTotal: 1000,
    });
    REG.energyBuildSite1 = buildSite1;
    const energyBuilder = Object.assign(Object.create(Creep.prototype), {
        id: "energyCreep1", room: { name: "EnergyRoomBuild" },
        store: { [RESOURCE_ENERGY]: 100, getUsedCapacity: () => 100 }, body: [{ type: WORK, hits: 100 }],
        build: () => OK, say: noop,
    });
    energyBuilder.runBuild("energyBuildSite1");
    assert(
        energyLedger.snapshot("EnergyRoomBuild").build === BUILD_POWER,
        "runBuild credits BUILD_POWER per WORK part, capped by energy/remaining progress (got " +
            energyLedger.snapshot("EnergyRoomBuild").build + ")"
    );
    delete REG.energyBuildSite1;

    Game.time++;
    const rampartTarget1 = Object.assign(new OwnedStructure(), {
        id: "energyRampart1", structureType: STRUCTURE_RAMPART, hits: 10, hitsMax: 10000,
    });
    REG.energyRampart1 = rampartTarget1;
    const energyRepairer = Object.assign(Object.create(Creep.prototype), {
        id: "energyCreep2", room: { name: "EnergyRoomRepair" },
        store: { [RESOURCE_ENERGY]: 1000, getUsedCapacity: () => 1000 }, body: [{ type: WORK, hits: 100 }],
        repair: () => OK, say: noop,
    });
    energyRepairer.runBuild("energyRampart1");
    assert(
        energyLedger.snapshot("EnergyRoomRepair").repairRampart === REPAIR_POWER,
        "runBuild's repair branch credits REPAIR_POWER per WORK part to 'repairRampart' (got " +
            energyLedger.snapshot("EnergyRoomRepair").repairRampart + ")"
    );
    delete REG.energyRampart1;

    // a boosted WORK part multiplies its own contribution, read live from
    // BOOSTS[WORK][boost] - never a hardcoded multiplier
    Game.time++;
    const rampartTarget2 = Object.assign(new OwnedStructure(), {
        id: "energyRampart2", structureType: STRUCTURE_RAMPART, hits: 10, hitsMax: 10000,
    });
    REG.energyRampart2 = rampartTarget2;
    const boostedRepairer = Object.assign(Object.create(Creep.prototype), {
        id: "energyCreep2b", room: { name: "EnergyRoomRepairBoost" },
        store: { [RESOURCE_ENERGY]: 1000, getUsedCapacity: () => 1000 }, body: [{ type: WORK, hits: 100, boost: "LH" }],
        repair: () => OK, say: noop,
    });
    boostedRepairer.runBuild("energyRampart2");
    assert(
        energyLedger.snapshot("EnergyRoomRepairBoost").repairRampart === REPAIR_POWER * 1.5,
        "a boosted WORK part's repair contribution is multiplied per BOOSTS[WORK][boost].repair (got " +
            energyLedger.snapshot("EnergyRoomRepairBoost").repairRampart + ")"
    );
    delete REG.energyRampart2;

    Game.time++;
    const failingSite = Object.assign(new ConstructionSite(), {
        id: "energyFailSite1", progress: 0, progressTotal: 1000,
    });
    REG.energyFailSite1 = failingSite;
    const failingBuilder = Object.assign(Object.create(Creep.prototype), {
        id: "energyCreep3", room: { name: "EnergyRoomFail" },
        store: { [RESOURCE_ENERGY]: 100, getUsedCapacity: () => 100 }, body: [{ type: WORK, hits: 100 }],
        build: () => ERR_NOT_ENOUGH_RESOURCES, say: noop, moveTo: noop, popState: noop,
    });
    failingBuilder.runBuild("energyFailSite1");
    assert(
        energyLedger.snapshot("EnergyRoomFail").build === 0,
        "a failed build() (status !== OK) never credits the ledger (got " +
            energyLedger.snapshot("EnergyRoomFail").build + ")"
    );
    delete REG.energyFailSite1;

    Game.time++;
    const upgradeTarget1 = Object.assign(new RoomObject(), { id: "energyCtrl1" });
    REG.energyCtrl1 = upgradeTarget1;
    const energyUpgrader = Object.assign(Object.create(Creep.prototype), {
        id: "energyCreep4", room: { name: "EnergyRoomUpgrade" },
        store: { [RESOURCE_ENERGY]: 100, getUsedCapacity: () => 100 }, body: [{ type: WORK, hits: 100 }],
        upgradeController: () => OK,
    });
    energyUpgrader.runUpgrade("energyCtrl1");
    assert(
        energyLedger.snapshot("EnergyRoomUpgrade").upgrade === UPGRADE_CONTROLLER_POWER,
        "runUpgrade credits UPGRADE_CONTROLLER_POWER per WORK part (got " +
            energyLedger.snapshot("EnergyRoomUpgrade").upgrade + ")"
    );
    delete REG.energyCtrl1;

    // (c) utils/stats.js wires the snapshot into Memory.stats.rooms[x].energySpent -
    // diffed against a baseline snapshot so a shared, long-lived room (W1N1) still
    // gives a deterministic assertion regardless of what's already in its window
    const statsUtilForLedger = require(path.join(PROJECT, "src/utils/stats"));
    Game.time++;
    const beforeLedgerSnap = energyLedger.snapshot("W1N1");
    energyLedger.record("W1N1", "spawn", 300);
    energyLedger.recordRepair("W1N1", STRUCTURE_WALL, 40);
    statsUtilForLedger();
    const roomEnergySpent = Memory.stats.rooms.W1N1.energySpent;
    assert(
        roomEnergySpent &&
            roomEnergySpent.spawn === beforeLedgerSnap.spawn + 300 &&
            roomEnergySpent.repairWall === beforeLedgerSnap.repairWall + 40,
        "exportStats() wires energyLedger.snapshot() into Memory.stats.rooms[x].energySpent (got " +
            JSON.stringify(roomEnergySpent) + ")"
    );
    assert(
        Object.keys(roomEnergySpent).length === 10,
        "Memory.stats.rooms[x].energySpent always has all 10 categories (got " +
            JSON.stringify(roomEnergySpent) + ")"
    );
}

// --- ROADMAP 0051: mineral extraction, lab reactions/boost, factory (nível
// 0), power spawn -----------------------------------------------------
function mineralStore(resources, freeCap) {
    return Object.assign(
        Object.create({
            getFreeCapacity() { return freeCap; },
            getCapacity() {
                return freeCap + _.sum(Object.values(resources));
            },
        }),
        resources
    );
}

// --- Fase 1: mineralMiner harvest gating --------------------------------
{
    const mineralMinerMod = require(path.join(PROJECT, "src/roles/mineralMiner"));
    Memory.rooms.W1N1.defenseActive = false;

    const extractorMM = Object.assign(new OwnedStructure(), {
        id: "extractorMM1", structureType: STRUCTURE_EXTRACTOR, my: true,
    });
    let containerFree = 100;
    const containerMM = Object.assign(new StructureContainer(), {
        id: "containerMM1", structureType: STRUCTURE_CONTAINER, pos: mineral.pos,
        store: { getFreeCapacity: () => containerFree },
    });
    const realMineralFindInRange = mineral.pos.findInRange;
    mineral.pos.findInRange = (type, range, opts) => {
        let list = type === FIND_STRUCTURES ? [extractorMM, containerMM] : [];
        if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
        return list;
    };

    let harvested = false;
    const mmCreep = Object.assign(Object.create(Creep.prototype), {
        id: "mmcreep1", room: { name: "W1N1" },
        pos: new RoomPosition(mineral.pos.x, mineral.pos.y, "W1N1"),
        memory: { role: "mineralMiner", target: mineral.id },
        moveTo: noop,
        harvest: () => { harvested = true; return OK; },
        suicide: () => OK,
    });

    const savedMineralAmount = mineral.mineralAmount;
    mineral.mineralAmount = 5000;
    containerFree = 100;
    mineralMinerMod.run(mmCreep);
    assert(harvested === true,
        "mineralMiner harvests when the mineral has amount and the container has room");

    harvested = false;
    containerFree = 0;
    mineralMinerMod.run(mmCreep);
    assert(harvested === false, "mineralMiner does not harvest into a full container");

    harvested = false;
    containerFree = 100;
    mineral.mineralAmount = 0;
    mineralMinerMod.run(mmCreep);
    assert(harvested === false, "mineralMiner does not harvest a depleted mineral");

    mineral.mineralAmount = savedMineralAmount;
    mineral.pos.findInRange = realMineralFindInRange;
}

// --- Fase 1: hauler.pickMineralJob() prioritizes the mineral container --
{
    const pmMineral = Object.assign(new RoomObject(), {
        id: "pmMineral1", mineralType: "H", mineralAmount: 3000,
        pos: new RoomPosition(10, 10, "PickJobRoom"),
    });
    const pmContainer = Object.assign(new StructureContainer(), {
        id: "pmContainer1", structureType: STRUCTURE_CONTAINER,
        store: mineralStore({ H: 50 }, 1950),
    });
    pmMineral.pos.findInRange = (type, range, opts) => {
        let list = type === FIND_STRUCTURES ? [pmContainer] : [];
        if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
        return list;
    };
    const pmStorage = { store: mineralStore({}, 100000) };
    const pmRoom = {
        name: "PickJobRoom", storage: pmStorage, terminal: null,
        find: (type) => (type === FIND_MINERALS ? [pmMineral] : []),
    };
    Memory.rooms.PickJobRoom = {
        labReaction: { a: "H", b: "O", product: "OH", output: "nope1", input1: "nope2", input2: "nope3" },
    };
    const job = hauler.pickMineralJob(pmRoom);
    assert(
        job && job.resourceType === "H" && job.from === pmContainer && job.to === pmStorage,
        "pickMineralJob() drains the mineral container before touching a lab reagent job"
    );
    delete Memory.rooms.PickJobRoom;
}

// --- hauler.spawnsAndExtensionsFull() gates the mineral-job cascade ------
// a hauler must never chase mineral/lab/factory errands while a spawn or
// extension is still hungry for energy (that's this role's actual job).
{
    const gateRoom = { name: "GateRoom" };
    const gateSpawn = {
        structureType: STRUCTURE_SPAWN, store: { getFreeCapacity: () => 0 },
    };
    const gateExt = {
        structureType: STRUCTURE_EXTENSION, store: { getFreeCapacity: () => 0 },
    };
    gateRoom.find = (type) =>
        type === FIND_MY_STRUCTURES ? [gateSpawn, gateExt] : [];

    Game.time++; // bust roomCache's per-tick memoisation
    assert(
        hauler.spawnsAndExtensionsFull(gateRoom) === true,
        "spawnsAndExtensionsFull() is true once spawn and extensions are both full"
    );

    gateExt.store.getFreeCapacity = () => 50;
    Game.time++;
    assert(
        hauler.spawnsAndExtensionsFull(gateRoom) === false,
        "spawnsAndExtensionsFull() is false while an extension still wants energy"
    );
}

// --- Fase 2: setLabReaction()/cancelLabReaction() -----------------------
{
    const refiningMod = require(path.join(PROJECT, "src/rooms/refining"));
    void refiningMod; // loaded for its console-command side effects

    delete Memory.rooms.LabRoom;
    global.setLabReaction("LabRoom", "H", "O");
    assert(!Memory.rooms.LabRoom || !Memory.rooms.LabRoom.labReaction,
        "setLabReaction() refuses a room without vision");

    function mkLab(id, x, y) {
        return Object.assign(new OwnedStructure(), {
            id, structureType: STRUCTURE_LAB, my: true,
            pos: new RoomPosition(x, y, "LabRoom"), mineralType: null,
            store: mineralStore({}, 3000), cooldown: 0,
            room: { name: "LabRoom" },
        });
    }
    const lab1 = mkLab("reflab1", 10, 10);
    const lab2 = mkLab("reflab2", 11, 10);
    const lab3 = mkLab("reflab3", 20, 20); // far from everything
    const labRoomStructs = [lab1, lab2, lab3];
    labRoomStructs.forEach((l) => (REG[l.id] = l));
    const labRoom = {
        name: "LabRoom",
        find: (type, opts) => {
            let list = type === FIND_STRUCTURES ? labRoomStructs : [];
            if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
            return list;
        },
    };
    const realRoomsLabRoom = Game.rooms.LabRoom;
    Game.rooms.LabRoom = labRoom;

    global.setLabReaction("LabRoom", "Q", "R"); // not in the REACTIONS mock
    assert(!Memory.rooms.LabRoom || !Memory.rooms.LabRoom.labReaction,
        "setLabReaction() refuses a pair that isn't a valid reaction");

    // only 2 labs close enough together (lab3 is far from both) - no valid
    // output+2-inputs triple exists
    global.setLabReaction("LabRoom", "H", "O");
    assert(!Memory.rooms.LabRoom || !Memory.rooms.LabRoom.labReaction,
        "setLabReaction() refuses when no 3 labs are within range 2 of each other");

    // move lab3 next to the other two so a valid triple exists
    lab3.pos = new RoomPosition(10, 11, "LabRoom");
    global.setLabReaction("LabRoom", "H", "O");
    assert(
        Memory.rooms.LabRoom &&
            Memory.rooms.LabRoom.labReaction &&
            Memory.rooms.LabRoom.labReaction.product === "OH" &&
            [lab1.id, lab2.id, lab3.id].indexOf(Memory.rooms.LabRoom.labReaction.output) !== -1,
        "setLabReaction() records a valid reaction with 3 labs actually close enough"
    );

    global.cancelLabReaction("LabRoom");
    assert(!Memory.rooms.LabRoom.labReaction, "cancelLabReaction() clears the active reaction");

    // --- structures/lab.js: only the output lab acts, only off cooldown --
    const labMod = require(path.join(PROJECT, "src/structures/lab"));
    const reactionCalls = [];
    for (const l of labRoomStructs) {
        l.runReaction = (a, b) => { reactionCalls.push({ self: l.id, a: a.id, b: b.id }); return OK; };
    }
    global.setLabReaction("LabRoom", "H", "O");
    const reaction = Memory.rooms.LabRoom.labReaction;
    const outputLab = labRoomStructs.find((l) => l.id === reaction.output);
    const inputLabs = labRoomStructs.filter((l) => l.id !== reaction.output);

    labMod.run(inputLabs[0]);
    assert(reactionCalls.length === 0, "structures/lab.js's run() is a no-op on an input lab");

    labMod.run(outputLab);
    assert(reactionCalls.length === 1 && reactionCalls[0].self === outputLab.id,
        "structures/lab.js's run() runs the reaction on the output lab");

    reactionCalls.length = 0;
    outputLab.cooldown = 5;
    labMod.run(outputLab);
    assert(reactionCalls.length === 0, "structures/lab.js's run() waits out the lab's cooldown");
    outputLab.cooldown = 0;

    // --- pickMineralJob(): reagent top-up + output drain --------------
    const inputA = Game.getObjectById(reaction.a === "H" ? reaction.input1 : reaction.input2);
    inputA.store = mineralStore({}, 3000); // empty - below the buffer
    const reagentJob = hauler.pickMineralJob(
        Object.assign({}, labRoom, { storage: { store: mineralStore({ H: 1000 }, 2000) }, terminal: null })
    );
    assert(
        reagentJob && reagentJob.resourceType === reaction.a && reagentJob.to.id === inputA.id,
        "pickMineralJob() tops up an under-stocked input lab from storage"
    );

    outputLab.mineralType = reaction.product;
    outputLab.store = mineralStore({ [reaction.product]: 200 }, 2800);
    const drainJob = hauler.pickMineralJob(
        Object.assign({}, labRoom, { storage: { store: mineralStore({}, 100000) }, terminal: null })
    );
    assert(
        drainJob && drainJob.resourceType === reaction.product && drainJob.from.id === outputLab.id,
        "pickMineralJob() drains the output lab's product back to storage"
    );

    // --- boostCreep() ----------------------------------------------------
    const boostLab = Object.assign(new OwnedStructure(), {
        id: "boostlab1", structureType: STRUCTURE_LAB, mineralType: "UH",
        pos: new RoomPosition(15, 15, "LabRoom"),
    });
    let boosted = null;
    boostLab.boostCreep = (c) => { boosted = c; return OK; };
    const boostRoom = {
        name: "LabRoom",
        find: (type, opts) => {
            let list = type === FIND_STRUCTURES ? [boostLab] : [];
            if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
            return list;
        },
    };
    Game.rooms.LabRoom = boostRoom;
    Game.time++; // bust utils/roomCache's per-tick cache from the earlier lab1/lab2/lab3 room
    const boostTarget = Object.assign(Object.create(Creep.prototype), {
        id: "boostc1", room: boostRoom, pos: new RoomPosition(15, 16, "LabRoom"),
    });
    Game.creeps.BoostTarget1 = boostTarget;
    global.boostCreep("BoostTarget1", "UH");
    assert(boosted === boostTarget, "boostCreep() finds an adjacent lab with the right compound and boosts");

    boosted = null;
    global.boostCreep("BoostTarget1", "XUH2O"); // nothing has this compound loaded
    assert(boosted === null, "boostCreep() does nothing (and doesn't throw) without a matching lab in range");

    delete Game.creeps.BoostTarget1;
    delete Memory.rooms.LabRoom;
    labRoomStructs.forEach((l) => delete REG[l.id]);
    // restore to "never set" (delete), not "set to undefined" - the latter
    // leaves an enumerable Game.rooms.LabRoom key whose value is undefined,
    // which crashes any later `for (let name in Game.rooms)` walk (e.g.
    // utils/stats.js) the instant it dereferences Game.rooms[name].controller
    if (realRoomsLabRoom === undefined) delete Game.rooms.LabRoom;
    else Game.rooms.LabRoom = realRoomsLabRoom;
}

// --- Fase 3: setFactoryProduct()/cancelFactoryProduct() + structures/factory.js
{
    delete Memory.rooms.FactoryRoom;
    global.setFactoryProduct("FactoryRoom", "widgetB"); // level 3 - refused
    assert(!Memory.rooms.FactoryRoom || !Memory.rooms.FactoryRoom.factoryProduct,
        "setFactoryProduct() refuses a commodity above level 0 (needs Power Creep/GPL)");

    const factoryStruct = Object.assign(new OwnedStructure(), {
        id: "factory1", structureType: STRUCTURE_FACTORY, my: true, cooldown: 0,
        store: mineralStore({}, 50000), room: { name: "FactoryRoom" },
    });
    const factoryRoom = {
        name: "FactoryRoom",
        find: (type, opts) => {
            let list = type === FIND_STRUCTURES ? [factoryStruct] : [];
            if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
            return list;
        },
    };
    const realFactoryRoom = Game.rooms.FactoryRoom;
    Game.rooms.FactoryRoom = factoryRoom;

    global.setFactoryProduct("FactoryRoom", "widgetA"); // level 0 - accepted
    assert(Memory.rooms.FactoryRoom && Memory.rooms.FactoryRoom.factoryProduct === "widgetA",
        "setFactoryProduct() accepts a level-0 commodity");

    global.cancelFactoryProduct("FactoryRoom");
    assert(!Memory.rooms.FactoryRoom.factoryProduct, "cancelFactoryProduct() clears the active target");
    Memory.rooms.FactoryRoom.factoryProduct = "widgetA"; // restore for the run() tests below

    const factoryMod = require(path.join(PROJECT, "src/structures/factory"));
    let produced = null;
    factoryStruct.produce = (r) => { produced = r; return OK; };

    factoryStruct.store = mineralStore({}, 50000); // no components stocked yet
    factoryMod.run(factoryStruct);
    assert(produced === null, "structures/factory.js's run() waits until every component is stocked");

    factoryStruct.store = mineralStore({ Z: 20, energy: 20 }, 49960);
    factoryMod.run(factoryStruct);
    assert(produced === "widgetA", "structures/factory.js's run() produces once fully stocked");

    // same "restore to never-set, not set-to-undefined" fix as LabRoom above
    if (realFactoryRoom === undefined) delete Game.rooms.FactoryRoom;
    else Game.rooms.FactoryRoom = realFactoryRoom;

    // --- hauler.js's optionalConsumer() also feeds the factory energy -----
    const roomCacheMod = require(path.join(PROJECT, "src/utils/roomCache"));
    const energyFactory = Object.assign(new OwnedStructure(), {
        id: "factory2", structureType: STRUCTURE_FACTORY,
        store: { getFreeCapacity: () => 500 },
        pos: new RoomPosition(30, 30, "W1N1"),
    });
    const consumerCreep = Object.assign(Object.create(Creep.prototype), {
        pos: {
            findClosestByRange: (list, opts) => {
                const filtered = opts && opts.filter ? list.filter(opts.filter) : list;
                return filtered[0] || null;
            },
        },
        room: { name: "W1N1" },
    });
    const realMyStructures = roomCacheMod.myStructures;
    roomCacheMod.myStructures = () => [energyFactory];
    assert(hauler.optionalConsumer(consumerCreep) === energyFactory,
        "hauler.js's optionalConsumer() also targets a factory needing energy");
    roomCacheMod.myStructures = realMyStructures;
}

// --- Fase 4: structures/powerSpawn.js -------------------------------------
{
    const powerSpawnMod = require(path.join(PROJECT, "src/structures/powerSpawn"));
    const configMod = require(path.join(PROJECT, "src/utils/config"));
    let processed = false;
    const psStruct = {
        store: { power: 0 },
        processPower: () => { processed = true; return OK; },
    };

    powerSpawnMod.run(psStruct);
    assert(processed === false, "structures/powerSpawn.js's run() does nothing without any Power stored");

    psStruct.store.power = 1;
    powerSpawnMod.run(psStruct);
    assert(processed === true, "structures/powerSpawn.js's run() processes Power once any is stored");

    processed = false;
    global.Memory.settings = Object.assign({}, global.Memory.settings, { powerSpawn: { enabled: false } });
    powerSpawnMod.run(psStruct);
    assert(processed === false, "powerSpawn.enabled=false disables processPower() even with Power stored");
    delete global.Memory.settings.powerSpawn;
    void configMod;
}

// --- ROADMAP 0054 follow-up (usuário reportou em produção): the upgrader
// must not drain room-wide storage/container energy meant for spawn/ext
// just because reservations.available() found no OTHER creep contending
// for that exact pile THIS tick - a source container refilling after the
// room ran dry, with no hauler currently also targeting it, used to be
// fair game for the upgrader even with the room starving and the
// controller nowhere near downgrading (real report: RCL8, ticksToDowngrade
// 194864 out of a 200000 ceiling - plenty of buffer). Now it only touches
// that pool once the room can spare it (economyStable) or the controller
// is genuinely close to downgrading (resourceTiers.controllerCritical) --
{
    const upgraderMod = require(path.join(PROJECT, "src/roles/upgrader"));

    function upFind(structures) {
        return (type, opts) => {
            let list =
                type === FIND_STRUCTURES || type === FIND_MY_STRUCTURES
                    ? structures
                    : [];
            if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
            return list;
        };
    }

    function mkUpController(ticksToDowngrade) {
        return Object.assign(new RoomObject(), {
            id: "up-ctrl", my: true, level: 7, ticksToDowngrade,
            pos: new RoomPosition(25, 25, "UpTiersRoom"),
        });
    }

    function mkUpContainer() {
        return Object.assign(new StructureContainer(), {
            id: "up-cont", structureType: STRUCTURE_CONTAINER,
            pos: new RoomPosition(25, 24, "UpTiersRoom"),
            store: store(2000, 2000),
        });
    }

    function mkUpLink() {
        return Object.assign(new StructureLink(), {
            id: "up-link", structureType: STRUCTURE_LINK,
            pos: new RoomPosition(25, 24, "UpTiersRoom"),
            store: store(500, 800), isCollector: () => false,
        });
    }

    function mkUpCreep(room) {
        return Object.assign(new Creep(), {
            id: "up-creep", name: "UpTiers1",
            pos: new RoomPosition(20, 20, "UpTiersRoom"), room,
            memory: { role: "upgrader" },
            store: store(0, 50),
            harvest: noop, upgradeController: noop, build: noop, repair: noop,
            transfer: noop, withdraw: noop, pickup: noop, move: noop,
            moveTo: noop, moveByPath: noop, drop: noop,
            rangedAttack: noop, rangedMassAttack: noop, heal: noop,
            rangedHeal: noop, attack: noop,
        });
    }

    function runUpScenario({ ticksToDowngrade, energyAvailable, energyCapacityAvailable }) {
        const container = mkUpContainer();
        REG[container.id] = container;
        const upRoom = Object.assign(new Room("UpTiersRoom"), {
            controller: mkUpController(ticksToDowngrade), storage: null,
            energyAvailable, energyCapacityAvailable,
            find: upFind([container]),
        });
        const creep = mkUpCreep(upRoom);
        REG[creep.id] = creep;
        withFindLookup(creep.pos, { [FIND_STRUCTURES]: [container] });

        let threw = null;
        try { upgraderMod.run(creep); } catch (e) { threw = e; }
        assert(!threw, "upgrader.run() never throws" +
            (threw ? "\n      " + (threw.stack || threw) : ""));
        return creep;
    }

    // real report: RCL8, ticksToDowngrade 194864 (out of 200000 - plenty of
    // buffer, nowhere near critical), room starved (spawn/ext hungry)
    {
        const creep = runUpScenario({
            ticksToDowngrade: 194864, energyAvailable: 0, energyCapacityAvailable: 550,
        });
        assert(!creep.memory.stack,
            "room not stable (spawn/ext hungry) and controller not critical: the " +
                "upgrader leaves the container alone instead of draining it (got " +
                JSON.stringify(creep.memory.stack) + ")");
    }

    // room stable (spawn/ext topped off) - the container is fair game again,
    // regardless of how safe the controller's downgrade timer is
    {
        const creep = runUpScenario({
            ticksToDowngrade: 194864, energyAvailable: 550, energyCapacityAvailable: 550,
        });
        assert(
            creep.memory.stack && creep.memory.stack[0] &&
                creep.memory.stack[0][0] === "GetEnergy" &&
                creep.memory.stack[0][1] === "up-cont",
            "room stable: the upgrader draws from the container normally (got " +
                JSON.stringify(creep.memory.stack) + ")"
        );
    }

    // room NOT stable, but the controller is genuinely close to downgrading
    // (below logistics.controllerCriticalDowngradeRatio, 10%, of
    // CONTROLLER_DOWNGRADE[8]=200000) - the emergency overrides the reserve
    {
        const creep = runUpScenario({
            ticksToDowngrade: 10000, energyAvailable: 0, energyCapacityAvailable: 550,
        });
        assert(
            creep.memory.stack && creep.memory.stack[0] &&
                creep.memory.stack[0][0] === "GetEnergy" &&
                creep.memory.stack[0][1] === "up-cont",
            "controller genuinely close to downgrading: the upgrader draws from the " +
                "container even though the room isn't stable (got " +
                JSON.stringify(creep.memory.stack) + ")"
        );
    }

    function runUpLinkScenario(energyAvailable) {
        const link = mkUpLink();
        REG[link.id] = link;
        const upRoom = Object.assign(new Room("UpTiersRoom"), {
            controller: mkUpController(194864), storage: null,
            energyAvailable, energyCapacityAvailable: 550,
            find: upFind([link]),
        });
        const creep = mkUpCreep(upRoom);
        creep.withdraw = (target) => {
            creep.withdrawnFrom = target && target.id;
            return OK;
        };
        withFindLookup(creep.pos, { [FIND_STRUCTURES]: [link] });
        Game.time++;
        upgraderMod.run(creep);
        return creep;
    }

    {
        const creep = runUpLinkScenario(0);
        assert(creep.withdrawnFrom !== "up-link",
            "upgrader does not withdraw from a non-collector link while spawn/extensions are critical");
    }
    {
        const creep = runUpLinkScenario(550);
        assert(creep.withdrawnFrom === "up-link",
            "upgrader may withdraw from a non-collector link once spawn/extensions are stable");
    }
}

// A persisted GetEnergy state must be revalidated when the room becomes
// critical, and RCL8 builders must not fall back to the full controller.
{
    const builderMod = require(path.join(PROJECT, "src/roles/builder"));
    const upgraderMod = require(path.join(PROJECT, "src/roles/upgrader"));
    const savedLevel = controller.level;
    const savedEnergy = room.energyAvailable;
    const savedCapacity = room.energyCapacityAvailable;
    const savedStructures = findMap[FIND_STRUCTURES];
    const savedMyStructures = findMap[FIND_MY_STRUCTURES];
    const staleLink = Object.assign(new StructureLink(), {
        id: "stale-link", structureType: STRUCTURE_LINK, room,
        pos: new RoomPosition(22, 22, "W1N1"),
        store: store(500, 800), isCollector: () => false,
    });
    REG[staleLink.id] = staleLink;
    findMap[FIND_STRUCTURES] = [staleLink];
    findMap[FIND_MY_STRUCTURES] = [staleLink];
    room.energyAvailable = 0;
    room.energyCapacityAvailable = 300;

    const staleBuilder = makeCreep("StaleBuilder", "builder", { store: store(0, 50) });
    staleBuilder.memory.stack = [["GetEnergy", staleLink.id]];
    staleBuilder.withdraw = (target) => { staleBuilder.withdrawnFrom = target.id; return OK; };
    Game.time++;
    builderMod.run(staleBuilder);
    assert(staleBuilder.withdrawnFrom !== staleLink.id && !staleBuilder.memory.stack,
        "builder abandons a persisted non-collector link load when spawn/extensions are critical");

    const staleUpgrader = makeCreep("StaleUpgrader", "upgrader", { store: store(0, 50) });
    staleUpgrader.memory.stack = [["GetEnergy", staleLink.id]];
    staleUpgrader.withdraw = (target) => { staleUpgrader.withdrawnFrom = target.id; return OK; };
    Game.time++;
    upgraderMod.run(staleUpgrader);
    assert(staleUpgrader.withdrawnFrom !== staleLink.id && !staleUpgrader.memory.stack,
        "upgrader abandons a persisted non-collector link load when spawn/extensions are critical");

    const carriedSite = Object.assign(new ConstructionSite(), {
        id: "carried-site", structureType: STRUCTURE_EXTENSION,
        progress: 0, progressTotal: 1000, room,
        pos: new RoomPosition(21, 21, "W1N1"),
    });
    REG[carriedSite.id] = carriedSite;
    findMap[FIND_MY_CONSTRUCTION_SITES] = [carriedSite];
    const carriedBuilder = makeCreep("CarriedBuilder", "builder", { store: store(50, 50) });
    let builtCarriedSite = false;
    carriedBuilder.build = (target) => {
        builtCarriedSite = target.id === carriedSite.id;
        return OK;
    };
    Game.time++;
    builderMod.run(carriedBuilder);
    assert(builtCarriedSite,
        "builder with carried energy keeps working on construction sites during a critical economy");
    findMap[FIND_MY_CONSTRUCTION_SITES] = [];

    controller.level = 8;
    room.energyAvailable = 300;
    room.energyCapacityAvailable = 300;
    const rcl8Builder = makeCreep("Rcl8Builder", "builder", { store: store(0, 50) });
    let upgraded = false;
    rcl8Builder.upgradeController = () => { upgraded = true; return OK; };
    Game.time++;
    builderMod.run(rcl8Builder);
    assert(!upgraded, "builder never uses a full, topped-off RCL8 controller as an upgrade fallback");

    // ROADMAP 0103 follow-up (real bug reported in production): the gate
    // above must not be unconditional on level - once ticksToDowngrade
    // decays past the same low-water mark rooms/needs.js uses to want its
    // upkeep upgrader, a builder converted from upgrader (exactly the creep
    // needs.js's convertedUpgraders deduction expects to cover that upkeep)
    // must actually use its carried energy instead of idling "zzz" forever
    // while the controller keeps decaying toward a real downgrade.
    const savedTicksToDowngrade = controller.ticksToDowngrade;
    controller.ticksToDowngrade = 50000; // well below the 50% low-water mark
    const rcl8UpkeepBuilder = makeCreep("Rcl8UpkeepBuilder", "builder", {
        store: store(50, 50),
    });
    let upkeepUpgraded = false;
    rcl8UpkeepBuilder.upgradeController = () => {
        upkeepUpgraded = true;
        return OK;
    };
    Game.time++;
    builderMod.run(rcl8UpkeepBuilder);
    assert(upkeepUpgraded,
        "builder falls back to upgrading a decaying RCL8 controller once " +
            "ticksToDowngrade crosses the upkeep low-water mark");
    delete Game.creeps.Rcl8UpkeepBuilder;
    delete Memory.creeps.Rcl8UpkeepBuilder;

    // ROADMAP 0103 follow-up (real bug reported in production, 2026-09-24):
    // the gate above must only block a LITERALLY full controller - reusing
    // the "needs one" demand mark to also block spending left a builder
    // with cargo energy idling "zzz" anywhere in the 50%-99% gap, even
    // though the controller still had genuine room to take it. Criticality
    // marks (rcl8UpkeepRatio / rcl8SafeRatio) size the population and drive
    // role conversion; they must not also gate spending energy already in
    // hand.
    controller.ticksToDowngrade = Math.floor(CONTROLLER_DOWNGRADE[8] * 0.9); // inside the 50%-99% gap
    const rcl8GapBuilder = makeCreep("Rcl8GapBuilder", "builder", {
        store: store(50, 50),
    });
    let gapUpgraded = false;
    rcl8GapBuilder.upgradeController = () => {
        gapUpgraded = true;
        return OK;
    };
    Game.time++;
    builderMod.run(rcl8GapBuilder);
    assert(gapUpgraded,
        "builder still spends carried energy on a non-full RCL8 controller " +
            "inside the 50%-99% demand gap, not just below the low-water mark");
    delete Game.creeps.Rcl8GapBuilder;
    delete Memory.creeps.Rcl8GapBuilder;
    controller.ticksToDowngrade = savedTicksToDowngrade;

    controller.level = savedLevel;
    room.energyAvailable = savedEnergy;
    room.energyCapacityAvailable = savedCapacity;
    findMap[FIND_STRUCTURES] = savedStructures;
    findMap[FIND_MY_STRUCTURES] = savedMyStructures;
    delete Game.creeps.StaleBuilder;
    delete Game.creeps.StaleUpgrader;
    delete Game.creeps.Rcl8Builder;
    delete Game.creeps.CarriedBuilder;
    delete Memory.creeps.StaleBuilder;
    delete Memory.creeps.StaleUpgrader;
    delete Memory.creeps.Rcl8Builder;
    delete Memory.creeps.CarriedBuilder;
}

// An upgrader converted to builder occupies one economy slot; the next
// desired-upgrader calculation must account for that conversion once the
// temporary zero override is removed.
{
    const upgraderMod = require(path.join(PROJECT, "src/roles/upgrader"));
    const savedLevel = controller.level;
    const savedTicks = controller.ticksToDowngrade;
    controller.level = 8;
    controller.ticksToDowngrade = 199999; // base formula wants one upgrader
    setWanted(room.name, "upgrader", 0); // trigger conversion this tick
    const converted = makeCreep("ConvertedUpgrader", "upgrader", {
        store: store(0, 50),
    });
    Game.creeps.ConvertedUpgrader = converted;
    Game.time++;
    upgraderMod.run(converted);
    assert(converted.memory.role === "builder" &&
        converted.memory.convertedFrom === "upgrader",
        "an upgrader conversion marks the creep as a builder-derived worker");
    clearWanted(room.name, "upgrader");
    Game.time++;
    assert(needs.roomNeeds(room).upgrader === 0,
        "a converted upgrader reduces the next desired-upgrader count by one");
    delete Game.creeps.ConvertedUpgrader;
    delete Memory.creeps.ConvertedUpgrader;
    controller.level = savedLevel;
    controller.ticksToDowngrade = savedTicks;
}

// ROADMAP 0103 follow-up (real bug reported in production, 2026-09-24): a
// separate, higher "safe to demote" mark (upgrader.rcl8SafeRatio, 99%) keeps
// an RCL8 upkeep upgrader from being benched the instant ticksToDowngrade
// ticks back above the 50% "needs one" mark - it must stay an upgrader
// through the whole 50%-99% gap, only converting once genuinely near max.
{
    const upgraderMod = require(path.join(PROJECT, "src/roles/upgrader"));
    const savedLevel = controller.level;
    const savedTicks = controller.ticksToDowngrade;
    const savedUp1 = Game.creeps.Up1;
    const savedUp1Mem = Memory.creeps.Up1;
    delete Game.creeps.Up1; // keep the room's upgrader census exact for this block
    delete Memory.creeps.Up1;
    controller.level = 8;
    clearWanted(room.name, "upgrader");

    // below the 50% "needs one" mark -> wanted > 0 -> never excess,
    // regardless of how many upgraders are around
    {
        controller.ticksToDowngrade = 80000; // 40% of CONTROLLER_DOWNGRADE[8]
        const creep = makeCreep("GapUp1", "upgrader", { store: store(0, 50) });
        Game.creeps.GapUp1 = creep;
        Game.time++;
        upgraderMod.run(creep);
        assert(creep.memory.role === "upgrader",
            "below the 50% needs mark, an RCL8 upgrader is never excess");
        delete Game.creeps.GapUp1;
        delete Memory.creeps.GapUp1;
    }

    // in the 50%-99% gap (wanted already 0, but not yet safe) -> the
    // alphabetically-first upgrader stays put instead of demoting early
    {
        controller.ticksToDowngrade = 140000; // 70% - past 50%, short of 99%
        const first = makeCreep("GapUpA", "upgrader", { store: store(0, 50) });
        Game.creeps.GapUpA = first;
        Game.time++;
        upgraderMod.run(first);
        assert(first.memory.role === "upgrader",
            "in the 50%-99% gap, the sole/first upgrader keeps working " +
                "instead of demoting before the controller is actually safe");
        delete Game.creeps.GapUpA;
        delete Memory.creeps.GapUpA;
    }

    // same gap, but a second (leftover) upgrader is also around -> only the
    // first is worth keeping; the rest still demote since one is enough
    {
        controller.ticksToDowngrade = 140000;
        const first = makeCreep("GapUpA", "upgrader", { store: store(0, 50) });
        const second = makeCreep("GapUpB", "upgrader", { store: store(0, 50) });
        Game.creeps.GapUpA = first;
        Game.creeps.GapUpB = second;
        Game.time++;
        upgraderMod.run(second);
        assert(second.memory.role === "builder" &&
            second.memory.convertedFrom === "upgrader",
            "in the 50%-99% gap, a second/leftover upgrader still demotes " +
                "even though the controller isn't safe yet");
        delete Game.creeps.GapUpA;
        delete Game.creeps.GapUpB;
        delete Memory.creeps.GapUpA;
        delete Memory.creeps.GapUpB;
    }

    // at/above the 99% safe mark -> demotes normally
    {
        controller.ticksToDowngrade = 198000; // exactly 99%
        const creep = makeCreep("GapUp2", "upgrader", { store: store(0, 50) });
        Game.creeps.GapUp2 = creep;
        Game.time++;
        upgraderMod.run(creep);
        assert(creep.memory.role === "builder" &&
            creep.memory.convertedFrom === "upgrader",
            "at the 99% safe mark, an RCL8 upgrader demotes to builder");
        delete Game.creeps.GapUp2;
        delete Memory.creeps.GapUp2;
    }

    Game.creeps.Up1 = savedUp1;
    Memory.creeps.Up1 = savedUp1Mem;
    controller.level = savedLevel;
    controller.ticksToDowngrade = savedTicks;
}

// --- rooms/spawning.js under attack must consider BOTH shapes of defense
// rooms/needs.js can want, not just "defender" (usuário reportou em
// produção: sala com invasor não spawnava nada). Past
// defender.pairEnergyThreshold (500 - trivially reached at RCL2 with a
// handful of extensions) rooms/needs.js zeroes `defender` and wants
// `defenderStriker`/`defenderMedic` instead (ROADMAP 0032 D2), but the
// under-attack role list here only ever checked "defender"/"bootstrap" -
// once a room crossed that threshold, NOTHING got queued for defense at
// all -----------------------------------------------------------------
{
    const spawnCreeps = require(path.join(PROJECT, "src/rooms/spawning"));
    Memory.rooms.AtkRoom = { defenseActive: true, enemies: 1 };

    const atkController = Object.assign(new RoomObject(), {
        id: "atk-ctrl", my: true, level: 2, ticksToDowngrade: 20000,
        pos: new RoomPosition(25, 25, "AtkRoom"),
    });

    function atkFind(lists) {
        return (type, opts) => {
            let list = lists[type] || [];
            if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
            return list;
        };
    }

    const atkSpawnCalls = [];
    const atkSpawn = Object.assign(new Spawn(), {
        id: "atk-spawn1", name: "AtkSpawn1", my: true, spawning: null,
        pos: new RoomPosition(25, 26, "AtkRoom"),
        spawnCreep: (body, name, opts) => {
            if (!opts || !opts.dryRun) {
                atkSpawnCalls.push({ name, role: opts && opts.memory && opts.memory.role });
            }
            return OK;
        },
    });

    const atkRoom = Object.assign(new Room("AtkRoom"), {
        controller: atkController, storage: null,
        // RCL2 with a handful of extensions crosses defender.pairEnergyThreshold
        // (500) easily - this is exactly the scenario that hit the bug
        energyAvailable: 550, energyCapacityAvailable: 550,
        find: atkFind({ [FIND_MY_SPAWNS]: [atkSpawn] }),
    });

    let threwAtk = null;
    try { spawnCreeps(atkRoom); } catch (e) { threwAtk = e; }
    assert(!threwAtk, "spawnCreeps() under attack in pair mode never throws" +
        (threwAtk ? "\n      " + (threwAtk.stack || threwAtk) : ""));
    assert(
        atkSpawnCalls.some((c) => c.role === "defenderStriker" || c.role === "defenderMedic"),
        "under attack past defender.pairEnergyThreshold, the room queues a " +
            "defenderStriker/defenderMedic instead of nothing (real bug this fixes, got: " +
            atkSpawnCalls.map((c) => c.role).join(", ") + ")"
    );
    assert(
        atkSpawnCalls.every((c) =>
            ["defender", "defenderStriker", "defenderMedic", "bootstrap"].includes(c.role)
        ),
        "under attack only defense-related roles (+ bootstrap) are ever queued (got: " +
            atkSpawnCalls.map((c) => c.role).join(", ") + ")"
    );
}

// --- rooms/spawning.js: pioneer only queues once every other role's own
// minimum is satisfied (usuário pediu: prioridade de pioneer só depois do
// mínimo dos outros creeps) - pioneer.js used to sit at its declared
// position in roles/index.js (between hauler and upgrader), so its request
// could out-rank upgrader/builder/reserver/etc whenever the room could only
// afford one body this tick. It now shares the same "!requests.length"
// luxury gate as scout/raider, checked last -----------------------------
{
    const spawnCreeps = require(path.join(PROJECT, "src/rooms/spawning"));
    const roles = require(path.join(PROJECT, "src/roles"));
    delete Memory.pendingSquad;

    const savedRoleFns = {};
    for (const name of Object.keys(roles)) {
        savedRoleFns[name] = { spawn: roles[name].spawn, spawnData: roles[name].spawnData };
    }
    function stubAllRolesFalse() {
        for (const name of Object.keys(roles)) {
            roles[name].spawn = () => false;
        }
    }
    function restoreRoleFns() {
        for (const name of Object.keys(roles)) {
            roles[name].spawn = savedRoleFns[name].spawn;
            roles[name].spawnData = savedRoleFns[name].spawnData;
        }
    }

    function mkPrioRoom(roomName) {
        Memory.rooms[roomName] = {};
        const calls = [];
        const spawn = Object.assign(new Spawn(), {
            id: roomName + "_spawn1", name: roomName + "Spawn1", my: true, spawning: null,
            pos: new RoomPosition(25, 26, roomName),
            spawnCreep: (body, name, opts) => {
                if (!opts || !opts.dryRun) calls.push(opts && opts.memory && opts.memory.role);
                return OK;
            },
        });
        const room = Object.assign(new Room(roomName), {
            controller: { my: true }, storage: null,
            energyAvailable: 300, energyCapacityAvailable: 300,
            find: (type) => (type === FIND_MY_SPAWNS ? [spawn] : []),
        });
        return { room, calls };
    }

    // Case A: upgrader (an ordinary, non-luxury role) still wants a creep -
    // pioneer must NOT even be asked, let alone win the spawn.
    stubAllRolesFalse();
    roles.upgrader.spawn = () => true;
    roles.upgrader.spawnData = () => ({ name: "PrioUp1", body: [WORK], memory: { role: "upgrader" } });
    roles.pioneer.spawn = () => {
        throw new Error("pioneer.spawn() must not be called while upgrader still wants one");
    };
    const caseA = mkPrioRoom("PrioRoomA");
    let threwA = null;
    try { spawnCreeps(caseA.room); } catch (e) { threwA = e; }
    assert(!threwA, "pioneer.spawn() was called before upgrader's own minimum was satisfied" +
        (threwA ? ": " + threwA.message : ""));
    assert(caseA.calls.indexOf("upgrader") !== -1 && caseA.calls.indexOf("pioneer") === -1,
        "with upgrader still unsatisfied, the room spawns the upgrader, never the pioneer (got: " +
            caseA.calls.join(", ") + ")");

    // Case B: every ordinary role is satisfied (spawn() -> false) but
    // pioneer still wants one - now it's the pioneer's turn.
    stubAllRolesFalse();
    roles.pioneer.spawn = () => true;
    roles.pioneer.spawnData = () => ({ name: "PrioPio1", body: [WORK, CARRY, MOVE], memory: { role: "pioneer" } });
    const caseB = mkPrioRoom("PrioRoomB");
    spawnCreeps(caseB.room);
    assert(caseB.calls.indexOf("pioneer") !== -1,
        "once every other role's minimum is satisfied, the pioneer is free to spawn (got: " +
            caseB.calls.join(", ") + ")");

    restoreRoleFns();
    delete Memory.rooms.PrioRoomA;
    delete Memory.rooms.PrioRoomB;
}

// --- ROADMAP 0052: notifyWhenAttacked(false) for routine-exposure roles --
{
    const scoutMod = require(path.join(PROJECT, "src/roles/scout"));
    const raiderMod = require(path.join(PROJECT, "src/roles/raider"));
    const dismantlerMod = require(path.join(PROJECT, "src/roles/squadDismantler"));
    const pioneerMod2 = require(path.join(PROJECT, "src/roles/pioneer"));
    const reserverMod3 = require(path.join(PROJECT, "src/roles/reserver"));

    // notifyWhenAttacked(false) is the very first thing each of these
    // run()s does - a try/catch is enough to observe that one side effect
    // even off a minimally-stubbed fixture that can't run the rest of
    // run() to completion (the roles' full behavior is already covered
    // elsewhere in this file).
    function calledNotifyOff(runFn, creep) {
        let called = false;
        creep.notifyWhenAttacked = (v) => { if (v === false) called = true; return OK; };
        try { runFn(creep); } catch (e) { /* only the first line matters here */ }
        return called;
    }

    function mkBareCreep(id, memory) {
        return Object.assign(Object.create(Creep.prototype), {
            id, room: { name: "W1N1", find: () => [] },
            pos: new RoomPosition(20, 20, "W1N1"), memory,
            moveTo: noop, move: noop, suicide: noop,
        });
    }

    assert(
        calledNotifyOff((c) => scoutMod.run(c), mkBareCreep("nwaScout1", { role: "scout" })),
        "scout calls notifyWhenAttacked(false)"
    );
    assert(
        calledNotifyOff((c) => raiderMod.run(c), mkBareCreep("nwaRaider1", { role: "raider" })),
        "raider calls notifyWhenAttacked(false)"
    );
    assert(
        calledNotifyOff((c) => dismantlerMod.run(c), mkBareCreep("nwaDismantler1", { role: "squadDismantler" })),
        "squadDismantler calls notifyWhenAttacked(false)"
    );
    assert(
        calledNotifyOff((c) => pioneerMod2.run(c), mkBareCreep("nwaPioneer1", { role: "pioneer" })),
        "pioneer calls notifyWhenAttacked(false)"
    );
    assert(
        calledNotifyOff((c) => reserverMod3.run(c), mkBareCreep("nwaReserverContest1", { role: "reserver", mission: "contest" })),
        "reserver on a 'contest' mission calls notifyWhenAttacked(false)"
    );
    assert(
        !calledNotifyOff((c) => reserverMod3.run(c), mkBareCreep("nwaReserverReserve1", { role: "reserver", mission: "reserve" })),
        "reserver on a 'reserve' mission does NOT call notifyWhenAttacked(false)"
    );
    assert(
        !calledNotifyOff((c) => reserverMod3.run(c), mkBareCreep("nwaReserverClaim1", { role: "reserver", mission: "claim" })),
        "reserver on a 'claim' mission does NOT call notifyWhenAttacked(false)"
    );
}

// --- ROADMAP 0079: Memory.stats fields that need room/structure state ---
// this fixture doesn't carry by default (market, storage+terminal energy,
// a spawning spawn, a rampart/wall to average) - each sub-block sets up
// just what it needs and restores the shared fixture afterward.
{
    const statsUtil = require(path.join(PROJECT, "src/utils/stats"));

    // market.credits - Game.market is absent by default in this fixture
    // (same as production before the bot ever calls into the real API);
    // utils/stats.js must degrade to 0 rather than throw either way.
    Game.market = { credits: 54321 };
    statsUtil();
    assert(Memory.stats.market.credits === 54321,
        "Memory.stats.market.credits reflects Game.market.credits (got " +
            Memory.stats.market.credits + ")");
    assert(Memory.stats.market.transactions === undefined,
        "no market.transactions is written - the bot never calls Game.market.deal() (ROADMAP 0079 out of scope)");
    delete Game.market;
    statsUtil();
    assert(Memory.stats.market.credits === 0,
        "Memory.stats.market.credits falls back to 0 without Game.market, instead of throwing (got " +
            Memory.stats.market.credits + ")");

    // totalEnergyAssets - trivial sum of the two fields already collected;
    // minerals - storage+terminal summed per base mineral, sparse (only
    // nonzero entries), same fixture doubles for both
    room.storage = Object.assign(new Structure(), {
        id: "statsStorage1",
        store: mineralStore({ [RESOURCE_ENERGY]: 4000, [RESOURCE_HYDROGEN]: 300 }, 300000),
    });
    room.terminal = Object.assign(new Structure(), {
        id: "statsTerminal1",
        store: mineralStore({ [RESOURCE_ENERGY]: 1500, [RESOURCE_OXYGEN]: 50 }, 300000),
    });
    statsUtil();
    assert(Memory.stats.rooms.W1N1.totalEnergyAssets === 5500,
        "totalEnergyAssets is storageEnergy + terminalEnergy (got " +
            Memory.stats.rooms.W1N1.totalEnergyAssets + ")");
    assert(Memory.stats.rooms.W1N1.minerals[RESOURCE_HYDROGEN] === 300 &&
        Memory.stats.rooms.W1N1.minerals[RESOURCE_OXYGEN] === 50 &&
        Object.keys(Memory.stats.rooms.W1N1.minerals).length === 2,
        "minerals sums storage+terminal per base mineral, only nonzero entries kept (got " +
            JSON.stringify(Memory.stats.rooms.W1N1.minerals) + ")");
    room.storage = null;
    room.terminal = null;

    // hatcheryUptime - fraction of spawns with .spawning truthy
    statsUtil();
    assert(Memory.stats.rooms.W1N1.hatcheryUptime === 0,
        "hatcheryUptime is 0 with no spawn spawning (got " +
            Memory.stats.rooms.W1N1.hatcheryUptime + ")");
    spawn.spawning = { name: "SomeCreep" };
    statsUtil();
    assert(Memory.stats.rooms.W1N1.hatcheryUptime === 1,
        "hatcheryUptime is 1 with the room's only spawn spawning (got " +
            Memory.stats.rooms.W1N1.hatcheryUptime + ")");
    spawn.spawning = null;

    // avgBarrierHits - throttled by stats.barrierHitsInterval, keeps the
    // last computed value in between recomputes instead of resetting
    Memory.settings = Memory.settings || {};
    Memory.settings.stats = { barrierHitsInterval: 50 };
    const rampartStats1 = Object.assign(new OwnedStructure(), {
        id: "rampartStats1", my: true, structureType: STRUCTURE_RAMPART,
        hits: 100, hitsMax: 300000, pos: new RoomPosition(30, 30, "W1N1"), room,
    });
    REG[rampartStats1.id] = rampartStats1;
    const savedMyStructures = findMap[FIND_MY_STRUCTURES];
    findMap[FIND_MY_STRUCTURES] = [spawn, tower, rampartStats1];

    Game.time += 1000; // clear of any throttle window left over from earlier ticks
    statsUtil();
    assert(Memory.stats.rooms.W1N1.avgBarrierHits === 100,
        "avgBarrierHits is computed from the room's rampart/wall hits (got " +
            Memory.stats.rooms.W1N1.avgBarrierHits + ")");

    rampartStats1.hits = 9000;
    Game.time += 1; // well inside the 50-tick throttle window
    statsUtil();
    assert(Memory.stats.rooms.W1N1.avgBarrierHits === 100,
        "avgBarrierHits stays at its last computed value inside the throttle window, " +
            "instead of disappearing/zeroing (got " + Memory.stats.rooms.W1N1.avgBarrierHits + ")");

    Game.time += 50; // past the throttle window
    statsUtil();
    assert(Memory.stats.rooms.W1N1.avgBarrierHits === 9000,
        "avgBarrierHits recomputes once the throttle window elapses (got " +
            Memory.stats.rooms.W1N1.avgBarrierHits + ")");

    findMap[FIND_MY_STRUCTURES] = savedMyStructures;
    delete REG[rampartStats1.id];
    delete Memory.settings.stats;
}

if (process.env.VERBOSE) origLog(logs.join("\n"));
origLog("phase3 plan: buildings=" + B3.length +
    " (planned=" + global.Memory.rooms.W1N1.planned + ")");
origLog("under attack spawns:", spawnCalls.slice(0, 8).map((c) => c.name).join(", ") || "(none)");
origLog("\nplan: buildings=" + B.length +
    "  towers=" + towers.length + " (base " + baseTowers.length +
    ", source " + srcTowers.length + ")" +
    "  sourceRamparts=" + srcRamparts.length +
    "  mincutBoxes=" + bnd.length);
origLog("\nMemory:", memStr.length, "bytes  |  rooms.W1N1 keys:",
    Object.keys(global.Memory.rooms.W1N1).join(","));
// ROADMAP 0098 dedicated assertions are kept at the end so they run after
// the broad regression phases without changing their fixtures.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const makeRoom = (name, energy) => ({ name, controller: { my: true }, storage: { id: name + "-storage", store: makeStore(energy, 300000) }, terminal: { id: name + "-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } });
    const oldRooms = Game.rooms;
    const a = makeRoom("W7N7", 20000), b = makeRoom("W7N8", 0);
    Game.rooms = Object.assign({}, oldRooms, { W7N7: a, W7N8: b });
    const first = terminalOps.transfer("W7N7", "W7N8", RESOURCE_ENERGY, 1000);
    const duplicate = terminalOps.transfer("W7N7", "W7N8", RESOURCE_ENERGY, 1000);
    assert(first.ok && !duplicate.ok, "0098 lock rejects a duplicate transfer for the same terminal/resource");
    const op = Memory.terminalOps.operations[first.id];
    assert(!Object.values(op).some((value) => value && typeof value === "object" && value.id && value.store), "0098 operation persists metadata, never a game object");
    const cancelled = global.cancelTerminalOperation(first.id);
    assert(cancelled.ok && op.state === "cancelled", "0098 cancellation releases an unloaded operation");
    Game.rooms = oldRooms;
}
// ROADMAP 0097: balance policy, idempotency and observability.
{
    const energyBalancing = require(path.join(PROJECT, "src/rooms/energyBalancing"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const makeRoom = (name, energy) => ({ name, controller: { my: true }, find: () => [], storage: { id: name + "-storage", store: makeStore(energy, 30000) }, terminal: { id: name + "-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } });
    const oldRooms = Game.rooms, oldMyRooms = Game.myRooms, oldBalancing = Memory.energyBalancing;
    const source = makeRoom("W7N1", 25000), target = makeRoom("W7N2", 0);
    Game.rooms = Object.assign({}, oldRooms, { W7N1: source, W7N2: target });
    Game.myRooms = [source, target];
    Memory.energyBalancing = { lastRun: 0, pending: {}, observations: {} };
    const before = Object.keys(Memory.terminalOps.operations).length;
    energyBalancing.run();
    const pending = Object.keys(Memory.terminalOps.operations).filter((id) => Memory.terminalOps.operations[id].automatic);
    energyBalancing.run();
    assert(pending.length === 1 && Object.keys(Memory.terminalOps.operations).filter((id) => Memory.terminalOps.operations[id].automatic).length === 1, "0097 creates one automatic operation and remains idempotent");
    assert(Memory.energyBalancing.pending.W7N2 && Memory.energyBalancing.observations.W7N2.requestedAmount > 0, "0097 persists pending operation and requested amount for observability");
    assert(Object.keys(Memory.terminalOps.operations).length === before + 1, "0097 delegates exactly one transfer to terminalOps");
    Game.rooms = oldRooms; Game.myRooms = oldMyRooms; Memory.energyBalancing = oldBalancing;
}
// ROADMAP 0098 regression coverage for the execution and recovery states.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const makeRoom = (name, storageEnergy, terminalEnergy) => ({ name, controller: { my: true }, find: () => [], storage: { id: name + "-storage", store: makeStore(storageEnergy, 30000) }, terminal: { id: name + "-terminal", cooldown: 0, store: makeStore(terminalEnergy, 30000), send: () => { makeRoom.sendCalls++; return OK; } } });
    makeRoom.sendCalls = 0;
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    const source = makeRoom("W7N3", 20000, 500), target = makeRoom("W7N4", 0, 0);
    Game.rooms = Object.assign({}, oldRooms, { W7N3: source, W7N4: target });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const partial = terminalOps.transfer("W7N3", "W7N4", RESOURCE_ENERGY, 1000);
    const partialOp = Memory.terminalOps.operations[partial.id];
    partialOp.loadedAmount = 500; partialOp.state = "atTerminal";
    terminalOps.tick();
    assert(makeRoom.sendCalls === 0 && ["queued", "waiting"].indexOf(partialOp.state) >= 0, "0098 partial transfer schedules the remaining load instead of sending early");
    const cooldown = terminalOps.transfer("W7N3", "W7N4", RESOURCE_ENERGY, 1000);
    assert(!cooldown.ok, "0098 lock prevents a second transfer while the partial one is active");
    partialOp.state = "atTerminal"; partialOp.loadedAmount = partialOp.amount; source.terminal.cooldown = 1;
    terminalOps.tick();
    assert(partialOp.state === "waiting" && /cooldown/.test(partialOp.error), "0098 cooldown keeps a loaded transfer waiting without duplicating send");
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    source.terminal.cooldown = 0; source.terminal.store[RESOURCE_ENERGY] = 200;
    terminalOps.tick();
    const receipt = Object.values(Memory.terminalOps.operations).find((op) => op.kind === "receipt");
    assert(receipt && ["waiting", "unloading"].indexOf(receipt.state) >= 0, "0098 baseline-zero receipt becomes a retryable operation when no hauler is available");
    Memory.terminalOps.events = [{ tick: Game.time - 10, room: "W7N3", kind: "transfer", amount: 7, credits: 0, transactionEnergy: 2 }];
    assert(terminalOps.stats("W7N3").amount === 7, "0098 stats expose the recent operation window");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// ROADMAP 0098 market execution never consumes more SELL cargo than the
// operation loaded and moves BUY operations to receipt handling.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const marketRoom = { name: "W7N5", controller: { my: true }, find: () => [], storage: { id: "W7N5-storage", store: makeStore(20000, 30000) }, terminal: { id: "W7N5-terminal", cooldown: 0, store: makeStore(500, 30000) } };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N5: marketRoom });
    let dealAmount = 0;
    Game.market = { credits: 100000, incomingTransactions: [], orders: {}, calcTransactionCost: () => 0, getAllOrders: () => [{ id: "order-1", roomName: "W7N6", price: 1, remainingAmount: 100 }], deal: (id, value) => { dealAmount = value; return OK; } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Memory.terminalOps.operations.sellTest = { id: "sellTest", kind: "sell", sourceRoom: "W7N5", resourceType: RESOURCE_ENERGY, amount: 100, remaining: 100, loadedAmount: 20, limit: 1, energyFairPrice: 0, state: "atTerminal", sentAmount: 0, createdTick: Game.time, updatedTick: Game.time };
    terminalOps.tick();
    assert(dealAmount === 20, "0098 SELL deals only the operation's tracked terminal cargo");
    Memory.terminalOps.operations.buyTest = { id: "buyTest", kind: "buy", sourceRoom: "W7N5", resourceType: RESOURCE_ENERGY, amount: 100, remaining: 100, loadedAmount: 0, limit: 2, energyFairPrice: 0, state: "queued", sentAmount: 0, createdTick: Game.time, updatedTick: Game.time };
    terminalOps.tick();
    assert(Memory.terminalOps.operations.buyTest.state === "awaitingReceipt" && dealAmount === 100, "0098 BUY deal transitions to receipt handling");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// 0098 send boundary: a loaded transfer issues one native intent.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    let sends = 0;
    const source = { name: "W7N9", controller: { my: true }, find: () => [], storage: { id: "W7N9-storage", store: makeStore(10000, 30000) }, terminal: { id: "W7N9-terminal", cooldown: 0, store: makeStore(1000, 30000), send: () => { sends++; return OK; } } };
    const target = { name: "W7N10", controller: { my: true }, find: () => [], storage: { id: "W7N10-storage", store: makeStore(0, 30000) }, terminal: { id: "W7N10-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N9: source, W7N10: target });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const created = terminalOps.transfer("W7N9", "W7N10", RESOURCE_ENERGY, 1000);
    const op = Memory.terminalOps.operations[created.id]; op.loadedAmount = op.amount; op.state = "atTerminal";
    terminalOps.tick();
    assert(sends === 1 && op.state === "awaitingReceipt", "0098 loaded transfer calls Terminal.send exactly once");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps;
}
// ROADMAP 0098/0097 regressions for receipt recovery, aggregation and zero need.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const energyBalancing = require(path.join(PROJECT, "src/rooms/energyBalancing"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const target = { name: "W7N11", controller: { my: true }, find: () => [], storage: { id: "W7N11-storage", store: makeStore(0, 30000) }, terminal: { id: "W7N11-terminal", cooldown: 0, store: makeStore(100, 30000), send: () => OK } };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldCreeps = Game.creeps, oldGetObject = Game.getObjectById, oldMyRooms = Game.myRooms, oldOps = Memory.terminalOps, oldBalancing = Memory.energyBalancing;
    Game.rooms = Object.assign({}, oldRooms, { W7N11: target });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const receipt = { id: "receipt-test", kind: "receipt", sourceRoom: null, targetRoom: "W7N11", resourceType: RESOURCE_ENERGY, amount: 100, receivedAmount: 0, state: "unloading", haulerName: "DeadReceiptHauler", updatedTick: Game.time };
    Memory.terminalOps.operations[receipt.id] = receipt;
    Game.creeps = {};
    terminalOps.tick();
    assert(receipt.state === "waiting" && receipt.receivedAmount === 0, "0098 dead receipt hauler returns to a retryable unload state");
    const creep = { name: "PartialReceiptHauler", memory: { terminalJob: { operationId: receipt.id, direction: "unload", fromId: target.terminal.id, toId: target.storage.id, resourceType: RESOURCE_ENERGY, amount: 100 } }, store: makeStore(50, 100), transfer: () => OK, withdraw: () => OK };
    Game.creeps = { PartialReceiptHauler: creep };
    Game.getObjectById = (id) => id === target.terminal.id ? target.terminal : id === target.storage.id ? target.storage : null;
    receipt.haulerName = creep.name; receipt.state = "unloading";
    terminalOps.runHauler(creep);
    assert(receipt.state === "waiting" && receipt.receivedAmount === 50, "0098 partial receipt unload remains retryable with the remaining amount");
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Game.creeps = {};
    Game.market = { incomingTransactions: [{ transactionId: "tx-a", to: "W7N11", resourceType: RESOURCE_ENERGY, amount: 100 }, { transactionId: "tx-b", to: "W7N11", resourceType: RESOURCE_ENERGY, amount: 50 }] };
    terminalOps.tick();
    const aggregate = Object.values(Memory.terminalOps.operations).find((op) => op.kind === "receipt");
    assert(aggregate && aggregate.amount === 150 && Memory.terminalOps.seenIncoming["tx-b"], "0098 aggregates simultaneous receipts and preserves both transaction ids");
    const source = { name: "W7N12", controller: { my: true }, find: () => [], storage: { id: "W7N12-storage", store: makeStore(27000, 30000) }, terminal: { id: "W7N12-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } };
    const stable = { name: "W7N13", controller: { my: true }, find: () => [], storage: { id: "W7N13-storage", store: makeStore(21000, 30000) }, terminal: { id: "W7N13-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } };
    Game.rooms = Object.assign({}, oldRooms, { W7N12: source, W7N13: stable }); Game.myRooms = [source, stable];
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} }; Memory.energyBalancing = { lastRun: 0, pending: {}, observations: {} };
    energyBalancing.run();
    assert(Object.keys(Memory.terminalOps.operations).length === 0, "0097 does not send the maximum when normal target need is zero");
    Game.rooms = oldRooms; Game.market = oldMarket; Game.creeps = oldCreeps; Game.getObjectById = oldGetObject; Game.myRooms = oldMyRooms; Memory.terminalOps = oldOps; Memory.energyBalancing = oldBalancing;
}
// 0098 receipt aggregation keeps the BUY parent and old terminal records do
// not grow Memory forever.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const room = { name: "W7N14", controller: { my: true }, find: () => [], storage: { id: "W7N14-storage", store: makeStore(0, 30000) }, terminal: { id: "W7N14-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N14: room });
    Memory.terminalOps = { nextId: 1, operations: { buyParent: { id: "buyParent", kind: "buy", sourceRoom: "W7N14", targetRoom: null, resourceType: RESOURCE_ENERGY, amount: 150, remaining: 0, state: "awaitingReceipt", createdTick: Game.time, updatedTick: Game.time }, old: { id: "old", kind: "receipt", targetRoom: "W7N14", resourceType: RESOURCE_ENERGY, amount: 1, state: "completed", createdTick: Game.time - 20000, updatedTick: Game.time - 20000 } }, seenIncoming: {}, events: [], terminalBalance: {} };
    Game.market = { incomingTransactions: [{ transactionId: "buy-tx-a", to: "W7N14", resourceType: RESOURCE_ENERGY, amount: 100 }, { transactionId: "buy-tx-b", to: "W7N14", resourceType: RESOURCE_ENERGY, amount: 50 }] };
    terminalOps.tick();
    const receipt = Object.values(Memory.terminalOps.operations).find((op) => op.kind === "receipt");
    assert(receipt && receipt.parentId === "buyParent" && receipt.amount === 150, "0098 aggregated receipts retain the pending BUY parent");
    assert(!Memory.terminalOps.operations.old, "0098 garbage-collects finalized operations after retention");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// 0098 recovery timeout is bounded by terminalOps.recoveryTicks.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldOps = Memory.terminalOps;
    Memory.terminalOps = { nextId: 1, operations: { timeoutReceipt: { id: "timeoutReceipt", kind: "receipt", sourceRoom: null, targetRoom: "W7N11", resourceType: RESOURCE_ENERGY, amount: 10, receivedAmount: 0, state: "waiting", recoveryStartedTick: Game.time - 10001, updatedTick: Game.time } }, seenIncoming: {}, events: [], terminalBalance: {} };
    terminalOps.tick();
    assert(Memory.terminalOps.operations.timeoutReceipt.state === "failed", "0098 recovery timeout fails a stuck receipt deterministically");
    Memory.terminalOps = oldOps;
}
// Terminal operations reject non-storable resources while market snapshots
// may still enumerate them independently.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const a = { name: "W7N15", controller: { my: true }, storage: { id: "W7N15-storage", store: makeStore(10000, 30000) }, terminal: { id: "W7N15-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } };
    const b = { name: "W7N16", controller: { my: true }, storage: { id: "W7N16-storage", store: makeStore(0, 30000) }, terminal: { id: "W7N16-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } };
    const oldRooms = Game.rooms;
    Game.rooms = Object.assign({}, oldRooms, { W7N15: a, W7N16: b });
    const pixelTransfer = terminalOps.transfer("W7N15", "W7N16", "pixel", 1);
    assert(!pixelTransfer.ok, "0098 rejects non-storable pixel terminal operations without persisting them");
    Game.rooms = oldRooms;
}
// A managed SELL load must not be mistaken for an incoming receipt.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldCreeps = Game.creeps, oldMarket = Game.market, oldOps = Memory.terminalOps;
    const store = { O: 100, getFreeCapacity: () => 29900, getUsedCapacity: () => 100, getCapacity: () => 30000 };
    const room = { name: "W7N16", controller: { my: true }, storage: { id: "W7N16-storage", store: { getFreeCapacity: () => 30000 } }, terminal: { id: "W7N16-terminal", cooldown: 0, store, send: () => OK } };
    Game.rooms = Object.assign({}, oldRooms, { W7N16: room });
    Game.creeps = { ManagedSellHauler: { memory: { terminalJob: { operationId: "managed-sell" } } } };
    Game.market = { incomingTransactions: [] };
    Memory.terminalOps = { nextId: 1, operations: { "managed-sell": { id: "managed-sell", kind: "sell", sourceRoom: "W7N16", targetRoom: null, resourceType: "O", amount: 100, remaining: 100, loadedAmount: 100, state: "loading", haulerName: "ManagedSellHauler", createdTick: Game.time, updatedTick: Game.time } }, seenIncoming: {}, events: [], terminalBalance: {} };
    terminalOps.tick();
    assert(!Object.values(Memory.terminalOps.operations).some((op) => op.kind === "receipt"), "0098 does not turn managed SELL cargo into a synthetic receipt");
    Game.rooms = oldRooms; Game.creeps = oldCreeps; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// A market SELL without credits fails before createOrder and releases its
// resource lock; with enough credits it reaches order creation.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    const room = { name: "W7N19", controller: { my: true } };
    const orders = [
        { id: "energy-buy", resourceType: RESOURCE_ENERGY, type: ORDER_BUY, price: 60, remainingAmount: 1000, roomName: "W7N20" },
        { id: "energy-sell", resourceType: RESOURCE_ENERGY, type: ORDER_SELL, price: 70, remainingAmount: 1000, roomName: "W7N20" },
        { id: "pixel-buy", resourceType: "pixel", type: ORDER_BUY, price: 40000, remainingAmount: 100, roomName: "W7N20" },
        { id: "pixel-sell", resourceType: "pixel", type: ORDER_SELL, price: 60000, remainingAmount: 100, roomName: "W7N20" },
    ];
    Game.rooms = Object.assign({}, oldRooms, { W7N19: room });
    let createCalls = 0;
    Game.market = {
        credits: 0,
        incomingTransactions: [],
        orders: {},
        getAllOrders: (filter) => filter
            ? orders.filter((order) => order.type === filter.type && order.resourceType === filter.resourceType)
            : orders,
        createOrder: () => { createCalls++; return OK; },
    };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
 marketHistoryStore.clear(); market.reset();
    Game.time++;
    market.scan();
    const noFunds = terminalOps.sell("W7N19", "pixel", 50, 49500);
    terminalOps.tick();
    terminalOps.tick();
    const noFundsOp = Memory.terminalOps.operations[noFunds.id];
    assert(noFundsOp.state === "failed" && createCalls === 0 && /disponível 0/.test(noFundsOp.error),
        "pixel SELL without credits fails before createOrder with the fee diagnostics");
    const retry = terminalOps.sell("W7N19", "pixel", 50, 49500);
    assert(retry.ok, "failed pixel SELL releases the terminal/resource lock");

    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Game.market.credits = 200000;
 marketHistoryStore.clear(); market.reset();
    Game.time++;
    market.scan();
    const funded = terminalOps.sell("W7N19", "pixel", 50, 49500);
    terminalOps.tick();
    terminalOps.tick();
    const fundedOp = Memory.terminalOps.operations[funded.id];
    assert(fundedOp.state === "listing" && createCalls === 1,
        "pixel SELL with enough credits calls createOrder and enters listing");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}

// Market-only resources (pixel/access-key/CPU-unlock family) bypass physical
// storage while keeping the normal BUY/SELL API and operation accounting.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N17: { name: "W7N17", controller: { my: true } } });
    let deals = 0;
    const orders = [
        { id: "energy-buy", resourceType: RESOURCE_ENERGY, type: ORDER_BUY, price: 60, remainingAmount: 1000, roomName: "W7N18" },
        { id: "energy-sell", resourceType: RESOURCE_ENERGY, type: ORDER_SELL, price: 70, remainingAmount: 1000, roomName: "W7N18" },
        { id: "pixel-buy", resourceType: "pixel", type: ORDER_BUY, price: 500, remainingAmount: 100, roomName: "W7N18" },
        { id: "pixel-sell", resourceType: "pixel", type: ORDER_SELL, price: 600, remainingAmount: 100, roomName: "W7N18" },
    ];
    Game.market = { credits: 100000, incomingTransactions: [], getAllOrders: () => orders, calcTransactionCost: () => 999999, deal: () => { deals++; return OK; } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    marketHistoryStore.clear(); market.reset(); Game.time++; market.scan();
    const pixelBuy = terminalOps.buy("W7N17", "pixel", 2, 600);
    terminalOps.tick();
    const pixelSell = terminalOps.sell("W7N17", "pixel", 2, 400);
    terminalOps.tick();
    assert(pixelBuy.ok && pixelSell.ok && Memory.terminalOps.operations[pixelBuy.id].state === "completed" && Memory.terminalOps.operations[pixelSell.id].state === "completed" && deals === 2, "0098 market-only pixel BUY and SELL work without storage or terminal");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
