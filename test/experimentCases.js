// ROADMAP 0154 T5-T6 (ARK-133): experiment overlays on allowlisted settings - apply/remove only
// the own overlay, refuse conflicts, close on deadline/guard/off/reset/manual change, never
// write the base, invalidate needs on every change.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src", n);
    const saved = { game: global.Game, memory: global.Memory };
    const config = require(src("utils/config"));
    const needs = require(src("rooms/needs"));
    const tiers = require(src("utils/resourceTiers"));
    const original = { invalidate: needs.invalidate, economy: tiers.getEconomySnapshot };
    const P = "population.onDemand.minIdleTicks";
    try {
        const invalidated = [];
        needs.invalidate = (name) => invalidated.push(name);
        let economy = "stable";
        tiers.getEconomySnapshot = () => ({ state: economy, reason: "none", criticalConsumers: 0 });
        const room = (name) => ({ name, controller: { my: true, level: 8 } });
        global.Game = Object.assign({}, saved.game, { time: 5000, rooms: { A: room("A"), B: room("B") }, cpu: Object.assign({}, saved.game.cpu, { bucket: 9000 }) });
        global.Memory = { settings: {}, rooms: { A: {}, B: {} } };
        delete require.cache[require.resolve(src("utils/experiments"))];
        const exp = require(src("utils/experiments"));
        exp.reconcile(); // boot tick, nothing running

        const r1 = exp.start({ name: "idle", room: "A", setting: P, value: 50, ticks: 100, metrics: ["cpu"] });
        assert(r1.ok && config.get(P, 300, "A") === 50 && config.get(P, 300, "B") === 300 && config.get(P, 300) === 300,
            "0154 experiment overlay: a room-scoped overlay changes get() for that room only (got " + JSON.stringify(r1) + ")");
        assert(Memory.settings.population === undefined && config.base(P) === 300,
            "0154 experiment overlay: the overlay never writes Memory.settings (base stays the default)");
        assert(invalidated.indexOf("A") >= 0, "0154 experiment overlay: start invalidates the room's needs");
        const rec = Memory.experiments.running[r1.id];
        assert(rec && rec.state === "running" && rec.owner === "experiment:" + r1.id && rec.baseObserved === 300 && rec.deadlineTick === 5100 &&
            typeof rec.guardIds[0] === "string" && JSON.parse(JSON.stringify(rec)).generation === rec.generation,
            "0154 experiment overlay: the record is serializable, with owner/generation/base/deadline and strategy ids (got " + JSON.stringify(rec) + ")");

        assert(!exp.start({ name: "x", room: "A", setting: "population.onDemand.pilot", value: true, ticks: 10 }).ok,
            "0154 experiment overlay: one experiment per room - a second one in A is refused");
        assert(!exp.start({ name: "x", room: "B", setting: "population.onDemand.rooms", value: [], ticks: 10 }).ok,
            "0154 experiment overlay: a setting outside the allowlist is refused");
        assert(!exp.start({ name: "x", room: "B", setting: P, value: "fast", ticks: 10 }).ok,
            "0154 experiment overlay: a value of the wrong type is refused");
        assert(!exp.start({ name: "x", room: "B", setting: P, value: 10, ticks: 10, guard: "nope" }).ok,
            "0154 experiment overlay: an unregistered guard id is refused");
        economy = "critical";
        assert(!exp.start({ name: "x", room: "B", setting: P, value: 10, ticks: 10 }).ok && !Memory.experiments.running.exp2,
            "0154 experiment overlay: a guard already failing refuses the start");
        economy = "stable";

        // deadline
        Game.time = 5100; invalidated.length = 0;
        exp.reconcile();
        const done = Memory.experiments.closed[Memory.experiments.closed.length - 1];
        assert(!Memory.experiments.running[r1.id] && done.state === "closed" && done.reason === "deadline" && config.get(P, 300, "A") === 300 &&
            invalidated.indexOf("A") >= 0 && done.metricsEnd && done.metricsEnd.cpu,
            "0154 experiment recovery: the deadline closes it, removes the overlay, invalidates needs and records end metrics");
        assert(exp.stop(r1.id) === false && config.get(P, 300, "A") === 300, "0154 experiment recovery: stopping a closed experiment again changes nothing");

        // guard
        const r2 = exp.start({ name: "g", room: "A", setting: P, value: 40, ticks: 1000, metrics: ["cpu"] });
        Memory.rooms.A.enemies = 1; Game.time++;
        exp.reconcile();
        assert(!Memory.experiments.running[r2.id] && Memory.experiments.closed.slice(-1)[0].reason === "guard:threat" && config.get(P, 300, "A") === 300,
            "0154 experiment recovery: the threat guard aborts with its reason before spawn reads the setting");
        delete Memory.rooms.A.enemies;

        // direct base edit (observable) and the controlled setter
        const r3 = exp.start({ name: "m", room: "A", setting: P, value: 40, ticks: 1000, metrics: ["cpu"] });
        Memory.settings.population = { onDemand: { minIdleTicks: 600 } }; Game.time++;
        exp.reconcile();
        assert(!Memory.experiments.running[r3.id] && Memory.experiments.closed.slice(-1)[0].reason === "manual-edit" &&
            config.get(P, 300, "A") === 600 && Memory.settings.population.onDemand.minIdleTicks === 600,
            "0154 experiment recovery: a direct edit of the base aborts it and the manual value stands untouched");
        const r4 = exp.start({ name: "s", room: "A", setting: P, value: 40, ticks: 1000, metrics: ["cpu"] });
        exp.setSetting(P, 450);
        assert(!Memory.experiments.running[r4.id] && Memory.experiments.closed.slice(-1)[0].reason === "manual-setting" &&
            config.get(P, 300, "A") === 450 && Memory.settingsRevision[P] === 1,
            "0154 experiment recovery: setSetting writes the base, bumps the revision and aborts the experiment at once");

        // generations: an old owner can never remove a newer overlay
        const r5 = exp.start({ name: "n", room: "A", setting: P, value: 41, ticks: 1000, metrics: ["cpu"] });
        const old = Memory.experiments.closed.slice(-1)[0];
        assert(config.clearOverlay(P, "A", old.owner, old.generation) === false && config.get(P, 300, "A") === 41,
            "0154 experiment recovery: removing with an old owner/generation leaves the new overlay in place");

        // off
        Memory.settings.experiments = { enabled: false }; Game.time++;
        exp.reconcile();
        assert(!Memory.experiments.running[r5.id] && Memory.experiments.closed.slice(-1)[0].reason === "off" && config.get(P, 300, "A") === 450,
            "0154 experiment recovery: experiments off closes the running one (reconcile still runs)");
        assert(!exp.start({ name: "o", room: "A", setting: P, value: 41, ticks: 10 }).ok, "0154 experiment recovery: start is refused while off");
        delete Memory.settings.experiments;

        // reset: abort by default, re-apply when abortOnReset is false
        const r6 = exp.start({ name: "r", room: "B", setting: "population.onDemand.pilot", value: true, ticks: 1000, metrics: ["cpu"] });
        config.clearOverlay("population.onDemand.pilot", "B", "experiment:" + r6.id, Memory.experiments.running[r6.id].generation); // heap lost
        exp.resetHeap(); Game.time++;
        exp.reconcile();
        assert(!Memory.experiments.running[r6.id] && Memory.experiments.closed.slice(-1)[0].reason === "reset" &&
            config.get("population.onDemand.pilot", undefined, "B") === undefined,
            "0154 experiment recovery: a global reset closes the experiment (reason reset), no overlay survives");
        Memory.settings.experiments = { abortOnReset: false };
        const r7 = exp.start({ name: "r2", room: "B", setting: "population.onDemand.pilot", value: true, ticks: 1000, metrics: ["cpu"] });
        config.clearOverlay("population.onDemand.pilot", "B", "experiment:" + r7.id, Memory.experiments.running[r7.id].generation);
        exp.resetHeap(); Game.time++;
        exp.reconcile();
        assert(Memory.experiments.running[r7.id] && config.get("population.onDemand.pilot", undefined, "B") === true,
            "0154 experiment recovery: with abortOnReset false the overlay is re-applied from Memory on boot");

        // the overlay reaches its reader: rooms/onDemandPopulation opts B in through the pilot setting
        const policy = require(src("rooms/onDemandPopulation"));
        assert(policy.enabledFor("B") === true, "0154 experiment overlay: the onDemand policy sees the room-scoped pilot overlay");

        // orphan: the record vanished (Memory edited), the heap overlay must go
        delete Memory.experiments; Game.time++;
        exp.reconcile();
        assert(config.get("population.onDemand.pilot", undefined, "B") === undefined && config.overlayEntries().length === 0 && policy.enabledFor("B") === false,
            "0154 experiment recovery: an overlay without its record is removed as an orphan");
        delete Memory.settings.experiments;
    } finally {
        for (const o of config.overlayEntries()) config.clearOverlay(o.path, o.room, o.entry.owner, o.entry.generation);
        needs.invalidate = original.invalidate;
        tiers.getEconomySnapshot = original.economy;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
