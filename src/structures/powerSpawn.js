// Processes Power whenever any sits in the store (ROADMAP 0051 Fase 4) -
// always beneficial when it happens, same "no strategy needed" reasoning as
// main.js's pixel-generation guard (ROADMAP 0045). Getting Power in the
// first place (power bank raid, or a market buy) is out of scope - see
// ROADMAP "Later". Energy for processPower() comes from
// roles/hauler.js's optionalConsumer(); the Power resource itself from
// pickMineralJob() (also hauler.js) - this module only ever executes.

const config = require("../utils/config");

const powerSpawn = {
    run(structure) {
        if (!config.get("powerSpawn.enabled", true)) return;
        if ((structure.store[RESOURCE_POWER] || 0) < 1) return;
        // ROADMAP 0150 T1: only while the GPL it buys pays back within power.maxPaybackDays
        if (!require("../utils/powerEconomics").allows(structure.room)) return;

        structure.processPower();
    },
};

module.exports = powerSpawn;
