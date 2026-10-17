"use strict";
// ROADMAP 0149: forecast the engine's prefix selection, never arbitrary indexes.
// Source: screeps/engine src/processor/intents/labs/boost-creep.js (see fixture notes).
function select(body, compound, count, stores, constants) {
    const fail = (reason, status = "unknown") => ({ status, reason, bodyPartsCount: 0, selectedIndexes: [], liveParts: 0,
        destroyedIndexes: [], requiredMineral: 0, requiredEnergy: 0, pilotSafe: false });
    if (!constants || !constants.boosts || !(constants.mineralPerPart > 0) || !Number.isFinite(constants.mineralPerPart) ||
        !(constants.energyPerPart > 0) || !Number.isFinite(constants.energyPerPart) || typeof constants.toughType !== "string") return fail("missing-constants");
    if (typeof compound !== "string" || !compound.length) return fail("invalid-compound");
    if (!Array.isArray(body) || body.length > 50 || body.some((p) => !p || typeof p.type !== "string" || !Number.isFinite(p.hits) || p.hits < 0)) return fail("invalid-body");
    if (count !== undefined && (!Number.isInteger(count) || count < 0)) return fail("invalid-count");
    if (count === 0) return fail("zero-count", "blocked");
    const eligible = [];
    for (let i = 0; i < body.length; i++) {
        const p = body[i];
        if (!p.boost && constants.boosts[p.type] && constants.boosts[p.type][compound]) eligible.push(i);
    }
    if (!eligible.length) return fail("no-eligible-parts", "blocked");
    if (body[eligible[0]].type !== constants.toughType) eligible.reverse();
    let requested = count === undefined ? eligible.length : Math.min(count, eligible.length);
    if (stores) {
        if (!Number.isFinite(stores.mineral) || stores.mineral < 0 || !Number.isFinite(stores.energy) || stores.energy < 0) return fail("unknown-stores");
        requested = Math.min(requested, Math.floor(stores.mineral / constants.mineralPerPart), Math.floor(stores.energy / constants.energyPerPart));
    }
    if (!requested) return fail("insufficient-lab-stock", "blocked");
    const selectedIndexes = eligible.slice(0, requested);
    const destroyedIndexes = selectedIndexes.filter((i) => !(body[i].hits > 0));
    return { status: stores ? "ready" : "planning", reason: null, bodyPartsCount: selectedIndexes.length, selectedIndexes,
        liveParts: selectedIndexes.length - destroyedIndexes.length, destroyedIndexes, pilotSafe: destroyedIndexes.length === 0,
        requiredMineral: selectedIndexes.length * constants.mineralPerPart, requiredEnergy: selectedIndexes.length * constants.energyPerPart };
}
module.exports = { select };
