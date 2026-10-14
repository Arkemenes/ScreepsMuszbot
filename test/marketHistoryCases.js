// Market persistence regression: full seven-day histories must survive reset.
module.exports = function (project, assert) {
    const path = require("path");
    const historyPath = path.join(project, "src/utils/marketHistoryStore");
    const store = require(historyPath);
    const planPath = require.resolve(path.join(project, "src/utils/planStore"));
    const originalPlanModule = require.cache[planPath];
    const marketPath = require.resolve(path.join(project, "src/utils/market"));
    const originalMarketModule = require.cache[marketPath];
    const sameHistory = (a, b) => Object.keys(a).length === Object.keys(b).length &&
        Object.keys(b).every((r) => JSON.stringify(a[r]) === JSON.stringify(b[r]));
    const saved = { raw: RawMemory, time: Game.time, rooms: Game.myRooms, plans: Memory.planSegments,
        market: Game.market, cpu: Game.cpu, settings: Memory.settings, resources: global.RESOURCES_ALL, command: global.marketPrice, flush: global.marketHistoryFlush };
    try {
        Game.time = 700000;
        global.RawMemory = { segments: { 9: "" }, setActiveSegments: () => {} };
        store.resetCache();
        const history = {};
        for (let r = 0; r < 90; r++) history["resource" + r] = Array.from({ length: 168 }, (_, i) => ({
            tick: Game.time - (167 - i) * 3600,
            buyPrice: 44.483 + r * 0.01, sellPrice: 35.94 + i * 0.001,
            buyVolume: 7288 + i, sellVolume: 14038 + r,
        }));
        assert(store.save(history), "market history: saves seven days for all resources");
        store.resetCache();
        assert(store.load(), "market history: loads persisted history when segments are readable");
        assert(store.history().resource0.length === 168, "market history: full seven-day history survives reset instead of truncating to 31 rows");
        assert(JSON.stringify(store.history()) === JSON.stringify(history), "market history: all prices, volumes and original ticks round-trip losslessly");
        const persisted = Object.assign({}, RawMemory.segments);
        assert(Object.keys(persisted).length > 1 && Object.values(persisted).every((raw) => raw.length <= 95000),
            "market history: pages respect the segment size limit without dropping rows");

        // Loaded root/plans plus newly written history pages share the same save limit.
        RawMemory.segments={9:persisted[9]};
        for(let i=0;i<7;i++) RawMemory.segments[10+i]="plan-"+i;
        const beforeBudget=JSON.stringify(RawMemory.segments);
        assert(!store.save(history) && store.status().error==="segment-write-budget" &&
            JSON.stringify(RawMemory.segments)===beforeBudget,
            "ARK-116: history exceeding the shared ten-segment budget is deferred without partial writes");
        const pendingWrites=store.activeSegmentIds();
        assert(pendingWrites.length===Object.keys(persisted).length && pendingWrites.includes(9) && pendingWrites.includes(0),
            "ARK-116: deferred history requests all pages needed for the next atomic save");
        RawMemory.segments={};
        pendingWrites.forEach(id=>{RawMemory.segments[id]=persisted[id];});
        for(let i=0;Object.keys(RawMemory.segments).length<10;i++) RawMemory.segments[10+i]="plan-"+i;
        Game.time++;
        assert(store.save(history) && Object.keys(RawMemory.segments).length===10 &&
            !store.status().error && store.activeSegmentIds().length===1,
            "ARK-116: activated history pages allow a complete bounded save and release the temporary priority");
        store.resetCache();RawMemory.segments=Object.assign({},persisted);
        assert(store.load() && sameHistory(store.history(),history),
            "ARK-116: deferred save does not remove original samples or alter preserved city segments");

        // Only requested segments become readable on the following tick.
        store.resetCache(); RawMemory.segments = {9: persisted[9]};
        assert(!store.load(), "market history: an unread page delays hydration instead of accepting partial history");
        assert(!store.save({}) && RawMemory.segments[9] === persisted[9], "market history: incomplete hydration cannot overwrite persisted samples");
        let activated;
        RawMemory.setActiveSegments = (ids) => { activated = ids; };
        Memory.planSegments = {}; Game.myRooms = [];
        for (let i = 0; i < 9; i++) {
            Memory.planSegments["room" + i] = 10 + i;
            Game.myRooms.push({name: "room" + i});
        }
        delete require.cache[planPath];
        require(planPath).activate();
        assert(activated.length === 10 && activated.includes(9) && activated.includes(0) && activated.includes(10),
            "market history: root and one pending page leave eight active slots for city plans");
        let ready = false;
        for (let step = 0; step < 12 && !ready; step++) {
            const ids = store.activeSegmentIds();
            RawMemory.segments = {};
            ids.forEach((id) => { RawMemory.segments[id] = persisted[id]; });
            Game.time++; ready = store.load();
        }
        assert(ready && JSON.stringify(store.history()) === JSON.stringify(history),
            "market history: incremental hydration reconstructs every original sample");

        // A stale page must remain pending and recover when the right generation arrives.
        store.resetCache(); RawMemory.segments = Object.assign({}, persisted);
        const stale = JSON.parse(persisted[0]); stale.generation--;
        RawMemory.segments[0] = JSON.stringify(stale);
        assert(!store.load() && !store.save({}), "market history: mismatched page generation blocks loading and destructive saves");
        RawMemory.segments[0] = persisted[0]; Game.time++;
        assert(store.load() && sameHistory(store.history(), history),
            "market history: a temporarily stale page is retried without duplicate samples");

        // A real sample collected during hydration must persist even if cadence
        // skips the next book scan; waiting another hour would lose it on reset.
        store.resetCache(); RawMemory.segments = {9: persisted[9]};
        delete require.cache[marketPath];
        global.RESOURCES_ALL = ["resource0"];
        Memory.settings = {market: {currentInterval: 120, snapshotInterval: 3600}};
        Game.market = {getAllOrders: () => [{id: "ask", resourceType: "resource0", type: "sell", price: 12, remainingAmount: 1000}]};
        const collector = require(marketPath);
        assert(!collector.historyReady(), "market history: a fresh heap is not ready for consumers");
        collector.scan();
        assert(!collector.historyReady(), "market history: a partial snapshot is not a hydrated reference");
        assert(RawMemory.segments[9] === persisted[9], "market history: a scan during hydration preserves the existing generation");
        RawMemory.segments = Object.assign({}, persisted); Game.time++;
        collector.scan();
        assert(RawMemory.segments[9] !== persisted[9], "market history: pending samples flush as soon as hydration completes, even before the next scan interval");
        assert(collector.historyReady(), "market history: completed hydration makes references available to consumers immediately");
        assert(collector.snapshot().resources.resource0.sampleCount === 169, "market history: readiness also refreshes prices from the hydrated samples before consumers run");
        store.resetCache(); store.load();
        assert(store.history().resource0.length === 169 && store.history().resource0[168].tick === Game.time - 1,
            "market history: a reset after hydration preserves the newly collected sample with its actual tick");
        const beforeDeferred=Object.assign({},RawMemory.segments), savedCount=collector.samples("resource0").length;
        RawMemory.segments={9:beforeDeferred[9]};
        for(let i=0;i<7;i++) RawMemory.segments[10+i]="plan-"+i;
        const unchangedRoot=RawMemory.segments[9];
        Memory.settings.market.snapshotInterval=1;Game.time++;const deferredSampleTick=Game.time;
        collector.scan();
        assert(collector.samples("resource0").length===savedCount+1 && RawMemory.segments[9]===unchangedRoot &&
            store.status().error==="segment-write-budget" && Object.keys(RawMemory.segments).length===8,
            "ARK-116: real market collection keeps a budget-deferred sample without publishing a partial generation");
        require(planPath).activate();
        assert(activated.length<=10 && store.status().writeSegments.every(id=>activated.includes(id)),
            "ARK-116: plan activation prioritizes every deferred history page within the shared limit");
        RawMemory.segments={};
        activated.forEach(id=>{RawMemory.segments[id]=id<10?beforeDeferred[id]:"plan-"+(id-10);});
        Memory.settings.market.snapshotInterval=3600;Game.time++;collector.scan();
        assert(!store.status().error && Object.keys(RawMemory.segments).length<=10 &&
            collector.samples("resource0").length===savedCount+1,
            "ARK-116: collector retries a deferred save before cadence without collecting another sample");
        store.resetCache();store.load();
        assert(store.history().resource0.length===savedCount+1 &&
            store.history().resource0[savedCount].tick===deferredSampleTick,
            "ARK-116: completed deferred generation survives history reset with the original sample tick");
        RawMemory.segments = Object.assign({}, persisted); store.resetCache(); store.load();

        const oversized = {};
        Object.keys(history).forEach((r) => { oversized[r] = history[r].concat(history[r], history[r]); });
        const rootBeforeOverflow = RawMemory.segments[9];
        assert(!store.save(oversized) && store.status().error === "history-capacity" && RawMemory.segments[9] === rootBeforeOverflow,
            "market history: exceeding all reserved segments reports capacity without trimming or overwriting the previous generation");

        const legacy = { version: 1, snapshots: { energy: [[100, 2.12345, 3.6789, 456, 789]] } };
        RawMemory.segments = {9: JSON.stringify(legacy)}; store.resetCache();
        assert(store.load() && store.history().energy[0].tick === 100, "market history: legacy segment 9 still loads");
        const legacyHistory = store.history();
        assert(store.save(legacyHistory) && JSON.parse(RawMemory.segments[9]).version === 2, "market history: legacy samples migrate losslessly on the next save");
        store.resetCache(); store.load();
        assert(store.history().energy[0].buyPrice === 2.12345, "market history: migration preserves exact price precision");

        RawMemory.segments = {9: JSON.stringify({version: 1, snapshots: {resource0: [[Game.time, 2, 3, 5, 6]]}})};
        collector.reset(); collector.scan();
        assert(JSON.parse(RawMemory.segments[9]).version === 1, "market history: loading a current legacy sample does not force a new hourly sample");
        const rowsBeforeFlush = JSON.stringify(collector.samples("resource0"));
        Game.market.getAllOrders = () => { throw new Error("flush must not fetch orders"); };
        const flushed = global.marketHistoryFlush();
        assert(flushed.ok && flushed.version === 2 && JSON.stringify(collector.samples("resource0")) === rowsBeforeFlush,
            "market history: explicit flush migrates immediately without fetching orders or adding samples");
        const flushedRoot = RawMemory.segments[9]; collector.reset();
        assert(!global.marketHistoryFlush().ok && RawMemory.segments[9] === flushedRoot,
            "market history: explicit flush before hydration cannot overwrite persisted history");

        store.clear(); collector.reset();
        const anchor = Game.time;
        let fetches = 0;
        Game.market.getAllOrders = () => { fetches++; return [{id: "ask", resourceType: "resource0", type: "sell", price: 12, remainingAmount: 1000}]; };
        Game.cpu = {bucket: 499};
        collector.scan(); Game.time = anchor + 100; collector.scan();
        assert(fetches === 0 && collector.samples("resource0").length === 0 && RawMemory.segments[9] === "",
            "market cadence: below 500 bucket neither fetches nor records or persists a collection");
        Game.cpu.bucket = 500; Game.time = anchor + 101; collector.scan();
        let sample = collector.samples("resource0")[0];
        assert(sample.tick === anchor + 101 && sample.scheduledTick === anchor,
            "market cadence: exactly 500 bucket collects the delayed observation at its actual tick");
        Game.time = anchor + 3599; collector.scan();
        assert(collector.samples("resource0").length === 1, "market cadence: no extra sample before the original next slot");
        Game.time = anchor + 3600; collector.scan();
        assert(collector.samples("resource0").length === 2 && collector.samples("resource0")[1].tick === anchor + 3600,
            "market cadence: delayed first collection does not shift the next scheduled slot");
        Game.cpu.bucket = 499; Game.time = anchor + 7200; collector.scan();
        Game.cpu.bucket = 500; Game.time = anchor + 8000; collector.scan();
        sample = collector.samples("resource0")[2];
        assert(sample.tick === anchor + 8000 && sample.scheduledTick === anchor + 7200,
            "market cadence: recovery bypasses the current scan grid while preserving the scheduled tick");
        collector.reset(); Game.time = anchor + 10799; collector.scan();
        assert(collector.samples("resource0").length === 3 && collector.samples("resource0")[2].scheduledTick === anchor + 7200,
            "market cadence: persisted schedule survives reset without drifting to the delayed observation time");
        Game.time = anchor + 10800; collector.scan();
        assert(collector.samples("resource0").length === 4, "market cadence: collection after reset still uses the original next slot");
        Game.cpu.bucket = 499; Game.time = anchor + 14400; collector.scan();
        Game.cpu.bucket = 500; Game.time = anchor + 23000; collector.scan();
        sample = collector.samples("resource0")[4];
        assert(collector.samples("resource0").length === 5 && sample.tick === anchor + 23000 && sample.scheduledTick === anchor + 21600,
            "market cadence: missing multiple slots produces one real sample instead of fabricated backlog samples");
        Game.time = anchor + 25200; collector.scan();
        assert(collector.samples("resource0").length === 6, "market cadence: long delays also preserve the original grid");

        store.resetCache(); RawMemory.segments = {};
        assert(!store.load() && !store.load(), "market history: repeated calls in the activation tick cannot mistake an inactive root for empty history");
        Game.time++; RawMemory.segments[9] = JSON.stringify(legacy);
        assert(store.load() && store.history().energy.length === 1, "market history: delayed root activation loads the existing history");
    } finally {
        global.RawMemory = saved.raw; Game.time = saved.time; Game.myRooms = saved.rooms;
        Memory.planSegments = saved.plans; store.resetCache();
        Game.market = saved.market; Game.cpu = saved.cpu; Memory.settings = saved.settings; global.RESOURCES_ALL = saved.resources; global.marketPrice = saved.command;
        global.marketHistoryFlush = saved.flush;
        if (originalMarketModule) require.cache[marketPath] = originalMarketModule;
        else delete require.cache[marketPath];
        if (originalPlanModule) require.cache[planPath] = originalPlanModule;
        else delete require.cache[planPath];
    }
};
if (require.main === module) {
    global.Game = { time: 700000 };
    global.Memory = {};
    global.RawMemory = { segments: {9: ""} };
    module.exports(require("path").resolve(__dirname, ".."), (ok, message) => {
        if (!ok) throw new Error(message);
        console.log("PASS " + message);
    });
}
