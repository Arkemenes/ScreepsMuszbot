// Which lab reaction / factory commodity a room is set up to produce, and
// the console surface to decide it (ROADMAP 0051). Same charter as
// remotes.js/raiding.js/pioneering.js (constitution §6): this is the only
// place that decides "what", structures/lab.js|factory.js|powerSpawn.js and
// roles/hauler.js only ever execute. REACTIONS/COMMODITIES are genuine
// Screeps-provided global constants - never duplicated into this file,
// only consulted live.

const roomCache = require("../utils/roomCache");
const config = require("../utils/config");
const labReservations = require("../utils/labReservations");
const boostParts = require("../utils/boostParts");
const boostConstants = require("../utils/boostConstants");
const boostPolicy = require("../utils/boostPolicy");

// On-demand forecast only: no intent, movement, economic approval or reservation.
global.boostPreview = function (creepName, compoundType, count) {
    const creep = Game.creeps[creepName];
    if (!creep) return { status: "unknown", reason: "missing-creep" };
    const constants = boostConstants.current();
    return {
        kind: "forecast", creepName, compound: compoundType,
        requested: boostParts.select(creep.body, compoundType, count, null, constants),
        labs: roomCache.structuresByType(creep.room, STRUCTURE_LAB).map((lab) => ({
            id: lab.id, range: creep.pos.getRangeTo(lab), active: !lab.isActive || lab.isActive(),
            reserved: labReservations.blocked(creep.room.name, lab.id),
            compatibleMineral: !lab.mineralType || lab.mineralType === compoundType,
            available: boostParts.select(creep.body, compoundType, count, {
                mineral: lab.store[compoundType] || 0, energy: lab.store[RESOURCE_ENERGY] || 0,
            }, constants),
        })),
    };
};

global.boostEvaluate = function (creepName, compound, context) {
    const creep = Game.creeps[creepName];
    if (!creep) return { status: "unknown", reason: "missing-creep", worth: false };
    // 0157-A: without a hand-written delivery context, judge with the room's live one
    const delivery = context && context.delivery ||
        require("../utils/readinessContext").delivery(creep.room, "boost:" + creepName, creep.ticksToLive || 0);
    return boostPolicy.worth(creep.memory.role, compound, { ...context, delivery,
        constants: boostConstants.current(), body: creep.body, ttl: creep.ticksToLive, nowTick: Game.time,
        minReturnRatio: config.get("boost.minReturnRatio", 0.20), continueReturnRatio: config.get("boost.continueReturnRatio", 0.10) });
};

global.boostPrepare = function (creepName, labId, context) {
    const creep = Game.creeps[creepName];
    if (!creep) return { status: "unknown", reason: "missing-creep" };
    return require("../utils/boostLogistics").reserve(creep, Game.getObjectById(labId), "XLH2O", context);
};

global.boostCancel = function (roomName, labId) {
    const room = Game.rooms[roomName];
    return !!room && require("../utils/boostLogistics").cancel(room, labId, "manual-cancel");
};

global.boostStatus = function (roomName) {
    const rooms = roomName ? [Game.rooms[roomName]].filter(Boolean) : Game.myRooms || [];
    return rooms.map((room) => ({ room: room.name, reservations: require("../utils/boostLogistics").status(room) }));
};

// --- console: setLabReaction / cancelLabReaction ------------------------
//   setLabReaction("W1N1", "H", "O")   -> produce OH, picks 3 labs itself
//   cancelLabReaction("W1N1")          -> stop
global.setLabReaction = function (roomName, mineral1, mineral2) {
    const room = Game.rooms[roomName];
    if (!room) {
        console.log(`[refining] sem visão de ${roomName} agora`);
        return;
    }

    const product = REACTIONS[mineral1] && REACTIONS[mineral1][mineral2];
    if (!product) {
        console.log(`[refining] ${mineral1}+${mineral2} não é uma reação válida`);
        return;
    }

    const labs = roomCache.structuresByType(room, STRUCTURE_LAB);
    if (labs.length < 3) {
        console.log(
            `[refining] ${roomName} tem só ${labs.length} lab(s) - precisa de pelo menos 3`
        );
        return;
    }

    // Any lab within range 2 of two others - runReaction()'s real
    // requirement (the output lab must be within range 2 of both inputs).
    let picked = null;
    const usable = labs.filter((l) => !labReservations.blocked(roomName, l.id) && (!l.isActive || l.isActive()));
    for (const input1 of usable) for (const input2 of usable) {
        if (input1.id === input2.id) continue;
        const outputs = usable.filter((l) => l.id !== input1.id && l.id !== input2.id &&
            l.pos.getRangeTo(input1) <= 2 && l.pos.getRangeTo(input2) <= 2);
        if (outputs.length && (!picked || outputs.length > picked.outputs.length))
            picked = { output: outputs[0], outputs, input1, input2 };
    }
    if (!picked) {
        console.log(
            `[refining] ${roomName} não tem 3 labs próximos o bastante (alcance 2) pra rodar reação`
        );
        return;
    }

    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    delete Memory.rooms[roomName].labReactions;
    delete Memory.rooms[roomName].labReactionAuto;
    delete Memory.rooms[roomName].labPolicyInputs;
    delete Memory.rooms[roomName].labPolicyHold;
    delete Memory.rooms[roomName].labPolicyDesired;
    if (Memory.rooms[roomName].labLoadAuto) {
        delete Memory.rooms[roomName].labLoad; delete Memory.rooms[roomName].labLoadAuto;
    }
    Memory.rooms[roomName].labReaction = {
        a: mineral1,
        b: mineral2,
        product,
        output: picked.output.id,
        outputs: (config.get("craft.wideLabs", true) ? picked.outputs : [picked.output]).map((l) => l.id),
        input1: picked.input1.id,
        input2: picked.input2.id,
    };
    console.log(`[refining] ${roomName} vai produzir ${product} (${mineral1}+${mineral2})`);
};

global.cancelLabReaction = function (roomName) {
    if (!Memory.rooms[roomName] || !Memory.rooms[roomName].labReaction) {
        console.log(`[refining] ${roomName} não tem reação ativa`);
        return;
    }
    delete Memory.rooms[roomName].labReaction;
    console.log(`[refining] reação de ${roomName} cancelada`);
};

// --- console: boostCreep --------------------------------------------------
// Always manual - deciding which creep is worth the compound is a
// strategic call, same philosophy as contestRoom() (ROADMAP 0046).
//   boostCreep("Wren the Excavator...", "UH")
global.boostCreep = function (creepName, compoundType, count) {
    if (count !== undefined && (!Number.isInteger(count) || count <= 0)) {
        console.log("[refining] bodyPartsCount precisa ser inteiro positivo");
        return;
    }
    const creep = Game.creeps[creepName];
    if (!creep) {
        console.log(`[refining] creep ${creepName} não existe`);
        return;
    }
    const labs = roomCache.structuresByType(creep.room, STRUCTURE_LAB);
    const lab = labs.find(
        (l) =>
            l.mineralType === compoundType &&
            !(typeof labReservations.entry(creep.room.name, l.id) === "object" && labReservations.blocked(creep.room.name, l.id)) &&
            creep.pos.getRangeTo(l) <= 1
    );
    if (!lab) {
        console.log(`[refining] nenhuma lab com ${compoundType} a alcance de ${creepName}`);
        return;
    }
    const result = count === undefined ? lab.boostCreep(creep) : lab.boostCreep(creep, count);
    console.log(`[refining] boostCreep(${creepName}, ${compoundType}) -> ${result}`);
};

// --- console: setFactoryProduct / cancelFactoryProduct -------------------
//   setFactoryProduct("W1N1", "wire")
//   cancelFactoryProduct("W1N1")
global.setFactoryProduct = function (roomName, resourceType) {
    const recipe = COMMODITIES[resourceType];
    if (!recipe) {
        console.log(`[refining] ${resourceType} não é uma commodity válida`);
        return;
    }
    if (recipe.level && recipe.level > 0) {
        console.log(
            `[refining] ${resourceType} é nível ${recipe.level} - precisa de Operate Factory ` +
                "(Power Creep/GPL), fora do escopo atual"
        );
        return;
    }

    const room = Game.rooms[roomName];
    const factory = room && roomCache.structuresByType(room, STRUCTURE_FACTORY)[0];
    if (!factory) {
        console.log(`[refining] ${roomName} não tem factory (ou sem visão agora)`);
        return;
    }

    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    Memory.rooms[roomName].factoryProduct = resourceType;
    console.log(`[refining] ${roomName} vai produzir ${resourceType}`);
};

global.cancelFactoryProduct = function (roomName) {
    if (!Memory.rooms[roomName] || !Memory.rooms[roomName].factoryProduct) {
        console.log(`[refining] ${roomName} não tem produção ativa`);
        return;
    }
    delete Memory.rooms[roomName].factoryProduct;
    console.log(`[refining] produção de ${roomName} cancelada`);
};
