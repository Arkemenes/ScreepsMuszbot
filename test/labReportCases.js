// ROADMAP 0155 (ARK-134): one classification per lab and tick; busy share and waits.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory };
    const cache = require(src("roomCache"));
    const originalByType = cache.structuresByType;
    try {
        const lab = (id, extra) => Object.assign({ id, cooldown: 0, mineralType: null, store: {}, isActive: () => true }, extra);
        const labs = {
            in1: lab("in1", { mineralType: "H", store: { H: 100 } }),
            in2: lab("in2", { mineralType: "O", store: { O: 100 } }),
            out: lab("out", { mineralType: "OH", store: { OH: 10 } }),
            spare: lab("spare"),
        };
        const room = { name: "LabRoom" };
        global.Memory = { settings: {}, rooms: { LabRoom: { labReaction: { a: "H", b: "O", product: "OH", input1: "in1", input2: "in2", output: "out" } } } };
        global.Game = Object.assign({}, saved.game, { time: 7000, myRooms: [room], getObjectById: (id) => labs[id] || null });
        cache.structuresByType = (r, type) => (type === STRUCTURE_LAB ? Object.values(labs) : []);
        delete require.cache[require.resolve(src("labReport"))];
        const labReport = require(src("labReport"));

        // t1: reacted; t2: cooling down; t3: input short; t4: output full; t5: another mineral
        labReport.recordRun(labs.out, 5); labReport.observe();
        Game.time++; labs.out.cooldown = 4; labReport.observe();
        labReport.observe(); // a second call in the same tick adds nothing
        Game.time++; labs.out.cooldown = 0; labs.in1.store.H = 2; labReport.observe();
        Game.time++; labs.in1.store.H = 100; labs.out.store.OH = 2999; labReport.observe();
        Game.time++; labs.out.store = { OH: 0, X: 5 }; labs.out.mineralType = "X"; labReport.observe();
        const c = Memory.labReport.LabRoom;
        assert(c.ticks === 5 && c.outputTicks === 5 && c.inputTicks === 10 && c.unassigned === 5 && c.labTicks === 20,
            "0155 final observation: one classification per lab and tick, repeat calls ignored, input labs apart from unassigned ones (got " + JSON.stringify(c) + ")");
        assert(c.states.reacting === 1 && c.states.cooldown === 1 && c.states.input === 1 && c.states.capacity === 1 && c.states.switch === 1 && c.amount === 5,
            "0155 final observation: reacting / cooldown / input / capacity / switch are told apart (got " + JSON.stringify(c.states) + ")");
        const r = labReport.report("LabRoom");
        assert(r.busy === 0.4 && !r.reactionLimited && r.top.length === 3,
            "0155 report: busy = (reacting + cooldown) / output lab-ticks, below 0.85 is not reaction-limited, top 3 waits");
        labs.out.store = { OH: 0 }; labs.out.mineralType = "OH";
        for (let i = 0; i < 95; i++) { Game.time++; labReport.recordRun(labs.out, 5); labReport.observe(); }
        assert(labReport.report("LabRoom").reactionLimited && labReport.summary("LabRoom").busy >= 0.85,
            "0155 report: a lab reacting nearly every tick reads reaction-limited (OPERATE_LAB candidate)");
        // 100 ticks with the reaction, then 100 without any: gaps between chains are their own share
        const plan = Memory.rooms.LabRoom.labReaction;
        delete Memory.rooms.LabRoom.labReaction;
        for (let i = 0; i < 100; i++) { Game.time++; labReport.observe(); }
        const gap = labReport.summary("LabRoom");
        assert(gap.noReaction === 0.5 && gap.outputLabsRunning === 1 && gap.outputLabs === 0.5,
            "0155 report: ticks without any reaction split from labs a running plan leaves out (got " + JSON.stringify(gap) + ")");
        Memory.rooms.LabRoom.labReaction = plan;
        assert(/LabRoom/.test(global.labReport("LabRoom")) && global.labReset("LabRoom") === 1 && !Memory.labReport.LabRoom,
            "0155 report: console labReport prints, labReset starts a new epoch");

        // T2: an accepted reaction is confirmed by next tick's cooldown, or counted as rejected
        let ms = 1e12;
        labReport.clock.now = () => ms;
        let intents = 0;
        Object.values(labs).forEach((l) => { l.room = room; l.runReaction = () => { intents++; return OK; }; });
        labs.out.store = { OH: 0 }; labs.out.mineralType = "OH"; labs.in1.store.H = 100; labs.out.cooldown = 0;
        const tick = (cooldown, run) => { Game.time++; ms += 3000; labs.out.cooldown = cooldown; if (run) labReport.recordRun(labs.out, 5, "OH"); labReport.observe(); };
        const roomsBefore = JSON.stringify(Memory.rooms);
        tick(0, true); tick(10, false);
        let lc = Memory.labReport.LabRoom;
        assert(lc.confirmed === 1 && lc.confirmedAmount === 5 && lc.products["f:OH"] === 5 && !lc.rejected,
            "0155 origin and final quantity: a reaction is production only once the engine's cooldown confirms it (got " + JSON.stringify(lc) + ")");
        tick(0, true); tick(0, false);
        assert(Memory.labReport.LabRoom.rejected === 1 && Memory.labReport.LabRoom.confirmed === 1,
            "0155 origin and final quantity: an accepted intent the engine never ran is rejected, not production");
        Memory.rooms.LabRoom.labReactions = [plan, { a: "OH", b: "X", product: "XOH", input1: "out", input2: "spare", output: "x" }];
        tick(0, true); tick(10, false);
        assert(Memory.labReport.LabRoom.products["i:OH"] === 5 && Memory.labReport.LabRoom.products["f:OH"] === 5,
            "0155 origin and final quantity: OH feeding another running reaction is an intermediate, not final output");
        delete Memory.rooms.LabRoom.labReactions;
        assert(intents === 0 && JSON.stringify(Memory.rooms) !== undefined && roomsBefore === JSON.stringify(Object.assign({}, Memory.rooms)),
            "0155 report observation only: observing issues no intent and leaves Memory.rooms untouched");

        // T3: wall-clock coverage between consecutive ticks, gaps never fabricate time, regime epochs
        lc = Memory.labReport.LabRoom;
        assert(lc.observedMs === 5 * 3000 && lc.regime === "rcl0:labs4",
            "0155 representative coverage: observed ms sum consecutive ticks only (got " + lc.observedMs + ")");
        Game.time += 5; ms += 60000; labReport.observe();
        Game.time++; ms += 60000; labReport.observe();
        lc = Memory.labReport.LabRoom;
        assert(lc.gaps === 1 && lc.observedMs === 5 * 3000 + 10000,
            "0155 representative coverage: a skipped tick is a gap and a long pause is capped at labReport.maxGapMs (got " + JSON.stringify({ g: lc.gaps, ms: lc.observedMs }) + ")");
        let ev = labReport.evidence("LabRoom");
        assert(ev.status === "insufficient" && /coverage/.test(ev.reasons[0]),
            "0155 representative coverage: far from 48h observed, the evidence is insufficient (got " + JSON.stringify(ev) + ")");
        Memory.settings.labReport = { requiredMs: 20000, minConfirmedShare: 0.5 };
        ev = labReport.evidence("LabRoom");
        assert(ev.status === "bounded" && Math.abs(ev.confirmedShare - 2 / 3) < 1e-9,
            "0155 representative coverage: enough observed time and confirmed share make the evidence bounded");
        Memory.settings.labReport = { requiredMs: 20000, minConfirmedShare: 0.95 };
        assert(labReport.evidence("LabRoom").status === "insufficient", "0157 output quality histories: too many unconfirmed reactions keep the gate closed");
        delete Memory.settings.labReport;
        room.controller = { level: 7, my: true };
        Game.time++; ms += 3000; labReport.observe();
        lc = Memory.labReport.LabRoom;
        assert(lc.regime === "rcl7:labs4" && lc.previous && lc.previous.regime === "rcl0:labs4" && !lc.observedMs && lc.ticks === 1,
            "0155 representative coverage: a new regime (RCL / lab count) starts a new epoch and keeps the old summary");
        delete room.controller;
    } finally {
        cache.structuresByType = originalByType;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
