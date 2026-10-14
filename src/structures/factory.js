// Produces whatever rooms/refining.js's setFactoryProduct() configured, once
// every component is actually stocked (ROADMAP 0051 Fase 3). COMMODITIES is
// never hardcoded here - genuine Screeps-provided global constant, read
// live. Stocking the factory (and draining the finished batch) is
// roles/hauler.js's job (pickMineralJob(), non-energy) plus its
// optionalConsumer() for the energy component.

const factory = {
    run(structure) {
        const mem = Memory.rooms[structure.room.name];
        const product = mem && mem.factoryProduct;
        if (!product) return;
        if (structure.cooldown > 0) return;

        const recipe = COMMODITIES[product];
        if (!recipe) return;
        if (!require("../utils/craftLedger").canProduce(structure, product, recipe.amount)) return;

        for (const resourceType in recipe.components) {
            const need = recipe.components[resourceType];
            if ((structure.store[resourceType] || 0) < need) return;
        }

        const status = structure.produce(product);
        if (status === OK) require("../utils/craftLedger").production(structure, product, recipe.amount);
    },
};

module.exports = factory;
