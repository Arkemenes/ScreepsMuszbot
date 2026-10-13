module.exports = function (project, assert) {
    const path = require("path");
    const diagnosticsPath = path.join(project, "src/utils/claimDiagnostics.js");
    const diagnostics = require(diagnosticsPath);
    const reserver = require(path.join(project, "src/roles/reserver"));
    const routing = require(path.join(project, "src/utils/routing"));
    const needs = require(path.join(project, "src/rooms/needs"));
    const census = require(path.join(project, "src/utils/census"));
    const saved = { game: Game, memory: Memory, log: console.log, move: routing.moveToRoom };
    let logs = [];
    const home = saved.game.rooms[Object.keys(saved.game.rooms)[0]];
    try {
        global.Game = Object.assign({}, saved.game, {
            time: 196000000,
            creeps: {},
            cpu: Object.assign({}, saved.game.cpu, { bucket: 0 }),
        });
        global.Memory = { rooms: {}, settings: {}, creeps: {},
            claimTarget: { room: "E5N41", from: home.name } };
        console.log = (message) => logs.push(String(message));
        const creep = {
            name: "claimer-diagnostic", room: { name: "E4N41" },
            pos: new RoomPosition(49, 10, "E4N41"), ticksToLive: 17,
            hits: 100, fatigue: 0, body: [{ type: CLAIM }, { type: MOVE }],
            memory: { role: "reserver", mission: "claim", home: home.name, targetRoom: "E5N41" },
            move: () => OK, moveTo: () => OK,
        };
        routing.moveToRoom = () => ERR_BUSY;
        reserver.run(creep);
        assert(Memory.claimTarget.lastSeen && Memory.claimTarget.lastSeen.phase === "waiting_cpu" &&
            Memory.claimTarget.lastSeen.ttl === 17 && Memory.claimTarget.lastSeen.room === "E4N41",
            "claim keeps the last observed room, remaining life and CPU wait phase");
        const detached = diagnostics.status();
        detached.pending.lastSeen.ttl = 999;
        assert(Memory.claimTarget.lastSeen.ttl === 17,
            "claimStatus returns detached data without allowing accidental mutation of its evidence");
        Game.time++;
        census.build();
        needs.invalidate();
        needs.roomNeeds(home);
        assert(!Memory.claimTarget && Memory.lastClaimResult && Memory.lastClaimResult.reason === "creep_missing",
            "a missing claimer preserves a terminal diagnosis instead of discarding its order");
        assert(Memory.lastClaimResult.lastSeen.ttl === 17 && !Memory.lastClaimResult.attacker,
            "disappearance keeps evidence without inventing an attacker or expiry cause");
        const encoded = JSON.stringify(Memory.lastClaimResult);
        delete Memory.creeps;
        assert(JSON.stringify(diagnostics.status().lastResult) === encoded,
            "claim diagnosis remains consultable after creep Memory is garbage collected");

        Memory.claimTarget = { room: "E5N41", from: home.name };
        creep.room = { name: "E5N41", controller: { owner: { username: "OtherPlayer" } } };
        creep.pos = new RoomPosition(10, 10, "E5N41");
        creep.claimController = () => -15;
        reserver.run(creep);
        assert(Memory.lastClaimResult.reason === "claimController_failed" &&
            Memory.lastClaimResult.code === -15 && Memory.lastClaimResult.codeName === "ERR_GCL_NOT_ENOUGH",
            "claimController failure retains the exact GCL error code and name");
        assert(Memory.lastClaimResult.owner === "OtherPlayer" && !Memory.claimTarget,
            "claim failure records controller ownership while preserving the existing cancellation policy");
        const count = logs.length;
        reserver.run(creep);
        assert(logs.length === count,
            "a completed claimer does not repeat its terminal diagnostic each tick");

        const accepted = Object.assign({}, creep, { name: "claimer-accepted",
            memory: Object.assign({}, creep.memory), claimController: () => OK });
        delete accepted.memory._claimReported;
        Memory.claimTarget = { room: "E5N41", from: home.name };
        reserver.run(accepted);
        assert(Memory.lastClaimResult.reason === "claim_accepted" && Memory.lastClaimResult.code === OK,
            "claim diagnosis distinguishes an accepted intent from confirmed room ownership");

        const noController = Object.assign({}, accepted, { name: "claimer-no-controller",
            memory: Object.assign({}, accepted.memory), room: { name: "E5N41" }, suicide: () => OK });
        delete noController.memory._claimReported;
        Memory.claimTarget = { room: "E5N41", from: home.name };
        reserver.run(noController);
        assert(Memory.lastClaimResult.reason === "no_controller",
            "a destination without controller records its terminal reason before suicide");
        Memory.claimTarget = { room: "E5N41", from: home.name };
        global.cancelClaim();
        assert(Memory.lastClaimResult.reason === "cancelled" && !Memory.claimTarget,
            "manual cancellation is recorded separately from a claimer failure");
        delete Memory.lastClaimResult;
        assert(global.claimStatus().lastResult === null,
            "claimStatus reports no historical result when the older build recorded nothing");
        assert(logs.some((line) => line.includes("ERR_GCL_NOT_ENOUGH")),
            "claimController errors also print their named reason in the console");
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
        console.log = saved.log;
        routing.moveToRoom = saved.move;
        needs.invalidate();
    }
};
