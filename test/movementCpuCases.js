module.exports = function (project, assert) {
    const path = require("path");
    const move = require(path.join(project, "src/utils/move"));
    const meter = require(path.join(project, "src/utils/cpuMeter"));
    const saved = { game: Game, search: PathFinder.search, span: meter.span };
    const measured = [];
    let used = 0, searches = 0;
    meter.span = (key, fn) => {
        const start = used;
        try { return saved.span(key, fn); }
        finally { measured.push({ key, cpu: used - start }); }
    };
    try {
        global.Game = Object.assign({}, saved.game, {
            time: 199100000, cpu: { getUsed: () => used, bucket: 10000 }
        });
        const room = { name: "E91N91", find: () => [], lookForAt: () => [] };
        const creep = { room, pos: new RoomPosition(10, 10, room.name), memory: {},
            fatigue: 0, move: () => OK };
        const goal = new RoomPosition(15, 10, room.name);
        PathFinder.search = () => {
            searches++; used += 3;
            return { incomplete: false, path: [new RoomPosition(11, 10, room.name),
                new RoomPosition(12, 10, room.name)] };
        };
        assert(move.travel(creep, goal) === OK && measured[0].key === "move.localSearch" &&
            measured[0].cpu === 3, "local movement CPU span preserves the accepted movement and actual search cost");
        Game.time++; creep.pos = new RoomPosition(11, 10, room.name);
        assert(move.travel(creep, goal) === OK && searches === 1 && measured.length === 1,
            "CPU instrumentation preserves local path reuse without another search or span");
        assert(move.travel(creep, new RoomPosition(15, 10, "E92N91")) === OK &&
            measured[1].key === "move.native", "cross-room movement remains delegated to the captured engine method");
        const failure = new Error("movement CPU fixture");
        PathFinder.search = () => { used += 2; throw failure; };
        delete creep.memory._m;
        let caught;
        try { move.travel(creep, goal); } catch (error) { caught = error; }
        assert(caught === failure && measured[2].key === "move.localSearch" && measured[2].cpu === 2,
            "failed searches remain measured and propagate the original exception to the subsystem guard");
    } finally {
        global.Game = saved.game; PathFinder.search = saved.search; meter.span = saved.span;
    }
};
