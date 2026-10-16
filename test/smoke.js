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
    STRUCTURE_KEEPER_LAIR: "keeperLair",
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
    BUILD_POWER: 5, REPAIR_POWER: 100, REPAIR_COST: 0.01, UPGRADE_CONTROLLER_POWER: 1,
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
// The suite changes room state and advances one tick at a time: roomNeeds must recompute each
// tick here (the in-game default keeps it needs.cacheTicks ticks; it has its own test below).
require(path.join(PROJECT, "src/utils/config")).defaults.needs.cacheTicks = 1;
// Memory.stats is rebuilt every 60 ticks in production (stats.publishInterval); the fixture
// reads it right after every tick, so it publishes every tick here (own test below).
require(path.join(PROJECT, "src/utils/config")).defaults.stats.publishInterval = 1;
// the fixture drives these state machines tick by tick: production runs them on a grid
// (craft.tickInterval 10, terminalOps.tickInterval 5) - own test below
require(path.join(PROJECT, "src/utils/config")).defaults.craft.tickInterval = 1;
// Legacy fixtures retain their original planner; 0127 has its own live policy cases.
require(path.join(PROJECT, "src/utils/config")).defaults.craft.labPolicy = false;
require(path.join(PROJECT, "src/utils/config")).defaults.terminalOps.tickInterval = 1;

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

function isNativeRoomBlocked(matrix) {
    if (!(matrix instanceof PathFinder.CostMatrix)) return false;
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) if (matrix.get(x, y) !== 255) return false;
    }
    return true;
}

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
assert(require(path.join(PROJECT, "src/utils/census")).count("W1N1", "hauler") >= 1, "census counted the migrated hauler");

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
// 0146: the one-off migration from Memory.rooms[x].buildings is gone (live: no room has one)
assert(planStore.getPlan("Wmig") === null,
    "0146: a legacy Memory.rooms[x].buildings plan is no longer migrated (the migration was retired)");

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

// --- ROADMAP 0112: critical spawn tier blocks, falls back to a min body --
{
    const spawning = require(path.join(PROJECT, "src/rooms/spawning"));
    const creepLogic = require(path.join(PROJECT, "src/roles"));
    const saved = {};
    for (const r of ["bootstrap", "miner", "hauler", "upgrader"]) {
        saved[r] = {
            spawn: creepLogic[r].spawn,
            spawnData: creepLogic[r].spawnData,
            spawnTier: creepLogic[r].spawnTier,
        };
    }
    const fullHauler = [CARRY, CARRY, MOVE, CARRY, CARRY, MOVE]; // 300
    creepLogic.bootstrap.spawn = () => false;
    creepLogic.miner.spawn = () => false;
    creepLogic.miner.spawnTier = () => "rest";
    creepLogic.hauler.spawn = () => true;
    creepLogic.hauler.spawnData = () => ({
        name: "h0112", body: fullHauler, memory: { role: "hauler" },
    });
    creepLogic.upgrader.spawn = () => true;
    creepLogic.upgrader.spawnData = () => ({
        name: "u0112", body: [WORK, CARRY, MOVE], memory: { role: "upgrader" },
    });

    const run = (energy) => {
        const spawned = [];
        const sp = Object.assign(new Spawn(), {
            id: "spawn0112", structureType: STRUCTURE_SPAWN, spawning: null,
            pos: new RoomPosition(10, 10, "W1N1"),
            spawnCreep(body, name, opts) {
                const cost = body.length * 50;
                if (cost > energy) return ERR_NOT_ENOUGH_ENERGY;
                if (!opts.dryRun) spawned.push({ name, body });
                return OK;
            },
        });
        const room = {
            name: "Crit0112", energyAvailable: energy,
            energyCapacityAvailable: 300, storage: null,
            find: (t) => (t === FIND_MY_SPAWNS ? [sp] : []),
        };
        Memory.rooms["Crit0112"] = {};
        Game.time++; // every run is its own tick: roomCache.mySpawns would reuse the previous run's spawn
        spawning(room);
        return spawned;
    };

    try {
        let out = run(100);
        assert(out.length === 0,
            "0112: no hauler affordable -> upgrader does NOT jump the queue");
        out = run(200);
        assert(out.length === 1 && out[0].name === "h0112" &&
            out[0].body.length === 3,
            "0112: zero haulers + full body unaffordable -> min-body hauler spawns");
        out = run(300);
        assert(out.length === 1 && out[0].name === "h0112" &&
            out[0].body.length === 6,
            "0112: full hauler body spawns when affordable");

        // a lone mini hauler exists and `wanted` is met: a full one still follows
        creepLogic.hauler.spawn = () => false;
        const census = require(path.join(PROJECT, "src/utils/census"));
        const origBy = census.creepsByRole, origCount = census.count;
        census.creepsByRole = (rn, role) =>
            rn === "Crit0112" && role === "hauler" ? [{ body: [1, 2, 3] }] : origBy(rn, role);
        census.count = (rn, role, d) =>
            rn === "Crit0112" && role === "hauler" ? 1 : origCount(rn, role, d);
        try {
            out = run(100);
            assert(out.length === 0,
                "0112: mini hauler alive -> waits (no upgrader) for the full hauler");
            out = run(300);
            assert(out.length === 1 && out[0].name === "h0112" &&
                out[0].body.length === 6,
                "0112: mini hauler alive, wanted met -> a full hauler is still spawned");
            census.creepsByRole = (rn, role) =>
                rn === "Crit0112" && role === "hauler" ? [{ body: fullHauler }] : origBy(rn, role);
            out = run(300);
            assert(out.length === 1 && out[0].name === "u0112",
                "0112: full hauler alive -> no extra hauler, normal tier resumes");
        } finally {
            census.creepsByRole = origBy;
            census.count = origCount;
        }
    } finally {
        for (const r of Object.keys(saved)) {
            Object.assign(creepLogic[r], saved[r]);
            for (const k of Object.keys(saved[r])) {
                if (saved[r][k] === undefined) delete creepLogic[r][k];
            }
        }
    }
}

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
// exactly at safeRange() (5): both sides can close 1 tile the same tick,
// landing next tick at range 3 (RANGED_ATTACK reach) - must retreat, not
// keep advancing (regression guard for the >= -> > fix).
Game.creeps.Harv1.pos.getRangeTo = () => 5;
assert(combat.takeCover(Game.creeps.Harv1) === true,
    "unarmed creep still retreats right at safeRange() - the closing-gap race");
Game.creeps.Harv1.pos.getRangeTo = () => 6;
assert(combat.takeCover(Game.creeps.Harv1) === false,
    "unarmed creep one tile past safeRange() keeps working");
Game.creeps.Harv1.pos.getRangeTo = () => 3;
// no defenseActive -> never takes cover
global.Memory.rooms.W1N1.defenseActive = false;
assert(combat.takeCover(Game.creeps.Harv1) === false,
    "no takeCover when the room is not under attack");
global.Memory.rooms.W1N1.defenseActive = true;

// --- isDangerous / excludeDangerZone: a pickup/delivery target must never
// be picked while it sits in the attack zone in the first place, not just
// reacted to after the fact (ROADMAP 0107 follow-up, user request) --------
const farPos = new RoomPosition(2, 2, "W1N1"); // range 19 from hostile (21,21)
assert(combat.isDangerous(farPos, room) === false,
    "a position far from every threat is not dangerous");
const nearPos = new RoomPosition(24, 24, "W1N1"); // range 3 - inside safeRange, not on a rampart
assert(combat.isDangerous(nearPos, room) === true,
    "a position within safeRange() of a threat is dangerous");

// own rampart, but far enough (range 4) that the melee hostile isn't
// adjacent to it - shielded despite being inside safeRange()
const rampartPos = new RoomPosition(25, 25, "W1N1");
rampartPos.lookFor = () => [{ structureType: STRUCTURE_RAMPART, my: true }];
assert(combat.isDangerous(rampartPos, room) === false,
    "own rampart shields from a threat that isn't melee-adjacent");

const safeCandidate = { pos: farPos };
const dangerousCandidate = { pos: nearPos };
const filtered = combat.excludeDangerZone([safeCandidate, dangerousCandidate], room);
assert(
    filtered.length === 1 && filtered[0] === safeCandidate,
    "excludeDangerZone drops a candidate inside the attack zone and keeps the safe one"
);

global.Memory.rooms.W1N1.defenseActive = false;
const bothCandidates = [safeCandidate, dangerousCandidate];
assert(
    combat.excludeDangerZone(bothCandidates, room) === bothCandidates,
    "excludeDangerZone is a no-op (same array) when the room isn't under attack"
);
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
const haulerPhaseMeter = require(path.join(PROJECT, "src/utils/cpuMeter"));
const savedHaulerPhaseSpan = haulerPhaseMeter.span;
const haulerPhases = [];
haulerPhaseMeter.span = (key, fn) => {
    haulerPhases.push(key);
    return savedHaulerPhaseSpan(key, fn);
};
try { hauler.run(hlb); } catch (e) { hThrew = e; }
finally { haulerPhaseMeter.span = savedHaulerPhaseSpan; }
assert(!hThrew, "hauler.run (full) does not throw" +
    (hThrew ? "\n      " + (hThrew.stack || hThrew) : ""));
assert(["hauler.cover", "hauler.terminalJob", "hauler.pickDeliver"].every(
    (key) => haulerPhases.filter((phase) => phase === key).length === 1),
    "ARK-116: full hauler preserves its delivery flow while measuring cover, terminal and delivery once");

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
    hSpawnPriority.pos = new RoomPosition(spawn.pos.x + 1, spawn.pos.y, spawn.pos.roomName);
    let spawnPriorityPathCalls = 0;
    hSpawnPriority.pos.findClosestByPath = () => { spawnPriorityPathCalls++; return spawn; };
    hauler.run(hSpawnPriority);
    assert(hSpawnPriority._to === "spawn1",
        "hauler prioritizes an empty spawn over a tower at 497/1000 (0091)");
    assert(spawnPriorityPathCalls === 0,
        "ARK-116: an adjacent eligible spawn receives delivery without a target-selection path search");
    Game.time++;
    const hFarSpawnPriority = makeCreep("HFarSpawnPriority", "hauler", { store: store(200, 200) });
    hFarSpawnPriority.pos = new RoomPosition(spawn.pos.x + 5, spawn.pos.y, spawn.pos.roomName);
    hFarSpawnPriority.pos.findClosestByPath = () => { spawnPriorityPathCalls++; return spawn; };
    hFarSpawnPriority.transfer = (t) => { hFarSpawnPriority._to = t && t.id; return OK; };
    hFarSpawnPriority.memory.job = "deliver";
    hauler.run(hFarSpawnPriority);
    assert(hFarSpawnPriority._to === "spawn1" && spawnPriorityPathCalls === 1,
        "ARK-116: a distant production target still uses path-based selection before tower refill");
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
    // the drops the case serves through findClosestByPath are also what room.find(FIND_DROPPED_RESOURCES)
    // returns, as in the game (the hauler pre-checks the room's drops before searching a path)
    if (lists[FIND_DROPPED_RESOURCES] !== undefined) findMap[FIND_DROPPED_RESOURCES] = lists[FIND_DROPPED_RESOURCES];
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

// --- ROADMAP 0107 (user request): a dropped pile over hauler.bigDropLoad
// (500) wins outright - even over spawn/extension hunger (essentialConsumer)
// and the receiving link it would otherwise pull from. It's about to decay
// or get scooped by someone else; a routine spawn refill can wait a few
// more ticks without going critical. -----
{
    const savedSpawnStoreBig = spawn.store;
    spawn.store = Object.assign(store(0, 300), { getFreeCapacity: () => 300 });

    const bigDrop = Object.assign(new Resource(), {
        id: "bigdrop1", resourceType: RESOURCE_ENERGY, amount: 600,
        pos: new RoomPosition(20, 21, "W1N1"),
    });
    REG[bigDrop.id] = bigDrop;

    const bigDropLink = Object.assign(new StructureLink(), {
        id: "bigdroplink", structureType: STRUCTURE_LINK, room, my: true,
        pos: new RoomPosition(21, 20, "W1N1"),
        store: store(400, 800), isCollector: () => false,
    });
    REG.bigdroplink = bigDropLink;
    findMap[FIND_MY_STRUCTURES].push(bigDropLink);

    Game.time++;
    const hBigDrop = makeCreep("HBigDrop", "hauler", {
        store: store(0, 800),
        pos: withFindLookup(new RoomPosition(20, 20, "W1N1"),
            { [FIND_DROPPED_RESOURCES]: [bigDrop] }),
    });
    hBigDrop.pickup = (t) => { hBigDrop._picked = t && t.id; return OK; };
    hBigDrop.withdraw = (t) => { hBigDrop._from = t && t.id; return OK; };
    hBigDrop.memory.job = "load";
    hauler.run(hBigDrop);
    assert(hBigDrop._picked === "bigdrop1" && !hBigDrop._from,
        "a >500 dropped energy pile wins outright, even over spawn/extension " +
            "hunger and the receiving link (ROADMAP 0107, got picked=" +
            hBigDrop._picked + " from=" + hBigDrop._from + ")");

    // same pile, but below the bigDrop bar (300) - essentialConsumer's link
    // still wins, same as the ROADMAP 0065 case above
    const modestDrop = Object.assign(new Resource(), {
        id: "modestdrop1", resourceType: RESOURCE_ENERGY, amount: 300,
        pos: new RoomPosition(20, 21, "W1N1"),
    });
    REG[modestDrop.id] = modestDrop;
    Game.time++;
    const hModestDrop = makeCreep("HModestDrop", "hauler", {
        store: store(0, 800),
        pos: withFindLookup(new RoomPosition(20, 20, "W1N1"),
            { [FIND_DROPPED_RESOURCES]: [modestDrop] }),
    });
    hModestDrop.pickup = (t) => { hModestDrop._picked = t && t.id; return OK; };
    hModestDrop.withdraw = (t) => { hModestDrop._from = t && t.id; return OK; };
    hModestDrop.memory.job = "load";
    hauler.run(hModestDrop);
    assert(hModestDrop._from === "bigdroplink" && !hModestDrop._picked,
        "a dropped pile at/below the bigDrop bar doesn't preempt essentialConsumer " +
            "(only the >500 tier does, got from=" + hModestDrop._from +
            " picked=" + hModestDrop._picked + ")");

    findMap[FIND_MY_STRUCTURES] =
        findMap[FIND_MY_STRUCTURES].filter((s) => s.id !== "bigdroplink");
    spawn.store = savedSpawnStoreBig;
}

// --- ROADMAP 0107 (user request): delivery-side contention avoidance -----
// two haulers shouldn't both head for the same near-full extension when
// one of them alone already covers what it needs.
{
    // required locally - the top-level `reservations` require lives further
    // down the file (require() is cached, so this is the same module)
    const reservations = require(path.join(PROJECT, "src/utils/reservations"));
    const dc1 = makeCreep("HDeliverContend1", "hauler", { store: store(200, 200) });
    const dc2 = makeCreep("HDeliverContend2", "hauler", { store: store(200, 200) });
    const dcExt = Object.assign(new OwnedStructure(), {
        id: "dcExt1", structureType: STRUCTURE_EXTENSION, my: true,
        pos: new RoomPosition(22, 22, "W1N1"), room,
        store: store(200, 250), // only 50 free
    });
    REG.dcExt1 = dcExt;
    const savedFind = findMap[FIND_MY_STRUCTURES];
    findMap[FIND_MY_STRUCTURES] = [dcExt];
    reservations.claimDeliver(dc1, "dcExt1");
    assert(
        reservations.availableDeliver(dc2, dcExt) === 0,
        "availableDeliver() zeroes out a target another hauler already carries enough to fill"
    );
    assert(
        reservations.availableDeliver(dc1, dcExt) === 50,
        "availableDeliver() doesn't subtract the asking creep's own claim from itself"
    );
    reservations.releaseDeliver(dc1);
    assert(
        reservations.availableDeliver(dc2, dcExt) === 50,
        "releaseDeliver() frees the target back up for other haulers"
    );
    findMap[FIND_MY_STRUCTURES] = savedFind;
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
    // ROADMAP 0111: labs are transitory - by default they hold no energy at
    // all (a reaction burns none); craft.labEnergyTarget opts a boost setup in.
    const savedLabSettings = Memory.settings;
    Memory.settings = Object.assign({}, savedLabSettings);
    hauler.run(hLab);
    assert(hLab._to !== "lab1",
        "0111 AC6: by default a lab is NOT topped off with energy - labs are transitory (got " + hLab._to + ")");
    Memory.settings = Object.assign({}, savedLabSettings, { craft: { labEnergyTarget: 2000 } });
    hLab._to = undefined;
    Game.time++; // hauler.js's per-tick derived() cache
    hauler.run(hLab);
    assert(hLab._to === "lab1",
        "hauler tops off a lab once towers/spawn/storage are all satisfied (ROADMAP 0043, now opt-in via craft.labEnergyTarget)");
    Memory.settings = savedLabSettings;

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
    const savedOptionalSettings = Memory.settings;
    Memory.settings = Object.assign({}, savedOptionalSettings, { craft: { labEnergyTarget: 2000 } }); // lab must be a real consumer here
    hauler.run(hOptional);
    Memory.settings = savedOptionalSettings;
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
    const savedFuelSettings = Memory.settings.terminalFuel;
    Memory.settings.terminalFuel = { enabled: false };
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

    Memory.settings.terminalFuel = savedFuelSettings;
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

// 0113: with needs.cacheTicks > 1 the headcount is kept between ticks (compute() is ~0.3 CPU a
// room), but never while the room is under attack, and a console override applies at once
{
    const cfg = require(path.join(PROJECT, "src/utils/config"));
    // compute() steps the room's autoscale state: keep this block from leaking into the autoscale tests below
    const needsMemBackup = JSON.parse(JSON.stringify(Memory.rooms.W1N1));
    const needsTime0 = Game.time;
    cfg.defaults.needs.cacheTicks = 5;
    Game.time += 70000000;
    needs.invalidate(room.name);
    const savedMiner2 = Game.creeps.Miner1;
    const first = needs.roomNeeds(room);
    delete Game.creeps.Miner1; // the room now lacks a miner: bootstrap should be wanted...
    Game.time += 2;
    assert(needs.roomNeeds(room) === first && first.bootstrap === 0, "0113: a computed headcount is served from the cache inside the window");
    Game.time += 3; // 5 ticks after the first compute
    assert(needs.roomNeeds(room).bootstrap === 1, "0113: ...and recomputed once the window has passed");
    // under attack: recomputed every tick
    Game.creeps.Miner1 = savedMiner2;
    Game.time++;
    needs.invalidate(room.name);
    needs.roomNeeds(room);
    Memory.rooms.W1N1.defenseActive = true;
    delete Game.creeps.Miner1;
    Game.time++;
    assert(needs.roomNeeds(room).bootstrap === 1, "0113: a room under attack is never served from the cache");
    Memory.rooms.W1N1.defenseActive = false;
    Game.creeps.Miner1 = savedMiner2;
    // console override: immediate
    Game.time++;
    needs.invalidate(room.name);
    needs.roomNeeds(room);
    Game.time++;
    global.setWanted("W1N1", "upgrader", 7);
    assert(needs.roomNeeds(room).upgrader === 7, "0113: setWanted applies at once, not after the cache window");
    global.clearWanted("W1N1");
    cfg.defaults.needs.cacheTicks = 1;
    Game.time++;
    needs.invalidate(room.name);
    Memory.rooms.W1N1 = needsMemBackup;
    Game.time = needsTime0; // autoscale compares lastAdjustTick with Game.time
}

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
    id: "needsMinExtractor1", structureType: STRUCTURE_EXTRACTOR, my: true, pos: mineral.pos,
});
const mineralContainer = Object.assign(new StructureContainer(), {
    id: "needsMinContainer1", structureType: STRUCTURE_CONTAINER, pos: mineral.pos,
});
findMap[FIND_STRUCTURES].push(mineralExtractor, mineralContainer); // the room cache finds them by position
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
findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "needsMinExtractor1" && s.id !== "needsMinContainer1");
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

// The miner now asks roomCache (room.find(FIND_STRUCTURES) + a coordinate check) what is next to
// it instead of pos.findInRange: each case sets that room list, in a fresh tick (per-tick cache).
const minerRoomFind = room.find;
function minerNear(list) {
    room.find = (type, opts) => {
        if (type !== FIND_STRUCTURES) return minerRoomFind.call(room, type, opts);
        return opts && typeof opts.filter === "function" ? list.filter(opts.filter) : list;
    };
    Game.time++;
}
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
minerNear([mContainer]);
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
    minerNear([mContainer, mTower, mLink]);
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

// 2c. ROADMAP 0113: the miner forwards its harvest in full loads (each action costs ~0.2 CPU)
{
    const fiveWork = [{ type: MOVE }, { type: WORK }, { type: WORK }, { type: WORK }, { type: WORK }, { type: WORK }, { type: CARRY }];
    function batchMiner(held, opts) {
        opts = opts || {};
        room.energyAvailable = 300;
        room.energyCapacityAvailable = 300;
        const c = Object.assign(Object.create(Creep.prototype), {
            id: "mbatch", room, store: Object.assign(store(held, 50), { getFreeCapacity: () => 50 - held }),
            pos: new RoomPosition(4, 5, "W1N1"), body: fiveWork,
            harvest: () => OK, move: () => OK, moveTo: () => OK, ticksToLive: opts.ttl === undefined ? 1000 : opts.ttl,
        });
        c.memory = { role: "miner", target: "msrc", seat: [4, 5], onContainer: true };
        c.actions = [];
        c.transfer = (t) => { c.actions.push("transfer:" + (t && t.id)); return OK; };
        c.withdraw = (t) => { c.actions.push("withdraw:" + (t && t.id)); return OK; };
        c.pickup = () => { c.actions.push("pickup"); return OK; };
        mTower.store = Object.assign(store(900, 1000), { getCapacity: () => 1000, getFreeCapacity: () => 100 });
        mContainer.store = Object.assign(store(opts.containerEnergy || 0, 2000), { getFreeCapacity: () => 2000 - (opts.containerEnergy || 0) });
        c.pos.lookFor = () => [mContainer];
        minerNear([mContainer, mLink]);
        const saved = Memory.settings;
        Memory.settings = Object.assign({}, saved, { miner: { batchTransfer: opts.batch !== false } });
        miner.run(c);
        Memory.settings = saved;
        return c.actions;
    }
    assert(batchMiner(10).length === 0, "0113: a miner with room for another harvest keeps filling - no transfer this tick (" + batchMiner(10).join() + ")");
    assert(batchMiner(30).length === 0, "0113: ...even at 30/50 (the next harvest of 10 still fits)");
    assert(batchMiner(41).join() === "transfer:mlink", "0113: once the next harvest would no longer fit it sends the load to the link (" + batchMiner(41).join() + ")");
    assert(batchMiner(10, { ttl: 2 }).join() === "transfer:mlink", "0113: a dying miner flushes what it holds");
    assert(batchMiner(0, { containerEnergy: 100 }).length === 0, "0113: a small container stock is left to the haulers - no withdraw");
    assert(batchMiner(0, { containerEnergy: 900 }).join() === "withdraw:mcont", "0113: a container backlog is still drained into the miner (" + batchMiner(0, { containerEnergy: 900 }).join() + ")");
    assert(batchMiner(10, { batch: false }).join() === "transfer:mlink", "0113: miner.batchTransfer = false restores the every-tick transfer");
    // fewer actions in total: 50 energy per 5 ticks = one transfer in five ticks
    let sent = 0, held = 0;
    for (let t = 0; t < 10; t++) {
        held += 10;
        if (batchMiner(held).length) { sent++; held = 0; }
    }
    assert(sent === 2, "0113: ten ticks of harvest cost two transfers instead of ten (" + sent + ")");
}

// 2d. ROADMAP 0117: with the source empty (waiting to regenerate) the miner empties its
// store and the container into the link/tower instead of waiting for a full load/backlog
{
    const body = [{ type: MOVE }, { type: WORK }, { type: WORK }, { type: WORK }, { type: WORK }, { type: WORK }, { type: CARRY }];
    function drainMiner(held, o) {
        o = o || {};
        room.energyAvailable = 300;
        room.energyCapacityAvailable = 300;
        const c = Object.assign(Object.create(Creep.prototype), {
            id: "mdrain", room, store: Object.assign(store(held, 50), { getFreeCapacity: () => 50 - held }),
            pos: new RoomPosition(4, 5, "W1N1"), body, harvest: () => ERR_NOT_ENOUGH_RESOURCES,
            move: () => OK, moveTo: () => OK, ticksToLive: 1000,
        });
        c.memory = { role: "miner", target: "msrc", seat: [4, 5], onContainer: true };
        c.actions = [];
        c.transfer = (t) => { c.actions.push("transfer:" + (t && t.id)); return OK; };
        c.withdraw = (t) => { c.actions.push("withdraw:" + (t && t.id)); return OK; };
        c.pickup = () => { c.actions.push("pickup"); return OK; };
        mTower.store = Object.assign(store(900, 1000), { getCapacity: () => 1000, getFreeCapacity: () => 100 });
        const ce = o.containerEnergy || 0;
        mContainer.store = Object.assign(store(ce, 2000), { getFreeCapacity: () => 2000 - ce });
        c.pos.lookFor = () => [mContainer];
        minerNear(o.near || [mContainer, mLink]);
        mSource.energy = o.sourceEnergy === undefined ? 0 : o.sourceEnergy;
        miner.run(c);
        mSource.energy = 3000;
        return c.actions;
    }
    assert(drainMiner(10).join() === "transfer:mlink",
        "0117: source empty -> a partial load is flushed to the link right away (" + drainMiner(10).join() + ")");
    assert(drainMiner(10, { sourceEnergy: 3000 }).length === 0,
        "0117: source with energy -> unchanged, keeps filling for a full load");
    assert(drainMiner(0, { containerEnergy: 100 }).join() === "withdraw:mcont",
        "0117: source empty -> a small container stock is drained too (no 500 backlog gate) (" + drainMiner(0, { containerEnergy: 100 }).join() + ")");
    assert(drainMiner(0, { containerEnergy: 100, sourceEnergy: 3000 }).length === 0,
        "0117: source with energy -> a small container stock is still left to the haulers");
    assert(drainMiner(0, { containerEnergy: 0 }).length === 0,
        "0117: source empty and nothing to empty -> no actions");
    assert(drainMiner(0, { containerEnergy: 100, near: [mContainer] }).length === 0,
        "0117: source empty but no link/tower to receive -> container is not touched");
    assert(drainMiner(10, { near: [mContainer] }).join() === "transfer:mcont",
        "0117: source empty, no link -> the carried load still goes to the container");
    const both = drainMiner(10, { containerEnergy: 100 });
    assert(both.join() === "withdraw:mcont,transfer:mlink",
        "0117: source empty -> pull the container and flush the store in the same tick (" + both.join() + ")");
}
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
    minerNear(hasTower ? [mContainer, mTower] : [mContainer]);
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
minerNear([mContainer]);
miner.run(mArriving);
assert(squatter._shoved === true,
    "a non-miner on the seat is shoved off when the miner arrives");
room.find = minerRoomFind;
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
        "a road below the repair floor with NO recent traffic, on a tile the plan says nothing about, is left to decay");
    assert(traffic.worthRepairing(healthyHotRoad) === false,
        "a road still above the repair floor is skipped even with traffic");
    assert(traffic.worthRepairing(wall) === true,
        "the traffic rule only applies to roads - any other structure type is always worth repairing");

    // 0108: on a tile the city plan reserves for a road, the heat
    // requirement no longer applies - the plan outranks the counter.
    // Its own room: W9N9 above must stay plan-less for the architect
    // preview test further down.
    const planStoreTraffic = require(path.join(PROJECT, "src/utils/planStore"));
    const TRP = "W9N8";
    const plannedRoom = { name: TRP };
    planStoreTraffic.mutate(TRP, (plan) => {
        plan.buildings.push({ x: 31, y: 31, structureType: STRUCTURE_ROAD, minimalRCL: 3 });
    });
    const plannedColdRoad = Object.assign(new Structure(), {
        structureType: STRUCTURE_ROAD, hits: 100, hitsMax: 5000,
        pos: new RoomPosition(31, 31, TRP), room: plannedRoom,
    });
    const plannedHealthyRoad = Object.assign(new Structure(), {
        structureType: STRUCTURE_ROAD, hits: 4000, hitsMax: 5000,
        pos: new RoomPosition(31, 31, TRP), room: plannedRoom,
    });
    Game.time++;
    assert(traffic.worthRepairing(plannedColdRoad) === true,
        "a PLANNED road below the repair floor is worth repairing even with no traffic at all");
    assert(traffic.worthRepairing(plannedHealthyRoad) === false,
        "the repair floor still applies to a planned road - a healthy one is skipped");
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
        bRoad.memory.stack && bRoad.memory.stack[0][1] === "cold_road",
        "builder queues repair for a PLANNED damaged road even with no recent traffic on its tile"
    );

    // an equally damaged road the plan does NOT reserve stays out of the
    // queue - being in the plan is what replaced the traffic requirement,
    // not the traffic rule disappearing altogether
    const unplannedRoad = Object.assign(new Structure(), {
        id: "unplanned_road", structureType: STRUCTURE_ROAD, hits: 100, hitsMax: 5000,
        pos: new RoomPosition(3, 48, "W1N1"), room,
    });
    REG.unplanned_road = unplannedRoad;
    findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "cold_road");
    findMap[FIND_STRUCTURES].push(unplannedRoad);
    Game.time++;
    const bRoad2 = makeCreep("BldRoad2", "builder", {
        store: store(50, 50), pos: new RoomPosition(3, 47, "W1N1"),
    });
    builder.run(bRoad2);
    assert(
        !bRoad2.memory.stack || bRoad2.memory.stack[0][1] !== "unplanned_road",
        "builder still ignores a damaged road that is neither planned nor on a tile with traffic"
    );
    findMap[FIND_STRUCTURES] = findMap[FIND_STRUCTURES].filter((s) => s.id !== "unplanned_road");

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
        body: [{ type: CARRY }, { type: MOVE }],
    };
    // A pure-WORK creep has no ATTACK/RANGED_ATTACK yet is still a real
    // threat inside our own room - it can dismantle ramparts/walls same as
    // any siege unit (live case, 2026-09-25: a dismantler like this went
    // completely undetected, so the defender guarding it never engaged).
    const dismantlerUnknown = {
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
        "an unknown, WORK-less and ATTACK-less player is not hostile in a room I own");
    assert(hostiles.isHostile(dismantlerUnknown, ownedRoom) === true,
        "an unknown WORK-only (dismantler) creep IS hostile in a room I own, even with no ATTACK/RANGED_ATTACK");
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

// --- rampart gates: one decision per room, only the gates open ---------
{
    const rampartLogic = require(path.join(PROJECT, "src/structures/rampart"));
    const gatesMod = require(path.join(PROJECT, "src/utils/rampartGates"));

    // Room "GATE1": edges are wall except an exit on the west (0,20..30) and one on the east
    // (49,20..30); a wall of ramparts at x=25 splits the room, so an ally going west->east has
    // to cross it. The harness PathFinder ignores obstacles, so use a breadth-first search that
    // honours the cost matrix (255 = blocked) and the terrain.
    const realTerrainClass = Room.Terrain;
    class GateTerrain {
        get(x, y) {
            const edge = x === 0 || x === 49 || y === 0 || y === 49;
            if (!edge) return 0;
            return (x === 0 || x === 49) && y >= 20 && y <= 30 ? 0 : 1;
        }
    }
    Room.Terrain = GateTerrain;
    const realSearchGate = PathFinder.search;
    PathFinder.search = (origin, goal, opts) => {
        const matrix = opts.roomCallback(origin.roomName);
        const terr = new GateTerrain();
        const key = (x, y) => x * 50 + y;
        const prev = new Map([[key(origin.x, origin.y), null]]);
        const queue = [[origin.x, origin.y]];
        const target = goal.pos;
        while (queue.length) {
            const [x, y] = queue.shift();
            if (x === target.x && y === target.y) break;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nx = x + dx, ny = y + dy;
                    if ((!dx && !dy) || nx < 0 || ny < 0 || nx > 49 || ny > 49 || prev.has(key(nx, ny))) continue;
                    if (terr.get(nx, ny) & 1) continue;
                    if (matrix && matrix.get(nx, ny) === 255) continue;
                    prev.set(key(nx, ny), [x, y]);
                    queue.push([nx, ny]);
                }
            }
        }
        if (!prev.has(key(target.x, target.y))) return { path: [], incomplete: true, ops: 0 };
        const path = [];
        for (let at = [target.x, target.y]; at && prev.get(key(at[0], at[1])) !== null; at = prev.get(key(at[0], at[1]))) {
            path.unshift(new RoomPosition(at[0], at[1], origin.roomName));
        }
        return { path, incomplete: false, ops: path.length };
    };

    let creepsIn = [];
    const structsFor = {};
    const mkGateRoom = (name, structures) => {
        structsFor[name] = structures;
        return {
            name, controller: undefined, energyAvailable: 0, energyCapacityAvailable: 0,
            find: (type) => {
                if (type === FIND_STRUCTURES || type === FIND_MY_STRUCTURES) return structsFor[name];
                if (type === FIND_HOSTILE_CREEPS) return creepsIn;
                return [];
            },
        };
    };
    let setPublicCalls = 0;
    const mkRamp = (roomName, x, y) => {
        const r = Object.assign(new OwnedStructure(), {
            id: "gr-" + roomName + "-" + x + "-" + y, structureType: STRUCTURE_RAMPART, my: true,
            pos: new RoomPosition(x, y, roomName), isPublic: false,
        });
        r.setPublic = (v) => { r.isPublic = v; setPublicCalls++; };
        REG[r.id] = r;
        return r;
    };
    const wall = [];
    for (let y = 1; y <= 48; y++) wall.push(mkRamp("GATE1", 25, y));
    const gateRoom = mkGateRoom("GATE1", wall.slice());
    Memory.rooms.GATE1 = {};
    gatesMod.reset();
    rampartLogic.resetSweep();

    const ally = { id: "ga1", owner: { username: "fR1dj" }, pos: new RoomPosition(5, 25, "GATE1"), body: [{ type: MOVE }] };
    const invader = { id: "ge1", owner: { username: "Invader" }, pos: new RoomPosition(6, 25, "GATE1"), body: [{ type: ATTACK }] };
    const claimer = { id: "ge2", owner: { username: "stranger" }, pos: new RoomPosition(6, 26, "GATE1"), body: [{ type: CLAIM }, { type: MOVE }] };
    const scout = { id: "ge3", owner: { username: "stranger" }, pos: new RoomPosition(6, 27, "GATE1"), body: [{ type: MOVE }] };
    const openOnes = () => wall.filter((r) => r.isPublic).length;
    const step = (list) => { creepsIn = list; Game.time++; rampartLogic.runRoom(gateRoom); };

    step([]);
    const info = gatesMod.ensure(gateRoom);
    assert(info.exits === 2 && info.pairs === 1 && info.blocked === 1 && info.ids.length === 1 && info.gates[info.ids[0]].x === 25,
        "rampartGates: 2 exits split by a wall of ramparts -> exactly 1 gate, on the wall (" + JSON.stringify({ e: info.exits, p: info.pairs, b: info.blocked, g: info.ids.length }) + ")");
    assert(openOnes() === 0, "rampart: nobody in the room -> every rampart closed");

    setPublicCalls = 0;
    step([ally]);
    assert(openOnes() === 1 && REG[info.ids[0]].isPublic === true && setPublicCalls === 1,
        "rampart: an ally and no threat opens ONLY the gate, with a single intent (" + openOnes() + " open, " + setPublicCalls + " calls)");

    step([ally, scout]);
    assert(openOnes() === 1, "rampart: an unarmed non-ally scout is not a threat - the gate stays open");

    setPublicCalls = 0;
    step([ally, invader]);
    assert(openOnes() === 0 && setPublicCalls === 1, "rampart: an Invader closes the gate on the same tick");

    step([ally]);
    assert(openOnes() === 1, "rampart: the threat gone and the ally still there - the gate opens again");
    step([ally, claimer]);
    assert(openOnes() === 0, "rampart: a non-ally with CLAIM counts as a threat and closes the gate");

    step([]);
    assert(openOnes() === 0, "rampart: allies gone - closed");

    // a public rampart that is not a gate (old logic / moved gate) is closed by the sweep
    wall[3].isPublic = true;
    rampartLogic.resetSweep();
    step([]);
    assert(wall[3].isPublic === false, "rampart: a stale public non-gate rampart is closed by the sweep");

    // rampartGates(): the console command lists the room and its gate
    const savedMyRooms = Game.myRooms;
    Game.myRooms = [gateRoom];
    const gateLogs = [];
    console.log = (...a) => { gateLogs.push(a.join(" ")); };
    global.rampartGates();
    console.log = origLog;
    Game.myRooms = savedMyRooms;
    assert(gateLogs.some((l) => l.indexOf("GATE1: 1 portão(ões) de 48 ramparts") !== -1 && l.indexOf("25,") !== -1),
        "rampartGates() prints the gate of the room (" + gateLogs.join(" | ").slice(0, 160) + ")");

    // no wall: the ally walks around, nothing is a gate and nothing ever opens
    const emptyRoom = mkGateRoom("GATE2", []);
    Memory.rooms.GATE2 = {};
    const lone = mkRamp("GATE2", 10, 10); // a rampart off any route
    structsFor.GATE2 = [lone];
    setPublicCalls = 0;
    creepsIn = [ally];
    Game.time++;
    rampartLogic.runRoom(emptyRoom);
    assert(gatesMod.ensure(emptyRoom).ids.length === 0 && setPublicCalls === 0 && lone.isPublic === false,
        "rampartGates: when the exits connect without crossing a rampart there are no gates and nothing opens");

    PathFinder.search = realSearchGate;
    Room.Terrain = realTerrainClass;
    creepsIn = [];
    delete Memory.rooms.GATE1;
    delete Memory.rooms.GATE2;
    gatesMod.reset();
}
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
    // The tower keeps the ids of damaged structures for a few ticks (heap scan) and
    // re-resolves them with Game.getObjectById: the mocks must be resolvable, and each
    // case starts without the previous case's scan.
    let testObjects = {};
    function mkTestTower(structures, storage, energy) {
        let repaired = null;
        towerMod.resetRepairScan();
        testObjects = {};
        structures.forEach((s) => { testObjects[s.id] = s; });
        if (!Game.getObjectById.towerTestWrapper) {
            const inner = Game.getObjectById;
            Game.getObjectById = (id) => testObjects[id] || inner(id);
            Game.getObjectById.towerTestWrapper = true;
        }
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
            // each case builds its own set of structures under the same room name: drop the shared 5-tick damaged scan
            require(path.join(PROJECT, "src/utils/damagedStructures")).reset();
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
    const signDestinationSince = sourceScout.memory.signTravelSince;
    sourceScout.memory._routeAvoid = ["WBlockedRoom"];
    sourceScout.room = Object.assign({}, room, { name: "W2N3" });
    Game.time++;
    scout.run(sourceScout);
    assert(routedTo[2] === "W3N3",
        "signRoom scout keeps travelling to the destination after leaving the source");
    assert(sourceScout.memory.signTravelTarget === "to:W3N3" &&
        sourceScout.memory.signTravelSince === signDestinationSince &&
        sourceScout.memory._routeAvoid[0] === "WBlockedRoom",
        "0129: leaving the sign source preserves destination phase timeout and route state");
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
            getTerrain: () => ({ get: () => 0 }),
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

        // border tiles are never a valid squad slot (striker walked off the
        // map while closing on an invader core hugging the exit)
        REG.lead.pos = new RoomPosition(20, 1, "SquadRoom");
        assert(squadMod.shapeFits(REG.lead, Memory.squads.sq2, "column", 1) === false,
            "shapeFits() is false when the leader's next tile is an exit tile (y=0)");
        REG.lead.pos = new RoomPosition(20, 20, "SquadRoom");
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
    assert(isNativeRoomBlocked(rsvMoveOpts.costCallback("SomeUnrelatedRoom", rsvCm)),
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
    assert(isNativeRoomBlocked(rmMinerMoveOpts.costCallback("SomeUnrelatedRoom", rmMinerCm)),
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
    assert(isNativeRoomBlocked(rmHaulerMoveOpts.costCallback("SomeUnrelatedRoom", rmHaulerCm)),
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
        // the engine keeps these in step with the spawn's store: an empty spawn means energyAvailable < capacity
        const savedAvailableRemote = room.energyAvailable;
        room.energyAvailable = 0;
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
        room.energyAvailable = savedAvailableRemote;
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
    assert(isNativeRoomBlocked(routingCb("E15N15", routingCm)),
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
    assert(isNativeRoomBlocked(slackHostileCb("E11N10Hostile", routingCm)),
        "routeCostCallback's slack never adds a known-hostile neighbor under blockHostiles");
    delete Memory.rooms["E10N10x"];
    delete Memory.rooms["E11N10Hostile"];

    const noIntelCb = routing.routeCostCallback(
        [{ exit: 1, room: "E10N10NoIntel" }, { exit: 1, room: "E10N20" }],
        "W1N1", "E10N20"
    );
    assert(isNativeRoomBlocked(noIntelCb("E10N9", routingCm)),
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
    assert(isNativeRoomBlocked(avoidCb("WAvoidedRoom", routingCm)),
            "avoidCostCallback excludes a room in the avoid list outright");
        assert(avoidCb("WTotallyUnrelatedRoom", routingCm) === routingCm,
            "avoidCostCallback leaves every other room open, unlike routeCostCallback's " +
                "curated allowlist - this is the whole point: computeRealRoute() itself used " +
                "this same freedom to validate the route, so execution gets it too");

        Memory.rooms.WAvoidHostile = { enemies: 1 };
        const avoidHostileCb = routing.avoidCostCallback([], { blockHostiles: true });
    assert(isNativeRoomBlocked(avoidHostileCb("WAvoidHostile", routingCm)),
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
        assert(seenMaxOps === require(path.join(PROJECT, "src/utils/config")).get("routing.hopMaxOps", 20000),
            "ARK-116: failed validation uses the configured hop budget rather than the full-trip override");
        assert(seenMaxRooms === 2,
            "ARK-116: failed validation limits native fallback to the current room and next hop");

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
    assert(isNativeRoomBlocked(seenCostCallback("WSomeUnrelatedRoom", cm)),
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
    assert(isNativeRoomBlocked(seenCostCallback2("WBlockedRoom", cm2)),
                "opts.avoid still excludes a room outright under the blocklist-based callback");
    assert(isNativeRoomBlocked(seenCostCallback2("WAnyOtherRoom", cm2)),
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
    assert(isNativeRoomBlocked(seenCostCallback3("WSomeRoomNeverInTheRoute", cm3)),
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
            const meter = require(path.join(PROJECT, "src/utils/cpuMeter"));
            const originalSpan = meter.span, measured = [];
            let result;
            meter.span = (key, fn) => { measured.push(key); return originalSpan(key, fn); };
            try {
                result = routing.moveToRoom(failedCreep, "W9N9", { range: 20, realRoute: true });
            } finally { meter.span = originalSpan; }
            assert(measured.filter((key) => key === "routing.moveFallback").length === 1 &&
                !measured.includes("routing.movePlanned"),
                "ARK-116: failed route validation attributes native fallback movement without changing its return");
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
    assert(isNativeRoomBlocked(cb("WMazeRoom", cm)),
                "routeCostCallback excludes a shared dead end even though findRoute() itself " +
                    "picked it as part of the route (AC3)");
        }
        {
            const cbAvoid = routing.avoidCostCallback([], {});
    assert(isNativeRoomBlocked(cbAvoid("WMazeRoom", new PathFinder.CostMatrix())),
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
            "contestRoom", "cancelContest", "pioneerStatus", "rampartGates"]
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
    const pioneerTripBucket = Game.cpu.bucket;
    try {
        Game.time++; Game.cpu.bucket = 667;
        pc = mkPioneerCreep({
            room: mkRoom(homeRoomName), pos: new RoomPosition(25, 25, homeRoomName),
            targetRoom: targetRoomName, home: homeRoomName, energy: 100,
        });
        pioneerMod.run(pc.creep);
        assert(pc.movedTo() && pc.movedTo().t.roomName === targetRoomName && pc.movedTo().o.maxRooms === 2,
            "ARK-116: the pioneer role opts into bounded outbound travel at bucket667");
    } finally { Game.cpu.bucket = pioneerTripBucket; }

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

    const savedPixelSettings = Memory.settings;
    Memory.settings = Object.assign({}, savedPixelSettings, { pixel: { headroomGate: false } });
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

    // headroom gate: a pixel zeroes the bucket, so it needs a published average with room under the limit
    Memory.settings = Object.assign({}, savedPixelSettings, { stats: { cpuWindowTicks: 1 } });
    const pixelMeter = require(path.join(PROJECT, "src/utils/cpuMeter"));
    const pixelSavedUsed = Game.cpu.getUsed, pixelSavedLimit = Game.cpu.limit;
    Game.cpu.limit = 20;
    Game.cpu.bucket = 10000;
    pixelMeter.reset();
    before = pixelCalls;
    console.log = (...a) => { logs.push(a.join(" ")); };
    mainForPixel.loop();
    assert(pixelCalls === before || pixelMeter.snapshot() !== null, "0113: no pixel before a CPU window has been published");
    Game.cpu.getUsed = () => 19; Game.time++; pixelMeter.endTick(); // window: avg 19 of 20 - no room
    Game.cpu.getUsed = () => 0; // keep the loop itself cheap
    before = pixelCalls;
    Game.cpu.bucket = 10000;
    mainForPixel.loop();
    const tight = pixelCalls === before;
    Game.cpu.getUsed = () => 12; Game.time++; pixelMeter.endTick(); // window: avg 12 - room to refill
    Game.cpu.getUsed = () => 0;
    Game.cpu.bucket = 10000;
    before = pixelCalls;
    mainForPixel.loop();
    console.log = origLog;
    assert(tight && pixelCalls === before + 1, "0113: a pixel (which zeroes the bucket) is only made while the CPU average leaves headroom under the limit (tight " + tight + ")");
    Game.cpu.getUsed = pixelSavedUsed; Game.cpu.limit = pixelSavedLimit;
    Memory.settings = savedPixelSettings;

    // low bucket: the optional modules pause
    const flipSeen = [];
    const flipMod = require(path.join(PROJECT, "src/utils/marketFlip"));
    const realFlipTick = flipMod.tick;
    flipMod.tick = () => { flipSeen.push(Game.cpu.bucket); };
    console.log = (...a) => { logs.push(a.join(" ")); };
    Game.cpu.bucket = 100; Game.time++; mainForPixel.loop();
    const shedCalls = flipSeen.length;
    Game.cpu.bucket = 9999; Game.time++; mainForPixel.loop();
    console.log = origLog;
    flipMod.tick = realFlipTick;
    assert(shedCalls === 0 && flipSeen.length === 1, "0113: below cpu.shedBucket marketFlip is paused, above it runs (" + shedCalls + "/" + flipSeen.length + ")");

    Game.cpu.bucket = 10000; // restore the shared default
    delete Game.cpu.generatePixel;

    // --- console: profile(ticks) enables itself, then turns itself back off
    const mainForProfiler = require(path.join(PROJECT, "src/main"));

    // 0113 L2: count the wrapped engine methods, capture what the session publishes
    const wrappedCount = () => {
        let n = 0;
        [Game, Room, Structure, Spawn, Creep, RoomPosition, Source, Flag].forEach((o) => {
            const target = o.prototype || o;
            Object.getOwnPropertyNames(target).forEach((k) => {
                const d = Object.getOwnPropertyDescriptor(target, k);
                if (d && typeof d.value === "function" && d.value.profilerWrapped) n++;
            });
        });
        return n;
    };
    const rolesForWrap = require(path.join(PROJECT, "src/roles"));
    const meterForProfile = require(path.join(PROJECT, "src/utils/cpuMeter"));
    const realSetFns = meterForProfile.setFns;
    const published = [];
    meterForProfile.setFns = (rows, ticks) => { published.push({ rows, ticks }); };
    assert(wrappedCount() === 0, "0113: before profile() no engine method is wrapped");
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
    const wrappedDuring = wrappedCount();
    const roleWrappedDuring = !!rolesForWrap.hauler.run.profilerWrapped;
    Game.time++;

    // run through the disableTick itself (screeps-profiler prints its report
    // there), plus one more tick for maybeAutoDisableProfiler() to notice the
    // window closed and flip the setting back off
    // The engine hands every tick a freshly parsed Memory and memory.wrap swaps the
    // cached object back in: mimic it, so a write made before the swap is lost like it is live.
    while (Game.time <= disableTick + 3) {
        global.Memory = JSON.parse(JSON.stringify(global.Memory));
        mainForProfiler.loop();
        Game.time++;
    }
    console.log = origLog;

    assert(profilerBuilt, "the tick after profile() call builds Game.profiler");
    assert(logs.slice(logsBefore).some((l) => l.indexOf("calls") !== -1 && l.indexOf("function") !== -1),
        "profile(ticks) prints a calls/time/avg report on the disableTick");
    assert(logs.slice(logsBefore).some((l) => l.indexOf("[cpuTop]") !== -1),
        "profile(ticks) also prints the cpuTop table of the same window - one command, no separate cpuTop");
    assert(Memory.settings.profiler === false,
        "profile(ticks) turns Memory.settings.profiler back off once its window closes");
    assert(Memory.profiler === null,
        "profile(ticks) clears Memory.profiler once its window closes");
    assert(logs.slice(logsBefore).filter((l) => l.indexOf("[cpuTop]") !== -1).length === 1,
        "profile(ticks) prints the cpuTop table once - not every tick after the window closes");
    // 0113 L2: published once, then everything is taken off again
    assert(wrappedDuring > 0 && roleWrappedDuring, "0113: during profile() the engine methods and the role objects are wrapped (" + wrappedDuring + ")");
    assert(published.length === 1 && published[0].ticks === 3 && published[0].rows.length > 0 && published[0].rows.every((r) => typeof r.name === "string" && r.calls > 0),
        "0113: the closed session hands its function rows and its length to the meter, once (" + published.length + " calls)");
    assert(wrappedCount() === 0 && !rolesForWrap.hauler.run.profilerWrapped,
        "0113: once the window closes every wrapper is gone - no residual cost (still wrapped: " + wrappedCount() + ")");
    // 0118/0119: the session reports WHO calls Room.find / config.get, config.get is
    // wrapped only while profiling, and the tick group measures what no guard covers
    assert(logs.slice(logsBefore).some((l) => l.indexOf("[profile] Room.find callers") !== -1),
        "0119: profile(ticks) prints the callers of Room.find");
    assert(!require(path.join(PROJECT, "src/utils/config")).get.profilerWrapped &&
        !logs.slice(logsBefore).some((l) => l.indexOf("config.get callers") !== -1),
        "0118: config.get is never wrapped by profile() - its per-call overhead drained the bucket");
    assert(meterForProfile.GROUPS.indexOf("tick") !== -1,
        "0118: the CPU meter has a tick group for what no guard covers");
    assert(!logs.slice(logsBefore).some((l) => /callerChain|recordCaller/.test(l)),
        "0118/0119: caller rows name the real callers, not the profiler's own frames");
    {
        // the engine parses Memory lazily, on first access of the global: touching it
        // before memory.wrap swaps the cached object in costs a full JSON.parse per tick
        // (~3.5 CPU/tick live). A consecutive tick must not read global Memory before the swap.
        Game.time++;
        const cached = global.Memory;
        mainForProfiler.loop(); // seeds memory.wrap's cached object for Game.time
        Game.time++;
        let reads = 0;
        delete global.Memory;
        Object.defineProperty(global, "Memory", { configurable: true, get() { reads++; return cached; } });
        mainForProfiler.loop();
        assert(reads === 0, "0118: a consecutive tick never reads global Memory before the cached swap (" + reads + " reads)");
        if (!Object.getOwnPropertyDescriptor(global, "Memory").get) global.Memory = cached;
    }
    {
        const prof = require(path.join(PROJECT, "src/utils/profiler"));
        prof.clearCallers();
        assert(prof.callers().length === 0, "0118/0119: clearCallers() empties the caller table");
    }
    {
        // a session never drains the bucket: below profile.minBucket it closes on that tick
        const savedBucket = Game.cpu.bucket;
        Game.cpu.bucket = 9000;
        global.profile(50);
        Game.time++;
        mainForProfiler.loop();
        Game.cpu.bucket = 50;
        Game.time++;
        const abortTick = Game.time;
        const abortLogsFrom = logs.length;
        console.log = (...a) => { logs.push(a.join(" ")); };
        global.Memory = JSON.parse(JSON.stringify(global.Memory));
        mainForProfiler.loop();
        console.log = origLog;
        assert(Memory.profiler && Memory.profiler.disableTick === abortTick &&
            logs.slice(abortLogsFrom).some((l) => l.indexOf("closing the window early") !== -1),
            "0118: profile() closes its window early when the bucket is below profile.minBucket");
        Game.time++;
        global.Memory = JSON.parse(JSON.stringify(global.Memory));
        console.log = (...a) => { logs.push(a.join(" ")); };
        mainForProfiler.loop();
        console.log = origLog;
        assert(Memory.profiler === null && Memory.settings.profiler === false && wrappedCount() === 0,
            "0118: ...and the next tick takes every wrapper off again");
        published.pop(); // the aborted session published too; the 0113 count below is about full ones
        Game.cpu.bucket = savedBucket;
        Game.time++;
    }
    {
        // 0118: the repair ordering/eligibility reads its thresholds once a tick, not per
        // structure, and the numeric sort key orders exactly like the array key
        const rr = require(path.join(PROJECT, "src/utils/rampartRepair"));
        const cfg = require(path.join(PROJECT, "src/utils/config"));
        const types = [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL];
        const maxHits = { [STRUCTURE_ROAD]: 5000, [STRUCTURE_CONTAINER]: 250000, [STRUCTURE_RAMPART]: 300000000, [STRUCTURE_WALL]: 300000000 };
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const damaged = [];
        for (let i = 0; i < 300; i++) {
            const type = types[i % 4];
            const ratio = [0.0005, 0.005, 0.05, 0.3, 0.6, 0.95][Math.floor(rnd() * 6)] * (0.5 + rnd());
            damaged.push({ id: "rr" + i, structureType: type, hitsMax: maxHits[type], hits: Math.max(1, Math.floor(maxHits[type] * Math.min(ratio, 0.99))) });
        }
        Game.time++;
        const byArray = _.sortBy(damaged, rr.priority).map((x) => x.id).join();
        const byKey = _.sortBy(damaged, rr.priorityKey).map((x) => x.id).join();
        assert(byArray === byKey, "0118: priorityKey orders 300 mixed structures exactly like priority");

        const realGet = cfg.get;
        let calls = 0;
        cfg.get = function () { calls++; return realGet.apply(this, arguments); };
        Game.time++;
        const fakeRoom = { name: "RR1", storage: { store: { energy: 500000, getCapacity: () => 1000000 } } };
        const fakeTower = { room: fakeRoom, store: { energy: 900, getCapacity: () => 1000 } };
        damaged.forEach((x) => { rr.tier(x); rr.builderMayRepair(x, fakeRoom); rr.towerMayRepair(x, fakeTower); });
        cfg.get = realGet;
        assert(calls <= 12, "0118: tier/builderMayRepair/towerMayRepair on 300 structures read config " + calls + " times (bounded, not per structure)");
    }
    {
        // 0118: Memory.stats is rebuilt once per publishInterval (60 ticks in production),
        // a closed CPU-meter window still reaches it at once
        const cfgStats = require(path.join(PROJECT, "src/utils/config"));
        const statsFn = require(path.join(PROJECT, "src/utils/stats"));
        const meterStats = require(path.join(PROJECT, "src/utils/cpuMeter"));
        cfgStats.defaults.stats.publishInterval = 60;
        Game.time++;
        statsFn(); // a publish tick
        const publishedAt = Memory.stats.time;
        const marker = {};
        Memory.stats.marker = marker;
        Game.time += 5;
        statsFn();
        assert(Memory.stats.marker === marker && Memory.stats.time === publishedAt,
            "0118: stats() inside the publish interval leaves Memory.stats untouched (no rebuild)");
        const realSnap = meterStats.snapshot;
        const fakeWindow = { window: 60, ticks: 60, at: Game.time, used: 9, modules: {}, roles: {}, structures: {}, spans: {}, tick: {} };
        meterStats.snapshot = () => fakeWindow;
        statsFn();
        meterStats.snapshot = realSnap;
        assert(Memory.stats.cpu.meter === fakeWindow && Memory.stats.marker === marker,
            "0118: ...but a freshly closed CPU-meter window is attached right away");
        const realUsed = Game.cpu.getUsed;
        Game.cpu.getUsed = () => 12.5;
        Game.cpu.bucket = 7777;
        statsFn();
        Game.cpu.getUsed = realUsed;
        assert(Memory.stats.marker === marker && Memory.stats.cpu.used === 12.5 && Memory.stats.cpu.bucket === 7777,
            "0118: ...and cpu.used/bucket follow every tick (the reset tick's CPU must not stay on the dashboard for 60 ticks)");
        Game.time += 60;
        statsFn();
        assert(Memory.stats.time === Game.time && !Memory.stats.marker,
            "0118: stats() rebuilds once the publish interval has elapsed");
        cfgStats.defaults.stats.publishInterval = 1;
    }
    {
        // 0118: with nothing to haul, the mineral-job cascade runs once per room per tick,
        // however many idle haulers ask; the next tick asks again
        const haulerMod = require(path.join(PROJECT, "src/roles/hauler"));
        const meterJobs = require(path.join(PROJECT, "src/utils/cpuMeter"));
        const emptyRoom = { name: "EMPTY1", find: () => [], controller: undefined };
        meterJobs.reset();
        Game.time++;
        const results = [haulerMod.pickMineralJob(emptyRoom), haulerMod.pickMineralJob(emptyRoom), haulerMod.pickMineralJob(emptyRoom)];
        const ran = meterJobs.live().spans["hauler.pickMineralJob"];
        assert(results.every((r) => r === null) && ran && ran.calls === 1,
            "0118: three idle haulers in a room with no job run the mineral cascade once a tick (" + (ran && ran.calls) + ")");
        Game.time++;
        haulerMod.pickMineralJob(emptyRoom);
        assert(meterJobs.live().spans["hauler.pickMineralJob"].calls === 2,
            "0118: ...and the next tick asks again (a no-job answer is not kept across ticks)");
        meterJobs.reset();
    }
    {
        // 0119: per (room, FIND_*) at most one Room.find per tick however many creeps/modules ask
        const rc = require(path.join(PROJECT, "src/utils/roomCache"));
        const en = require(path.join(PROJECT, "src/utils/energy"));
        const finds = {};
        const budgetRoom = {
            name: "BUDGET1", controller: undefined,
            find: (type) => { finds[type] = (finds[type] || 0) + 1; return []; },
        };
        Game.time++;
        for (let i = 0; i < 6; i++) {
            rc.mySpawns(budgetRoom);
            rc.droppedResources(budgetRoom);
            rc.tombstones(budgetRoom);
            rc.ruins(budgetRoom);
            rc.sources(budgetRoom);
        }
        try { en.energyPiles(budgetRoom); en.energyPiles(budgetRoom); } catch (e) { /* needs a fuller room - the counts below still hold */ }
        assert(Object.keys(finds).length >= 5 && Object.keys(finds).every((k) => finds[k] === 1),
            "0119: six callers of mySpawns/dropped/tombstones/ruins/sources (and energyPiles) cost one find per type: " + JSON.stringify(finds));
    }
    {
        // 0118: creep.body is rebuilt by the engine on every read - a hostile asked about by the
        // intel filter, three towers and a defender in one tick reads it once, and a boost
        // that shows up later is picked up when the entry is refreshed
        const hostilesMod = require(path.join(PROJECT, "src/utils/hostiles"));
        hostilesMod.resetBodyCache();
        let bodyReads = 0;
        let parts = [{ type: ATTACK, hits: 100 }, { type: MOVE, hits: 100 }];
        const intruder = { id: "bodyprobe1", get body() { bodyReads++; return parts; } };
        Game.time++;
        for (let i = 0; i < 8; i++) hostilesMod.bodyInfo(intruder);
        assert(bodyReads === 1 && hostilesMod.bodyInfo(intruder).parts[ATTACK] === 1 && !hostilesMod.bodyInfo(intruder).boosted,
            "0118: eight body lookups of one hostile in a tick read creep.body once (" + bodyReads + ")");
        parts = [{ type: ATTACK, hits: 100, boost: "UH" }, { type: MOVE, hits: 100 }];
        Game.time += 5;
        const stale = hostilesMod.bodyInfo(intruder).boosted;
        Game.time += 25;
        assert(stale === false && hostilesMod.bodyInfo(intruder).boosted === true && bodyReads === 2,
            "0118: ...and a boost applied later is seen once the 25-tick refresh passes");
        hostilesMod.resetBodyCache();
    }
    {
        // 0118 / ARK-34: observing a room we do not own costs no full structure find, counts the
        // hostile towers from the enemy scan, and drops the dead per-role counters
        const getIntelFn = require(path.join(PROJECT, "src/rooms/intel"));
        const finds = {};
        const observed = {
            name: "OBS1", controller: undefined,
            find: (type, opts) => {
                finds[type] = (finds[type] || 0) + 1;
                if (type === FIND_HOSTILE_STRUCTURES) {
                    const list = [{ structureType: STRUCTURE_TOWER }, { structureType: STRUCTURE_TOWER }, { structureType: STRUCTURE_RAMPART }];
                    return opts && opts.filter ? list.filter(opts.filter) : list;
                }
                return [];
            },
        };
        Memory.rooms.OBS1 = { numberOfHaulers: 3, numberOfLinks: 2 };
        Game.time++;
        getIntelFn(observed);
        assert(!finds[FIND_STRUCTURES] && !finds[FIND_MY_STRUCTURES],
            "ARK-34: getIntel on an observed room does no full structure find (" + JSON.stringify(finds) + ")");
        assert(Memory.rooms.OBS1.numberOfTowers === 2 && Memory.rooms.OBS1.numberOfHaulers === undefined && Memory.rooms.OBS1.numberOfLinks === undefined,
            "ARK-34: ...counts hostile towers from the enemy scan and purges the unused numberOf* counters");
        delete Memory.rooms.OBS1;
    }
    {
        // base 60: market (120) and marketFlip (60) scan on the same ticks and share one fetch
        const orderBookMod = require(path.join(PROJECT, "src/utils/orderBook"));
        const marketMod = require(path.join(PROJECT, "src/utils/market"));
        const flipMod = require(path.join(PROJECT, "src/utils/marketFlip"));
        const cfgBook = require(path.join(PROJECT, "src/utils/config"));
        const savedSettings = Memory.settings;
        const savedMarketObj = Game.market;
        Memory.settings = {};
        const savedFlipInterval = cfgBook.defaults.marketFlip.scanInterval;
        cfgBook.defaults.marketFlip.scanInterval = 60;
        let fetches = 0;
        const stub = () => { fetches++; return []; };
        Game.market = { credits: 1000, incomingTransactions: [], orders: {}, getAllOrders: stub };
        orderBookMod.reset(); marketMod.reset();
        Game.time = 120000; // a multiple of 120
        marketMod.scan(); flipMod.tick();
        assert(fetches === 1, "base 60: market and marketFlip on the same tick share one order-book fetch (" + fetches + ")");
        const log = [];
        for (let t = 1; t <= 240; t++) {
            Game.time = 120000 + t;
            const before = fetches;
            marketMod.scan(); flipMod.tick();
            if (fetches > before) log.push(t);
        }
        assert(log.join() === "60,120,180,240",
            "base 60: the book is fetched on the 60-tick grid only, market every 2nd line (" + log.join() + ")");
        cfgBook.defaults.marketFlip.scanInterval = savedFlipInterval;
        Memory.settings = savedSettings;
        Game.market = savedMarketObj;
        orderBookMod.reset();
    }
    {
        // a room whose spawns/extensions are all full is not scanned store by store; a hungry one still is
        const tiers = require(path.join(PROJECT, "src/utils/resourceTiers"));
        let freeCalls = 0;
        const ext = (free) => ({ id: "x" + free + Math.random(), structureType: STRUCTURE_EXTENSION, store: { getFreeCapacity: () => { freeCalls++; return free; }, getCapacity: () => 50, energy: 50 - free } });
        const mkRoom = (name, available, list) => ({
            name, energyAvailable: available, energyCapacityAvailable: 100, storage: null, controller: undefined,
            find: (type) => (type === FIND_MY_STRUCTURES ? list : []),
        });
        Memory.rooms.FULL1 = {}; Memory.rooms.HUNGRY1 = {};
        Game.time++;
        const full = tiers.getEconomySnapshot(mkRoom("FULL1", 100, [ext(0), ext(0)]));
        const callsFull = freeCalls;
        const hungry = tiers.getEconomySnapshot(mkRoom("HUNGRY1", 50, [ext(0), ext(50)]));
        assert(callsFull === 0 && full.state !== "critical" && hungry.state === "critical" && hungry.reason === "spawn" && freeCalls > 0,
            "economy snapshot: full spawns/extensions cost no getFreeCapacity scan, a hungry room is still critical (" + callsFull + " calls when full)");
        delete Memory.rooms.FULL1; delete Memory.rooms.HUNGRY1;
    }
    {
        // base 60 round 2: the grid, chain cadence, one-pass best level, cached medians
        const cadenceMod = require(path.join(PROJECT, "src/utils/cadence"));
        Game.time = 600;
        assert(cadenceMod.due(null, 60) && cadenceMod.due(undefined, 60), "cadence: never run -> due");
        assert(!cadenceMod.due(600, 60) && !cadenceMod.due(599, 60) === false, "cadence: same bucket not due, previous bucket due");
        Game.time = 659;
        assert(!cadenceMod.due(600, 60), "cadence: tick 659 is still bucket 600-659");
        Game.time = 660;
        assert(cadenceMod.due(600, 60) && cadenceMod.due(630, 60) && !cadenceMod.due(660, 60), "cadence: first tick of a new bucket is due");
        assert(cadenceMod.due(700, 60) === true && (Game.time = 500, cadenceMod.due(600, 60)) === true, "cadence: a clock that went backwards is due");

        // craftChain advances on craft.tickInterval, not every tick
        const cfgC = require(path.join(PROJECT, "src/utils/config"));
        const planner = require(path.join(PROJECT, "src/utils/craftPlanner"));
        const chainMod = require(path.join(PROJECT, "src/utils/craftChain"));
        const realChainTick = chainMod.tick;
        let chainRuns = 0;
        chainMod.tick = () => { chainRuns++; };
        const realInterval = cfgC.defaults.craft.tickInterval;
        cfgC.defaults.craft.tickInterval = 10;
        for (let t = 1000; t < 1100; t++) { Game.time = t; try { planner.tick(); } catch (e) { /* scan needs a fuller world */ } }
        cfgC.defaults.craft.tickInterval = realInterval;
        chainMod.tick = realChainTick;
        assert(chainRuns >= 9 && chainRuns <= 11, "craft chains run once per craft.tickInterval (10), not per tick (" + chainRuns + " runs in 100 ticks)");

        // best price in one pass: ties on the best price add their volumes up, per side
        const marketM = require(path.join(PROJECT, "src/utils/market"));
        const bookM = require(path.join(PROJECT, "src/utils/orderBook"));
        const savedMarketObj2 = Game.market;
        const o = (type, price, amount, id) => ({ id, type, price, amount, remainingAmount: amount, resourceType: RESOURCE_ENERGY, roomName: "W1N1" });
        Game.market = { credits: 1, incomingTransactions: [], orders: {}, getAllOrders: () => [
            o(ORDER_SELL, 11, 100, "s1"), o(ORDER_SELL, 10, 5, "s2"), o(ORDER_SELL, 10, 7, "s3"), o(ORDER_SELL, 9, 0, "s4"),
            o(ORDER_BUY, 19, 50, "b1"), o(ORDER_BUY, 20, 3, "b2"), o(ORDER_BUY, 20, 4, "b3"), o(ORDER_BUY, 0, 9, "b4"),
        ] };
        bookM.reset(); marketM.reset();
        Game.time = 120 * 500;
        marketM.scan();
        const e = marketM.snapshot().resources[RESOURCE_ENERGY];
        assert(e.currentSell === 10 && e.currentSellVolume === 12 && e.currentBuy === 20 && e.currentBuyVolume === 7,
            "market: best level = best price + summed volume on it, skipping empty/zero-price orders (sell " + e.currentSell + "x" + e.currentSellVolume + ", buy " + e.currentBuy + "x" + e.currentBuyVolume + ")");
        Game.market = savedMarketObj2;
        bookM.reset(); marketM.reset();
    }
    {
        // isCollector(): a link never moves - the second call reads neither pos nor memory
        let posReads = 0;
        const probeLink = Object.create(StructureLink.prototype);
        Object.defineProperty(probeLink, "id", { value: "collprobe1" });
        Object.defineProperty(probeLink, "pos", { get() { posReads++; return { x: 5, y: 6, findInRange: () => [{ id: "src" }] }; } });
        const memProbe = {};
        Object.defineProperty(probeLink, "memory", { get() { return memProbe; } });
        const first = probeLink.isCollector();
        const readsAfterFirst = posReads;
        const second = probeLink.isCollector();
        assert(first === true && second === true && posReads === readsAfterFirst,
            "isCollector is answered from the heap after the first call (pos read " + posReads + "x)");

        // energyPiles: same piles as the full-structure walk (storage/container/receiving link >= 50), nothing else
        const energyMod = require(path.join(PROJECT, "src/utils/energy"));
        const mk = (id, type, energy, extra) => Object.assign({ id, structureType: type, store: { energy }, pos: new RoomPosition(10, 10, "PILES1") }, extra || {});
        const list = [
            mk("p-st", STRUCTURE_STORAGE, 500), mk("p-st0", STRUCTURE_STORAGE, 10),
            mk("p-co", STRUCTURE_CONTAINER, 60), mk("p-ex", STRUCTURE_EXTENSION, 50),
            mk("p-tw", STRUCTURE_TOWER, 900), mk("p-te", STRUCTURE_TERMINAL, 900),
            mk("p-lk", STRUCTURE_LINK, 400, { isCollector: () => false }),
            mk("p-lc", STRUCTURE_LINK, 400, { isCollector: () => true }),
        ];
        const pilesRoom = { name: "PILES1", controller: undefined, find: (type) => (type === FIND_STRUCTURES ? list : []) };
        Game.time++;
        const ids = energyMod.energyPiles(pilesRoom).map((x) => x.id).sort().join();
        assert(ids === "p-co,p-lk,p-st", "energyPiles keeps storage, container and receiving link with >= 50 energy only (" + ids + ")");
    }
    {
        // utils/damagedStructures: one scan feeds tower and builder, refreshed every 5 ticks (every tick under attack)
        const dmg = require(path.join(PROJECT, "src/utils/damagedStructures"));
        const mkS = (id, type, hits, hitsMax) => {
            const o = Object.assign(new OwnedStructure(), { id, structureType: type, hits, hitsMax, my: true, pos: new RoomPosition(12, 12, "DMG1") });
            REG[id] = o;
            return o;
        };
        const sFull = mkS("dmg-full", STRUCTURE_ROAD, 5000, 5000);
        const sCrit = mkS("dmg-crit", STRUCTURE_CONTAINER, 100, 250000);
        const sOk = mkS("dmg-ok", STRUCTURE_CONTAINER, 200000, 250000);
        let structFinds = 0;
        const structList = [sFull, sCrit, sOk];
        const dmgRoom = { name: "DMG1", controller: undefined, find: (type) => { if (type === FIND_STRUCTURES) { structFinds++; return structList; } return []; } };
        dmg.reset();
        Memory.rooms.DMG1 = { defenseActive: false };
        Game.time = 5000;
        const first = dmg.sorted(dmgRoom).map((x) => x.id).join();
        assert(first === "dmg-crit,dmg-ok" && dmg.critical(dmgRoom).map((x) => x.id).join() === "dmg-crit",
            "damagedStructures: damaged list sorted by tier, critical = its leading run (" + first + ")");
        const late = mkS("dmg-late", STRUCTURE_CONTAINER, 50, 250000);
        structList.push(late);
        Game.time = 5002;
        assert(dmg.sorted(dmgRoom).map((x) => x.id).join() === "dmg-crit,dmg-ok" && structFinds === 1,
            "damagedStructures: a structure damaged after the scan is not listed before the 5-tick refresh, and no extra scan ran (" + structFinds + ")");
        sCrit.hits = sCrit.hitsMax; // repaired meanwhile: drops out at once
        Game.time = 5003; // (the sorted list is memoised per tick)
        assert(dmg.sorted(dmgRoom).map((x) => x.id).join() === "dmg-ok", "damagedStructures: a structure repaired in between leaves the list at once");
        Game.time = 5005;
        assert(dmg.sorted(dmgRoom).map((x) => x.id).join() === "dmg-late,dmg-ok" && structFinds === 2,
            "damagedStructures: the 5-tick refresh picks the new damage up (scans: " + structFinds + ")");
        Memory.rooms.DMG1.defenseActive = true;
        const later = mkS("dmg-later", STRUCTURE_CONTAINER, 10, 250000);
        structList.push(later);
        Game.time = 5006;
        assert(dmg.sorted(dmgRoom).some((x) => x.id === "dmg-later"), "damagedStructures: under attack the room is rescanned every tick");
        delete Memory.rooms.DMG1;
        dmg.reset();
    }
    {
        // economy snapshot: towers with enough energy never reach the plan lookup (which reads
        // their pos); a low one counts as critical
        const tiersT = require(path.join(PROJECT, "src/utils/resourceTiers"));
        const posReads = {};
        const mkTower = (id, energy) => {
            const t = { id, structureType: STRUCTURE_TOWER, my: true, store: { energy, getCapacity: () => 1000, getFreeCapacity: () => 1000 - energy }, room: { name: "TWR1" } };
            Object.defineProperty(t, "pos", { get() { posReads[id] = (posReads[id] || 0) + 1; return new RoomPosition(20, 20, "TWR1"); } });
            return t;
        };
        const towersList = [mkTower("t-full1", 900), mkTower("t-full2", 800), mkTower("t-low", 100)];
        const twRoom = { name: "TWR1", energyAvailable: 100, energyCapacityAvailable: 100, storage: null, controller: undefined, find: () => towersList };
        Memory.rooms.TWR1 = {};
        Game.time++;
        const snap = tiersT.getEconomySnapshot(twRoom);
        assert(snap.state === "critical" && snap.criticalConsumers === 1 && !posReads["t-full1"] && !posReads["t-full2"] && posReads["t-low"] > 0,
            "economy snapshot: only the low tower counts and only it reaches the plan lookup (" + snap.criticalConsumers + " critical, pos reads " + JSON.stringify(posReads) + ")");
        delete Memory.rooms.TWR1;
    }
    {
        // hauler.pickLoad: with no energy pile above hauler.minDropLoad on the ground, no path search over drops runs
        const tinyDrop = Object.assign(new Resource(), {
            id: "tinydrop", resourceType: RESOURCE_ENERGY, amount: 60,
            pos: new RoomPosition(21, 21, "W1N1"),
        });
        REG[tinyDrop.id] = tinyDrop;
        Game.time++;
        const hTiny = makeCreep("HTinyDrop", "hauler", {
            store: store(0, 200),
            pos: withFindLookup(new RoomPosition(20, 20, "W1N1"), { [FIND_DROPPED_RESOURCES]: [tinyDrop] }),
        });
        let dropSearches = 0;
        const innerLookup = hTiny.pos.findClosestByPath;
        hTiny.pos.findClosestByPath = function (a, opts) { if (a === FIND_DROPPED_RESOURCES) dropSearches++; return innerLookup.call(this, a, opts); };
        hTiny.pickup = noop;
        hTiny.memory.job = "load";
        hauler.run(hTiny);
        assert(dropSearches === 0, "hauler: a 60-energy pile (below every pickup threshold) costs no findClosestByPath over drops (" + dropSearches + " searches)");
        findMap[FIND_DROPPED_RESOURCES] = [];
    }
    {
        // hauler.pickLoad keeps a pick for hauler.repickTicks while its target still holds 50+ energy
        const mkDrop = (id, amount) => {
            const d = Object.assign(new Resource(), { id, resourceType: RESOURCE_ENERGY, amount, pos: new RoomPosition(20, 21, "W1N1") });
            REG[id] = d;
            return d;
        };
        const keepDrop = mkDrop("keeppick1", 200);
        const mkPicker = () => {
            const c = makeCreep("HKeepPick", "hauler", {
                store: store(0, 200),
                pos: withFindLookup(new RoomPosition(20, 20, "W1N1"), { [FIND_DROPPED_RESOURCES]: [keepDrop] }),
            });
            c.memory.job = "load";
            return c;
        };
        Game.time += 100;
        let searches = 0;
        const counted = (c) => {
            const inner = c.pos.findClosestByPath;
            c.pos.findClosestByPath = function (a2, o2) { if (a2 === FIND_DROPPED_RESOURCES) searches++; return inner.call(this, a2, o2); };
            return c;
        };
        const picker = counted(mkPicker());
        const first = hauler.pickLoad(picker);
        const afterFirst = searches;
        Game.time++;
        const second = hauler.pickLoad(picker);
        assert(first && first.id === "keeppick1" && second === first && searches === afterFirst,
            "pickLoad: the pick is reused on the next tick without another path search (" + searches + " vs " + afterFirst + ")");

        keepDrop.amount = 40; // pile nearly gone: no longer worth the trip
        Game.time++;
        const third = hauler.pickLoad(picker);
        assert(!third || third.id !== "keeppick1", "pickLoad: a pile that fell below 50 is dropped from the cached pick");

        keepDrop.amount = 200;
        Game.time++;
        hauler.pickLoad(picker); // fresh pick again, cached
        const big = mkDrop("keepbig1", 900);
        findMap[FIND_DROPPED_RESOURCES] = [keepDrop, big];
        picker.pos.findClosestByPath = (a2, o2) => (a2 === FIND_DROPPED_RESOURCES ? big : null);
        Game.time++;
        const forced = hauler.pickLoad(picker);
        assert(forced && forced.id === "keepbig1" && forced.tier === "bigDrop",
            "pickLoad: a pile above the big-drop bar forces a fresh pick even inside the reuse window");

        findMap[FIND_DROPPED_RESOURCES] = [keepDrop];
        const picker2 = counted(mkPicker());
        picker2.name = "HKeepPick2";
        Game.time++;
        hauler.pickLoad(picker2);
        const base2 = searches;
        Game.time += 5; // the window (5 ticks) has passed
        hauler.pickLoad(picker2);
        assert(searches > base2, "pickLoad: after hauler.repickTicks the cascade runs again (" + (searches - base2) + " new searches)");
        findMap[FIND_DROPPED_RESOURCES] = [];
    }
    {
        // spawning: a room that wants nothing is not re-evaluated every tick
        const spawnMod = require(path.join(PROJECT, "src/rooms/spawning"));
        const logicIdle = require(path.join(PROJECT, "src/roles"));
        const censusIdle = require(path.join(PROJECT, "src/utils/census"));
        const needsIdle = require(path.join(PROJECT, "src/rooms/needs"));
        const cfgIdle = require(path.join(PROJECT, "src/utils/config"));
        const savedSpawnFns = {};
        Object.keys(logicIdle).forEach((type) => { savedSpawnFns[type] = logicIdle[type].spawn; });
        let spawnChecks = 0;
        Object.keys(logicIdle).forEach((type) => { logicIdle[type].spawn = () => { spawnChecks++; return false; }; });
        const savedTtl = cfgIdle.defaults.needs.cacheTicks;
        cfgIdle.defaults.needs.cacheTicks = 10; // production value: the smoke fixes it at 1
        const idleSpawn = Object.assign(new Spawn(), {
            id: "spawnidle1", structureType: STRUCTURE_SPAWN, spawning: null,
            pos: new RoomPosition(10, 10, "Idle1"), spawnCreep: () => OK,
        });
        const idleRoom = { name: "Idle1", energyAvailable: 300, energyCapacityAvailable: 300, storage: null, controller: undefined, find: (t) => (t === FIND_MY_SPAWNS ? [idleSpawn] : []) };
        Memory.rooms.Idle1 = {};
        needsIdle.invalidate("Idle1");
        spawnMod.resetIdleVerdict();
        Game.time += 100;
        spawnMod(idleRoom);
        const firstChecks = spawnChecks;
        Game.time++;
        spawnMod(idleRoom); // the verdict does not carry over to this tick: new roomCache, same needs object
        assert(firstChecks > 0 && spawnChecks === firstChecks,
            "spawning: a second tick with nothing wanted re-checks no role (" + firstChecks + " checks, then " + spawnChecks + ")");
        needsIdle.invalidate("Idle1"); // console override: needs recomputed -> new object
        Game.time++;
        spawnMod(idleRoom);
        assert(spawnChecks > firstChecks, "spawning: recomputed needs force a fresh evaluation at once");
        const afterRecompute = spawnChecks;
        const extra = censusIdle.allInRoom;
        censusIdle.allInRoom = (name) => (name === "Idle1" ? [{ name: "x" }] : extra(name));
        Game.time++;
        spawnMod(idleRoom);
        censusIdle.allInRoom = extra;
        assert(spawnChecks > afterRecompute, "spawning: a change in the room's creep count (a death/spawn) forces a fresh evaluation");
        const beforeWant = spawnChecks;
        logicIdle.hauler.spawn = () => { spawnChecks++; return true; };
        const savedHaulerData = logicIdle.hauler.spawnData;
        logicIdle.hauler.spawnData = () => ({ name: "hIdle1", body: [CARRY, CARRY, MOVE], memory: { role: "hauler" } });
        needsIdle.invalidate("Idle1");
        Game.time++;
        spawnMod(idleRoom);
        const wantChecks = spawnChecks - beforeWant;
        Game.time++;
        spawnMod(idleRoom);
        assert(spawnChecks - beforeWant > wantChecks, "spawning: a room with a pending request is re-checked every tick (never skipped)");
        Object.keys(savedSpawnFns).forEach((type) => { logicIdle[type].spawn = savedSpawnFns[type]; });
        logicIdle.hauler.spawnData = savedHaulerData;
        cfgIdle.defaults.needs.cacheTicks = savedTtl;
        spawnMod.resetIdleVerdict();
        delete Memory.rooms.Idle1;
    }
    // a second session wraps again and unwraps again
    global.profile(2);
    const secondDisable = Memory.profiler.disableTick;
    Game.time++;
    mainForProfiler.loop();
    const wrappedSecond = wrappedCount();
    Game.time++;
    while (Game.time <= secondDisable + 2) {
        global.Memory = JSON.parse(JSON.stringify(global.Memory));
        mainForProfiler.loop();
        Game.time++;
    }
    assert(wrappedSecond > 0 && wrappedCount() === 0 && published.length === 2,
        "0113: a second profile() wraps again and unwraps again (" + wrappedSecond + " wrapped, " + wrappedCount() + " left)");
    meterForProfile.setFns = realSetFns;
}

// --- ROADMAP 0113: unified CPU meter (L0 modules, L1 roles / structures / spans) -------------
{
    // a private instance: main.js keeps the shared one (and its accumulated window)
    const meterKey = require.resolve(path.join(PROJECT, "src/utils/cpuMeter"));
    const sharedMeter = require.cache[meterKey];
    delete require.cache[meterKey];
    const meter = require(path.join(PROJECT, "src/utils/cpuMeter"));
    require.cache[meterKey] = sharedMeter;
    const saved = { used: Game.cpu.getUsed, settings: Memory.settings, time: Game.time };
    let used = 0;
    Game.cpu.getUsed = () => used;
    Memory.settings = Object.assign({}, saved.settings, { stats: { cpuWindowTicks: 2, cpuTopFunctions: 2 } });
    Game.time += 90000000;
    meter.record("roles", "hauler", 2);
    meter.record("roles", "hauler", 4);
    meter.record("structures", "tower", 1);
    used = 10; meter.endTick();
    assert(meter.snapshot() === null, "0113: nothing is published before the window closes");
    Game.time++;
    meter.record("roles", "hauler", 3);
    used = 14; meter.endTick();
    const snap = meter.snapshot();
    assert(snap && snap.window === 2 && snap.used === 12 && snap.roles.hauler.avg === 4.5 && snap.roles.hauler.max === 4 && snap.roles.hauler.calls === 1.5,
        "0113: a closed window holds per-tick averages (avg " + (snap && snap.roles && snap.roles.hauler.avg) + ", calls " + (snap && snap.roles && snap.roles.hauler.calls) + ")");
    assert(snap.structures.tower.avg === 0.5 && snap.modules && snap.spans, "0113: structures are keyed by type, every group is present");
    Game.time++;
    meter.record("roles", "hauler", 100);
    used = 10; meter.endTick();
    assert(meter.snapshot() === snap && meter.snapshot().roles.hauler.avg === 4.5, "0113: the snapshot does not change between publications");
    assert(meter.live().roles.hauler.avg === 100, "0113: live() shows the window in progress (cpuTop)");
    assert(meter.live().totalTicks === 3 && meter.live().fromTick === Game.time && meter.live().toTick === Game.time,
        "0144: partial window coverage is separate from all ticks since meter reset");
    meter.reset();
    assert(Object.keys(meter.live().roles).length === 0 && meter.snapshot() === snap, "0113: reset() restarts the window and keeps the last published snapshot");
    // each tick counts once
    Game.time++; meter.endTick(); meter.endTick();
    assert(meter.live().ticks === 1, "0113: endTick() counts a tick once however often it is called");
    assert(meter.live().totalTicks === 1, "0144: manual reset restarts the measured total and duplicate end does not increment it");

    // spans measure, return the result and propagate exceptions (still counted)
    used = 0;
    const out = meter.span("hot.point", () => { used += 3; return "value"; });
    let thrown = null;
    try { meter.span("hot.point", () => { used += 2; throw new Error("boom"); }); } catch (e) { thrown = e; }
    const sp = meter.live().spans["hot.point"];
    assert(out === "value" && thrown && thrown.message === "boom" && sp && sp.calls === 2 && sp.max === 3,
        "0113: span() returns the result, rethrows, and counts both calls (got " + JSON.stringify(sp) + ")");

    // L2 result: top N by self time, per-tick values, in the published snapshot
    meter.setFns([{ name: "a", selfTime: 10, totalTime: 12, calls: 20 }, { name: "b", selfTime: 40, totalTime: 40, calls: 80 }, { name: "c", selfTime: 1, totalTime: 1, calls: 2 }], 10);
    const fn = meter.snapshot().fns;
    assert(Object.keys(fn).join() === "b,a" && fn.b.self === 4 && fn.b.calls === 8 && fn.a.total === 1.2,
        "0113: setFns keeps the heaviest functions by self time as per-tick values (got " + JSON.stringify(fn) + ")");

    Game.cpu.getUsed = saved.used; Memory.settings = saved.settings; Game.time = saved.time;
}

// 0113 wiring: the main loop feeds modules / roles / structures / spans and stats publishes the window
{
    const mainWire = require(path.join(PROJECT, "src/main"));
    const wireMeter = require(path.join(PROJECT, "src/utils/cpuMeter"));
    const savedWire = { settings: Memory.settings };
    Memory.settings = Object.assign({}, savedWire.settings, { stats: { cpuWindowTicks: 3 } });
    Game.time += 95000000;
    wireMeter.reset();
    const roleNames = {};
    Object.keys(Game.creeps).forEach((n) => { roleNames[Game.creeps[n].memory.role] = true; });
    // the window closes in cpuMeter.endTick() of the 3rd tick, after stats() already ran: the
    // 4th tick's stats() is the first to carry it (one tick of publication latency)
    for (let i = 0; i < 3; i++) { Game.time++; mainWire.loop(); }
    const topLogs = [], originalTopLog = console.log;
    const terminalPerf = require(path.join(PROJECT, "src/utils/terminalOps")).perf;
    terminalPerf["legacy-probe"] = 99999;
    console.log = (line) => topLogs.push(String(line));
    try { global.cpuTop(50); }
    finally { console.log = originalTopLog; delete terminalPerf["legacy-probe"]; }
    assert(topLogs.some((line) => line.includes("[cpuTop] 3 ticks") && line.includes("closed window")) && wireMeter.live().ticks === 0,
        "ARK-116: cpuTop at the publication boundary shows the closed window without changing the accumulator");
    assert(!topLogs.some((line) => line.includes("legacy-probe")),
        "ARK-116: cpuTop never divides legacy terminal totals by another window's ticks");
    Game.time++; mainWire.loop();
    const wired = Memory.stats && Memory.stats.cpu && Memory.stats.cpu.meter;
    assert(wired && wired.window === 3 && wired.modules.stats && wired.modules.creep && wired.modules.structure,
        "0113: the main loop feeds the modules and stats publishes the closed window in Memory.stats.cpu.meter (got " + JSON.stringify(wired && Object.keys(wired)) + ")");
    assert(Object.keys(wired.roles).length > 0 && Object.keys(wired.roles).every((r) => roleNames[r] && !Game.creeps[r]),
        "0113: roles are keyed by role name, never by creep name (got " + Object.keys(wired.roles).join() + ")");
    assert(Object.keys(wired.structures).length > 0 && Object.keys(wired.structures).every((k) => typeof k === "string" && !(Game.structures && Game.structures[k])),
        "0113: structures are keyed by type, never by id (got " + Object.keys(wired.structures).join() + ")");
    assert(wired.spans["needs.compute"] && wired.spans["craft.scan"] && wired.spans["craft.chains"], "0113: the named spans are measured every tick");
    // Game.time is NOT restored: stats() keeps heap caches stamped with the tick (barrier hits)
    Memory.settings = savedWire.settings;
}

// --- ROADMAP 0115: several lab reactions at once (labReactions list) -----------------------
{
    const labMod = require(path.join(PROJECT, "src/structures/lab"));
    const labReactions = require(path.join(PROJECT, "src/utils/labReactions"));
    const tsMod = require(path.join(PROJECT, "src/utils/transientStock"));
    const nelMod = require(path.join(PROJECT, "src/utils/nonEnergyLogistics"));
    const savedGet = Game.getObjectById, savedRooms = Memory.rooms;
    const ROOM = "MultiRxRoom";
    const mkLab = (id, res) => {
        const lab = Object.assign(new OwnedStructure(), {
            id, structureType: STRUCTURE_LAB, my: true, room: { name: ROOM }, pos: new RoomPosition(5, 5, ROOM), cooldown: 0, ran: 0,
            runReaction(a, b) { this.ran++; this.args = [a.id, b.id]; return OK; },
        });
        const set = (resources) => { lab.store = mineralStore(resources, 3000 - _.sum(Object.values(resources))); lab.mineralType = Object.keys(resources)[0] || null; };
        lab.set = set; set(res || {});
        return lab;
    };
    const L = { ia1: mkLab("mx-ia1", { H: 1000 }), ia2: mkLab("mx-ia2", { O: 1000 }), oa: mkLab("mx-oa"), ib1: mkLab("mx-ib1", { L: 1000 }), ib2: mkLab("mx-ib2", { H: 1000 }), ob: mkLab("mx-ob"), other: mkLab("mx-other") };
    Game.getObjectById = (id) => { const k = Object.keys(L).find((n) => L[n].id === id); return k ? L[k] : savedGet.call(Game, id); };
    const rxA = { a: "O", b: "H", product: "OH", input1: "mx-ia2", input2: "mx-ia1", output: "mx-oa" };
    const rxB = { a: "L", b: "H", product: "LH", input1: "mx-ib1", input2: "mx-ib2", output: "mx-ob" };

    // list(): the plural field, else the singular one, else nothing
    Memory.rooms = Object.assign({}, savedRooms, { [ROOM]: {} });
    assert(labReactions.list(ROOM).length === 0 && labReactions.list("NoSuchRoom").length === 0, "0115: no reaction -> empty list");
    Memory.rooms[ROOM].labReaction = rxA;
    assert(labReactions.list(ROOM).length === 1 && labReactions.list(ROOM)[0] === rxA, "0115: a single labReaction is a list of one");
    Memory.rooms[ROOM].labReactions = [rxA, rxB];
    assert(labReactions.list(ROOM).length === 2, "0115: labReactions wins over the singular field");
    delete Memory.rooms[ROOM].labReaction;

    // lab.js: every output lab acts for ITS reaction, on its own cooldown; inputs and strangers stay idle
    Object.keys(L).forEach((k) => labMod.run(L[k]));
    assert(L.oa.ran === 1 && L.ob.ran === 1 && L.oa.args.join() === "mx-ia2,mx-ia1" && L.ob.args.join() === "mx-ib1,mx-ib2" &&
        L.ia1.ran + L.ia2.ran + L.ib1.ran + L.ib2.ran + L.other.ran === 0,
        "0115: both reactions run, each from its own two input labs (ran " + JSON.stringify(Object.keys(L).map((k) => k + ":" + L[k].ran)) + ")");

    // hauler: stocks the input labs of EVERY reaction (one job per reagent and destination)
    const storage = { store: mineralStore({ L: 2000, H: 2000, O: 2000 }, 1e6) };
    const room = { name: ROOM, storage, terminal: null, find: () => [] };
    L.ib1.set({ L: 100 });
    Game.time++;
    let job = hauler.pickMineralJob(room);
    assert(job && job.kind === "labReagent" && job.resourceType === "L" && job.to === L.ib1, "0115: the second reaction's low input lab is stocked (got " + (job && job.kind) + ")");
    L.ib1.set({ L: 1000 }); L.ia1.set({ H: 100 });
    Game.time++;
    job = hauler.pickMineralJob(room);
    assert(job && job.kind === "labReagent" && job.resourceType === "H" && job.to === L.ia1, "0115: ...and so is the first reaction's");
    L.ia1.set({ H: 1000 });

    // hauler: drains the fullest output lab of ALL reactions
    L.oa.set({ OH: 2500 }); L.ob.set({ LH: 2700 });
    Game.time++;
    job = hauler.pickMineralJob(room);
    assert(job && job.kind === "labOutput" && job.from === L.ob && job.resourceType === "LH", "0115: the fullest output lab of any reaction is drained (got " + (job && job.from && job.from.id) + ")");
    // an in-place intermediate (keep) is left alone, the other reaction's output is still drained
    Memory.rooms[ROOM].labReactions = [Object.assign({}, rxA), Object.assign({}, rxB, { keep: true })];
    Game.time++;
    job = hauler.pickMineralJob(room);
    assert(job && job.kind === "labOutput" && job.from === L.oa, "0115: a keep reaction's output is not drained, the other one's is (got " + (job && job.from && job.from.id) + ")");
    Memory.rooms[ROOM].labReactions = [rxA, rxB];

    // pressure reports the fullest output lab across reactions
    Game.time++;
    const pressure = nelMod.outputs(room).find((o) => o.kind === "labOutput");
    assert(pressure && pressure.sourceId === "mx-ob" && pressure.resourceType === "LH" && Math.abs(pressure.ratio - 0.9) < 1e-9,
        "0115: output pressure is measured on the fullest lab of any reaction (got " + JSON.stringify(pressure) + ")");

    // transitory stock: nothing a running reaction needs is drained; strangers are
    L.oa.set({ OH: 300 }); L.ob.set({ LH: 300 });
    assert(tsMod.excess(L.oa).length === 0 && tsMod.excess(L.ob).length === 0 && tsMod.excess(L.ia1).length === 0 && tsMod.excess(L.ib1).length === 0,
        "0115: transientStock keeps the product and the reagents of every running reaction");
    L.oa.set({ LH: 300 });
    assert(tsMod.excess(L.oa).map((e) => e.resourceType).join() === "LH", "0115: another reaction's product in this reaction's output lab is drained");
    L.other.set({ OH: 300 });
    assert(tsMod.excess(L.other).map((e) => e.resourceType).join() === "OH", "0115: a lab outside every reaction is drained");

    Game.getObjectById = savedGet; Memory.rooms = savedRooms;

    // 0115: the planner's T follows the critical path - a wave costs its slowest step
    {
        const pricing = pricingModule(); // a fresh instance bound to the current market module
        const marketMod = require(path.join(PROJECT, "src/utils/market"));
        const savedSamples = marketMod.samples, savedTimeT = Game.time;
        // the intermediates cost far more than their reagents, so the planner makes them
        const priceOf = (rt) => (["LH", "OH", "LH2O"].indexOf(rt) >= 0 ? 5000 : 10);
        marketMod.samples = (rt) => priceSamples(priceOf(rt), priceOf(rt) + 1, 72, 1e9);
        // the smoke's REACTIONS stub only knows H+O: add the rest of the XLH2O tree, with
        // different times so that the slowest step of a wave is told apart from the sum
        const rxBackup = { H: Object.assign({}, REACTIONS.H), L: REACTIONS.L, LH: REACTIONS.LH, OH: REACTIONS.OH, X: REACTIONS.X, LH2O: REACTIONS.LH2O };
        REACTIONS.H.L = "LH"; REACTIONS.L = { H: "LH" }; REACTIONS.LH = { OH: "LH2O" }; REACTIONS.OH = { LH: "LH2O" };
        REACTIONS.X = { LH2O: "XLH2O" }; REACTIONS.LH2O = { X: "XLH2O" };
        global.REACTION_TIME = { LH: 15, OH: 20, LH2O: 10, XLH2O: 60 };
        pricing.resetCaches();
        const base = { instant: (rt) => ({ bid: priceOf(rt), ask: priceOf(rt) + 1 }), stock: () => 0, canMake: () => true };
        const cd = (p) => pricing.recipeOf(p).cooldown;
        const batches = 20; // 100 units / 5 per reaction, at every level
        const plain = pricing.planNode("XLH2O", 100, base, 0, {}, true);
        const sumAll = batches * (cd("LH") + cd("OH") + cd("LH2O") + cd("XLH2O"));
        const critical = batches * (Math.max(cd("LH"), cd("OH")) + cd("LH2O") + cd("XLH2O"));
        // the lab plan (labSlots) knows the strategy and its time; the pricing only adds it up
        const together = pricing.planNode("XLH2O", 100, Object.assign({}, base, { labTime: () => critical }), 0, {}, true);
        const sequentialWaves = pricing.planNode("XLH2O", 100, Object.assign({}, base, { labTime: () => null }), 0, {}, true);
        assert(plain && plain.T === sumAll && sequentialWaves.T === sumAll,
            "0115: without a wave plan T is the sum of every step (got " + (plain && plain.T) + ", expected " + sumAll + ")");
        assert(together.T === critical && together.T < sumAll,
            "0115/0116: the lab plan's own time replaces the plain sum (got " + together.T + ", expected " + critical + ", sequential " + sumAll + ")");
        assert(together.steps.every((st) => typeof st.time === "number" && st.time > 0), "0115: every step records its own production time");
        marketMod.samples = savedSamples;
        REACTIONS.H = rxBackup.H;
        ["L", "LH", "OH", "X", "LH2O"].forEach((k) => { if (rxBackup[k] === undefined) delete REACTIONS[k]; else REACTIONS[k] = rxBackup[k]; });
        delete global.REACTION_TIME;
        Game.time = savedTimeT;
        pricing.resetCaches();
    }

    // groupAt(): consecutive lab items of one wave run together; anything else is a group of one
    const { groupAt } = require(path.join(PROJECT, "src/utils/craftChain"));
    const it = (product, wave, kind) => ({ kind: kind || "lab", product, wave });
    assert(groupAt({ queue: [it("A", 0), it("B", 0), it("C", 1)] }, 0).map((i) => i.product).join() === "A,B", "0115: two lab steps of wave 0 form a group");
    assert(groupAt({ queue: [it("A", 0), it("B", 0), it("C", 1)] }, 2).map((i) => i.product).join() === "C", "0115: the next wave is a group of its own");
    assert(groupAt({ queue: [it("A"), it("B")] }, 0).length === 1, "0115: a chain stored before waves existed (no wave) runs one step at a time");
    assert(groupAt({ queue: [it("A", 0), it("F", 0, "factory"), it("B", 0)] }, 0).length === 1, "0115: a factory step never joins a lab wave, nor lets a wave jump over it");
    assert(groupAt({ queue: [it("F", undefined, "factory"), it("G", undefined, "factory")] }, 0).length === 1, "0115: factory steps stay one at a time");
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
        energyLedger.snapshot("EnergyRoomRepair").repairRampart === REPAIR_POWER * REPAIR_COST,
        "runBuild's repair branch credits the ENERGY the engine charges (REPAIR_POWER x REPAIR_COST = 1 per WORK part, not the 100 hits) to 'repairRampart' (got " +
            energyLedger.snapshot("EnergyRoomRepair").repairRampart + ")"
    );
    delete REG.energyRampart1;

    // a boosted WORK part adds hits/progress but NO energy: the engine removes the unboosted amount
    // (screeps/engine repair.js: repairCost comes from the unboosted repairEffect)
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
        energyLedger.snapshot("EnergyRoomRepairBoost").repairRampart === REPAIR_POWER * REPAIR_COST,
        "a boosted WORK part's repair energy is the same as an unboosted one: boosts add hits, never energy (got " +
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
        id: "extractorMM1", structureType: STRUCTURE_EXTRACTOR, my: true, pos: mineral.pos,
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

    Game.time++; // a fresh roomCache: W1N1's structures were listed earlier this tick
    let harvested = false;
    const mmCreep = Object.assign(Object.create(Creep.prototype), {
        id: "mmcreep1",
        // the role reads the extractor/container from roomCache (one find a tick), not pos.findInRange
        room: { name: "W1N1", find: (type) => (type === FIND_STRUCTURES ? [extractorMM, containerMM] : []) },
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

    containerFree = 100;
    mineral.mineralAmount = 1999;
    assert(mineralMinerMod.wanted(room) === 0,
        "0114: mineral below minAmount -> no mineralMiner spawn");
    mineral.mineralAmount = 2000;
    assert(mineralMinerMod.wanted(room) === 1,
        "0114: mineral at minAmount -> mineralMiner wanted");
    containerFree = 0;
    assert(mineralMinerMod.wanted(room) === 0,
        "0114: mineral container full -> no mineralMiner spawn");

    mineral.mineralAmount = savedMineralAmount;
    mineral.pos.findInRange = realMineralFindInRange;
}

// --- 0114: miner body ladder + mineralMiner body -------------------------
{
    const minerMod0114 = require(path.join(PROJECT, "src/roles/miner"));
    const mmMod0114 = require(path.join(PROJECT, "src/roles/mineralMiner"));
    const cost0114 = (b) => b.reduce((n, p) => n + BODYPART_COST[p], 0);
    const n0114 = (b, t) => b.filter((p) => p === t).length;

    const full = minerMod0114.bodyForBudget(1850, true);
    assert(n0114(full, WORK) === 15 && n0114(full, MOVE) === 3 && n0114(full, CARRY) === 4,
        "0114: capacity 1850 -> miner W15/M3/C4");
    const rung12 = minerMod0114.bodyForBudget(1849, true);
    assert(n0114(rung12, WORK) === 12 && n0114(rung12, CARRY) === 3,
        "0114: capacity just below 1850 -> regresses to W12/M3/C3");
    assert(n0114(minerMod0114.bodyForBudget(5600, true), WORK) === 15,
        "0114: bigger capacity does not buy more than W15");
    const noFeed = minerMod0114.bodyForBudget(1850, false);
    assert(n0114(noFeed, CARRY) === 0 && n0114(noFeed, WORK) === 15,
        "0114: nothing to feed -> no CARRY, same WORK");
    assert(minerMod0114.bodyForBudget(549, false) === null && minerMod0114.bodyForBudget(300, true) === null,
        "0114: below the smallest rung -> null (caller falls back to the mini body)");
    let ladderOk = true, prevWork = 99;
    for (const cap of [600, 750, 1000, 1250, 1500, 1850, 3000]) {
        const b = minerMod0114.bodyForBudget(cap, true);
        ladderOk = ladderOk && b && cost0114(b) <= cap && b.length <= 50 && n0114(b, WORK) >= 5;
    }
    for (let cap = 3000; cap >= 600; cap -= 50) {
        const w = n0114(minerMod0114.bodyForBudget(cap, true), WORK);
        ladderOk = ladderOk && w <= prevWork;
        prevWork = w;
    }
    assert(ladderOk, "0114: every rung is affordable, <= 50 parts, and WORK never grows as capacity shrinks");

    const mmRoom = { energyCapacityAvailable: 5600 };
    const mmW = (cap, amount) => n0114(mmMod0114.body({ energyCapacityAvailable: cap }, amount), WORK);
    assert(mmW(5600, 500) === 4, "0114: tiny deposit -> mineralMiner floor of 4 WORK");
    assert(mmW(5600, 2000) === 8, "0114: 2000 left -> 8 WORK");
    assert(mmW(5600, 70000) === 12, "0114: huge deposit -> capped at 12 WORK");
    assert(mmW(300, 70000) === 2, "0114: mineralMiner body shrinks to the room's capacity");
    const mmBody = mmMod0114.body(mmRoom, 70000);
    assert(n0114(mmBody, CARRY) === 0 && n0114(mmBody, MOVE) === 3,
        "0114: mineralMiner never has CARRY, MOVE ~ WORK/5");
}

// --- Fase 1: hauler.pickMineralJob() prioritizes the mineral container --
{
    const pmMineral = Object.assign(new RoomObject(), {
        id: "pmMineral1", mineralType: "H", mineralAmount: 3000,
        pos: new RoomPosition(10, 10, "PickJobRoom"),
    });
    const pmContainer = Object.assign(new StructureContainer(), {
        id: "pmContainer1", structureType: STRUCTURE_CONTAINER, pos: new RoomPosition(10, 10, "PickJobRoom"),
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
        find: (type) => (type === FIND_MINERALS ? [pmMineral] : type === FIND_STRUCTURES ? [pmContainer] : []),
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

// --- battlefieldLootJob()/runLootJob(): a body's loot is one all-in-one --
// trip. A dead creep (e.g. a killed invader) drops a tombstone that may
// carry boosted mineral compounds alongside its energy; ROADMAP 0107 (user
// request) has the hauler scoop up EVERYTHING sitting there in a single
// trip, straight to storage - not a separate pickLoad energy pickup plus a
// separate mineralJob per compound. That means it's its own job type, not
// part of pickMineralJob's single-resource-type cascade any more.
{
    const lootTomb = { id: "lootTomb1", store: mineralStore({ energy: 100, U: 80 }, 0) };
    const lootContainer = Object.assign(new StructureContainer(), {
        id: "lootContainer1", structureType: STRUCTURE_CONTAINER, pos: new RoomPosition(10, 10, "LootJobRoom"),
        store: mineralStore({ H: 50 }, 1950),
    });
    const lootMineral = Object.assign(new RoomObject(), {
        id: "lootMineral1", mineralType: "H", mineralAmount: 3000,
        pos: new RoomPosition(10, 10, "LootJobRoom"),
    });
    lootMineral.pos.findInRange = (type, range, opts) => {
        let list = type === FIND_STRUCTURES ? [lootContainer] : [];
        if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
        return list;
    };
    const lootStorage = { store: mineralStore({}, 100000) };
    const lootRoom = {
        name: "LootJobRoom", storage: lootStorage, terminal: null,
        find: (type) => {
            if (type === FIND_MINERALS) return [lootMineral];
            if (type === FIND_STRUCTURES) return [lootContainer];
            if (type === FIND_TOMBSTONES) return [lootTomb];
            return [];
        },
    };
    Game.time++;
    const lootJob = hauler.battlefieldLootJob(lootRoom);
    assert(
        lootJob && !lootJob.resourceType &&
            lootJob.from === lootTomb && lootJob.to === lootStorage,
        "battlefieldLootJob() targets a tombstone holding energy + a mineral compound, straight to storage, no single resourceType"
    );

    // pickMineralJob() itself no longer knows about tombstone/ruin loot at
    // all - run() checks battlefieldLootJob separately (and first), so this
    // falls straight to the mineral container even while the tombstone's
    // still sitting there.
    const containerJob = hauler.pickMineralJob(lootRoom);
    assert(
        containerJob && containerJob.resourceType === "H" && containerJob.from === lootContainer,
        "pickMineralJob() no longer includes battlefield loot - falls straight to the mineral container"
    );

    // Withdraws one resource type per tick (Screeps only allows one per
    // withdraw()/transfer() call) until the tombstone's drained, then
    // switches to delivering everything carried into storage, same way.
    // Needs real (dynamic, not snapshot) getFreeCapacity/getUsedCapacity on
    // the hauler's own store, since this test mutates it call by call -
    // mineralStore()'s freeCap is a fixed snapshot, so a small local
    // variant is used here instead.
    function capacityStore(resources, capacity) {
        return Object.assign(
            Object.create({
                getFreeCapacity() { return capacity - _.sum(_.values(this)); },
                getUsedCapacity() { return _.sum(_.values(this)); },
            }),
            resources
        );
    }
    lootTomb.id = "lootTomb1";
    lootStorage.id = "lootStorage1";
    REG[lootTomb.id] = lootTomb;
    REG[lootStorage.id] = lootStorage;
    const lootHauler = Object.assign(new Creep(), {
        pos: new RoomPosition(10, 10, "LootJobRoom"),
        room: lootRoom,
        memory: { lootJob: { fromId: lootTomb.id, toId: lootStorage.id } },
        store: capacityStore({}, 300),
    });
    lootHauler.pos.inRangeTo = () => true;
    lootHauler.withdraw = (target, resourceType) => {
        lootHauler.store[resourceType] =
            (lootHauler.store[resourceType] || 0) + target.store[resourceType];
        target.store[resourceType] = 0;
        return OK;
    };
    lootHauler.transfer = (target, resourceType) => {
        target.store[resourceType] = (target.store[resourceType] || 0) +
            lootHauler.store[resourceType];
        lootHauler.store[resourceType] = 0;
        return OK;
    };

    hauler.runLootJob(lootHauler);
    hauler.runLootJob(lootHauler);
    assert(
        lootTomb.store[RESOURCE_ENERGY] === 0 && lootTomb.store.U === 0 &&
            lootHauler.store[RESOURCE_ENERGY] === 100 && lootHauler.store.U === 80,
        "runLootJob() withdraws every resource type off the tombstone (one per tick) before delivering anything"
    );
    hauler.runLootJob(lootHauler);
    hauler.runLootJob(lootHauler);
    assert(
        lootStorage.store[RESOURCE_ENERGY] === 100 && lootStorage.store.U === 80 &&
            lootHauler.store.getUsedCapacity() === 0,
        "runLootJob() delivers every resource type it picked up into storage, one per tick"
    );
    hauler.runLootJob(lootHauler);
    assert(
        !lootHauler.memory.lootJob,
        "runLootJob() clears memory.lootJob once fully delivered"
    );

    Game.time++;
    lootRoom.find = (type) => (type === FIND_MINERALS ? [lootMineral] : []);
    const noLootJob = hauler.battlefieldLootJob(lootRoom);
    assert(
        noLootJob === null,
        "battlefieldLootJob() returns null once no tombstone/ruin loot remains"
    );
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
    const reagentA = labRoomStructs.find((l) => l.id === reaction.input1);
    const reagentB = labRoomStructs.find((l) => l.id === reaction.input2);
    reagentA.mineralType = "H"; reagentA.store = mineralStore({ H: 100 }, 2900);
    reagentB.mineralType = "O"; reagentB.store = mineralStore({ O: 100 }, 2900);
    outputLab.mineralType = null; outputLab.store = mineralStore({}, 3000);
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
    outputLab.store = mineralStore({ [reaction.product]: 2500 }, 500); // above the drain floor (80% / pressure)
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
    // ROADMAP 0111: a factory only needs energy for an ACTIVE product, and
    // only that product's batch - never up to its full capacity.
    const savedRooms = Memory.rooms;
    Memory.rooms = Object.assign({}, savedRooms, { W1N1: Object.assign({}, savedRooms && savedRooms.W1N1) });
    delete Memory.rooms.W1N1.factoryProduct;
    Game.time++;
    assert(hauler.optionalConsumer(consumerCreep) !== energyFactory,
        "0111 AC6: a factory with no active product is not fed energy - it is transitory");
    Memory.rooms.W1N1.factoryProduct = "widgetA";
    Game.time++; // hauler.js's per-tick derived() cache
    assert(hauler.optionalConsumer(consumerCreep) === energyFactory,
        "hauler.js's optionalConsumer() also targets a factory needing energy (once it has an active product)");
    energyFactory.store = { energy: 20, getFreeCapacity: () => 500 }; // widgetA needs 20 energy per batch
    Game.time++;
    assert(hauler.optionalConsumer(consumerCreep) !== energyFactory,
        "0111 AC6: a factory already holding its batch's energy (target = components.energy) wants no more");
    Memory.rooms = savedRooms;
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

    // ROADMAP 0103 fifth follow-up (real bug reported in production,
    // 2026-09-24): a LITERAL `>= CONTROLLER_DOWNGRADE[8]` gate sounds right
    // but never actually fires in practice - ticksToDowngrade pins exactly
    // at that max the instant any creep tops it off and sits there, so a
    // builder kept spending on an already-safe controller instead of going
    // to find real building/repair work. The gate now reuses the same
    // rcl8SafeRatio mark (99%) isExcessUpgrader() treats as "safe".
    const rcl8SafeConfig = require(path.join(PROJECT, "src/utils/config"));
    controller.ticksToDowngrade = Math.floor(
        CONTROLLER_DOWNGRADE[8] *
            rcl8SafeConfig.get("upgrader.rcl8SafeRatio", 0.99)
    ); // at the safe mark, below the literal max
    const rcl8SafeBuilder = makeCreep("Rcl8SafeBuilder", "builder", {
        store: store(50, 50),
    });
    let safeUpgraded = false;
    rcl8SafeBuilder.upgradeController = () => {
        safeUpgraded = true;
        return OK;
    };
    Game.time++;
    builderMod.run(rcl8SafeBuilder);
    assert(!safeUpgraded,
        "builder stops spending on an RCL8 controller once ticksToDowngrade " +
            "reaches the safe mark, even though it is not literally at the max");
    delete Game.creeps.Rcl8SafeBuilder;
    delete Memory.creeps.Rcl8SafeBuilder;
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
    assert(Memory.stats.market.transactions && Object.keys(Memory.stats.market.transactions.bought).length === 0 && Object.keys(Memory.stats.market.transactions.sold).length === 0,
        "0079 follow-up: market.transactions is always present (bought/sold), empty when terminalOps has no recent deal");
    assert(Memory.stats.terminalNetwork && Memory.stats.terminalNetwork.transfers.length === 0,
        "0079 follow-up: terminalNetwork.transfers is always present, empty when terminalOps has no recent transfer");
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
    const before = Object.values(Memory.terminalOps.operations).filter((op) => !["completed", "cancelled", "failed"].includes(op.state)).length;
    energyBalancing.run();
    const pending = Object.keys(Memory.terminalOps.operations).filter((id) => Memory.terminalOps.operations[id].automatic);
    energyBalancing.run();
    assert(pending.length === 1 && Object.keys(Memory.terminalOps.operations).filter((id) => Memory.terminalOps.operations[id].automatic).length === 1, "0097 creates one automatic operation and remains idempotent");
    assert(Memory.energyBalancing.pending.W7N2 && Memory.energyBalancing.observations.W7N2.requestedAmount > 0, "0097 persists pending operation and requested amount for observability");
    assert(Object.values(Memory.terminalOps.operations).filter((op) => !["completed", "cancelled", "failed"].includes(op.state)).length === before + 1, "0097 delegates exactly one transfer to terminalOps");
    Game.rooms = oldRooms; Game.myRooms = oldMyRooms; Memory.energyBalancing = oldBalancing;
}
// ROADMAP 0098 regression coverage for the execution and recovery states.
// These fixtures explicitly exercise zero-fuel-reserve legacy operation paths.
const legacyTerminalSettings = Memory.settings;
Memory.settings = Object.assign({}, Memory.settings, {
    // These execution fixtures inspect final records later; request explicit diagnostic retention.
    terminalOps: Object.assign({}, Memory.settings && Memory.settings.terminalOps, { tickInterval: 1, operationRetentionTicks: 10000 }),
    logistics: Object.assign({}, Memory.settings && Memory.settings.logistics, { terminalReserveRatio: 0 }),
});
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
    const terminalStore = makeStore(500, 30000);
    const marketRoom = { name: "W7N5", controller: { my: true }, find: () => [], storage: { id: "W7N5-storage", store: makeStore(20000, 30000) }, terminal: { id: "W7N5-terminal", cooldown: 0, store: terminalStore } };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N5: marketRoom });
    let dealAmount = 0;
    Game.market = { credits: 100000, incomingTransactions: [], orders: {}, calcTransactionCost: () => 0, getAllOrders: () => [{ id: "order-1", roomName: "W7N6", price: 1, remainingAmount: 100 }], deal: (id, value) => { dealAmount = value; return OK; } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Memory.terminalOps.operations.sellTest = { id: "sellTest", kind: "sell", sourceRoom: "W7N5", resourceType: RESOURCE_ENERGY, amount: 100, remaining: 100, loadedAmount: 20, limit: 1, energyFairPrice: 0, state: "atTerminal", sentAmount: 0, createdTick: Game.time, updatedTick: Game.time };
    terminalOps.tick();
    assert(dealAmount === 20, "0098 SELL deals only the operation's tracked terminal cargo");
    // deal() is an intent: the engine only moves the goods after the script
    // returns, so every operation settles on the tick AFTER the deal, against
    // the terminal's real store (see the settling regression at the end).
    terminalStore[RESOURCE_ENERGY] -= 20; Game.time++;
    Memory.terminalOps.operations.buyTest = { id: "buyTest", kind: "buy", sourceRoom: "W7N5", resourceType: RESOURCE_ENERGY, amount: 100, remaining: 100, loadedAmount: 0, limit: 2, energyFairPrice: 0, state: "queued", sentAmount: 0, createdTick: Game.time, updatedTick: Game.time };
    Memory.terminalOps.nextId++; // Match create(): invalidate the heap index when inserting an operation.
    terminalOps.tick();
    assert(Memory.terminalOps.operations.sellTest.dealtAmount === 20, "0098 a SELL books its sale only once the terminal's store confirms the goods left");
    assert(Memory.terminalOps.operations.buyTest.state === "settling" && dealAmount === 100, "0098 BUY deal waits in settling before touching any bookkeeping: " + JSON.stringify(Memory.terminalOps.operations.buyTest));
    terminalStore[RESOURCE_ENERGY] += 100; Game.time++;
    terminalOps.tick();
    assert(Memory.terminalOps.operations.buyTest.state === "awaitingReceipt", "0098 BUY deal transitions to receipt handling");
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
// ROADMAP 0097 regression: Terminal.send() for RESOURCE_ENERGY needs amount +
// transactionCost physically staged in the source terminal - the fee is paid
// by the origin on top of what arrives at the destination (transfer()'s own
// creation check already assumes this). A transfer that only loaded
// op.amount, short by its own fee, used to reach "atTerminal" and call
// send() anyway, which the real API rejects with ERR_NOT_ENOUGH_RESOURCES
// (-6) - a stuck balancing transfer a user hit in production never
// completed, forever recovering.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    let sends = 0;
    const sourceTerminalStore = makeStore(1000, 300000);
    const source = { name: "W7N50", controller: { my: true }, find: () => [], storage: { id: "W7N50-storage", store: makeStore(60000, 100000) }, terminal: { id: "W7N50-terminal", cooldown: 0, store: sourceTerminalStore, send: () => { sends++; return OK; } } };
    const target = { name: "W7N51", controller: { my: true }, find: () => [], storage: { id: "W7N51-storage", store: makeStore(0, 100000) }, terminal: { id: "W7N51-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps, oldMarket = Game.market;
    Game.rooms = Object.assign({}, oldRooms, { W7N50: source, W7N51: target });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Game.market = { calcTransactionCost: () => 200 };
    const created = terminalOps.transfer("W7N50", "W7N51", RESOURCE_ENERGY, 1000);
    const op = Memory.terminalOps.operations[created.id];
    op.loadedAmount = op.amount; op.state = "atTerminal";
    terminalOps.tick();
    assert(sends === 0 && op.state === "queued", "0097 a transfer short by its own transactionCost never calls Terminal.send");
    sourceTerminalStore[RESOURCE_ENERGY] = op.amount + op.transactionCost;
    op.loadedAmount = op.amount + op.transactionCost; op.state = "atTerminal";
    terminalOps.tick();
    assert(sends === 1 && op.state === "awaitingReceipt", "0097 a transfer loaded with amount + transactionCost calls Terminal.send exactly once and succeeds");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps; Game.market = oldMarket;
}
// ROADMAP 0097 sétimo bug real (usuário reportou em produção, 2026-09-28): uma
// transferência já enviada com sucesso (sentAmount preenchido) foi arrastada
// de volta para "recovering" pela morte natural, dias depois, do hauler que
// só tinha feito o load original - runHauler() nunca limpava op.haulerName
// num leg concluído com sucesso, então tick()'s "meu hauler morreu?" disparava
// para um creep havia muito liberado para trabalho normal. recover() tentava
// reaver loadedAmount do terminal de origem, que não tinha mais essa energia
// (já enviada), e a operação travava para sempre em "atTerminal" sem nunca
// mais chamar touch(). Corrigido: runHauler() zera op.haulerName em todo leg
// concluído com sucesso, e tickTransfer() ganhou um stall guard
// (terminalOps.transferStallTicks) para essa mesma trava silenciosa não
// depender só disso.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const source = { name: "W7N52", controller: { my: true }, find: () => [], storage: { id: "W7N52-storage", store: makeStore(60000, 100000) }, terminal: { id: "W7N52-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } };
    const target = { name: "W7N53", controller: { my: true }, find: () => [], storage: { id: "W7N53-storage", store: makeStore(0, 100000) }, terminal: { id: "W7N53-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps, oldCreeps = Game.creeps, oldGetObject = Game.getObjectById;
    Game.rooms = Object.assign({}, oldRooms, { W7N52: source, W7N53: target });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const op = { id: "terminal-stale", kind: "transfer", sourceRoom: "W7N52", targetRoom: "W7N53", resourceType: RESOURCE_ENERGY, amount: 1000, remaining: 1000, loadedAmount: 0, sentAmount: 0, receivedAmount: 0, transactionCost: 0, state: "queued", createdTick: Game.time, updatedTick: Game.time, automatic: true };
    Memory.terminalOps.operations[op.id] = op;
    const creep = { name: "LoadHauler", memory: { terminalJob: { operationId: op.id, direction: "load", fromId: source.storage.id, toId: source.terminal.id, resourceType: RESOURCE_ENERGY, amount: 1000 } }, store: makeStore(1000, 1000), transfer: () => OK, withdraw: () => OK };
    Game.creeps = { LoadHauler: creep };
    Game.getObjectById = (id) => id === source.storage.id ? source.storage : id === source.terminal.id ? source.terminal : null;
    terminalOps.runHauler(creep);
    assert(op.state === "atTerminal" && op.haulerName === null, "0097 a finished load leg releases op.haulerName so the creep's later death cannot trigger recover()");
    source.terminal.store[RESOURCE_ENERGY] = 1000;
    Game.creeps = {}; // the hauler goes on to die doing unrelated work much later
    terminalOps.tick();
    assert(op.state === "awaitingReceipt" && op.sentAmount === 1000, "0097 a stale haulerName from a finished leg does not resurface as a spurious recovery");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps; Game.creeps = oldCreeps; Game.getObjectById = oldGetObject;
}
// 0111 follow-up (2026-10-02): an operation cancelled while its hauler was still walking
// (not carrying yet) must stay cancelled - finishing the leg used to touch() it back to
// "atTerminal", a zombie holding claims that blocked every new sale of the resource.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const room = { name: "W7N54", controller: { my: true }, find: () => [], storage: { id: "W7N54-storage", store: makeStore(60000, 100000) }, terminal: { id: "W7N54-terminal", cooldown: 0, store: makeStore(0, 300000) } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps, oldCreeps = Game.creeps, oldGetObject = Game.getObjectById;
    Game.rooms = Object.assign({}, oldRooms, { W7N54: room });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const op = { id: "terminal-zombie", kind: "sell", sourceRoom: "W7N54", targetRoom: null, resourceType: RESOURCE_ENERGY, amount: 100, remaining: 100, loadedAmount: 0, sentAmount: 0, receivedAmount: 0, transactionCost: 0, state: "loading", haulerName: "ZombieHauler", createdTick: Game.time, updatedTick: Game.time };
    Memory.terminalOps.operations[op.id] = op;
    const creep = { name: "ZombieHauler", memory: { terminalJob: { operationId: op.id, direction: "load", fromId: room.storage.id, toId: room.terminal.id, resourceType: RESOURCE_ENERGY, amount: 100 } }, store: makeStore(0, 1000), transfer: () => OK, withdraw: () => OK };
    Game.creeps = { ZombieHauler: creep };
    Game.getObjectById = (id) => id === room.storage.id ? room.storage : id === room.terminal.id ? room.terminal : null;
    terminalOps.cancel(op.id);
    assert(op.state === "cancelled", "0111: cancelling an operation whose hauler is not carrying yet ends it");
    terminalOps.runHauler(creep); // the hauler arrives at the storage with an empty store: the job is dropped, nothing is picked up
    assert(op.state === "cancelled" && op.haulerName === null && !creep.memory.terminalJob && op.loadedAmount === 0,
        "0111: a job in flight does not revive its cancelled operation (state " + op.state + ", loaded " + op.loadedAmount + ")");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps; Game.creeps = oldCreeps; Game.getObjectById = oldGetObject;
}
// ROADMAP 0097 oitavo bug real (usuário reportou em produção, 2026-09-28):
// tickTransfer()'s unload retrigger compared the target terminal's balance
// against op.amount (the original total) instead of what was still owed. A
// hauler's carry capacity is almost always smaller than the whole transfer,
// so the very first partial delivery permanently dropped the terminal
// balance below op.amount and the operation never resumed - a real
// balancing transfer delivered 1500 of 30925 and then froze forever.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const census = require(path.join(PROJECT, "src/utils/census"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const source = { name: "W7N54", controller: { my: true }, find: () => [], storage: { id: "W7N54-storage", store: makeStore(60000, 100000) }, terminal: { id: "W7N54-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } };
    const target = { name: "W7N55", controller: { my: true }, find: () => [], storage: { id: "W7N55-storage", store: makeStore(0, 100000) }, terminal: { id: "W7N55-terminal", cooldown: 0, store: makeStore(1500, 300000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps, oldCreeps = Game.creeps;
    Game.rooms = Object.assign({}, oldRooms, { W7N54: source, W7N55: target });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const op = { id: "terminal-partial", kind: "transfer", sourceRoom: "W7N54", targetRoom: "W7N55", resourceType: RESOURCE_ENERGY, amount: 3000, remaining: 0, loadedAmount: 3000, sentAmount: 3000, receivedAmount: 1500, transactionCost: 0, targetTerminalBaseline: 0, state: "waiting", waitingDirection: "unload", createdTick: Game.time, updatedTick: Game.time, automatic: true };
    Memory.terminalOps.operations[op.id] = op;
    const hauler = { name: "UnloadHauler2", room: target, memory: { role: "hauler" }, store: makeStore(0, 1500) };
    Game.creeps = { UnloadHauler2: hauler };
    census.build();
    terminalOps.tick();
    assert(op.state === "unloading" && op.haulerName === "UnloadHauler2" && hauler.memory.terminalJob.amount === 1500, "0097 unload retrigger uses the remaining amount, not the original total, so it resumes after a partial delivery");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps; Game.creeps = oldCreeps;
}
// ROADMAP 0097 décimo bug real (2026-10-01): incomingReceipt() fundia a
// transação de uma transferência no receipt de OUTRA (terminal-199 do pai 198
// absorveu os 31388 do terminal-232), então o 232 nunca completava e o
// energyBalancing.pending ficava travado. Também cobre a reconciliação quando
// a carga enviada já foi consumida por outro caminho.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const target = { name: "W7N56", controller: { my: true }, find: () => [], storage: { id: "W7N56-storage", store: makeStore(0, 100000) }, terminal: { id: "W7N56-terminal", cooldown: 0, store: makeStore(5000, 300000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps, oldCreeps = Game.creeps, oldMarket = Game.market, oldTime = Game.time;
    const srcRoom = { name: "W7N57", controller: { my: true }, find: () => [], storage: { id: "W7N57-storage", store: makeStore(60000, 100000) }, terminal: { id: "W7N57-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } };
    Game.rooms = Object.assign({}, oldRooms, { W7N56: target, W7N57: srcRoom });
    Game.creeps = {};
    Memory.terminalOps = { nextId: 10, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const base = { kind: "transfer", sourceRoom: "W7N57", targetRoom: "W7N56", resourceType: RESOURCE_ENERGY, remaining: 0, loadedAmount: 0, transactionCost: 0, createdTick: Game.time, updatedTick: Game.time };
    Memory.terminalOps.operations["terminal-old"] = Object.assign({}, base, { id: "terminal-old", kind: "receipt", sourceRoom: null, amount: 1000, receivedAmount: 0, sentAmount: 0, parentId: "terminal-parent-a", state: "waiting" });
    Memory.terminalOps.operations["terminal-parent-b"] = Object.assign({}, base, { id: "terminal-parent-b", amount: 3000, sentAmount: 3000, receivedAmount: 0, targetTerminalBaseline: 2000, sentTick: Game.time - 500, state: "awaitingReceipt" });
    Game.market = { incomingTransactions: [{ transactionId: "tx-b", to: "W7N56", resourceType: RESOURCE_ENERGY, amount: 3000 }] };
    terminalOps.tick();
    const old = Memory.terminalOps.operations["terminal-old"];
    const created = Object.values(Memory.terminalOps.operations).filter((o) => o.kind === "receipt" && o.id !== "terminal-old");
    assert(old.amount === 1000, "0097 incoming transaction of another parent is NOT merged into an unrelated receipt (got amount " + old.amount + ")");
    assert(created.length === 1 && created[0].parentId === "terminal-parent-b" && created[0].amount === 3000, "0097 the other parent gets its own receipt (got " + JSON.stringify(created.map((o) => o.parentId + ":" + o.amount)) + ")");

    // Sent cargo already drained by someone else: transfer closes instead of waiting forever.
    Memory.terminalOps.operations = {};
    target.terminal.store = makeStore(0, 300000);
    Memory.terminalOps.operations["terminal-gone"] = Object.assign({}, base, { id: "terminal-gone", amount: 3000, sentAmount: 3000, receivedAmount: 0, targetTerminalBaseline: 2000, sentTick: Game.time - 500, state: "waiting", waitingDirection: "unload", error: "withdraw retornou -4" });
    terminalOps.tick();
    Game.time += 5;
    terminalOps.tick();
    assert(Memory.terminalOps.operations["terminal-gone"].state === "completed", "0097 a sent transfer whose cargo is gone from the target terminal completes (got " + Memory.terminalOps.operations["terminal-gone"].state + ")");

    // Receipt with nothing left in the terminal closes after receiptEmptyTicks.
    Memory.terminalOps.operations = {};
    Memory.terminalOps.operations["terminal-empty"] = Object.assign({}, base, { id: "terminal-empty", kind: "receipt", sourceRoom: null, amount: 1000, receivedAmount: 0, sentAmount: 0, state: "waiting" });
    target.terminal.store = makeStore(0, 300000);
    terminalOps.tick();
    Game.time += 400;
    terminalOps.tick();
    assert(Memory.terminalOps.operations["terminal-empty"].state === "completed", "0097 an empty-terminal receipt completes after the grace window (got " + Memory.terminalOps.operations["terminal-empty"].state + ")");

    // Stock reserved by a market SELL (fee energy) is not "gone": the receipt keeps waiting.
    Memory.terminalOps.operations = {};
    Memory.terminalOps.operations["terminal-fee-receipt"] = Object.assign({}, base, { id: "terminal-fee-receipt", kind: "receipt", sourceRoom: null, amount: 1000, receivedAmount: 0, sentAmount: 0, state: "waiting" });
    Memory.terminalOps.operations["terminal-fee-sell"] = Object.assign({}, base, { id: "terminal-fee-sell", kind: "sell", sourceRoom: "W7N56", targetRoom: null, resourceType: "O", amount: 100, remaining: 100, feeLoadedAmount: 800, state: "queued" });
    target.terminal.store = makeStore(800, 300000);
    Game.time = oldTime;
    terminalOps.tick();
    Game.time += 400;
    terminalOps.tick();
    assert(Memory.terminalOps.operations["terminal-fee-receipt"].state !== "completed", "0097 a receipt is never closed as empty while a SELL's fee energy sits in the terminal (got " + Memory.terminalOps.operations["terminal-fee-receipt"].state + ")");
    Game.time = oldTime;
    Game.rooms = oldRooms; Memory.terminalOps = oldOps; Game.creeps = oldCreeps; Game.market = oldMarket;
}
// ROADMAP 0097 same bug, second symptom: recover() always assumed a dead
// hauler was working the source-side load leg, even when waitingDirection
// was "unload" (already sent). It searched the wrong room for dropped
// cargo and tried to re-pull loadedAmount from a source terminal that no
// longer held it (already sent), wedging a bogus "recover" job and its
// lock on the source terminal forever - which then blocked unrelated
// balancing transfers needing that same terminal as a source.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const census = require(path.join(PROJECT, "src/utils/census"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const source = { name: "W7N56", controller: { my: true }, find: () => [], storage: { id: "W7N56-storage", store: makeStore(60000, 100000) }, terminal: { id: "W7N56-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } };
    const target = { name: "W7N57", controller: { my: true }, find: () => [], storage: { id: "W7N57-storage", store: makeStore(0, 100000) }, terminal: { id: "W7N57-terminal", cooldown: 0, store: makeStore(3000, 300000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps, oldCreeps = Game.creeps;
    Game.rooms = Object.assign({}, oldRooms, { W7N56: source, W7N57: target });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const op = { id: "terminal-deadunload", kind: "transfer", sourceRoom: "W7N56", targetRoom: "W7N57", resourceType: RESOURCE_ENERGY, amount: 3000, remaining: 0, loadedAmount: 3000, sentAmount: 3000, receivedAmount: 0, transactionCost: 0, targetTerminalBaseline: 0, state: "unloading", waitingDirection: "unload", haulerName: "DeadUnloadHauler", createdTick: Game.time, updatedTick: Game.time, automatic: true };
    Memory.terminalOps.operations[op.id] = op;
    // A hauler in the (wrong) source room the old code would have used -
    // must stay untouched by this recovery.
    const sourceHauler = { name: "SourceIdleHauler", room: source, memory: { role: "hauler" }, store: makeStore(0, 1500) };
    const targetHauler = { name: "TargetUnloadHauler", room: target, memory: { role: "hauler" }, store: makeStore(0, 1500) };
    Game.creeps = { SourceIdleHauler: sourceHauler, TargetUnloadHauler: targetHauler };
    census.build();
    terminalOps.tick();
    assert(!sourceHauler.memory.terminalJob, "0097 recovering an already-sent transfer never assigns a job in the source room");
    assert(op.state === "unloading" && op.haulerName === "TargetUnloadHauler" && targetHauler.memory.terminalJob.direction === "unload", "0097 recovering an already-sent transfer's dead hauler reassigns a fresh unload in the target room, not a bogus source-room recovery");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps; Game.creeps = oldCreeps;
}
// ROADMAP 0098 bug real (usuário reportou em produção, 2026-09-29):
// scanIncoming() forgot a seen transactionId after terminalOps.statsWindow-
// unrelated 1000 ticks, but Game.market.incomingTransactions keeps listing
// transactions for far longer than that - so every incoming trade looked
// "new" again roughly every 1000 ticks and got re-added to the same
// receipt's amount forever. Three receipts in production ballooned past a
// million energy this way and could never reach remainingAmount 0 again.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const room = { name: "W7N58", controller: { my: true }, find: () => [], storage: { id: "W7N58-storage", store: makeStore(0, 30000) }, terminal: { id: "W7N58-terminal", cooldown: 0, store: makeStore(1000, 30000), send: () => OK } };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps, oldTime = Game.time;
    Game.rooms = Object.assign({}, oldRooms, { W7N58: room });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Game.market = { incomingTransactions: [{ transactionId: "tx-old", to: "W7N58", resourceType: RESOURCE_ENERGY, amount: 1000 }] };
    terminalOps.tick();
    const receipt = Object.values(Memory.terminalOps.operations).find((op) => op.kind === "receipt");
    assert(receipt && receipt.amount === 1000 && Memory.terminalOps.seenIncoming["tx-old"] === Game.time, "0098 a fresh incoming transaction mints a receipt for its amount");
    Game.time += 1001; // far past the old 1000-tick purge window
    terminalOps.tick();
    assert(receipt.amount === 1000, "0098 an already-seen transaction still listed by the API is never re-added, no matter how many ticks pass");
    Game.market.incomingTransactions = []; // the API finally stopped listing it
    terminalOps.tick();
    assert(!Memory.terminalOps.seenIncoming["tx-old"], "0098 seenIncoming forgets an id only once the API itself stops listing it");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps; Game.time = oldTime;
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
    const sent = Object.values(Memory.terminalOps.operations);
    assert(sent.length === 1 && sent[0].amount > 0 && sent[0].amount <= 3000, "0097 sends only the target's deficit to the empire mean, not the maximum (got " + JSON.stringify(sent.map((o) => o.amount)) + ")");
    // One rich source feeds two poor targets in the same run, sized against each other.
    const mk = (name, energy) => ({ name, controller: { my: true }, find: () => [], storage: { id: name + "-storage", store: makeStore(energy, 30000) }, terminal: { id: name + "-terminal", cooldown: 0, store: makeStore(0, 30000), send: () => OK } });
    const q1 = mk("W7N21", 29000), q2 = mk("W7N22", 2000), q3 = mk("W7N23", 3000);
    Game.rooms = Object.assign({}, oldRooms, { W7N21: q1, W7N22: q2, W7N23: q3 }); Game.myRooms = [q1, q2, q3];
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} }; Memory.energyBalancing = { lastRun: 0, pending: {}, observations: {} };
    energyBalancing.run();
    const planned = Object.values(Memory.terminalOps.operations).filter((o) => o.kind === "transfer");
    assert(planned.length === 2 && planned.every((o) => o.sourceRoom === "W7N21") && planned[0].targetRoom !== planned[1].targetRoom, "0097 one source feeds two targets concurrently (got " + JSON.stringify(planned.map((o) => o.sourceRoom + ">" + o.targetRoom + ":" + o.amount)) + ")");
    assert(planned.reduce((sum, o) => sum + o.amount + (o.transactionCost || 0), 0) <= 29000, "0097 concurrent transfers never overspend the source (got " + planned.reduce((sum, o) => sum + o.amount + (o.transactionCost || 0), 0) + ")");
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
// A SELL must reconcile against terminal stock that already sits at/above
// the staging buffer (e.g. dumped there by unrelated logistics before the
// operation existed) instead of stalling forever with loadedAmount stuck
// at zero, unable to ever pass candidateOrders' cargo cap. The excess over
// what the operation actually needs must be swept back to storage, even
// though it predates this tick's bookkeeping (no prior "seen" baseline).
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (used, capacity) => ({ [RESOURCE_ENERGY]: used, getFreeCapacity: () => capacity - used, getUsedCapacity: () => used, getCapacity: () => capacity });
    const room = { name: "W7N21", controller: { my: true }, find: () => [], storage: { id: "W7N21-storage", store: makeStore(0, 30000) }, terminal: { id: "W7N21-terminal", cooldown: 0, store: makeStore(5000, 30000), send: () => OK } };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N21: room });
    let dealAmount = 0;
    Game.market = { credits: 100000, incomingTransactions: [], orders: {}, getAllOrders: () => [{ id: "buy-1", roomName: "W7N22", price: 50, remainingAmount: 5000 }], deal: (id, value) => { dealAmount = value; return OK; }, calcTransactionCost: () => 0 };
    Memory.terminalOps = {
        nextId: 1,
        operations: { preloaded: { id: "preloaded", kind: "sell", sourceRoom: "W7N21", targetRoom: null, resourceType: RESOURCE_ENERGY, amount: 1000, remaining: 1000, loadedAmount: 0, limit: 45, energyFairPrice: 0, state: "queued", sentAmount: 0, createdTick: Game.time, updatedTick: Game.time } },
        seenIncoming: {}, events: [], terminalBalance: {},
    };
    terminalOps.tick();
    const surplusReceipt = Object.values(Memory.terminalOps.operations).find((op) => op.kind === "receipt");
    assert(surplusReceipt && surplusReceipt.amount === 4000, "0098 terminal stock beyond what a pending SELL needs is swept back to storage as a receipt, even with no prior 'seen' baseline");
    terminalOps.tick();
    assert(dealAmount === 1000, "0098 SELL deals terminal stock that already exceeds the staging buffer instead of stalling with loadedAmount stuck at zero");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// A transfer's cargo that already landed in the destination terminal must
// stay reserved even after a failed unload attempt demotes the transfer's
// own state from "awaitingReceipt" to plain "waiting" (assign()'s no-hauler
// fallback) - otherwise the exact same physical stock looks unclaimed on
// every following tick and gets minted into a duplicate receipt again and
// again. Real bug: a stuck transfer's energy ballooned a receipt's amount
// from 10000 to 103000 within a handful of ticks in production.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (used, capacity) => ({ [RESOURCE_ENERGY]: used, getFreeCapacity: () => capacity - used, getUsedCapacity: () => used, getCapacity: () => capacity });
    const room = { name: "W7N30", controller: { my: true }, find: () => [], storage: { id: "W7N30-storage", store: makeStore(0, 30000) }, terminal: { id: "W7N30-terminal", cooldown: 0, store: makeStore(5000, 30000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N30: room });
    Memory.terminalOps = {
        nextId: 1,
        operations: { stuck: { id: "stuck", kind: "transfer", sourceRoom: "W7N29", targetRoom: "W7N30", resourceType: RESOURCE_ENERGY, amount: 5000, remaining: 0, loadedAmount: 5000, sentAmount: 5000, receivedAmount: 0, transactionCost: 0, targetTerminalBaseline: 0, state: "waiting", waitingDirection: "unload", error: "sem hauler disponível", createdTick: Game.time - 5, updatedTick: Game.time } },
        seenIncoming: {}, events: [], terminalBalance: {},
    };
    terminalOps.tick();
    const duplicateReceipt = Object.values(Memory.terminalOps.operations).find((op) => op.kind === "receipt");
    assert(!duplicateReceipt, "0098 a stuck-waiting transfer's already-delivered cargo is not re-detected as surplus and duplicated into a receipt");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps;
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
    logs.length = 0;
    console.log = (...a) => { logs.push(a.join(" ")); };
    const noFunds = terminalOps.sell("W7N19", "pixel", 50, 49500, true);
    terminalOps.tick();
    terminalOps.tick();
    console.log = origLog;
    const noFundsOp = Memory.terminalOps.operations[noFunds.id];
    assert(noFundsOp.state === "failed" && createCalls === 0 && /disponível 0/.test(noFundsOp.error),
        "pixel SELL without credits fails before createOrder with the fee diagnostics");
    // Both failure points along the deal->list fallback chain must be
    // visible on the console, not just recorded in op.error - a user with no
    // credits yet must be able to see WHY nothing happened without polling
    // terminalOperations() (bug real reportado, 2026-09-24: falhas ficavam
    // silenciosas fora do console).
    assert(logs.some((line) => line.indexOf(noFunds.id) >= 0 && line.indexOf("nenhuma ordem cobre o limite") >= 0),
        "executeDeal() logs the best near-miss order and its delivery-cost-adjusted price when no candidate meets the limit");
    assert(logs.some((line) => line.indexOf(noFunds.id) >= 0 && line.indexOf("falhou") >= 0 && line.indexOf(noFundsOp.error) >= 0),
        "touch() logs to console when an operation reaches the final 'failed' state");
    const retry = terminalOps.sell("W7N19", "pixel", 50, 49500);
    assert(retry.ok, "failed pixel SELL releases the terminal/resource lock");
    // A pixel never enters a terminal, so it must not collide with the "one
    // operation of this kind per room" rule that protects terminal space and
    // cooldown (bug real, usuário reportou em produção 2026-09-24: uma venda de
    // O ativa em W7N49 recusava terminalSell(..., "pixel", ...)).
    Memory.terminalOps.operations.energySale = {
        id: "energySale", kind: "sell", sourceRoom: "W7N19", targetRoom: null, resourceType: RESOURCE_ENERGY,
        amount: 1000, remaining: 1000, loadedAmount: 0, limit: 50, state: "listed",
        createdTick: Game.time, updatedTick: Game.time,
    };
    const mixed = terminalOps.sell("W7N19", "pixel", 50, 49500);
    assert(!mixed.ok, "a second pixel SELL still conflicts with the pixel SELL already active");
    terminalOps.cancel(retry.id);
    const afterCancel = terminalOps.sell("W7N19", "pixel", 50, 49500);
    assert(afterCancel.ok, "a terminal-backed SELL in the same room never blocks a marketOnly SELL");
    terminalOps.cancel(afterCancel.id);
    delete Memory.terminalOps.operations.energySale;

    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Game.market.credits = 200000;
 marketHistoryStore.clear(); market.reset();
    Game.time++;
    market.scan();
    const funded = terminalOps.sell("W7N19", "pixel", 50, 49500, true);
    terminalOps.tick();
    terminalOps.tick();
    const fundedOp = Memory.terminalOps.operations[funded.id];
    assert(fundedOp.state === "listing" && createCalls === 1,
        "pixel SELL with enough credits calls createOrder and enters listing");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// pixel/accessKey/cpuUnlock orders never carry a roomName - they aren't
// shipped anywhere, so the API never attaches a room to them. scoredOrders()
// used to require a truthy roomName unconditionally, so a real BUY order for
// one of these resources was silently discarded and terminalSell() always
// fell straight to "listagem própria" no matter how deep the book was (bug
// real, usuário reportou em produção, 2026-09-24: marketPrice("pixel")
// mostrava currentBuyVolume > 0 mas terminalSell dizia "nenhuma ordem no
// mercado" com qualquer limite).
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    // Monkeypatch market.snapshot() directly instead of market.reset()/scan():
    // those touch module-singleton state (lastSnapshot, temporalSnapshots,
    // marketHistoryStore's RawMemory segment) shared with every other test in
    // this file, and this test runs nowhere near the tests that set that
    // state up - clobbering it here left an unrelated later test (0098
    // market-only pixel BUY/SELL) without the snapshot continuity it expected
    // (bug real found while writing this test, 2026-09-24: green in
    // isolation, broke a distant test when run as part of the full suite).
    const oldSnapshot = market.snapshot;
    market.snapshot = () => ({ tick: Game.time, resources: { pixel: { buyPrice: 55000, sellPrice: 55000, fairPrice: 55000 } } });
    const room = { name: "W7N23", controller: { my: true } };
    const orders = [{ id: "pixel-buy-roomless", resourceType: "pixel", type: ORDER_BUY, price: 55000, remainingAmount: 100, roomName: null }];
    Game.rooms = Object.assign({}, oldRooms, { W7N23: room });
    const dealCalls = [];
    Game.market = {
        credits: 200000,
        incomingTransactions: [],
        orders: {},
        getAllOrders: (filter) => filter
            ? orders.filter((order) => order.type === filter.type && order.resourceType === filter.resourceType)
            : orders,
        deal: (orderId, dealAmount, sourceRoom) => { dealCalls.push([orderId, dealAmount, sourceRoom]); return OK; },
    };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    terminalOps.sell("W7N23", "pixel", 50, 50000);
    terminalOps.tick();
    assert(dealCalls.length === 1 && dealCalls[0][0] === "pixel-buy-roomless",
        "a BUY order with roomName:null (pixel/accessKey/cpuUnlock's real shape) is still a valid candidate for a marketOnly SELL");
    market.snapshot = oldSnapshot;
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// ROADMAP 0098 a marketOnly SELL that falls back to self-listing must not bind
// to a stale, unrelated order just because op.listedTick happens to still be
// undefined at that point. bindCreatedOrders() used to compare
// `order.created < op.listedTick`, and `n < undefined` is always false in JS,
// so an op that reached "listing" via executeDeal()'s no-candidate branch
// (before listResidual() ever ran) would silently bind to the very first
// matching order in Game.market.orders - including an old, already
// fully-filled one from a completely different operation. syncManagedOrders()
// then fell back to op.remaining (op.listedAmount was never set, since no real
// createOrder() had happened yet) as the baseline, computed a fake "filled" of
// the whole requested amount against that dead order's remainingAmount:0, and
// marked the operation "completed" without ever creating an order or trading
// anything (bug real, usuário reportou em produção, 2026-09-24: terminalSell
// de 1000 pixel virou "completed"/listedFilled:1000 vinculado a uma ordem
// antiga de 200 já zerada, sem nenhuma venda real).
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    const oldSnapshot = market.snapshot;
    market.snapshot = () => ({ tick: Game.time, resources: { pixel: { buyPrice: 50000, sellPrice: 50000, fairPrice: 50000 } } });
    const room = { name: "W7N23", controller: { my: true } };
    Game.rooms = Object.assign({}, oldRooms, { W7N23: room });
    let nextOrderId = 1, createCalls = 0;
    const orders = { "stale-exhausted": { id: "stale-exhausted", price: 54210, remainingAmount: 0, amount: 200, resourceType: "pixel", type: ORDER_SELL, roomName: "W7N23", created: Game.time - 50000 } };
    Game.market = {
        credits: 20000000, incomingTransactions: [],
        orders,
        getAllOrders: () => [],
        createOrder: (request) => {
            createCalls++;
            const id = "fresh-" + (nextOrderId++);
            orders[id] = { id, price: request.price, remainingAmount: 50, amount: 50, resourceType: "pixel", type: ORDER_SELL, roomName: "W7N23", created: Game.time };
            return OK;
        },
        cancelOrder: () => OK,
    };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const created = terminalOps.sell("W7N23", "pixel", 50, 59800, true);

    terminalOps.tick(); // queued -> executeDeal finds no candidate -> "listing", listedTick still undefined
    let op = Memory.terminalOps.operations[created.id];
    assert(op.state === "listing" && !op.marketOrderId && !op.listedTick,
        "0098 a marketOnly SELL with no covering candidate goes to listing without touching any pre-existing order yet");

    terminalOps.tick(); // bindCreatedOrders must skip (no listedTick yet); listResidual() then creates the real order
    op = Memory.terminalOps.operations[created.id];
    assert(op.marketOrderId !== "stale-exhausted" && op.state !== "completed",
        "0098 an op with no listedTick is never bound to a pre-existing, unrelated order");
    assert(createCalls === 1 && op.listedAmount === 50,
        "0098 listResidual() actually creates a fresh order instead of being skipped by a bad bind");

    terminalOps.tick(); // bindCreatedOrders now finds the fresh order (created >= listedTick) and binds it
    op = Memory.terminalOps.operations[created.id];
    assert(op.marketOrderId === "fresh-1" && op.state === "listed" && op.remaining === 50,
        "0098 the op binds to the order it actually created, not the stale one, and remaining stays untouched");

    market.snapshot = oldSnapshot;
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// ROADMAP 0098 repricing a live order uses changeOrderPrice, not
// cancelOrder + createOrder. The old path re-paid the full 5% listing fee every
// repriceInterval and refunded nothing (bug real, usuário reportou em produção
// 2026-09-24: terminal-180, 62751 O listadas a 62.445, ~196k créditos por
// reprecificação), and it cancelled BEFORE checking whether it could afford the
// new order, so an operation short on credits lost the listing it already had.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N21: { name: "W7N21", controller: { my: true } } });
    const book = [{ id: "rival-sell", resourceType: "pixel", type: ORDER_SELL, price: 60000, remainingAmount: 100, roomName: "W7N22" }];
    const run = (credits, withChangeOrderPrice) => {
        const calls = { cancel: 0, create: 0, change: [] };
        Game.market = {
            credits, incomingTransactions: [],
            orders: { "live-1": { id: "live-1", price: 70000, remainingAmount: 50, resourceType: "pixel", type: ORDER_SELL, roomName: "W7N21", created: 0 } },
            getAllOrders: (filter) => filter ? book.filter((order) => order.type === filter.type && order.resourceType === filter.resourceType) : book,
            createOrder: () => { calls.create++; return OK; },
            cancelOrder: () => { calls.cancel++; return OK; },
        };
        if (withChangeOrderPrice) Game.market.changeOrderPrice = (id, price) => { calls.change.push([id, price]); return OK; };
        Memory.terminalOps = { nextId: 1, operations: { listedOp: {
            id: "listedOp", kind: "sell", sourceRoom: "W7N21", targetRoom: null, resourceType: "pixel",
            amount: 50, remaining: 50, loadedAmount: 0, limit: 40000, energyFairPrice: 0, transactionCost: 0,
            marketOnly: true, marketOrderId: "live-1", listedPrice: 70000, listedAmount: 50,
            listedTick: Game.time - 5000, repriceTick: Game.time - 5000,
            state: "listed", createdTick: Game.time - 5000, updatedTick: Game.time - 5000,
        } }, seenIncoming: {}, events: [], terminalBalance: {} };
        terminalOps.tick();
        return { calls, op: Memory.terminalOps.operations.listedOp };
    };

    const cheap = run(0, true);
    assert(cheap.calls.change.length === 1 && cheap.calls.change[0][0] === "live-1",
        "0098 repricing a live order calls changeOrderPrice on the order it already owns");
    assert(cheap.calls.cancel === 0 && cheap.calls.create === 0,
        "0098 repricing no longer cancels and recreates the order, so the 5% fee is not re-paid");
    assert(cheap.op.marketOrderId === "live-1" && cheap.op.state === "listed" && cheap.op.listedPrice < 70000,
        "0098 a repriced order keeps its id and records the new price without re-binding");
    assert(cheap.op.repriceTick === Game.time,
        "0098 lowering the price costs nothing, so zero credits still reprices");

    const stranded = run(0, false);
    assert(stranded.calls.cancel === 0 && stranded.calls.create === 0,
        "0098 an operation that cannot afford a fresh order never cancels the one it already paid for");
    assert(stranded.op.state === "listed" && stranded.op.marketOrderId === "live-1" && /changeOrderPrice/.test(stranded.op.error),
        "0098 without changeOrderPrice and without credits the live order survives instead of the op failing");

    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// ROADMAP 0098 a listed SELL keeps the terminal stocked. The public order
// advertises op.remaining, but a buyer can only take what is physically there,
// and listResidual() never assigned a hauler - terminal-180 advertised 62751 O
// against a terminal holding 10000 (bug real, usuário reportou em produção).
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const census = require(path.join(PROJECT, "src/utils/census"));
    const mkStore = (contents, capacity) => Object.assign({
        getFreeCapacity: () => capacity - Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getUsedCapacity: () => Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getCapacity: () => capacity,
    }, contents);
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps, oldCreeps = Game.creeps;
    const run = (inTerminal) => {
        const room = {
            name: "W9N13", controller: { my: true }, find: () => [],
            storage: { id: "W9N13-storage", store: mkStore({ [RESOURCE_ENERGY]: 20000, O: 400000 }, 1000000) },
            terminal: { id: "W9N13-terminal", cooldown: 0, store: mkStore({ [RESOURCE_ENERGY]: 5000, O: inTerminal }, 300000) },
        };
        const hauler = { name: "restocker", room: room, store: mkStore({}, 1000), memory: { role: "hauler", home: "W9N13" }, pos: { roomName: "W9N13" } };
        Game.rooms = Object.assign({}, oldRooms, { W9N13: room });
        Game.creeps = { restocker: hauler };
        let createCalls = 0;
        Game.market = {
            credits: 5000000, incomingTransactions: [],
            orders: { "live-2": { id: "live-2", price: 60, remainingAmount: 62751, resourceType: "O", type: ORDER_SELL, roomName: "W9N13", created: 0 } },
            calcTransactionCost: () => 0,
            getAllOrders: () => [{ id: "rival", resourceType: "O", type: ORDER_SELL, price: 80, remainingAmount: 1000, roomName: "W9N14" }],
            createOrder: () => { createCalls++; return OK; },
            cancelOrder: () => OK,
            changeOrderPrice: () => OK,
            deal: () => OK,
        };
        Memory.terminalOps = { nextId: 1, operations: { listedSale: {
            id: "listedSale", kind: "sell", sourceRoom: "W9N13", targetRoom: null, resourceType: "O",
            amount: 80000, remaining: 62751, loadedAmount: inTerminal, limit: 45, energyFairPrice: 1,
            transactionCost: 0, marketOrderId: "live-2", listedPrice: 60, listedAmount: 62751,
            listedTick: Game.time, repriceTick: Game.time,
            state: "listed", createdTick: Game.time, updatedTick: Game.time,
        } }, seenIncoming: {}, events: [], terminalBalance: {} };
        census.build();
        terminalOps.tick();
        return { op: Memory.terminalOps.operations.listedSale, job: hauler.memory.terminalJob };
    };

    const starved = run(10000);
    assert(starved.job && starved.job.direction === "load" && starved.job.resourceType === "O",
        "0098 a listed SELL whose terminal is under-stocked dispatches a hauler to restock it");
    assert(starved.job.amount === 62751 - 10000,
        "0098 the restock tops the terminal up to min(staging buffer, remaining), not to the advertised order size");
    assert(starved.op.state === "loading" && starved.op.marketOrderId === "live-2",
        "0098 restocking a listed order keeps the order itself untouched");

    // the only job left is scanTerminalBalances() sweeping the leftover fee
    // energy back to storage - unrelated to this operation's cargo.
    const stocked = run(Math.floor(300000 * 0.85));
    assert(stocked.op.state === "listed" && !(stocked.job && stocked.job.direction === "load" && stocked.job.resourceType === "O"),
        "0098 a listed SELL already holding a full buffer is left alone instead of churning hauler jobs");

    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps; Game.creeps = oldCreeps;
    census.build();
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
    // A market-only operation has no terminal to cross-check, so it settles
    // against the order book instead - but still only on the tick after
    // deal(), never within it (see the settling regression at the end).
    const pixelBuy = terminalOps.buy("W7N17", "pixel", 2, 600);
    terminalOps.tick();
    Game.time++; terminalOps.tick();
    const pixelSell = terminalOps.sell("W7N17", "pixel", 2, 400);
    terminalOps.tick();
    Game.time++; terminalOps.tick();
    assert(pixelBuy.ok && pixelSell.ok && Memory.terminalOps.operations[pixelBuy.id].state === "completed" && Memory.terminalOps.operations[pixelSell.id].state === "completed" && deals === 2, "0098 market-only pixel BUY and SELL work without storage or terminal");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}

// op.limit gates on the order's raw price, not the delivery-cost-adjusted
// "effective" price - reversed 2026-09-24 (bug real, usuário reportou em
// produção): a SELL with limit 43 found a buy order at 43.925 but skipped it
// because delivery cost to a distant room netted the effective price down to
// 32.113. The original 0098 design ("limite sempre é líquido") did that on
// purpose, but the user sets the limit by reading the market's raw price
// (marketPrice()/order book), so a raw price above the limit must deal even
// when its delivery-cost-adjusted net would not have cleared it.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (contents, capacity) => Object.assign({
        getFreeCapacity: () => capacity - Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getUsedCapacity: () => Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getCapacity: () => capacity,
    }, contents);
    const room = {
        name: "W7N40", controller: { my: true }, find: () => [],
        storage: { id: "W7N40-storage", store: makeStore({ [RESOURCE_ENERGY]: 20000 }, 30000) },
        terminal: { id: "W7N40-terminal", cooldown: 0, store: makeStore({ [RESOURCE_ENERGY]: 500, [RESOURCE_OXYGEN]: 20 }, 30000) },
    };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N40: room });
    let dealAmount = 0, dealOrderId = null;
    Game.market = {
        credits: 100000, incomingTransactions: [], orders: {},
        getAllOrders: () => [{ id: "far-buy", roomName: "E2N39", price: 100, remainingAmount: 1000 }],
        calcTransactionCost: () => 80,
        deal: (id, value) => { dealOrderId = id; dealAmount = value; return OK; },
    };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Memory.terminalOps.operations.rawGate = {
        id: "rawGate", kind: "sell", sourceRoom: "W7N40", resourceType: RESOURCE_OXYGEN, amount: 20, remaining: 20,
        loadedAmount: 20, limit: 97, energyFairPrice: 1, state: "atTerminal", sentAmount: 0,
        createdTick: Game.time, updatedTick: Game.time,
    };
    // Sanity: raw price 100 clears limit 97, but 80 energy of delivery cost
    // at fairPrice 1 over a 20-unit deal nets 100 - (80*1/20) = 96 - which
    // would have missed the old effective-price gate. Fee ratio (4/100 = 4%)
    // stays under terminalOps.maxFeeRatio's default 5% on purpose - that's
    // a separate rule, covered by its own tests below.
    terminalOps.tick();
    assert(dealOrderId === "far-buy" && dealAmount === 20,
        "0098 SELL deals against an order whose raw price (100) clears op.limit (97) even though its net effective price (96) would not");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// terminalOps.maxFeeRatio (pedido do usuário, 2026-09-30): uma ordem cuja
// taxa de entrega exceda 5% do preço bruto nunca fecha negócio numa
// operação comum, mesmo clareando o limite de preço bruto - bug real, um
// SELL fechou com preço bruto 38.717 e efetivo 7.505 (taxa ~81% do valor)
// porque nada além do limite de preço bruto barrava o deal(). skipFeeCap
// (usado por marketFlip.js) restaura o comportamento antigo.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (contents, capacity) => Object.assign({
        getFreeCapacity: () => capacity - Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getUsedCapacity: () => Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getCapacity: () => capacity,
    }, contents);
    const room = {
        name: "W7N42", controller: { my: true }, find: () => [],
        storage: { id: "W7N42-storage", store: makeStore({ [RESOURCE_ENERGY]: 20000 }, 30000) },
        terminal: { id: "W7N42-terminal", cooldown: 0, store: makeStore({ [RESOURCE_ENERGY]: 500, [RESOURCE_OXYGEN]: 20 }, 30000) },
    };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N42: room });
    let dealCalls = 0;
    // price 50, delivery cost 200 energy @ fairPrice 1 over 20 units ->
    // fee 10, ratio 10/50 = 20%, well above the 5% default cap.
    Game.market = {
        credits: 100000, incomingTransactions: [], orders: {},
        getAllOrders: () => [{ id: "expensive-delivery", roomName: "E2N39", price: 50, remainingAmount: 1000 }],
        calcTransactionCost: () => 200,
        deal: () => { dealCalls++; return OK; },
    };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Memory.terminalOps.operations.feeCapped = {
        id: "feeCapped", kind: "sell", sourceRoom: "W7N42", resourceType: RESOURCE_OXYGEN, amount: 20, remaining: 20,
        loadedAmount: 20, limit: 45, energyFairPrice: 1, state: "atTerminal", sentAmount: 0,
        createdTick: Game.time, updatedTick: Game.time,
    };
    terminalOps.tick();
    assert(dealCalls === 0 && Memory.terminalOps.operations.feeCapped.state === "waiting",
        "0098 an order whose delivery fee exceeds maxFeeRatio (20% > 5%) never deals, even though its raw price clears the limit");
    Memory.terminalOps.operations.feeCapped.state = "atTerminal";
    Memory.terminalOps.operations.feeCapped.skipFeeCap = true;
    terminalOps.tick();
    assert(dealCalls === 1,
        "0098 skipFeeCap:true (used by marketFlip.js) restores the pre-cap behavior, dealing despite the same high fee ratio");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// 2026-10-03 (producao): "deal(...) -> -6" repetido a cada ~7 ticks. loadedAmount (contabilidade)
// maior que o estoque real do terminal: o candidateOrders() oferecia a quantidade contabilizada, o
// engine devolvia ERR_NOT_ENOUGH_RESOURCES e a operacao voltava ao mesmo estado para sempre.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (contents, capacity) => Object.assign({
        getFreeCapacity: () => capacity - Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getUsedCapacity: () => Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getCapacity: () => capacity,
    }, contents);
    const room = {
        name: "W7N43", controller: { my: true }, find: () => [],
        storage: { id: "W7N43-storage", store: makeStore({ [RESOURCE_ENERGY]: 20000, [RESOURCE_OXYGEN]: 0 }, 300000) },
        terminal: { id: "W7N43-terminal", cooldown: 0, store: makeStore({ [RESOURCE_ENERGY]: 5000, [RESOURCE_OXYGEN]: 100 }, 300000) },
    };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps, oldLog = console.log;
    Game.rooms = Object.assign({}, oldRooms, { W7N43: room });
    const dealAmounts = [];
    let dealStatus = OK;
    Game.market = {
        credits: 100000, incomingTransactions: [], orders: {},
        getAllOrders: () => [{ id: "buyer", roomName: "W9N9", price: 50, remainingAmount: 1000 }],
        calcTransactionCost: () => 10,
        deal: (id, amount) => { dealAmounts.push(amount); return dealStatus; },
    };
    const lines = [];
    // capture the module's own output, but let the assertions' "ok" lines through
    console.log = (...a) => { const line = a.join(" "); if (line.indexOf("ok  : ") === 0) oldLog(line); else lines.push(line); };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const mkOp = (id) => ({ id, kind: "sell", sourceRoom: "W7N43", resourceType: RESOURCE_OXYGEN, amount: 300, remaining: 300, loadedAmount: 300,
        limit: 40, energyFairPrice: 1, skipFeeCap: true, state: "atTerminal", sentAmount: 0, createdTick: Game.time, updatedTick: Game.time });

    // (a) accounting says 300, the terminal holds 100: no deal for 300 is ever attempted
    Memory.terminalOps.operations.short = mkOp("short");
    terminalOps.tick();
    const shortOp = Memory.terminalOps.operations.short;
    assert(dealAmounts.length === 0 && shortOp.loadedAmount === 100 && shortOp.state === "queued",
        "0111 deal -6: a sale never asks for more than the terminal really holds - loadedAmount drops to the real stock and the rest is carried again (deals " + dealAmounts.length + ", loaded " + shortOp.loadedAmount + ", state " + shortOp.state + ")");
    assert(/estoque real no terminal \(100\)/.test(shortOp.error || ""), "0111 deal -6: the operation says why (op.error)");
    // (b) the staging step does not raise it back to the old figure, and asks the hauler for the 200 missing
    terminalOps.tick();
    assert(shortOp.loadedAmount === 100, "0111 deal -6: staging keeps the real figure instead of the stale one (got " + shortOp.loadedAmount + ")");
    // (b2) the staging step on its own: an operation waiting with a stale 300 while 100 are there
    Memory.terminalOps.operations.stale = mkOp("stale");
    delete Memory.terminalOps.operations.short;
    Memory.terminalOps.operations.stale.state = "waiting";
    Memory.terminalOps.nextId++; // activeIds() is an index rebuilt when nextId changes: an op injected by hand needs this
    terminalOps.tick();
    assert(Memory.terminalOps.operations.stale.loadedAmount === 100 && dealAmounts.length === 0,
        "0111 deal -6: stageSaleCargo lowers a stale loadedAmount to the real stock too (got " + Memory.terminalOps.operations.stale.loadedAmount + ")");
    delete Memory.terminalOps.operations.stale;
    Memory.terminalOps.operations.short = shortOp;
    Memory.terminalOps.nextId++;
    // (c) once the 200 arrive, the whole 300 is dealt
    room.terminal.store[RESOURCE_OXYGEN] = 300;
    shortOp.state = "atTerminal"; shortOp.loadedAmount = 300; Game.time += 10;
    terminalOps.tick();
    assert(dealAmounts.length === 1 && dealAmounts[0] === 300, "0111 deal -6: with the stock really there the full amount is dealt (deals " + JSON.stringify(dealAmounts) + ")");

    // (d) the engine itself answers -6 although the books agree: trust the real store and do not spam
    delete Memory.terminalOps.operations.short;
    room.terminal.store[RESOURCE_OXYGEN] = 300;
    Memory.terminalOps.operations.neg6 = mkOp("neg6");
    Memory.terminalOps.nextId++;
    dealStatus = ERR_NOT_ENOUGH_RESOURCES; dealAmounts.length = 0; lines.length = 0;
    for (let i = 0; i < 12; i++) {
        Game.time += 8;
        const op = Memory.terminalOps.operations.neg6;
        if (op.state === "queued" || op.state === "waiting") op.state = "atTerminal"; // what the staging step does when the cargo is there
        if (op.loadedAmount < 300) { room.terminal.store[RESOURCE_OXYGEN] = 300; op.loadedAmount = 300; }
        terminalOps.tick();
    }
    const neg6Op = Memory.terminalOps.operations.neg6;
    assert((neg6Op.shortCargoCount || 0) >= 1 && (neg6Op.dealFailures || 0) >= 1 && neg6Op.state !== "waiting",
        "0111 deal -6: an engine -6 sends a sale back to staging instead of parking it in 'waiting' (state " + neg6Op.state + ", shortCargo " + neg6Op.shortCargoCount + ")");
    const dealLines = lines.filter((l) => l.indexOf("neg6 deal(") >= 0);
    assert(dealLines.length === 1, "0111 deal -6: twelve identical -6 answers print one line, not twelve (printed " + dealLines.length + ")");
    assert(dealLines.length && /ERR_NOT_ENOUGH_RESOURCES: terminal com 300 \S+ e 5000 de energia/.test(dealLines[0]), "0111 deal -6: the line says what the terminal really holds (got " + dealLines[0] + ")");
    // a different status prints again
    dealStatus = ERR_FULL; lines.length = 0;
    Game.time += 8; Memory.terminalOps.operations.neg6.state = "atTerminal"; Memory.terminalOps.operations.neg6.loadedAmount = 300;
    terminalOps.tick();
    assert(lines.some((l) => l.indexOf("neg6 deal(") >= 0 && l.indexOf("-> " + ERR_FULL) >= 0), "0111 deal -6: a different status is logged at once");

    console.log = oldLog;
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// managedTerminalIncrease() must recognize a SELL's feeLoadedAmount even
// when the operation's own resourceType ("O") differs from the resourceType
// being queried ("energy") - a market fee is always paid in energy no matter
// what is being sold. Real bug (2026-09-24, produção): a SELL of "O" staged
// energy in the terminal to pay its own fee; the resourceType mismatch made
// that staged energy invisible to managedTerminalIncrease(), so (a)
// scanTerminalBalances() treated it as unclaimed surplus and folded it into
// an unrelated energy receipt's amount every tick (ballooning it well past
// what was ever actually received), and (b) that same receipt's tickReceipt()
// happily withdrew the fee-staged energy back to storage the instant it
// landed, undoing the SELL's fee job forever - a hauler looping the same
// ~3424 energy in and out of the terminal without end.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (used, capacity) => ({ [RESOURCE_ENERGY]: used, getFreeCapacity: () => capacity - used, getUsedCapacity: () => used, getCapacity: () => capacity });
    const room = {
        name: "W7N45", controller: { my: true }, find: () => [],
        storage: { id: "W7N45-storage", store: makeStore(0, 30000) },
        terminal: { id: "W7N45-terminal", cooldown: 0, store: makeStore(3424, 30000), send: () => OK },
    };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N45: room });
    Game.market = { incomingTransactions: [] };
    Memory.terminalOps = {
        nextId: 1,
        operations: {
            feeSell: {
                id: "feeSell", kind: "sell", sourceRoom: "W7N45", targetRoom: null, resourceType: "O",
                amount: 1000, remaining: 1000, loadedAmount: 1000, feeLoadedAmount: 3424, state: "loading",
                createdTick: Game.time, updatedTick: Game.time,
            },
            energyReceipt: {
                id: "energyReceipt", kind: "receipt", sourceRoom: null, targetRoom: "W7N45", resourceType: RESOURCE_ENERGY,
                amount: 5000, remaining: 5000, receivedAmount: 0, state: "waiting", createdTick: Game.time, updatedTick: Game.time,
            },
        },
        seenIncoming: {}, events: [], terminalBalance: {},
    };
    terminalOps.tick();
    const receipts = Object.values(Memory.terminalOps.operations).filter((op) => op.kind === "receipt");
    assert(receipts.length === 1, "0098 a SELL's fee-staged energy is not folded into an unrelated receipt as surplus");
    const energyReceipt = Memory.terminalOps.operations.energyReceipt;
    assert(energyReceipt.amount === 5000, "0098 a SELL's fee-staged energy does not balloon an unrelated receipt's amount");
    assert(energyReceipt.state === "waiting" && !energyReceipt.haulerName && !energyReceipt.error,
        "0098 a receipt does not withdraw energy a SELL already staged in the terminal for its own market fee");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// Game.market.deal() only REGISTERS an intent - the engine executes it after
// the script returns, so within the tick that called deal() nothing about the
// trade is observable: not Game.market.credits, not the order's
// remainingAmount, not the terminal's own store. Root cause of the real bug
// (2026-09-24, produção, "nenhuma ordem foi efetivada"): executeDeal() settled
// the operation the instant deal() returned OK - zeroing loadedAmount /
// feeLoadedAmount and marking it "completed" - which dropped the operation's
// claim over cargo still physically sitting in the terminal. scanTerminalBalances(),
// which runs at the END of that same tick(), then saw that cargo and the fee
// energy as unclaimed surplus, minted receipts for both and dispatched haulers
// to withdraw them right back to storage. Those withdraw intents land in the
// same end-of-tick batch as the deal, emptying the terminal out from under the
// pending trade: deal() returned OK and nothing happened - no transaction in
// the history, credits frozen, remainingAmount untouched - while the hauler
// shuttled the same stock in and out of the terminal forever. The operation
// must hold every claim through a "settling" tick and only then settle,
// against the terminal's real store.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const savedResources = RESOURCES_ALL;
    RESOURCES_ALL = [RESOURCE_ENERGY, "O"];
    const run = (engineExecutesDeal) => {
        const held = { [RESOURCE_ENERGY]: 400, O: 1000 };
        const mkStore = (contents, capacity) => Object.assign({
            getFreeCapacity: () => capacity - Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
            getUsedCapacity: () => Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
            getCapacity: () => capacity,
        }, contents);
        const terminalStore = mkStore(held, 300000);
        const room = {
            name: "W9N9", controller: { my: true }, find: () => [],
            storage: { id: "W9N9-storage", store: mkStore({ [RESOURCE_ENERGY]: 20000 }, 300000) },
            terminal: { id: "W9N9-terminal", cooldown: 0, store: terminalStore },
        };
        const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps, oldTime = Game.time;
        Game.rooms = Object.assign({}, oldRooms, { W9N9: room });
        Game.market = {
            credits: 100000, incomingTransactions: [], orders: {}, calcTransactionCost: () => 400,
            getAllOrders: () => [{ id: "buy-real", roomName: "W1N1", price: 50, remainingAmount: 100000 }],
            deal: () => OK,
        };
        Memory.terminalOps = { nextId: 1, operations: { s1: {
            id: "s1", kind: "sell", sourceRoom: "W9N9", targetRoom: null, resourceType: "O",
            amount: 1000, remaining: 1000, loadedAmount: 1000, feeLoadedAmount: 400,
            limit: 45, energyFairPrice: 1, transactionCost: 0,
            state: "atTerminal", createdTick: Game.time, updatedTick: Game.time,
        } }, seenIncoming: {}, events: [], terminalBalance: {} };
        terminalOps.tick();
        const afterDeal = Object.assign({}, Memory.terminalOps.operations.s1);
        afterDeal.receipts = Object.keys(Memory.terminalOps.operations).filter((key) => Memory.terminalOps.operations[key].kind === "receipt").length;
        // the engine now processes the end-of-tick intents, then a tick passes
        if (engineExecutesDeal) { terminalStore.O -= 1000; terminalStore[RESOURCE_ENERGY] -= 400; }
        Game.time += 1;
        terminalOps.tick();
        const afterSettle = Object.assign({}, Memory.terminalOps.operations.s1);
        afterSettle.receipts = Object.keys(Memory.terminalOps.operations).filter((key) => Memory.terminalOps.operations[key].kind === "receipt").length;
        Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps; Game.time = oldTime;
        return { afterDeal, afterSettle };
    };

    const good = run(true);
    assert(good.afterDeal.state === "settling" && good.afterDeal.remaining === 1000 && !good.afterDeal.dealtAmount,
        "0098 a deal() that returned OK parks the operation in 'settling' instead of settling in the same tick");
    assert(good.afterDeal.loadedAmount === 1000 && good.afterDeal.feeLoadedAmount === 400,
        "0098 a settling operation keeps its claim over the staged cargo and the staged fee energy");
    assert(good.afterDeal.receipts === 0,
        "0098 the tick that calls deal() mints no receipt for the cargo still physically in the terminal");
    assert(good.afterSettle.state === "completed" && good.afterSettle.dealtAmount === 1000 && good.afterSettle.remaining === 0,
        "0098 a trade the terminal's store confirms settles on the following tick");
    assert(good.afterSettle.loadedAmount === 0 && good.afterSettle.feeLoadedAmount === 0 && good.afterSettle.transactionCost === 400,
        "0098 settling a confirmed trade releases the cargo/fee claims and books the transaction cost");
    assert(good.afterSettle.receipts === 0,
        "0098 a confirmed trade leaves nothing behind for scanTerminalBalances() to sweep");

    const silent = run(false);
    assert(silent.afterSettle.state === "atTerminal" && silent.afterSettle.remaining === 1000 && !silent.afterSettle.dealtAmount,
        "0098 a deal() that returned OK but moved nothing in the terminal never books a sale");
    assert(silent.afterSettle.loadedAmount === 1000 && silent.afterSettle.feeLoadedAmount === 400,
        "0098 an unobserved trade keeps the staged cargo and fee claimed so no receipt can sweep them");
    assert(Array.isArray(silent.afterSettle.deadOrderIds) && silent.afterSettle.deadOrderIds.indexOf("buy-real") >= 0,
        "0098 an order whose deal produced no observable trade is blacklisted via deadOrderIds");
    assert(silent.afterSettle.receipts === 0,
        "0098 an unobserved trade mints no receipt either - the operation still owns the stock");

    RESOURCES_ALL = savedResources;
}
// ROADMAP 0098 a SELL stages up to saleBufferCapacityRatio of the terminal in
// one batch. The original 10000/0.1 pair split every large sale into 10k
// batches, each paying a hauler round trip plus the terminal cooldown, so the
// user saw a 50k sale sitting on 10k waiting to sell before fetching more.
// 0.85 leaves ~5% for the deal's fee energy and 10% for incoming deliveries.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const config = require(path.join(PROJECT, "src/utils/config"));
    const mkStore = (contents, capacity) => Object.assign({
        getFreeCapacity: () => capacity - Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getUsedCapacity: () => Object.keys(contents).reduce((sum, key) => sum + contents[key], 0),
        getCapacity: () => capacity,
    }, contents);
    const room = {
        name: "W9N11", controller: { my: true }, find: () => [],
        storage: { id: "W9N11-storage", store: mkStore({ [RESOURCE_ENERGY]: 20000, O: 400000 }, 1000000) },
        terminal: { id: "W9N11-terminal", cooldown: 0, store: mkStore({ [RESOURCE_ENERGY]: 5000 }, 300000) },
    };
    const hauler = { name: "stager", room: room, store: mkStore({}, 1000), memory: { role: "hauler", home: "W9N11" }, pos: { roomName: "W9N11" } };
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps, oldCreeps = Game.creeps;
    Game.rooms = Object.assign({}, oldRooms, { W9N11: room });
    Game.creeps = { stager: hauler };
    Game.market = { credits: 100000, incomingTransactions: [], orders: {}, calcTransactionCost: () => 0, getAllOrders: () => [], deal: () => OK };
    Memory.terminalOps = { nextId: 1, operations: { big: {
        id: "big", kind: "sell", sourceRoom: "W9N11", targetRoom: null, resourceType: "O",
        amount: 400000, remaining: 400000, loadedAmount: 0, limit: 1, energyFairPrice: 1,
        transactionCost: 0, state: "queued", createdTick: Game.time, updatedTick: Game.time,
    } }, seenIncoming: {}, events: [], terminalBalance: {} };
    require(path.join(PROJECT, "src/utils/census")).build();
    terminalOps.tick();
    const job = hauler.memory.terminalJob;
    const ratio = config.get("terminalOps.saleBufferCapacityRatio", 0.85);
    assert(job && job.amount === Math.floor(300000 * ratio),
        "0098 a large SELL stages a whole saleBufferCapacityRatio batch instead of 10000 at a time");
    assert(job.amount + Math.floor(300000 * 0.05) <= 300000,
        "0098 the staging batch leaves the terminal room for the deal's fee energy");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps; Game.creeps = oldCreeps;
    require(path.join(PROJECT, "src/utils/census")).build();
}

// ROADMAP 0079 follow-up (2026-09-24): market.transactions/terminalNetwork.transfers
// were "out of scope" while the bot never called Game.market.deal()/terminal.send();
// 0098 made both real, so terminalOps' own event log now feeds the dashboard's
// "Mercado"/"Terminal Network" panels via utils/stats.js.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const statsUtil = require(path.join(PROJECT, "src/utils/stats"));
    const oldOps = Memory.terminalOps, oldRooms = Game.rooms, oldMarket = Game.market;
    Memory.terminalOps = {
        nextId: 1, operations: {}, seenIncoming: {}, terminalBalance: {},
        events: [
            // two SELLs of O settle in the window: 500@10 (settleDeal) + 300@10 (syncManagedOrders passive fill)
            { tick: Game.time, room: "W9N11", from: "W9N11", to: null, kind: "sell", resourceType: "O", amount: 500, credits: 5000, transactionEnergy: 50 },
            { tick: Game.time, room: "W9N11", from: "W9N11", to: null, kind: "sell", resourceType: "O", amount: 300, credits: 3000, transactionEnergy: 0 },
            // one BUY of energy - credits stored negative (money leaving)
            { tick: Game.time, room: "W9N12", from: null, to: "W9N12", kind: "buy", resourceType: RESOURCE_ENERGY, amount: 1000, credits: -4000, transactionEnergy: 0 },
            // two physical transfers on the same room pair/resource - should collapse into one entry
            { tick: Game.time, room: "W9N11", from: "W9N11", to: "W9N12", kind: "transfer", resourceType: RESOURCE_ENERGY, amount: 2000, credits: 0, transactionEnergy: 10 },
            { tick: Game.time, room: "W9N11", from: "W9N11", to: "W9N12", kind: "transfer", resourceType: RESOURCE_ENERGY, amount: 1000, credits: 0, transactionEnergy: 5 },
            // same room pair, different resource - must stay a separate entry, not fold into the energy amount above
            { tick: Game.time, room: "W9N11", from: "W9N11", to: "W9N12", kind: "transfer", resourceType: "O", amount: 400, credits: 0, transactionEnergy: 0 },
            // stale event, outside statsWindowTicks - must not be counted
            { tick: Game.time - 100000, room: "W9N11", from: "W9N11", to: null, kind: "sell", resourceType: "O", amount: 999999, credits: 999999, transactionEnergy: 0 },
        ],
    };
    Game.rooms = {}; Game.market = { credits: 12345 };
    statsUtil();
    const transactions = Memory.stats.market.transactions;
    assert(transactions.sold.O.amount === 800 && transactions.sold.O.credits === 8000,
        "0079 follow-up: sold.<resource> aggregates every 'sell' event in the window, across both settleDeal and syncManagedOrders (got " + JSON.stringify(transactions.sold) + ")");
    assert(transactions.bought[RESOURCE_ENERGY].amount === 1000 && transactions.bought[RESOURCE_ENERGY].credits === 4000,
        "0079 follow-up: bought.<resource>.credits reports a positive magnitude even though record() stores a buy's credits negative (got " + JSON.stringify(transactions.bought) + ")");
    assert(Object.keys(transactions.sold).length === 1 && Object.keys(transactions.bought).length === 1,
        "0079 follow-up: the stale event outside statsWindowTicks is excluded from market.transactions");
    const transfers = Memory.stats.terminalNetwork.transfers;
    const energyTransfer = transfers.find((t) => t.resourceType === RESOURCE_ENERGY);
    const mineralTransfer = transfers.find((t) => t.resourceType === "O");
    assert(transfers.length === 2, "0079 follow-up: terminalNetwork.transfers ignores buy/sell events, keeps one entry per resourceType (got " + JSON.stringify(transfers) + ")");
    assert(energyTransfer && energyTransfer.from === "W9N11" && energyTransfer.to === "W9N12" && energyTransfer.amount === 3000,
        "0079 follow-up: same-pair, same-resource transfers still collapse into one amount (got " + JSON.stringify(energyTransfer) + ")");
    assert(mineralTransfer && mineralTransfer.amount === 400,
        "0079 follow-up: a different resource on the same room pair gets its own entry instead of folding into the energy amount (got " + JSON.stringify(mineralTransfer) + ")");
    Memory.terminalOps = oldOps; Game.rooms = oldRooms; Game.market = oldMarket;
}

// ROADMAP 0111: the flip's guardrail reads marketPricing's own 7-day history
// (market.samples). These tests predate it and only care about flip
// mechanics, so the history is derived lazily from the test's own order book:
// medians equal to the standing pair, plenty of depth - i.e. "a calm market".
const realFlipMarketSamples = require(path.join(PROJECT, "src/utils/market")).samples;
function flipHistoryFromBook() {
    const market = require(path.join(PROJECT, "src/utils/market"));
    market.samples = (resourceType) => {
        const orders = (Game.market && typeof Game.market.getAllOrders === "function" && Game.market.getAllOrders()) || [];
        const asks = orders.filter((o) => o.resourceType === resourceType && o.type === ORDER_SELL).map((o) => o.price);
        const bids = orders.filter((o) => o.resourceType === resourceType && o.type === ORDER_BUY).map((o) => o.price);
        if (!asks.length || !bids.length) return [];
        return priceSamples(Math.max.apply(null, bids), Math.min.apply(null, asks), 72, 1e9);
    };
}
// --- ROADMAP 0110: market flip (instant arbitrage) ----------------------
Memory.settings = legacyTerminalSettings;
function marketFlipModule() {
    // marketPricing binds to whichever market.js instance was current when it
    // loaded (an earlier test reloads market.js), so reload it with the flip.
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/marketPricing"))];
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/marketFlip"))];
    return require(path.join(PROJECT, "src/utils/marketFlip"));
}
function marketFlipRoom(name) {
    return { name, controller: { my: true }, storage: { id: name + "-storage" }, terminal: { id: name + "-terminal" } };
}
function resetMarketFlipState() {
    Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
}
// AC1: test mode only logs a profitable pair - never calls deal()/buy()/sell().
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot, oldBuy = terminalOps.buy, oldSell = terminalOps.sellLot;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: true, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    let dealCalls = 0, buyCalls = 0, sellCalls = 0;
    Game.market = {
        credits: 1000000,
        calcTransactionCost: () => 0,
        deal: () => { dealCalls++; return OK; },
        getAllOrders: () => [
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 20, remainingAmount: 1000, roomName: "W2N3" },
        ],
    };
    flipHistoryFromBook();
    terminalOps.buy = () => { buyCalls++; return { ok: true, id: "should-not-happen" }; };
    terminalOps.sellLot = () => { sellCalls++; return { ok: true, id: "should-not-happen" }; };
    marketFlip.tick();
    const opportunity = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "O");
    assert(opportunity && opportunity.quantity > 0 && opportunity.netProfit > 0 && !opportunity.wouldBlockGuardrail,
        "0110 AC1: test mode logs the profitable pair with quantity/profit (got " + JSON.stringify(opportunity) + ")");
    assert(dealCalls === 0 && buyCalls === 0 && sellCalls === 0,
        "0110 AC1: test mode never calls Game.market.deal()/terminalOps.buy()/terminalOps.sell()");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot; terminalOps.buy = oldBuy; terminalOps.sellLot = oldSell;
}
// AC2/AC10: live mode buys once at scan time, sells only once the buy leg
// reaches "completed"; a thrown exception inside tick() never escapes main.loop().
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot, oldBuy = terminalOps.buy, oldSell = terminalOps.sellLot;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    let buyCalls = 0, sellCalls = 0, buyArgs = null;
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 0,
        getAllOrders: () => [
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 20, remainingAmount: 1000, roomName: "W2N3" },
        ],
    };
    flipHistoryFromBook();
    terminalOps.buy = (room, resourceType, qty, price) => { buyCalls++; buyArgs = { room, resourceType, qty, price }; Memory.terminalOps.operations["buy-1"] = { id: "buy-1", state: "queued" }; return { ok: true, id: "buy-1" }; };
    terminalOps.sellLot = () => { sellCalls++; Memory.terminalOps.operations["sell-1"] = { id: "sell-1", state: "queued" }; return { ok: true, id: "sell-1" }; };
    marketFlip.tick();
    assert(buyCalls === 1 && buyArgs.resourceType === "O" && Memory.marketFlip.active.O && Memory.marketFlip.active.O.state === "buying",
        "0110 AC2: live mode opens exactly one buy at scan time (got " + JSON.stringify(buyArgs) + ")");
    assert(sellCalls === 0, "0110 AC2: sell is not called before the buy leg completes");
    Memory.terminalOps.operations["buy-1"].state = "completed";
    Memory.terminalOps.operations["buy-1"].dealtAmount = 1000; // fully dealt, matches buyArgs.qty
    marketFlip.tick(); // advanceFlips only - scanInterval already elapsed but no new orders needed
    assert(sellCalls === 1 && buyCalls === 1 && Memory.marketFlip.active.O.state === "selling" && Memory.marketFlip.active.O.sellOpId === "sell-1",
        "0110 AC2: sell fires exactly once the buy leg reaches completed, buy is not called again");
    // AC10: guard("marketFlip", ...) isolates a thrown exception.
    const bot = require(path.join(PROJECT, "src/main"));
    const originalTick = marketFlip.tick;
    require(path.join(PROJECT, "src/utils")).marketFlip.tick = () => { throw new Error("boom marketFlip"); };
    const origLog = console.log; const capturedLogs = [];
    console.log = (msg) => capturedLogs.push(String(msg));
    let threw = null;
    try { bot.loop(); } catch (e) { threw = e; }
    console.log = origLog;
    require(path.join(PROJECT, "src/utils")).marketFlip.tick = originalTick;
    assert(!threw, "0110 AC10: an exception inside marketFlip.tick() does not abort main.loop()");
    assert(capturedLogs.some((l) => l.indexOf("[marketFlip]") === 0), "0110 AC10: guard(\"marketFlip\", ...) logs the caught exception");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot; terminalOps.buy = oldBuy; terminalOps.sellLot = oldSell;
}
// AC3: a pair whose net profit ratio misses minProfitRatio is never logged as an opportunity.
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: true, scanInterval: 1, minProfitRatio: 0.5, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 0,
        getAllOrders: () => [
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 10.5, remainingAmount: 1000, roomName: "W2N3" }, // ratio 0.05, below minProfitRatio 0.5
        ],
    };
    flipHistoryFromBook();
    marketFlip.tick();
    assert(!Memory.marketFlip.lastOpportunities.some((o) => o.resourceType === "O"),
        "0110 AC3: a pair below minProfitRatio is never logged as an opportunity");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot;
}
// AC4: the energy delivery fee is priced off the SAME scan's live order book,
// never market.js's cached fairPrice/energyFairPrice snapshot.
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: true, scanInterval: 1, minProfitRatio: 0.01, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 10, // fixed per leg, so feeUnits = 10 + 10 = 20
        getAllOrders: () => [
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 20, remainingAmount: 1000, roomName: "W2N3" },
            // live top-of-book ask for energy - the ONLY price marketFlip may use for the fee.
            { id: "sell-energy", resourceType: RESOURCE_ENERGY, type: ORDER_SELL, price: 100, remainingAmount: 100000, roomName: "W2N4" },
        ],
    };
    // Deliberately divergent from the live book (100) - proves the snapshot's
    // own energy entry is never consulted for the fee conversion.
    flipHistoryFromBook();
    marketFlip.tick();
    const opportunity = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "O");
    // quantity 1000, gross (20-10)*1000=10000, fee 20 units * live ask 100 = 2000 -> net 8000, ratio 0.8
    assert(opportunity && opportunity.netProfit === 8000,
        "0110 AC4: energy fee uses the live book's ask price, not market.js's cached fairPrice (got " + JSON.stringify(opportunity) + ")");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot;
}
// AC5: a pair whose buy price violates the fairPrice guardrail never
// executes in live mode; test mode still logs it flagged
// wouldBlockGuardrail:true. confidence:"ready" is no longer required
// (removed at the user's request, 2026-09-29) - only the ratio against
// fairPrice matters now.
{
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot, oldBuy = terminalOps.buy;
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    const orders = () => [
        { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
        { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 20, remainingAmount: 1000, roomName: "W2N3" },
    ];
    require(path.join(PROJECT, "src/utils/market")).samples = (rt) => (rt === "O" ? priceSamples(5, 5, 72, 1e9) : []); // bid 20 vs a 7d median of 5: an outlier -> sell leg blocked // 1.05*5=5.25 < buyPrice 10 -> violates
    // test mode: still logged, flagged, not executed
    {
        const marketFlip = marketFlipModule();
        resetMarketFlipState();
        Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: true, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
        Game.market = { credits: 1000000, calcTransactionCost: () => 0, getAllOrders: orders };
        marketFlip.tick();
        const opportunity = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "O");
        assert(opportunity && opportunity.wouldBlockGuardrail === true && opportunity.quantity === 0 && !opportunity.executed,
            "0110 AC5: test mode logs a guardrail-violating pair flagged wouldBlockGuardrail, not executed (got " + JSON.stringify(opportunity) + ")");
        assert(Memory.marketFlip.stats.guardrailBlocked >= 1, "0110 AC5: guardrail block is counted in stats");
    }
    // live mode: never opens the flip
    {
        const marketFlip = marketFlipModule();
        resetMarketFlipState();
        let buyCalls = 0;
        Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
        Game.market = { credits: 1000000, calcTransactionCost: () => 0, getAllOrders: orders };
        terminalOps.buy = () => { buyCalls++; return { ok: true, id: "should-not-happen" }; };
        marketFlip.tick();
        assert(buyCalls === 0 && !Memory.marketFlip.active.O, "0110 AC5: live mode never opens a flip that violates the guardrail");
    }
    // a fairPrice within ratio but with confidence "warming" (or no
    // confidence field at all) no longer blocks - only the ratio matters.
    {
        const marketFlip = marketFlipModule();
        resetMarketFlipState();
        let buyCalls = 0;
        Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
        Game.market = { credits: 1000000, calcTransactionCost: () => 0, getAllOrders: orders };
        flipHistoryFromBook(); // 1.05*100=105 >= buyPrice 10, ratio fine
        terminalOps.buy = () => { buyCalls++; Memory.terminalOps.operations["buy-warm"] = { id: "buy-warm", state: "queued" }; return { ok: true, id: "buy-warm" }; };
        marketFlip.tick();
        assert(buyCalls === 1 && Memory.marketFlip.active.O, "0110 AC5 follow-up: confidence:\"warming\" no longer blocks a pair whose price is within the fairPrice ratio");
    }
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot; terminalOps.buy = oldBuy;
}
// AC6: marketOnly (pixel) and a commodity (widgetA, already mocked into
// COMMODITIES/RESOURCES_ALL near the top of this file) are both evaluated
// by the same scan and accepted when profitable.
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: true, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 0,
        getAllOrders: () => [
            { id: "sell-pixel", resourceType: "pixel", type: ORDER_SELL, price: 100, remainingAmount: 10 },
            { id: "buy-pixel", resourceType: "pixel", type: ORDER_BUY, price: 150, remainingAmount: 10 },
            { id: "sell-widgetA", resourceType: "widgetA", type: ORDER_SELL, price: 500, remainingAmount: 50, roomName: "W2N2" },
            { id: "buy-widgetA", resourceType: "widgetA", type: ORDER_BUY, price: 600, remainingAmount: 50, roomName: "W2N3" },
        ],
    };
    flipHistoryFromBook();
    marketFlip.tick();
    const pixelOpp = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "pixel");
    const widgetOpp = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "widgetA");
    assert(pixelOpp && pixelOpp.quantity > 0 && !pixelOpp.wouldBlockGuardrail, "0110 AC6: a profitable marketOnly (pixel) pair is accepted (got " + JSON.stringify(pixelOpp) + ")");
    assert(widgetOpp && widgetOpp.quantity > 0 && !widgetOpp.wouldBlockGuardrail, "0110 AC6: a profitable commodity (widgetA) pair is accepted (got " + JSON.stringify(widgetOpp) + ")");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot;
}
// AC7: exclusivity - a second profitable pair for the same resourceType is
// ignored while a flip is already active for it.
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot, oldBuy = terminalOps.buy;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    let buyCalls = 0;
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 0,
        getAllOrders: () => [
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 20, remainingAmount: 1000, roomName: "W2N3" },
        ],
    };
    flipHistoryFromBook();
    terminalOps.buy = () => { buyCalls++; Memory.terminalOps.operations["buy-x"] = { id: "buy-x", state: "queued" }; return { ok: true, id: "buy-x" }; };
    marketFlip.tick();
    assert(buyCalls === 1 && Memory.marketFlip.active.O, "0110 AC7 setup: first scan opens the flip");
    Game.time += 1; // elapse scanInterval so the second scan actually runs
    marketFlip.tick();
    const opportunity = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "O");
    assert(buyCalls === 1 && opportunity && opportunity.quantity === 0 && !opportunity.executed,
        "0110 AC7: a second profitable pair for the same resourceType is ignored while a flip is already active");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot; terminalOps.buy = oldBuy;
}
// AC8: two approved opportunities in the same scan size sequentially - the
// second flip's 5% cap is computed against what's LEFT after the first,
// never against the tick's original balance.
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot, oldBuy = terminalOps.buy;
    resetMarketFlipState();
    // Two rooms - AC8 is about credit sequencing across candidates in the
    // same scan, independent of the per-terminal exclusivity (AC14): give
    // each of the two flips its own terminal so room availability is never
    // the limiting factor here.
    Game.rooms = { W1N1: marketFlipRoom("W1N1"), W1N2: marketFlipRoom("W1N2") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    let buyCalls = 0, nextId = 1;
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 0,
        getAllOrders: () => [
            // O: ratio 0.5, ranked first
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 100000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 15, remainingAmount: 100000, roomName: "W2N3" },
            // Z: ratio 0.2, ranked second
            { id: "sell-Z", resourceType: "Z", type: ORDER_SELL, price: 10, remainingAmount: 100000, roomName: "W2N2" },
            { id: "buy-Z", resourceType: "Z", type: ORDER_BUY, price: 12, remainingAmount: 100000, roomName: "W2N3" },
        ],
    };
    flipHistoryFromBook();
    terminalOps.buy = () => { const id = "buy-" + (nextId++); buyCalls++; Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    marketFlip.tick();
    const oppO = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "O");
    const oppZ = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "Z");
    // cap1 = 5% of 900k above the 100k global floor = 4500 units
    // cap2 = 5% of the remaining 855k = 4275 units
    assert(oppO && oppO.quantity === 4500, "0110 AC8: the first (most profitable) flip uses 5% of the tick's original balance (got " + JSON.stringify(oppO) + ")");
    assert(oppZ && oppZ.quantity === 4275, "0110 AC8: the second flip uses 5% of what remained after the first, not the original balance (got " + JSON.stringify(oppZ) + ")");
    assert(buyCalls === 2 && Memory.marketFlip.committedCredits === 4500 * 10 + 4275 * 10, "0110 AC8: both flips open, committedCredits reflects both reservations");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot; terminalOps.buy = oldBuy;
}
// AC9: a flip stuck past maxHoldingTicks is cancelled - releases the
// resourceType's exclusivity and its reserved credits.
{
    const marketFlip = marketFlipModule();
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldCancel = terminalOps.cancel, oldTime = Game.time;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 100000, maxHoldingTicks: 100 } });
    Game.market = { credits: 0, getAllOrders: () => [] };
    Memory.marketFlip.active.O = { resourceType: "O", state: "selling", buyOpId: "buy-1", sellOpId: "sell-1", quantity: 10, buyPrice: 1, sellPrice: 2, reservedCredits: 10, expectedNetProfit: 5, openedTick: Game.time };
    Memory.marketFlip.committedCredits = 10;
    Memory.terminalOps.operations["sell-1"] = { id: "sell-1", state: "queued" }; // never completes
    let cancelledIds = [];
    terminalOps.cancel = (id) => { cancelledIds.push(id); Memory.terminalOps.operations[id].state = "cancelled"; return { ok: true, id }; };
    Game.time += 100;
    marketFlip.tick();
    assert(cancelledIds.indexOf("sell-1") >= 0, "0110 AC9: the stuck flip's active leg (sell-1) is cancelled via terminalOps.cancel()");
    assert(!Memory.marketFlip.active.O, "0110 AC9: the stall-guarded flip is removed, releasing the resourceType's exclusivity");
    assert(Memory.marketFlip.committedCredits === 0 && Memory.marketFlip.stats.cancelled === 1,
        "0110 AC9: the stall guard releases the reserved credits and counts the cancellation");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; terminalOps.cancel = oldCancel; Game.time = oldTime;
}
// AC12: marketFlipStatus()/marketFlipStats() reflect a flip completed with a known profit.
{
    const marketFlip = marketFlipModule();
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 100000, maxHoldingTicks: 1500 } });
    Game.market = { credits: 0, getAllOrders: () => [] };
    Memory.marketFlip.active.O = { resourceType: "O", state: "selling", buyOpId: "buy-1", sellOpId: "sell-1", quantity: 10, buyPrice: 1, sellPrice: 2, reservedCredits: 10, expectedNetProfit: 777, openedTick: Game.time };
    Memory.marketFlip.committedCredits = 10;
    Memory.terminalOps.operations["sell-1"] = { id: "sell-1", state: "completed" };
    marketFlip.tick();
    assert(Memory.marketFlip.stats.completed === 1 && Memory.marketFlip.stats.netProfit === 777,
        "0110 AC12 setup: completing the sell leg credits stats.completed/netProfit (got " + JSON.stringify(Memory.marketFlip.stats) + ")");
    const status = JSON.parse(global.marketFlipStatus());
    assert(status.mode === "live" && status.active.length === 0,
        "0110 AC12: marketFlipStatus() reflects live mode and the now-empty active list (got " + JSON.stringify(status) + ")");
    const stats = JSON.parse(global.marketFlipStats());
    assert(stats.completed === 1 && stats.netProfit === 777,
        "0110 AC12: marketFlipStats() reports the completed flip's accumulated net profit (got " + JSON.stringify(stats) + ")");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings;
}
// createListing (pedido do usuário, 2026-09-29): default false means an
// operation with no covering candidate never creates a public order - it
// just waits/retries instead. true preserves the original 0098 behavior.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldOps = Memory.terminalOps;
    const room = { name: "W7N60", controller: { my: true } };
    Game.rooms = Object.assign({}, oldRooms, { W7N60: room });
    let createCalls = 0;
    Game.market = { credits: 1000000, incomingTransactions: [], orders: {}, getAllOrders: () => [], createOrder: () => { createCalls++; return OK; } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const marketOnly = require(path.join(PROJECT, "src/utils/market"));
    const oldSnapshot = marketOnly.snapshot;
    marketOnly.snapshot = () => ({ resources: { pixel: { buyPrice: 50000, sellPrice: 50000, fairPrice: 50000 } } });
    const noListing = terminalOps.sell("W7N60", "pixel", 50, 49500); // createListing omitted -> defaults false
    terminalOps.tick();
    terminalOps.tick();
    const noListingOp = Memory.terminalOps.operations[noListing.id];
    assert(noListingOp.state === "waiting" && createCalls === 0,
        "0110 createListing default false: no covering candidate never creates a public order, op just waits (got " + JSON.stringify(noListingOp) + ")");
    terminalOps.cancel(noListing.id);
    const withListing = terminalOps.sell("W7N60", "pixel", 50, 49500, true);
    terminalOps.tick();
    terminalOps.tick();
    const withListingOp = Memory.terminalOps.operations[withListing.id];
    assert(withListingOp.state === "listing" && createCalls === 1,
        "0110 createListing:true explicitly restores the original 0098 auto-listing fallback (got " + JSON.stringify(withListingOp) + ")");
    marketOnly.snapshot = oldSnapshot;
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.terminalOps = oldOps;
}
// A partial buy (createListing:false ran out of candidates before dealing
// the full planned quantity) still tries to sell whatever was actually
// bought, sized and priced off the real dealt amount - not the original plan.
{
    const marketFlip = marketFlipModule();
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 100000, maxHoldingTicks: 1500 } });
    Game.market = { credits: 0, getAllOrders: () => [] };
    // Planned 1000 @ buyPrice 10 (reservedCredits 10000), but the buy leg
    // only ever dealt 400 before the book ran dry (dealtAmount 400).
    Memory.marketFlip.active.O = { resourceType: "O", room: "W1N1", state: "buying", buyOpId: "buy-1", sellOpId: null, quantity: 1000, buyPrice: 10, sellPrice: 20, reservedCredits: 10000, expectedNetProfit: 5000, openedTick: Game.time };
    Memory.marketFlip.committedCredits = 10000;
    Memory.terminalOps.operations["buy-1"] = { id: "buy-1", state: "completed", dealtAmount: 400 };
    let sellArgs = null;
    const oldSell = terminalOps.sellLot;
    terminalOps.sellLot = (room, resourceType, qty, price, createListing) => { sellArgs = { room, resourceType, qty, price, createListing }; Memory.terminalOps.operations["sell-1"] = { id: "sell-1", state: "queued" }; return { ok: true, id: "sell-1" }; };
    marketFlip.tick();
    terminalOps.sellLot = oldSell;
    assert(sellArgs && sellArgs.room === "W1N1" && sellArgs.qty === 400 && sellArgs.createListing === false,
        "0110: a partial buy sells exactly what was actually dealt (400) from the SAME room that bought it, not the original plan (1000) or a re-picked room (got " + JSON.stringify(sellArgs) + ")");
    const entry = Memory.marketFlip.active.O;
    assert(entry.quantity === 400 && entry.reservedCredits === 4000 && entry.expectedNetProfit === 2000,
        "0110: the flip's own bookkeeping (quantity/reservedCredits/expectedNetProfit) is rescaled down to the actual dealt ratio (got " + JSON.stringify(entry) + ")");
    assert(Memory.marketFlip.committedCredits === 4000,
        "0110: the unused portion of the credit reservation (6000 of the original 10000) is released immediately, not held until the flip fully completes (got " + Memory.marketFlip.committedCredits + ")");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings;
}
// A buy that never dealt anything at all (dealtAmount 0) has nothing to
// sell - the flip is simply released, not left dangling.
{
    const marketFlip = marketFlipModule();
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 100000, maxHoldingTicks: 1500 } });
    Game.market = { credits: 0, getAllOrders: () => [] };
    Memory.marketFlip.active.O = { resourceType: "O", room: "W1N1", state: "buying", buyOpId: "buy-1", sellOpId: null, quantity: 1000, buyPrice: 10, sellPrice: 20, reservedCredits: 10000, expectedNetProfit: 5000, openedTick: Game.time };
    Memory.marketFlip.committedCredits = 10000;
    Memory.terminalOps.operations["buy-1"] = { id: "buy-1", state: "completed", dealtAmount: 0 };
    marketFlip.tick();
    assert(!Memory.marketFlip.active.O && Memory.marketFlip.committedCredits === 0 && Memory.marketFlip.stats.cancelled === 1,
        "0110: a buy that dealt nothing releases the flip instead of trying to sell zero units");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings;
}
// AC14: per-terminal exclusivity (pedido do usuário, 2026-09-30) - two
// different rooms/terminals can run two different resourceType flips in
// parallel, but a single room never runs two at once.
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot, oldBuy = terminalOps.buy;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1"), W1N2: marketFlipRoom("W1N2") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    const buyRooms = [];
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 0,
        getAllOrders: () => [
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 20, remainingAmount: 1000, roomName: "W2N3" },
            { id: "sell-Z", resourceType: "Z", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-Z", resourceType: "Z", type: ORDER_BUY, price: 15, remainingAmount: 1000, roomName: "W2N3" },
        ],
    };
    flipHistoryFromBook();
    terminalOps.buy = (room) => { buyRooms.push(room); const id = "buy-" + buyRooms.length; Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    marketFlip.tick();
    assert(buyRooms.length === 2 && buyRooms[0] !== buyRooms[1],
        "0110 AC14: two different resourceTypes flip in parallel, each on its own terminal (got " + JSON.stringify(buyRooms) + ")");
    assert(Memory.marketFlip.active.O.room && Memory.marketFlip.active.Z.room && Memory.marketFlip.active.O.room !== Memory.marketFlip.active.Z.room,
        "0110 AC14: each active flip records which room/terminal it's using, and they differ");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot; terminalOps.buy = oldBuy;
}
// AC14: with only ONE eligible terminal, a second profitable (different
// resourceType) opportunity in the same scan is skipped - not executed -
// even though it passes every other check, because its only terminal is
// already busy with the first flip.
{
    const marketFlip = marketFlipModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSnapshot = market.snapshot, oldBuy = terminalOps.buy;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") }; // only one terminal available
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 1, minProfitRatio: 0.01, guardrailFairPriceRatio: 1.05, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
    let buyCalls = 0;
    Game.market = {
        credits: 1000000, calcTransactionCost: () => 0,
        getAllOrders: () => [
            { id: "sell-O", resourceType: "O", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-O", resourceType: "O", type: ORDER_BUY, price: 20, remainingAmount: 1000, roomName: "W2N3" },
            { id: "sell-Z", resourceType: "Z", type: ORDER_SELL, price: 10, remainingAmount: 1000, roomName: "W2N2" },
            { id: "buy-Z", resourceType: "Z", type: ORDER_BUY, price: 15, remainingAmount: 1000, roomName: "W2N3" },
        ],
    };
    flipHistoryFromBook();
    terminalOps.buy = () => { buyCalls++; const id = "buy-" + buyCalls; Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    marketFlip.tick();
    const oppO = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "O");
    const oppZ = Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "Z");
    assert(buyCalls === 1 && Memory.marketFlip.active.O && !Memory.marketFlip.active.Z,
        "0110 AC14: only the higher-ranked opportunity opens when there's just one terminal available");
    assert(oppO && oppO.executed && oppZ && !oppZ.executed && oppZ.quantity > 0,
        "0110 AC14: the second opportunity is sized fine (passes credit/profit filters, quantity > 0) but not executed - blocked purely by terminal availability (got " + JSON.stringify(oppZ) + ")");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.snapshot = oldSnapshot; terminalOps.buy = oldBuy;
}
// AC15 (pedido do usuário, 2026-09-30): a buy leg that never deals anything
// at all gives up after maxBuyWaitTicks (much sooner than maxHoldingTicks) -
// a flip is meant to be instant, not a resting order. A buy that DID deal
// something (dealtAmount > 0) keeps the normal, longer budget instead.
{
    const marketFlip = marketFlipModule();
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldCancel = terminalOps.cancel, oldTime = Game.time;
    resetMarketFlipState();
    Game.rooms = { W1N1: marketFlipRoom("W1N1") };
    Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: false, scanInterval: 100000, maxHoldingTicks: 1500, maxBuyWaitTicks: 15 } });
    Game.market = { credits: 0, getAllOrders: () => [] };
    Memory.marketFlip.active.O = { resourceType: "O", room: "W1N1", state: "buying", buyOpId: "buy-1", sellOpId: null, quantity: 1000, buyPrice: 10, sellPrice: 20, reservedCredits: 10000, expectedNetProfit: 5000, openedTick: Game.time };
    Memory.marketFlip.committedCredits = 10000;
    Memory.terminalOps.operations["buy-1"] = { id: "buy-1", state: "waiting" }; // no candidate yet, dealtAmount 0
    let cancelledIds = [];
    terminalOps.cancel = (id) => { cancelledIds.push(id); Memory.terminalOps.operations[id].state = "cancelled"; return { ok: true, id }; };
    Game.time += 10;
    marketFlip.tick();
    assert(cancelledIds.length === 0 && Memory.marketFlip.active.O,
        "0110 AC15: a buy that dealt nothing is NOT yet cancelled before maxBuyWaitTicks elapses (10 < 15)");
    Game.time += 6; // total elapsed 16 >= maxBuyWaitTicks 15
    marketFlip.tick();
    assert(cancelledIds.indexOf("buy-1") >= 0 && !Memory.marketFlip.active.O && Memory.marketFlip.stats.cancelled === 1,
        "0110 AC15: a buy that dealt nothing is cancelled once maxBuyWaitTicks elapses, well before maxHoldingTicks (got " + JSON.stringify(cancelledIds) + ")");
    // Now the same timing, but the buy DID deal something - must NOT be
    // cancelled by maxBuyWaitTicks, only by the normal maxHoldingTicks budget.
    resetMarketFlipState();
    Memory.marketFlip.active.O = { resourceType: "O", room: "W1N1", state: "buying", buyOpId: "buy-2", sellOpId: null, quantity: 1000, buyPrice: 10, sellPrice: 20, reservedCredits: 10000, expectedNetProfit: 5000, openedTick: Game.time - 16 };
    Memory.marketFlip.committedCredits = 10000;
    Memory.terminalOps.operations["buy-2"] = { id: "buy-2", state: "waiting", dealtAmount: 100 }; // partial progress
    cancelledIds = [];
    marketFlip.tick();
    assert(cancelledIds.length === 0 && Memory.marketFlip.active.O,
        "0110 AC15: a buy that already dealt something (dealtAmount > 0) is not cut short by maxBuyWaitTicks, even past 15 ticks");
    terminalOps.cancel = oldCancel;
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; Game.time = oldTime;
}
require(path.join(PROJECT, "src/utils/market")).samples = realFlipMarketSamples;
// BUY/SELL of different resources coexist in one room; the same resource still conflicts.
{
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const makeStore = (energy, capacity) => ({ [RESOURCE_ENERGY]: energy, getFreeCapacity: () => capacity - energy, getUsedCapacity: () => energy, getCapacity: () => capacity });
    const room = { name: "W7N58", controller: { my: true }, find: () => [], storage: { id: "W7N58-storage", store: Object.assign(makeStore(50000, 1000000), { Z: 5000, O: 5000 }) }, terminal: { id: "W7N58-terminal", cooldown: 0, store: makeStore(0, 300000), send: () => OK } };
    const oldRooms = Game.rooms, oldOps = Memory.terminalOps;
    Game.rooms = Object.assign({}, oldRooms, { W7N58: room });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const base = { sourceRoom: "W7N58", targetRoom: null, amount: 100, remaining: 100, loadedAmount: 0, sentAmount: 0, receivedAmount: 0, createdTick: Game.time, updatedTick: Game.time };
    Memory.terminalOps.operations["t-buy-power"] = Object.assign({}, base, { id: "t-buy-power", kind: "buy", resourceType: "power", state: "atTerminal" });
    Memory.terminalOps.operations["t-sell-o"] = Object.assign({}, base, { id: "t-sell-o", kind: "sell", resourceType: "O", state: "listed" });
    assert(!terminalOps.lockConflict("buy", "W7N58", null, "Z"), "a standing BUY of power and SELL of O do not block a BUY of Z in the same room");
    assert(terminalOps.lockConflict("buy", "W7N58", null, "O"), "the same resource (O) is still locked by its own SELL");
    Game.rooms = oldRooms; Memory.terminalOps = oldOps;
}

// --- ROADMAP 0111: marketPricing (conservative prices, margin, liquidity) ---
function pricingModule() {
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/marketPricing"))];
    return require(path.join(PROJECT, "src/utils/marketPricing"));
}
function craftTestMarket(quotes, credits) {
    return { credits, calcTransactionCost: () => 0,
        getAllOrders: () => Object.keys(quotes).map((rt) => ({ id: "fixture-" + rt, type: ORDER_SELL, resourceType: rt,
            price: quotes[rt][1], amount: 1e9, roomName: "QuoteRoom" })) };
}
function priceSamples(bid, ask, n, vol) {
    const rows = [];
    for (let i = 0; i < (n === undefined ? 72 : n); i++) {
        rows.push({ tick: i * 3600, buyPrice: bid, buyVolume: vol === undefined ? 1000 : vol, sellPrice: ask, sellVolume: vol === undefined ? 1000 : vol });
    }
    return rows;
}
{
    const pricing = pricingModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldSamples = market.samples, oldSettings = Memory.settings;
    Memory.settings = Object.assign({}, oldSettings);
    let book = { Z: priceSamples(100, 110), energy: priceSamples(1, 1.1), widgetA: priceSamples(5000, 5400) };
    market.samples = (rt) => book[rt] || [];
    assert(Math.abs(pricing.zFromConfidence(0.95) - 1.645) < 0.01, "0111 AC11: confidence 0.95 maps to z ~ 1.645 (got " + pricing.zFromConfidence(0.95) + ")");
    // AC1: double conservative - only the worse of (7d median, instant) counts
    assert(pricing.conservativeBid("Z", 90) === 90 && pricing.conservativeBid("Z", 120) === 100,
        "0111 AC1: revenue = min(7d median bid, instant bid)");
    assert(pricing.conservativeAsk("Z", 105) === 110 && pricing.conservativeAsk("Z", 130) === 130,
        "0111 AC1: cost = max(7d median ask, instant ask)");
    // AC2/AC11: margin = floor + z*sigma*sqrt(T/3600)
    const m0 = pricing.requiredMargin(0.05, 0), m1 = pricing.requiredMargin(0.05, 3600), m2 = pricing.requiredMargin(0.10, 3600);
    assert(Math.abs(m0 - 0.01) < 1e-9 && m1 > m0 && m2 > m1 && Math.abs(m1 - (0.01 + 1.645 * 0.05)) < 0.001,
        "0111 AC2/AC11: margin = floor + zConf*sigma*sqrt(T/3600), grows with T and sigma (got " + [m0, m1, m2] + ")");
    // AC3: each liquidity guardrail blocks the sell leg with its own reason
    assert(pricing.liquidity("Z", 100, "sell").ok, "0111 AC3: a liquid book passes");
    book.W = priceSamples(100, 110, 10);
    assert(pricing.liquidity("W", 100, "sell").reason === "warming", "0111 AC3: < minSamples blocks (warming)");
    book.W = priceSamples(100, 110).map((r, i) => (i % 3 ? r : Object.assign({}, r, { buyPrice: null })));
    assert(pricing.liquidity("W", 100, "sell").reason === "presence", "0111 AC3: presence < 90% blocks");
    book.W = priceSamples(100, 110, 72, 150);
    assert(pricing.liquidity("W", 100, "sell").reason === "depth", "0111 AC3: bid depth < 2x lot blocks");
    book.W = priceSamples(100, 250);
    assert(pricing.liquidity("W", 100, "sell").reason === "spread", "0111 AC3: sell-side spread above the default 2.0 blocks");
    book.W = priceSamples(100, 150);
    assert(pricing.liquidity("W", 100, "sell").ok, "0111 AC3: a 1.5 spread passes on the sell side (default cap is now 2.0, was 1.30)");
    book.W = priceSamples(100, 110).map((r, i) => Object.assign({}, r, { buyPrice: i % 2 ? 60 : 140 }));
    assert(pricing.liquidity("W", 100, "sell").reason === "volatility", "0111 AC3: sell-side sigma above the default 30% blocks");
    // AC3: a cheap ask is never blocked, an expensive one still is
    book.Q = priceSamples(100, 110, 10);
    assert(pricing.buyLeg("Q", 100, 100).ok && pricing.buyLeg("Q", 100, 100).cheap, "0111 AC3: ask at/below the 7d median passes with no guardrail even when the book is illiquid");
    assert(!pricing.buyLeg("Q", 130, 100).ok, "0111 AC3: an expensive ask still has to clear the liquidity checks");
    // chain verdict on the COMMODITIES mock: widgetA = 20 Z + 20 energy
    const ctx = { instant: (rt) => ({ bid: book[rt] && book[rt][0].buyPrice, ask: book[rt] && book[rt][0].sellPrice }), stock: () => 0 };
    const ok = pricing.evaluate("widgetA", 10, ctx);
    assert(ok.ok && Math.abs(ok.cost - 10 * (20 * 110 + 20 * 1.1)) < 1e-6 && ok.plan.steps.length === 1 && ok.plan.buys.Z === 200,
        "0111: evaluate() prices a one-level chain with conservative asks (got " + JSON.stringify({ ok: ok.ok, reason: ok.reason, cost: ok.cost }) + ")");
    book.widgetA = priceSamples(2100, 2300);
    assert(pricing.evaluate("widgetA", 10, ctx).reason === "margin", "0111: a chain whose revenue does not clear the margin is rejected");
    book.widgetA = priceSamples(5000, 5400);
    assert(pricing.evaluate("widgetA", 10, Object.assign({}, ctx, { canMake: () => false })).reason === "no-plan",
        "0111 AC4: no viable way to make the product (canMake false) yields no plan");
    // own stock is valued at the conservative bid (opportunity cost), not free
    const own = pricing.planNode("Z", 200, Object.assign({}, ctx, { stock: (rt) => (rt === "Z" ? 500 : 0) }), 0, {}, false);
    assert(own.source === "own" && own.total === 200 * 100, "0111 AC1: own input is costed at the conservative bid (opportunity cost)");
    // AC12: sell-or-process on a held material
    const heldCtx = Object.assign({}, ctx, { canMake: () => true });
    assert(pricing.sellOrProcess("Z", 200, heldCtx).action === "process" && pricing.sellOrProcess("Z", 200, heldCtx).product === "widgetA",
        "0111 AC12: material is processed when the recipe beats selling it as-is");
    book.widgetA = priceSamples(2000, 2300);
    assert(pricing.sellOrProcess("Z", 200, heldCtx).action === "sell", "0111 AC12: material is sold as-is when no recipe beats the direct sale");
    book.widgetA = priceSamples(5000, 5400);
    assert(pricing.recipeOf("OH").kind === "lab" && pricing.recipeOf("OH").components.H === 5 && pricing.recipeOf("widgetA").kind === "factory",
        "0111: recipeOf unifies REACTIONS (lab) and COMMODITIES (factory)");
    market.samples = oldSamples; Memory.settings = oldSettings; pricing.resetCaches();
}

// --- ROADMAP 0111: labSlots (fixed tree layout + phase planner) -------------
{
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    // AC8: the architect's lab stamp builds slots in table order: 3 / 6 / 10 labs at RCL 6 / 7 / 8
    const src = fs.readFileSync(path.join(PROJECT, "src/rooms/architect.js"), "utf8");
    const labCase = src.slice(src.indexOf("Plan the Lab Stamp"));
    const grid = (key) => {
        const from = labCase.indexOf(key + ": [");
        const body = labCase.slice(from, labCase.indexOf("]", from));
        return body.split('"').filter((_, k) => k % 2 === 1);
    };
    const structures = grid("structures"), rcl = grid("rcl");
    let tableMatches = true;
    const rclBySlot = {};
    labSlots.SLOT_NUMBERS.forEach((slot) => {
        const [r, c] = labSlots.OFFSETS[slot];
        if (structures[r][c] !== "L") tableMatches = false;
        rclBySlot[slot] = Number(rcl[r][c]);
    });
    const labCount = structures.join("").split("").filter((ch) => ch === "L").length;
    const builtAt = (level) => labSlots.SLOT_NUMBERS.filter((s) => rclBySlot[s] <= level);
    assert(tableMatches && labCount === 10, "0111 AC8: every slot offset sits on an 'L' of the stamp and the stamp has exactly 10 labs");
    assert(builtAt(6).join() === "1,2,3" && builtAt(7).join() === "1,2,3,4,5,6" && builtAt(8).length === 10,
        "0111 AC8: the reordered rcl grid builds slots 1-3 at RCL6, 4-6 at RCL7 and 7-10 at RCL8 (got " + JSON.stringify(rclBySlot) + ")");
    assert(labSlots.SLOT_NUMBERS.filter((s) => s > 2).every((s) => labSlots.reaches(s, 1, 2)),
        "0111 AC8: slots 1 and 2 reach every other lab (range <= 2) - wide mode");
    assert(labSlots.wideOutputs(builtAt(8)).length === 8 && labSlots.wideOutputs([3, 4, 5]).length === 0,
        "0111 AC8: wide mode feeds the other 8 labs, and needs both centre labs");
    // AC10: phase plan per RCL band - fewest moves wins, every reaction reaches both inputs
    const lh = { product: "LH", inputs: ["L", "H"] }, oh = { product: "OH", inputs: ["O", "H"] };
    const lh2o = { product: "LH2O", inputs: [lh, oh] };
    const xlh2o = { product: "XLH2O", inputs: [lh2o, "X"] };
    const reachOk = (plan) => plan.phases.every((p) => labSlots.reaches(p.out, p.inputs[0], p.inputs[1]));
    const p8 = labSlots.planPhases(lh2o, builtAt(8)), p7 = labSlots.planPhases(lh2o, builtAt(7)), p6 = labSlots.planPhases(lh2o, builtAt(6));
    assert(p8.ok && p8.mode === "tree" && p8.moves === 0, "0111 AC10: a 2-level reaction on 10 labs is the untouched tree (got " + JSON.stringify({ m: p8.mode, n: p8.moves }) + ")");
    assert(p7.ok && p7.mode === "reuse" && p7.moves === 1, "0111 AC10: on 6 labs it reuses a drained lab in place (got " + JSON.stringify({ m: p7.mode, n: p7.moves }) + ")");
    assert(p6.ok && p6.mode === "park" && p6.moves > p7.moves, "0111 AC10: on 3 labs it parks the intermediate in storage and costs more moves (got " + JSON.stringify({ m: p6.mode, n: p6.moves }) + ")");
    assert(reachOk(p8) && reachOk(p7) && reachOk(p6), "0111 AC10: every phase's output lab reaches both of its input labs");
    const x7 = labSlots.planPhases(xlh2o, builtAt(7)), x8 = labSlots.planPhases(xlh2o, builtAt(8));
    assert(x8.ok && x8.moves === 0 && x7.ok && x7.moves > 0 && reachOk(x7) && reachOk(x8), "0111 AC10: a 3-level reaction is a tree on 10 labs and still feasible on 6 with remanejamento");
    assert(labSlots.planPhases(lh2o, [1, 2]).reason === "too-few-labs", "0111 AC9: fewer than 3 labs yields no plan, with a reason");
    assert(labSlots.planPhases({ product: "OH", inputs: ["O", "H"] }, [4, 5, 6]).ok, "0111 AC9: any 3 built labs in reach can still run one reaction (e.g. after a central lab is lost)");
    const sparse = labSlots.planPhases(lh2o, [1, 2, 8, 9]);
    assert(typeof sparse.ok === "boolean" && (sparse.ok || sparse.reason === "no-phase-plan"), "0111 AC9: a sparse slot set yields a verdict with a reason, never a throw (got " + JSON.stringify({ ok: sparse.ok, reason: sparse.reason }) + ")");
    // 0115: independent steps (same tree height) run in waves, on labs of their own
    const freshX = () => {
        const a = { product: "LH", inputs: ["L", "H"] }, b = { product: "OH", inputs: ["O", "H"] };
        return { product: "XLH2O", inputs: [{ product: "LH2O", inputs: [a, b] }, "X"] };
    };
    const w10 = labSlots.planPhases(freshX(), builtAt(8));
    const waveOf = (plan, product) => plan.phases.find((p) => p.product === product).wave;
    assert(w10.ok && w10.parallel === true && w10.moves === 0 && waveOf(w10, "OH") === waveOf(w10, "LH") &&
        waveOf(w10, "LH2O") > waveOf(w10, "OH") && waveOf(w10, "XLH2O") > waveOf(w10, "LH2O"),
        "0115: on 10 labs OH and LH share a wave, LH2O and XLH2O follow (got " + JSON.stringify(w10.phases.map((p) => p.product + "@" + p.wave)) + ")");
    const sameWave = w10.phases.filter((p) => p.wave === waveOf(w10, "OH"));
    const slotsOfWave = [].concat.apply([], sameWave.map((p) => p.inputs.concat(p.out)));
    assert(sameWave.length === 2 && new Set(slotsOfWave).size === slotsOfWave.length,
        "0115: inside a wave no slot (input or output) is shared between reactions (got " + slotsOfWave.join() + ")");
    assert(reachOk(w10), "0115: every wave phase's output lab still reaches both of its input labs");
    const finalPhase = w10.phases[w10.phases.length - 1];
    assert(finalPhase.inputs.slice().sort().join() === "1,2" && labSlots.finalOutputs(builtAt(8), finalPhase.inputs, finalPhase.out).length === 8,
        "0115: the final reaction takes the centre labs as inputs, so it can run on 8 output labs (inputs " + finalPhase.inputs.join() + ")");
    const w6 = labSlots.planPhases(freshX(), builtAt(7));
    assert(w6.ok && reachOk(w6), "0115: on 6 labs the wave plan is still feasible (moves " + w6.moves + ")");
    const w3 = labSlots.planPhases(freshX(), builtAt(6));
    assert(w3.ok && w3.parallel === false && new Set(w3.phases.map((p) => p.wave)).size === w3.phases.length,
        "0115: on 3 labs the plan falls back to sequential, one phase per wave (got " + JSON.stringify(w3.phases.map((p) => p.wave)) + ")");
    const seqOnly = labSlots.planPhases(freshX(), builtAt(8), { parallel: false });
    assert(seqOnly.parallel === false && new Set(seqOnly.phases.map((p) => p.wave)).size === 4, "0115: options.parallel = false gives the sequential plan");
    const savedParSettings = Memory.settings;
    Memory.settings = Object.assign({}, savedParSettings, { craft: { parallelLabs: false } });
    assert(labSlots.planPhases(freshX(), builtAt(8)).parallel === false, "0115: craft.parallelLabs = false gives the sequential plan");
    Memory.settings = savedParSettings;
    const chainTree = { product: "LH2O", inputs: [{ product: "LH", inputs: ["L", "H"] }, "O"] };
    assert(new Set(labSlots.planPhases(chainTree, builtAt(8)).phases.map((p) => p.wave)).size === 2, "0115: a plain chain (no independent steps) is unchanged: one phase per wave");
    // 0116: every step wide (centre pair as inputs, one step after the other) vs waves of one lab each
    {
        const work = { LH: { batches: 600, cooldown: 15 }, OH: { batches: 600, cooldown: 20 }, LH2O: { batches: 600, cooldown: 10 }, XLH2O: { batches: 600, cooldown: 60 } };
        const noWork = labSlots.planPhases(freshX(), builtAt(8));
        assert(noWork.ok && noWork.strategy === undefined && noWork.T === undefined, "0116: without options.work the plan is the in-place one, as before");
        const auto10 = labSlots.planPhases(freshX(), builtAt(8), { work });
        const waves10 = labSlots.planPhases(freshX(), builtAt(8), { work, strategy: "waves" });
        const wide10 = labSlots.planPhases(freshX(), builtAt(8), { work, strategy: "wide" });
        assert(waves10.strategy === "waves" && waves10.T === 22500, "0116: XLH2O in waves of one lab each is ~22500 ticks (got " + waves10.T + ")");
        assert(wide10.strategy === "wide" && wide10.T === 7875, "0116: XLH2O with every step on 8 labs is ~7875 ticks (got " + wide10.T + ")");
        assert(auto10.strategy === "wide" && auto10.T === wide10.T, "0116: auto takes the clearly faster wide strategy on 10 labs");
        assert(wide10.phases.every((p, n) => p.inputs.join() === "1,2" && p.wave === n && p.ops.length === 0 && labSlots.reaches(p.out, 1, 2)) &&
            wide10.phases.map((p) => p.product).join() === "LH,OH,LH2O,XLH2O",
            "0116: the wide plan puts the centre pair on every step, one wave per step, children first");
        assert(labSlots.finalOutputs(builtAt(8), [1, 2], wide10.phases[0].out).length === 8, "0116: each wide step has 8 output labs on 10 labs");
        const auto6 = labSlots.planPhases(freshX(), builtAt(7), { work });
        assert(auto6.strategy === "wide" && auto6.T < labSlots.planPhases(freshX(), builtAt(7), { work, strategy: "waves" }).T, "0116: on 6 labs the wide strategy (4 outputs) is still faster than waves");
        const auto3 = labSlots.planPhases(freshX(), builtAt(6), { work });
        assert(auto3.strategy === "waves" && auto3.T === 63000, "0116: on 3 labs both take the same time, so the in-place plan stays (got " + auto3.strategy + " " + auto3.T + ")");
        assert(labSlots.planPhases(freshX(), [3, 4, 5, 6, 7, 8, 9, 10], { work, strategy: "wide" }).strategy !== "wide", "0116: the wide plan needs both centre labs built");
        const savedWide = Memory.settings;
        Memory.settings = Object.assign({}, savedWide, { craft: { labStrategy: "waves" } });
        assert(labSlots.planPhases(freshX(), builtAt(8), { work }).strategy === "waves", "0116: craft.labStrategy = waves forces the waves plan");
        Memory.settings = Object.assign({}, savedWide, { craft: { labStrategy: "wide" } });
        assert(labSlots.planPhases(freshX(), builtAt(8), { work }).strategy === "wide", "0116: craft.labStrategy = wide forces the wide plan");
        Memory.settings = Object.assign({}, savedWide, { craft: { wideLabs: false } });
        assert(labSlots.planPhases(freshX(), builtAt(8), { work }).strategy === "waves", "0116: craft.wideLabs = false rules the wide strategy out");
        Memory.settings = Object.assign({}, savedWide, { craft: { wideMinGain: 0.9 } });
        assert(labSlots.planPhases(freshX(), builtAt(8), { work }).strategy === "waves", "0116: craft.wideMinGain keeps the wide plan out when it is not faster by enough");
        Memory.settings = savedWide;
        const single = { product: "LH", inputs: ["L", "H"] };
        assert(labSlots.planPhases(single, builtAt(8), { work }).strategy === "waves", "0116: a one-step chain has nothing to gain from the wide strategy");
    }
    // resolve(): the stamp origin is recovered from the built labs
    const mk = (slot, ox, oy) => ({ id: "lab" + slot, pos: { x: ox + labSlots.OFFSETS[slot][1], y: oy + labSlots.OFFSETS[slot][0] } });
    labSlots.resetCache();
    const room = { name: "LabSlotsRoom" };
    const resolved = labSlots.resolve(room, [mk(1, 10, 20), mk(2, 10, 20), mk(3, 10, 20)]);
    assert(resolved && resolved.ids[1] === "lab1" && resolved.ids[3] === "lab3" && resolved.origin.x === 10 && resolved.origin.y === 20,
        "0111: resolve() recovers the stamp origin from the built labs (got " + JSON.stringify(resolved) + ")");
    assert(labSlots.resolve({ name: "Bad" }, [{ id: "a", pos: { x: 1, y: 1 } }, { id: "b", pos: { x: 30, y: 30 } }]) === null,
        "0111 AC9: labs that do not follow the stamp resolve to null (room is discarded with a reason)");
    labSlots.resetCache();
}

// --- ROADMAP 0111: transitory lab/factory - what to keep, what to drain ------
{
    const ts = require(path.join(PROJECT, "src/utils/transientStock"));
    const mk = (id, type, resources, free) => Object.assign(new OwnedStructure(), {
        id, structureType: type, my: true, pos: new RoomPosition(20, 20, "DrainRoom"),
        room: { name: "DrainRoom" }, store: mineralStore(resources, free === undefined ? 1000 : free),
    });
    const types = (structure) => ts.excess(structure).map((e) => e.resourceType).sort().join();
    const savedRooms = Memory.rooms, savedSettings = Memory.settings;
    Memory.rooms = Object.assign({}, savedRooms, { DrainRoom: {} });
    Memory.settings = Object.assign({}, savedSettings);
    // AC6: no chain - everything standing in lab/factory goes back to storage (legacy energy included)
    assert(types(mk("l1", STRUCTURE_LAB, { energy: 500, H: 100 })) === "H,energy", "0111 AC6: an idle lab drains its legacy energy and any mineral");
    assert(types(mk("f1", STRUCTURE_FACTORY, { energy: 50000, Z: 10 })) === "Z,energy", "0111 AC6: a factory with no active product drains energy and minerals");
    assert(ts.energyNeed(mk("f1", STRUCTURE_FACTORY, { energy: 0 }, 50000)) === 0 && ts.energyNeed(mk("l1", STRUCTURE_LAB, {}, 2000)) === 0,
        "0111 AC6: energy need is zero without an active chain (never 'fill to capacity')");
    // AC6: active pinned product - keep exactly the batch's energy and its components
    Memory.rooms.DrainRoom.factoryProduct = "widgetA"; // Z:20 + energy:20
    assert(ts.energyNeed(mk("f2", STRUCTURE_FACTORY, { energy: 5 }, 50000)) === 15, "0111 AC6: factory energy target = recipe energy (need = target - held)");
    assert(types(mk("f2", STRUCTURE_FACTORY, { energy: 20, Z: 20 })) === "", "0111 AC6: the active product's energy and components are kept");
    assert(types(mk("f2", STRUCTURE_FACTORY, { energy: 5000, O: 5 })) === "O,energy", "0111 AC6: energy far above the batch target and unrelated minerals drain");
    Memory.rooms.DrainRoom.factoryEnergy = 400; // a craft chain with pending batches
    assert(ts.energyNeed(mk("f3", STRUCTURE_FACTORY, { energy: 100 }, 50000)) === 300, "0111 AC6: a craft chain raises the factory target to its pending batches' energy");
    delete Memory.rooms.DrainRoom.factoryEnergy;
    // AC6: a manual lab reaction keeps its reagents/product, drains everything else
    Memory.rooms.DrainRoom.labReaction = { a: "H", b: "O", product: "OH", output: "lo", input1: "li1", input2: "li2" };
    assert(types(mk("li1", STRUCTURE_LAB, { H: 100 })) === "" && types(mk("li2", STRUCTURE_LAB, { O: 100 })) === "" && types(mk("lo", STRUCTURE_LAB, { OH: 100 })) === "",
        "0111 AC6: an active reaction keeps reagents in the input labs and the product in the output lab");
    assert(types(mk("lo", STRUCTURE_LAB, { H: 100 })) === "H" && types(mk("lx", STRUCTURE_LAB, { OH: 100 })) === "OH",
        "0111 AC7: residue in the wrong lab (or a lab outside the reaction) is drained");
    delete Memory.rooms.DrainRoom.labReaction;
    Memory.settings = Object.assign({}, savedSettings, { craft: { drainIdleLabs: false } });
    assert(types(mk("l1", STRUCTURE_LAB, { energy: 500, G: 100 })) === "energy", "0111: craft.drainIdleLabs=false keeps minerals in idle labs (manual boost prep) but still drains energy");
    Memory.settings = Object.assign({}, savedSettings, { craft: { labEnergyTarget: 1000 } });
    assert(ts.energyNeed(mk("l1", STRUCTURE_LAB, { energy: 200 }, 1800)) === 800 && types(mk("l1", STRUCTURE_LAB, { energy: 200 })) === "",
        "0111: craft.labEnergyTarget opts labs into a standing energy target (boost setups)");
    Memory.settings = Object.assign({}, savedSettings);
    // AC7: the hauler's cascade turns the excess into a drain job to storage, after real work
    const drainLab = mk("dl1", STRUCTURE_LAB, { energy: 750 }, 1250);
    const drainStorage = { store: mineralStore({}, 100000) };
    const drainRoom = { name: "DrainRoom", storage: drainStorage, terminal: null, find: (type) => (type === FIND_MY_STRUCTURES ? [drainLab] : []) };
    Game.time++;
    const drainJob = hauler.pickMineralJob(drainRoom);
    assert(drainJob && drainJob.kind === "transientDrain" && drainJob.resourceType === "energy" && drainJob.from === drainLab && drainJob.to === drainStorage,
        "0111 AC7: pickMineralJob() hands the legacy energy sitting in a lab back to storage (got " + JSON.stringify(drainJob && drainJob.kind) + ")");
    drainLab.store = mineralStore({}, 2000);
    Game.time++;
    assert(hauler.pickMineralJob(drainRoom) === null, "0111 AC7: nothing left to drain - the cascade returns no job");
    Memory.rooms = savedRooms; Memory.settings = savedSettings;
}

// --- ROADMAP 0111: flip uses marketPricing (cheap buy free, sell leg guarded) ---
{
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldSettings = Memory.settings, oldSamples = market.samples, oldBuy = terminalOps.buy;
    // rows: bid/ask price + volume per side, 72 hourly samples (alternating prices model volatility)
    const rows = (bid, ask, bidVol, askVol, bidAlt) => Array.from({ length: 72 }, (_, i) => ({
        tick: i * 3600, buyPrice: bidAlt && i % 2 ? bid + bidAlt : bid - (bidAlt || 0), buyVolume: bidVol, sellPrice: ask, sellVolume: askVol,
    }));
    function opportunityFor(history, askPrice, bidPrice, minProfitRatio) {
        const marketFlip = marketFlipModule();
        resetMarketFlipState();
        Game.rooms = { W1N1: marketFlipRoom("W1N1") };
        Memory.settings = Object.assign({}, oldSettings, { marketFlip: { test: true, scanInterval: 1, minProfitRatio: minProfitRatio || 0.01, maxCreditRatioPerFlip: 0.05, maxHoldingTicks: 1500 } });
        Game.market = {
            credits: 1000000, calcTransactionCost: () => 0,
            getAllOrders: () => [
                { id: "a", resourceType: "O", type: ORDER_SELL, price: askPrice, remainingAmount: 1000, roomName: "W2N2" },
                { id: "b", resourceType: "O", type: ORDER_BUY, price: bidPrice, remainingAmount: 1000, roomName: "W2N3" },
            ],
        };
        market.samples = (rt) => (rt === "O" ? history : []);
        marketFlip.tick();
        return Memory.marketFlip.lastOpportunities.find((o) => o.resourceType === "O");
    }
    // AC3: buying at/below the 7d median ask is never guarded - even when the ask book is paper-thin
    let opp = opportunityFor(rows(20, 10, 1e9, 1), 10, 20);
    assert(opp && !opp.wouldBlockGuardrail && opp.quantity > 0, "0111 AC3: a cheap ask (<= 7d median) passes with no guardrail even on a thin ask book (got " + JSON.stringify(opp) + ")");
    // AC3: an expensive ask is guarded by the liquidity checks
    opp = opportunityFor(rows(20, 10, 1e9, 1), 12, 20);
    assert(opp && opp.wouldBlockGuardrail && opp.guardrailReason === "buy-depth", "0111 AC3: an ask above the 7d median must clear liquidity (got " + JSON.stringify(opp && opp.guardrailReason) + ")");
    // AC14: the sell leg is guarded - bid depth, outlier, no history
    opp = opportunityFor(rows(20, 10, 1, 1e9), 10, 20);
    assert(opp && opp.guardrailReason === "sell-depth", "0111 AC14: a bid book too thin to sell into blocks the flip (got " + JSON.stringify(opp && opp.guardrailReason) + ")");
    opp = opportunityFor(rows(5, 5, 1e9, 1e9), 10, 20);
    assert(opp && opp.wouldBlockGuardrail, "0111 AC14: a bid far above its 7d median (outlier / manipulated order) blocks the flip");
    opp = opportunityFor([], 10, 20);
    assert(opp && opp.guardrailReason, "0111 AC14: no history at all blocks the flip (nobody has a read on this resource)");
    // AC2: time-risk margin with a short T - a volatile market needs more profit than a calm one
    opp = opportunityFor(rows(10.15, 10, 1e9, 1e9), 10, 10.15);
    assert(opp && opp.quantity > 0 && !opp.wouldBlockGuardrail, "0111 AC2: a calm market clears a 1.5% flip (got " + JSON.stringify(opp) + ")");
    opp = opportunityFor(rows(10.15, 10, 1e9, 1e9, 1), 10, 10.15);
    assert(!opp, "0111 AC2: the same 1.5% flip in a ~10% sigma market is below z*sigma*sqrt(T/3600) and never logged (got " + JSON.stringify(opp) + ")");
    Game.rooms = oldRooms; Game.market = oldMarket; Memory.settings = oldSettings; market.samples = oldSamples; terminalOps.buy = oldBuy;
}

// --- ROADMAP 0111: craftPlanner (candidates, feasibility gate, test mode) -----
{
    for (const m of ["craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldRooms = Game.rooms, oldMarket = Game.market, oldCreeps = Game.creeps, oldSettings = Memory.settings, oldSamples = market.samples,
        oldSnapshot = market.snapshot, oldCraft = Memory.craft, oldBucket = Game.cpu.bucket, oldTime = Game.time, oldPwr = global.PWR_OPERATE_FACTORY;
    global.PWR_OPERATE_FACTORY = 19;
    Game.cpu.bucket = 10000;
    COMMODITIES.widgetL = { level: 1, amount: 1, cooldown: 20, components: { Z: 10 } };
    const quotes = { Z: [100, 110], energy: [1, 1.1], H: [10, 11], O: [10, 11], widgetA: [5000, 5400], widgetL: [5000, 5400], OH: [60, 70] };
    const samplesFor = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.samples = samplesFor;
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const factory = { id: "cf1", structureType: STRUCTURE_FACTORY, level: undefined, store: {}, effects: [] };
    const mkLab = (slot) => ({ id: "cl" + slot, structureType: STRUCTURE_LAB, store: {}, pos: { x: 10 + labSlotsOffsets[slot][1], y: 10 + labSlotsOffsets[slot][0] } });
    const labSlotsOffsets = require(path.join(PROJECT, "src/utils/labSlots")).OFFSETS;
    let structures = [factory];
    const room = {
        name: "CraftRoom", controller: { my: true },
        storage: { store: { energy: 500000 } }, terminal: { store: {} },
        find: () => structures,
    };
    const run = (extra) => {
        Game.time += 1000; // past scanInterval, new tick for caches
        Game.rooms = { CraftRoom: room };
        Game.creeps = extra && extra.noHauler ? {} : { h1: { room: { name: "CraftRoom" }, memory: { role: "hauler" } } };
        Game.market = { credits: extra && extra.credits !== undefined ? extra.credits : 1000000, calcTransactionCost: () => 0,
            getAllOrders: () => Object.keys(quotes).map((rt) => ({ id: "candidate-" + rt, type: ORDER_SELL, resourceType: rt,
                price: quotes[rt][1], amount: 1e9, roomName: "QuoteRoom" })) };
        resetMarketFlipState();
        if (extra && extra.committed) Memory.marketFlip.committedCredits = extra.committed;
        Memory.craft = undefined;
        craft.resetScan();
        craft.tick();
        return Memory.craft;
    };
    Memory.settings = Object.assign({}, oldSettings);
    // a calm factory room finds the profitable level-0 chain
    let mem = run();
    const cand = mem.candidates.find((c) => c.product === "widgetA");
    assert(cand && cand.room === "CraftRoom" && cand.profit > 0 && cand.ratio >= cand.margin && cand.steps[0].product === "widgetA",
        "0111: a profitable factory chain becomes a candidate with cost/revenue/margin (got " + JSON.stringify(cand) + ")");
    assert(cand && cand.cost <= 1000000 * 0.05 && cand.qty >= 1, "0111 AC5: the chain's cost stays inside the 5% per-chain credit cap (cost " + (cand && cand.cost) + ")");
    assert(!mem.candidates.some((c) => c.product === "widgetB") && !mem.candidates.some((c) => c.product === "widgetL"),
        "0111: level 3 is outside craft.maxLevel and level 1 is gated by the operator check");
    assert(Object.keys(mem.active).length === 0, "0111 AC12: craft.test (default) records candidates only - nothing is opened");
    assert(typeof JSON.parse(global.craftStatus()).mode === "string" && JSON.parse(global.craftStatus()).mode === "test" && JSON.parse(global.craftStatus()).candidates.length > 0,
        "0111 AC12: craftStatus() reports test mode, candidates and discard reasons");
    // AC4: the feasibility gate - each missing prerequisite discards with its reason, nothing is bought
    mem = run({ noHauler: true });
    assert(mem.candidates.length === 0 && mem.discards["no-hauler"] > 0, "0111 AC4: no hauler in the room discards every product (got " + JSON.stringify(mem.discards) + ")");
    factory.level = 1;
    mem = run();
    assert(mem.discards["no-operator"] > 0 && !mem.candidates.some((c) => c.product === "widgetL"), "0111 AC4: a level-1 recipe without an active power creep operator is discarded (no-operator)");
    factory.effects = [{ effect: global.PWR_OPERATE_FACTORY, ticksRemaining: 500 }];
    mem = run();
    assert(mem.candidates.some((c) => c.product === "widgetL"), "0111 AC4: the same recipe turns on by itself once an operator effect is active");
    factory.level = undefined; factory.effects = [];
    mem = run({ credits: 0 });
    assert(mem.candidates.length === 0 && mem.discards.credits > 0, "0111 AC4: no free credits discards the chain before anything is bought");
    mem = run({ committed: 999999 });
    assert(mem.candidates.length === 0, "0111 AC5: credits already committed by flips/crafts shrink what a chain may spend (shared committedCredits)");
    // own-heavy room, little cash: own inputs cost opportunity, not credits - the lot is sized by CASH outlay
    room.storage.store = { energy: 500000, Z: 100000 };
    mem = run({ credits: 10000 });
    const ownHeavy = mem.candidates.find((c) => c.product === "widgetA");
    assert(ownHeavy && ownHeavy.spend <= 10000 * 0.05 && ownHeavy.owns.Z > 0 && ownHeavy.cost > ownHeavy.spend,
        "0111: a room full of its own mineral is not blocked by 'credits' - the lot is sized by the credits spent on purchases, not opportunity cost (got " + JSON.stringify(ownHeavy) + ")");
    room.storage.store = { energy: 500000 };
    // a product that cannot be SOLD (warming bid book) is reported as such - never mislabeled "credits"
    market.samples = (rt) => (rt === "widgetA" ? priceSamples(5000, 5400, 10, 1e9) : samplesFor(rt));
    mem = run();
    assert(!mem.candidates.some((c) => c.product === "widgetA") && mem.discards["sell-warming"] > 0 && !mem.discards.credits,
        "0111: a sell-side guardrail failure is reported as itself, not as 'credits' (got " + JSON.stringify(mem.discards) + ")");
    market.samples = samplesFor;
    // AC9: labs - a phase plan needs 3+ labs resolved from the stamp
    structures = [mkLab(1), mkLab(2)];
    mem = run();
    assert(!mem.candidates.some((c) => c.product === "OH"), "0111 AC9: two labs are not enough for any reaction");
    structures = [mkLab(1), mkLab(2), mkLab(3)];
    mem = run();
    const lab = mem.candidates.find((c) => c.product === "OH");
    assert(lab && lab.steps[0].kind === "lab" && lab.profit > 0, "0111: a 3-lab room finds the profitable compound (got " + JSON.stringify(lab) + ")");
    structures = [mkLab(1), { id: "stray", structureType: STRUCTURE_LAB, store: {}, pos: { x: 40, y: 40 } }, mkLab(3)];
    mem = run();
    assert(!mem.candidates.some((c) => c.product === "OH") && mem.discards["no-labs"] > 0, "0111 AC9: labs that do not follow the stamp discard the room with a reason (no-labs)");
    // a room already running a chain is skipped (one product per room)
    structures = [factory];
    Game.time += 1000; Memory.craft = { active: { CraftRoom: { product: "widgetA", room: "CraftRoom", kinds: ["factory"], queue: [{ kind: "factory" }] } } }; craft.resetScan(); craft.tick();
    assert(Memory.craft.candidates.length === 0, "0111 AC5: a room whose only structure already runs a chain is not planned again (one chain per structure kind)");
    delete COMMODITIES.widgetL;
    market.samples = oldSamples; market.snapshot = oldSnapshot; Game.rooms = oldRooms; Game.market = oldMarket; Game.creeps = oldCreeps;
    Memory.settings = oldSettings; Memory.craft = oldCraft; Game.cpu.bucket = oldBucket; Game.time = oldTime;
    if (oldPwr === undefined) delete global.PWR_OPERATE_FACTORY; else global.PWR_OPERATE_FACTORY = oldPwr;
}

// --- ROADMAP 0111: mixed own+bought inputs and the no-plan detail -----------
{
    const pricing = pricingModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldSamples = market.samples;
    const book = { Z: priceSamples(100, 110), energy: priceSamples(1, 1.1), widgetA: priceSamples(5000, 5400) };
    market.samples = (rt) => book[rt] || [];
    const base = { instant: (rt) => ({ bid: book[rt] && book[rt][0].buyPrice, ask: book[rt] && book[rt][0].sellPrice }), stock: () => 0 };
    const mixed = pricing.planNode("Z", 200, Object.assign({}, base, { stock: (rt) => (rt === "Z" ? 120 : 0) }), 0, {}, false);
    assert(mixed.source === "mixed" && mixed.owns.Z === 120 && mixed.buys.Z === 80 && mixed.total === 120 * 100 + 80 * 110 && mixed.cash === 80 * 110,
        "0111: partial own stock is used first and only the shortfall is bought, own at opportunity cost (got " + JSON.stringify(mixed) + ")");
    assert(pricing.planNode("Z", 100, Object.assign({}, base, { stock: () => 500 }), 0, {}, false).cash === 0, "0111: fully own inputs cost no cash");
    // a blocked input is named: which resource and which guardrail
    book.Z = priceSamples(100, 110, 10); // warming
    const blocked = pricing.evaluate("widgetA", 10, Object.assign({}, base, { instant: (rt) => (rt === "Z" ? { bid: 100, ask: 130 } : base.instant(rt)) }));
    assert(blocked.reason === "no-plan" && blocked.detail === "Z:liq-warming", "0111: no-plan says which input blocked the chain and why (got " + JSON.stringify(blocked.detail) + ")");
    market.samples = oldSamples; pricing.resetCaches();
}

// --- ROADMAP 0111: no-plan detail names the REAL blocker ----------------------
{
    const pricing = pricingModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldSamples = market.samples;
    // OH = O + H: O is fine to buy (cheap ask) but not makeable here; H is warming and expensive.
    const book = { O: priceSamples(10, 11), H: priceSamples(10, 11, 10), OH: priceSamples(60, 70) };
    market.samples = (rt) => book[rt] || [];
    const ctx = { instant: (rt) => (rt === "H" ? { bid: 10, ask: 13 } : { bid: book[rt][0].buyPrice, ask: book[rt][0].sellPrice }), stock: () => 0, canMake: (r) => r.product === "OH" }; // OH is makeable here; O (oxidant -> O) is not
    const verdict = pricing.evaluate("OH", 10, ctx);
    assert(verdict.reason === "no-plan" && verdict.detail === "H:liq-warming",
        "0111: a purchasable-but-unmakeable input (O) is not reported as the blocker - the real one is (got " + JSON.stringify(verdict.detail) + ")");
    market.samples = oldSamples; pricing.resetCaches();
}

// --- ROADMAP 0111: inverse recipes (bar <-> mineral) never form a circular plan ---
{
    const pricing = pricingModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldSamples = market.samples;
    COMMODITIES.cycBar = { level: 0, amount: 100, cooldown: 20, components: { cycOre: 500, energy: 200 } };
    COMMODITIES.cycOre = { level: 0, amount: 500, cooldown: 20, components: { cycBar: 100, energy: 200 } };
    const book = { cycOre: priceSamples(8, 9, 34), cycBar: priceSamples(4300, 4800, 34), energy: priceSamples(1, 1.1) };
    market.samples = (rt) => book[rt] || [];
    const quote = (askOre, askBar) => ({ instant: (rt) => ({ bid: book[rt][0].buyPrice, ask: rt === "cycOre" ? askOre : rt === "cycBar" ? askBar : book[rt][0].sellPrice }), stock: () => 0, canMake: () => true });
    // both asks above their 7d medians (warming) - the real blocker is named, not "no-option"
    let v = pricing.evaluate("cycBar", 100, quote(11, 5200));
    assert(v.reason === "no-plan" && v.detail === "cycOre:liq-warming", "0111: bar<->mineral cycle - the real blocker is named (got " + JSON.stringify(v.detail) + ")");
    v = pricing.evaluate("cycOre", 500, quote(11, 5200));
    assert(v.reason === "no-plan" && v.detail === "cycBar:liq-warming", "0111: the inverse recipe reports its own real blocker (got " + JSON.stringify(v.detail) + ")");
    // bar ask cheap: still no circular plan "buy bars -> make ore -> make bars" for the bar itself
    v = pricing.evaluate("cycBar", 100, quote(11, 4800));
    assert(v.reason === "no-plan", "0111: a product is never made from an ore that is itself made from that product (got " + JSON.stringify({ r: v.reason, steps: v.plan && v.plan.steps.length }) + ")");
    // ore cheap to buy: the plain bar chain still works
    v = pricing.evaluate("cycBar", 100, quote(8, 4800));
    assert(v.plan && v.plan.steps.length === 1 && v.plan.buys.cycOre === 500, "0111: with the ore buyable the bar is a plain one-step chain");
    delete COMMODITIES.cycBar; delete COMMODITIES.cycOre;
    market.samples = oldSamples; pricing.resetCaches();
}


// --- ROADMAP 0111 phase 6: craftChain (buy -> produce -> sell, caps, failures) ---
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const chainMod = require(path.join(PROJECT, "src/utils/craftChain"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, cancel: terminalOps.cancel, memRooms: Memory.rooms, flip: Memory.marketFlip, ops: Memory.terminalOps };
    Game.cpu.bucket = 10000;
    const quotes = { Z: [100, 110], energy: [1, 1.1], widgetA: [5000, 5400] };
    const live = { widgetA: 5000 }; // current bid, moved by the tests
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: live[rt] || quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const factory = { id: "chf", structureType: STRUCTURE_FACTORY, store: { widgetA: 0 }, effects: [] };
    const room = { name: "ChainRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => [factory] };
    let calls, nextOp;
    const reset = (settings) => {
        calls = { buy: [], sell: [], cancel: [] }; nextOp = 1;
        Game.rooms = { ChainRoom: room };
        Game.creeps = { h1: { room: { name: "ChainRoom" }, memory: { role: "hauler" } } };
        Game.market = { credits: 1000000, calcTransactionCost: () => 0,
            getAllOrders: () => Object.keys(quotes).map((rt) => ({ id: "craft-" + rt, type: ORDER_SELL, resourceType: rt,
                price: quotes[rt][1], amount: 1e9, roomName: "QuoteRoom" })) };
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: false }, settings || {}) });
        Memory.rooms = {};
        Memory.craft = undefined;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
        factory.store = { widgetA: 0 }; room.storage.store = { energy: 500000 }; live.widgetA = 5000;
        craft.resetScan();
    };
    terminalOps.buy = (r, rt, qty, limit) => { const id = "cb" + nextOp++; calls.buy.push({ r, rt, qty, limit, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = (r, rt, qty, floor, listing) => { const id = "cs" + nextOp++; calls.sell.push({ r, rt, qty, floor, listing, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.cancel = (id) => { calls.cancel.push(id); if (Memory.terminalOps.operations[id]) Memory.terminalOps.operations[id].state = "cancelled"; return { ok: true }; };
    const step = (n) => { for (let i = 0; i < (n || 1); i++) { Game.time += 1; craft.tick(); } };
    const open = (settings) => { reset(settings); Game.time += 1000; craft.tick(); return Memory.craft && Memory.craft.active.ChainRoom; };
    const completeBuy = (dealt) => {
        const op = Memory.terminalOps.operations[calls.buy[0].id];
        op.state = "completed"; op.dealtAmount = dealt === undefined ? calls.buy[0].qty : dealt;
        room.storage.store[calls.buy[0].rt] = op.dealtAmount;
    };

    // opens exactly one chain: buys the missing input at a bounded price and reserves the cash.
    // maxActive:1 - the global cap is off by default now, so this block asks for it to keep testing it
    let chain = open({ maxActive: 1 });
    assert(chain && chain.state === "buying" && calls.buy.length === 1 && calls.buy[0].rt === "Z" && calls.buy[0].r === "ChainRoom",
        "0111 P6: live mode opens a chain and buys the missing input up front (got " + JSON.stringify(calls.buy) + ")");
    assert(calls.buy[0].limit > 110 * 1.02 + 1 && calls.buy[0].limit < 110 * 1.5,
        "0111 P6: a chain with ample headroom buys above ask+2% but under the +50% premium cap, using the room left under its ceiling (got " + calls.buy[0].limit + ")");
    assert(Memory.marketFlip.committedCredits === chain.reserved && chain.reserved > 0, "0111 AC5: the chain's cash is reserved in the shared committedCredits");
    assert(chain.reserved <= 1000000 * 0.05 + 1e-6 && chain.reserved <= 200000 && chain.reserved > 1000000 * 0.05 - 1,
        "0111 P6: the chain's planned spend PLUS what its price limits could add fills, and never passes, the 5% ceiling (reserved " + chain.reserved + ")");
    assert(chain.reserved > chain.est.spend, "0111 AC5: the reservation covers the worst case of the limits, not just the planned spend (" + chain.est.spend + " -> " + chain.reserved + ")");
    const qty = calls.buy[0].qty;
    // one chain at a time across the whole empire
    // a SECOND room with a factory: the planner skips rooms that already run a chain, so the
    // blocked candidate has to come from another room (as in production: W7N49 busy, E1N45/E1N47 waiting)
    const factory2 = { id: "chf2", structureType: STRUCTURE_FACTORY, store: { widgetA: 0 }, effects: [] };
    const room2 = { name: "ChainRoom2", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => [factory2] };
    Game.rooms.ChainRoom2 = room2;
    Game.creeps.h2 = { room: { name: "ChainRoom2" }, memory: { role: "hauler" } };
    const slotLines = [];
    const slotLog = console.log;
    console.log = (...a) => { slotLines.push(a.join(" ")); };
    craft.resetScan(); Game.time += 400; craft.tick();
    craft.resetScan(); Game.time += 400; craft.tick();
    console.log = slotLog;
    delete Game.rooms.ChainRoom2; delete Game.creeps.h2;
    assert(calls.buy.length === 1 && Object.keys(Memory.craft.active).length === 1, "0111 P6: a second scan never opens a second chain while one is active");
    const waiting = slotLines.filter((l) => /ja esta sendo comprado/.test(l));
    assert(waiting.length === 0 && slotLines.filter((l) => /aguardando vaga/.test(l)).length === 1,
        "0134: global maxActive cap reports a slot wait, never a shared-input lock");
    // buying -> working: factory is configured by the chain, flagged Auto, energy = the batches' energy
    completeBuy();
    step();
    assert(chain.state === "working" && Memory.rooms.ChainRoom.factoryProduct === "widgetA" && Memory.rooms.ChainRoom.factoryProductAuto === true,
        "0111 P6: once inputs arrive the room's factoryProduct is set and marked Auto");
    assert(Memory.rooms.ChainRoom.factoryEnergy === chain.queue[0].target * 20, "0111 AC6: the factory's energy target is the batches' energy (got " + Memory.rooms.ChainRoom.factoryEnergy + ")");
    // the chain has left "buying", so the same input is free again: now only the global cap (maxActive 1) holds the second room back, and says so
    Game.rooms.ChainRoom2 = room2; Game.creeps.h2 = { room: { name: "ChainRoom2" }, memory: { role: "hauler" } };
    const capLines = [];
    console.log = (...a) => { capLines.push(a.join(" ")); };
    craft.resetScan(); Game.time += 400; craft.tick();
    craft.resetScan(); Game.time += 400; craft.tick();
    console.log = slotLog;
    delete Game.rooms.ChainRoom2; delete Game.creeps.h2;
    const capWaiting = capLines.filter((l) => /aguardando vaga/.test(l));
    assert(calls.buy.length === 1 && capWaiting.length === 0,
        "0134: an unchanged global cap does not repeat its waiting log after buying completes");
    // working -> selling when the target is produced; flags cleared
    factory.store.widgetA = chain.queue[0].target;
    room.storage.store.Z = 0; chain.inventory.balances.Z = 0;
    step();
    assert(chain.state === "selling" && !Memory.rooms.ChainRoom.factoryProduct && !Memory.rooms.ChainRoom.factoryEnergy, "0111 AC7: finishing the production clears the factory flags");
    // selling: bid >= break-even floor -> instant sell at the floor, never listed
    room.storage.store.widgetA = chain.queue[0].target; factory.store.widgetA = 0;
    step();
    assert(calls.sell.length === 1 && calls.sell[0].floor === chainMod.saleFloor(chain) && calls.sell[0].listing === false && calls.sell[0].qty === chain.queue[0].target,
        "0111 P6: the product is sold instantly at the break-even floor (got " + JSON.stringify(calls.sell) + ")");
    Memory.terminalOps.operations[calls.sell[0].id].state = "completed"; Memory.terminalOps.operations[calls.sell[0].id].dealtAmount = qty;
    Memory.terminalOps.events.push({ tick: Game.time, room: "ChainRoom", kind: "sell", resourceType: "widgetA", amount: chain.queue[0].target, credits: 5000 * chain.queue[0].target, transactionEnergy: 0 });
    Memory.terminalOps.events.push({ tick: chain.openedTick, room: "ChainRoom", kind: "buy", resourceType: "Z", amount: qty, credits: -110 * qty, transactionEnergy: 0 });
    Object.assign(Memory.terminalOps.operations[calls.buy[0].id], { kind: "buy", resourceType: "Z", accounting: { credits: -110 * qty, energy: 0, amount: qty, confidence: "confirmed" } });
    Object.assign(Memory.terminalOps.operations[calls.sell[0].id], { kind: "sell", resourceType: "widgetA", accounting: { credits: 5000 * chain.queue[0].target, energy: 0, amount: qty, confidence: "confirmed" } });
    step();
    assert(!Memory.craft.active.ChainRoom && Memory.marketFlip.committedCredits === 0 && Memory.craft.stats.completed === 1,
        "0111 AC5: a finished chain releases its reserved credits and is recorded");
    const entry = Memory.craft.ledger.products.widgetA;
    assert(entry && entry.runs === 1 && Memory.craft.ledger.runs[0].profit > 0 && typeof Memory.craft.ledger.runs[0].estimated === "number",
        "0111 AC14: the ledger stores realized vs estimated profit (got " + JSON.stringify(Memory.craft.ledger.runs[0]) + ")");

    // "faz mais": a sold lot makes the planner look again on the very next tick, not after craft.scanInterval
    assert(typeof Memory.craft.rescanAt === "number" && Memory.craft.rescanAt === Game.time + 1, "0111 P6: a finished lot schedules an immediate rescan (got " + Memory.craft.rescanAt + ")");
    const buysBefore = calls.buy.length;
    step();
    assert(Memory.craft.active.ChainRoom && Memory.craft.active.ChainRoom.openedTick === Game.time && calls.buy.length === buysBefore + 1 && Memory.craft.rescanAt === undefined,
        "0111 P6: the next lot opens right after the previous one is sold (buys " + buysBefore + " -> " + calls.buy.length + ")");

    // AC13: bid below break-even -> hold (no sale), then list at the floor after the retention window
    chain = open({ retentionTicks: 5000 });
    completeBuy();
    step(); factory.store.widgetA = chain.queue[0].target; step(); room.storage.store.widgetA = chain.queue[0].target; factory.store.widgetA = 0;
    live.widgetA = chainMod.saleFloor(chain) * 0.5;
    step(3);
    assert(chain.state === "selling" && calls.sell.length === 0 && chain.holding === true, "0111 AC13: a bid below break-even is never sold into - the product is held (sells: " + calls.sell.length + ")");
    Game.time += 6000; craft.tick();
    assert(calls.sell.length === 1 && calls.sell[0].listing === true && calls.sell[0].floor === chainMod.saleFloor(chain), "0111 AC13: after the retention window it is listed at the break-even floor, still never below it");

    // a floor sell that nobody fills (bid fell under the floor after it opened) is not waited on forever
    chain = open({ retentionTicks: 5000 });
    completeBuy();
    step(); factory.store.widgetA = chain.queue[0].target; step(); room.storage.store.widgetA = chain.queue[0].target; factory.store.widgetA = 0;
    step();
    assert(calls.sell.length === 1 && calls.sell[0].listing === false, "0111 AC13: the first sell is an instant sell at the floor (got " + JSON.stringify(calls.sell) + ")");
    const firstSell = calls.sell[0].id;
    live.widgetA = chainMod.saleFloor(chain) * 0.97; // the bid slips under the floor; the order stays open and unfilled
    step(3);
    assert(calls.cancel.indexOf(firstSell) < 0 && calls.sell.length === 1, "0111 AC13: inside the retention window the unfilled sell is left alone");
    Game.time += 6000; craft.tick();
    assert(calls.cancel.indexOf(firstSell) >= 0 && calls.sell.length === 2 && calls.sell[1].listing === true && calls.sell[1].floor === chainMod.saleFloor(chain) && chain.sellOpId === calls.sell[1].id,
        "0111 AC13: past the retention window an unfilled instant sell is swapped for a listing at the floor (cancels " + JSON.stringify(calls.cancel) + ", sells " + calls.sell.length + ")");
    Game.time += 100; craft.tick(); Game.time += 100; craft.tick();
    assert(calls.sell.length === 2 && calls.cancel.length === 1, "0111 AC13: the swap happens once - the listing is not cancelled and recreated again");
    // a healthy instant sell (bid still at/above the floor) is never cancelled, however long it takes
    chain = open({ retentionTicks: 5000 });
    completeBuy();
    step(); factory.store.widgetA = chain.queue[0].target; step(); room.storage.store.widgetA = chain.queue[0].target; factory.store.widgetA = 0;
    step();
    Game.time += 6000; craft.tick();
    assert(calls.sell.length === 1 && calls.cancel.length === 0, "0111 AC13: an instant sell whose bid is still at the floor is never cancelled (sells " + calls.sell.length + ", cancels " + calls.cancel.length + ")");
    // failures after buying: abort keeps the inputs as stock, frees credits and flags, never sells at a loss
    chain = open();
    completeBuy(1); // partial
    step();
    assert(!Memory.craft.active.ChainRoom && Memory.marketFlip.committedCredits === 0 && Object.keys(Memory.craft.stranded).length === 1 && Memory.craft.stats.aborted === 1,
        "0111 P6: a partial buy aborts the chain, frees the credits and strands the inputs as own stock");
    chain = open({ stallTicks: 50 });
    completeBuy();
    step(); // working, nothing is ever produced
    Game.time += 100; craft.tick();
    assert(!Memory.craft.active.ChainRoom && !Memory.rooms.ChainRoom.factoryProduct && Memory.craft.stats.aborted === 1, "0111 P6: the stall guard aborts a chain that stops progressing and clears its flags");
    // a long job that KEEPS producing outlives stallTicks; one that stops is aborted
    chain = open({ stallTicks: 50 });
    completeBuy();
    step();
    const bump = Math.max(1, Math.floor(chain.queue[0].target / 20));
    for (let i = 0; i < 6; i++) { factory.store.widgetA += bump; Game.time += 30; craft.tick(); }
    assert(Memory.craft.active.ChainRoom && chain.state === "working" && Game.time - chain.openedTick > 150,
        "0111 P6: a chain that keeps producing is not aborted by the stall guard, however long it runs (age " + (Game.time - chain.openedTick) + " > stallTicks 50, state " + chain.state + ")");
    Game.time += 100; craft.tick();
    assert(!Memory.craft.active.ChainRoom && Memory.craft.stats.aborted >= 1, "0111 P6: the same chain is aborted once production stops for stallTicks");
    chain = open();
    Memory.terminalOps.operations[calls.buy[0].id].state = "failed";
    step();
    assert(!Memory.craft.active.ChainRoom && Memory.marketFlip.committedCredits === 0, "0111 P6: a failed buy aborts the chain");

    // partial fill: the book ran out - carry on, scaled to what arrived, instead of aborting
    chain = open();
    const fullTarget = chain.queue[0].target, reservedFull = chain.reserved, floorBefore = chain.est.floor, orderQty = calls.buy[0].qty;
    completeBuy(Math.floor(orderQty * 0.5));
    step();
    assert(Memory.craft.active.ChainRoom && chain.state === "working" && Memory.craft.stats.aborted === 0 && chain.scaled > 0.45 && chain.scaled < 0.55,
        "0111 P6: a purchase filled at ~50% does not abort - the chain goes on, scaled (got state " + chain.state + ", scaled " + chain.scaled + ")");
    assert(chain.queue[0].target < fullTarget && chain.queue[0].target >= Math.floor(fullTarget * 0.45), "0111 P6: the production target shrinks to what the inputs allow (" + fullTarget + " -> " + chain.queue[0].target + ")");
    assert(Memory.rooms.ChainRoom.factoryEnergy === chain.queue[0].target * 20, "0111 P6: the factory's energy target follows the scaled batches (got " + Memory.rooms.ChainRoom.factoryEnergy + ")");
    assert(chain.reserved < reservedFull && Memory.marketFlip.committedCredits === chain.reserved, "0111 AC5: credits that were not spent go back to the shared budget at once");
    assert(chain.est.floor === floorBefore, "0111 P6: the unit break-even floor does not change when the lot shrinks");
    factory.store.widgetA = chain.queue[0].target; step();
    assert(chain.state === "selling", "0111 P6: the scaled chain still completes and sells");
    chain = open();
    completeBuy(Math.floor(calls.buy[0].qty * 0.1)); // far below minPartialRatio
    step();
    assert(!Memory.craft.active.ChainRoom && Memory.craft.stats.aborted === 1, "0111 P6: a fill below craft.minPartialRatio still aborts");
    // a buy that traded part of the order and then sits in "waiting" does not hold the chain until the stall guard
    chain = open({ buyPatienceTicks: 100 });
    const waitId = calls.buy[0].id, waitQty = calls.buy[0].qty;
    Object.assign(Memory.terminalOps.operations[waitId], { state: "waiting", dealtAmount: Math.floor(waitQty * 0.5) });
    step();
    Game.time += 60; craft.tick();
    assert(chain.state === "buying" && calls.cancel.indexOf(waitId) < 0, "0111 P6: a half-filled buy still gets its patience window (state " + chain.state + ")");
    Game.time += 60; craft.tick();
    assert(calls.cancel.indexOf(waitId) >= 0 && chain.state === "working" && chain.scaled > 0.45 && chain.scaled < 0.55 && Memory.craft.stats.aborted === 0,
        "0111 P6: once it shows no new trade for buyPatienceTicks the buy is cancelled and the chain goes on scaled to what arrived (state " + chain.state + ", scaled " + chain.scaled + ")");
    // new trades reset the clock
    chain = open({ buyPatienceTicks: 100 });
    const slowId = calls.buy[0].id;
    Object.assign(Memory.terminalOps.operations[slowId], { state: "waiting", dealtAmount: 10 });
    step();
    Game.time += 80; Memory.terminalOps.operations[slowId].dealtAmount = 20; craft.tick(); // progress at +80
    Game.time += 80; craft.tick();                                                          // 80 idle < 100
    assert(chain.state === "buying" && calls.cancel.indexOf(slowId) < 0, "0111 P6: a new trade restarts the patience clock");
    Game.time += 40; craft.tick();                                                          // 120 idle
    assert(calls.cancel.indexOf(slowId) >= 0, "0111 P6: ...and the cut happens once it has been idle for the full window");
    // nothing traded at all: nothing to build on, so it keeps waiting (the stall guard owns that case)
    chain = open({ buyPatienceTicks: 100 });
    const idleId = calls.buy[0].id;
    Memory.terminalOps.operations[idleId].state = "waiting";
    step();
    Game.time += 500; craft.tick();
    assert(chain.state === "buying" && calls.cancel.indexOf(idleId) < 0 && Memory.craft.active.ChainRoom,
        "0111 P6: a buy that has traded NOTHING is never cut short by the patience window");
    // kill switch: craftCancel aborts a running chain without losing the bought inputs
    chain = open();
    completeBuy(); step();
    assert(Memory.rooms.ChainRoom.factoryProduct === "widgetA" && global.craftCancel("ChainRoom") === true, "0111 P6: craftCancel() aborts a running chain");
    assert(!Memory.craft.active.ChainRoom && Memory.marketFlip.committedCredits === 0 && !Memory.rooms.ChainRoom.factoryProduct && Object.keys(Memory.craft.stranded).length === 1,
        "0111 P6: craftCancel() frees the credits, clears the Auto flags and keeps the inputs as stock");
    assert(global.craftCancel("ChainRoom") === false, "0111 P6: craftCancel() on a room with no chain is a harmless no-op");
    // AC16: a manual pin is never overridden
    reset(); Memory.rooms = { ChainRoom: { factoryProduct: "widgetA" } }; Game.time += 1000; craft.tick();
    assert(!Memory.craft.active.ChainRoom && calls.buy.length === 0 && Memory.craft.discards["manual-pin"] > 0 && Memory.rooms.ChainRoom.factoryProductAuto === undefined,
        "0111 AC16: a manually pinned factoryProduct keeps the room out of the planner and is left untouched");
    // safety caps
    reset({ maxCashAbsolute: 100 }); Game.time += 1000; craft.tick();
    assert(!Memory.craft.active.ChainRoom && calls.buy.length === 0 && Memory.craft.discards.credits > 0, "0111 P6: an absolute cap too small for even one batch discards the chain and buys nothing (got " + JSON.stringify(Memory.craft.discards) + ")");
    reset(); Memory.marketFlip.committedCredits = 249000; Game.time += 1000; craft.tick();
    assert(!Memory.craft.active.ChainRoom && calls.buy.length === 0, "0111 AC5: committed flips/crafts above 25% of the balance stop a new chain");
    // AC12: test mode opens nothing
    reset({ test: true }); Game.time += 1000; craft.tick();
    assert(!Memory.craft.active.ChainRoom && calls.buy.length === 0 && Memory.craft.candidates.length > 0, "0111 AC12: craft.test never opens a chain even with a good candidate");

    // AC14: breakers
    reset({ breakers: false, productLosses: 3, globalRuns: 10 });
    const fake = { product: "widgetA", room: "ChainRoom", est: { profit: 100 } };
    [-5, -5, -5, -5].forEach((p) => chainMod.recordRun(fake, p));
    assert(!Memory.craft.suspended.widgetA && Memory.settings.craft.test === false,
        "0111 AC14: with craft.breakers off, losses neither suspend a product nor force test mode");
    Memory.craft.suspended.widgetA = Game.time + 1000;
    Game.time += 1000; craft.tick();
    assert(Memory.craft.discards.suspended === undefined, "0111 AC14: with craft.breakers off, a stale suspension is ignored by the planner");
    reset({ breakers: true, productLosses: 3, globalRuns: 10 });
    chainMod.recordRun(fake, -5); chainMod.recordRun(fake, -5);
    assert(!Memory.craft.suspended.widgetA, "0111 AC14: two losses do not suspend a product");
    chainMod.recordRun(fake, -5);
    assert(Memory.craft.suspended.widgetA > Game.time, "0111 AC14: three losses in a row suspend the product for suspendTicks");
    reset({ breakers: true, productLosses: 99, globalRuns: 4 });
    [20, -5, -5, -5].forEach((p) => chainMod.recordRun(fake, p));
    assert(Memory.settings.craft.test === false, "0111 AC14: a global window with a positive total keeps live mode");
    chainMod.recordRun(fake, -50);
    assert(Memory.settings.craft.test === true, "0111 AC14: a net-negative global window puts the planner back in test mode");

    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; terminalOps.cancel = saved.cancel;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time;
}

// --- ROADMAP 0111 phase 6: lab chain (slots, drain barrier, reaction setup) ---
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, memRooms: Memory.rooms, flip: Memory.marketFlip,
        ops: Memory.terminalOps, getObj: Game.getObjectById };
    Game.cpu.bucket = 10000;
    const quotes = { H: [10, 11], O: [10, 11], OH: [60, 70], energy: [1, 1.1] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const mkLab = (slot) => ({ id: "lc" + slot, structureType: STRUCTURE_LAB, store: { OH: 0 }, mineralType: null, pos: { x: 10 + labSlots.OFFSETS[slot][1], y: 10 + labSlots.OFFSETS[slot][0] } });
    const labs = [mkLab(1), mkLab(2), mkLab(3)];
    const byId = {}; labs.forEach((l) => { byId[l.id] = l; });
    Game.getObjectById = (id) => byId[id] || null;
    const room = { name: "LabChainRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => labs };
    const calls = { buy: [] };
    let nextOp = 1;
    terminalOps.buy = (r, rt, qty) => { const id = "lb" + nextOp++; calls.buy.push({ rt, qty, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = () => ({ ok: true, id: "ls" + nextOp++ });
    Game.rooms = { LabChainRoom: room };
    Game.creeps = { h1: { room: { name: "LabChainRoom" }, memory: { role: "hauler" } } };
    Game.market = craftTestMarket(quotes, 1000000);
    Memory.settings = Object.assign({}, saved.settings, { craft: { test: false } });
    Memory.rooms = {}; Memory.craft = undefined;
    Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    labSlots.resetCache(); craft.resetScan();
    Game.time += 1000; craft.tick();
    const chain = Memory.craft.active.LabChainRoom;
    assert(chain && chain.product === "OH" && chain.queue.length === 1 && chain.queue[0].kind === "lab", "0111 P6: a profitable compound opens a one-step lab chain (got " + JSON.stringify(Memory.craft.candidates.map((c) => c.product)) + ")");
    const item = chain.queue[0];
    assert(item.input1 === "lc1" && item.input2 === "lc2" && item.output === "lc3" && item.a === "H" && item.b === "O",
        "0111 P6: the lab item takes its input/output labs from the fixed slot table, reagents in recipe order (got " + JSON.stringify(item) + ")");
    assert(calls.buy.length === 2 && calls.buy.every((b) => b.qty >= item.target), "0111 P6: both reagents are bought up front, at least the batch target each");
    calls.buy.forEach((b) => { Memory.terminalOps.operations[b.id].state = "completed"; Memory.terminalOps.operations[b.id].dealtAmount = b.qty; });
    // drain barrier: a lab still holding a foreign mineral blocks the reaction setup
    labs[1].mineralType = "G"; labs[1].store = { G: 50 };
    Game.time += 1; craft.tick();
    assert(!Memory.rooms.LabChainRoom.labReaction && chain.state === "working", "0111 P6: labs still holding another mineral hold the reaction back (drain barrier)");
    labs[1].mineralType = null; labs[1].store = { OH: 0 };
    Game.time += 1; craft.tick();
    const reaction = Memory.rooms.LabChainRoom.labReaction;
    assert(reaction && reaction.output === "lc3" && reaction.input1 === "lc1" && reaction.input2 === "lc2" && reaction.product === "OH" && Memory.rooms.LabChainRoom.labReactionAuto === true,
        "0111 P6: once the labs are clear the reaction is set on those labs and marked Auto");
    // a manual reaction is never touched
    labs[2].store = { OH: item.target }; labs[2].mineralType = "OH";
    Game.time += 1; craft.tick();
    assert(chain.state === "selling" && !Memory.rooms.LabChainRoom.labReaction && !Memory.rooms.LabChainRoom.labReactionAuto, "0111 P6: reaching the target clears the Auto reaction");
    Memory.craft.active = {}; Memory.marketFlip.committedCredits = 0;
    Memory.rooms.LabChainRoom = { labReaction: { a: "H", b: "O", product: "OH", output: "lc3", input1: "lc1", input2: "lc2" } }; // manual
    craft.resetScan(); Game.time += 1000; craft.tick();
    assert(!Memory.craft.active.LabChainRoom && Memory.craft.discards["manual-pin"] > 0 && Memory.rooms.LabChainRoom.labReactionAuto === undefined,
        "0111 AC16: a manual labReaction keeps lab products out of the planner and stays untouched");

    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; Game.getObjectById = saved.getObj;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time; labSlots.resetCache();
}

// --- ROADMAP 0111 follow-ups: in-place lab intermediates, direct-to-terminal, terminal-stock sale ---
{
    // (1) terminalOps: a SELL may use material that is already in the terminal
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/terminalOps"))];
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOpsFresh = require(path.join(PROJECT, "src/utils/terminalOps"));
    const oldSnapshot = market.snapshot, oldRooms = Game.rooms, oldOps = Memory.terminalOps, oldMarket = Game.market;
    market.snapshot = () => ({ resources: { power: { buyPrice: 10, sellPrice: 11, fairPrice: 10.5 }, energy: { fairPrice: 1 } } });
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    Game.market = { credits: 1e6, calcTransactionCost: () => 0, getAllOrders: () => [] };
    const stockRoom = (storageZ, terminalZ) => ({
        name: "SellRoom", controller: { my: true }, find: () => [],
        storage: { id: "ss", store: { power: storageZ, energy: 100000, getFreeCapacity: () => 1e6, getUsedCapacity: () => 1e5, getCapacity: () => 1e6 } },
        terminal: { id: "st", cooldown: 0, store: { power: terminalZ, energy: 50000, getFreeCapacity: () => 1e5, getUsedCapacity: () => 5e4, getCapacity: () => 3e5 } },
    });
    Game.rooms = { SellRoom: stockRoom(0, 0) };
    const noStock = terminalOpsFresh.sell("SellRoom", "power", 50, 5, false, true);
    assert(noStock.ok === false && /material insuficiente/.test(noStock.error || ""), "0111: a sell with no material anywhere is refused for that reason (got " + JSON.stringify(noStock) + ")");
    Game.rooms = { SellRoom: stockRoom(0, 100) };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const termSell = terminalOpsFresh.sell("SellRoom", "power", 50, 5, false, true);
    assert(termSell.ok === true, "0111: a sell is accepted when the material is already in the terminal, storage empty (got " + JSON.stringify(termSell) + ")");
    Game.rooms = { SellRoom: stockRoom(0, 0) };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    market.snapshot = oldSnapshot; Game.rooms = oldRooms; Memory.terminalOps = oldOps; Game.market = oldMarket;

    // (2) hauler: the final product goes straight to the terminal when the chain asks for it
    const chainRoomFor = (name) => {
        const factory = { id: "df-" + name, structureType: STRUCTURE_FACTORY, store: mineralStore({ widgetA: 40 }, 1000), pos: new RoomPosition(20, 20, name) };
        return { name, storage: { id: "dstore-" + name, store: mineralStore({}, 100000) }, terminal: { id: "dterm-" + name, store: mineralStore({}, 100000) },
            find: (type) => (type === FIND_STRUCTURES || type === FIND_MY_STRUCTURES ? [factory] : []), factory };
    };
    const savedMemRooms = Memory.rooms;
    Memory.rooms = { DirectA: { factoryProduct: "widgetA" }, DirectB: { factoryProduct: "widgetA", directToTerminal: "widgetA" } };
    Game.time++;
    const roomA = chainRoomFor("DirectA"), roomB = chainRoomFor("DirectB");
    const jobA = hauler.pickMineralJob(roomA), jobB = hauler.pickMineralJob(roomB);
    assert(jobA && jobA.kind === "factoryOutput" && jobA.to === roomA.terminal, "0124: unused factory product goes to terminal without requiring directToTerminal (got " + (jobA && jobA.kind) + ")");
    assert(jobB && jobB.kind === "factoryOutput" && jobB.to === roomB.terminal, "0111: with directToTerminal the final product goes straight to the terminal (got " + (jobB && jobB.kind) + ")");
    Memory.rooms = savedMemRooms;
}
{
    // (3) a two-level lab chain keeps its intermediates in place
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    const transientStock = require(path.join(PROJECT, "src/utils/transientStock"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, memRooms: Memory.rooms, flip: Memory.marketFlip,
        ops: Memory.terminalOps, getObj: Game.getObjectById };
    const reactionsBackup = { P: REACTIONS.P, R: REACTIONS.R, PQ: REACTIONS.PQ };
    REACTIONS.P = { Q: "PQ" }; REACTIONS.R = { S: "RS" }; REACTIONS.PQ = { RS: "PQRS" };
    Game.cpu.bucket = 10000;
    const quotes = { P: [10, 11], Q: [10, 11], R: [10, 11], S: [10, 11], PQRS: [300, 350], energy: [1, 1.1] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const mkLab = (slot) => ({ id: "ip" + slot, structureType: STRUCTURE_LAB, store: {}, mineralType: null, pos: { x: 10 + labSlots.OFFSETS[slot][1], y: 10 + labSlots.OFFSETS[slot][0] }, room: { name: "InPlaceRoom" } });
    const labs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(mkLab);
    const byId = {}; labs.forEach((l) => { byId[l.id] = l; });
    Game.getObjectById = (id) => byId[id] || null;
    const room = { name: "InPlaceRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => labs };
    const bought = [];
    let nextOp = 1;
    terminalOps.buy = (r, rt, qty) => { const id = "ib" + nextOp++; bought.push({ rt, qty, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = () => ({ ok: true, id: "is" + nextOp++ });
    Game.rooms = { InPlaceRoom: room };
    Game.creeps = { h1: { room: { name: "InPlaceRoom" }, memory: { role: "hauler" } } };
    Game.market = craftTestMarket(quotes, 1e8);
    // 0116: this block is about intermediates kept IN PLACE (waves); the wide strategy has its own block
    Memory.settings = Object.assign({}, saved.settings, { craft: { test: false, maxCashAbsolute: 1e7, labStrategy: "waves" } });
    Memory.rooms = {}; Memory.craft = undefined;
    Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    labSlots.resetCache(); craft.resetScan(); craft.resetLog();
    const marketPricing = require(path.join(PROJECT, "src/utils/marketPricing")); marketPricing.resetCaches();
    Game.time += 1000; craft.tick();
    const chain = Memory.craft.active.InPlaceRoom;
    assert(chain && chain.product === "PQRS" && chain.queue.length === 3 && chain.queue.every((i) => i.kind === "lab"),
        "0111 P6: a two-level compound opens a three-step lab chain (got " + JSON.stringify(Memory.craft.candidates.map((c) => c.product)) + ")");
    const [q0, q1, q2] = chain.queue;
    // 0115: the planner priced the chain by its critical path: PQ and RS run together (one wave)
    const cand = Memory.craft.candidates.find((c) => c.product === "PQRS");
    const b = cand.steps[0].batches;
    // PQ and RS run together: one wave of b reactions x 10 ticks; the final step runs wide on the 8
    // other labs (ceil(b/8) x 10); plus 50 ticks of logistics per step. Sequentially it would be
    // 2 x b x 10 for the intermediates.
    const expectedT = b * 10 + Math.ceil(b / 8) * 10 + 3 * 50;
    assert(cand && cand.T === expectedT, "0115: the planner's T for a 10-lab room counts the two independent steps once (T " + (cand && cand.T) + ", expected " + expectedT + ", sequential " + (expectedT + b * 10) + ")");
    assert(q0.keep === true && q1.keep === true && q2.keep === false, "0111 P6: intermediates stay in place (keep), only the final phase is drained");
    assert([q2.input1, q2.input2].sort().join() === [q0.output, q1.output].sort().join() && q2.consumes.length === 2,
        "0111 P6: the last phase takes the two intermediates straight from the labs that made them (got " + JSON.stringify({ in: [q2.input1, q2.input2], out: [q0.output, q1.output] }) + ")");
    bought.forEach((b) => { Memory.terminalOps.operations[b.id].state = "completed"; Memory.terminalOps.operations[b.id].dealtAmount = b.qty; });
    const memRoom = () => Memory.rooms.InPlaceRoom;
    const finishItem = (item, mineral) => { byId[item.output].mineralType = mineral; byId[item.output].store = { [mineral]: item.target }; };
    // the barrier covers EVERY lab of the wave: one dirty lab of the second step holds the whole wave back
    byId[q1.input1].mineralType = "Z"; byId[q1.input1].store = { Z: 5 };
    Game.time += 1; craft.tick();
    assert(!memRoom().labReaction && !memRoom().labReactions && !chain.queue[0].started && !chain.queue[1].started,
        "0115: a lab of ANY step of the wave still holding a foreign mineral keeps the whole wave from starting");
    byId[q1.input1].mineralType = null; byId[q1.input1].store = {};
    Game.time += 1; craft.tick(); // wave 0 starts: the two independent intermediates run together (0115)
    assert(q0.wave === q1.wave && q2.wave > q0.wave, "0115: the two intermediates share a wave, the final step follows");
    assert(!memRoom().labReaction && Array.isArray(memRoom().labReactions) && memRoom().labReactions.length === 2 &&
        memRoom().labReactions.every((r) => r.keep === true) &&
        memRoom().labReactions.map((r) => r.product).sort().join() === [q0.product, q1.product].sort().join() && !memRoom().directToTerminal,
        "0111 P6: the first wave runs both intermediates at once, each with keep=true and no direct-to-terminal yet (got " + JSON.stringify(memRoom().labReactions && memRoom().labReactions.map((r) => r.product)) + ")");
    finishItem(q0, q0.product);
    Game.time += 1; craft.tick();
    assert(chain.holds[q0.output] === q0.product && memRoom().labLoad && memRoom().labLoad[q0.output][0] === q0.product && !memRoom().labReaction,
        "0111 P6: a finished intermediate is held in its lab and protected by labLoad");
    assert(chain.qi === 0 && memRoom().labReactions.length === 1 && memRoom().labReactions[0].product === q1.product,
        "0115: the step that finished first leaves the list at once (the hauler stops stocking its inputs), the other keeps running and the wave is not over");
    const holder = byId[q0.output]; holder.store = mineralStore({ [q0.product]: q0.target }, 1000); holder.mineralType = q0.product; holder.structureType = STRUCTURE_LAB;
    assert(transientStock.excess(holder).length === 0, "0111 AC6: the transient drain leaves a protected intermediate alone");
    assert(chain.queue[0].started && chain.queue[1].started && !chain.queue[2].started, "0115: both steps of the wave are started together, the next wave is not");
    finishItem(q1, q1.product);
    Game.time += 1; craft.tick();
    assert(Object.keys(chain.holds).length === 2 && chain.qi === 2 && !memRoom().labReactions, "0111 P6: both intermediates are now held and the wave is closed (qi " + chain.qi + ")");
    // the last phase: inputs already hold exactly the intermediates, so the barrier lets it start at once
    Game.time += 1; craft.tick();
    assert(memRoom().labReaction && memRoom().labReaction.product === "PQRS" && !memRoom().labReaction.keep && memRoom().directToTerminal === undefined,
        "0111 P6: the final phase starts on the in-place intermediates (the product goes to storage and is sold from there) (got " + JSON.stringify(memRoom().labReaction) + ")");
    finishItem(q2, "PQRS");
    Game.time += 1; craft.tick();
    assert(chain.state === "selling" && !memRoom().labLoad && !memRoom().directToTerminal && Object.keys(chain.holds).length === 0,
        "0111 P6: after the last phase the holds, labLoad and the terminal flag are cleared");
    // hauler: a keep reaction never gets its output drained; a normal one does
    const out = byId[q0.output]; out.store = mineralStore({ [q0.product]: 2500 }, 500); out.mineralType = q0.product;
    const pickRoom = { name: "InPlaceRoom", storage: { store: mineralStore({}, 1e6) }, terminal: null, find: (type) => (type === FIND_STRUCTURES || type === FIND_MY_STRUCTURES ? labs : []) };
    Memory.rooms.InPlaceRoom = { labReaction: { a: q0.a, b: q0.b, product: q0.product, output: q0.output, input1: q0.input1, input2: q0.input2, keep: true } };
    Game.time++;
    const keptJob = hauler.pickMineralJob(pickRoom);
    assert(!keptJob || keptJob.kind !== "labOutput", "0111 P6: the hauler does not drain a keep reaction's output lab (got " + (keptJob && keptJob.kind) + ")");
    delete Memory.rooms.InPlaceRoom.labReaction.keep;
    Game.time++;
    const drainJob = hauler.pickMineralJob(pickRoom);
    assert(drainJob && drainJob.kind === "labOutput", "0111 P6: without keep the output lab is drained as before (got " + (drainJob && drainJob.kind) + ")");

    REACTIONS.P = reactionsBackup.P; REACTIONS.R = reactionsBackup.R; REACTIONS.PQ = reactionsBackup.PQ;
    ["P", "R", "PQ"].forEach((k) => { if (reactionsBackup[k] === undefined) delete REACTIONS[k]; });
    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; Game.getObjectById = saved.getObj;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time; labSlots.resetCache(); marketPricing.resetCaches();
}
{
    // 0116 craftReplan: a chain opened under the in-place (waves) plan gets its pending steps rebuilt wide
    
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    const transientStock = require(path.join(PROJECT, "src/utils/transientStock"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, memRooms: Memory.rooms, flip: Memory.marketFlip,
        ops: Memory.terminalOps, getObj: Game.getObjectById };
    const reactionsBackup = { P: REACTIONS.P, R: REACTIONS.R, PQ: REACTIONS.PQ };
    REACTIONS.P = { Q: "PQ" }; REACTIONS.R = { S: "RS" }; REACTIONS.PQ = { RS: "PQRS" };
    Game.cpu.bucket = 10000;
    const quotes = { P: [10, 11], Q: [10, 11], R: [10, 11], S: [10, 11], PQRS: [300, 350], energy: [1, 1.1] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const mkLab = (slot) => ({ id: "ip" + slot, structureType: STRUCTURE_LAB, store: {}, mineralType: null, pos: { x: 10 + labSlots.OFFSETS[slot][1], y: 10 + labSlots.OFFSETS[slot][0] }, room: { name: "InPlaceRoom" } });
    const labs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(mkLab);
    const byId = {}; labs.forEach((l) => { byId[l.id] = l; });
    Game.getObjectById = (id) => byId[id] || null;
    const room = { name: "InPlaceRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => labs };
    const bought = [];
    let nextOp = 1;
    terminalOps.buy = (r, rt, qty) => { const id = "ib" + nextOp++; bought.push({ rt, qty, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = () => ({ ok: true, id: "is" + nextOp++ });
    Game.rooms = { InPlaceRoom: room };
    Game.creeps = { h1: { room: { name: "InPlaceRoom" }, memory: { role: "hauler" } } };
    Game.market = craftTestMarket(quotes, 1e8);
    // 0116: this block is about intermediates kept IN PLACE (waves); the wide strategy has its own block
    Memory.settings = Object.assign({}, saved.settings, { craft: { test: false, maxCashAbsolute: 1e7, labStrategy: "waves" } });
    Memory.rooms = {}; Memory.craft = undefined;
    Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    labSlots.resetCache(); craft.resetScan(); craft.resetLog();
    const marketPricing = require(path.join(PROJECT, "src/utils/marketPricing")); marketPricing.resetCaches();
    Game.time += 1000; craft.tick();
    const chain = Memory.craft.active.InPlaceRoom;
    assert(chain && chain.product === "PQRS" && chain.queue.length === 3 && chain.queue.every((i) => i.kind === "lab"),
        "0111 P6: a two-level compound opens a three-step lab chain (got " + JSON.stringify(Memory.craft.candidates.map((c) => c.product)) + ")");
    const craftChainMod = require(path.join(PROJECT, "src/utils/craftChain"));
    const memRoom = () => Memory.rooms.InPlaceRoom;
    const [r0, r1, r2] = chain.queue;
    assert(r0.keep === true && r1.keep === true && r2.outputs.length === 8 && r2.consumes.length === 2, "0116 replan: the chain starts as an in-place (waves) chain");
    assert(craftChainMod.replan("NoSuchRoom").length === 0 && craftChainMod.replan("InPlaceRoom")[0].indexOf("waves") >= 0,
        "0116 replan: with the strategy still 'waves' there is nothing to change (said so)");
    bought.forEach((x) => { Memory.terminalOps.operations[x.id].state = "completed"; Memory.terminalOps.operations[x.id].dealtAmount = x.qty; });
    Game.time += 1; craft.tick(); // wave 0 (r0 and r1) starts
    assert(r0.started && r1.started && !r2.started && memRoom().labReactions && memRoom().labReactions.length === 2, "0116 replan: wave 0 is running, the final step is pending");
    // a product of an earlier step pinned in place: one in a lab that the new wide step reads as an
    // input (ip1), and one in a lab it does not use (ip9)
    chain.holds = { ip1: r0.product, ip9: "XX" };
    memRoom().labLoad = { ip1: [r0.product], ip9: ["XX"] }; memRoom().labLoadAuto = true;
    // the user switches the room to the wide strategy and replans
    Memory.settings.craft.labStrategy = "auto";
    const report = craftChainMod.replan("InPlaceRoom");
    assert(report.length === 1 && report[0].indexOf("1 etapa(s) pendente(s) trocada(s)") >= 0 && report[0].indexOf("PQRS") >= 0, "0116 replan: the pending step is rebuilt (got " + JSON.stringify(report) + ")");
    assert(chain.queue[0] === r0 && chain.queue[1] === r1 && chain.queue[2] !== r2, "0116 replan: running steps are left alone, only the pending one is replaced");
    let newFinal = chain.queue[2];
    assert(newFinal.outputs.length === 8 && newFinal.keep === false && newFinal.consumes.length === 0 && [newFinal.input1, newFinal.input2].sort().join() === "ip1,ip2" && !newFinal.started,
        "0116 replan: the pending step is now wide, on the centre pair, taking its inputs from storage");
    assert(r0.keep === false && r1.keep === false && memRoom().labReactions.every((r) => r.keep === undefined),
        "0116 replan: the running steps no longer pin their product (keep cleared on the steps and on their reactions)");
    assert(Object.keys(chain.holds).join() === "ip1" && Object.keys(memRoom().labLoad).join() === "ip1",
        "0116 replan: a hold on a lab the drain would take is released, one on an input lab of the wide step stays (holds " + Object.keys(chain.holds).join() + ")");
    assert(craftChainMod.replan("InPlaceRoom")[0].indexOf("1 etapa(s) pendente(s)") >= 0, "0116 replan: running it again is harmless");
    newFinal = chain.queue[2]; // the pending step is rebuilt (an equal, fresh object) on every run
    // the running wave finishes in its old layout; its products are still in their labs
    const finish = (item) => { byId[item.output].mineralType = item.product; byId[item.output].store = { [item.product]: item.target }; };
    finish(r0); finish(r1);
    Game.time += 1; craft.tick();
    assert(chain.qi === 2 && Object.keys(chain.holds).join() === "ip1", "0116 replan: the wave closes; only the input lab of the wide step stays protected (holds " + Object.keys(chain.holds).join() + ")");
    // The waves plan leaves the intermediates in the centre labs (1 and 2) - exactly the inputs
    // of the wide step - so the wide step uses them where they are, no round trip through storage.
    assert(r0.output === newFinal.input1 && r1.output === newFinal.input2, "0116 replan: the in-place intermediates already sit in the wide step's input labs");
    byId.ip5.mineralType = "Z"; byId.ip5.store = { Z: 5 }; // a stray mineral in one of the 8 output labs
    Game.time += 1; craft.tick();
    assert(!newFinal.started && !memRoom().labReaction, "0116 replan: the wide step waits while one of its output labs still holds a foreign mineral");
    byId.ip5.mineralType = null; byId.ip5.store = {}; // drained
    Game.time += 1; craft.tick();
    assert(newFinal.started && memRoom().labReaction && memRoom().labReaction.product === "PQRS" && memRoom().labReaction.outputs.length === 8,
        "0116 replan: once the output labs are clear the wide step runs on 8 labs");
    // a chain with nothing pending, and states other than buying/working, are reported and left alone
    const doneReport = craftChainMod.replan("InPlaceRoom");
    assert(doneReport.length === 1 && doneReport[0].indexOf("nenhuma etapa pendente") >= 0, "0116 replan: with every step started there is nothing pending (got " + JSON.stringify(doneReport) + ")");
    assert(typeof global.craftReplan === "function" && global.craftReplan("InPlaceRoom").indexOf("nenhuma etapa pendente") >= 0, "0116 replan: the console command craftReplan() returns the same report");
    REACTIONS.P = reactionsBackup.P; REACTIONS.R = reactionsBackup.R; REACTIONS.PQ = reactionsBackup.PQ;
    ["P", "R", "PQ"].forEach((k) => { if (reactionsBackup[k] === undefined) delete REACTIONS[k]; });
    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; Game.getObjectById = saved.getObj;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time; labSlots.resetCache(); marketPricing.resetCaches();
}
{
    // 0116: with the default strategy ("auto") a 10-lab room runs EVERY step wide, one after the other, through storage
    
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    const transientStock = require(path.join(PROJECT, "src/utils/transientStock"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, memRooms: Memory.rooms, flip: Memory.marketFlip,
        ops: Memory.terminalOps, getObj: Game.getObjectById };
    const reactionsBackup = { P: REACTIONS.P, R: REACTIONS.R, PQ: REACTIONS.PQ };
    REACTIONS.P = { Q: "PQ" }; REACTIONS.R = { S: "RS" }; REACTIONS.PQ = { RS: "PQRS" };
    Game.cpu.bucket = 10000;
    const quotes = { P: [10, 11], Q: [10, 11], R: [10, 11], S: [10, 11], PQRS: [300, 350], energy: [1, 1.1] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const mkLab = (slot) => ({ id: "ip" + slot, structureType: STRUCTURE_LAB, store: {}, mineralType: null, pos: { x: 10 + labSlots.OFFSETS[slot][1], y: 10 + labSlots.OFFSETS[slot][0] }, room: { name: "InPlaceRoom" } });
    const labs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(mkLab);
    const byId = {}; labs.forEach((l) => { byId[l.id] = l; });
    Game.getObjectById = (id) => byId[id] || null;
    const room = { name: "InPlaceRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => labs };
    const bought = [];
    let nextOp = 1;
    terminalOps.buy = (r, rt, qty) => { const id = "ib" + nextOp++; bought.push({ rt, qty, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = () => ({ ok: true, id: "is" + nextOp++ });
    Game.rooms = { InPlaceRoom: room };
    Game.creeps = { h1: { room: { name: "InPlaceRoom" }, memory: { role: "hauler" } } };
    Game.market = craftTestMarket(quotes, 1e8);
    Memory.settings = Object.assign({}, saved.settings, { craft: { test: false, maxCashAbsolute: 1e7 } });
    Memory.rooms = {}; Memory.craft = undefined;
    Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    labSlots.resetCache(); craft.resetScan(); craft.resetLog();
    const marketPricing = require(path.join(PROJECT, "src/utils/marketPricing")); marketPricing.resetCaches();
    Game.time += 1000; craft.tick();
    const chain = Memory.craft.active.InPlaceRoom;
    assert(chain && chain.product === "PQRS" && chain.queue.length === 3 && chain.queue.every((i) => i.kind === "lab"),
        "0111 P6: a two-level compound opens a three-step lab chain (got " + JSON.stringify(Memory.craft.candidates.map((c) => c.product)) + ")");
    const memRoom = () => Memory.rooms.InPlaceRoom;
    const wideItems = chain.queue;
    const wideCand = Memory.craft.candidates.find((c) => c.product === "PQRS");
    const wideB = wideCand.steps[0].batches;
    assert(wideCand.T === 3 * Math.ceil(wideB / 8) * 10 + 3 * 50,
        "0116: the planner's T for the wide strategy is three steps on 8 labs (T " + wideCand.T + ", expected " + (3 * Math.ceil(wideB / 8) * 10 + 150) + ")");
    assert(chain && chain.product === "PQRS" && wideItems.length === 3 && wideItems.every((i) => i.kind === "lab"),
        "0116: the wide strategy still opens a three-step lab chain");
    assert(wideItems.every((i) => i.keep === false && (i.consumes || []).length === 0 && i.outputs.length === 8),
        "0116: every step runs on 8 output labs and nothing is kept in place (outputs " + wideItems.map((i) => i.outputs.length).join() + ")");
    assert(wideItems.every((i) => [i.input1, i.input2].sort().join() === "ip1,ip2"), "0116: every step takes the centre labs (slots 1 and 2) as inputs");
    assert(new Set(wideItems.map((i) => i.wave)).size === 3 && wideItems.every((i, n) => i.wave === n),
        "0116: the steps run one after the other (a wave each)");
    wideItems.forEach((i) => { assert(i.outputs.indexOf(i.input1) < 0 && i.outputs.indexOf(i.input2) < 0, "0116: an input lab is never one of the step's own output labs"); });
    const spread = (item) => { const share = Math.ceil(item.target / item.outputs.length); item.outputs.forEach((id) => { byId[id].mineralType = item.product; byId[id].store = { [item.product]: share }; }); };
    const emptyOutputs = (item) => item.outputs.forEach((id) => { byId[id].mineralType = null; byId[id].store = {}; });
    bought.forEach((x) => { Memory.terminalOps.operations[x.id].state = "completed"; Memory.terminalOps.operations[x.id].dealtAmount = x.qty; });
    Game.time += 1; craft.tick(); // step 0 starts
    assert(memRoom().labReaction && !memRoom().labReactions && memRoom().labReaction.product === wideItems[0].product &&
        memRoom().labReaction.outputs.length === 8 && !memRoom().labReaction.keep,
        "0116: the first step runs alone on the 8 output labs (got " + JSON.stringify(memRoom().labReaction && { p: memRoom().labReaction.product, n: (memRoom().labReaction.outputs || []).length }) + ")");
    spread(wideItems[0]); // its product is spread over the output labs
    Game.time += 1; craft.tick();
    assert(chain.qi === 1 && !memRoom().labReaction && Object.keys(chain.holds).length === 0 && !memRoom().labLoad,
        "0116: a finished step leaves nothing held in place (qi " + chain.qi + ")");
    const ts = require(path.join(PROJECT, "src/utils/transientStock"));
    const lingering = byId[wideItems[0].outputs[3]];
    assert(ts.excess(lingering).map((e) => e.resourceType).join() === wideItems[0].product,
        "0116: the product left in the output labs is handed back to storage by the drain (it is not protected)");
    Game.time += 1; craft.tick();
    assert(!wideItems[1].started && !memRoom().labReaction && !memRoom().labReactions,
        "0116: the next step waits while the previous product is still in the output labs");
    emptyOutputs(wideItems[0]); // the hauler carried it to storage
    Game.time += 1; craft.tick();
    assert(wideItems[1].started && memRoom().labReaction && memRoom().labReaction.product === wideItems[1].product,
        "0116: once the labs are empty the next step starts, and receives the product like any reagent");
    spread(wideItems[1]);
    Game.time += 1; craft.tick();
    emptyOutputs(wideItems[1]);
    Game.time += 1; craft.tick(); // final step starts
    assert(memRoom().labReaction && memRoom().labReaction.product === "PQRS" && memRoom().labReaction.outputs.length === 8, "0116: the final step runs on the 8 output labs too");
    spread(wideItems[2]);
    Game.time += 1; craft.tick();
    assert(chain.state === "selling" && !memRoom().labReaction && chain.produced >= wideItems[2].target,
        "0116: the chain reaches selling after the last wide step (state " + chain.state + ")");
    REACTIONS.P = reactionsBackup.P; REACTIONS.R = reactionsBackup.R; REACTIONS.PQ = reactionsBackup.PQ;
    ["P", "R", "PQ"].forEach((k) => { if (reactionsBackup[k] === undefined) delete REACTIONS[k]; });
    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; Game.getObjectById = saved.getObj;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time; labSlots.resetCache(); marketPricing.resetCaches();
}

// --- ROADMAP 0111: credits spent vs delivery fee, flip-reserved stock, energy reserve ---
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, memRooms: Memory.rooms, flip: Memory.marketFlip, ops: Memory.terminalOps };
    Game.cpu.bucket = 10000;
    Game.time += 7000000; // real ticks never repeat: a tick no other block used, so census/roomCache start cold
    const quotes = { Z: [100, 110], energy: [1, 1.1], widgetA: [5000, 5400] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const factory = { id: "spf", structureType: STRUCTURE_FACTORY, store: { widgetA: 0 }, effects: [] };
    let buys = 0;
    terminalOps.buy = (r, rt, qty) => { buys++; const id = "sb" + buys; Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    const room = { name: "SpendRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => [factory] };
    const run = (settings, flipActive) => {
        buys = 0;
        Game.rooms = { SpendRoom: room };
        Game.creeps = { h1: { room: { name: "SpendRoom" }, memory: { role: "hauler" } } };
        Game.market = craftTestMarket(quotes, 1e6);
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: false }, settings || {}) });
        Memory.rooms = {}; Memory.craft = undefined;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: flipActive || {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
        craft.resetScan(); craft.resetLog();
        Game.time += 1000; craft.tick();
        return Memory.craft;
    };
    // all inputs owned: nothing is bought, so no credits leave - the energy delivery fee must not count against the credit caps
    room.storage.store = { energy: 500000, Z: 100000 };
    let mem = run({ maxCashAbsolute: 1 });
    const own = Memory.craft.active.SpendRoom;
    assert(own && own.est.spend === 0 && own.est.cash > 0 && Memory.marketFlip.committedCredits === 0,
        "0111: a chain made only of own inputs spends no credits - the delivery fee is energy, not a cap-relevant spend (got " + JSON.stringify(own && own.est) + " discards " + JSON.stringify(Memory.craft.discards) + " candidates " + JSON.stringify(Memory.craft.candidates.map((c) => [c.product, c.spend, c.cash])) + ")");
    assert(Object.keys(own.buys).length === 0 && own.state === "working", "0111: with nothing to buy the chain goes straight to production");
    // an active flip owns its material: it is not free stock for a craft
    room.storage.store = { energy: 500000, Z: 100000 };
    mem = run({ test: true }, { Z: { resourceType: "Z", room: "SpendRoom", state: "selling", quantity: 100000 } });
    const withoutZ = mem.candidates.find((c) => c.product === "widgetA");
    assert(withoutZ && withoutZ.buys.Z > 0 && !withoutZ.owns.Z, "0111: material reserved by an active flip is not used as own stock (got " + JSON.stringify(withoutZ && { buys: withoutZ.buys, owns: withoutZ.owns }) + ")");
    mem = run({ test: true }, { Z: { resourceType: "Z", room: "OtherRoom", state: "selling", quantity: 100000 } });
    const withZ = mem.candidates.find((c) => c.product === "widgetA");
    assert(withZ && withZ.owns.Z > 0 && !withZ.buys.Z, "0111: a flip in ANOTHER room does not touch this room's stock");
    // energy below the room's reserve floor is not usable as an input
    const energyOnly = (amount) => ({ energy: amount, Z: 100000, getCapacity: () => 1000000, getUsedCapacity: () => amount + 100000, getFreeCapacity: () => 1 });
    room.storage.store = energyOnly(10020); // reserve floor = 1% of 1,000,000 = 10,000 -> only 20 energy is free
    mem = run({ test: true });
    const lowEnergy = mem.candidates.find((c) => c.product === "widgetA");
    assert(lowEnergy && lowEnergy.owns.energy <= 20 && lowEnergy.buys.energy > 0, "0111: energy under the reserve floor is bought, not consumed from the reserve (got " + JSON.stringify(lowEnergy && { buys: lowEnergy.buys, owns: lowEnergy.owns }) + ")");
    room.storage.store = energyOnly(500000);
    mem = run({ test: true });
    const richEnergy = mem.candidates.find((c) => c.product === "widgetA");
    assert(richEnergy && richEnergy.owns.energy > 20 && !richEnergy.buys.energy, "0111: plenty of energy above the floor is used as own stock");
    // a candidate that cannot open says why in the log, once
    const lines = [];
    const origLog = console.log;
    console.log = (...a) => { lines.push(a.join(" ")); };
    room.storage.store = { energy: 500000, Z: 0 };
    run({}); // fresh scan state; then credits already committed elsewhere block the open
    Memory.marketFlip.committedCredits = 249000; Memory.craft.active = {};
    craft.resetScan(); Game.time += 1000; craft.tick();
    console.log = origLog;
    const notOpened = lines.filter((l) => /nao abriu/.test(l));
    assert(notOpened.length === 1 && /committed-cap/.test(notOpened[0]), "0111: a candidate blocked by a cap is logged once with the reason (got " + JSON.stringify(notOpened) + ")");

    terminalOps.buy = saved.buy; market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time;
}

// --- ROADMAP 0111: flip lock window, depth-shrunk lots, cap-sized lots, min profit ---
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const flipMod = require(path.join(PROJECT, "src/utils/marketFlip"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, memRooms: Memory.rooms, flip: Memory.marketFlip, ops: Memory.terminalOps };
    Game.cpu.bucket = 10000;
    Game.time += 9000000; // a tick no other block used: census/roomCache start cold
    const book = { Z: priceSamples(100, 110, 72, 1e9), energy: priceSamples(1, 1.1, 72, 1e9), widgetA: priceSamples(5000, 5400, 72, 1e9) };
    const liveAsk = {};
    market.samples = (rt) => book[rt] || [];
    market.snapshot = () => ({ resources: Object.keys(book).reduce((acc, rt) => { acc[rt] = { currentBuy: book[rt][0].buyPrice, currentSell: liveAsk[rt] || book[rt][0].sellPrice }; return acc; }, {}) });
    const factory = { id: "lotf", structureType: STRUCTURE_FACTORY, store: { widgetA: 0 }, effects: [] };
    const room = { name: "LotRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => [factory] };
    let opened;
    terminalOps.buy = (r, rt, qty) => { opened.push({ rt, qty }); const id = "lt" + opened.length; Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    const run = (settings, flipActive) => {
        opened = [];
        Game.rooms = { LotRoom: room };
        Game.creeps = { h1: { room: { name: "LotRoom" }, memory: { role: "hauler" } } };
        Game.market = craftTestMarket(Object.fromEntries(Object.keys(book).map((r) =>
            [r, [book[r][0].buyPrice, liveAsk[r] || book[r][0].sellPrice]])), 1e6);
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: true }, settings || {}) });
        Memory.rooms = {}; Memory.craft = undefined;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: flipActive || {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
        craft.resetScan(); craft.resetLog();
        Game.time += 1000; craft.tick();
        return Memory.craft;
    };
    const widget = (mem) => mem.candidates.find((c) => c.product === "widgetA");

    // flip lock: material of a flip is locked only briefly, then it is plain stock
    room.storage.store = { energy: 500000, Z: 100000 };
    const flipEntry = (extra) => ({ Z: Object.assign({ resourceType: "Z", room: "LotRoom", quantity: 100000 }, extra) });
    let c = widget(run({}, flipEntry({ state: "buying", openedTick: Game.time + 1000 - 10 })));
    assert(c && c.buys.Z > 0 && !c.owns.Z, "0111: a flip bought a few ticks ago still owns its material (got " + JSON.stringify(c && c.owns) + ")");
    c = widget(run({}, flipEntry({ state: "selling", openedTick: Game.time - 5000, sellStartTick: Game.time + 1000 - 10 })));
    assert(c && c.buys.Z > 0 && !c.owns.Z, "0111: a flip that only just started selling keeps its lock, however old the buy is");
    c = widget(run({}, flipEntry({ state: "selling", openedTick: Game.time - 5000, sellStartTick: Game.time - 500 })));
    assert(c && c.buys.Z > 0 && !c.owns.Z, "0124: an active flip retains its quantity after the old short lock window (got " + JSON.stringify(c && c.owns) + ")");
    c = widget(run({ flipLockTicks: 5000 }, flipEntry({ state: "selling", openedTick: Game.time - 5000, sellStartTick: Game.time - 500 })));
    assert(c && c.buys.Z > 0 && !c.owns.Z, "0111: craft.flipLockTicks sets the window");
    // the flip records when it starts selling
    {
        const flip = flipMod;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: { Z: { resourceType: "Z", room: "LotRoom", state: "buying", buyOpId: "fb1", sellOpId: null, quantity: 10, buyPrice: 10, sellPrice: 20, reservedCredits: 100, expectedNetProfit: 50, openedTick: Game.time } },
            lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: { fb1: { id: "fb1", state: "completed", dealtAmount: 10 } }, seenIncoming: {}, events: [], terminalBalance: {} };
        Memory.settings = Object.assign({}, saved.settings, { marketFlip: { test: true, scanInterval: 99999 } });
        terminalOps.sellLot = () => ({ ok: true, id: "fs1" });
        Game.time += 1; flip.tick();
        assert(Memory.marketFlip.active.Z && Memory.marketFlip.active.Z.state === "selling" && Memory.marketFlip.active.Z.sellStartTick === Game.time,
            "0111: the flip stamps sellStartTick when it starts selling (got " + JSON.stringify(Memory.marketFlip.active.Z) + ")");
    }

    // depth: an expensive ask with a thin book shrinks the lot instead of killing the product
    room.storage.store = { energy: 500000 };
    book.Z = priceSamples(100, 110, 72, 6000); // top ask level holds 6000: lots up to 3000 Z (qty 150) fit 2x depth
    liveAsk.Z = 115; // above the 7d median: the buy leg has to clear liquidity
    let mem = run({});
    c = widget(mem);
    assert(c && c.qty >= 1 && c.qty < 3000 && c.buys.Z <= 3000 && !mem.discards["no-plan:Z:liq-depth"],
        "0111: a thin ask book shrinks the lot until the input fits its depth (got qty " + (c && c.qty) + ", buys " + JSON.stringify(c && c.buys) + ", discards " + JSON.stringify(mem.discards) + ")");
    book.Z = priceSamples(100, 110, 72, 1);
    mem = run({});
    assert(!widget(mem) && Object.keys(mem.discards).some((k) => /liq-depth/.test(k)), "0111: when no lot size fits the book the product is discarded as liq-depth (got " + JSON.stringify(mem.discards) + ")");
    book.Z = priceSamples(100, 110, 72, 1e9); delete liveAsk.Z;

    // minimum profit: shrinking never produces trivial chains
    mem = run({ minProfit: 1e12 });
    assert(!widget(mem) && mem.discards["min-profit"] > 0, "0111: a chain below craft.minProfit is discarded (got " + JSON.stringify(mem.discards) + ")");

    // the absolute cap sizes the lot (it no longer lets an oversized chain through to be refused at open)
    mem = run({ maxCashAbsolute: 20000 });
    c = widget(mem);
    assert(c && c.spend <= 20000 && c.spend > 0 && c.qty < 3000, "0111: craft.maxCashAbsolute sizes the lot, so the candidate fits it (got spend " + (c && c.spend) + ", qty " + (c && c.qty) + ")");
    mem = run({ maxCashAbsolute: 20000, test: false });
    assert(opened.length === 1 && opened[0].rt === "Z" && Memory.craft.active.LotRoom && Memory.craft.active.LotRoom.est.spend <= 20000,
        "0111: a lot sized to the cap actually opens within it (got " + JSON.stringify(opened) + ")");

    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; market.samples = saved.samples; market.snapshot = saved.snapshot;
    Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time;
}

// --- ROADMAP 0111: a BUY stuck in awaitingReceipt after its goods left the terminal ---
{
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/terminalOps"))];
    const ops = require(path.join(PROJECT, "src/utils/terminalOps"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, ops: Memory.terminalOps, settings: Memory.settings, time: Game.time };
    Game.time += 11000000; // a tick no other block used
    const mkRoom = (terminalPower) => ({
        name: "OrphanRoom", controller: { my: true }, find: () => [],
        storage: { id: "ost", store: { power: 1500, energy: 100000, getFreeCapacity: () => 1e6, getUsedCapacity: () => 1e5, getCapacity: () => 1e6 } },
        terminal: { id: "otm", cooldown: 0, store: { power: terminalPower, energy: 50000, getFreeCapacity: () => 1e5, getUsedCapacity: () => 5e4, getCapacity: () => 3e5 } },
    });
    const freshOps = () => ({
        nextId: 10, seenIncoming: {}, events: [], terminalBalance: {},
        operations: { "terminal-1": { id: "terminal-1", kind: "buy", sourceRoom: "OrphanRoom", targetRoom: null, resourceType: "power", amount: 1500, remaining: 0, dealtAmount: 1500,
            state: "awaitingReceipt", createdTick: Game.time, updatedTick: Game.time, loadedAmount: 0, sentAmount: 0, receivedAmount: 0, transactionCost: 0, error: "terminal em cooldown" } },
    });
    const run = (room, ticks) => {
        Game.rooms = { OrphanRoom: room }; Game.creeps = {}; Game.market = { credits: 1e6, incomingTransactions: [] };
        Memory.settings = Object.assign({}, saved.settings, { terminalOps: Object.assign({}, saved.settings && saved.settings.terminalOps, { operationRetentionTicks: 10000 }) });
        Memory.terminalOps = freshOps();
        for (let i = 0; i < ticks; i++) { Game.time += 1; ops.tick(); }
        return Memory.terminalOps.operations["terminal-1"];
    };
    // goods already left the terminal (they are in storage) and no linked receipt exists: not stuck forever
    let op = run(mkRoom(0), 3);
    assert(op.state === "awaitingReceipt", "0111: a buy whose goods left the terminal waits out the confirmation window first (state " + op.state + ")");
    op = run(mkRoom(0), 40);
    assert(op.state === "completed" && /outro caminho/.test(op.error || ""), "0111: a buy whose goods already left the terminal completes instead of waiting forever (state " + op.state + ", error " + op.error + ")");
    // goods still sitting in the terminal: the normal receipt flow owns it, the buy must not be closed early
    op = run(mkRoom(1500), 40);
    assert(op.state === "completed" && op.receivedAmount === 1500, "0124: an existing buy completes with unused goods retained in terminal (state " + op.state + ")");
    assert(!Object.values(Memory.terminalOps.operations).some((o) => o.kind === "receipt" && o.resourceType === "power" && o.state !== "completed"), "0124: retained stock does not mint an unload receipt");
    // the window is configurable
    Game.rooms = { OrphanRoom: mkRoom(0) }; Game.creeps = {}; Game.market = { credits: 1e6, incomingTransactions: [] };
    Memory.settings = Object.assign({}, saved.settings, { terminalOps: { orphanBuyConfirmTicks: 3 } });
    Memory.terminalOps = freshOps();
    for (let i = 0; i < 6; i++) { Game.time += 1; ops.tick(); }
    assert(Memory.terminalOps.operations["terminal-1"].state === "completed", "0111: terminalOps.orphanBuyConfirmTicks sets the window");

    Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps; Memory.terminalOps = saved.ops; Memory.settings = saved.settings; Game.time = saved.time;
}

// --- ROADMAP 0111: the "no order covers the limit" line is not repeated every few ticks ---
{
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/terminalOps"))];
    const ops = require(path.join(PROJECT, "src/utils/terminalOps"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, ops: Memory.terminalOps, settings: Memory.settings, time: Game.time, snapshot: market.snapshot, log: console.log };
    Game.time += 12000000;
    market.snapshot = () => ({ resources: { power: { buyPrice: 10, sellPrice: 11, fairPrice: 10.5 }, energy: { fairPrice: 1 } } });
    const room = {
        name: "SpamRoom", controller: { my: true }, find: () => [],
        storage: { id: "sps", store: { power: 5000, energy: 1e5, getFreeCapacity: () => 1e6, getUsedCapacity: () => 1e5, getCapacity: () => 1e6 } },
        terminal: { id: "spt", cooldown: 0, store: { power: 100, energy: 5e4, getFreeCapacity: () => 1e5, getUsedCapacity: () => 5e4, getCapacity: () => 3e5 } },
    };
    Game.rooms = { SpamRoom: room }; Game.creeps = { h1: { room: { name: "SpamRoom" }, memory: { role: "hauler" }, store: { getUsedCapacity: () => 0 } } };
    Game.market = { credits: 1e6, incomingTransactions: [], calcTransactionCost: () => 1, getAllOrders: () => [{ id: "b1", resourceType: "power", type: "buy", price: 5, remainingAmount: 1000, roomName: "OtherRoom" }] };
    Memory.settings = Object.assign({}, saved.settings);
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const made = ops.sell("SpamRoom", "power", 100, 50, false, true); // nobody pays 50 (best bid is 5)
    const lines = [];
    console.log = (...a) => { lines.push(a.join(" ")); };
    for (let i = 0; i < 300; i++) { Game.time += 1; ops.tick(); }
    console.log = saved.log;
    const noOrder = lines.filter((l) => l.indexOf(made.id) >= 0 && /nenhuma ordem cobre o limite/.test(l));
    const kept = Memory.terminalOps.operations[made.id].noCandidate;
    assert(kept && /nenhuma ordem cobre o limite/.test(kept.reason) && kept.limit === 50 && kept.best && kept.best.price === 5 && kept.best.room === "OtherRoom" && typeof kept.best.effective === "number",
        "0111: the last 'no order covers the limit' reason is kept on the operation itself (got " + JSON.stringify(kept) + ")");
    const shown = JSON.parse(global.terminalOperation(made.id));
    assert(shown.id === made.id && shown.noCandidate && shown.noCandidate.best.price === 5, "0111: terminalOperation(id) shows one operation with its noCandidate reason");
    assert(/desconhecida/.test(global.terminalOperation("terminal-does-not-exist")), "0111: terminalOperation() on an unknown id says so instead of throwing");
    // the stored reason follows the market even though the log line stays silent
    const bookBefore = Game.market.getAllOrders;
    Game.market.getAllOrders = () => [{ id: "b1", resourceType: "power", type: "buy", price: 7, remainingAmount: 1000, roomName: "OtherRoom" }];
    const logsBefore = lines.length;
    console.log = (...a) => { lines.push(a.join(" ")); };
    for (let i = 0; i < 100; i++) { Game.time += 1; ops.tick(); }
    console.log = saved.log;
    assert(Memory.terminalOps.operations[made.id].noCandidate.best.price === 7 && lines.length === logsBefore,
        "0111: the stored reason is refreshed as the book moves (price 5 -> " + Memory.terminalOps.operations[made.id].noCandidate.best.price + ") without printing again");
    Game.market.getAllOrders = bookBefore;
    assert(made.ok && noOrder.length >= 1 && noOrder.length <= 1, "0111: a sell nobody covers logs its 'no order covers the limit' line once, not every few ticks (got " + noOrder.length + " in 300 ticks)");
    Game.time += 5000;
    console.log = (...a) => { lines.push(a.join(" ")); };
    const before = lines.filter((l) => l.indexOf(made.id) >= 0 && /nenhuma ordem cobre o limite/.test(l)).length;
    for (let i = 0; i < 60; i++) { Game.time += 1; ops.tick(); }
    console.log = saved.log;
    const after = lines.filter((l) => l.indexOf(made.id) >= 0 && /nenhuma ordem cobre o limite/.test(l)).length;
    assert(after === before, "0111: by default the line is never repeated for the same operation, however long it waits (" + before + " -> " + after + ")");
    Memory.settings = Object.assign({}, saved.settings, { terminalOps: { noCandidateLogTicks: 600 } });
    Game.time += 700;
    console.log = (...a) => { lines.push(a.join(" ")); };
    for (let i = 0; i < 60; i++) { Game.time += 1; ops.tick(); }
    console.log = saved.log;
    const repeated = lines.filter((l) => l.indexOf(made.id) >= 0 && /nenhuma ordem cobre o limite/.test(l)).length;
    assert(repeated === after + 1, "0111: terminalOps.noCandidateLogTicks > 0 repeats the line once per window (" + after + " -> " + repeated + ")");
    Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps; Memory.terminalOps = saved.ops; Memory.settings = saved.settings; Game.time = saved.time; market.snapshot = saved.snapshot;
}

// --- ROADMAP 0111: the planner's CPU bucket gate (default 500) ---------------
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, memRooms: Memory.rooms, flip: Memory.marketFlip };
    Game.time += 13000000;
    market.samples = () => []; market.snapshot = () => ({ resources: {} });
    Game.rooms = {}; Game.creeps = {}; Game.market = { credits: 1e6 };
    Memory.rooms = {}; Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: {} };
    const scansAt = (bucket, settings) => {
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: true }, settings || {}) });
        Memory.craft = undefined; Game.cpu.bucket = bucket;
        craft.resetScan(); Game.time += 1000; craft.tick();
        return !!(Memory.craft && Memory.craft.lastScanTick);
    };
    assert(scansAt(499) === false, "0111: below craft.minBucket (default 500) the planner does not scan");
    assert(scansAt(500) === true && scansAt(1767) === true, "0111: at or above 500 - e.g. the 1767 after a pixel - the planner scans");
    assert(scansAt(1767, { minBucket: 3000 }) === false && scansAt(1767, { minBucket: 1000 }) === true, "0111: craft.minBucket overrides the default");
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Game.cpu.bucket = saved.bucket; Game.time = saved.time;
}

// --- ROADMAP 0111: craftConfig() and the maxCashAbsolute default --------------
{
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/craftPlanner"))];
    require(path.join(PROJECT, "src/utils/craftPlanner"));
    const configMod = require(path.join(PROJECT, "src/utils/config"));
    const saved = Memory.settings;
    Memory.settings = Object.assign({}, saved, { craft: undefined });
    assert(configMod.get("craft.maxCashAbsolute") === 1000000, "0111: the default craft.maxCashAbsolute is 1000000 (got " + configMod.get("craft.maxCashAbsolute") + ")");
    assert(JSON.parse(global.craftConfig()) && Object.keys(JSON.parse(global.craftConfig())).length === 0, "0111: craftConfig() lists nothing when no craft.* setting is overridden");
    Memory.settings = Object.assign({}, saved, { craft: { maxCashAbsolute: 20000, minSamples: 30, brandNew: 7 } });
    const shown = JSON.parse(global.craftConfig());
    assert(shown.maxCashAbsolute.value === 20000 && shown.maxCashAbsolute.default === 1000000 && shown.maxCashAbsolute.overridden === true && shown.minSamples.value === 30 && shown.minSamples.default === 48,
        "0111: craftConfig() shows each override against its default (got " + JSON.stringify(shown.maxCashAbsolute) + ")");
    assert(Object.keys(shown).sort().join() === "brandNew,maxCashAbsolute,minSamples" && !("minBucket" in shown), "0111: craftConfig() lists only overrides, including keys that have no default");
    const full = JSON.parse(global.craftConfig(true));
    assert(full.minBucket.value === 500 && full.minBucket.overridden === false && full.maxCashAbsolute.overridden === true && Object.keys(full).length > 10,
        "0111: craftConfig(true) lists every craft.* value with its source");
    Memory.settings = saved;
}

// --- ROADMAP 0111: craftScan() forces a scan without waiting for the interval ---
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, memRooms: Memory.rooms, flip: Memory.marketFlip, log: console.log };
    Game.time += 14000000;
    market.samples = () => []; market.snapshot = () => ({ resources: {} });
    Game.rooms = {}; Game.creeps = {}; Game.market = { credits: 1e6 };
    Memory.rooms = {}; Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: {} };
    Memory.settings = Object.assign({}, saved.settings, { craft: { test: true, log: false } });
    Memory.craft = undefined; Game.cpu.bucket = 5000;
    craft.resetScan(); craft.tick();
    const first = Memory.craft.lastScanTick;
    Game.time += 5; craft.tick();
    assert(Memory.craft.lastScanTick === first, "0111: without a force, a second tick inside craft.scanInterval does not scan again");
    const said = [];
    console.log = (...a) => { said.push(a.join(" ")); };
    const answer = global.craftScan();
    console.log = saved.log;
    assert(/próximo tick/.test(answer) && said.some((l) => /\[craft\]/.test(l)), "0111: craftScan() says the scan was forced (got " + answer + ")");
    Game.time += 1; craft.tick();
    assert(Memory.craft.lastScanTick === Game.time && Memory.craft.lastScanTick > first && Memory.craft.rescanAt === undefined,
        "0111: craftScan() makes the very next tick scan, inside the interval (scan at " + Memory.craft.lastScanTick + ", previous " + first + ")");
    // the bucket gate still applies, and craftScan() warns about it
    Game.cpu.bucket = 100;
    console.log = () => {};
    const warned = global.craftScan();
    console.log = saved.log;
    assert(/abaixo de craft.minBucket/.test(warned), "0111: craftScan() warns when the CPU bucket is below craft.minBucket (got " + warned + ")");
    const before = Memory.craft.lastScanTick;
    Game.time += 1; craft.tick();
    assert(Memory.craft.lastScanTick === before, "0111: a forced scan is still skipped while the bucket is below craft.minBucket");
    Game.cpu.bucket = 5000; Game.time += 1; craft.tick();
    assert(Memory.craft.lastScanTick === Game.time, "0111: and it runs as soon as the bucket recovers");
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Game.cpu.bucket = saved.bucket; Game.time = saved.time;
}

// --- ROADMAP 0111: buy-side guards are only existence + depth; sell side keeps spread/volatility ---
{
    const pricing = pricingModule();
    const market = require(path.join(PROJECT, "src/utils/market"));
    const oldSamples = market.samples, oldSettings = Memory.settings;
    Memory.settings = Object.assign({}, oldSettings);
    const book = {};
    market.samples = (rt) => book[rt] || [];
    // a wild, wide-spread ask book: asks swing 80/140 (sigma ~27%), bids sit at 50 (spread ~2.2 on the median ask)
    const wild = Array.from({ length: 72 }, (_, i) => ({ tick: i * 3600, buyPrice: 50, buyVolume: 1e9, sellPrice: i % 2 ? 140 : 80, sellVolume: 1e9 }));
    book.IN = wild;
    assert(pricing.buyLeg("IN", 140, 100).ok === true, "0111: an expensive ask in a volatile, wide-spread book still passes the buy leg - the cost is fixed at purchase (got " + JSON.stringify(pricing.buyLeg("IN", 140, 100)) + ")");
    assert(pricing.liquidity("IN", 100, "sell").ok === false, "0111: the same wide spread blocks the SELL side (the sell leg keeps its spread guard)");
    // what the buy leg DOES still require
    book.IN = wild.slice(0, 10);
    assert(pricing.buyLeg("IN", 140, 100).reason === "warming", "0111: a buy still needs enough samples");
    book.IN = wild.map((r) => Object.assign({}, r, { sellVolume: 100 }));
    assert(pricing.buyLeg("IN", 140, 100).reason === "depth", "0111: a buy still needs the ask book to hold the lot (depth)");
    book.IN = wild.map((r, i) => (i % 3 ? r : Object.assign({}, r, { sellPrice: null })));
    assert(pricing.buyLeg("IN", 140, 100).reason === "presence", "0111: a buy still needs the book to be present");
    // input volatility no longer inflates the margin; the product's own sigma still does
    book.IN = wild; book.OUT = priceSamples(1000, 1100, 72, 1e9); book.energy = priceSamples(1, 1.1, 72, 1e9);
    const mk = () => ({ instant: (rt) => ({ bid: book[rt][0].buyPrice, ask: rt === "IN" ? 140 : book[rt][0].sellPrice }), stock: () => 0, canMake: () => true });
    COMMODITIES.guardWidget = { level: 0, amount: 1, cooldown: 100, components: { IN: 10 } };
    pricing.resetCaches();
    book.guardWidget = priceSamples(1000, 1100, 72, 1e9);
    const calm = pricing.evaluate("guardWidget", 10, Object.assign(mk(), { instant: (rt) => ({ bid: book[rt][0].buyPrice, ask: rt === "IN" ? 140 : book[rt][0].sellPrice }) }));
    assert(calm.plan && calm.sigma === 0 && Math.abs(calm.margin - pricing.requiredMargin(0, calm.T)) < 1e-12,
        "0111: volatile INPUTS add nothing to the margin sigma (got sigma " + (calm && calm.sigma) + ")");
    book.guardWidget = priceSamples(1000, 1100, 72, 1e9).map((r, i) => Object.assign({}, r, { buyPrice: i % 2 ? 800 : 1200 }));
    const risky = pricing.evaluate("guardWidget", 10, mk());
    assert(risky.sigma > 0.15 && risky.margin > calm.margin, "0111: a volatile PRODUCT still raises the margin (sigma " + (risky.sigma && risky.sigma.toFixed(2)) + ")");
    // sell-side volatility: 20% passes under the new 30% default, blocks under the old 15%
    book.W = priceSamples(100, 110).map((r, i) => Object.assign({}, r, { buyPrice: i % 2 ? 80 : 120 }));
    assert(pricing.liquidity("W", 100, "sell").ok === true, "0111: ~20% bid volatility now passes the sell side (default maxSigma 0.30)");
    Memory.settings = Object.assign({}, oldSettings, { craft: { maxSigma: 0.15 } });
    assert(pricing.liquidity("W", 100, "sell").reason === "volatility", "0111: craft.maxSigma can bring the old 15% limit back");
    Memory.settings = Object.assign({}, oldSettings, { craft: { maxSpread: 1.3 } });
    book.W = priceSamples(100, 150);
    assert(pricing.liquidity("W", 100, "sell").reason === "spread", "0111: craft.maxSpread can bring the old 1.30 limit back");
    delete COMMODITIES.guardWidget;
    market.samples = oldSamples; Memory.settings = oldSettings; pricing.resetCaches();
}

// --- ROADMAP 0111: a running chain's feed jobs outrank the mineral container / energy -----
{
    Game.time += 15000000; // a tick no other block used: the hauler's per-tick caches start cold
    const savedCraft = Memory.craft, savedRooms = Memory.rooms;
    const cfMineral = Object.assign(new RoomObject(), { id: "cfMineral", mineralType: "O", mineralAmount: 3000, pos: new RoomPosition(10, 10, "ChainFeedRoom") });
    const cfContainer = Object.assign(new StructureContainer(), { id: "cfContainer", structureType: STRUCTURE_CONTAINER, pos: new RoomPosition(10, 10, "ChainFeedRoom"), store: mineralStore({ O: 50 }, 1950) });
    cfMineral.pos.findInRange = (type, range, opts) => {
        let list = type === FIND_STRUCTURES ? [cfContainer] : [];
        if (opts && typeof opts.filter === "function") list = list.filter(opts.filter);
        return list;
    };
    const cfFactory = { id: "cfFactory", structureType: STRUCTURE_FACTORY, store: mineralStore({ energy: 600 }, 49400), pos: new RoomPosition(20, 20, "ChainFeedRoom") };
    const cfStorage = { id: "cfStorage", store: mineralStore({ Z: 1500, energy: 40000 }, 900000) };
    const cfRoom = { name: "ChainFeedRoom", storage: cfStorage, terminal: null, find: (type) => (type === FIND_MINERALS ? [cfMineral] : (type === FIND_STRUCTURES ? [cfFactory, cfContainer] : (type === FIND_MY_STRUCTURES ? [cfFactory] : []))) };
    Memory.rooms = Object.assign({}, savedRooms, { ChainFeedRoom: { factoryProduct: "widgetA", factoryProductAuto: true, factoryEnergy: 600 } }); // as craftChain writes it
    const pick = () => { Game.time++; return hauler.pickMineralJob(cfRoom); };
    // no chain: the old order, mineral container first
    Memory.craft = { active: {} };
    let job = pick();
    assert(job && job.kind === "mineralContainer" && !job.chain, "0111: without a running chain the mineral container still comes first (got " + (job && job.kind) + ")");
    assert(hauler.pickChainFeedJob(cfRoom) === null, "0111: pickChainFeedJob() is null when no chain runs in the room");
    // a chain runs in this room: the factory's missing input (Z in storage) is delivered first
    Memory.craft = { active: { ChainFeedRoom: { product: "widgetA", state: "working" } } };
    job = pick();
    assert(job && job.kind === "factoryComponent" && job.resourceType === "Z" && job.to === cfFactory && job.from === cfStorage && job.chain === true,
        "0111: while a chain runs, delivering its input to the factory beats draining the mineral container (got " + JSON.stringify(job && { k: job.kind, r: job.resourceType, chain: job.chain }) + ")");
    // another room's chain does not change this room
    Memory.craft = { active: { SomewhereElse: { product: "widgetA", state: "working" } } };
    job = pick();
    assert(job && job.kind === "mineralContainer", "0111: a chain in ANOTHER room does not reorder this room's jobs");
    // input already there: nothing left to feed, so the chain does not block the rest of the cascade
    Memory.craft = { active: { ChainFeedRoom: { product: "widgetA", state: "working" } } };
    cfFactory.store = mineralStore({ energy: 600, Z: 20 }, 49380);
    job = pick();
    assert(job && job.kind === "mineralContainer", "0111: once the chain's inputs are in place, normal jobs resume (got " + (job && job.kind) + ")");
    // the finished product is picked up ahead of everything else too
    cfFactory.store = mineralStore({ energy: 600, Z: 20, widgetA: 40 }, 49340);
    job = pick();
    assert(job && job.kind === "factoryOutput" && job.resourceType === "widgetA" && job.chain === true, "0111: a running chain's product is collected before other mineral work (got " + (job && job.kind) + ")");
    // leftovers in the factory are drained promptly while the chain runs (the end-of-chain flags are already cleared)
    Memory.rooms.ChainFeedRoom = {};
    cfFactory.store = mineralStore({ energy: 600, widgetA: 40 }, 49360);
    job = pick();
    assert(job && job.kind === "transientDrain" && job.chain === true, "0111: with the chain's flags cleared, what is left in the factory is drained first, not last (got " + (job && job.kind) + ")");
    Memory.craft = savedCraft; Memory.rooms = savedRooms;
}


// --- ROADMAP 0111: several haulers may do non-energy work at once ------------------------
{
    const nel = require(path.join(PROJECT, "src/utils/nonEnergyLogistics"));
    const savedCreeps = Game.creeps, savedSettings = Memory.settings, savedTime = Game.time;
    Game.time += 16000000;
    const mk = (name, extra) => ({ name, room: { name: "NelRoom" }, memory: Object.assign({ role: "hauler" }, extra || {}), store: { getUsedCapacity: () => 0 } });
    const a = mk("nelA", { mineralJob: { kind: "mineralContainer", resourceType: "O" } }), b = mk("nelB"), c = mk("nelC");
    const nelRoom = { name: "NelRoom" };
    Game.creeps = { nelA: a, nelB: b, nelC: c };
    Memory.settings = Object.assign({}, savedSettings);
    assert(nel.claim(b) === true && nel.claim(c) === true && nel.isOwner(b) === true,
        "0111: a hauler may take non-energy work while another already holds a job - there is no exclusive owner any more");
    assert(nel.keepsEnergyHauler(nelRoom) === true, "0111: with 1 of 3 haulers on non-energy work, the tiers that outrank energy may still take another");
    b.memory.mineralJob = { kind: "labReagent", resourceType: "H" };
    assert(nel.keepsEnergyHauler(nelRoom) === false, "0111: with 2 of 3 haulers busy the last one is kept on energy (the pressured/chain tiers stand down)");
    delete a.memory.mineralJob; delete b.memory.mineralJob;
    Game.creeps = { nelA: a };
    Game.time++; // census rebuilds its per-room lists once per tick
    assert(nel.keepsEnergyHauler(nelRoom) === false, "0111: a room's only hauler is never pulled off energy by those tiers");
    // a hard cap can still be asked for
    a.memory.mineralJob = { kind: "mineralContainer", resourceType: "O" };
    Game.creeps = { nelA: a, nelB: b, nelC: c };
    Game.time++;
    Memory.settings = Object.assign({}, savedSettings, { mineralHauler: { maxConcurrent: 1 } });
    assert(nel.claim(b) === false, "0111: mineralHauler.maxConcurrent > 0 restores a hard cap");
    Game.creeps = savedCreeps; Memory.settings = savedSettings; Game.time = savedTime;
}
{
    // two different reagents feed two labs in parallel, never the same one twice
    Game.time += 17000000;
    const savedRooms = Memory.rooms, savedCreeps = Game.creeps, savedGet = Game.getObjectById;
    const labs = {
        ftLab1: { id: "ftLab1", structureType: STRUCTURE_LAB, store: mineralStore({}, 3000), pos: new RoomPosition(11, 11, "FeedTakenRoom") },
        ftLab2: { id: "ftLab2", structureType: STRUCTURE_LAB, store: mineralStore({}, 3000), pos: new RoomPosition(12, 11, "FeedTakenRoom") },
        ftLab3: { id: "ftLab3", structureType: STRUCTURE_LAB, store: mineralStore({}, 3000), pos: new RoomPosition(11, 12, "FeedTakenRoom") },
    };
    Game.getObjectById = (id) => labs[id] || savedGet.call(Game, id);
    const ftRoom = { name: "FeedTakenRoom", storage: { id: "ftStorage", store: mineralStore({ H: 5000, O: 5000 }, 900000) }, terminal: null, find: () => [] };
    Memory.rooms = Object.assign({}, savedRooms, { FeedTakenRoom: { labReaction: { a: "H", b: "O", product: "OH", output: "ftLab3", input1: "ftLab1", input2: "ftLab2" } } });
    const hauler1 = { name: "ftH1", room: { name: "FeedTakenRoom" }, memory: { role: "hauler" }, store: { getUsedCapacity: () => 0 } };
    const hauler2 = { name: "ftH2", room: { name: "FeedTakenRoom" }, memory: { role: "hauler" }, store: { getUsedCapacity: () => 0 } };
    Game.creeps = { ftH1: hauler1, ftH2: hauler2 };
    const pick = () => { Game.time++; return hauler.pickMineralJob(ftRoom); };
    const first = pick();
    assert(first && first.kind === "labReagent" && first.resourceType === "H" && first.to === labs.ftLab1, "0111: the first idle hauler gets the first reagent (got " + JSON.stringify(first && { k: first.kind, r: first.resourceType }) + ")");
    hauler1.memory.mineralJob = { kind: "labReagent", resourceType: "H", fromId: "ftStorage", toId: "ftLab1", loaded: false };
    const second = pick();
    assert(second && second.kind === "labReagent" && second.resourceType === "O" && second.to === labs.ftLab2,
        "0111: the next idle hauler takes the OTHER reagent instead of duplicating the first (got " + JSON.stringify(second && { k: second.kind, r: second.resourceType }) + ")");
    hauler2.memory.mineralJob = { kind: "labReagent", resourceType: "O", fromId: "ftStorage", toId: "ftLab2", loaded: false };
    assert(pick() === null, "0111: with both reagents already being carried there is nothing left to hand out");
    delete hauler1.memory.mineralJob;
    const again = pick();
    assert(again && again.resourceType === "H", "0111: the job comes back once the hauler that held it is done");
    Memory.rooms = savedRooms; Game.creeps = savedCreeps; Game.getObjectById = savedGet;
}

// --- ROADMAP 0111: one chain per structure KIND per room - factory and labs side by side ---
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const chainMod = require(path.join(PROJECT, "src/utils/craftChain"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, cancel: terminalOps.cancel, memRooms: Memory.rooms,
        flip: Memory.marketFlip, ops: Memory.terminalOps, getObj: Game.getObjectById };
    Game.cpu.bucket = 10000;
    Game.time += 18000000;
    const quotes = { Z: [100, 110], H: [10, 11], O: [10, 11], energy: [1, 1.1], widgetA: [5000, 5400], OH: [60, 70] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const factory = { id: "pf1", structureType: STRUCTURE_FACTORY, store: { widgetA: 0 }, effects: [] };
    const mkLab = (slot) => ({ id: "pl" + slot, structureType: STRUCTURE_LAB, store: { OH: 0 }, mineralType: null, pos: { x: 10 + labSlots.OFFSETS[slot][1], y: 10 + labSlots.OFFSETS[slot][0] } });
    const labs = [mkLab(1), mkLab(2), mkLab(3)];
    const byId = {}; labs.forEach((l) => { byId[l.id] = l; });
    Game.getObjectById = (id) => byId[id] || null;
    const room = { name: "ParRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => [factory].concat(labs) };
    let calls, nextOp;
    terminalOps.buy = (r, rt, qty, limit) => { const id = "pb" + nextOp++; calls.buy.push({ rt, qty, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = () => ({ ok: true, id: "ps" + nextOp++ });
    terminalOps.cancel = (id) => { calls.cancel.push(id); if (Memory.terminalOps.operations[id]) Memory.terminalOps.operations[id].state = "cancelled"; return { ok: true }; };
    const reset = (settings) => {
        calls = { buy: [], cancel: [] }; nextOp = 1;
        Game.rooms = { ParRoom: room };
        Game.creeps = { h1: { room: { name: "ParRoom" }, memory: { role: "hauler" } } };
        Game.market = { credits: 1e8, calcTransactionCost: () => 0,
            getAllOrders: () => Object.keys(quotes).map((rt) => ({ id: "limit-" + rt, type: ORDER_SELL, resourceType: rt,
                price: quotes[rt][1], amount: 1e9, roomName: "QuoteRoom" })) };
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: false }, settings || {}) });
        Memory.rooms = {}; Memory.craft = undefined;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
        factory.store = { widgetA: 0 }; room.storage.store = { energy: 500000 };
        labs.forEach((l) => { l.store = { OH: 0 }; l.mineralType = null; });
        labSlots.resetCache(); craft.resetScan(); craft.resetLog();
    };
    const run = (settings) => { reset(settings); Game.time += 1000; craft.tick(); return Memory.craft; };
    const step = (n) => { for (let i = 0; i < (n || 1); i++) { Game.time += 1; craft.tick(); } };
    const completeBuys = () => calls.buy.forEach((b) => { const op = Memory.terminalOps.operations[b.id]; op.state = "completed"; op.dealtAmount = b.qty; room.storage.store[b.rt] = b.qty; });

    // default: no global cap - the room's factory AND its labs each get a chain in the same scan
    let mem = run();
    const keys = Object.keys(mem.active);
    const byKind = (kind) => keys.map((k) => mem.active[k]).find((c) => c.kinds.join() === kind);
    assert(keys.length === 2 && byKind("factory") && byKind("lab") && byKind("factory").room === "ParRoom" && byKind("lab").room === "ParRoom",
        "0111: one room runs a factory chain and a lab chain at the same time (got " + JSON.stringify(keys.map((k) => [k, mem.active[k].kinds, mem.active[k].product])) + ")");
    assert(new Set(keys).size === 2 && keys.indexOf("ParRoom") >= 0 && keys.some((k) => /^ParRoom:/.test(k)) && keys.every((k) => mem.active[k].key === k),
        "0111: the first chain of a room keeps the room name as its key, the second gets the kind appended");
    assert(calls.buy.some((b) => b.rt === "Z") && calls.buy.some((b) => b.rt === "H") && calls.buy.some((b) => b.rt === "O"), "0111: each chain buys its own inputs");
    assert(Memory.marketFlip.committedCredits > 0, "0111: both chains reserve credits in the shared budget");
    // the same kind never runs twice in a room, however many scans pass
    const buysAfterOpen = calls.buy.length;
    craft.resetScan(); Game.time += 400; craft.tick();
    craft.resetScan(); Game.time += 400; craft.tick();
    assert(calls.buy.length === buysAfterOpen && Object.keys(Memory.craft.active).length === 2, "0111: a structure kind that already runs a chain is not given a second one");
    // flags are per structure: finishing the factory step must not touch the lab reaction
    completeBuys();
    step(2);
    const mr = () => Memory.rooms.ParRoom;
    const fchain = byKind("factory"), lchain = byKind("lab");
    assert(mr().factoryProduct === "widgetA" && mr().factoryProductAuto === true && mr().labReaction && mr().labReaction.product === "OH" && mr().labReactionAuto === true,
        "0111: the factory and the labs are configured side by side (got " + JSON.stringify({ f: mr().factoryProduct, l: mr().labReaction && mr().labReaction.product }) + ")");
    assert(mr().directToTerminal === undefined, "0111: chains no longer ask for the terminal shortcut, so two chains in one room share no single-valued flag");
    factory.store.widgetA = fchain.queue[0].target;
    step();
    assert(fchain.state === "selling" && !mr().factoryProduct && !mr().factoryProductAuto && !mr().factoryEnergy,
        "0111: finishing the factory step clears the factory's flags...");
    assert(mr().labReaction && mr().labReaction.product === "OH" && mr().labReactionAuto === true && lchain.state === "working",
        "0111: ...and leaves the lab chain's reaction exactly as it was (got " + JSON.stringify(mr().labReaction) + ")");
    // aborting one chain frees only its own structure
    chainMod.cancelRoom("ParRoom");
    assert(Object.keys(Memory.craft.active).length === 0 && !mr().labReaction && Memory.marketFlip.committedCredits === 0,
        "0111: craftCancel(room) aborts every chain of the room and frees all their credits");
    // a manual pin blocks only its own structure kind
    reset(); Memory.rooms = { ParRoom: { factoryProduct: "widgetA" } }; Game.time += 1000; craft.tick();
    mem = Memory.craft;
    assert(Object.keys(mem.active).length === 1 && Object.keys(mem.active).map((k) => mem.active[k].kinds.join())[0] === "lab" && Memory.rooms.ParRoom.factoryProductAuto === undefined,
        "0111: a manual factory pin leaves the labs free to run a chain and stays untouched");
    // only the factory is busy (the labs are pinned by hand, so no lab chain exists): a second chain for the SAME
    // structure kind must not open, scan after scan - the room is not skipped, the per-kind rule has to hold it
    reset(); Memory.rooms = { ParRoom: { labReaction: { a: "H", b: "O", product: "OH", output: "pl3", input1: "pl1", input2: "pl2" } } };
    Game.time += 1000; craft.tick();
    mem = Memory.craft;
    assert(Object.keys(mem.active).length === 1 && mem.active.ParRoom && mem.active.ParRoom.kinds.join() === "factory", "0111: with the labs pinned, only a factory chain opens");
    const buysSoFar = calls.buy.length;
    craft.resetScan(); Game.time += 400; craft.tick();
    craft.resetScan(); Game.time += 400; craft.tick();
    assert(calls.buy.length === buysSoFar && Object.keys(Memory.craft.active).length === 1,
        "0111: a second chain for the SAME structure kind never opens while the first runs, even though the room still has the other kind free (buys " + buysSoFar + " -> " + calls.buy.length + ")");
    // the optional global cap still works when asked for
    mem = run({ maxActive: 1 });
    assert(Object.keys(mem.active).length === 1, "0111: craft.maxActive > 0 still caps the number of chains in total (got " + Object.keys(mem.active).length + ")");
    // a chain stored before kinds/key existed is still understood (derived from its queue)
    reset();
    room.storage.store = { energy: 500000, widgetA: 10 };
    // as the previous version stored it: no `key`, no `kinds`; waiting for a bid above its floor
    Memory.craft = { active: { ParRoom: { id: "old", room: "ParRoom", product: "widgetA", qty: 10, produced: 10, state: "selling", stateTick: Game.time, sellStart: Game.time,
        queue: [{ kind: "factory", product: "widgetA", started: true, base: 0, target: 10 }], qi: 1, buys: {}, est: { spend: 0, cash: 0, cost: 0, revenue: 0, profit: 0, floor: 1e9 }, holds: {}, reserved: 0 } } };
    assert(chainMod.busyKinds("ParRoom").factory === true && chainMod.busyKinds("ParRoom").lab === false && chainMod.kindsOf(Memory.craft.active.ParRoom).join() === "factory",
        "0111: a chain saved by the previous version still counts as occupying its structure");
    Game.time += 1000; craft.tick();
    assert(Object.keys(Memory.craft.active).some((k) => Memory.craft.active[k].kinds && Memory.craft.active[k].kinds.join() === "lab"),
        "0111: the labs of a room whose factory runs an old-format chain still get their own chain");

    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; terminalOps.cancel = saved.cancel; Game.getObjectById = saved.getObj;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time; labSlots.resetCache();
}

// --- ROADMAP 0111: a BUY parked in "waiting" keeps its stored reason current (and stays quiet) ---
{
    delete require.cache[require.resolve(path.join(PROJECT, "src/utils/terminalOps"))];
    const ops = require(path.join(PROJECT, "src/utils/terminalOps"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, ops: Memory.terminalOps, settings: Memory.settings, time: Game.time, snapshot: market.snapshot, log: console.log };
    Game.time += 19000000;
    market.snapshot = () => ({ resources: { power: { buyPrice: 10, sellPrice: 11, fairPrice: 10.5 }, energy: { fairPrice: 1 } } });
    const room = {
        name: "WaitRoom", controller: { my: true }, find: () => [],
        storage: { id: "wst", store: { power: 0, energy: 1e5, getFreeCapacity: () => 1e6, getUsedCapacity: () => 1e5, getCapacity: () => 1e6 } },
        terminal: { id: "wtm", cooldown: 0, store: { power: 0, energy: 5e4, getFreeCapacity: () => 1e5, getUsedCapacity: () => 5e4, getCapacity: () => 3e5 } },
    };
    let askPrice = 20;
    Game.rooms = { WaitRoom: room }; Game.creeps = { h1: { room: { name: "WaitRoom" }, memory: { role: "hauler" }, store: { getUsedCapacity: () => 0 } } };
    Game.market = { credits: 1e6, incomingTransactions: [], calcTransactionCost: () => 1, getAllOrders: () => [{ id: "a1", resourceType: "power", type: "sell", price: askPrice, remainingAmount: 1000, roomName: "FarRoom" }] };
    Memory.settings = Object.assign({}, saved.settings);
    Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const made = ops.buy("WaitRoom", "power", 100, 5, false, true); // limit 5: nobody sells that cheap (asks start at 20)
    const lines = [];
    console.log = (...a) => { lines.push(a.join(" ")); };
    for (let i = 0; i < 30; i++) { Game.time += 1; ops.tick(); }
    const op = Memory.terminalOps.operations[made.id];
    assert(made.ok && op.state === "waiting" && op.noCandidate && op.noCandidate.best.price === 20, "0111: a buy nobody can fill parks in waiting with its reason stored (got " + JSON.stringify(op.noCandidate) + ")");
    // an operation that entered "waiting" with no stored reason (an older build) gets one
    delete op.noCandidate;
    for (let i = 0; i < 70; i++) { Game.time += 1; ops.tick(); }
    assert(op.state === "waiting" && op.noCandidate && op.noCandidate.best.price === 20, "0111: a buy already in waiting gets its missing reason back (got " + JSON.stringify(op.noCandidate) + ")");
    // and it follows the book while it waits, without printing again (the capture is off while asserting)
    console.log = saved.log;
    askPrice = 30;
    const printedBefore = lines.length;
    console.log = (...a) => { lines.push(a.join(" ")); };
    for (let i = 0; i < 100; i++) { Game.time += 1; ops.tick(); }
    console.log = saved.log;
    assert(op.noCandidate.best.price === 30 && lines.length === printedBefore, "0111: the stored reason follows the book while the buy waits, and prints nothing more (price " + op.noCandidate.best.price + ", new lines " + JSON.stringify(lines.slice(printedBefore).map((l) => l.slice(0, 160))) + ")");
    Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps; Memory.terminalOps = saved.ops; Memory.settings = saved.settings; Game.time = saved.time; market.snapshot = saved.snapshot;
}


// --- ROADMAP 0111: break-even purchase limits, shared inputs, idle-buy abort ---------------
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, cancel: terminalOps.cancel,
        memRooms: Memory.rooms, flip: Memory.marketFlip, ops: Memory.terminalOps };
    Game.cpu.bucket = 10000;
    Game.time += 20000000;
    const quotes = { Z: [100, 110], energy: [1, 1.1], widgetA: [5000, 5400] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const mkRoom = (name) => {
        const factory = { id: "lf-" + name, structureType: STRUCTURE_FACTORY, store: { widgetA: 0 }, effects: [] };
        return { name, controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => [factory], factory };
    };
    const roomA = mkRoom("LimRoom"), roomB = mkRoom("LimRoom2");
    let calls, nextOp;
    terminalOps.buy = (r, rt, qty, limit) => { const id = "lb" + nextOp++; calls.buy.push({ r, rt, qty, limit, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = () => ({ ok: true, id: "ls" + nextOp++ });
    terminalOps.cancel = (id) => { calls.cancel.push(id); if (Memory.terminalOps.operations[id]) Memory.terminalOps.operations[id].state = "cancelled"; return { ok: true }; };
    const reset = (settings, bid, rooms) => {
        calls = { buy: [], cancel: [] }; nextOp = 1;
        quotes.widgetA = [bid === undefined ? 5000 : bid, bid === undefined ? 5400 : bid * 1.08];
        const list = rooms || [roomA];
        Game.rooms = {}; Game.creeps = {};
        list.forEach((r, i) => { Game.rooms[r.name] = r; Game.creeps["lh" + i] = { room: { name: r.name }, memory: { role: "hauler" } }; });
        Game.market = craftTestMarket(quotes, 1e8);
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: false }, settings || {}) });
        Memory.rooms = {}; Memory.craft = undefined;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
        list.forEach((r) => { r.factory.store = { widgetA: 0 }; r.storage.store = { energy: 500000 }; });
        craft.resetScan(); craft.resetLog();
    };
    const run = (settings, bid, rooms) => { reset(settings, bid, rooms); Game.time += 1000; craft.tick(); return Memory.craft; };
    const only = (mem) => mem.active[Object.keys(mem.active)[0]];

    // thin profit: the limit rises by a share of the chain's break-even headroom, between the floor and the cap
    let mem = run({}, 2500);
    let chain = only(mem);
    const cand = mem.candidates.find((c) => c.product === "widgetA");
    const q = chain.buys.Z.qty, ask = 110;
    const headroom = Math.max(0, cand.revenue / (1 + cand.margin) - cand.cost);
    const expected = ask * 1.02 + Math.max(0, headroom - ask * q * 0.02) * 0.5 / q;
    assert(chain && Math.abs(chain.buys.Z.limit - expected) < 0.5 && chain.buys.Z.limit > ask * 1.02 && chain.buys.Z.limit < ask * 1.5 && calls.buy[0].limit === chain.buys.Z.limit,
        "0111: the purchase limit is ask+2% plus half the chain's break-even headroom (expected " + expected.toFixed(2) + ", got " + (chain && chain.buys.Z.limit) + ")");
    assert(Math.abs(chain.reserved - (chain.est.spend + q * (chain.buys.Z.limit - ask))) < 250,
        "0111 AC5: the reservation is the planned spend plus what the limit could add (" + chain.reserved + " vs " + (chain.est.spend + q * (chain.buys.Z.limit - ask)) + ")");
    // the limit can never put the chain under its own margin: paying the limit on every unit keeps the ratio at or above it
    const worstCost = cand.cost + q * (chain.buys.Z.limit - ask);
    assert((cand.revenue - worstCost) / worstCost >= cand.margin - 1e-3,
        "0111: buying at the limit still leaves the chain above its required margin (" + ((cand.revenue - worstCost) / worstCost).toFixed(4) + " >= " + cand.margin + ")");
    // headroom use 0: back to ask + 2% exactly
    mem = run({ buyHeadroomUse: 0 }, 2500);
    assert(Math.abs(only(mem).buys.Z.limit - ask * 1.02) < 1e-9, "0111: craft.buyHeadroomUse 0 keeps the limit at ask + craft.buySlack");
    // premium cap
    mem = run({ maxBuyPremium: 0.03 }, 5000);
    assert(only(mem).buys.Z.limit <= ask * 1.03 + 1e-9 && only(mem).buys.Z.limit >= ask * 1.02, "0111: craft.maxBuyPremium caps the limit however much headroom there is (got " + only(mem).buys.Z.limit + ")");
    // ceilings: what the limits could add never pushes past maxCashAbsolute / maxChainRatio
    for (const [label, settings] of [["maxCashAbsolute", { maxCashAbsolute: 60000 }], ["maxChainRatio", { maxChainRatio: 0.0006 }]]) {
        mem = run(settings, 5000);
        chain = only(mem);
        const qz = chain.buys.Z.qty, slackCost = qz * ask * 0.02;
        const used = qz * (chain.buys.Z.limit - ask) - slackCost; // what the limit adds beyond the fixed slack
        const room = Math.max(0, 60000 - chain.est.spend - slackCost);
        assert(used > 0 && used <= room + 1 && used < qz * ask * 0.25,
            "0111: " + label + " clamps how far the limit can rise - it uses the room under the ceiling, not the premium cap (used " + used.toFixed(0) + ", room " + room.toFixed(0) + ")");
        assert(chain.reserved <= 60000 + slackCost + 1, "0111 AC5: with " + label + " the reservation stays under the ceiling (reserved " + chain.reserved.toFixed(0) + ")");
    }
    // the planner leaves that room: the lot is sized below the ceiling, not at it
    mem = run({ maxCashAbsolute: 60000, test: true }, 5000);
    const sized = mem.candidates.find((c) => c.product === "widgetA");
    assert(sized.spend <= 60000 / 1.15 + 1 && sized.spend > 60000 / 1.15 * 0.9, "0111: the lot is sized to ceiling / (1 + priceDriftReserve), leaving room for the limits (spend " + sized.spend + ")");
    mem = run({ maxCashAbsolute: 60000, test: true, priceDriftReserve: 0 }, 5000);
    assert(mem.candidates.find((c) => c.product === "widgetA").spend > 60000 * 0.9, "0111: craft.priceDriftReserve 0 sizes the lot to the whole ceiling again");

    // Shared inputs use quantitative depth, not a global resource lock.
    mem = run({}, 5000, [roomA, roomB]);
    assert(Object.keys(mem.active).length === 2 && mem.active.LimRoom && mem.active.LimRoom2 && calls.buy.length === 2,
        "0134: two candidates sharing an input open together when residual depth funds both");
    const firstOp = Memory.terminalOps.operations[calls.buy[0].id];
    firstOp.state = "completed"; firstOp.dealtAmount = calls.buy[0].qty;
    Game.time += 1; craft.tick();
    assert(mem.active.LimRoom.state === "working", "0111: the first chain leaves 'buying' once its input arrives");
    craft.resetScan(); Game.time += 400; craft.tick();
    assert(Object.keys(Memory.craft.active).sort().join() === "LimRoom,LimRoom2" && calls.buy.length === 2,
        "0134: both shared-input chains stay active on subsequent scans (active " + Object.keys(Memory.craft.active) + ")");
    reset({}, 5000, [roomA, roomB]);
    Game.market.getAllOrders = () => [{ id: "finite-Z", resourceType: "Z", type: ORDER_SELL, roomName: "QuoteRoom", price: 110, amount: 12000 }];
    Game.time += 1000; craft.tick();
    assert(calls.buy.length === 2 && calls.buy.reduce((sum, b) => sum + b.qty, 0) <= 12000 && calls.buy[1].qty < calls.buy[0].qty,
        "0134: later opening shrinks to residual depth instead of reusing the first allocation");
    reset({}, 5000);
    Game.market.getAllOrders = () => [
        { id: "reserved-Z", resourceType: "Z", type: ORDER_SELL, roomName: "QuoteRoom", price: 110, amount: 10000 },
        { id: "expensive-Z", resourceType: "Z", type: ORDER_SELL, roomName: "QuoteRoom", price: 1000, amount: 100000 },
    ];
    Memory.terminalOps.operations.external = { id: "external", kind: "buy", sourceRoom: "OtherRoom", resourceType: "Z",
        state: "waiting", remaining: 10000, limit: 110, createdTick: Game.time };
    Game.time += 1000; craft.tick();
    assert(!calls.buy.length && Memory.craft.discards.margin > 0 && !Memory.craft.discards["shared-input:Z"],
        "0134: expensive residual supply that erases profit is rejected for margin");
    reset({ buyHeadroomUse: 0 }, 2500);
    Game.market.calcTransactionCost = (q) => q * 10;
    Game.time += 1000; craft.tick();
    chain = only(Memory.craft);
    const effectiveBase = 110 + 10 * 1.1;
    assert(chain && chain.buys.Z.limit >= effectiveBase && chain.reserved <= 1000000,
        "0134: craft buy ceiling includes actual freight even with headroom premium disabled");
    const freightCand = Memory.craft.candidates.find((c) => c.product === "widgetA");
    const maxCost = freightCand.cost + chain.buys.Z.qty * (chain.buys.Z.limit - effectiveBase);
    assert((freightCand.revenue - maxCost) / maxCost >= freightCand.margin - 1e-3,
        "0134: freight-inclusive worst-case purchase still preserves required craft margin");
    // a different input does not clash (a chain buying Z does not hold back one that buys something else)
    reset({}, 5000, [roomA, roomB]);
    Game.time += 1000;
    Memory.craft = { active: { OtherRoom: { id: "x", room: "OtherRoom", key: "OtherRoom", kinds: ["factory"], product: "p", state: "buying", buys: { H: { opId: "none", qty: 1 } }, queue: [{ kind: "factory" }], est: { spend: 0, profit: 0 }, holds: {}, reserved: 0, openedTick: Game.time, stateTick: Game.time } } };
    craft.resetScan(); craft.tick();
    assert(Object.keys(Memory.craft.active).indexOf("LimRoom") >= 0, "0111: an input being bought for another product (H) does not hold back a chain that buys Z");

    // idle abort: nothing traded at all for buyIdleAbortTicks releases the credits instead of waiting for the stall guard
    mem = run({ buyIdleAbortTicks: 100 }, 5000);
    chain = only(mem);
    Memory.terminalOps.operations[calls.buy[0].id].state = "waiting";
    Game.time += 50; craft.tick();
    assert(Memory.craft.active.LimRoom && Memory.marketFlip.committedCredits > 0, "0111 P6: a buy with no trade yet is still waited on inside buyIdleAbortTicks");
    Game.time += 80; craft.tick();
    assert(!Memory.craft.active.LimRoom && Memory.craft.stats.aborted === 1 && Memory.marketFlip.committedCredits === 0 && calls.cancel.indexOf(calls.buy[0].id) >= 0,
        "0111 P6: past buyIdleAbortTicks with nothing traded the chain aborts, cancels the order and frees every reserved credit");
    // a buy that traded something is left to buyPatienceTicks instead (partial fill), never to the idle abort
    mem = run({ buyIdleAbortTicks: 100, buyPatienceTicks: 5000 }, 5000);
    Object.assign(Memory.terminalOps.operations[calls.buy[0].id], { state: "waiting", dealtAmount: 10 });
    Game.time += 1; craft.tick();
    Game.time += 300; craft.tick();
    assert(Memory.craft.active.LimRoom && Memory.craft.stats.aborted === 0, "0111 P6: a buy that already traded is never aborted by the idle rule (that is the patience rule's case)");

    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; terminalOps.cancel = saved.cancel;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time;
}

// --- ROADMAP 0111: the final reaction runs wide (every lab that reaches both inputs reacts) ---
{
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    const slots10 = labSlots.SLOT_NUMBERS.slice(), slots6 = [1, 2, 3, 4, 5, 6], slots3 = [1, 2, 3];
    // finalOutputs: out first, never an input, every one reaches both inputs
    const f10 = labSlots.finalOutputs(slots10, [1, 2], 3);
    assert(f10.length === 8 && f10[0] === 3 && f10.indexOf(1) < 0 && f10.indexOf(2) < 0 && f10.every((s) => labSlots.reaches(s, 1, 2)) && f10.slice(1).join() === f10.slice(1).slice().sort((a, b) => a - b).join(),
        "0111: on 10 labs with the centre pair as inputs the final reaction has 8 output labs, planned output first (got " + f10 + ")");
    assert(labSlots.finalOutputs(slots6, [1, 2], 3).join() === "3,4,5,6", "0111: on 6 labs (RCL 7) the final reaction has 4 output labs");
    assert(labSlots.finalOutputs(slots3, [1, 2], 3).join() === "3", "0111: on 3 labs (RCL 6) there is just the one output lab");
    const fTree = labSlots.finalOutputs(slots10, [3, 6], 7);
    assert(fTree[0] === 7 && fTree.every((s) => s === 7 || (labSlots.reaches(s, 3, 6) && s !== 3 && s !== 6)), "0111: for another input pair only the labs that reach BOTH inputs qualify (got " + fTree + ")");

    // lab.js: every listed output lab reacts on its own cooldown; inputs and unlisted labs do not
    const labMod = require(path.join(PROJECT, "src/structures/lab"));
    const savedRooms = Memory.rooms, savedGet = Game.getObjectById;
    const mkReactLab = (id) => ({ id, room: { name: "WideLabRoom" }, cooldown: 0, ran: 0, store: {}, runReaction(a, b) { this.ran++; this.args = [a.id, b.id]; return OK; } });
    const wl = { in1: mkReactLab("wl-in1"), in2: mkReactLab("wl-in2"), o1: mkReactLab("wl-o1"), o2: mkReactLab("wl-o2"), o3: mkReactLab("wl-o3"), other: mkReactLab("wl-other") };
    wl.in1.mineralType = "H"; wl.in1.store.H = 100;
    wl.in2.mineralType = "O"; wl.in2.store.O = 100;
    Game.getObjectById = (id) => { const k = Object.keys(wl).find((n) => wl[n].id === id); return k ? wl[k] : savedGet.call(Game, id); };
    Memory.rooms = Object.assign({}, savedRooms, { WideLabRoom: { labReaction: { a: "H", b: "O", product: "OH", output: "wl-o1", outputs: ["wl-o1", "wl-o2", "wl-o3"], input1: "wl-in1", input2: "wl-in2" } } });
    wl.o2.cooldown = 7;
    Object.keys(wl).forEach((k) => labMod.run(wl[k]));
    assert(wl.o1.ran === 1 && wl.o3.ran === 1 && wl.o2.ran === 0 && wl.in1.ran === 0 && wl.in2.ran === 0 && wl.other.ran === 0 && wl.o1.args.join() === "wl-in1,wl-in2",
        "0111: every output lab of a wide reaction reacts, the one on cooldown waits, inputs and unlisted labs stay idle (ran " + JSON.stringify(Object.keys(wl).map((k) => k + ":" + wl[k].ran)) + ")");
    Memory.rooms.WideLabRoom.labReaction = { a: "H", b: "O", product: "OH", output: "wl-o1", input1: "wl-in1", input2: "wl-in2" };
    Object.keys(wl).forEach((k) => { wl[k].ran = 0; wl[k].cooldown = 0; });
    Game.time++; // shared reservations reset on a new tick
    Object.keys(wl).forEach((k) => labMod.run(wl[k]));
    assert(wl.o1.ran === 1 && wl.o2.ran === 0 && wl.o3.ran === 0, "0111: a reaction without an outputs list still runs on its single output lab (manual setLabReaction)");

    // transientStock: product in ANY output lab is kept, in an unlisted lab it is drained
    const ts = require(path.join(PROJECT, "src/utils/transientStock"));
    const tsLab = (id, res) => Object.assign(new OwnedStructure(), { id, structureType: STRUCTURE_LAB, my: true, room: { name: "WideLabRoom" }, pos: new RoomPosition(5, 5, "WideLabRoom"), store: mineralStore(res, 1000) });
    Memory.rooms.WideLabRoom.labReaction.outputs = ["wl-o1", "wl-o2", "wl-o3"];
    assert(ts.excess(tsLab("wl-o2", { OH: 300 })).length === 0 && ts.excess(tsLab("wl-o3", { OH: 300 })).length === 0, "0111 AC6: the product is kept in every output lab of a wide reaction");
    assert(ts.excess(tsLab("wl-other", { OH: 300 })).map((e) => e.resourceType).join() === "OH", "0111 AC7: the same product in a lab outside the reaction is drained");

    // hauler: drain the FULLEST output lab; pressure reports the fullest one too
    Game.time += 21000000;
    wl.in1.store = mineralStore({ H: 1000 }, 2000); wl.in2.store = mineralStore({ O: 1000 }, 2000); // stocked inputs: no reagent job
    const dl = { a: tsLab("wl-o1", { OH: 200 }), b: tsLab("wl-o2", { OH: 3200 }), c: tsLab("wl-o3", { OH: 50 }) };
    Object.keys(dl).forEach((k) => { dl[k].mineralType = "OH"; wl[{ a: "o1", b: "o2", c: "o3" }[k]] = dl[k]; });
    const drainRoom = { name: "WideLabRoom", storage: { store: mineralStore({}, 1e6) }, terminal: null, find: (type) => (type === FIND_STRUCTURES || type === FIND_MY_STRUCTURES ? [dl.a, dl.b, dl.c] : []) };
    // a small amount is not worth the trip: below the drain floor (80% of the lab / a full load) nothing is fetched
    dl.b.store = mineralStore({ OH: 300 }, 1000);
    Game.time++;
    const small = hauler.pickMineralJob(drainRoom);
    assert(!small || small.kind !== "labOutput", "0111: a few units in an output lab are not fetched one trip at a time (got " + (small && small.kind) + ")");
    dl.b.store = mineralStore({ OH: 3200 }, 1000);
    Game.time++;
    const drain = hauler.pickMineralJob(drainRoom);
    assert(drain && drain.kind === "labOutput" && drain.from === dl.b && drain.resourceType === "OH", "0111: the hauler drains the fullest output lab first (got " + (drain && drain.from && drain.from.id) + ")");
    Memory.rooms.WideLabRoom.labReaction.keep = true;
    Game.time++;
    const keptJob = hauler.pickMineralJob(drainRoom);
    assert(!keptJob || keptJob.kind !== "labOutput", "0111: an in-place (keep) reaction is still never drained, wide or not (got " + (keptJob && keptJob.kind) + ")");
    delete Memory.rooms.WideLabRoom.labReaction.keep;
    const nel = require(path.join(PROJECT, "src/utils/nonEnergyLogistics"));
    Game.time++;
    const pressure = nel.outputs(drainRoom).find((o) => o.kind === "labOutput");
    // mineralStore(res, 1000) reports capacity = free (1000) + used (3200) = 4200
    assert(pressure && pressure.sourceId === "wl-o2" && Math.abs(pressure.ratio - 3200 / 4200) < 1e-9,
        "0111: pressure on a wide reaction is measured on its fullest output lab (got " + JSON.stringify(pressure) + ")");
    Memory.rooms = savedRooms; Game.getObjectById = savedGet;
}
{
    // end to end: a chain on 10 labs runs its final step on 8 output labs, and the planner's T reflects it
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const labSlots = require(path.join(PROJECT, "src/utils/labSlots"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, memRooms: Memory.rooms, flip: Memory.marketFlip,
        ops: Memory.terminalOps, getObj: Game.getObjectById };
    Game.cpu.bucket = 10000;
    Game.time += 22000000;
    const quotes = { H: [10, 11], O: [10, 11], OH: [60, 70], energy: [1, 1.1] };
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const mkLab = (slot) => ({ id: "wd" + slot, structureType: STRUCTURE_LAB, store: {}, mineralType: null, pos: { x: 10 + labSlots.OFFSETS[slot][1], y: 10 + labSlots.OFFSETS[slot][0] }, room: { name: "WideChainRoom" } });
    let labs = labSlots.SLOT_NUMBERS.map(mkLab);
    const byId = () => { const m = {}; labs.forEach((l) => { m[l.id] = l; }); return m; };
    let idx = byId();
    Game.getObjectById = (id) => idx[id] || null;
    const room = { name: "WideChainRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => labs };
    const bought = [];
    let nextOp = 1;
    terminalOps.buy = (r, rt, qty) => { const id = "wb" + nextOp++; bought.push({ rt, qty, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = () => ({ ok: true, id: "ws" + nextOp++ });
    const setup = (settings, builtSlots) => {
        bought.length = 0; nextOp = 1;
        labs = (builtSlots || labSlots.SLOT_NUMBERS).map(mkLab); idx = byId();
        Game.rooms = { WideChainRoom: room }; Game.creeps = { h1: { room: { name: "WideChainRoom" }, memory: { role: "hauler" } } };
        Game.market = craftTestMarket(quotes, 1e8);
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: false }, settings || {}) });
        Memory.rooms = {}; Memory.craft = undefined;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
        labSlots.resetCache(); craft.resetScan(); craft.resetLog();
        const mp = require(path.join(PROJECT, "src/utils/marketPricing")); mp.resetCaches();
    };
    const open = (settings, builtSlots) => { setup(settings, builtSlots); Game.time += 1000; craft.tick(); return Memory.craft.active.WideChainRoom; };
    let chain = open();
    const item = chain && chain.queue[0];
    const expectedOutputs = labSlots.finalOutputs(labSlots.SLOT_NUMBERS, [1, 2], 3).map((slot) => "wd" + slot);
    assert(chain && chain.product === "OH" && item.outputs.join() === expectedOutputs.join() && item.outputs.length === 8 && item.outputs.indexOf(item.input1) < 0 && item.outputs.indexOf(item.input2) < 0,
        "0111: on 10 labs the chain's final step lists 8 output labs, none of them an input (got " + JSON.stringify(item && { in: [item.input1, item.input2], out: item.outputs }) + ")");
    const wideT = Memory.craft.candidates.find((c) => c.product === "OH").T;
    // run it: buys arrive, the reaction is set with the whole outputs list
    bought.forEach((b) => { Memory.terminalOps.operations[b.id].state = "completed"; Memory.terminalOps.operations[b.id].dealtAmount = b.qty; });
    Game.time += 1; craft.tick();
    const reaction = Memory.rooms.WideChainRoom.labReaction;
    assert(reaction && reaction.outputs && reaction.outputs.join() === expectedOutputs.join() && reaction.output === item.output && reaction.input1 === item.input1,
        "0111: the reaction is set with all output labs (got " + JSON.stringify(reaction && reaction.outputs) + ")");
    // an extra output lab still holding a foreign mineral holds the reaction back (it would block the product)
    Memory.rooms.WideChainRoom.labReaction = undefined; delete Memory.rooms.WideChainRoom.labReactionAuto;
    chain = Memory.craft.active.WideChainRoom; chain.queue[0].started = false;
    const extra = idx[item.outputs[4]]; extra.mineralType = "G"; extra.store = { G: 40 };
    Game.time += 1; craft.tick();
    assert(!Memory.rooms.WideChainRoom.labReaction, "0111: a foreign mineral in ANY output lab holds the reaction back until it is drained");
    extra.mineralType = null; extra.store = {};
    Game.time += 1; craft.tick();
    assert(Memory.rooms.WideChainRoom.labReaction && Memory.rooms.WideChainRoom.labReaction.outputs.length === 8, "0111: ...and it starts once every output lab is clear");
    // the same chain without wide labs: one output lab, and a much longer T
    open({ wideLabs: false });
    const narrow = Memory.craft.active.WideChainRoom;
    const narrowT = Memory.craft.candidates.find((c) => c.product === "OH").T;
    assert(narrow.queue[0].outputs.length === 1 && narrow.queue[0].outputs[0] === narrow.queue[0].output, "0111: craft.wideLabs false keeps a single output lab");
    assert(narrowT > wideT * 4, "0111: the planner's T reflects the real parallelism - 8 output labs are several times faster than 1 (T " + wideT + " vs " + narrowT + ")");
    bought.forEach((b) => { Memory.terminalOps.operations[b.id].state = "completed"; Memory.terminalOps.operations[b.id].dealtAmount = b.qty; });
    Game.time += 1; craft.tick();
    assert(Memory.rooms.WideChainRoom.labReaction && !Memory.rooms.WideChainRoom.labReaction.outputs, "0111: with wide labs off the reaction has no outputs list (legacy shape)");
    // RCL 6 (3 labs): nothing to widen
    open({}, [1, 2, 3]);
    assert(Memory.craft.active.WideChainRoom && Memory.craft.active.WideChainRoom.queue[0].outputs.length === 1, "0111: with 3 labs the final step has just its one output lab");

    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; Game.getObjectById = saved.getObj;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time; labSlots.resetCache();
}

// --- ROADMAP 0111: the final product is sold as it comes out (partial sales) ---------------------
{
    for (const m of ["craftChain", "craftPlanner", "marketPricing", "marketFlip"]) delete require.cache[require.resolve(path.join(PROJECT, "src/utils/" + m))];
    const craft = require(path.join(PROJECT, "src/utils/craftPlanner"));
    const chainMod = require(path.join(PROJECT, "src/utils/craftChain"));
    const market = require(path.join(PROJECT, "src/utils/market"));
    const terminalOps = require(path.join(PROJECT, "src/utils/terminalOps"));
    const saved = { rooms: Game.rooms, market: Game.market, creeps: Game.creeps, settings: Memory.settings, samples: market.samples, snapshot: market.snapshot,
        craft: Memory.craft, bucket: Game.cpu.bucket, time: Game.time, buy: terminalOps.buy, sell: terminalOps.sellLot, cancel: terminalOps.cancel,
        memRooms: Memory.rooms, flip: Memory.marketFlip, ops: Memory.terminalOps };
    Game.cpu.bucket = 10000;
    Game.time += 23000000;
    const quotes = { Z: [100, 110], energy: [1, 1.1], widgetA: [5000, 5400] };
    const live = {};
    market.samples = (rt) => (quotes[rt] ? priceSamples(quotes[rt][0], quotes[rt][1], 72, 1e9) : []);
    market.snapshot = () => ({ resources: Object.keys(quotes).reduce((acc, rt) => { acc[rt] = { currentBuy: live[rt] !== undefined ? live[rt] : quotes[rt][0], currentSell: quotes[rt][1] }; return acc; }, {}) });
    const factory = { id: "psf", structureType: STRUCTURE_FACTORY, store: { widgetA: 0 }, effects: [] };
    const room = { name: "PartRoom", controller: { my: true }, storage: { store: { energy: 500000 } }, terminal: { store: {} }, find: () => [factory] };
    let calls, nextOp;
    terminalOps.buy = (r, rt, qty, limit) => { const id = "pb" + nextOp++; calls.buy.push({ rt, qty, limit, id }); Memory.terminalOps.operations[id] = { id, state: "queued" }; return { ok: true, id }; };
    terminalOps.sellLot = (r, rt, cumulative, floor, listing) => {
        const live = calls.sell.find((call) => !["completed", "cancelled", "failed"].includes(Memory.terminalOps.operations[call.id].state));
        if (live) return { ok: true, id: live.id };
        const sold = calls.sell.reduce((n, call) => n + (Memory.terminalOps.operations[call.id].dealtAmount || 0), 0);
        const qty = cumulative - sold, id = "pS" + nextOp++;
        calls.sell.push({ r, rt, qty, floor, listing, id });
        Memory.terminalOps.operations[id] = { id, state: "queued" };
        return { ok: true, id };
    };
    terminalOps.cancel = (id) => { calls.cancel.push(id); if (Memory.terminalOps.operations[id]) Memory.terminalOps.operations[id].state = "cancelled"; return { ok: true }; };
    const step = (n) => { for (let i = 0; i < (n || 1); i++) { Game.time += 1; craft.tick(); } };
    const workingChain = (settings, pre) => {
        calls = { buy: [], sell: [], cancel: [] }; nextOp = 1; delete live.widgetA;
        Game.rooms = { PartRoom: room }; Game.creeps = { h1: { room: { name: "PartRoom" }, memory: { role: "hauler" } } };
        Game.market = craftTestMarket(quotes, 1e8);
        Memory.settings = Object.assign({}, saved.settings, { craft: Object.assign({ test: false }, settings || {}) });
        Memory.rooms = {}; Memory.craft = undefined;
        Memory.marketFlip = { lastScanTick: null, committedCredits: 0, active: {}, lastOpportunities: [], stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 } };
        Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
        factory.store = { widgetA: 0 }; room.storage.store = { energy: 500000 };
        if (pre) room.storage.store.widgetA = pre; // product that was already there before the chain
        craft.resetScan(); craft.resetLog();
        Game.time += 1000; craft.tick();
        const chain = Memory.craft.active.PartRoom;
        calls.buy.forEach((b) => { const op = Memory.terminalOps.operations[b.id]; op.state = "completed"; op.dealtAmount = b.qty; room.storage.store[b.rt] = b.qty; });
        step();
        return chain;
    };
    const finishOp = (id, dealt) => { const op = Memory.terminalOps.operations[id]; op.state = "completed"; op.dealtAmount = dealt; };

    let chain = workingChain();
    const item = chain.queue[0], target = item.target, floor = chainMod.saleFloor(chain);
    const lot = Math.max(1, Math.ceil(target * 0.1));
    assert(chain.state === "working" && Memory.rooms.PartRoom.directToTerminal === undefined,
        "0111: the chain no longer asks for the terminal shortcut - terminalOps would sweep unclaimed terminal stock back to storage (flag " + Memory.rooms.PartRoom.directToTerminal + ")");
    // product still in the factory is not sellable: it has to be carried to storage first
    factory.store.widgetA = 3 * lot;
    step();
    assert(calls.sell.length === 0, "0111: product still in the factory is not sold (it is not in storage/terminal yet)");
    room.storage.store.widgetA = lot - 1;
    step();
    assert(calls.sell.length === 0, "0111: less than the minimum lot (" + lot + ", 10% of the target) in storage is not worth an order");
    room.storage.store.widgetA = lot + 2;
    step();
    assert(calls.sell.length === 1 && calls.sell[0].qty === lot + 2 && calls.sell[0].floor === floor && calls.sell[0].listing === false && calls.sell[0].rt === "widgetA" && chain.partialOpId === calls.sell[0].id,
        "0111: once a lot is in storage it is sold at once - instant, at the break-even floor, never listed (got " + JSON.stringify(calls.sell[0]) + ")");
    room.storage.store.widgetA += 3 * lot;
    step(3);
    assert(calls.sell.length === 1, "0111: only one partial order at a time (terminalOps takes a single sell per room and resource)");
    // the order fills: stock drops, the chain remembers what it sold and opens the next one
    finishOp(calls.sell[0].id, lot + 2);
    room.storage.store.widgetA -= lot + 2;
    Memory.terminalOps.events.push({ tick: Game.time, room: "PartRoom", kind: "sell", resourceType: "widgetA", amount: lot + 2, credits: 1000, transactionEnergy: 0 });
    Object.assign(Memory.terminalOps.operations[calls.sell[0].id], { kind: "sell", resourceType: "widgetA", accounting: { credits: 1000, energy: 0, amount: lot + 2, confidence: "confirmed" } });
    step();
    assert(chain.sold === lot + 2 && chain.partialOpId === calls.sell[1].id && calls.sell.length === 2 && calls.sell[1].qty === 3 * lot,
        "0111: the filled order is booked (sold " + chain.sold + ") and the next one takes what is in storage now (got qty " + (calls.sell[1] && calls.sell[1].qty) + ")");
    // progress counts what was sold: made = stock - base + sold
    const madeNow = factory.store.widgetA + room.storage.store.widgetA + chain.sold;
    assert(madeNow === 3 * lot + 3 * lot + lot + 2 && chain.state === "working", "0111: units sold on the way still count as produced, so the item is not done early (" + madeNow + " < " + target + ")");
    // production ends with an order still open: it is cancelled (trades kept) and the rest goes through the normal selling state
    const stockBefore = factory.store.widgetA + room.storage.store.widgetA;
    const add = target - chain.sold + 1 - stockBefore; // stock + sold reaches the target, stock ALONE stays below it
    assert(add > 0 && stockBefore + add < target, "0111: scenario check - stock alone (" + (stockBefore + add) + ") is below the target (" + target + ") and only stock + sold reaches it");
    room.storage.store.widgetA += add;
    step();
    assert(chain.state === "selling" && calls.cancel.indexOf(calls.sell[1].id) >= 0 && chain.partialOpId === null && chain.sold === lot + 2,
        "0111: when production ends the open partial order is cancelled and the chain moves to selling (state " + chain.state + ", cancels " + JSON.stringify(calls.cancel) + ")");
    const stockNow = factory.store.widgetA + room.storage.store.widgetA;
    assert(chain.produced === stockNow + chain.sold, "0111: the total produced counts what was already sold (produced " + chain.produced + " = stock " + stockNow + " + sold " + chain.sold + ")");
    room.storage.store.widgetA += factory.store.widgetA; factory.store.widgetA = 0; // carried to storage
    step();
    const finalSell = calls.sell[2];
    assert(finalSell && finalSell.qty === chain.produced - chain.sold && finalSell.qty === room.storage.store.widgetA && finalSell.listing === false && finalSell.floor === chainMod.saleFloor(chain),
        "0111: the final sale covers only what is left unsold (qty " + (finalSell && finalSell.qty) + " = produced " + chain.produced + " - sold " + chain.sold + ")");
    // realized profit counts the partial sales too
    finishOp(finalSell.id, finalSell.qty);
    Memory.terminalOps.events.push({ tick: Game.time, room: "PartRoom", kind: "sell", resourceType: "widgetA", amount: finalSell.qty, credits: 5000, transactionEnergy: 0 });
    Memory.terminalOps.events.push({ tick: chain.openedTick, room: "PartRoom", kind: "buy", resourceType: "Z", amount: 100, credits: -300, transactionEnergy: 0 });
    Object.assign(Memory.terminalOps.operations[calls.buy[0].id], { kind: "buy", resourceType: "Z", accounting: { credits: -300, energy: 0, amount: 100, confidence: "confirmed" } });
    Object.assign(Memory.terminalOps.operations[finalSell.id], { kind: "sell", resourceType: "widgetA", accounting: { credits: 5000, energy: 0, amount: finalSell.qty, confidence: "confirmed" } });
    const ownCost = chain.ownCost;
    step();
    const run = Memory.craft.ledger.runs[Memory.craft.ledger.runs.length - 1];
    assert(!Memory.craft.active.PartRoom && run && run.profit === Math.round(1000 + 5000 - 300 - ownCost),
        "0111: the ledger's realized profit includes the sales made while it was still producing (got " + (run && run.profit) + ", expected " + Math.round(6000 - 300 - ownCost) + ")");

    // product that was already in storage before the chain is not the chain's to sell, partial or final
    chain = workingChain({}, 7);
    const preBase = chain.queue[0].base;
    assert(preBase === 7, "0111: the baseline includes what was there before the chain (" + preBase + ")");
    room.storage.store.widgetA = 7 + 3 * lot;
    step();
    assert(calls.sell.length === 1 && calls.sell[0].qty === 3 * lot, "0111: a partial sale takes only the chain's own production, not the 7 units that were already there (qty " + (calls.sell[0] && calls.sell[0].qty) + ")");
    finishOp(calls.sell[0].id, 3 * lot);
    room.storage.store.widgetA -= 3 * lot;
    step();
    room.storage.store.widgetA = target - 3 * lot + 7; // own production now complete: stock - base + sold = target
    step();
    assert(chain.state === "selling" && chain.produced === target, "0111: produced = stock - baseline + sold (" + chain.produced + " = " + target + ")");
    step();
    const lastSell = calls.sell[calls.sell.length - 1];
    assert(lastSell.qty === target - 3 * lot, "0111: the final sale leaves the pre-existing units alone (qty " + lastSell.qty + " = " + (target - 3 * lot) + ")");

    // never below the floor: with the bid under it no order is opened, however much is in storage
    chain = workingChain();
    live.widgetA = chainMod.saleFloor(chain) * 0.5;
    factory.store.widgetA = 0; room.storage.store.widgetA = 5 * lot;
    step(3);
    assert(calls.sell.length === 0, "0111: with the bid below the break-even floor no partial order is opened");
    live.widgetA = chainMod.saleFloor(chain) * 1.5;
    step();
    assert(calls.sell.length === 1, "0111: ...and it opens as soon as the bid is back at the floor");
    // the floor is the REAL cost of the operation plus the sale margin: credits and energy
    // fee of the purchases as traded, own stock, and the sale's own energy at the worst case
    chain = workingChain();
    Memory.terminalOps.events.push({ tick: chain.openedTick, room: "PartRoom", kind: "buy", resourceType: "Z", amount: 100, credits: -1000, transactionEnergy: 30 });
    Object.assign(Memory.terminalOps.operations[calls.buy[0].id], { kind: "buy", resourceType: "Z", accounting: { credits: -1000, energy: 30, amount: 100, confidence: "confirmed" } });
    delete chain.buyCost;
    const units = chain.qty;
    const base = (1000 + (30 + units) * 1.1 + chain.ownCost) / units;
    assert(Math.abs(chainMod.saleFloor(chain) - base * 1.01) < 1e-9,
        "0111: the sale floor is the actual cost per unit (buys " + 1000 + ", fees, own stock) plus the 1% margin (got " + chainMod.saleFloor(chain) + ", expected " + base * 1.01 + ")");
    assert(chainMod.saleFloor(chain) > base, "0111: the floor is above the plain break-even - a sale at the floor leaves a profit");
    Memory.settings.craft.minSaleMargin = 0.05;
    assert(Math.abs(chainMod.saleFloor(chain) - base * 1.05) < 1e-9, "0111: craft.minSaleMargin sets the margin on top of the cost");
    Memory.settings.craft.minSaleMargin = 0.01;
    Memory.terminalOps.events.push({ tick: chain.openedTick, room: "PartRoom", kind: "buy", resourceType: "Z", amount: 100, credits: -500, transactionEnergy: 0 });
    Memory.terminalOps.operations[calls.buy[0].id].accounting.credits -= 500;
    chain.buyCost = undefined;
    assert(chainMod.saleFloor(chain) > base * 1.01 + 400 / units, "0111: buying above the estimate raises the floor - the sale still covers what was really paid");
    // switches
    chain = workingChain({ partialSales: false });
    room.storage.store.widgetA = 5 * lot;
    step(3);
    assert(calls.sell.length === 0, "0111: craft.partialSales false sells nothing until production is over");
    chain = workingChain({ minPartialSellRatio: 0.5 });
    room.storage.store.widgetA = 2 * lot;
    step();
    assert(calls.sell.length === 0, "0111: craft.minPartialSellRatio raises the minimum lot");
    room.storage.store.widgetA = 6 * lot;
    step();
    assert(calls.sell.length === 1, "0111: ...and a lot above it is sold");
    // an abort cancels the order in flight
    chain = workingChain();
    room.storage.store.widgetA = 2 * lot;
    step();
    const openId = chain.partialOpId;
    assert(openId, "0111: a partial order is open");
    chainMod.cancelRoom("PartRoom");
    assert(calls.cancel.indexOf(openId) >= 0 && !Memory.craft.active.PartRoom && Memory.marketFlip.committedCredits === 0,
        "0111: aborting a chain cancels its partial order too and frees the credits");
    // a chain that never sold on the way behaves exactly as before
    chain = workingChain({ partialSales: false });
    factory.store.widgetA = target + 5; step();
    assert(chain.state === "selling" && chain.produced === target + 5 && (chain.sold || 0) === 0, "0111: without partial sales the totals are unchanged (produced " + chain.produced + ", sold " + (chain.sold || 0) + ")");

    terminalOps.buy = saved.buy; terminalOps.sellLot = saved.sell; terminalOps.cancel = saved.cancel;
    market.samples = saved.samples; market.snapshot = saved.snapshot; Game.rooms = saved.rooms; Game.market = saved.market; Game.creeps = saved.creeps;
    Memory.settings = saved.settings; Memory.craft = saved.craft; Memory.rooms = saved.memRooms; Memory.marketFlip = saved.flip; Memory.terminalOps = saved.ops;
    Game.cpu.bucket = saved.bucket; Game.time = saved.time;
}

// 0125: compare equal delivered quantities, never perform an intent.
{
    const routing = require(path.join(PROJECT, "src/utils/terminalRouting"));
    const saved = { settings: Memory.settings, resources: RESOURCES_ALL, rooms: Game.rooms };
    Memory.settings = {};
    RESOURCES_ALL = ["energy", "Z"];
    const source = "W1N1", hub = "E2N46", target = "W9N9";
    const cost = (n, from, to) => Math.ceil(n * (from === source && to === target ? 0.5 : from === hub ? 0.5 : 0.1));
    const opts = { calcTransactionCost: cost };
    try {
        let q = routing.quote(source, target, "Z", 100, opts);
        assert(q.ok && q.route === "relay" && q.direct.freight === 50 && q.relay.freight === 40 && q.relay.fundingAmount === 27 && q.relay.fundingFreight === 3 && q.savingsEnergy === 10, "0125: mineral quote includes funding freight and message");
        q = routing.quote(source, target, "energy", 100, opts);
        assert(q.ok && q.route === "relay" && q.relay.cargoAmount === 127 && q.relay.deliveredAmount === 100 && q.relay.fundingAmount === 0 && q.relay.fundingFreight === 0 && q.direct.totalEnergy === 150 && q.relay.totalEnergy === 140, "0125: energy quote compares equal delivered amounts");
        q = routing.quote(source, target, "Z", 101, opts);
        assert(q.direct.freight === 51 && q.relay.hubFreight === 26 && q.relay.fundingAmount === 28 && q.relay.originFreight === 11 && q.relay.fundingFreight === 3 && q.relay.freight === 42, "0125: rounding includes every leg");
        const tieCost = (n, from, to) => from === source && to === target ? 40 : cost(n, from, to);
        const worseCost = (n, from, to) => from === source && to === target ? 39 : cost(n, from, to);
        assert(routing.quote(source, target, "Z", 100, { calcTransactionCost: tieCost }).route === "direct" && routing.quote(source, target, "Z", 100, { calcTransactionCost: worseCost }).route === "direct", "0125: equal or worse freight stays direct");
        q = routing.quote(source, target, "energy", 100, Object.assign({}, opts, { critical: true }));
        const urgent = routing.quote(source, target, "energy", 100, Object.assign({}, opts, { urgent: true }));
        assert(urgent.route === "direct" && urgent.reason === "urgent-direct" && routing.quote(source, target, "energy", 100, opts).route === "relay", "0125: relay is automatic unless explicitly urgent");
        assert(q.route === "direct" && q.economic && q.reason === "critical-direct" && routing.quote(source, target, "energy", 100, Object.assign({}, opts, { urgency: "critical" })).route === "direct", "0125: critical transfer stays direct");
        assert(routing.quote(source, target, "Z", 100, Object.assign({}, opts, { relayAvailable: false })).route === "direct", "0125: unavailable relay stays direct");
        assert(routing.quote(source, target, "Z", 100, Object.assign({}, opts, { minSavingsEnergy: 11 })).route === "direct" && routing.quote(source, target, "Z", 100, Object.assign({}, opts, { minSavingsRatio: 0.21 })).route === "direct" && routing.quote(source, target, "Z", 100, Object.assign({}, opts, { sourceMultiplier: 0.5 })).route === "direct", "0125: savings thresholds and powered sender are respected");
        Memory.settings.terminalRelay = { minSavingsEnergy: 11 };
        assert(routing.quote(source, target, "Z", 100, opts).route === "direct", "0125: Memory settings override quote defaults");
        Memory.settings = {};
        const invalid = [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1];
        assert(invalid.every(n => !routing.quote(source, target, "Z", n, opts).ok) && !routing.quote("invalid", target, "Z", 100, opts).ok && !routing.quote(source, target, "pixel", 100, opts).ok && !routing.quote(source, target, "Z", 100, { calcTransactionCost: () => NaN }).ok && !routing.quote(source, target, "Z", 100, { calcTransactionCost: () => { throw new Error("offline"); } }).ok, "0125: invalid cost fails closed without sending");
        const zero = routing.quote(source, target, "Z", 100, { calcTransactionCost: () => 0 });
        assert(zero.route === "direct" && zero.savingsRatio === 0 && zero.relay.freight === 2, "0125: zero direct freight keeps the fixed message overhead");
        assert(routing.quote(hub, target, "Z", 100, opts).reason === "hub-endpoint" && routing.quote(source, hub, "Z", 100, opts).route === "direct", "0125: hub endpoints cannot loop through relay");
        let fundingFrom = null;
        routing.quote(source, target, "Z", 100, Object.assign({}, opts, { fundingRoom: "W2N2", calcTransactionCost: (n, from, to) => { if (n === 27 && to === hub) fundingFrom = from; return cost(n, from, to); } }));
        assert(fundingFrom === "W2N2", "0125: separate funding room is included in freight");
        const previousPower = global.PWR_OPERATE_TERMINAL, previousInfo = global.POWER_INFO;
        global.PWR_OPERATE_TERMINAL = 99; global.POWER_INFO = { 99: { effect: [0.9, 0.8, 0.7, 0.6, 0.5] } };
        Game.rooms = { [source]: { terminal: { effects: [{ effect: 99, level: 5, ticksRemaining: 20 }] } } };
        q = routing.quote(source, target, "Z", 100, opts);
        assert(q.direct.freight === 25 && q.relay.originFreight === 5 && q.relay.fundingFreight === 2 && q.route === "direct", "0125: active operate terminal power affects both source sends");
        Game.rooms[source].terminal.effects[0].ticksRemaining = 0;
        assert(routing.quote(source, target, "Z", 100, opts).route === "relay", "0125: expired power does not reduce freight");
        if (previousPower === undefined) delete global.PWR_OPERATE_TERMINAL; else global.PWR_OPERATE_TERMINAL = previousPower;
        if (previousInfo === undefined) delete global.POWER_INFO; else global.POWER_INFO = previousInfo;
        const before = JSON.stringify(Memory);
        let sends = 0;
        Game.rooms = { [source]: { terminal: { send: () => { sends++; } } } };
        q = global.terminalRelayQuote(source, target, "energy", 100, opts);
        assert(q.ok && sends === 0 && JSON.stringify(Memory) === before, "0125: quote is read only and registered in the console");
        // Verify the self-funded lot leaves exactly A deliverable, not A-its-fee.
        let equivalent = true;
        for (let n = 1; n <= 200; n++) {
            const energy = routing.quote(source, target, "energy", n, opts);
            const canDeliver = energy.relay.cargoAmount - n >= Math.ceil(cost(n, hub, target) / 2) + 2;
            const cannotDeliverMore = energy.relay.cargoAmount - (n + 1) < Math.ceil(cost(n + 1, hub, target) / 2) + 2;
            equivalent = equivalent && canDeliver && cannotDeliverMore;
        }
        assert(equivalent, "0125: self funded amount delivers exactly the requested energy across rounding boundaries");
    } finally {
        Memory.settings = saved.settings; RESOURCES_ALL = saved.resources; Game.rooms = saved.rooms;
    }
}

// 0126: avoid walking to overflow already covered by a container.
{
    const haul = require(path.join(PROJECT, "src/roles/hauler"));
    const saved = { time: Game.time, creeps: Game.creeps, get: Game.getObjectById, settings: Memory.settings, mem: Memory.rooms.W8N8 };
    const name = "W8N8", objects = {}, calls = {};
    let containers = [], drops = [], links = [], searches = 0;
    const pos = (x, y) => new RoomPosition(x, y, name);
    const source = { id: "126-source", pos: pos(10, 10) };
    const sourceBox = { id: "126-box", structureType: STRUCTURE_CONTAINER, pos: pos(10, 11), store: store(2000, 2000) };
    const receiving = { id: "126-link", structureType: STRUCTURE_LINK, pos: pos(20, 20), store: store(800, 800), isCollector: () => false };
    const localRoom = { name, storage: null, terminal: null, find: type => {
        calls[type] = (calls[type] || 0) + 1;
        if (type === FIND_STRUCTURES) return containers.concat(links);
        if (type === FIND_MY_STRUCTURES) return links;
        if (type === FIND_DROPPED_RESOURCES) return drops;
        if (type === FIND_SOURCES) return [source];
        return [];
    } };
    const pile = (id, amount, x = 10, y = 11) => {
        const value = { id, resourceType: RESOURCE_ENERGY, amount, pos: pos(x, y) };
        objects[id] = value; return value;
    };
    const picker = suffix => ({ name: "H126-" + suffix, room: localRoom, memory: {}, store: store(0, 1000), pos: {
        getRangeTo: () => 0,
        findClosestByPath: (list, opts) => {
            searches++;
            const candidates = list === FIND_DROPPED_RESOURCES ? drops : list;
            return candidates.find(value => !opts || !opts.filter || opts.filter(value)) || null;
        },
        findClosestByRange: list => list[0] || null,
    } });
    const next = () => { Game.time++; searches = 0; for (const type of Object.keys(calls)) delete calls[type]; };
    try {
        Game.time += 1000; Game.creeps = {}; Memory.settings = {}; Memory.rooms[name] = {};
        Game.getObjectById = id => objects[id] || saved.get(id);
        objects[receiving.id] = receiving; objects[sourceBox.id] = sourceBox;
        containers = [sourceBox]; links = [receiving]; drops = [pile("126-overflow", 5000)];
        const firstHauler = picker("overflow");
        Game.creeps[firstHauler.name] = firstHauler; // Keep it alive for the target-cache GC.
        let picked = haul.pickLoad(firstHauler);
        assert(picked && picked.id === receiving.id && picked.dest === "storage", "0126: overflow under a source container yields to the receiving link");
        const cachedLink = picked;
        next();
        picked = haul.pickLoad(firstHauler);
        assert(picked === cachedLink && searches === 0, "0126: a covered overflow does not invalidate a cached link (same=" + (picked === cachedLink) + ", searches=" + searches + ", pick=" + JSON.stringify(picked) + ")");
        next();
        drops = [pile("126-exact500", 500, 12, 12)];
        const at500 = haul.pickLoad(picker("500"));
        next(); drops[0].amount = 501;
        const above500 = haul.pickLoad(picker("501"));
        assert(at500 && at500.id === receiving.id && above500 && above500.id === "126-exact500" && above500.tier === "bigDrop", "0126: only uncovered drops above 500 enter the first tier");
        next();
        const otherBox = { id: "126-other", structureType: STRUCTURE_CONTAINER, pos: pos(30, 30), store: store(0, 2000) };
        objects[otherBox.id] = otherBox;
        containers = [sourceBox, otherBox]; links = []; drops = [pile("126-small-covered", 300, 30, 30)];
        picked = haul.pickLoad(picker("small"));
        assert(picked && picked.id === sourceBox.id && picked.act === "withdraw", "0126: small drops under any container are excluded");
        next(); containers = []; links = [receiving]; drops = [pile("126-cache-drop", 300, 30, 30)];
        const changing = picker("changing");
        Game.creeps[changing.name] = changing;
        picked = haul.pickLoad(changing);
        assert(picked && picked.id === "126-cache-drop", "0126: uncovered small pickup can enter the target cache");
        next(); containers = [sourceBox, otherBox];
        picked = haul.pickLoad(changing);
        assert(picked && picked.id === receiving.id && picked.dest === "storage", "0126: a cached pickup covered by a container is reselected");
        next(); drops = [pile("126-shared-covered", 5000)];
        haul.pickLoad(picker("shared1")); haul.pickLoad(picker("shared2"));
        assert(calls[FIND_STRUCTURES] === 1 && calls[FIND_DROPPED_RESOURCES] === 1, "0126: container positions are shared by haulers within a tick");
        next(); containers = [];
        picked = haul.pickLoad(picker("removed"));
        assert(picked && picked.id === "126-shared-covered" && picked.tier === "bigDrop", "0126: container position index refreshes next tick");
    } finally {
        Game.time = saved.time; Game.creeps = saved.creeps; Game.getObjectById = saved.get; Memory.settings = saved.settings;
        if (saved.mem === undefined) delete Memory.rooms[name]; else Memory.rooms[name] = saved.mem;
    }
}

// ROADMAP 0124: usage stock and opportunistic market integration.
require("./marketHistoryCases")(PROJECT, assert);
require("./terminalFuelCases")(PROJECT, assert);
require("./stockPolicyCases")(PROJECT, assert);
// ROADMAP 0128: offline lab strategy search, physical-model regressions.
require("./labResearchCases")(PROJECT, assert);
require("./labPolicyCases")(PROJECT, assert);
require("./transitSafetyCases")(PROJECT, assert);
require("./claimRouteCases")(PROJECT, assert);
require("./claimDiagnosticsCases")(PROJECT, assert);
require("./keeperTransitCases")(PROJECT, assert);
require("./nativePathCases")(PROJECT, assert);
require("./routingBudgetCases")(PROJECT, assert);
require("./movementCpuCases")(PROJECT, assert);
require("./economyCpuCases")(PROJECT, assert);
require("./terminalLotCases")(PROJECT, assert);
require("./craftPurchaseCases")(PROJECT, assert);
require("./craftRecoveryCases")(PROJECT, assert);
require("./terminalIntentCases")(PROJECT, assert);
require("./recoveredBasisCases")(PROJECT, assert);
require("./economyCoordinationCpuCases")(PROJECT, assert);
require("./economyScaleCases")(PROJECT, assert);
require("./swingReferenceCpuCases")(PROJECT, assert);
require("./equivalenceCases")(PROJECT, assert);
require("./memoryCleanupCases")(PROJECT, assert);
require("./steadyStateCases")(PROJECT, assert);
require("./idleRepickCases")(PROJECT, assert);
require("./energyLedgerEngineCases")(PROJECT, assert);
require("./cpuAccountingCases")(PROJECT, assert);
require("./terminalHistoryCases")(PROJECT, assert);
require("./terminalTelemetryCases")(PROJECT, assert);
require("./assetStatsCases")(PROJECT, assert);
