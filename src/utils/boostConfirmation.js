"use strict";
const parts = require("./boostParts");
const validBody = (body) => Array.isArray(body) && body.length <= 50 && body.every((p) =>
    p && typeof p.type === "string" && Number.isFinite(p.hits) && p.hits >= 0);
const unknown = (reason) => ({ status: "uncertain", reason, partsConfirmed: null, consumed: null, allowReapply: false });
// A bounded recovery receipt, not a journal. The caller must own lab + creep intent.
function capture(body, compound, count, stores, constants, exclusive) {
    if (exclusive !== true) return unknown("missing-exclusive-custody");
    const selection = parts.select(body, compound, count, stores, constants);
    if (selection.status !== "ready" || !selection.pilotSafe) return unknown(selection.reason || "unsafe-prefix");
    return { version: 1, compound, bodyPartsCount: selection.bodyPartsCount,
        beforeBody: body.map((p) => ({ type: p.type, hits: p.hits, boost: p.boost || null })),
        beforeMineral: stores.mineral, beforeEnergy: stores.energy,
        mineralPerPart: constants.mineralPerPart, energyPerPart: constants.energyPerPart,
        predictedSelectedIndexes: selection.selectedIndexes };
}
function reconcile(receipt, body, stores, constants) {
    if (!receipt || receipt.version !== 1 || !validBody(receipt.beforeBody) || !validBody(body) ||
        body.length !== receipt.beforeBody.length || !constants) return unknown("invalid-receipt-body");
    if (constants.mineralPerPart !== receipt.mineralPerPart || constants.energyPerPart !== receipt.energyPerPart)
        return unknown("mechanics-changed");
    const expected = parts.select(receipt.beforeBody, receipt.compound, receipt.bodyPartsCount,
        { mineral: receipt.beforeMineral, energy: receipt.beforeEnergy }, constants);
    if (expected.status !== "ready" || !expected.pilotSafe || !Array.isArray(receipt.predictedSelectedIndexes) ||
        expected.selectedIndexes.join() !== receipt.predictedSelectedIndexes.join()) return unknown("invalid-receipt-selection");
    const changed = [];
    for (let i = 0; i < body.length; i++) {
        const before = receipt.beforeBody[i], after = body[i];
        if (before.type !== after.type) return unknown("body-shape-changed");
        if ((before.boost || null) === (after.boost || null)) continue;
        if (before.boost || after.boost !== receipt.compound) return unknown("external-body-mutation");
        changed.push(i);
    }
    const set = new Set(changed), prefix = expected.selectedIndexes.slice(0, changed.length);
    if (changed.length > expected.selectedIndexes.length || prefix.some((i) => !set.has(i))) return unknown("non-prefix-body-mutation");
    if (!stores || !Number.isFinite(stores.mineral) || stores.mineral < 0 || !Number.isFinite(stores.energy) || stores.energy < 0)
        return unknown("missing-final-stock");
    const mineral = receipt.beforeMineral - stores.mineral, energy = receipt.beforeEnergy - stores.energy;
    if (mineral !== changed.length * receipt.mineralPerPart || energy !== changed.length * receipt.energyPerPart)
        return unknown("unattributed-stock-change");
    return { status: changed.length ? "confirmed" : "not-applied", reason: null, allowReapply: false,
        partsConfirmed: changed.length, livePartsConfirmed: changed.filter((i) => body[i].hits > 0).length,
        confirmedIndexes: prefix, consumed: { mineral, energy },
        partial: changed.length > 0 && changed.length < expected.selectedIndexes.length,
        remainingCount: expected.selectedIndexes.length - changed.length };
}
module.exports = { capture, reconcile };
