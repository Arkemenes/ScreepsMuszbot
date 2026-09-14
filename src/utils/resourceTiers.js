// Single reserve floor shared by every OPTIONAL energy spend in the room
// (ROADMAP 0054) - replaces two independently-tuned thresholds that used to
// answer the same question in different places (tower.rampartStorageFillGate
// at 50%, hauler.storageReserveFloor at 5%) with one number:
// logistics.reserveRatio, 1% of the storage's own capacity. Same null-safe
// shape as the functions it replaces - never throws without a storage
// (constitution §3).
const config = require("./config");

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

module.exports = { reserveFloor, aboveReserve, controllerCritical };
