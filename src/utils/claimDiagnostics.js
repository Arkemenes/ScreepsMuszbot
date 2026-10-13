// Keep one bounded historical observation/result, never live game objects.
const CODE_NAMES = {
    0: "OK", "-1": "ERR_NOT_OWNER", "-2": "ERR_NO_PATH", "-3": "ERR_NAME_EXISTS",
    "-4": "ERR_BUSY", "-5": "ERR_NOT_FOUND", "-6": "ERR_NOT_ENOUGH_RESOURCES",
    "-7": "ERR_INVALID_TARGET", "-8": "ERR_FULL", "-9": "ERR_NOT_IN_RANGE",
    "-10": "ERR_INVALID_ARGS", "-11": "ERR_TIRED", "-12": "ERR_NO_BODYPART",
    "-14": "ERR_RCL_NOT_ENOUGH", "-15": "ERR_GCL_NOT_ENOUGH",
};

function snapshot(creep, phase, code, moveCode) {
    const pos = creep.pos || {};
    return {
        creep: creep.name, tick: Game.time, room: creep.room && creep.room.name,
        x: pos.x, y: pos.y, ttl: creep.ticksToLive, hits: creep.hits,
        fatigue: creep.fatigue, bucket: Game.cpu && Game.cpu.bucket,
        phase, code, moveCode, retreatTo: creep.memory._routeRetreatTo,
    };
}

function observe(creep, phase, code, moveCode) {
    const target = Memory.claimTarget;
    if (creep.memory.mission !== "claim" || !target ||
        target.room !== creep.memory.targetRoom) return;
    target.lastSeen = snapshot(creep, phase, code, moveCode);
}

function record(target, reason, code, creep) {
    const result = {
        room: target.room, from: target.from, tick: Game.time, reason,
        code, codeName: code === undefined ? undefined : (CODE_NAMES[code] || "UNKNOWN_RETURN_CODE"),
        lastSeen: target.lastSeen || (creep ? snapshot(creep, reason, code) : null),
    };
    const controller = creep && creep.room && creep.room.controller;
    if (controller) {
        result.owner = controller.owner && controller.owner.username;
        result.reservation = controller.reservation && controller.reservation.username;
        result.upgradeBlocked = controller.upgradeBlocked;
    }
    Memory.lastClaimResult = result;
    return result;
}

function finish(creep, reason, code) {
    // The role may keep running until TTL expires after its order was cleared.
    if (creep.memory._claimReported === creep.memory.targetRoom) return;
    creep.memory._claimReported = creep.memory.targetRoom;
    const target = Memory.claimTarget && Memory.claimTarget.room === creep.memory.targetRoom
        ? Memory.claimTarget
        : { room: creep.memory.targetRoom, from: creep.memory.home };
    observe(creep, reason, code);
    const result = record(target, reason, code, creep);
    console.log(`[claim] ${result.room}: ${reason}` +
        (code === undefined ? "" : ` (${result.codeName}, ${code})`) +
        `; creep=${creep.name}; lastSeen=${JSON.stringify(result.lastSeen)}`);
}

function abandon(target) {
    record(target, "creep_missing");
    console.log(`[claim] ${target.room}: claimer disappeared; cause unconfirmed; ` +
        `lastSeen=${JSON.stringify(target.lastSeen || null)}; use claimStatus()`);
}

function cancel(target) {
    record(target, "cancelled");
}

function status() {
    // Return a detached, JSON-safe snapshot for console inspection.
    return JSON.parse(JSON.stringify({
        pending: Memory.claimTarget || null,
        lastResult: Memory.lastClaimResult || null,
    }));
}

module.exports = { observe, finish, abandon, cancel, status };
