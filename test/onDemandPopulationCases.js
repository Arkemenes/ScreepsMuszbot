// ROADMAP 0148 T2 (ARK-135): builder target precedence after autoscale - manual override,
// opt-in policy with evidence, persistent pilot state, recovery and the emergency floor.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src", n);
    const saved = { game: global.Game, memory: global.Memory };
    const census = require(src("utils/census"));
    const damaged = require(src("utils/damagedStructures"));
    const repair = require(src("utils/rampartRepair"));
    const demand = require(src("utils/builderDemand"));
    const report = require(src("utils/energyReport"));
    const tiers = require(src("utils/resourceTiers"));
    const original = { count: census.count, sorted: damaged.sorted, mayRepair: repair.builderMayRepair,
        evaluate: demand.evaluate, context: report.context, economy: tiers.getEconomySnapshot };
    try {
        let builders = 0, list = [], result = { useful: false, reasons: [], lead: 294, idleSince: 1000 }, ctx = { utilization: { builder: { ratio: 0.02 } } };
        census.count = (room, role) => (role === "builder" ? builders : 0);
        damaged.sorted = () => list;
        repair.builderMayRepair = (s) => s.hits < s.hitsMax;
        demand.evaluate = () => result;
        report.context = () => ctx;
        let economy = "stable";
        tiers.getEconomySnapshot = () => ({ state: economy, reason: "none", criticalConsumers: 0 });
        global.Memory = { settings: { population: { onDemand: { rooms: ["Pilot"] } } }, rooms: { Pilot: {}, Other: {} } };
        global.Game = Object.assign({}, saved.game, { time: 1100 });
        repair.resetLimits();
        delete require.cache[require.resolve(src("rooms/onDemandPopulation"))];
        const policy = require(src("rooms/onDemandPopulation"));
        const pilot = { name: "Pilot" }, other = { name: "Other" };
        const run = (room, legacy = 1) => policy.apply(room, { builder: legacy }, Memory.rooms[room.name]).builder;

        builders = 1;
        assert(run(pilot) === 1 && policy.status("Pilot").mode === "candidate",
            "0148 precedence: idle shorter than max(lead, minIdleTicks) keeps the legacy builder (got " + JSON.stringify(policy.status("Pilot")) + ")");
        Game.time = 1400;
        ctx = null;
        assert(run(pilot) === 1 && policy.status("Pilot").reasons[0] === "energyReport-coverage",
            "0148 precedence: no energyReport window coverage, no entry into the pilot");
        ctx = { utilization: { builder: { ratio: 0.5 } } };
        assert(run(pilot) === 1 && policy.status("Pilot").reasons[0] === "builder-busy",
            "0148 precedence: builders above maxBuilderUtilization keep the room out of the pilot");
        ctx = { utilization: { builder: { ratio: 0.02 } } };
        assert(run(pilot) === 0 && Memory.rooms.Pilot.onDemand.state === "active" && Memory.rooms.Pilot.onDemand.since === 1400,
            "0148 precedence: idle long enough with evidence -> builder 0 and a persistent active pilot");
        result = { useful: false, reasons: [], lead: 294, idleSince: 1450 }; ctx = null; Game.time = 1460;
        assert(run(pilot) === 0, "0148 precedence: an active pilot holds across a reset (idle run restarted, no coverage yet)");

        Memory.rooms.Pilot.wantedOverride = { builder: 1 };
        assert(run(pilot) === 1 && policy.status("Pilot").mode === "manual", "0148 precedence: a manual override wins over the policy");
        delete Memory.rooms.Pilot.wantedOverride;

        builders = 0; result = { useful: true, reasons: ["build"], lead: 294, idleSince: null }; Game.time = 1500;
        assert(run(pilot) === 1 && Memory.rooms.Pilot.onDemand.state === "recovering" && Memory.rooms.Pilot.onDemand.detectionTick === 1500,
            "0148 recovery ownership: demand returning ends the pilot at once, recording the detection tick");
        builders = 1; Game.time = 1501;
        run(pilot);
        assert(!Memory.rooms.Pilot.onDemand, "0148 recovery ownership: recovering closes once a builder exists again");

        Memory.rooms.Pilot.onDemand = { state: "active", since: 1 };
        Memory.settings.population.onDemand.rooms = [];
        assert(run(pilot) === 1 && !Memory.rooms.Pilot.onDemand && policy.status("Pilot").mode === "off",
            "0148 recovery ownership: a room taken off the policy drops its pilot state and is legacy again");

        // T4 (AC9): no eligible room -> the policy stays off, with the reason per room
        Memory.settings.population.onDemand.rooms = ["Pilot"];
        builders = 1; result = { useful: false, reasons: [], lead: 294, idleSince: 1000 }; ctx = { utilization: { builder: { ratio: 0.02 } } };
        Game.time = 1600;
        Memory.rooms.Pilot.enemies = 2;
        assert(run(pilot) === 1 && policy.status("Pilot").mode === "ineligible" && policy.status("Pilot").reasons[0] === "threat" && !Memory.rooms.Pilot.onDemand,
            "0148 no eligible room: hostiles in the room keep it out of the pilot, reason threat (got " + JSON.stringify(policy.status("Pilot")) + ")");
        delete Memory.rooms.Pilot.enemies;
        economy = "critical";
        assert(run(pilot) === 1 && policy.status("Pilot").reasons[0] === "economy-critical",
            "0148 no eligible room: a critical economy is no stable supply, reason economy-critical");
        run(other);
        assert(policy.status("Other").mode === "off" && policy.status("Other").reasons[0] === "not-opted-in",
            "0148 no eligible room: a room outside population.onDemand.rooms reports not-opted-in");
        const out = global.onDemandStatus();
        assert(/Pilot.*economy-critical/.test(out) && /Other.*not-opted-in/.test(out) && /nenhuma sala ativa/.test(out),
            "0148 no eligible room: onDemandStatus() lists the reason of every room and says none is active (got " + out + ")");
        economy = "stable";
        assert(run(pilot) === 0 && Memory.rooms.Pilot.onDemand.state === "active", "0148 no eligible room: eligible again -> the pilot can enter");
        builders = 0; Memory.rooms.Pilot.defenseActive = true; Game.time = 1610;
        assert(run(pilot) === 1 && Memory.rooms.Pilot.onDemand.state === "recovering" && Memory.rooms.Pilot.onDemand.reasons[0] === "threat",
            "0148 no eligible room: a threat while active ends the pilot (recovering, reason threat)");
        delete Memory.rooms.Pilot.defenseActive;
        Memory.settings.population.onDemand.enabled = false;
        assert(run(pilot) === 1 && !Memory.rooms.Pilot.onDemand && policy.status("Pilot").reasons[0] === "flag-off",
            "0148 no eligible room: the global flag off reports flag-off and drops the pilot state");
        delete Memory.settings.population.onDemand.enabled;
        Memory.settings.population.onDemand.rooms = [];

        builders = 0;
        list = [{ structureType: STRUCTURE_ROAD, hits: 100, hitsMax: 5000 }];
        assert(run(other, 0) === 1 && policy.status("Other").floor === "critical",
            "0148 emergency after death: policy off, builder dead, critical repair -> exactly one builder (legacy 0)");
        list = [{ structureType: STRUCTURE_CONTAINER, hits: 90000, hitsMax: 250000 }];
        assert(run(other, 0) === 1 && policy.status("Other").floor === "container",
            "0148 emergency after death: a container under the rescue mark wants one builder");
        builders = 1;
        assert(run(other, 0) === 0, "0148 emergency after death: a living builder already covers the floor (no duplicate)");
        list = [];
        builders = 0;
        assert(run(other, 0) === 0, "0148 emergency after death: no rescue mark, no floor - legacy stands");
    } finally {
        census.count = original.count;
        damaged.sorted = original.sorted;
        repair.builderMayRepair = original.mayRepair;
        demand.evaluate = original.evaluate;
        report.context = original.context;
        tiers.getEconomySnapshot = original.economy;
        repair.resetLimits();
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
