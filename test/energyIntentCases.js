// ROADMAP 0154-A: accepted calls are deferred intents, not completed actions.
module.exports = function (project, assert) {
    const path = require("path");
    const ledger = require(path.join(project, "src/utils/energyLedger"));
    const saved = { time: Game.time, cap: global.CONTROLLER_MAX_UPGRADE_PER_TICK,
        settings: Memory.settings, boost: global.BOOSTS, power: global.PWR_OPERATE_CONTROLLER, info: global.POWER_INFO };
    const make = require("./fixtures/deferredWorkCreep");
    const next = () => { Game.time += 100; };
    const observed = (n = 2, energy = 100, capacity = 100) => {
        const creep = make(room, n, energy, capacity);
        ledger.installHooks(Object.getPrototypeOf(creep));
        return creep;
    };
    const room = "IntentLedgerRegression";
    const worker = (name, n = 2, energy = 100) => ({ id: name, name, room: { name: room },
        body: Array.from({ length: n }, () => ({ type: WORK, hits: 100 })),
        store: { energy, getCapacity: () => 100, getFreeCapacity: () => 100 - energy } });
    const site = { id: "intent-site", progress: 0, progressTotal: 1000 };
    const repair = { id: "intent-road", structureType: STRUCTURE_ROAD, hits: 0, hitsMax: 1000 };
    const total = () => ledger.snapshot(room);
    try {
        Game.time += 100;
        const a = worker("repeat");
        ledger.creditBuild(a, site);
        ledger.creditBuild(a, site);
        assert(total().build === 10, "0154 builder slots: two accepted builds consume one intent budget");
        Game.time += 100;
        const b = worker("priority");
        ledger.creditBuild(b, site);
        ledger.creditRepair(b, repair);
        assert(total().build === 0 && total().repairNormal === 2,
            "0154 work intent order: repair suppresses build");
        Game.time += 100;
        global.CONTROLLER_MAX_UPGRADE_PER_TICK = 15;
        const controller = { id: "intent-controller", level: 8, effects: [] };
        ledger.creditUpgrade(worker("u1", 10), controller);
        ledger.creditUpgrade(worker("u2", 10), controller);
        assert(total().upgrade === 15, "0154 shared RCL8 next tick: cap is shared by two creeps");

        next();
        const c = observed();
        assert(ledger.invoke(c, "build", site) === OK, "0154 builder slots: native return is preserved");
        assert(total().build === 10 && ledger.snapshotInfo(room).partial,
            "0154 builder slots: intratick snapshot is partial");
        const tiny = { id: "tiny-site", progress: 97, progressTotal: 100 };
        ledger.invoke(c, "build", tiny);
        assert(total().build === 3 && c.store.energy === 100 && tiny.progress === 97,
            "0154 builder slots: last target replaces prior intent without mutating the world");
        const bad = Object.assign({}, site, { reject: true });
        assert(ledger.invoke(c, "build", bad) === ERR_NOT_IN_RANGE && total().build === 3,
            "0154 builder slots: failed call does not replace the last accepted intent");
        assert(c.cancelOrder("repair") === ERR_NOT_FOUND && total().build === 3,
            "0154 builder slots: failed cancellation preserves slots");
        assert(c.cancelOrder("build") === OK && total().build === 0,
            "0154 builder slots: accepted cancellation removes the slot");
        assert(c.trace.filter(t => t[0] === "build").length === 3,
            "0154 bounded hooks: exactly one native call per invoke");

        next();
        const d = observed();
        ledger.invoke(d, "repair", repair);
        ledger.invoke(d, "build", site);
        assert(total().build === 0 && total().repairNormal === 2,
            "0154 work intent order: later build does not bypass repair priority");
        d.cancelOrder("repair");
        assert(total().build === 10 && total().repairNormal === 0,
            "0154 work intent order: cancelling repair exposes the accepted build");
        ledger.invoke(d, "repair", { id: "complete-road", structureType: STRUCTURE_ROAD, hits: 100, hitsMax: 100 });
        assert(total().build === 0 && total().repairNormal === 0,
            "0154 work intent order: ineffective repair still suppresses build");
        d.cancelOrder("repair");
        d.heal({ id: "friend" });
        assert(total().build === 0, "0154 work intent order: accepted heal suppresses build");
        d.cancelOrder("heal");
        ledger.invoke(d, "upgradeController", { id: "rcl7", level: 7 });
        assert(total().build === 10 && total().upgrade === 2,
            "0154 work intent order: build and upgrade remain independent");

        next();
        const low = observed(2, 11);
        ledger.invoke(low, "upgradeController", { id: "low-controller", level: 7 });
        ledger.invoke(low, "build", site);
        assert(total().build === 10 && total().upgrade === 1,
            "0154 work intent order: engine action order shares energy even when calls are reversed");
        next();
        const dropped = observed(2, 20);
        ledger.invoke(dropped, "build", site);
        dropped.drop(RESOURCE_ENERGY, 18);
        ledger.invoke(dropped, "upgradeController", { id: "drop-controller", level: 7 });
        assert(total().build === 2 && total().upgrade === 0,
            "0154 work intent order: drop resolves before work regardless of call order");
        dropped.cancelOrder("drop");
        assert(total().build === 10 && total().upgrade === 2,
            "0154 work intent order: cancelled drop restores the modeled work budget");
        next();
        const negativeDrop = observed(2, 1);
        ledger.invoke(negativeDrop, "build", site);
        negativeDrop.drop(RESOURCE_ENERGY, -1);
        assert(total().build === 1, "0154 work intent order: nonpositive drop does not create work energy");

        for (const method of ["transfer", "withdraw", "pickup"]) {
            next();
            const moving = observed(2, 5, 100);
            const source = { id: "shared-energy", resourceType: RESOURCE_ENERGY, amount: 50,
                store: { energy: 50, getFreeCapacity: () => 100 } };
            if (method === "pickup") moving.pickup(source);
            else moving[method](source, RESOURCE_ENERGY, 3);
            ledger.invoke(moving, "build", site);
            const event = ledger.events().find(e => e.room === room);
            assert(event && event.quality === "unknown" && event.reason.includes("shared-" + method) &&
                event.energyUpper === 10 && event.energyLower === 0,
                "0154 work intent order: " + method + " has explicit bounds rather than initial-energy certainty");
        }
        next();
        const receiver = observed(2, 1), sender = observed(0, 50);
        sender.transfer(receiver, RESOURCE_ENERGY, 10);
        ledger.invoke(receiver, "build", site);
        assert(ledger.events()[0].quality === "unknown" && ledger.events()[0].reason.includes("incoming-transfer"),
            "0154 work intent order: incoming transfer from a non-WORK creep is unknown");
        next();
        const mixed = observed(10, 5, 100);
        mixed.store.O = 80;
        mixed.store.getFreeCapacity = () => 15;
        mixed.transfer({ id: "mineral-sink", store: { getFreeCapacity: () => 100 } }, "O", 80);
        mixed.pickup({ id: "energy-after-transfer", resourceType: RESOURCE_ENERGY, amount: 30 });
        ledger.invoke(mixed, "build", site);
        assert(ledger.events()[0].quality === "unknown" && ledger.events()[0].energyUpper === 50,
            "0154 work intent order: energy upper bound allows capacity released by non-energy transfer");

        next();
        const capA = observed(10), capB = observed(10); capB.id = "second";
        ledger.invoke(capA, "upgradeController", controller);
        ledger.invoke(capB, "upgradeController", controller);
        assert(total().upgrade === 15 && ledger.events()[1].energyUpper === 10,
            "0154 shared RCL8 next tick: aggregate cap does not pretend to know per-creep allocation");
        Game.time++;
        const nextController = { id: controller.id, level: 8, effects: [] };
        const following = observed(10);
        ledger.invoke(following, "upgradeController", nextController);
        assert(ledger.events().reduce((sum, e) => sum + e.energyEstimate, 0) === 10,
            "0154 shared RCL8 next tick: a fresh processing object gets a new tick budget");

        next();
        global.PWR_OPERATE_CONTROLLER = 998;
        global.POWER_INFO = Object.assign({}, saved.info, { 998: { effect: [10] } });
        const operated = { id: "operated-controller", level: 8, effects: [{ effect: 998, level: 1, ticksRemaining: 1 }] };
        const opA = observed(20), opB = observed(20); opB.id = "second-op";
        ledger.invoke(opA, "upgradeController", operated);
        ledger.invoke(opB, "upgradeController", operated);
        assert(total().upgrade === 25, "0154 shared RCL8 next tick: valid controller effect extends the shared cap");
        next();
        ledger.invoke(observed(20), "upgradeController", Object.assign({}, operated,
            { effects: [{ effect: 998, level: 1, ticksRemaining: -1 }] }));
        assert(total().upgrade === 15, "0154 shared RCL8 next tick: expired controller effect does not extend the cap");

        next();
        global.BOOSTS = Object.assign({}, saved.boost, { [WORK]: Object.assign({}, saved.boost && saved.boost[WORK],
            { testBoost: { build: 2, repair: 4, upgradeController: 2 } }) });
        const boosted = observed(2);
        boosted.body.forEach(part => { part.boost = "testBoost"; });
        ledger.invoke(boosted, "build", site);
        ledger.invoke(boosted, "upgradeController", { id: "boost-controller", level: 7 });
        assert(total().build === 10 && total().upgrade === 2 && ledger.snapshotInfo(room).effects.build === 20 &&
            ledger.snapshotInfo(room).effects.upgrade === 4,
            "0154 work intent order: boost effect is separate from energy spent");
        next();
        const damaged = observed(2); damaged.body[0].hits = 0;
        ledger.invoke(damaged, "repair", repair);
        assert(total().repairNormal === 1, "0154 work intent order: dead WORK parts do not add energy demand");

        next();
        const bounded = observed();
        const parts = bounded.body; let reads = 0;
        Object.defineProperty(bounded, "body", { get: () => { reads++; return parts; } });
        const native = Object.getPrototypeOf(bounded).drop;
        ledger.installHooks(Object.getPrototypeOf(bounded));
        assert(Object.getPrototypeOf(bounded).drop === native, "0154 bounded hooks: installation is idempotent");
        const memBefore = JSON.stringify(Memory);
        const creepsBinding = Object.getOwnPropertyDescriptor(Game, "creeps");
        bounded.room.find = () => { throw new Error("duplicate room scan"); };
        try {
            Object.defineProperty(Game, "creeps", { configurable: true, get: () => { throw new Error("duplicate census scan"); } });
            ledger.invoke(bounded, "build", site);
            ledger.snapshot(room); ledger.snapshot(room);
            ledger.invoke(bounded, "build", site);
            ledger.finalize();
        } finally { Object.defineProperty(Game, "creeps", creepsBinding); }
        assert(reads === 1 && total().build === 10 && !ledger.snapshotInfo(room).partial &&
            JSON.stringify(Memory) === memBefore,
            "0154 bounded hooks: one body observation per entity/tick, no Memory writes or duplicate snapshots");
        const copy = ledger.events(); copy[0].energyEstimate = 999;
        assert(ledger.events()[0].energyEstimate === 10, "0154 bounded hooks: event callers cannot mutate the ledger");

        next();
        const miner = observed(5, 0), idle = observed(), refused = observed(), builds = observed();
        miner.harvest({ id: "acted-source" });
        refused.harvest({ id: "far-source", reject: true });
        ledger.invoke(builds, "build", site);
        const acted = ledger.actedIds();
        assert(acted.has(miner.id) && acted.has(builds.id) && !acted.has(idle.id) && !acted.has(refused.id) &&
            ledger.actedIds() === acted && total().build === 10,
            "0154 acted ids: accepted harvest and resolved build count as acting, idle/refused do not, no copy per call");
        const thrown = new Error("native failure"); let caught;
        try { ledger.invoke(bounded, "build", { throwError: thrown }); } catch (e) { caught = e; }
        assert(caught === thrown && total().build === 10,
            "0154 bounded hooks: original exception is preserved and does not replace a slot");

        next();
        const sharedSite = { id: "almost-complete", progress: 94, progressTotal: 100 };
        const first = observed(1), second = observed(2);
        first.body[0].boost = "testBoost";
        ledger.invoke(first, "build", sharedSite);
        ledger.invoke(second, "build", sharedSite);
        assert(total().build === 5 && ledger.events().every(e => e.quality === "unknown" &&
            e.reason.includes("shared-target-order")),
            "0154 work intent order: contested target is budgeted once with uncertain attribution");
        next();
        ledger.invoke(observed(), "repair", repair);
        ledger.creditTower({ room: { name: room }, store: { energy: 100 } }, "towerRepair", repair);
        assert(ledger.events()[0].quality === "unknown" && ledger.events()[0].reason.includes("external-target-action"),
            "0154 work intent order: own tower repair makes shared-target attribution unknown");

        next();
        const builderPath = require.resolve(path.join(project, "src/roles/builder"));
        const oldBuilder = require.cache[builderPath];
        const combat = require(path.join(project, "src/utils/combat"));
        const cache = require(path.join(project, "src/utils/roomCache"));
        const damagedTargets = require(path.join(project, "src/utils/damagedStructures"));
        const tiers = require(path.join(project, "src/utils/resourceTiers"));
        const savedDependencies = { cover: combat.takeCover, sites: cache.constructionSites,
            damaged: damagedTargets.critical, economy: tiers.getEconomySnapshot, get: Game.getObjectById };
        const globalNames = ["prioritizeBuild", "clearBuildPriority", "builderStats"];
        const globals = globalNames.map(name => Object.getOwnPropertyDescriptor(global, name));
        try {
            combat.takeCover = () => false;
            damagedTargets.critical = () => [];
            tiers.getEconomySnapshot = () => ({ state: "healthy" });
            const realSite = Object.assign(new ConstructionSite(), { id: "actual-builder-site", progress: 0, progressTotal: 1000,
                pos: new RoomPosition(10, 10, room) });
            cache.constructionSites = () => [realSite];
            Game.getObjectById = id => id === realSite.id ? realSite : savedDependencies.get(id);
            delete require.cache[builderPath];
            const actualBuilder = require(builderPath);
            const actual = observed();
            actual.pos = new RoomPosition(10, 10, room);
            actual.say = () => {};
            actual.store.getUsedCapacity = () => 100;
            actual.getState = () => "Build";
            actual.invokeState = function () { Creep.prototype.runBuild.call(this, realSite.id); return true; };
            actualBuilder.run(actual);
            assert(actual.trace.length === 2 && actual.trace.every(t => t[0] === "build" && t[1] === realSite.id) &&
                total().build === 10 && actual.store.energy === 100 && realSite.progress === 0,
                "0154 builder slots: actual builder.run plus runBuild preserves both calls and credits only the final intent");
        } finally {
            combat.takeCover = savedDependencies.cover;
            cache.constructionSites = savedDependencies.sites;
            damagedTargets.critical = savedDependencies.damaged;
            tiers.getEconomySnapshot = savedDependencies.economy;
            Game.getObjectById = savedDependencies.get;
            if (oldBuilder) require.cache[builderPath] = oldBuilder; else delete require.cache[builderPath];
            globalNames.forEach((name, index) => {
                if (globals[index]) Object.defineProperty(global, name, globals[index]); else delete global[name];
            });
        }

        next();
        const failingObservation = observed();
        const unsupported = { id: "bad-observation" };
        Object.defineProperty(unsupported, "progressTotal", { get: () => { throw new Error("observation failed"); } });
        assert(ledger.invoke(failingObservation, "build", unsupported) === OK &&
            failingObservation.intents.build && ledger.snapshotInfo(room).observerErrors > 0 && !ledger.snapshotInfo(room).complete,
            "0154 bounded hooks: observer errors preserve native success and invalidate coverage");
        Game.time++;
        assert(ledger.snapshotInfo(room).observerErrors > 0 && !ledger.snapshotInfo(room).complete,
            "0154 bounded hooks: prior observer failure stays unknown throughout the window");

        next();
        const invalidProvider = observed();
        ledger.invoke(invalidProvider, "build", site);
        const buildPower = global.BUILD_POWER;
        try {
            delete global.BUILD_POWER;
            ledger.finalize();
            assert(ledger.snapshotInfo(room).observerErrors > 0 && !ledger.snapshotInfo(room).complete,
                "0154 bounded hooks: resolution failure drops uncertain work instead of breaking the tick");
        } finally { global.BUILD_POWER = buildPower; }
        Game.time++;
        ledger.invoke(observed(), "build", site);
        assert(ledger.events()[0].energyEstimate === 10 && !ledger.snapshotInfo(room).complete,
            "0154 bounded hooks: next tick recovers while retaining the failed coverage interval");

        next();
        Memory.settings = Object.assign({}, saved.settings, { energyLedger: { observeWork: false } });
        const off = observed();
        ledger.invoke(off, "build", site);
        assert(off.intents.build && total().build === 0 && ledger.snapshotInfo(room).workEnabled === false,
            "0154 bounded hooks: collection off preserves the native action and marks disabled coverage");
        Memory.settings = saved.settings;
        Game.time++;
        assert(ledger.snapshotInfo(room).disabledTicks >= 1 && !ledger.snapshotInfo(room).complete,
            "0154 bounded hooks: re-enabling cannot erase a gap in the same window");
        for (let i = 0; i < 60; i++) { Game.time++; ledger.finalize(); }
        assert(ledger.snapshotInfo(room).complete && ledger.snapshotInfo(room).confirmed === null,
            "0154 bounded hooks: a clean observed window expires faults without claiming confirmation");
    } finally {
        Game.time = saved.time;
        Memory.settings = saved.settings;
        global.BOOSTS = saved.boost;
        if (saved.power === undefined) delete global.PWR_OPERATE_CONTROLLER; else global.PWR_OPERATE_CONTROLLER = saved.power;
        if (saved.info === undefined) delete global.POWER_INFO; else global.POWER_INFO = saved.info;
        if (saved.cap === undefined) delete global.CONTROLLER_MAX_UPGRADE_PER_TICK;
        else global.CONTROLLER_MAX_UPGRADE_PER_TICK = saved.cap;
    }
};
