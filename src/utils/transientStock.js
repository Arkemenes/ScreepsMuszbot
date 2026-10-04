// ROADMAP 0111: lab and factory are transitory - they only hold what an
// active chain/reaction is about to consume, never a standing stock. This is
// the single place that says how much of each resource a lab/factory may
// hold; roles/hauler.js only consults it (what to deliver, what to drain).
// Power spawn is deliberately not capped (it needs continuous energy).
const config = require("./config");
const labReactions = require("./labReactions");

function roomNameOf(structure) {
    return (structure.room && structure.room.name) || (structure.pos && structure.pos.roomName);
}

function roomMemory(structure) {
    const name = roomNameOf(structure);
    return (Memory.rooms && Memory.rooms[name]) || {};
}

function isTransient(structure) {
    return structure.structureType === STRUCTURE_LAB || structure.structureType === STRUCTURE_FACTORY;
}

function factoryRecipe(structure) {
    const product = roomMemory(structure).factoryProduct;
    return product && typeof COMMODITIES !== "undefined" ? COMMODITIES[product] : null;
}

// Energy a transient structure may hold right now; null = not capped.
// Factory: the energy of the active product's batches (manual pin = one
// batch, craft chain = pending batches via factoryEnergy). Lab: a reaction
// burns no energy, so 0 unless craft.labEnergyTarget opts into manual boosts.
function energyTarget(structure) {
    if (structure.structureType === STRUCTURE_LAB) return config.get("craft.labEnergyTarget", 0);
    if (structure.structureType !== STRUCTURE_FACTORY) return null;
    const mem = roomMemory(structure);
    const recipe = factoryRecipe(structure);
    const pinned = recipe && recipe.components ? recipe.components[RESOURCE_ENERGY] || 0 : 0;
    return Math.max(pinned, typeof mem.factoryEnergy === "number" ? mem.factoryEnergy : 0);
}

function free(structure) {
    return structure.store && typeof structure.store.getFreeCapacity === "function"
        ? structure.store.getFreeCapacity(RESOURCE_ENERGY) || 0
        : 0;
}

// How much energy the structure can still usefully take.
function energyNeed(structure) {
    const target = energyTarget(structure);
    if (target === null) return free(structure);
    const held = (structure.store && structure.store[RESOURCE_ENERGY]) || 0;
    return Math.max(0, Math.min(target - held, free(structure)));
}

// Minerals a lab may keep: the manual reaction's reagents/product.
function allowedMineral(structure, resourceType) {
    const mem = roomMemory(structure);
    if (structure.structureType === STRUCTURE_LAB) {
        const labs = mem.labLoad && mem.labLoad[structure.id];
        if (labs && labs.indexOf(resourceType) >= 0) return true;
        // ROADMAP 0115: every running reaction counts; a lab belongs to at most one of them
        return labReactions.list(roomNameOf(structure)).some((reaction) => {
            if (labReactions.outputsOf(reaction).indexOf(structure.id) >= 0) return resourceType === reaction.product;
            if (structure.id === reaction.input1) return resourceType === reaction.a;
            if (structure.id === reaction.input2) return resourceType === reaction.b;
            return false;
        });
    }
    const recipe = factoryRecipe(structure);
    const loaded = mem.factoryLoad || [];
    return !!(recipe && recipe.components && recipe.components[resourceType]) || loaded.indexOf(resourceType) >= 0;
}

// What to hand back to storage: [{resourceType}] - energy above the target
// (plus slack) and any mineral nothing is going to use. The finished product
// of the pinned factory product is drained by hauler.js's factoryOutputJob.
function excess(structure) {
    if (!isTransient(structure) || !structure.store) return [];
    const out = [];
    const slack = config.get("craft.energyDrainSlack", 500);
    const target = energyTarget(structure);
    const held = structure.store[RESOURCE_ENERGY] || 0;
    if (held > 0 && (target === 0 || held > target + slack)) out.push({ resourceType: RESOURCE_ENERGY });
    if (structure.structureType === STRUCTURE_LAB && !config.get("craft.drainIdleLabs", true)) return out;
    Object.keys(structure.store).forEach((resourceType) => {
        if (resourceType === RESOURCE_ENERGY || !(structure.store[resourceType] > 0)) return;
        if (structure.structureType === STRUCTURE_FACTORY && resourceType === roomMemory(structure).factoryProduct) return;
        if (!allowedMineral(structure, resourceType)) out.push({ resourceType });
    });
    return out;
}

module.exports = { isTransient, energyTarget, energyNeed, excess };
