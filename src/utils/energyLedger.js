// Per-room energy spend accounting (ROADMAP 0081) - where the economy's
// energy goes (spawn/build/repair/upgrade/tower), not just how much is in
// stock. snapshot() reports the trailing SUM over the last
// energyLedger.windowTicks game ticks (default 60), not wall-clock seconds, so a
// single Grafana sample stays meaningful even if it's read once every few
// ticks. Heap-resident, same pattern as utils/traffic.js/census - never
// persisted to Memory itself, only its snapshot is (utils/stats.js).
//
// Bug real corrigido no mesmo dia (usuário reportou em produção: torres
// reparando, creeps construindo, spawns nascendo, mas energySpent sempre
// 0): a primeira versão media por diff de store[RESOURCE_ENERGY] antes/
// depois do intent (build/repair/upgradeController) - funciona nos mocks
// do smoke test (mutam o store na hora), mas NUNCA no motor real: todo
// intent de creep é só enfileirado durante a execução do script e só é
// aplicado pelo servidor depois que TODOS os jogadores terminam a tick,
// então `creep.store` lido logo após chamar `build()` ainda reflete o
// valor de ANTES da ação - a diferença é sempre 0. Substituído por uma
// estimativa determinística: WORK parts vivas × BUILD_POWER/REPAIR_POWER/
// UPGRADE_CONTROLLER_POWER (boost lido ao vivo de BOOSTS[WORK][part.boost],
// nunca hardcoded - mesmo princípio de utils/combat.js's incomingDps),
// limitada pela energia que o creep tinha ANTES de agir e pelo trabalho
// restante do alvo. Torre/renew usam o mesmo princípio: TOWER_ENERGY_COST/
// a fórmula de renewCreep são constantes conhecidas de antemão, não
// dependem de observar o store depois.

const config = require("./config");
const workModel = require("./energyWork");

let tick = -1;
let byRoom = {}; // current (still accumulating) tick, per room
const history = {}; // roomName -> [{tick, categories}], oldest first
let work = null, finalized = false, observeWork = true, observerErrors = 0;
let startedTick = -1;
let resolutionFailed = false;
const emptyWork = { rooms: {}, events: [] };
const qualityHistory = []; // Only faults/off/gaps within the same existing heap window.
const hooked = Symbol("energyLedgerHook");
const auxiliaryActions = ["drop", "transfer", "withdraw", "pickup", "cancelOrder",
    "heal", "rangedHeal", "dismantle", "attackController", "harvest", "suicide"];
const coverageActions = ["drop", "transfer", "withdraw", "pickup", "cancelOrder"];

const CATEGORIES = [
    "spawn",
    "renew",
    "build",
    "repairNormal",
    "repairRampart",
    "repairWall",
    "upgrade",
    "towerAttack",
    "towerHeal",
    "towerRepair",
];

function windowTicks() {
    const value = config.get("energyLedger.windowTicks", 60);
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : 60;
}

// drop entries fallen out of the trailing window - called both when a tick
// is archived and on every snapshot(), so a room that's only ever read
// (never recorded to) still gets trimmed instead of growing forever
function trim(roomName, cutoffTick) {
    const entries = history[roomName];
    if (!entries) return;
    while (entries.length && entries[0].tick < cutoffTick) entries.shift();
}

function ensureTick() {
    if (tick === Game.time) return;

    if (Game.time < tick) {
        for (const name of Object.keys(history)) delete history[name];
        qualityHistory.length = 0;
        startedTick = Game.time;
    } else if (tick !== -1) {
        // archive the tick that just finished accumulating
        const current = currentRooms();
        const observations = resolvedWork().rooms;
        for (const roomName of Object.keys(current)) {
            const entries = history[roomName] || (history[roomName] = []);
            entries.push({ tick, categories: current[roomName], observation: observations[roomName] });
        }
        if (observerErrors || !observeWork) qualityHistory.push({ tick, through: tick, errors: observerErrors, disabled: !observeWork });
        if (Game.time > tick + 1) qualityHistory.push({ tick: tick + 1, through: Game.time - 1, gap: true });
    }

    tick = Game.time;
    if (startedTick === -1) startedTick = tick;
    byRoom = {};
    work = workModel.create(tick);
    finalized = false;
    observerErrors = 0;
    resolutionFailed = false;
    observeWork = config.get("energyLedger.observeWork", true) !== false;

    const cutoff = tick - windowTicks() + 1;
    for (const roomName of Object.keys(history)) trim(roomName, cutoff);
    while (qualityHistory.length && qualityHistory[0].through < cutoff) qualityHistory.shift();
}

function record(roomName, category, amount) {
    if (!amount || amount <= 0) return;
    ensureTick();
    const entry = byRoom[roomName] || (byRoom[roomName] = {});
    entry[category] = (entry[category] || 0) + amount;
}

// repair spend is split by structure type - rampart/wall have their own
// hitsMax-scaled tiers (utils/rampartRepair.js), everything else is "normal"
function categoryForRepair(structureType) {
    if (structureType === STRUCTURE_RAMPART) return "repairRampart";
    if (structureType === STRUCTURE_WALL) return "repairWall";
    return "repairNormal";
}

function recordRepair(roomName, structureType, amount) {
    record(roomName, categoryForRepair(structureType), amount);
}

// Keep observer failures from changing an action's return or aborting a worker.
function observeCall(creep, method, args, original) {
    let state, capturedTarget;
    try {
        ensureTick();
        if (observeWork) {
            state = work.stateFor(creep);
            if (state && (method === "build" || method === "repair" || method === "upgradeController")) {
                capturedTarget = workModel.targetData(method === "upgradeController" ? "upgrade" : method, args[0], tick);
                for (const name of coverageActions) {
                    if (!creep[name] || !creep[name][hooked]) { work.uncovered(state); break; }
                }
            }
        }
    } catch (_) { observerErrors++; }
    const status = original.apply(creep, args);
    if (status === OK && observeWork) {
        try {
            if (method === "cancelOrder") work.cancel(state, args[0]);
            else if (method === "transfer" && args[0] && args[0].structureType === STRUCTURE_CONTROLLER && args[1] === RESOURCE_ENERGY) {
                work.accept(state, "upgradeController", [args[0]]);
            } else work.accept(state, method, args, capturedTarget);
            if (method === "transfer" && args[1] === RESOURCE_ENERGY && args[0]) work.incoming(args[0]);
            finalized = false;
        } catch (_) { observerErrors++; }
    }
    return status;
}

// Audited WORK call sites use invoke so even a stub/provider observes pre-intent data.
function invoke(creep, method, target) { return observeCall(creep, method, [target], creep[method]); }

function installHooks(prototype) {
    for (const method of auxiliaryActions) {
        const original = prototype[method];
        if (typeof original !== "function" || original[hooked]) continue;
        const wrapped = function (...args) { return observeCall(this, method, args, original); };
        wrapped[hooked] = true;
        prototype[method] = wrapped;
    }
}

// Compatibility API: post-call data cannot certify complete pre-intent coverage.
function credit(creep, method, target) {
    ensureTick();
    if (!observeWork) return;
    const state = work.stateFor(creep);
    work.uncovered(state);
    work.accept(state, method, [target]);
    finalized = false;
}
function creditBuild(creep, target) { credit(creep, "build", target); }
function creditRepair(creep, target) { credit(creep, "repair", target); }
function creditUpgrade(creep, target) { credit(creep, "upgradeController", target); }

function currentRooms() {
    const result = {};
    const names = new Set([...Object.keys(byRoom), ...Object.keys(resolvedWork().rooms)]);
    for (const name of names) result[name] = currentRoom(name);
    return result;
}

function currentRoom(name) {
    const entry = Object.assign({}, byRoom[name]);
    const observation = resolvedWork().rooms[name];
    if (observation) for (const [category, amount] of Object.entries(observation.categories)) entry[category] = (entry[category] || 0) + amount;
    return entry;
}

function resolvedWork(includeEvents = false) {
    if (resolutionFailed) return emptyWork;
    try { return work.resolve(includeEvents); } catch (_) {
        observerErrors++;
        resolutionFailed = true;
        return emptyWork;
    }
}

function finalize() { ensureTick(); resolvedWork(); finalized = true; }

function events() { ensureTick(); return resolvedWork(true).events.map(event => Object.assign({}, event)); }

function snapshotInfo(roomName) {
    ensureTick();
    trim(roomName, tick - windowTicks() + 1);
    const observation = resolvedWork().rooms[roomName];
    const result = { version: 1, throughTick: tick, windowTicks: windowTicks(),
        kind: "estimated", confirmed: null, partial: !finalized, workEnabled: observeWork,
        complete: observeWork && observerErrors === 0,
        observerErrors, disabledTicks: observeWork ? 0 : 1, gapTicks: 0,
        coverageStartTick: Math.max(startedTick, tick - windowTicks() + 1),
        actions: 0, unknownActions: 0, effects: { build: 0, repair: 0, upgrade: 0 } };
    const add = observation => {
        if (!observation) return;
        result.actions += observation.actions;
        result.unknownActions += observation.unknown;
        for (const action of ["build", "repair", "upgrade"]) result.effects[action] += observation.effects[action];
    };
    for (const entry of history[roomName] || []) add(entry.observation);
    add(observation);
    const cutoff = tick - windowTicks() + 1;
    for (const entry of qualityHistory) {
        const duration = Math.max(0, Math.min(entry.through, tick) - Math.max(entry.tick, cutoff) + 1);
        if (!duration) continue;
        result.observerErrors += entry.errors || 0;
        if (entry.disabled) result.disabledTicks += duration;
        if (entry.gap) result.gapTicks += duration;
    }
    result.complete = result.complete && result.coverageStartTick <= cutoff && !result.observerErrors &&
        !result.disabledTicks && !result.gapTicks && !result.unknownActions;
    return result;
}

// a tower always spends exactly TOWER_ENERGY_COST per action (or whatever's
// left, if less) - no diff needed, this is a fixed engine cost
function creditTower(tower, category, target) {
    const amount = Math.min(tower.store[RESOURCE_ENERGY], TOWER_ENERGY_COST);
    record(tower.room.name, category, amount);
    if (amount > 0 && category === "towerRepair" && target && observeWork) {
        try { work.externalTarget(target); finalized = false; } catch (_) { observerErrors++; }
    }
}

// spawn.renewCreep()'s energy cost is a fixed formula (native engine rule),
// not something that shows up as a store diff either
function renewCost(body) {
    const cost = _.sum(body, (part) => BODYPART_COST[part.type]);
    return Math.ceil(cost / 2.5 / body.length);
}

// always the full category set, default 0 - a sparse shape would leave
// Grafana series with gaps whenever a category goes quiet for a window
function snapshot(roomName) {
    ensureTick();

    const result = {};
    for (const category of CATEGORIES) result[category] = 0;

    const cutoff = tick - windowTicks() + 1;
    trim(roomName, cutoff);
    const entries = history[roomName];
    if (entries) {
        for (const entry of entries) {
            for (const category of CATEGORIES) {
                result[category] += entry.categories[category] || 0;
            }
        }
    }

    // the current tick is still accumulating (hasn't been archived yet) but
    // is inside the window too - it must count
    const current = currentRoom(roomName);
    if (current) {
        for (const category of CATEGORIES) result[category] += current[category] || 0;
    }

    return result;
}

module.exports = {
    record,
    recordRepair,
    creditBuild,
    creditRepair,
    creditUpgrade,
    creditTower,
    renewCost,
    snapshot,
    snapshotInfo,
    invoke,
    installHooks,
    finalize,
    events,
};
