"use strict";
// ROADMAP 0149 T4/T5 (ARK-136): the automatic builder boost - plan, apply, confirm - on top of
// utils/boostLogistics (preparation, hauler feeding, drain) and utils/boostConfirmation.
//
//   plan(room)    every boost.planInterval ticks, with no boost record active in the room: the
//                 longest-lived unboosted builder (ttl >= boost.minTtl) and a free lab. The worth
//                 context is the room's observed one (utils/boostBreakeven: builder duty from
//                 energyReport, energy at fairPrice) plus the compound's opportunity value - our
//                 own stock, valued at the market bid (what selling it would fetch). Admission is
//                 readinessContext.validateAndSpend (0157), whose submit is boostLogistics.reserve
//                 (which runs boostPolicy.worth with the return margin). Without enough stock
//                 (T6 fallback), worth() is asked at the ASK price plus the estimated freight
//                 (boost.buyFreightPerUnit energy/unit at the energy fairPrice); only if it still
//                 pays, terminalOps.buy fetches the missing amount from existing asks (no listing,
//                 limit ask x boost.buyLimitRatio) and a later plan reserves the delivered stock.
//   claim(creep)  from roles/builder before it works: once its lab holds the mineral and energy
//                 (no shipment pending) the builder walks there and calls lab.boostCreep, after
//                 capturing a receipt; the record turns "applying". Until the lab is ready the
//                 builder keeps working - the boost never makes it (or a spawn) wait.
//   confirm(room) next tick: boostConfirmation.reconcile against the body and the lab's stock ->
//                 partsConfirmed / consumed, then boostLogistics.cancel(..., "applied") drains the
//                 leftovers and frees the lab. A missing creep or lab ends it as uncertain.
// Heap: the last plan tick per room. Memory: only the boostLogistics record (labBoostReservations).
const config = require("./config");
const census = require("./census");
const roomCache = require("./roomCache");
const logistics = require("./boostLogistics");
const confirmation = require("./boostConfirmation");
const constants = require("./boostConstants");
const breakeven = require("./boostBreakeven");
const readinessContext = require("./readinessContext");
const labReservations = require("./labReservations");
const market = require("./market");
const boostPolicy = require("./boostPolicy");

const lastPlan = {}; // roomName -> tick
const last = {}; // roomName -> { tick, result }

function records(room) {
    return labReservations.all(room.name) || {};
}

function ownRecords(room) {
    return Object.entries(records(room)).filter(([, r]) => r && r.managedBy === "boostLogistics");
}

function busy(room) {
    return ownRecords(room).some(([, r]) => ["reserved", "loading", "applying", "confirming", "draining", "quarantined"].includes(r.state));
}

function boosted(creep) {
    return creep.body.some((p) => p.boost);
}

function stockOf(room, resource) {
    return (room.storage && room.storage.store[resource] || 0) + (room.terminal && room.terminal.store[resource] || 0);
}

function plan(room) {
    const compound = config.get("boost.compound", "XLH2O");
    const note = (result) => { last[room.name] = { tick: Game.time, result }; return result; };
    if (busy(room)) return note({ status: "busy" });
    const k = constants.current();
    const minTtl = Number(config.get("boost.minTtl", 1200));
    const builders = census.creepsByRole(room.name, "builder")
        .filter((c) => !c.spawning && c.ticksToLive >= minTtl && c.body && !boosted(c))
        .sort((a, b) => b.ticksToLive - a.ticksToLive);
    if (!builders.length) return note({ status: "unknown", reason: "no-candidate-builder" });
    const stock = stockOf(room, compound);
    const lab = roomCache.structuresByType(room, STRUCTURE_LAB).find((l) => logistics.freeLab(room, l) && (!l.mineralType || l.mineralType === compound));
    if (!lab) return note({ status: "blocked", reason: "no-free-lab" });
    const creep = builders[0];
    const needed = creep.body.filter((p) => p.type === WORK).length * (k.mineralPerPart || 30);
    const built = breakeven.buildContext(room, compound, creep);
    if (built.fail) return note({ status: "unknown", reason: built.fail });
    const snap = market.snapshot();
    const r = snap && snap.resources && snap.resources[compound];
    if (stock < needed) return note(buyFallback(room, creep, compound, built, r, needed, needed - stock));
    const bid = r && (r.buyPrice > 0 ? r.buyPrice : r.fairPrice > 0 ? r.fairPrice : null);
    if (!bid) return note({ status: "unknown", reason: "compound-price-unknown" });
    const ctx = Object.assign({}, built.ctx, {
        compoundOpportunity: { netUnitValue: bid, quantity: stock, observedTick: Game.time, validUntilTick: Game.time, executable: true },
    });
    let reserved = null;
    const owner = "boost:" + creep.name;
    // the application energy (WORK x LAB_BOOST_ENERGY) is the immediate draw the room must cover
    const applicationEnergy = creep.body.filter((p) => p.type === WORK).length * (k.energyPerPart || 20);
    const spend = readinessContext.validateAndSpend(room, owner,
        { amount: applicationEnergy, untilTick: Game.time + Number(config.get("boost.deadlineTicks", 100)), horizonTicks: 1 },
        () => { reserved = logistics.reserve(creep, lab, compound, ctx); return reserved.status === "reserved" ? OK : ERR_INVALID_ARGS; });
    if (!spend.ok) return note({ status: reserved ? reserved.status : spend.status, reason: reserved ? reserved.reason : spend.reasons[0], creep: creep.name });
    console.log("[boost] " + room.name + ": " + creep.name + " reservado no lab " + lab.id + " (" + compound + ", " +
        reserved.decision.selection.bodyPartsCount + " partes, benefício " + Math.round(reserved.decision.grossBenefit) +
        " vs custo " + Math.round(reserved.decision.cost) + " cr)");
    return note({ status: "reserved", creep: creep.name, lab: lab.id, parts: reserved.decision.selection.bodyPartsCount });
}

// T6: no (or too little) own stock - buy it only if the boost still pays at the ask plus freight
function buyFallback(room, creep, compound, built, quote, needed, missing) {
    if (config.get("boost.buy", true) === false) return { status: "blocked", reason: "no-compound-stock" };
    const ask = quote && quote.sellPrice > 0 ? quote.sellPrice : null;
    if (!ask) return { status: "unknown", reason: "compound-ask-unknown" };
    const energyPrice = built.ctx.costs && built.ctx.costs.energyUnitValue;
    const unit = ask + Number(config.get("boost.buyFreightPerUnit", 0.6)) * (energyPrice || 0);
    const decision = boostPolicy.worth("builder", compound, Object.assign({}, built.ctx, {
        body: creep.body, ttl: creep.ticksToLive, nowTick: Game.time, constants: constants.current(),
        // the whole application at the marginal (bought) unit cost: conservative for the stock we hold
        compoundOpportunity: { netUnitValue: unit, quantity: needed, observedTick: Game.time, validUntilTick: Game.time, executable: true },
    }));
    if (!decision.worth) return { status: decision.status, reason: "buy-not-worth:" + (decision.reason || "insufficient-return"), unitCost: unit };
    const limit = Math.round(ask * Number(config.get("boost.buyLimitRatio", 1.02)) * 1000) / 1000;
    const order = require("./terminalOps").buy(room.name, compound, missing, limit, false, false,
        { owner: { kind: "boost", id: room.name + ":" + compound } });
    return order.ok ? { status: "buying", amount: missing, limit, gross: Math.round(decision.grossBenefit), cost: Math.round(decision.cost) }
        : { status: "blocked", reason: "buy:" + order.error };
}

// the record this builder owns in its room, if any
function ownedBy(creep) {
    for (const [labId, r] of ownRecords(creep.room)) if (r.ownerCreepId === creep.id) return [labId, r];
    return null;
}

function prepared(r, lab) {
    return !r.pending && !Object.keys(r.shipments || {}).length &&
        (lab.store[r.compound] || 0) >= r.requiredMineral && (lab.store[RESOURCE_ENERGY] || 0) >= r.requiredEnergy;
}

// true when the builder spent its tick on the boost (walking to the lab or being boosted)
function claim(creep) {
    if (config.get("boost.enabled", true) === false) return false;
    const own = ownedBy(creep);
    if (!own) return false;
    const [labId, r] = own;
    if (r.state !== "reserved" && r.state !== "loading") return false;
    const lab = Game.getObjectById(labId);
    if (!lab || !prepared(r, lab)) return false; // not ready: keep working, never wait
    if (!creep.pos.isNearTo(lab)) { creep.moveTo(lab, { range: 1, reusePath: 10 }); return true; }
    const k = constants.current();
    const receipt = confirmation.capture(creep.body, r.compound, r.bodyPartsCount,
        { mineral: lab.store[r.compound] || 0, energy: lab.store[RESOURCE_ENERGY] || 0 }, k, true);
    if (receipt.status === "uncertain") { logistics.cancel(creep.room, labId, "receipt:" + receipt.reason); return false; }
    const status = lab.boostCreep(creep, r.bodyPartsCount);
    if (status !== OK) { logistics.cancel(creep.room, labId, "boost-intent:" + status); return false; }
    r.receipt = receipt;
    r.appliedTick = Game.time;
    r.state = "applying";
    return true;
}

function confirm(room) {
    for (const [labId, r] of ownRecords(room)) {
        if (r.state !== "applying" || !(r.appliedTick < Game.time)) continue;
        const creep = Game.getObjectById(r.ownerCreepId) || Game.creeps[r.ownerCreepName];
        const lab = Game.getObjectById(labId);
        if (!creep || !lab) {
            r.confirmation = "uncertain"; r.state = "loading"; delete r.receipt;
            logistics.cancel(room, labId, "applied-owner-or-lab-missing");
            continue;
        }
        const result = confirmation.reconcile(r.receipt, creep.body,
            { mineral: lab.store[r.compound] || 0, energy: lab.store[RESOURCE_ENERGY] || 0 }, constants.current());
        r.confirmation = result.status;
        r.partsConfirmed = result.partsConfirmed || 0;
        r.consumed = result.consumed || null;
        delete r.receipt;
        r.state = "loading"; // back to an active state so cancel() can move it to draining
        logistics.cancel(room, labId, result.status === "confirmed" ? "applied" : "applied-" + result.status);
        readinessContext.release(room.name, "boost:" + (r.ownerCreepName || ""));
        console.log("[boost] " + room.name + ": " + r.ownerCreepName + " " + result.status + " (" + r.partsConfirmed + " partes" +
            (result.reason ? ", " + result.reason : "") + ")");
        const mem = Memory.rooms[room.name];
        mem.boostApplied = { tick: Game.time, creep: r.ownerCreepName, compound: r.compound, parts: r.partsConfirmed, status: result.status };
    }
}

function tick(room) {
    if (config.get("boost.enabled", true) === false || !logistics.enabled(room)) return;
    confirm(room);
    const every = Number(config.get("boost.planInterval", 50));
    if (lastPlan[room.name] !== undefined && Game.time - lastPlan[room.name] < every && Game.time >= lastPlan[room.name]) return;
    lastPlan[room.name] = Game.time;
    plan(room);
}

function status(roomName) {
    return last[roomName] || null;
}

module.exports = { tick, plan, claim, confirm, status };
