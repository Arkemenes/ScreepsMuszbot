"use strict";
module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils", name));
    const globals = ["Game", "Memory", "BOOSTS", "LAB_BOOST_MINERAL", "LAB_BOOST_ENERGY"];
    const saved = globals.map((key) => [key, Object.prototype.hasOwnProperty.call(global, key), global[key]]);
    const claims = load("terminalClaims"), stocks = load("resourcePolicy"), transient = load("transientStock"), adapter = load("labReservations");
    const hauler = require(path.join(project, "src/roles/hauler"));
    const modulePath = require.resolve(path.join(project, "src/utils/boostLogistics")), cached = require.cache[modulePath];
    let logistics = load("boostLogistics"), scans = 0, nativeBoosts = 0, pending = [];
    const objects = {};
    const store = (values, cap = 1000000) => {
        const s = { ...values };
        Object.defineProperties(s, {
            getUsedCapacity: { value: (r) => r ? s[r] || 0 : Object.values(s).reduce((a, b) => a + b, 0) },
            getFreeCapacity: { value: (r) => cap - s.getUsedCapacity(r) }, getCapacity: { value: () => cap },
        }); return s;
    };
    try {
        global.BOOSTS = { [WORK]: { XLH2O: { build: 2, repair: 2 } } };
        global.LAB_BOOST_MINERAL = 30; global.LAB_BOOST_ENERGY = 20;
        const room = { name: "BoostPreparation", controller: { level: 8, my: true }, find: () => { throw Error("unexpected room.find"); } };
        global.Memory = { settings: { boost: { enabled: true, room: room.name, energyReserve: 100 }, craft: { drainIdleLabs: false }, stockPolicy: { enabled: false } }, rooms: { [room.name]: {} } };
        const mem = Memory.rooms[room.name];
        const worker = { id: "boost-worker", name: "BoostWorker", room, memory: { role: "builder" },
            ticksToLive: 1000, body: Array.from({ length: 14 }, () => ({ type: WORK, hits: 100 })), store: store({ energy: 100 }) };
        const haulerCreep = { id: "boost-hauler", name: "BoostHauler", room, memory: { role: "hauler" }, store: store({}, 200),
            pos: { inRangeTo: () => true }, moveTo: () => {} };
        const creeps = { [worker.name]: worker, [haulerCreep.name]: haulerCreep };
        global.Game = { time: 9814900, rooms: { [room.name]: room },
            creeps: new Proxy(creeps, { ownKeys(target) { scans++; return Reflect.ownKeys(target); } }),
            getObjectById: (id) => objects[id] || null, market: { orders: {} } };
        for (const c of [worker, haulerCreep]) objects[c.id] = c;
        room.storage = objects.store = { id: "store", room, structureType: STRUCTURE_STORAGE, store: store({ XLH2O: 300, energy: 1000 }) };
        room.terminal = objects.terminal = { id: "terminal", room, structureType: STRUCTURE_TERMINAL, store: store({ XLH2O: 300, energy: 5000 }) };
        const lab = objects.lab = { id: "lab", room, my: true, structureType: STRUCTURE_LAB, mineralType: null,
            pos: { roomName: room.name }, store: store({}), isActive: () => true, boostCreep: () => { nativeBoosts++; return OK; } };
        const context = () => ({ evidence: { observedTick: Game.time, kind: "bounded", demandAssigned: true },
            costs: { energyUnitValue: 1, logisticsEnergy: 0, logisticsCredits: 0, labOpportunityCredits: 0 },
            compoundOpportunity: { observedTick: Game.time, validUntilTick: Game.time + 1, executable: true, quantity: 420, netUnitValue: 0.01 },
            delivery: { observedTick: Game.time, regimeId: "preparation-test", localFree: 100000, supply: [], quality: "bounded", coverageFraction: 1, coveredHorizonTicks: 1000 },
            delayTicks: 10, actions: [{ action: "build", demand: 10000, duty: 1, energyPerActionTick: 70, valuePerEffect: 1, mode: "fixed" }] });
        haulerCreep.withdraw = (source, resource, amount) => { pending.push(() => {
            source.store[resource] -= amount; haulerCreep.store[resource] = (haulerCreep.store[resource] || 0) + amount;
        }); return OK; };
        haulerCreep.transfer = (target, resource, amount) => { pending.push(() => {
            haulerCreep.store[resource] -= amount; target.store[resource] = (target.store[resource] || 0) + amount;
            if (target === lab && resource !== RESOURCE_ENERGY) lab.mineralType = resource;
        }); return OK; };
        const advance = (apply = true) => { if (apply) for (const intent of pending) intent(); pending = []; Game.time++; logistics.tickRoom(room); };
        const job = (picked) => { haulerCreep.memory.mineralJob = { ...picked, fromId: picked.from.id, toId: picked.to.id, loaded: false }; delete haulerCreep.memory.mineralJob.from; delete haulerCreep.memory.mineralJob.to; };
        const reserve = () => logistics.reserve(worker, lab, "XLH2O", context());

        Memory.settings.boost.enabled = false;
        let before = JSON.stringify(Memory);
        assert(reserve().reason === "disabled" && logistics.feedJob(room) === null && JSON.stringify(Memory) === before,
            "0149 preparation: disabled path is inert and creates no persistent state");
        Memory.settings.boost.enabled = true;
        Game.market.orders.listing = { roomName: room.name, type: ORDER_SELL, resourceType: "XLH2O", remainingAmount: 200 };
        before = JSON.stringify(mem);
        assert(reserve().reason === "insufficient-unclaimed-stock:XLH2O" && JSON.stringify(mem) === before,
            "0149 canonical bundle: listed stock blocks atomic admission without a partial lab or energy reservation");
        delete Game.market.orders.listing;
        room.storage.store.energy = 379;
        assert(reserve().reason === "insufficient-unclaimed-stock:energy" && JSON.stringify(mem) === before,
            "0149 canonical bundle: energy failure leaves the compound and lab unreserved; terminal energy is excluded");
        room.storage.store.energy = 1000;
        mem.labPolicyHold = { lab: "XLH2O" };
        assert(reserve().reason === "lab-not-free", "0149 preparation: never takes a manually pinned lab");
        delete mem.labPolicyHold;
        let admitted = reserve(), record = mem.labBoostReservations.lab;
        assert(admitted.status === "reserved" && record.funding.length === 3 && !record.pending,
            "0149 canonical bundle: lab, own compound split across sources and application energy are reserved together");
        assert(record.funding.reduce((sum, f) => sum + (f.resource === "XLH2O" ? f.remaining : 0), 0) === 420 &&
            record.requiredEnergy === 280 && record.partsRequested === 14, "0149 canonical bundle: exact costs and real part count populate the canonical record");
        assert(claims.physicalFree(room, room.storage, "XLH2O") === 0 && claims.physicalFree(room, room.terminal, "XLH2O") === 180 &&
            claims.physicalPool(room, "XLH2O") === 180 && stocks.available(room, "XLH2O") === 180,
            "0149 canonical bundle: physical consumers and market availability agree without double subtracting lab funding");
        const original = JSON.stringify(record);
        admitted = reserve();
        assert(admitted.reused && JSON.stringify(record) === original, "0149 canonical bundle: repeat admission is idempotent without extending deadline");
        const second = { ...worker, id: "other", name: "OtherBuilder" }; creeps[second.name] = second;
        assert(logistics.reserve(second, lab, "XLH2O", context()).reason === "room-already-preparing", "0149 canonical bundle: another builder cannot claim the pilot lab or resources");
        delete creeps[second.name];
        const intentsBefore = pending.length;
        haulerCreep.memory.mineralJob = { kind: "factoryComponent", resourceType: "XLH2O", fromId: room.storage.id, toId: "another-factory" };
        hauler.runMineralJobNow(haulerCreep);
        assert(pending.length === intentsBefore && !haulerCreep.memory.mineralJob,
            "0149 canonical bundle: another consumer cannot take boost funding even when stockPolicy is disabled");
        pending.length = intentsBefore; delete haulerCreep.memory.mineralJob;
        room.storage.store.XLH2O += 300;
        haulerCreep.memory.mineralJob = { kind: "factoryComponent", resourceType: "XLH2O", fromId: room.storage.id, toId: "another-factory" };
        hauler.runMineralJobNow(haulerCreep);
        assert(claims.physicalFree(room, room.storage, "XLH2O") === 100,
            "0149 canonical bundle: allowed competing withdrawal shares the same-tick ledger with stockPolicy off");
        pending.length = intentsBefore; delete haulerCreep.memory.mineralJob;
        room.storage.store.XLH2O -= 300; Game.time++; logistics.tickRoom(room);
        const scansBefore = scans;
        const picked = logistics.feedJob(room); job(picked);
        const more = logistics.feedJob(room);
        assert(!more || more.resourceType !== picked.resourceType, "0149 missing delivery: assigned resource trip is deduplicated before any withdrawal");
        assert(scans - scansBefore <= 1, "0149 preparation: all haulers share one census pass in the tick");
        hauler.runMineralJobNow(haulerCreep);
        assert(haulerCreep.store.XLH2O === undefined && record.pending && record.shipments[haulerCreep.id].state === "withdraw",
            "0149 transport confirmation: accepted withdrawal is pending, never immediate cargo");
        assert(stocks.available(room, "XLH2O") === 180 && claims.physicalFree(room, room.storage, "XLH2O") === 0,
            "0149 canonical bundle: accepted withdrawal moves source funding once and remains protected until engine settlement");
        advance();
        assert(haulerCreep.store.XLH2O === 200 && record.shipments[haulerCreep.id].state === "cargo" && !record.pending && stocks.available(room, "XLH2O") === 180,
            "0149 transport confirmation: next tick confirms cargo without counting the same shipment in warehouse stock");
        hauler.runMineralJobNow(haulerCreep);
        assert(record.pending && !lab.store.XLH2O, "0149 transport confirmation: accepted transfer keeps custody until the next tick");
        advance();
        assert(lab.store.XLH2O === 200 && !Object.keys(record.shipments).length && !record.pending, "0149 transport confirmation: receipt is confirmed by both lab and cargo changes");
        hauler.runMineralJobNow(haulerCreep);
        let trips = 1;
        for (let step = 0; step < 10; step++) {
            const next = logistics.feedJob(room);
            if (!next) break;
            job(next); hauler.runMineralJobNow(haulerCreep); advance();
            hauler.runMineralJobNow(haulerCreep); advance();
            hauler.runMineralJobNow(haulerCreep); trips++;
        }
        assert(trips === 5 && lab.store.XLH2O === 420 && lab.store.energy === 280 &&
            !record.funding.some((f) => f.remaining > 0) && transient.excess(lab).length === 0,
            "0149 missing delivery: existing hauler path supplies exact compound and energy targets, retaining both");
        assert(nativeBoosts === 0 && worker.body.every((p) => !p.boost), "0149 preparation: filled lab never implies automatic application or blocks the builder role");
        const statusMemory = JSON.stringify(Memory), report = logistics.status(room)[0];
        assert(report.stockPrepared && !report.automaticApplication && report.held.mineral === 420 && report.missing.energy === 0 && report.partsConfirmed === 0,
            "0149 preparation status: ready stock and zero applied parts remain distinct");
        assert(JSON.stringify(Memory) === statusMemory, "0149 preparation status: inspection never rewrites ownership or advances the lifecycle");
        logistics.cancel(room, lab.id, "test-cancel");
        const deadline = record.drainDeadlineTick; logistics.cancel(room, lab.id, "again");
        assert(record.state === "draining" && record.drainDeadlineTick === deadline && transient.excess(lab).some((e) => e.resourceType === "XLH2O"),
            "0149 reservation lifecycle: cancellation is idempotent and cleanup works with idle draining disabled");
        Game.time = deadline; logistics.tickRoom(room);
        assert(record.state === "quarantined" && adapter.blocked(room.name, lab.id), "0149 reservation lifecycle: missing cleanup transport cannot return a dirty lab to production");
        lab.store.XLH2O = 0; lab.store.energy = 0; lab.mineralType = null;
        Game.time = record.nextWakeTick; logistics.tickRoom(room);
        assert(record.state === "released" && !adapter.blocked(room.name, lab.id), "0149 reservation lifecycle: quarantined lab returns only after safe disposal");

        room.storage.store.XLH2O = 1000; room.storage.store.energy = 1000;
        reserve(); record = mem.labBoostReservations.lab;
        assert(record.generation === 2, "0149 reservation lifecycle: a new request increments generation rather than reusing a stale owner");
        const ownerJob = logistics.feedJob(room); job(ownerJob); hauler.runMineralJobNow(haulerCreep);
        const freeBeforeOff = stocks.available(room, "XLH2O");
        Memory.settings.boost.enabled = false; logistics.tickRoom(room);
        assert(record.pending && record.state === "draining" && stocks.available(room, "XLH2O") >= freeBeforeOff &&
            stocks.available(room, "XLH2O") === room.storage.store.XLH2O + room.terminal.store.XLH2O - 200,
            "0149 reservation lifecycle: flag off releases unsubmitted funding but keeps the accepted withdrawal protected");
        advance();
        assert(record.state === "released", "0149 reservation lifecycle: empty lab may release after pending withdrawal is reconciled");
        hauler.runMineralJobNow(haulerCreep); advance();
        assert(lab.store.XLH2O === 0 && haulerCreep.store.XLH2O === 0, "0149 reservation lifecycle: stale loaded job returns to warehouse even after lab is released");
        hauler.runMineralJobNow(haulerCreep);
        Memory.settings.boost.enabled = true;
        reserve(); record = mem.labBoostReservations.lab;
        job(logistics.feedJob(room)); hauler.runMineralJobNow(haulerCreep); advance(false);
        assert(record.state === "released" && !record.pending, "0149 transport confirmation: unobserved accepted withdrawal cancels instead of fabricating cargo or retrying");
        delete haulerCreep.memory.mineralJob;
        reserve(); record = mem.labBoostReservations.lab;
        mem.labLoad = { lab: ["XLH2O"] }; logistics.tickRoom(room);
        assert(record.state === "transferToManual" && !record.funding.length && mem.labLoad.lab[0] === "XLH2O",
            "0149 manual takeover and quarantine: external pin takes custody without being removed");
        delete mem.labLoad;
        // Explicit operator disposal of the retained manual record for another isolated scenario.
        delete mem.labBoostReservations.lab;
        reserve(); record = mem.labBoostReservations.lab;
        delete require.cache[modulePath]; logistics = load("boostLogistics"); logistics.tickRoom(room);
        assert(record.state === "released" && !record.funding.length, "0149 reservation lifecycle: global reload cancels unsubmitted preparation and reconciles safely");
        require.cache[modulePath] = cached; logistics = cached.exports;
        reserve(); record = mem.labBoostReservations.lab;
        const collector = Object.create(Creep.prototype);
        collector.room = room; collector.store = store({}, 800); collector.pos = { isNearTo: () => true }; collector.popState = () => {};
        collector.withdraw = (source) => { pending.push(() => { source.store.energy -= 800; collector.store.energy = 800; }); return OK; };
        const storagePrototype = Object.getPrototypeOf(room.storage);
        Object.setPrototypeOf(room.storage, Structure.prototype);
        try { collector.runGetEnergy(room.storage.id); } finally { Object.setPrototypeOf(room.storage, storagePrototype); }
        assert(record.state === "draining" && record.endReason === "energy-preempted" && collector.store.energy === undefined,
            "0149 energy priority: normal worker collection preempts optional preparation without waiting for boost");
        advance();
        assert(collector.store.energy === 800 && record.state === "released", "0149 energy priority: existing state-machine withdrawal still completes with preparation cancelled");
        room.storage.store.energy = 1000;
        reserve(); record = mem.labBoostReservations.lab;
        delete creeps[worker.name]; delete objects[worker.id]; logistics.tickRoom(room);
        assert(record.state === "released" && record.endReason === "owner-or-lab-missing", "0149 reservation lifecycle: dead owner releases unsubmitted resources safely");
        creeps[worker.name] = worker; objects[worker.id] = worker;
        reserve(); record = mem.labBoostReservations.lab;
        Game.time = record.deadlineTick; logistics.tickRoom(room);
        assert(record.state === "released" && record.endReason === "deadline", "0149 reservation lifecycle: preparation deadline remains finite and preserves the closing reason");
    } finally {
        require.cache[modulePath] = cached;
        for (const [key, existed, value] of saved) { if (existed) global[key] = value; else delete global[key]; }
    }
};
