require("./console"); // registers global.help() - console command reference

let utils = {
    memory: require("./memory"),
    profiler: require("./profiler"),
    visualRoom: require("./visual-room"),
    stats: require("./stats"),
    census: require("./census"),
    roomCache: require("./roomCache"),
    terrain: require("./terrain"),
    planStore: require("./planStore"),
    traffic: require("./traffic"),
};

module.exports = utils;
