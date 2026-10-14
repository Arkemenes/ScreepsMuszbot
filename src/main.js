let creepLogic = require("./roles");
const cpuMeter = require("./utils/cpuMeter");
let structureLogic = require("./structures");
let roomLogic = require("./rooms");
let prototypes = require("./prototypes");
let utils = require("./utils");
let config = require("./utils/config");

// Profiler wraps every prototype method, which is not free even when idle -
// only pay for it when explicitly switched on from the console:
//   Memory.settings.profiler = true
// Checked every tick (not just at module load) so flipping the flag from the
// console takes effect on the next tick instead of requiring a global reset.
let profilerEnabled = false;
// roomLogic functions replaced by registerFN while profiling, put back when it ends
let ownOriginals = null;
function maybeEnableProfiler() {
    if (!profilerEnabled && Memory.settings && Memory.settings.profiler) {
        profilerEnabled = true;
        utils.profiler.enable();
        // screeps-profiler only auto-wraps the engine prototypes it's
        // handed (Profiler.prototypes) - our own dispatch layer
        // (roleLogic[role].run(), structureLogic[type].run(), and the big
        // per-room passes) lives on plain objects/functions, so a profile()
        // run showed nothing for any of it. Register those too, once, right
        // here - same wrap, same on/off switch, no extra cost when the
        // profiler is disabled.
        for (const role in creepLogic) {
            utils.profiler.registerObject(creepLogic[role], "role:" + role);
        }
        for (const type in structureLogic) {
            utils.profiler.registerObject(
                structureLogic[type],
                "structure:" + type
            );
        }
        ownOriginals = {
            planCity: roomLogic.planCity,
            getIntel: roomLogic.getIntel,
            spawning: roomLogic.spawning,
        };
        roomLogic.planCity = utils.profiler.registerFN(
            roomLogic.planCity,
            "roomLogic.planCity"
        );
        roomLogic.getIntel = utils.profiler.registerFN(
            roomLogic.getIntel,
            "roomLogic.getIntel"
        );
        roomLogic.spawning = utils.profiler.registerFN(
            roomLogic.spawning,
            "roomLogic.spawning"
        );
    }
}

// Low bucket: pause the optional modules until it refills (cpu.shedBucket).
function shedding() {
    return Game.cpu.bucket < config.get("cpu.shedBucket", 2000);
}

// A pixel zeroes the bucket; only make one while the measured average leaves room to
// refill it (pixel.minHeadroom under the limit). No published window = no pixel.
function pixelHeadroom() {
    if (!config.get("pixel.headroomGate", true)) return true;
    const snap = cpuMeter.snapshot();
    return !!snap && snap.used <= Game.cpu.limit - config.get("pixel.minHeadroom", 3);
}

function disableProfiler() {
    utils.profiler.disable();
    if (ownOriginals) {
        roomLogic.planCity = ownOriginals.planCity;
        roomLogic.getIntel = ownOriginals.getIntel;
        roomLogic.spawning = ownOriginals.spawning;
        ownOriginals = null;
    }
    profilerEnabled = false;
}

// Once a `profile(ticks)` session's window has fully closed (the report
// already printed on the disableTick itself, inside utils.profiler.wrap),
// turn the setting back off so a future global reset doesn't re-wrap every
// prototype method for a session nobody asked for anymore.
function maybeAutoDisableProfiler() {
    // A profile session costs several times the normal CPU (every engine call is
    // wrapped): on 2026-10-03 one drained the bucket from 8500 to ~900 in 100 ticks.
    // Below profile.minBucket the window is closed on this very tick (the report still
    // prints from the ending tick), whatever its planned length.
    if (
        Memory.profiler &&
        Memory.profiler.type === "profile" &&
        Number.isInteger(Memory.profiler.disableTick) &&
        Game.time < Memory.profiler.disableTick &&
        Game.cpu.bucket < config.get("profile.minBucket", 100)
    ) {
        console.log("[profile] bucket " + Game.cpu.bucket + " < " + config.get("profile.minBucket", 100) + ": closing the window early");
        Memory.profiler.disableTick = Game.time;
    }
    if (
        Memory.settings &&
        Memory.settings.profiler &&
        Memory.profiler &&
        Memory.profiler.type === "profile" &&
        Number.isInteger(Memory.profiler.disableTick) &&
        Game.time > Memory.profiler.disableTick
    ) {
        // L2 (ROADMAP 0113): keep the heaviest functions, per tick, for Grafana and take
        // every wrapper off again - nothing keeps costing once the session is over
        cpuMeter.setFns(
            utils.profiler.rows(),
            Memory.profiler.disableTick - Memory.profiler.enabledTick + 1
        );
        printCallers(15);
        disableProfiler();
        Memory.settings.profiler = false;
        Memory.profiler = null;
        // the per-subsystem CPU meter was reset by profile(): print it with the report
        console.log("[profile] cpuTop da janela (inclui o overhead do profiler):");
        printCpuTop(15);
        resetCpuMeter();
    }
}

// --- console: profile(ticks=100) ----------------------------------------
// Turns on Game.profiler for `ticks` ticks, lets it print its own report on
// the last tick (screeps-profiler's usual behavior), then flips
// Memory.settings.profiler back off by itself - see
// maybeAutoDisableProfiler() above. Writes Memory.profiler directly instead
// of calling Game.profiler.profile() because Game.profiler may not exist
// yet the very first time this runs (it's only built by utils.profiler.wrap
// on a tick where the setting is already on).
global.profile = function (ticks) {
    ticks = Number.isInteger(ticks) && ticks > 0 ? ticks : 100;
    Memory.settings = Memory.settings || {};
    Memory.settings.profiler = true;
    resetCpuMeter(); // the same window feeds the cpuTop table printed at the end
    utils.profiler.clearCallers();
    Memory.profiler = {
        map: {},
        totalTime: 0,
        enabledTick: Game.time + 1,
        disableTick: Game.time + ticks,
        type: "profile",
        filter: undefined,
    };
    console.log(
        `[profile] profiling ${ticks} ticks (until tick ${Game.time + ticks}); ` +
            "report and the cpuTop table print automatically, then the profiler turns itself off"
    );
};

// Run `fn`, but never let one subsystem's exception abort the whole tick. The time
// it took feeds the CPU meter (utils/cpuMeter, ROADMAP 0113): always as a module (the
// label prefix before ":"), and, when `group`/`key` are given, also under that
// group (roles / structures) so Grafana can tell one role or structure type from
// another.
function meterKey(label) {
    const i = label.indexOf(":");
    return i < 0 ? label : label.slice(0, i);
}
function guard(label, fn, group, key) {
    const start = Game.cpu.getUsed();
    try {
        fn();
    } catch (e) {
        console.log("[" + label + "] " + (e && e.stack ? e.stack : e));
    }
    const used = Game.cpu.getUsed() - start;
    cpuMeter.record("modules", meterKey(label), used);
    if (group) cpuMeter.record(group, key, used);
}
// Console: cpuTop(n=15) prints the heaviest modules / roles / structures / spans of the
// window in progress (cpuTop(0) prints and restarts it); "unguarded" is whatever the
// guards do not cover (Memory parse, loops outside guard, profiler overhead). The same
// numbers are published every stats.cpuWindowTicks ticks in Memory.stats.cpu.meter.
function printCpuTop(n) {
    const current = cpuMeter.live();
    const closed = current.ticks === 0 && cpuMeter.snapshot();
    const live = closed || current;
    const ticks = Math.max(1, live.ticks);
    let guarded = 0;
    Object.keys(live.modules).forEach((k) => { guarded += live.modules[k].avg * ticks; });
    console.log("[cpuTop] " + live.ticks + " ticks, avg " + live.used.toFixed(2) + "/tick, guarded " + (guarded / ticks).toFixed(2) + ", unguarded " + (live.used - guarded / ticks).toFixed(2) +
        (closed ? " (closed window at tick " + live.at + ")" : ""));
    const limit = n > 0 ? n : 15;
    cpuMeter.GROUPS.forEach((group) => {
        const rows = Object.keys(live[group]).map((k) => ({ k, s: live[group][k] }));
        rows.sort((a, b) => b.s.avg - a.s.avg);
        if (group !== "modules") console.log("  [" + group + "]");
        rows.slice(0, limit).forEach((r) => console.log("  " + r.k + ": " + r.s.avg.toFixed(3) + "/tick, " + r.s.calls.toFixed(1) + " calls/tick, max " + r.s.max.toFixed(2)));
    });
}
function resetCpuMeter() {
    const tp = utils.terminalOps.perf;
    Object.keys(tp).forEach((k) => delete tp[k]);
    cpuMeter.reset();
}
// Who calls Room.find (profile(N) session): per-tick average of the
// heaviest callers, so the 60 Room.find/tick can be traced to code.
function printCallers(n) {
    const ticks = Math.max(1, Memory.profiler.disableTick - Memory.profiler.enabledTick + 1);
    const rows = utils.profiler.callers();
    ["Room.find"].forEach((target) => {
        const mine = rows.filter((r) => r.name.indexOf(target + "<-") === 0);
        let total = 0;
        mine.forEach((r) => { total += r.calls; });
        console.log("[profile] " + target + " callers: " + (total / ticks).toFixed(1) + " calls/tick");
        mine.slice(0, n).forEach((r) => console.log("  " + r.name.slice(target.length + 2) + ": " + (r.calls / ticks).toFixed(2) + " calls/tick, " + (r.time / ticks).toFixed(3) + " cpu/tick"));
    });
    utils.profiler.clearCallers();
}
// Console: cpuProbe() prices the measuring itself - what an empty guard() and a bare
// Game.cpu.getUsed() cost - and projects it over the guard calls of the window in
// progress (cpuTop), to tell how much of "unguarded" is just the meter's own overhead.
global.cpuProbe = function () {
    const N = 300;
    let t = Game.cpu.getUsed();
    for (let i = 0; i < N; i++) Game.cpu.getUsed();
    const perGetUsed = (Game.cpu.getUsed() - t) / N;
    t = Game.cpu.getUsed();
    for (let i = 0; i < N; i++) guard("probe", () => {});
    const perGuard = (Game.cpu.getUsed() - t) / N;
    cpuMeter.drop("modules", "probe");
    const live = cpuMeter.live();
    let guards = 0;
    Object.keys(live.modules).forEach((k) => { guards += live.modules[k].calls; });
    console.log("[cpuProbe] getUsed " + perGetUsed.toFixed(4) + ", empty guard " + perGuard.toFixed(4) + " CPU; " + guards.toFixed(0) + " guards/tick => ~" + (guards * perGuard).toFixed(2) + " CPU/tick of measuring overhead");
};
global.cpuTop = function (n) {
    printCpuTop(n);
    if (n === 0) resetCpuMeter();
};

module.exports.loop = function () {
    // what the tick had already used before our code ran (engine setup, a global reset's
    // module load), and what the profiler/Memory wrappers cost - the "tick" meter group
    const entryCpu = Game.cpu.getUsed();
    // memory.wrap is the OUTERMOST layer on purpose: anything that touches `Memory`
    // before its cached object is swapped in (maybeEnableProfiler reads
    // Memory.settings) makes the engine JSON.parse the whole Memory every tick - ~3.5
    // CPU/tick in the 2026-10-03 profile (the "prelude" of the tick meter group).
    utils.memory.wrap(function () {
        maybeEnableProfiler();
        utils.profiler.wrap(function () {
            cpuMeter.record("tick", "entry", entryCpu);
            cpuMeter.record("tick", "prelude", Game.cpu.getUsed() - entryCpu);
            // Must run AFTER memory.wrap swapped in the cached Memory object: before
            // it, the writes landed on the freshly parsed Memory, which the swap
            // throws away - the session never closed (and cpuTop printed every tick).
            maybeAutoDisableProfiler();
            // make a list of all of our rooms
            Game.myRooms = _.filter(
                Game.rooms,
                (r) => r.controller && r.controller.level > 0 && r.controller.my
            );
            // keep city-plan segments (0007) loadable for next tick
            guard("planStore", () => utils.planStore.activate());
            // get intel for each room
            _.forEach(Game.rooms, (r) =>
                guard("intel:" + r.name, () => roomLogic.getIntel(r))
            );
            // plan the city layout for each room in our empire
            _.forEach(Game.myRooms, (r) =>
                guard("plan:" + r.name, () => roomLogic.planCity(r))
            );
            // preview the layout for a scouted (not owned) room on request -
            // see planLayout()/roles/scout.js. Needs the scout parked there
            // for vision, same as Game.myRooms needs an owned structure/creep.
            _.forEach(Game.rooms, (r) => {
                if (
                    Memory.layoutRequests &&
                    Memory.layoutRequests[r.name] &&
                    !(r.controller && r.controller.my)
                ) {
                    guard("plan:" + r.name, () =>
                        roomLogic.planCity(r, { preview: true })
                    );
                }
            });
            // opt-in opportunistic raiding (ROADMAP 0032 O4) - off unless
            // Memory.settings.raiding.autoRaid is explicitly true
            if (config.get("raiding.autoRaid", false) && !Memory.raidTarget) {
                _.forEach(Game.myRooms, (r) => {
                    if (Memory.raidTarget) return; // another room's scan already claimed it this tick
                    guard("raiding:" + r.name, () => {
                        const target = roomLogic.raiding.findWeakTarget();
                        if (target) global.raidRoom(target, r.name);
                    });
                });
            }
            // run spawn logic for each room in our empire
            _.forEach(Game.myRooms, (r) =>
                guard("spawn:" + r.name, () => roomLogic.spawning(r))
            );
            // Hydrate and refresh prices before any market consumer evaluates them.
            guard("market", () => utils.market.scan()); // Market owns its 500-bucket gate.
            guard("terminalOps", () => utils.terminalOps.tick());
            if (!shedding()) guard("marketFlip", () => utils.marketFlip.tick());
            guard("craftPlanner", () => utils.craftPlanner.tick());
            guard("energyBalancing", () => utils.energyBalancing.run());
            if (!shedding()) guard("swingTrade", () => utils.swingTrade.tick());
            // automatic safe mode when a spawn is in real danger (ROADMAP
            // 0032 D6) - conservative gate, see rooms/defense.js
            _.forEach(Game.myRooms, (r) =>
                guard("defense:" + r.name, () => roomLogic.checkSafeMode(r))
            );
            // run each creep role see /roles/index.js
            guard("craftLedger", () => require("./utils/craftLedger").tick());
            for (var name in Game.creeps) {
                var creep = Game.creeps[name];
                let role = creep.memory.role;
                // 0014: the harvester role was folded into hauler
                if (role === "harvester") role = creep.memory.role = "hauler";
                guard("traffic:" + name, () => utils.traffic.record(creep));
                if (creepLogic[role]) {
                    guard("creep:" + name, () => creepLogic[role].run(creep), "roles", role);
                }
            }
            guard("traffic:trace", () => utils.traffic.flushScoutTrace());
            // age the traffic counters down (heap-only, gated internally to
            // once every DECAY_INTERVAL ticks)
            guard("traffic:decay", () => utils.traffic.decay());
            // free up memory if creep no longer exists
            for (var name in Memory.creeps) {
                if (!Game.creeps[name]) {
                    delete Memory.creeps[name];
                }
            }
            // ramparts: one decision per room (which gates let an ally through), not one per
            // rampart - see structures/rampart.js
            _.forEach(Game.myRooms, (r) =>
                guard("rampart:" + r.name, () => structureLogic.rampart.runRoom(r), "structures", "rampart")
            );
            // run each structure role see /structures/index.js
            for (var id in Game.structures) {
                var structure = Game.structures[id];
                let structureType = structure.structureType;
                if (structureType === STRUCTURE_RAMPART) continue;

                if (structureLogic[structureType]) {
                    guard(
                        "structure:" + id,
                        () => structureLogic[structureType].run(structure),
                        "structures",
                        structureType
                    );
                }
            }
            // free up memory if structure no longer exists
            for (var sid in Memory.structures) {
                if (!Game.structures[sid]) {
                    delete Memory.structures[sid];
                }
            }
            // ROADMAP 0045, old_1 parity: a full CPU bucket is wasted if it
            // just sits there - convert it into a Pixel every tick it stays
            // full. Off switch: Memory.settings.pixel.enabled = false.
            guard("pixel", () => {
                if (
                    config.get("pixel.enabled", true) &&
                    pixelHeadroom() &&
                    Game.cpu.bucket >= config.get("pixel.bucketThreshold", 10000) &&
                    typeof Game.cpu.generatePixel === "function"
                ) {
                    Game.cpu.generatePixel();
                }
            });
            guard("stats", () => utils.stats());
            cpuMeter.endTick();
        });
    });
};
