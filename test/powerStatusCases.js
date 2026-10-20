module.exports = function (project, assert) {
    const path = require("path");
    const saved = { game: Game, memory: Memory, info: global.POWER_INFO, generate: global.PWR_GENERATE_OPS };
    let finds = 0;
    try {
        global.PWR_GENERATE_OPS = 1; global.POWER_INFO = { 1: { cooldown: 50, effect: [1, 2, 4, 6, 8] } };
        global.Memory = { settings: {}, rooms: {} };
        const terminal = { id: "status-terminal", cooldown: 3, store: { energy: 9000, [RESOURCE_OPS]: 15 } };
        const room = { name: "StatusRoom", controller: { my: true, isPowerEnabled: true }, terminal,
            storage: { store: { [RESOURCE_OPS]: 10 } }, find: () => { finds++; return []; } };
        global.Game = { time: saved.game.time + 10000, rooms: { StatusRoom: room }, cpu: { limit: 20, bucket: 5000 },
            gpl: { level: 3, progress: 4, progressTotal: 100 }, powerCreeps: {
                Existing: { name: "Existing", level: 0, powers: { 1: { level: 1, cooldown: 10 } }, store: { [RESOURCE_OPS]: 5 } } } };
        const before = JSON.stringify(Memory);
        const status = require(path.join(project, "src/utils/powerStatus"));
        const first = status.report(), second = status.report();
        assert(first.gpl.level === 3 && first.rooms[0].opsStored === 25 && first.rooms[0].opsFreeConfirmed === null,
            "0150 status: GPL and stored ops are observed facts, never assumed spendable");
        assert(first.operators[0].idealOpsPer1000Ticks === 20 && !first.investmentReady && !first.automatedOperatorImplemented,
            "0150 status: ideal generation does not authorize an operator or investment");
        assert(JSON.stringify(Memory) === before && finds === 1 && second.mode === "read-only",
            "0150 status: on-demand reports write no Memory and reuse the existing room cache");
        assert(JSON.parse(global.powerStatus("StatusRoom")).rooms.length === 1,
            "0150 status: console command serializes a room-filtered report");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory;
        for (const [key, value] of [["POWER_INFO", saved.info], ["PWR_GENERATE_OPS", saved.generate]]) {
            if (value === undefined) delete global[key]; else global[key] = value;
        }
    }
};
