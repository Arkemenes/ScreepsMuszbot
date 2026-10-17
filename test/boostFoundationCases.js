"use strict";
module.exports = function (project, assert) {
    const path = require("path");
    const load = (file) => require(path.join(project, "src", file));
    const selector = load("utils/boostParts");
    // Semantic cases from screeps/engine, processor/intents/labs/boost-creep.js,
    // master consulted 2026-10-16. Synthetic constants; not a pinned server replay.
    const constants = { boosts: { work: { XLH2O: { build: 2 } }, tough: { XGHO2: { damage: 0.3 } } },
        mineralPerPart: 30, energyPerPart: 20, toughType: "tough" };
    const body = [{ type: "work", hits: 100 }, { type: "move", hits: 100 },
        { type: "work", hits: 0 }, { type: "work", hits: 100, boost: "LH" }];
    const before = JSON.stringify(body);
    let result = selector.select(body, "XLH2O", 1, null, constants);
    assert(result.selectedIndexes.join() === "2" && !result.pilotSafe && result.liveParts === 0,
        "0149 engine part selection: reversed WORK prefix includes destroyed parts instead of skipping them");
    assert(result.requiredMineral === 30 && result.requiredEnergy === 20,
        "0149 engine part selection: destroyed selected parts still cost mineral and energy");
    result = selector.select(body, "XLH2O", undefined, null, constants);
    assert(result.selectedIndexes.join() === "2,0" && JSON.stringify(body) === before,
        "0149 engine part selection: ignores already boosted and incompatible parts without mutating body");
    result = selector.select([{ type: "tough", hits: 100 }, { type: "tough", hits: 0 }], "XGHO2", 1, null, constants);
    assert(result.selectedIndexes.join() === "0" && result.pilotSafe, "0149 engine part selection: TOUGH keeps forward order");
    result = selector.select(body, "XLH2O", 2, { mineral: 60, energy: 20 }, constants);
    assert(result.bodyPartsCount === 1 && result.selectedIndexes.join() === "2", "0149 engine part selection: stock permits only the same prefix, never arbitrary live indexes");
    assert(selector.select(body, "XLH2O", 0, null, constants).reason === "zero-count", "0149 engine part selection: zero never becomes an unlimited request");
    for (const count of [-1, 0.5, NaN, Infinity, "2"])
        assert(selector.select(body, "XLH2O", count, null, constants).status === "unknown", "0149 engine part selection: invalid count " + count);
    assert(selector.select(body, "XLH2O", 1, { mineral: 29, energy: 100 }, constants).status === "blocked", "0149 engine part selection: insufficient stock blocks forecast");
    assert(selector.select(body, "XLH2O", 1, { mineral: NaN, energy: 100 }, constants).status === "unknown", "0149 engine part selection: unknown stock is explicit");
    assert(selector.select(body, "XLH2O", 1, null, null).status === "unknown", "0149 engine part selection: missing engine constants never invent costs");
    result = selector.select(body, "XLH2O", 1, null, { ...constants, mineralPerPart: 7, energyPerPart: 3 });
    assert(result.requiredMineral === 7 && result.requiredEnergy === 3, "0149 engine part selection: reads supplied costs rather than hardcoded runtime values");

    const names = ["Game", "Memory", "BOOSTS", "LAB_BOOST_MINERAL", "LAB_BOOST_ENERGY", "boostPreview", "boostCreep"];
    const saved = names.map((name) => [name, Object.prototype.hasOwnProperty.call(global, name), global[name]]);
    const roomCache = load("utils/roomCache");
    const savedCache = roomCache.structuresByType;
    const adapter = load("utils/labReservations"), transient = load("utils/transientStock");
    const claims = load("utils/terminalClaims"), reactions = load("utils/labReactions");
    const hauler = load("roles/hauler"), runtime = load("utils/labPolicyRuntime");
    const store = (values) => {
        const obj = { ...values };
        Object.defineProperties(obj, {
            getFreeCapacity: { value: () => 2000 }, getCapacity: { value: () => 3000 },
            getUsedCapacity: { value: () => Object.values(obj).reduce((a, b) => a + b, 0) },
        });
        return obj;
    };
    const reservation = (state = "loading") => ({ version: 1, reservationId: "r1", ownerRequestId: "q1", generation: 1,
        compound: "XLH2O", state, requiredEnergy: 40, requiredMineral: 60 });
    try {
        global.Memory = { settings: { craft: { drainIdleLabs: false, labEnergyTarget: 0 }, stockPolicy: { enabled: false } }, rooms: { BoostFoundation: {} } };
        const mem = Memory.rooms.BoostFoundation, intents = [];
        const room = { name: "BoostFoundation", controller: { my: true, level: 8 }, find: () => [] };
        const objects = {};
        const slots = load("utils/labSlots");
        const labs = [1, 2, 3, 4].map((slot) => {
            const offset = slots.OFFSETS[slot];
            const lab = { id: "boost-lab-" + slot, room, my: true, structureType: STRUCTURE_LAB,
                pos: { x: 20 + offset[1], y: 20 + offset[0], roomName: room.name,
                    inRangeTo: () => true, getRangeTo: () => 1 },
                store: store({ XLH2O: 60, energy: 40 }), mineralType: "XLH2O", isActive: () => true,
                boostCreep: (...args) => { intents.push(args); return OK; },
                runReaction: () => { intents.push("reaction"); return OK; } };
            objects[lab.id] = lab;
            return lab;
        });
        const lab = labs[0];
        global.Game = { time: 9714900, creeps: {}, rooms: { [room.name]: room }, getObjectById: (id) => objects[id] || null };
        roomCache.structuresByType = () => labs;
        mem.labBoostReservations = { [lab.id]: reservation() };
        const serialized = JSON.stringify(mem);
        assert(adapter.blocked(room.name, lab.id) && adapter.ownedBy(room.name, lab.id, { kind: "boost", id: "q1" }), "0149 canonical reservations: owner resolved from the single room field");
        assert(transient.energyTarget(lab) === 40 && transient.energyNeed(lab) === 0 && transient.excess(lab).length === 0,
            "0149 canonical reservations: retains compound and application energy");
        lab.store.energy = 1500;
        assert(transient.excess(lab).length === 0, "0149 canonical reservations: active energy cannot be drained below its protected target");
        assert(claims.physicalFree(room, lab, "XLH2O") === 0 && claims.physicalFree(room, lab, "XLH2O", null, "boost:q1") === 60,
            "0149 canonical reservations: generic consumers cannot withdraw owner stock");
        assert(JSON.stringify(mem) === serialized, "0149 canonical reservations: readers never rewrite the canonical record");
        let resolved = runtime.resolve(room);
        assert(resolved && resolved.built.length === 3, "0149 all reservation readers: runtime model excludes the boost lab");
        mem.labBoostReservations[lab.id].state = "released";
        resolved = runtime.resolve(room);
        assert(resolved && resolved.built.length === 4 && claims.physicalFree(room, lab, "XLH2O") === 60,
            "0149 all reservation readers: release is visible within the same tick without stale geometry exclusion");
        mem.labBoostReservations[lab.id].pending = { tick: Game.time };
        assert(adapter.blocked(room.name, lab.id) && transient.excess(lab).length === 0,
            "0149 canonical reservations: unreconciled pending keeps a released record blocked");
        for (const external of [true, "manual", { version: 99 }, { version: 1, state: "released" }]) {
            mem.labBoostReservations[lab.id] = external;
            assert(adapter.blocked(room.name, lab.id) && transient.excess(lab).length === 0 && transient.energyNeed(lab) === 0,
                "0149 canonical reservations: legacy or malformed external entry stays protected " + JSON.stringify(external));
        }
        lab.store.energy = 0;
        mem.labBoostReservations[lab.id] = reservation("draining");
        assert(transient.excess(lab).some((e) => e.resourceType === "XLH2O"), "0149 forced cleanup off idle drain: owned residue can return without idle-lab draining");
        mem.labLoad = { [lab.id]: ["XLH2O"] };
        assert(transient.excess(lab).length === 0, "0149 manual takeover and quarantine: cleanup honors manual mineral holds");
        delete mem.labLoad;
        mem.labBoostReservations[lab.id].state = "quarantined";
        assert(adapter.blocked(room.name, lab.id) && transient.excess(lab).length === 1, "0149 manual takeover and quarantine: quarantine never returns lab to reaction pool");
        mem.labBoostReservations[lab.id].pending = true;
        assert(transient.excess(lab).length === 0, "0149 manual takeover and quarantine: pending blocks even quarantined residue drain");

        mem.labReaction = { a: "H", b: "O", product: "OH", input1: labs[0].id, input2: labs[1].id, output: labs[2].id };
        labs[0].mineralType = "H"; labs[0].store.H = 100;
        labs[1].mineralType = "O"; labs[1].store.O = 100;
        labs[2].mineralType = null;
        for (const blocked of labs.slice(0, 3)) {
            mem.labBoostReservations = { [blocked.id]: reservation() };
            reactions.execute(labs[2]);
        }
        assert(intents.length === 0, "0149 all reservation readers: no reaction consumes a reserved input or output");
        mem.labPolicyInputs = { [lab.id]: ["H", 500] };
        mem.labBoostReservations = { [lab.id]: reservation() };
        assert(reactions.deliveryLimit(room.name, lab, "H") === 0, "0149 all reservation readers: stale policy cannot refill reserved input");
        delete mem.labReaction;
        lab.mineralType = "XLH2O"; lab.store.energy = 40;
        const creep = { name: "BoostBuilder", room, body, pos: { getRangeTo: () => 1 }, store: store({}), memory: {} };
        Game.creeps[creep.name] = creep;
        global.BOOSTS = constants.boosts; global.LAB_BOOST_MINERAL = 30; global.LAB_BOOST_ENERGY = 20;
        load("rooms/refining");
        const memoryBefore = JSON.stringify(Memory);
        const preview = global.boostPreview(creep.name, "XLH2O", 2);
        assert(preview.kind === "forecast" && preview.requested.selectedIndexes.join() === "2,0" && preview.labs[0].reserved,
            "0149 preview: shows forecasted prefix and live lab reservation separately from readiness");
        assert(intents.length === 0 && JSON.stringify(Memory) === memoryBefore, "0149 preview: no spending, movement, native intent or persistent write");
        global.boostCreep(creep.name, "XLH2O", 0);
        global.boostCreep(creep.name, "XLH2O", 1);
        assert(intents.length === 1 && intents[0][1] === 1, "0149 manual helper: count zero is blocked and positive count reaches the native API, using another unreserved lab");
        intents.length = 0;
        for (const l of labs) mem.labBoostReservations[l.id] = reservation();
        global.boostCreep(creep.name, "XLH2O", 1);
        assert(intents.length === 0, "0149 manual helper: cannot consume an automatically owned reserved lab");

        room.storage = { id: "boost-store", room, structureType: STRUCTURE_STORAGE, store: store({}) };
        objects[room.storage.id] = room.storage;
        const transfers = [], withdrawals = [];
        creep.transfer = (to, r, n) => { transfers.push({ to, r, n }); return OK; };
        creep.withdraw = (from, r, n) => { withdrawals.push({ from, r, n }); return OK; };
        creep.store.XLH2O = 30;
        creep.memory.mineralJob = { kind: "labReagent", resourceType: "XLH2O", toId: lab.id, fromId: room.storage.id };
        hauler.runMineralJobNow(creep);
        assert(transfers.length === 1 && transfers[0].to === room.storage, "0149 all reservation readers: loaded stale delivery redirects to storage instead of reserved lab");
        creep.store.XLH2O = 0;
        creep.memory.mineralJob = { kind: "labOutput", resourceType: "XLH2O", fromId: lab.id, toId: room.storage.id };
        hauler.runMineralJobNow(creep);
        assert(withdrawals.length === 0 && !creep.memory.mineralJob, "0149 all reservation readers: stale output job cannot drain boost compound even with stock policy off");
        mem.labBoostReservations[lab.id] = reservation("draining");
        creep.memory.mineralJob = { kind: "transientDrain", resourceType: "XLH2O", fromId: lab.id, toId: room.storage.id };
        hauler.runMineralJobNow(creep);
        assert(withdrawals.length === 1 && withdrawals[0].n === 60, "0149 forced cleanup off idle drain: actual hauler withdraws own drainable residue");
        creep.memory.mineralJob = { kind: "transientDrain", resourceType: "XLH2O", fromId: lab.id, toId: room.storage.id };
        hauler.runMineralJobNow(creep);
        assert(withdrawals.length === 1, "0149 canonical reservations: same-tick cleanup withdrawals share the physical claims ledger");
        Game.time++;
        mem.labLoad = { [lab.id]: ["XLH2O"] };
        creep.memory.mineralJob = { kind: "transientDrain", resourceType: "XLH2O", fromId: lab.id, toId: room.storage.id };
        hauler.runMineralJobNow(creep);
        assert(withdrawals.length === 1, "0149 manual takeover and quarantine: stale cleanup job rechecks external holds before withdrawal");
    } finally {
        roomCache.structuresByType = savedCache;
        for (const [name, existed, value] of saved) { if (existed) global[name] = value; else delete global[name]; }
    }
};
