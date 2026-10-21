// ROADMAP 0150 T8 (ARK-137): managed lab operator - creation/upgrade behind the 48h lab gate,
// spawn/enable/renew lifecycle, GENERATE_OPS / OPERATE_LAB, safe mode.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src", n);
    const saved = { game: global.Game, memory: global.Memory };
    const keys = ["PWR_GENERATE_OPS", "PWR_OPERATE_LAB", "POWER_INFO", "POWER_CLASS", "PowerCreep", "RESOURCE_OPS"];
    const savedGlobals = Object.fromEntries(keys.map((k) => [k, global[k]]));
    const roomCache = require(src("utils/roomCache")), labReport = require(src("utils/labReport")), labReactions = require(src("utils/labReactions"));
    const original = { byType: roomCache.structuresByType, summary: labReport.summary, evidence: labReport.evidence, list: labReactions.list };
    try {
        global.PWR_GENERATE_OPS = 1; global.PWR_OPERATE_LAB = 5; global.RESOURCE_OPS = "ops";
        global.POWER_INFO = { 1: { level: [0, 2, 7, 14, 22], cooldown: 50, effect: [1, 2, 4, 6, 8] },
            5: { level: [0, 2, 7, 14, 22], cooldown: 50, ops: 10, effect: [2, 4, 6, 8, 10] } };
        global.POWER_CLASS = { OPERATOR: "operator" };
        const created = [];
        global.PowerCreep = { create: (name, cls) => { created.push([name, cls]); return OK; } };
        global.Memory = { settings: {}, rooms: { PR: {} } };
        const spawn = { id: "ps", structureType: STRUCTURE_POWER_SPAWN };
        const storage = { id: "st", store: { ops: 100 } };
        const controller = { id: "ctl", isPowerEnabled: false };
        const room = { name: "PR", controller, storage };
        const lab = { id: "out1", cooldown: 0, effects: [] };
        roomCache.structuresByType = (r, type) => (type === STRUCTURE_POWER_SPAWN ? [spawn] : []);
        labReport.summary = () => ({ confirmedPerTick: 1, amountPerTick: 1 });
        let gate = "insufficient";
        labReport.evidence = () => ({ status: gate });
        labReactions.list = () => [{ a: "X", b: "LH2O", product: "XLH2O", output: "out1" }];
        global.Game = Object.assign({}, saved.game, { time: 50000, myRooms: [room], rooms: { PR: room }, gpl: { level: 1 }, powerCreeps: {},
            cpu: Object.assign({}, saved.game.cpu, { bucket: 9000 }), getObjectById: (id) => (id === "out1" ? lab : null) });
        delete require.cache[require.resolve(src("powerCreeps/operator"))];
        const op = require(src("powerCreeps/operator"));

        op.manage();
        assert(!created.length, "0150 operator safe lifecycle: without 48h of bounded lab evidence no operator is created");
        gate = "bounded";
        op.manage();
        assert(!created.length, "0150 operator safe lifecycle: the gate is cached for power.operator.checkTicks (no re-read every tick)");
        op.resetPlan();
        op.manage();
        const name = created.length && created[0][0];
        assert(created.length === 1 && created[0][1] === "operator" && Memory.powerCreeps[name].managed && Memory.powerCreeps[name].home === "PR",
            "0150 operator safe lifecycle: a free GPL level and the open gate create one managed operator at home");

        const calls = [];
        const pc = { name, level: 0, powers: {}, ticksToLive: undefined, spawnCooldownTime: Date.now() + 60000, room,
            store: { ops: 0, getFreeCapacity: () => 100 },
            pos: { near: true, isNearTo() { return this.near; }, inRangeTo() { return this.near; } },
            spawn: (s) => { calls.push("spawn"); return OK; }, upgrade: (p) => { calls.push("upgrade:" + p); pc.level++; pc.powers[p] = { level: (pc.powers[p] ? pc.powers[p].level : 0) + 1, cooldown: 0 }; return OK; },
            enableRoom: () => { calls.push("enable"); controller.isPowerEnabled = true; return OK; }, renew: () => { calls.push("renew"); return OK; },
            usePower: (p, t) => { calls.push("power:" + p + (t ? ":" + t.id : "")); return OK; },
            moveTo: () => { calls.push("move"); return OK; }, withdraw: () => { calls.push("withdraw"); pc.store.ops += 10; return OK; },
            transfer: () => { calls.push("transfer"); return OK; } };
        Game.powerCreeps[name] = pc;
        Game.gpl = { level: 3 };
        op.manage();
        assert(calls.includes("upgrade:1"), "0150 operator safe lifecycle: the first free level goes to GENERATE_OPS (got " + calls.join(",") + ")");
        assert(Memory.powerCreeps[name].state === "respawnWait" && !calls.includes("spawn"),
            "0150 operator safe lifecycle: a real spawn cooldown (timestamp) is respected before spawning");
        calls.length = 0;
        op.manage();
        assert(calls.includes("upgrade:5"), "0150 operator safe lifecycle: the next free level adds OPERATE_LAB (plan alternates)");
        assert(op.freeLevels() === 0 && op.nextPower(pc) === 1 && pc.level === 2, "0150 operator safe lifecycle: GPL used = sum of (level + 1); no free level left");

        pc.spawnCooldownTime = 0; calls.length = 0;
        op.run(pc, Memory.powerCreeps[name]);
        assert(calls.includes("spawn"), "0150 operator safe lifecycle: after the cooldown the operator spawns at the home power spawn");
        pc.ticksToLive = 5000; calls.length = 0;
        op.run(pc, Memory.powerCreeps[name]);
        assert(calls[0] === "enable" && Memory.powerCreeps[name].state === "enabling", "0150 operator safe lifecycle: an unpowered room is enabled first");
        pc.ticksToLive = 400; calls.length = 0;
        op.run(pc, Memory.powerCreeps[name]);
        assert(calls[0] === "renew", "0150 operator safe lifecycle: below power.operator.renewTicks it renews at the power spawn");
        pc.ticksToLive = 4000; calls.length = 0;
        op.run(pc, Memory.powerCreeps[name]);
        assert(calls[0] === "power:1" && calls.includes("withdraw"), "0150 operated levels and shared inputs: GENERATE_OPS when ready, ops topped up from storage for OPERATE_LAB (got " + calls.join(",") + ")");
        calls.length = 0;
        op.run(pc, Memory.powerCreeps[name]);
        assert(calls.includes("power:5:out1") && Memory.powerCreeps[name].lastOperate.lab === "out1",
            "0150 operated levels and shared inputs: OPERATE_LAB on the running reaction's output lab");
        lab.effects = [{ effect: 5, ticksRemaining: 900 }]; calls.length = 0;
        op.run(pc, Memory.powerCreeps[name]);
        assert(!calls.some((c) => c.indexOf("power:5") === 0), "0150 operated levels and shared inputs: an operated lab is not re-applied before its effect expires");
        Memory.rooms.PR.enemies = 2; calls.length = 0;
        op.run(pc, Memory.powerCreeps[name]);
        assert(Memory.powerCreeps[name].state === "safe:threat" && !calls.some((c) => c.indexOf("power:5") === 0),
            "0150 operator safe lifecycle: under threat the operator only keeps safe (no economic power)");
        delete Memory.rooms.PR.enemies;
        delete Game.powerCreeps[name];
        Game.time += 10;
        op.manage();
        assert(!Memory.powerCreeps[name], "0150 operator safe lifecycle: a deleted power creep's record is dropped");
    } finally {
        roomCache.structuresByType = original.byType; labReport.summary = original.summary; labReport.evidence = original.evidence; labReactions.list = original.list;
        for (const k of keys) { if (savedGlobals[k] === undefined) delete global[k]; else global[k] = savedGlobals[k]; }
        global.Game = saved.game; global.Memory = saved.memory;
    }
};
