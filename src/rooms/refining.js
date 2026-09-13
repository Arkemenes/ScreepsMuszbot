// Which lab reaction / factory commodity a room is set up to produce, and
// the console surface to decide it (ROADMAP 0051). Same charter as
// remotes.js/raiding.js/pioneering.js (constitution §6): this is the only
// place that decides "what", structures/lab.js|factory.js|powerSpawn.js and
// roles/hauler.js only ever execute. REACTIONS/COMMODITIES are genuine
// Screeps-provided global constants - never duplicated into this file,
// only consulted live.

const roomCache = require("../utils/roomCache");

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
    for (const output of labs) {
        const near = labs.filter(
            (l) => l.id !== output.id && output.pos.getRangeTo(l) <= 2
        );
        if (near.length >= 2) {
            picked = { output, input1: near[0], input2: near[1] };
            break;
        }
    }
    if (!picked) {
        console.log(
            `[refining] ${roomName} não tem 3 labs próximos o bastante (alcance 2) pra rodar reação`
        );
        return;
    }

    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    Memory.rooms[roomName].labReaction = {
        a: mineral1,
        b: mineral2,
        product,
        output: picked.output.id,
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
global.boostCreep = function (creepName, compoundType) {
    const creep = Game.creeps[creepName];
    if (!creep) {
        console.log(`[refining] creep ${creepName} não existe`);
        return;
    }
    const labs = roomCache.structuresByType(creep.room, STRUCTURE_LAB);
    const lab = labs.find(
        (l) =>
            l.mineralType === compoundType &&
            creep.pos.getRangeTo(l) <= 1
    );
    if (!lab) {
        console.log(`[refining] nenhuma lab com ${compoundType} a alcance de ${creepName}`);
        return;
    }
    const result = lab.boostCreep(creep);
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
