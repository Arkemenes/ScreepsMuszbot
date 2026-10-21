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
    } finally {
        cache.structuresByType = originalByType;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
