// ROADMAP 0149 T4/T5 (ARK-136): automatic builder boost - plan (candidate, stock, free lab, worth
// through readiness admission), apply (walk / boostCreep without ever waiting), confirm (receipt).
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const saved = { game: global.Game, memory: global.Memory, mineral: global.LAB_BOOST_MINERAL, energy: global.LAB_BOOST_ENERGY };
    const census = require(src("census")), roomCache = require(src("roomCache")), market = require(src("market"));
    const logistics = require(src("boostLogistics")), breakeven = require(src("boostBreakeven"));
    const readinessContext = require(src("readinessContext")), labReservations = require(src("labReservations"));
    const original = { byRole: census.creepsByRole, byType: roomCache.structuresByType, snapshot: market.snapshot,
        reserve: logistics.reserve, freeLab: logistics.freeLab, enabled: logistics.enabled, cancel: logistics.cancel,
        build: breakeven.buildContext, spend: readinessContext.validateAndSpend, all: labReservations.all };
    try {
        global.LAB_BOOST_MINERAL = 30; global.LAB_BOOST_ENERGY = 20;
        global.Memory = { settings: {}, rooms: { BR: {} } };
        global.Game = Object.assign({}, saved.game, { time: 9000, creeps: {} });
        const room = { name: "BR", storage: { store: { LH: 600, energy: 50000 } }, terminal: null };
        const part = (type) => ({ type, hits: 100 });
        const body = () => [].concat(Array(5).fill(WORK), Array(5).fill(CARRY), Array(5).fill(MOVE)).map(part);
        let moved = 0, boostCalls = [];
        const creep = { id: "c1", name: "b1", room, spawning: false, ticksToLive: 1400, body: body(), memory: { role: "builder" },
            pos: { near: false, isNearTo() { return this.near; } }, moveTo: () => { moved++; return OK; } };
        Game.creeps.b1 = creep;
        const lab = { id: "lab1", room, store: { LH: 0, energy: 0 }, mineralType: null,
            boostCreep: (c, n) => { boostCalls.push(n); return OK; } };
        global.Game.getObjectById = (id) => (id === "lab1" ? lab : id === "c1" ? creep : null);
        let builders = [creep];
        census.creepsByRole = () => builders;
        roomCache.structuresByType = () => [lab];
        market.snapshot = () => ({ resources: { LH: { fairPrice: 600, buyPrice: 550, sellPrice: 650 } } });
        let freeLab = true;
        logistics.freeLab = () => freeLab;
        logistics.enabled = () => true;
        const records = {};
        labReservations.all = () => records;
        Memory.rooms.BR.labBoostReservations = records;
        let reserveCtx = null;
        logistics.reserve = (c, l, compound, ctx) => {
            reserveCtx = ctx;
            records[l.id] = { managedBy: "boostLogistics", state: "reserved", ownerCreepId: c.id, ownerCreepName: c.name, compound,
                bodyPartsCount: 5, requiredMineral: 150, requiredEnergy: 100, shipments: {}, pending: false };
            return { status: "reserved", decision: { selection: { bodyPartsCount: 5 }, grossBenefit: 50000, cost: 20000 } };
        };
        const cancels = [];
        logistics.cancel = (r, id, reason) => { cancels.push(reason); records[id].state = "draining"; return true; };
        breakeven.buildContext = () => ({ ctx: { delivery: {}, actions: [] } });
        let admitted = true;
        readinessContext.validateAndSpend = (r, owner, plan, submit) => (admitted
            ? (submit() === OK ? { ok: true, status: "submitted" } : { ok: false, status: "submit-failed", reasons: ["submit"] })
            : { ok: false, status: "blocked", reasons: ["shortfall"] });
        Memory.settings.boost = { compound: "LH" };
        delete require.cache[require.resolve(src("boostExecutor"))];
        const ex = require(src("boostExecutor"));

        builders = [Object.assign({}, creep, { ticksToLive: 600 })];
        assert(ex.plan(room).reason === "no-candidate-builder", "0149 spawn never waits: a builder near the end of its life is no candidate (boost.minTtl)");
        builders = [creep];
        room.storage.store.LH = 10;
        Memory.settings.boost.buy = false;
        assert(ex.plan(room).reason === "no-compound-stock", "0149 executable acquisition: with boost.buy off and no own stock, no boost and nothing bought");
        delete Memory.settings.boost.buy;
        // T6 fallback: buy the missing compound only if the boost still pays at ask + freight
        const policy = require(src("boostPolicy")), ops = require(src("terminalOps"));
        const keep = { worth: policy.worth, buy: ops.buy };
        let worthAsked = null, buys = [];
        ops.buy = (roomName, resource, amount, limit, listing) => { buys.push({ roomName, resource, amount, limit, listing }); return { ok: true }; };
        breakeven.buildContext = () => ({ ctx: { delivery: {}, actions: [], costs: { energyUnitValue: 30 } } });
        policy.worth = (role, compound, ctx) => { worthAsked = ctx.compoundOpportunity; return { worth: false, status: "blocked", reason: "insufficient-return" }; };
        let bought = ex.plan(room);
        assert(bought.reason === "buy-not-worth:insufficient-return" && !buys.length && Math.abs(worthAsked.netUnitValue - (650 + 0.6 * 30)) < 1e-9 && worthAsked.quantity === 150,
            "0149 executable acquisition: the buy is priced at the ask plus freight, and a boost that would not pay buys nothing (got " + JSON.stringify(bought) + ")");
        policy.worth = () => ({ worth: true, status: "ready", grossBenefit: 90000, cost: 30000 });
        bought = ex.plan(room);
        assert(bought.status === "buying" && buys.length === 1 && buys[0].amount === 140 && buys[0].limit === 663 && buys[0].listing === false && !records.lab1,
            "0149 executable acquisition: a paying boost buys only the missing amount from existing asks, no listing, nothing reserved yet (got " + JSON.stringify(buys) + ")");
        policy.worth = keep.worth; ops.buy = keep.buy;
        breakeven.buildContext = () => ({ ctx: { delivery: {}, actions: [] } });
        room.storage.store.LH = 600;
        freeLab = false;
        assert(ex.plan(room).reason === "no-free-lab", "0149 lab opportunity: a lab a reaction or plan uses is never taken for a boost");
        freeLab = true;
        admitted = false;
        assert(ex.plan(room).status === "blocked" && !records.lab1, "0149 canonical reservations: readiness refusing the application energy reserves nothing");
        admitted = true;
        const planned = ex.plan(room);
        assert(planned.status === "reserved" && records.lab1 && reserveCtx.compoundOpportunity.netUnitValue === 550 && reserveCtx.compoundOpportunity.quantity === 600,
            "0149 realizable benefit: own stock is valued at the market bid and the reservation is made (got " + JSON.stringify(planned) + ")");
        assert(ex.plan(room).status === "busy", "0149 reservation lifecycle: one boost at a time per room");

        assert(ex.claim(creep) === false && moved === 0, "0149 spawn never waits: while the lab is being filled the builder keeps working");
        lab.store = { LH: 150, energy: 100 }; lab.mineralType = "LH";
        assert(ex.claim(creep) === true && moved === 1 && !boostCalls.length, "0149 engine part selection: a prepared lab draws the builder to it");
        creep.pos.near = true;
        assert(ex.claim(creep) === true && boostCalls[0] === 5 && records.lab1.state === "applying" && records.lab1.receipt,
            "0149 partial confirmation: next to the lab the builder is boosted with a captured receipt");
        assert(ex.claim(creep) === false, "0149 reservation lifecycle: an applying record is not boosted twice");

        // next tick: the engine boosted the first 5 WORK parts and took 150 LH + 100 energy
        Game.time++;
        creep.body = creep.body.map((p, i) => (i < 5 ? Object.assign({}, p, { boost: "LH" }) : p));
        lab.store = { LH: 0, energy: 0 };
        ex.confirm(room);
        assert(records.lab1.confirmation === "confirmed" && records.lab1.partsConfirmed === 5 && cancels.slice(-1)[0] === "applied" &&
            records.lab1.state === "draining" && Memory.rooms.BR.boostApplied.parts === 5,
            "0149 partial confirmation: the body and lab stock confirm all parts, then the lab drains and frees (got " + JSON.stringify(records.lab1) + ")");
        assert(ex.plan(room).status === "busy", "0149 forced cleanup off idle drain: a draining lab keeps the room busy until released");
        records.lab1.state = "released";
        builders = [creep];
        assert(ex.plan(room).reason === "no-candidate-builder", "0149 engine part selection: an already boosted builder is not boosted again");

        Memory.settings.boost = { compound: "LH", enabled: false };
        records.lab1 = { managedBy: "boostLogistics", state: "reserved", ownerCreepId: "c1", compound: "LH", bodyPartsCount: 5,
            requiredMineral: 150, requiredEnergy: 100, shipments: {}, pending: false };
        lab.store = { LH: 150, energy: 100 };
        assert(ex.claim(creep) === false, "0149 fallback: with boost.enabled false the builder ignores any record and just works");
    } finally {
        census.creepsByRole = original.byRole; roomCache.structuresByType = original.byType; market.snapshot = original.snapshot;
        logistics.reserve = original.reserve; logistics.freeLab = original.freeLab; logistics.enabled = original.enabled; logistics.cancel = original.cancel;
        breakeven.buildContext = original.build; readinessContext.validateAndSpend = original.spend; labReservations.all = original.all;
        if (saved.mineral === undefined) delete global.LAB_BOOST_MINERAL; else global.LAB_BOOST_MINERAL = saved.mineral;
        if (saved.energy === undefined) delete global.LAB_BOOST_ENERGY; else global.LAB_BOOST_ENERGY = saved.energy;
        global.Game = saved.game; global.Memory = saved.memory;
    }
};
