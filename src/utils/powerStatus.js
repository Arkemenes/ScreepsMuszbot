"use strict";
const config = require("./config");
const roomCache = require("./roomCache");
const labAmount = require("./labReactionAmount");
const terminalCost = require("./terminalPowerCost");
function stock(object, resource) { return object && object.store && object.store[resource] || 0; }
function effects(object) {
    return (object && object.effects || []).filter((e) => e.ticksRemaining > 0)
        .map((e) => ({ effect: e.effect, level: e.level, ticksRemaining: e.ticksRemaining }));
}
function info(power) { return typeof POWER_INFO !== "undefined" && POWER_INFO[power] || null; }
function definition(power) {
    const value = info(power);
    return value ? { id: power, ops: value.ops, duration: value.duration, cooldown: value.cooldown,
        effect: Array.isArray(value.effect) ? value.effect.slice() : value.effect } : null;
}
function report(roomName) {
    const ops = typeof RESOURCE_OPS === "undefined" ? "ops" : RESOURCE_OPS;
    const generate = typeof PWR_GENERATE_OPS === "undefined" ? null : PWR_GENERATE_OPS;
    const lab = typeof PWR_OPERATE_LAB === "undefined" ? null : PWR_OPERATE_LAB;
    const terminal = typeof PWR_OPERATE_TERMINAL === "undefined" ? null : PWR_OPERATE_TERMINAL;
    const operators = Object.values(Game.powerCreeps || {}).map((pc) => {
        const skill = pc.powers && pc.powers[generate], generation = info(generate);
        const amount = skill && generation && generation.effect && generation.effect[skill.level - 1];
        return { name: pc.name, className: pc.className, level: pc.level, room: pc.room && pc.room.name || null,
            shard: pc.shard || null, ticksToLive: pc.ticksToLive || null, spawnCooldownTime: pc.spawnCooldownTime || null,
            ops: stock(pc, ops), idealOpsPer1000Ticks: amount && generation.cooldown ? amount * 1000 / generation.cooldown : 0,
            powers: Object.fromEntries(Object.entries(pc.powers || {}).map(([id, value]) => [id, { level: value.level, cooldown: value.cooldown }])) };
    });
    const rooms = Object.values(Game.rooms || {}).filter((r) => r.controller && r.controller.my && (!roomName || r.name === roomName)).map((room) => {
        const structures = roomCache.myStructures(room);
        const labs = structures.filter((s) => s.structureType === STRUCTURE_LAB);
        const spawns = structures.filter((s) => s.structureType === STRUCTURE_POWER_SPAWN);
        return { name: room.name, powerEnabled: !!room.controller.isPowerEnabled,
            opsStored: stock(room.storage, ops) + stock(room.terminal, ops), opsFreeConfirmed: null,
            terminal: room.terminal ? { id: room.terminal.id, cooldown: room.terminal.cooldown, energy: stock(room.terminal, "energy"),
                freightMultiplier: terminalCost.multiplier(room.terminal), effects: effects(room.terminal) } : null,
            labs: labs.map((s) => ({ id: s.id, cooldown: s.cooldown, reactionAmount: labAmount.amount(labAmount.snapshot(s)),
                mineralType: s.mineralType || null, mineralAmount: stock(s, s.mineralType), effects: effects(s) })),
            powerSpawns: spawns.map((s) => ({ id: s.id, power: stock(s, "power"), energy: stock(s, "energy") })) };
    });
    const gpl = Game.gpl || {};
    const meter = Memory.stats && Memory.stats.cpu && Memory.stats.cpu.meter;
    return { version: 1, tick: Game.time, mode: "read-only", automatedOperatorImplemented: false,
        gpl: { level: gpl.level === undefined ? null : gpl.level, progress: gpl.progress === undefined ? null : gpl.progress,
            progressTotal: gpl.progressTotal === undefined ? null : gpl.progressTotal },
        cpu: { limit: Game.cpu.limit, bucket: Game.cpu.bucket, publishedUsed: meter && meter.used !== undefined ? meter.used : null },
        reuseOrderBook: config.get("terminalOps.reuseOrderBook", true),
        legacyProcessPowerEnabled: config.get("powerSpawn.enabled", true),
        definitions: { lab: definition(lab), terminal: definition(terminal), generateOps: definition(generate) },
        operators, rooms, investmentReady: false,
        transfers: Object.values(Memory.terminalOps && Memory.terminalOps.operations || {})
            .filter((op) => op.kind === "transfer" && !["completed", "failed", "cancelled"].includes(op.state) &&
                (!roomName || op.sourceRoom === roomName || op.targetRoom === roomName))
            .map((op) => ({ id: op.id, from: op.sourceRoom, to: op.targetRoom, resourceType: op.resourceType,
                state: op.state, amount: op.amount, remaining: op.remaining, sent: op.sentAmount || 0, received: op.receivedAmount || 0,
                pendingSince: op.pendingSend && op.pendingSend.tick || null, error: op.error || null })),
        uncertainTerminalOperations: Object.values(Memory.terminalOps && Memory.terminalOps.operations || {})
            .filter((op) => op.effectUncertain || op.pendingSend && op.pendingSend.uncertain)
            .map((op) => ({ id: op.id, room: op.sourceRoom, error: op.error || null })),
        uncertainLabChains: Object.values(Memory.craft && Memory.craft.active || {})
            .filter((chain) => chain.inventory && chain.inventory.uncertainProduction ||
                chain.queue && chain.queue[chain.qi || 0] && chain.queue[chain.qi || 0].run && chain.queue[chain.qi || 0].run.uncertain)
            .map((chain) => ({ id: chain.id || chain.key, room: chain.room })),
        blockers: ["live-cpu-unverified", "48h-baseline-unverified", "shared-ops-budget-unverified", "lifecycle-not-implemented"] };
}
global.powerStatus = (roomName) => JSON.stringify(report(roomName), null, 2);
module.exports = { report };
