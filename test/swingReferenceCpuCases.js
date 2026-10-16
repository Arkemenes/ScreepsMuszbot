// Real collector + original reference semantics; counters are work, not Screeps CPU.
module.exports = function (project, assert) {
    const path = require("path"), load = (n) => require(path.join(project, "src/utils", n));
    const marketPath = require.resolve(path.join(project, "src/utils/market"));
    const swingPath = require.resolve(path.join(project, "src/utils/swingTrade"));
    const modules = [require.cache[marketPath], require.cache[swingPath]];
    const saved = { game: Game, memory: Memory, raw: RawMemory, resources: RESOURCES_ALL,
        price: global.marketPrice, flush: global.marketHistoryFlush, reference: global.swingReference, status: global.swingStatus };
    try {
        global.Memory = { settings: { market: { minBucket: 0, currentInterval: 1, snapshotInterval: 1,
            snapshotWindowTicks: 1000000 }, swing: { minSamples: 30, maxSampleAge: 7200 } } };
        global.RawMemory = { segments: { 9: "" }, setActiveSegments() {} };
        global.RESOURCES_ALL = ["O", "energy"];
        const orders = [
            { id: "ob", resourceType: "O", type: ORDER_BUY, price: 10, amount: 10000 },
            { id: "os", resourceType: "O", type: ORDER_SELL, price: 12, amount: 10000 },
            { id: "eb", resourceType: "energy", type: ORDER_BUY, price: 1, amount: 10000 },
            { id: "es", resourceType: "energy", type: ORDER_SELL, price: 2, amount: 10000 },
        ];
        global.Game = { ...saved.game, time: 217000000, rooms: {}, creeps: {},
            cpu: { bucket: 10000, getUsed: () => 0 }, market: { getAllOrders: () => orders } };
        load("marketHistoryStore").resetCache(); load("orderBook").reset();
        delete require.cache[marketPath]; delete require.cache[swingPath];
        const market = load("market"), swing = load("swingTrade");
        let ready = true;
        market.historyReady = () => ready;
        for (let i = 0; i < 100; i++) { Game.time++; market.scan(); }
        const source = market.samples;
        // Keep the canonical provider: instrument its immutable rows, not a mock provider.
        let reads = 0;
        function watch() {
            for (const r of RESOURCES_ALL) for (const sample of source(r)) for (const side of ["buyPrice", "sellPrice"]) {
                const descriptor = Object.getOwnPropertyDescriptor(sample, side);
                if (descriptor.get) continue;
                const value = sample[side];
                Object.defineProperty(sample, side, { configurable: true, enumerable: true, get() { reads++; return value; } });
            }
        }
        watch();
        // This is the pre-optimization reference, with all validity checks intact.
        function reference(r, kind) {
            const side = kind === "buy" ? "sellPrice" : "buyPrice", samples = market.samples(r);
            const rows = samples.filter((s) => s[side] > 0), newest = rows.length ? rows[rows.length - 1].tick : null;
            const requiredSamples = Memory.settings.swing.minSamples, maxSampleAge = Memory.settings.swing.maxSampleAge;
            const details = { resourceType: r, kind, referenceSide: side, totalSamples: samples.length,
                validSamples: rows.length, requiredSamples, latestSampleTick: newest,
                sampleAge: newest === null ? null : Game.time - newest, maxSampleAge };
            if (!market.historyReady()) return { ...details, reason: "history-loading" };
            if (rows.length < requiredSamples) return { ...details, reason: "insufficient-history" };
            if (newest > Game.time || Game.time - newest > maxSampleAge) return { ...details, reason: "stale-history" };
            const snap = market.snapshot(), data = snap && snap.resources[r];
            if (!data || !(data[side] > 0)) return { ...details, reason: "missing-reference" };
            const energy = snap.resources.energy;
            if (!energy || !(energy.fairPrice > 0)) return { ...details, reason: "missing-energy-price" };
            const energyRows = market.samples("energy").filter((s) => s.sellPrice > 0);
            const lastEnergy = energyRows.length && energyRows[energyRows.length - 1].tick;
            details.energyValidSamples = energyRows.length;
            details.energySampleAge = energyRows.length ? Game.time - lastEnergy : null;
            if (energyRows.length < requiredSamples || lastEnergy > Game.time || Game.time - lastEnergy > maxSampleAge)
                return { ...details, reason: "invalid-energy-history" };
            return { ...details, price: data[side], energy: energy.fairPrice };
        }
        const same = (label) => {
            for (const r of RESOURCES_ALL) for (const side of ["buy", "sell"])
                assert(JSON.stringify(swing.reference(r, side)) === JSON.stringify(reference(r, side)), "ARK-128: summary preserves " + label + " " + r + "/" + side);
        };
        reads = 0;
        for (let i = 0; i < 100; i++) reference("O", "sell");
        const baseline = reads;
        reads = 0;
        for (let i = 0; i < 100; i++) swing.reference("O", "sell");
        const cold = reads;
        assert(baseline === 20000 && cold <= 400, "ARK-128: 100 same-tick references inspect at most 400 historical prices instead of 20000");
        for (const rooms of [3, 5, 10]) {
            Game.time++; reads = 0;
            for (let i = 0; i < rooms * 100; i++) swing.reference("O", i % 2 ? "buy" : "sell");
            assert(reads === 0, "ARK-128: warmed history summary is shared across sides and " + rooms + " rooms");
        }
        same("unchanged history");
        const snap = market.snapshot(); snap.resources.O.buyPrice = 23; snap.resources.O.sellPrice = 25;
        snap.resources.energy.fairPrice = 7;
        same("same-tick new reference and energy prices");
        Memory.settings.swing.minSamples = 101; same("same-tick threshold");
        Memory.settings.swing.minSamples = 30; ready = false; same("same-tick hydration readiness");
        ready = true;
        Game.time += 7201; same("sample expiry without a new scan");
        Game.time -= 7201;
        // A real scan appends a row even inside this same tick; no TTL may hide it.
        Memory.settings.market.snapshotInterval = 1; market.scan(); watch();
        same("new collector sample");
        const countBefore = source("O").length;
        Game.time++;
        Memory.settings.market.snapshotWindowTicks = Game.time - source("O")[1].tick;
        market.scan(); watch();
        assert(source("O").length === countBefore, "ARK-128: pruning can preserve array length while replacing the oldest sample");
        same("same-length sliding window");
        const canonicalSnapshot = market.snapshot;
        market.snapshot = () => null; same("missing snapshot");
        market.snapshot = canonicalSnapshot;
        // Arbitrary replacement providers are mutable; do not cache their rows.
        const custom = Array.from({ length: 30 }, () => ({ tick: Game.time, buyPrice: 10, sellPrice: 12 }));
        market.samples = () => custom;
        same("replacement sample provider");
        custom[4].buyPrice = null; custom[5].sellPrice = null;
        same("same-tick in-place correction in a replacement provider");
        market.samples = source;
        if (market.sampleSummary) {
            const summary = market.sampleSummary("O"); summary.buyCount = -1;
            assert(market.sampleSummary("O").buyCount >= 0, "ARK-128: callers cannot mutate the cached summary through its public result");
        }
        market.reset(); same("collector reset");
        const store = load("marketHistoryStore"), storeLoad = store.load;
        try {
            RawMemory.segments = { 9: "" }; store.resetCache();
            store.load = () => false;
            Game.time++; market.scan();
            const partial = market.samples("O");
            if (market.sampleSummary) assert(market.sampleSummary("O").length === 1,
                "ARK-128: partial history can have its own cached summary before hydration");
            const history = Object.fromEntries(RESOURCES_ALL.map((r) => [r, Array.from({ length: 30 }, (_, i) => ({
                tick: Game.time - 30 + i, buyPrice: 10, sellPrice: 12, buyVolume: 10000, sellVolume: 10000 }))]));
            assert(store.save(history), "ARK-128: summary hydration fixture persists complete historical samples");
            store.resetCache(); store.load = storeLoad;
            market.scan();
            assert(market.samples("O") !== partial && market.samples("O").length === 31,
                "ARK-128: hydration replaces the partial array and merges current samples");
            same("hydration replacing a previously summarized array");
        } finally { store.load = storeLoad; }
        console.log("ARK-128 reference work " + JSON.stringify({ decisions: 100, baselineReads: baseline, coldReads: cold }));
    } finally {
        global.Game = saved.game; global.Memory = saved.memory; global.RawMemory = saved.raw; global.RESOURCES_ALL = saved.resources;
        global.marketPrice = saved.price; global.marketHistoryFlush = saved.flush; global.swingReference = saved.reference; global.swingStatus = saved.status;
        if (modules[0]) require.cache[marketPath] = modules[0]; else delete require.cache[marketPath];
        if (modules[1]) require.cache[swingPath] = modules[1]; else delete require.cache[swingPath];
        load("marketHistoryStore").resetCache(); load("orderBook").reset();
    }
};
