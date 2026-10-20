// ROADMAP 0159: exercise the official Screeps register build through its public API.
module.exports = function (project, assert) {
    const fs = require("fs");
    const path = require("path");
    const vm = require("vm");
    const file = path.join(project, "src/utils/visual-room.js");
    const library = require(file);
    const methods = ["structure", "connectRoads", "speech", "animatedPosition", "resource", "test"];
    assert(typeof library.install === "function" && methods.every((m) =>
        typeof RoomVisual.prototype[m] === "function"),
    "0159: register installs the public RoomVisual methods");

    function recorded(Visual = RoomVisual) {
        const visual = new Visual();
        const calls = [];
        for (const method of ["circle", "rect", "poly", "line", "text", "clear"]) {
            visual[method] = (...args) => { calls.push([method, ...args]); return visual; };
        }
        return { visual, calls };
    }

    const types = ["spawn", "extension", "road", "constructedWall", "rampart", "keeperLair",
        "portal", "controller", "link", "storage", "tower", "observer", "powerBank",
        "powerSpawn", "extractor", "lab", "terminal", "container", "nuker", "factory", "invaderCore"];
    for (const type of types) {
        const { visual, calls } = recorded();
        const result = visual.structure(10, 10, type, { opacity: 0.15 });
        assert(result === visual && calls.length > 0 && calls.every((c) =>
            c[c.length - 1].opacity === 0.15),
        "0159: planned structures preserve preview opacity and chaining");
    }
    const defaultPreview = recorded();
    defaultPreview.visual.structure(10, 10, STRUCTURE_TOWER);
    assert(defaultPreview.calls.every((c) => c[c.length - 1].opacity === 1),
        "0159: preview opacity does not leak into later structures");

    const roads = recorded();
    for (const [x, y] of [[5, 5], [6, 5], [7, 6], [20, 20]]) {
        roads.visual.structure(x, y, STRUCTURE_ROAD);
    }
    roads.calls.length = 0;
    const connected = roads.visual.connectRoads({ opacity: 0.15 });
    assert(connected === roads.visual && JSON.stringify(roads.calls.map((c) => c.slice(0, 5))) ===
        JSON.stringify([["line", 5, 5, 6, 5], ["line", 6, 5, 7, 6]]) &&
        roads.calls.every((c) => c[c.length - 1].opacity === 0.15),
    "0159: roads connect orthogonal and diagonal neighbours once");
    const separate = recorded();
    separate.visual.structure(5, 6, STRUCTURE_ROAD);
    separate.calls.length = 0;
    assert(separate.visual.connectRoads() === separate.visual && separate.calls.length === 0,
        "0159: road connections stay isolated per visual");

    for (const type of [RESOURCE_ENERGY, RESOURCE_POWER, RESOURCE_HYDROGEN, RESOURCE_CATALYST,
        RESOURCE_UTRIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ALKALIDE]) {
        const { visual, calls } = recorded();
        assert(visual.resource(type, 10, 10) === OK && calls.length > 0,
            "0159: resource badges draw through the registered API");
    }
    const unknown = recorded();
    assert(unknown.visual.resource("unknown-resource", 10, 10) === ERR_INVALID_ARGS &&
        unknown.calls.length === 0, "0159: resources reject unknown types without drawing");

    // Load without game constants first: v2 resolves them lazily when drawing.
    const sandbox = { exports: {}, RoomVisual: class {} };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
    assert(methods.every((m) => typeof sandbox.RoomVisual.prototype[m] === "function"),
        "0159: register loads without resource or structure globals");
    for (const key of Object.keys(global)) {
        if (/^RESOURCE_/.test(key) && !/^RESOURCE_SYMBOL_/.test(key)) sandbox[key] = global[key];
    }
    Object.assign(sandbox, { OK, ERR_INVALID_ARGS, RESOURCE_SYMBOL_SIN: "symbol_sim" });
    const symbol = recorded(sandbox.RoomVisual);
    const widths = [];
    for (const size of [undefined, 0.25, 0.5, 1]) {
        symbol.calls.length = 0;
        const result = symbol.visual.resource("symbol_sim", 10, 10, size);
        const polygon = symbol.calls.find((c) => c[0] === "poly");
        const xs = polygon ? polygon[1].map(([x]) => x) : [];
        widths.push((Math.max(...xs) - Math.min(...xs)) / 2);
        assert(result === OK && polygon && symbol.calls.some((c) => c[0] === "text"),
            "0159: seasonal symbols use the game constant value");
    }
    assert(!("SYMBOLS" in sandbox) && widths.every((w, i) =>
        Math.abs(w - [0.5, 0.25, 0.5, 1][i]) < 0.000001),
    "0159: symbol badges scale by radius without SYMBOLS");

    const speech = recorded();
    assert(speech.visual.speech("hello", 10, 10) === speech.visual &&
        speech.calls.map((c) => c[0]).join(",") === "poly,text",
    "0159: speech draws a pointer and text with chaining");
    const animation = recorded();
    const animated = animation.visual.animatedPosition(10, 10);
    const points = animation.calls[0][1];
    assert(animated === animation.visual && points.length === 5 &&
        JSON.stringify(points[0]) === JSON.stringify(points[4]),
    "0159: animated positions draw a closed marker with chaining");
    const demo = recorded();
    assert(demo.visual.test() === demo.visual && demo.calls[0][0] === "clear" &&
        demo.calls.some((c) => c[0] === "line") && demo.calls.some((c) => c[0] === "text"),
    "0159: test preview includes connected roads and resource badges");
};
