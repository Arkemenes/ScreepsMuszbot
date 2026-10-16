"use strict";
// Read-only diagnosis: run current source in isolated synthetic worlds.
// No Screeps deployment, engine CPU estimate, or implementation of proposed fixes.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const crypto = require("crypto");
const root = path.resolve(__dirname, "../..");
function load(file, globals, dependencies) {
    const sandbox = Object.assign({ module: { exports: {} }, console,
        require(name) {
            if (!Object.prototype.hasOwnProperty.call(dependencies, name)) throw new Error("Unexpected dependency " + name);
            return dependencies[name];
        } }, globals);
    sandbox.global = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
    return { exported: sandbox.module.exports, sandbox };
}
const config = { get: (key, fallback) => fallback };
const active = (op) => op && !["completed", "cancelled", "failed"].includes(op.state);
function scanCase(rooms, consumers, ordersPerRoom, finalized) {
    let enumerations = 0, reads = 0, roomReads = 0;
    const table = {};
    for (let r = 0; r < rooms; r++) for (let i = 0; i < ordersPerRoom; i++) {
        table[r + ":" + i] = { id: r + ":" + i, kind: "sell", state: "listed", resourceType: "O",
            get sourceRoom() { roomReads++; return "R" + r; }, remaining: 100, marketOrderId: r + ":" + i };
    }
    for (let i = 0; i < finalized; i++) table["final:" + i] = { id: "final:" + i, state: "completed" };
    const operations = new Proxy(table, {
        ownKeys(target) { enumerations++; return Reflect.ownKeys(target); },
        get(target, key) { if (typeof key === "string" && Object.prototype.hasOwnProperty.call(target, key)) reads++; return target[key]; }
    });
    const Game = { time: 100, market: {} };
    const Memory = { terminalOps: { operations, nextId: 10000 } };
    const fuel = load("src/utils/terminalFuel.js", { Game, Memory, RESOURCE_ENERGY: "energy" }, {
        "./config": config, "./marketAccounting": { active },
        "./resourcePolicy": { target: () => 100000, commitments: () => ({}) }
    }).exported;
    const index = load("src/utils/terminalIndex.js", { Game, Memory }, {}).exported;
    function run(fn) {
        enumerations = reads = roomReads = 0;
        for (let r = 0; r < rooms; r++) for (let c = 0; c < consumers; c++) fn("R" + r);
        return { enumerations, operationReads: reads, sourceRoomReads: roomReads };
    }
    const room = (name) => ({ name, storage: { store: { energy: 200000 } }, terminal: { store: { energy: 10000 } } });
    const fuelCold = run((name) => assert.strictEqual(fuel.budget(room(name)).keep, 0));
    const fuelWarm = run((name) => assert.strictEqual(fuel.budget(room(name)).keep, 0));
    Game.time++;
    const fuelNextTick = run((name) => assert.strictEqual(fuel.budget(room(name)).keep, 0));
    const indexCold = run((name) => assert.strictEqual(index.forRoom(name).length, ordersPerRoom));
    const indexWarm = run((name) => assert.strictEqual(index.forRoom(name).length, ordersPerRoom));
    assert.strictEqual(fuelCold.enumerations, rooms * consumers);
    assert.strictEqual(fuelWarm.operationReads, rooms * consumers * (rooms * ordersPerRoom + finalized));
    assert.strictEqual(fuelNextTick.operationReads, fuelWarm.operationReads);
    assert.strictEqual(indexCold.enumerations, 1);
    assert.strictEqual(indexWarm.enumerations, 0);
    assert.strictEqual(indexWarm.sourceRoomReads, rooms * consumers * rooms * ordersPerRoom);
    return { rooms, consumers, ordersPerRoom, finalized, fuelCold, fuelWarm, fuelNextTick, indexCold, indexWarm };
}
const matrix = [];
for (const rooms of [3, 5, 10]) for (const consumers of [3, 7, 10]) for (const orders of [0, 5, 20]) {
    matrix.push(scanCase(rooms, consumers, orders, 0));
}
const retained = [0, 500, 5000].map((n) => scanCase(10, 10, 20, n));
function duplicateHarvest() {
    class Creep {}
    class Source {}
    class Structure {}
    class Ruin {}
    class Tombstone {}
    class Resource {}
    const target = new Source();
    load("src/prototypes/creep.js", { Creep, Source, Structure, Ruin, Tombstone, Resource,
        Game: { getObjectById: () => target }, OK: 0, ERR_NOT_IN_RANGE: -9, ERR_TIRED: -11,
        RESOURCE_ENERGY: "energy" }, { "../utils/energyLedger": {} });
    const creep = new Creep();
    let calls = 0;
    Object.assign(creep, { pos: { isNearTo: () => true }, harvest: () => { calls++; return 0; },
        store: { getFreeCapacity: () => 50 }, popState() { throw new Error("Unexpected state pop"); } });
    creep.runGetEnergy("source");
    assert.strictEqual(calls, 2);
    return { successfulCallsInOneStateInvocation: calls, engineIntentsNotSimulated: true };
}
function deferredHistorySerialization() {
    let serializations = 0;
    const RawMemory = { segments: { 9: "" } };
    for (let i = 10; i < 19; i++) RawMemory.segments[i] = "plan";
    const store = load("src/utils/marketHistoryStore.js", {
        Game: { time: 100 }, RawMemory,
        JSON: { parse: JSON.parse, stringify(...args) { serializations++; return JSON.stringify(...args); } }
    }, {}).exported;
    const history = {};
    for (let r = 0; r < 100; r++) history["resource" + r] = Array.from({ length: 100 }, (_, i) =>
        ({ tick: i, buyPrice: 30.125, sellPrice: 31.125, buyVolume: 15000, sellVolume: 25000 }));
    const attempts = [];
    for (let i = 0; i < 3; i++) {
        serializations = 0;
        const saved = store.save(history);
        const status = store.status();
        assert.strictEqual(saved, false);
        assert.strictEqual(status.error, "segment-write-budget");
        assert(serializations >= 10000);
        attempts.push({ saved, serializations, reason: status.error });
    }
    return { rows: 10000, attempts, syntheticRepeatedSegmentContention: true };
}
function duplicateBuilderWork() {
    class Creep {}
    class ConstructionSite {}
    class Structure {}
    const site = new ConstructionSite();
    Object.assign(site, { id: "site", pos: { x: 10, y: 10, roomName: "R" }, progress: 0, progressTotal: 100 });
    let buildCalls = 0, credited = 0;
    const energyLedger = { creditBuild() { credited++; } };
    const Game = { getObjectById: () => site };
    load("src/prototypes/creep.js", { Creep, ConstructionSite, Structure, Game,
        OK: 0, ERR_NOT_IN_RANGE: -9, RESOURCE_ENERGY: "energy" }, { "../utils/energyLedger": energyLedger });
    const dependencies = {
        "../utils/energy": {}, "../utils/population": {}, "../utils/census": {},
        "../utils/roomCache": { constructionSites: () => [site] },
        "../utils/damagedStructures": { critical: () => [] },
        "../utils/cpuMeter": { span: (name, fn) => fn() },
        "../utils/combat": { takeCover: () => false }, "../rooms/needs": {},
        "../utils/reservations": {}, "../utils/traffic": {}, "../utils/rampartRepair": {},
        "../utils/resourceTiers": { getEconomySnapshot: () => ({ state: "healthy" }) },
        "../utils/names": {}, "../utils/energyLedger": energyLedger, "../utils/config": config
    };
    const builder = load("src/roles/builder.js", { Game, Memory: {}, RESOURCE_ENERGY: "energy", OK: 0,
        _: { sortBy: (values, key) => values.slice().sort((a, b) => key(a) - key(b)) } }, dependencies).exported;
    const creep = new Creep();
    Object.assign(creep, { room: { name: "R" }, pos: { x: 10, y: 10, roomName: "R" },
        store: { energy: 50, getUsedCapacity: () => 50 }, getState: () => "Build",
        invokeState() { return this.runBuild(site.id); }, build() { buildCalls++; return 0; }, say() {} });
    builder.run(creep);
    assert.strictEqual(buildCalls, 2);
    assert.strictEqual(credited, 2);
    return { buildCalls, creditBuildCalls: credited, sameTarget: site.id, engineIntentsNotSimulated: true };
}
function startupAverage() {
    const Game = { time: 1, shard: { name: "probe" }, cpu: { bucket: 9000, limit: 20 } };
    const acc = load("src/utils/cpuAccounting.js", { Game }, { "./config": config }).exported;
    acc.begin();
    const results = [];
    for (let i = 1; i <= 26; i++) {
        const cost = i === 1 ? 197 : 17;
        acc.end(cost - 2);
        Game.cpu.bucket += 20 - cost;
        Game.time++;
        acc.begin();
        if ([1, 7, 14, 26].includes(i)) results.push(acc.snapshot());
    }
    return { hypotheticalInputNotLiveReconstruction: true, results };
}
function sourceInventory() {
    const files = [];
    function visit(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.name.endsWith(".js")) files.push(file);
        }
    }
    visit(path.join(root, "src"));
    return files.sort().map((file) => {
        const content = fs.readFileSync(file);
        const lines = content.toString("utf8").split(/\r?\n/);
        const hits = {};
        const patterns = { globalCreepAccess: /Game\.creeps/, findCall: /\.find\(/,
            pathSelection: /findClosestByPath|PathFinder\.search/,
            serialization: /JSON\.(stringify|parse)/, sorting: /\.sort\(|_\.sortBy/ };
        for (const [label, pattern] of Object.entries(patterns)) {
            hits[label] = [];
            lines.forEach((line, i) => { if (pattern.test(line)) hits[label].push(i + 1); });
        }
        return { file: path.relative(root, file).replace(/\\/g, "/"), bytes: content.length,
            sha256: crypto.createHash("sha256").update(content).digest("hex"), hits };
    });
}
const inventory = sourceInventory();
const results = { inventory, matrix, retained, duplicateHarvest: duplicateHarvest(), duplicateBuilderWork: duplicateBuilderWork(),
    deferredHistorySerialization: deferredHistorySerialization(), startupAverage: startupAverage() };
if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify({ sourceFiles: inventory.length, scenarios: matrix.length, largest: matrix[matrix.length - 1],
    retained: retained.map((r) => ({ finalized: r.finalized, fuelReads: r.fuelWarm.operationReads,
    indexReads: r.indexWarm.operationReads })), duplicateHarvest: results.duplicateHarvest, duplicateBuilderWork: results.duplicateBuilderWork,
    deferredHistorySerialization: results.deferredHistorySerialization,
    startupAverage: results.startupAverage.results.map((r) => ({ ticks: r.ticks, used: r.used, script: r.scriptUsed })) }, null, 2));
