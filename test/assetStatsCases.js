// Physical inventory and the dashboard/exporter contract (ROADMAP 0133).
module.exports = function (project, assert) {
    const path = require("path"), fs = require("fs");
    const load = name => require(path.join(project, "src/utils", name));
    // Other smoke cases reload market; load stats against the current instance.
    const statsPath = require.resolve(path.join(project, "src/utils/stats"));
    const statsModule = require.cache[statsPath];
    delete require.cache[statsPath];
    const stats = load("stats"), census = load("census"), market = load("market");
    const saved = { rooms: Game.rooms, creeps: Game.creeps, powerCreeps: Game.powerCreeps,
        resources: Game.resources, time: Game.time, stats: Memory.stats, snapshot: market.snapshot,
        settings: Memory.settings, reactions: global.REACTIONS };
    try {
        Game.time += 1000;
        Memory.settings = { stats: { publishInterval: 1 } };
        global.REACTIONS = { [RESOURCE_CATALYST]: { GH2O: "XGH2O", GHO2: "XGHO2" } };
        const storage = { id: "asset-storage", store: { energy: 100, O: 10, getCapacity: () => 1000000 } };
        const terminal = { id: "asset-terminal", store: { O: 20 } };
        storage.store.XGH2O = 10;
        terminal.store.XGH2O = 20;
        const structures = [storage, terminal,
            { id: "asset-lab", store: { energy: 5, XGH2O: 30 } },
            { id: "asset-factory", store: { battery: 40 } },
            { id: "asset-container", store: { O: 50 } },
            { id: "asset-spawn", store: { energy: 15 } },
            { id: "asset-enemy", my: false, store: { O: 999 } }];
        const findCalls = {};
        const room = { name: "AssetRoom", controller: { my: true }, storage, terminal,
            find: type => { findCalls[type] = (findCalls[type] || 0) + 1;
                return type === FIND_STRUCTURES ? structures : []; } };
        Game.rooms = { AssetRoom: room, RemoteRoom: { name: "RemoteRoom", controller: { my: false },
            find: () => { throw new Error("foreign inventory scan"); } } };
        Game.creeps = {
            cargo: { id: "asset-cargo", room: { name: "RemoteRoom" }, memory: { role: "hauler" }, store: { O: 7 } },
            noRole: { id: "asset-no-role", room, memory: {}, store: { XGH2O: 3 } },
        };
        Game.powerCreeps = { present: { pos: {}, store: { ops: 8 } }, unspawned: { store: { ops: 999 } } };
        Game.resources = { pixel: 2, empty: 0, bad: NaN, method: () => 0 };
        market.snapshot = () => ({ resources: {
            O: { sellPrice: 12, currentSell: 99 },
            H: { fairPrice: null, buyPrice: null, sellPrice: null, currentBuy: 3, currentSell: null },
        } });
        census.build();
        stats();
        const inventory = Memory.stats.assets.resources;
        assert(inventory.O === 87 && inventory.XGH2O === 63 && inventory.battery === 40 &&
            inventory.ops === 8 && inventory.pixel === 2,
            "0133: inventory includes labs, containers, factories and all owned cargo");
        assert(Memory.stats.rooms.AssetRoom.compoundsT3 && Memory.stats.rooms.AssetRoom.compoundsT3.XGH2O === 30,
            "ARK-130: room T3 gauge publishes storage plus terminal inventory independently of labs and cargo");
        assert(inventory.energy === 120 && findCalls[FIND_STRUCTURES] === 1,
            "0133: inventory does not double-count storage or include enemy structures");
        assert(!("bad" in inventory) && !("empty" in inventory) && !("method" in inventory),
            "0133: inventory is sparse and contains finite positive quantities only");
        assert(Memory.stats.market.fairPrice.O.sellPrice === 12 && Memory.stats.market.fairPrice.O.currentSell === 99,
            "0133: Sell Value preserves sellPrice independently of currentSell");
        assert(Memory.stats.market.fairPrice.H.currentBuy === 3 && Memory.stats.market.fairPrice.H.fairPrice === null,
            "ARK-132: stats preserves current-only quotes before historical fairPrice exists");
        Game.time++;
        Game.rooms = {}; Game.creeps = {}; Game.powerCreeps = {}; Game.resources = {};
        stats();
        assert(Object.keys(Memory.stats.assets.resources).length === 0,
            "0133: empty inventory replaces the previous snapshot");
    } finally {
        Object.assign(Game, { rooms: saved.rooms, creeps: saved.creeps, powerCreeps: saved.powerCreeps,
            resources: saved.resources, time: saved.time });
        Memory.stats = saved.stats; Memory.settings = saved.settings; market.snapshot = saved.snapshot;
        global.REACTIONS = saved.reactions;
        require.cache[statsPath] = statsModule;
        census.build();
    }
    const dashboard = JSON.parse(fs.readFileSync(path.join(project, "grafana.json"), "utf8")).spec;
    const resourceVariable = dashboard.variables.find(v => v.spec.name === "resource").spec;
    const priceQueries = dashboard.elements["panel-256"].spec.data.spec.queries;
    const discovery = resourceVariable.query.spec.query;
    const matcher = JSON.parse(discovery.match(/path=~("(?:\\.|[^"\\])*")/)[1]);
    assert(new RegExp("^(?:" + matcher + ")$").test("market.fairPrice.H.currentBuy"),
        "ARK-132: resource discovery includes current-only quotes");
    assert(resourceVariable.query.datasource.name === priceQueries[0].spec.query.datasource.name &&
        resourceVariable.query.datasource.name === "${DS_PROMETHEUS}",
        "ARK-132: resource variable follows the selected panel datasource");
    assert(priceQueries.every(q => q.spec.query.spec.expr.startsWith("screeps_stat_value{") &&
        q.spec.query.spec.expr.includes("${resource:regex}")),
        "ARK-132: price queries select numeric metrics with multi-value resource interpolation");
    const panel = dashboard.elements["panel-235"];
    const expr = panel.spec.data.spec.queries[0].spec.query.spec.expr;
    assert(expr.includes("screeps_resource_sell_value") && expr.includes("0.95 * sum by") &&
        expr.startsWith("screeps_market_credits +") && expr.includes("0 * screeps_market_credits"),
        "0133: dashboard values assets with sellValue and discounts resources only");
};
