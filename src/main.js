let creepLogic = require("./roles");
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

// Once a `profile(ticks)` session's window has fully closed (the report
// already printed on the disableTick itself, inside utils.profiler.wrap),
// turn the setting back off so a future global reset doesn't re-wrap every
// prototype method for a session nobody asked for anymore.
function maybeAutoDisableProfiler() {
    if (
        Memory.settings &&
        Memory.settings.profiler &&
        Memory.profiler &&
        Memory.profiler.type === "profile" &&
        Number.isInteger(Memory.profiler.disableTick) &&
        Game.time > Memory.profiler.disableTick
    ) {
        Memory.settings.profiler = false;
        Memory.profiler = null;
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
            "report prints automatically, then the profiler turns itself off"
    );
};

// Run `fn`, but never let one subsystem's exception abort the whole tick.
function guard(label, fn) {
    try {
        fn();
    } catch (e) {
        console.log("[" + label + "] " + (e && e.stack ? e.stack : e));
    }
}

module.exports.loop = function () {
    maybeEnableProfiler();
    maybeAutoDisableProfiler();
    utils.profiler.wrap(function () {
        utils.memory.wrap(function () {
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
            guard("terminalOps", () => utils.terminalOps.tick());
            guard("energyBalancing", () => utils.energyBalancing.run());
            // automatic safe mode when a spawn is in real danger (ROADMAP
            // 0032 D6) - conservative gate, see rooms/defense.js
            _.forEach(Game.myRooms, (r) =>
                guard("defense:" + r.name, () => roomLogic.checkSafeMode(r))
            );
            // run each creep role see /roles/index.js
            for (var name in Game.creeps) {
                var creep = Game.creeps[name];
                let role = creep.memory.role;
                // 0014: the harvester role was folded into hauler
                if (role === "harvester") role = creep.memory.role = "hauler";
                guard("traffic:" + name, () => utils.traffic.record(creep));
                if (creepLogic[role]) {
                    guard("creep:" + name, () => creepLogic[role].run(creep));
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
            // run each structure role see /structures/index.js
            for (var id in Game.structures) {
                var structure = Game.structures[id];
                let structureType = structure.structureType;

                if (structureLogic[structureType]) {
                    guard("structure:" + id, () =>
                        structureLogic[structureType].run(structure)
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
                    Game.cpu.bucket >= config.get("pixel.bucketThreshold", 10000) &&
                    typeof Game.cpu.generatePixel === "function"
                ) {
                    Game.cpu.generatePixel();
                }
            });
            guard("market", () => utils.market.scan());
            guard("stats", () => utils.stats());
        });
    });
};
