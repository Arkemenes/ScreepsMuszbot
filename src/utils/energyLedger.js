// Per-room energy spend accounting (ROADMAP 0081) - where the economy's
// energy goes (spawn/build/repair/upgrade/tower), not just how much is in
// stock. snapshot() reports the trailing SUM over the last
// energyLedger.windowTicks ticks (default 60 - "last 60 seconds", the usual
// 1-tick-~1-second approximation used elsewhere in this codebase, there's
// no real wall-clock signal available), not just the current tick, so a
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

let tick = -1;
let byRoom = {}; // current (still accumulating) tick, per room
const history = {}; // roomName -> [{tick, categories}], oldest first

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
    return config.get("energyLedger.windowTicks", 60);
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

    if (tick !== -1) {
        // archive the tick that just finished accumulating
        for (const roomName of Object.keys(byRoom)) {
            const entries = history[roomName] || (history[roomName] = []);
            entries.push({ tick, categories: byRoom[roomName] });
        }
    }

    tick = Game.time;
    byRoom = {};

    const cutoff = tick - windowTicks() + 1;
    for (const roomName of Object.keys(history)) trim(roomName, cutoff);
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

// base power-per-WORK-part for each action (native engine constants) -
// boost multiplier, if any, is read live per part from BOOSTS[WORK][boost]
// (never hardcoded - a boost only ever affects the one action it lists)
const BASE_POWER = {
    build: BUILD_POWER,
    repair: REPAIR_POWER,
    upgradeController: UPGRADE_CONTROLLER_POWER,
};

function workPower(creep, action) {
    let total = 0;
    for (const part of creep.body) {
        if (part.type !== WORK || part.hits <= 0) continue;
        let power = BASE_POWER[action];
        const boost = part.boost && BOOSTS[WORK] && BOOSTS[WORK][part.boost];
        if (boost && typeof boost[action] === "number") power *= boost[action];
        total += power;
    }
    return total;
}

// call these right after a build()/repair()/upgradeController() call that
// returned OK - amount is an estimate (WORK power, capped by the energy the
// creep had going in and by the target's remaining need), not a store diff,
// since the store hasn't actually changed yet from this script's point of
// view (see the module comment above)
function creditBuild(creep, site) {
    const amount = Math.min(
        workPower(creep, "build"),
        creep.store[RESOURCE_ENERGY],
        site.progressTotal - site.progress
    );
    record(creep.room.name, "build", amount);
}

function creditRepair(creep, target) {
    const amount = Math.min(
        workPower(creep, "repair"),
        creep.store[RESOURCE_ENERGY],
        target.hitsMax - target.hits
    );
    recordRepair(creep.room.name, target.structureType, amount);
}

function creditUpgrade(creep, controller) {
    const amount = Math.min(workPower(creep, "upgradeController"), creep.store[RESOURCE_ENERGY]);
    record(creep.room.name, "upgrade", amount);
}

// a tower always spends exactly TOWER_ENERGY_COST per action (or whatever's
// left, if less) - no diff needed, this is a fixed engine cost
function creditTower(tower, category) {
    record(tower.room.name, category, Math.min(tower.store[RESOURCE_ENERGY], TOWER_ENERGY_COST));
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
    const current = byRoom[roomName];
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
};
