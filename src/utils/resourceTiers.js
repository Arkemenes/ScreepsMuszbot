// Single reserve floor shared by every OPTIONAL energy spend in the room
// (ROADMAP 0054) - replaces two independently-tuned thresholds that used to
// answer the same question in different places (tower.rampartStorageFillGate
// at 50%, hauler.storageReserveFloor at 5%) with one number:
// logistics.reserveRatio, 1% of the storage's own capacity. Same null-safe
// shape as the functions it replaces - never throws without a storage
// (constitution §3).
const config = require("./config");
const roomCache = require("./roomCache");
const { planEntriesAt } = require("./plan");

let economyCacheTick = -1;
let economyCache = {};

function isSourceDefenseTower(structure) {
    const entries = planEntriesAt(
        structure.room.name,
        structure.pos.x,
        structure.pos.y
    );
    return !!(
        entries &&
        entries.some(
            (entry) =>
                entry.structureType === STRUCTURE_TOWER && entry.sourceDefense
        )
    );
}

function reserveFloor(room) {
    if (!room.storage) return 0;
    const capacity = room.storage.store.getCapacity(RESOURCE_ENERGY);
    if (!capacity) return 0;
    return capacity * config.get("logistics.reserveRatio", 0.01);
}

function aboveReserve(room) {
    if (!room.storage) return false;
    return room.storage.store.energy > reserveFloor(room);
}

// A much higher bar than aboveReserve's thin 1% floor - "the room has real
// abundance to spare", not just "not literally empty". Reuses
// logistics.storageSatisfactoryRatio (ROADMAP 0072, user request) - the
// same 50% fill bar structures/link.js's collector already treats as
// "storage is comfortable enough that the controller link can win by
// default" - instead of inventing a second, differently-tuned "abundant"
// number that answers a question this codebase already had a name for.
// Used by structures/tower.js to gate the one genuinely unbounded spend
// (hardening a rampart/wall past its 1% target, ROADMAP 0068/0069) behind
// something stronger than the thin reserve floor - a tower reacts every
// tick with no population cost to self-limit it, unlike roles/builder.js.
function isStorageAbundant(room) {
    if (!room.storage) return false;
    const capacity = room.storage.store.getCapacity(RESOURCE_ENERGY);
    if (!capacity) return false;
    return (
        room.storage.store.energy >=
        capacity * config.get("logistics.storageSatisfactoryRatio", 0.5)
    );
}

function storageRatio(room) {
    if (!room || !room.storage) return null;
    const capacity = room.storage.store.getCapacity(RESOURCE_ENERGY);
    if (!capacity) return null;
    return room.storage.store.energy / capacity;
}

// Defensive repair uses stricter, purpose-specific gates than the general
// economy state. Keep these comparisons here so builder and tower cannot
// drift apart, and do not change isStorageAbundant(): its 50% threshold is
// also part of link/economy policy.
function isStorageAbove(room, ratio) {
    const current = storageRatio(room);
    return current !== null && current > ratio;
}

function isStorageAtLeast(room, ratio) {
    const current = storageRatio(room);
    return current !== null && current >= ratio;
}

// The controller is genuinely at risk of downgrading - the one condition
// that overrides every other reserve/stability gate in this module (losing
// RCL always outranks a comfortable buffer). Shared by structures/link.js
// (which non-collector link the collector feeds) and roles/upgrader.js
// (whether the upgrader may spend room-wide storage/container energy while
// the room itself isn't stable yet) - single definition of "critical" so
// the two never drift apart (constitution §5). Null-safe: no controller, no
// RCL's own downgrade table, or no numeric ticksToDowngrade yet (a
// just-claimed controller) all read as "not critical", never throw.
function controllerCritical(room) {
    const ctrl = room.controller;
    if (!ctrl || !ctrl.my || typeof ctrl.ticksToDowngrade !== "number") {
        return false;
    }
    const limit = CONTROLLER_DOWNGRADE[ctrl.level];
    if (!limit) return false;
    return (
        ctrl.ticksToDowngrade <
        limit * config.get("logistics.controllerCriticalDowngradeRatio", 0.1)
    );
}

function computeEconomySnapshot(room) {
    if (!room) return 0;
    let count = 0;
    let hasHungrySpawn = false;

    if (controllerCritical(room)) count += 1;

    if (room.storage && room.storage.store.energy <= reserveFloor(room)) {
        count += 1;
    }

    if (typeof FIND_MY_STRUCTURES !== "undefined") {
        const structures = roomCache.myStructures(room);
        const spawnsAndExtensions = structures.filter((s) =>
            (s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        hasHungrySpawn = spawnsAndExtensions.length > 0;
        if (spawnsAndExtensions.length) count += spawnsAndExtensions.length;

        const criticalTowers = structures.filter((s) =>
            s.structureType === STRUCTURE_TOWER &&
            !isSourceDefenseTower(s) &&
            s.store[RESOURCE_ENERGY] <
                s.store.getCapacity(RESOURCE_ENERGY) *
                    config.get("tower.criticalRatio", 0.5)
        );
        if (criticalTowers.length) count += criticalTowers.length;
    }

    const roomMem = Memory.rooms && Memory.rooms[room.name];
    if (roomMem && roomMem.defenseActive) count += 1;

    const reason = controllerCritical(room)
        ? "controller"
        : Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].defenseActive
                ? "defense"
            : hasHungrySpawn
                ? "spawn"
                : room.storage && room.storage.store.energy <= reserveFloor(room)
                    ? "reserve"
                    : "none";

    const state = count > 0
        ? "critical"
        : isStorageAbundant(room)
            ? "abundant"
            : "stable";

    return {
        state,
        reason,
        criticalConsumers: Math.max(0, count),
    };
}

function getEconomySnapshot(room) {
    if (!room) {
        return { state: "stable", reason: "none", criticalConsumers: 0 };
    }
    if (economyCacheTick !== Game.time) {
        economyCacheTick = Game.time;
        economyCache = {};
    }
    return economyCache[room.name] ||
        (economyCache[room.name] = computeEconomySnapshot(room));
}

function getCriticalConsumers(room) {
    return getEconomySnapshot(room).criticalConsumers;
}

function getEconomyReason(room) {
    return getEconomySnapshot(room).reason;
}

function getEconomyState(room) {
    return getEconomySnapshot(room).state;
}

module.exports = {
    reserveFloor,
    aboveReserve,
    isStorageAbundant,
    isStorageAbove,
    isStorageAtLeast,
    controllerCritical,
    getEconomySnapshot,
    getCriticalConsumers,
    getEconomyReason,
    getEconomyState,
};
