// ROADMAP 0148 T1 (ARK-135): builder demand - useful work now, tower coverage never presumed,
// replacement lead and the unbroken idle run.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory };
    const cache = require(src("roomCache"));
    const damaged = require(src("damagedStructures"));
    const repair = require(src("rampartRepair"));
    const tiers = require(src("resourceTiers"));
    const original = { sites: cache.constructionSites, byType: cache.structuresByType, sorted: damaged.sorted,
        mayRepair: repair.builderMayRepair, economy: tiers.getEconomySnapshot };
    try {
        let sites = [], list = [], economy = "stable";
        const tower = (energy) => ({ store: { energy, getCapacity: () => 1000 } });
        let towers = [tower(1000), tower(900)];
        cache.constructionSites = () => sites;
        cache.structuresByType = (r, type) => (type === STRUCTURE_TOWER ? towers : []);
        damaged.sorted = () => list;
        repair.builderMayRepair = (s) => s.hits < s.hitsMax;
        tiers.getEconomySnapshot = () => ({ state: economy });
        const room = { name: "DemandRoom", energyCapacityAvailable: 12900, controller: { my: true, level: 8 } };
        global.Memory = { settings: {}, rooms: { DemandRoom: {} } };
        global.Game = Object.assign({}, saved.game, { time: 5000 });
        repair.resetLimits();
        delete require.cache[require.resolve(src("builderDemand"))];
        const demand = require(src("builderDemand"));

        let r = demand.evaluate(room);
        assert(!r.useful && r.reasons.length === 0 && r.idleSince === 5000 && r.lead === 16 * 3 * 3 + 150,
            "0148 demand preservation: RCL8, nothing to build or repair, towers full -> no builder demand; lead = parts x spawn + travel + margin (got " + JSON.stringify(r) + ")");
        sites = [{ id: "site" }];
        assert(demand.evaluate(room).reasons.join() === "build", "0148 demand preservation: any construction site is builder demand");
        sites = [];
        room.controller.level = 7;
        assert(demand.evaluate(room).reasons.join() === "rcl-progress", "0148 demand preservation: below RCL8 every upgrade is RCL progress");
        room.controller.level = 8;
        const road = { structureType: STRUCTURE_ROAD, hits: 400, hitsMax: 5000 };
        const container = { structureType: STRUCTURE_CONTAINER, hits: 100000, hitsMax: 250000 };
        const rampart = { structureType: STRUCTURE_RAMPART, hits: 1000000, hitsMax: 300000000 };
        list = [road];
        assert(demand.evaluate(room).reasons.join() === "repair-critical",
            "0148 demand preservation: a critical repair is demand even with full towers (emergency floor)");
        list = [container];
        assert(!demand.evaluate(room).useful, "0148 demand preservation: a normal repair covered by full, idle towers is not builder demand");
        const uncovered = (why) => demand.evaluate(room).reasons.join() === "repair-uncovered:" + why;
        towers = [tower(1000), tower(500)];
        assert(uncovered("tower-energy"), "0148 demand preservation: one tower below the satisfactory energy ratio is no coverage");
        towers = [];
        assert(uncovered("no-tower"), "0148 demand preservation: no tower, no presumed coverage");
        towers = [tower(1000)];
        Memory.rooms.DemandRoom.defenseActive = true;
        assert(uncovered("defense"), "0148 demand preservation: towers busy with defense are no coverage");
        delete Memory.rooms.DemandRoom.defenseActive;
        economy = "critical";
        assert(uncovered("economy-critical"), "0148 demand preservation: a critical economy cannot keep the towers refilled");
        economy = "stable";
        list = [rampart];
        assert(demand.evaluate(room).reasons.join() === "repair-defensive",
            "0148 demand preservation: rampart hardening the storage gates allow is useful builder work");
        repair.builderMayRepair = () => false;
        assert(!demand.evaluate(room).useful, "0148 demand preservation: repair the builder may not do (storage gates) is not demand");
        repair.builderMayRepair = (s) => s.hits < s.hitsMax;

        list = [];
        demand.reset();
        Game.time = 6000; demand.evaluate(room);
        Game.time = 6005; r = demand.evaluate(room);
        assert(r.idleSince === 6000, "0148 demand preservation: the idle run survives the needs cache interval");
        Game.time = 6040; r = demand.evaluate(room);
        assert(r.idleSince === 6040, "0148 demand preservation: evaluations further apart than gapTicks restart the idle run");
        sites = [{ id: "site" }]; Game.time = 6045; demand.evaluate(room);
        sites = []; Game.time = 6050; r = demand.evaluate(room);
        assert(r.idleSince === 6050, "0148 demand preservation: a demand tick clears the idle run");
    } finally {
        cache.constructionSites = original.sites;
        cache.structuresByType = original.byType;
        damaged.sorted = original.sorted;
        repair.builderMayRepair = original.mayRepair;
        tiers.getEconomySnapshot = original.economy;
        repair.resetLimits();
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
