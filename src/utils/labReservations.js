"use strict";
// ROADMAP 0149: read the existing canonical field; never migrate or clean manual entries.
const ACTIVE = new Set(["reserved", "loading", "applying", "confirming"]);
const CLEANUP = new Set(["draining", "quarantined"]);
const noSourceClaims = Object.freeze({});
function all(roomName) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    return mem && mem.labBoostReservations || noSourceClaims;
}
function entry(roomName, labId) {
    return all(roomName)[labId];
}
function structured(value) {
    return !!(value && typeof value === "object" && value.version === 1 && typeof value.reservationId === "string" &&
        typeof value.ownerRequestId === "string" && Number.isInteger(value.generation) && value.generation > 0 &&
        typeof value.compound === "string" && value.compound.length &&
        (ACTIVE.has(value.state) || CLEANUP.has(value.state) || value.state === "released" || value.state === "transferToManual") &&
        Number.isFinite(value.requiredEnergy) && value.requiredEnergy >= 0 && Number.isFinite(value.requiredMineral) && value.requiredMineral >= 0);
}
function blocked(roomName, labId) {
    const value = entry(roomName, labId);
    return !!value && !(structured(value) && value.state === "released" && !value.pending);
}
function retains(roomName, labId, resource) {
    const value = entry(roomName, labId);
    if (!blocked(roomName, labId)) return false;
    if (!structured(value) || value.state === "transferToManual" || value.pending) return true;
    return ACTIVE.has(value.state) && (resource === "energy" || resource === value.compound);
}
function energyTarget(roomName, labId, baseline, held) {
    const value = entry(roomName, labId);
    if (!blocked(roomName, labId)) return baseline;
    if (!structured(value) || value.state === "transferToManual" || value.pending && !ACTIVE.has(value.state)) return Math.max(baseline, held);
    return ACTIVE.has(value.state) ? Math.max(baseline, value.requiredEnergy) : baseline;
}
function cleanup(roomName, labId, resource) {
    const value = entry(roomName, labId);
    return structured(value) && CLEANUP.has(value.state) && !value.pending && resource === value.compound;
}
function ownedBy(roomName, labId, owner) {
    const value = entry(roomName, labId);
    const key = owner && typeof owner === "object" ? owner.kind + ":" + owner.id : owner;
    return structured(value) && key === "boost:" + value.ownerRequestId && ACTIVE.has(value.state);
}
// Fixed-location funding belongs to the same canonical record, never another ledger.
function sourceClaims(roomName, resource, excludeOwner) {
    const mem = Memory.rooms && Memory.rooms[roomName], records = mem && mem.labBoostReservations;
    if (!records) return noSourceClaims;
    const out = {};
    const owner = excludeOwner && typeof excludeOwner === "object" ? excludeOwner.kind + ":" + excludeOwner.id : excludeOwner;
    for (const id in records) {
        const r = records[id];
        if (!structured(r) || r.managedBy !== "boostLogistics" || !ACTIVE.has(r.state) || owner === "boost:" + r.ownerRequestId) continue;
        for (const f of r.funding || []) if (f.resource === resource && Number.isFinite(f.remaining) && f.remaining > 0)
            out[f.sourceId] = (out[f.sourceId] || 0) + f.remaining;
    }
    return out;
}
function warehouseClaim(roomName, resource, excludeOwner) {
    let total = Object.values(sourceClaims(roomName, resource, excludeOwner)).reduce((n, q) => n + q, 0);
    const records = Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].labBoostReservations;
    for (const id in records || {}) {
        const r = records[id];
        if (!structured(r) || r.managedBy !== "boostLogistics" || excludeOwner === "boost:" + r.ownerRequestId) continue;
        for (const s of Object.values(r.shipments || {}))
            if (s.resource === resource && s.state === "withdraw" && s.tick === Game.time) total += s.amount;
    }
    return total;
}
module.exports = { all, entry, structured, blocked, retains, energyTarget, cleanup, ownedBy, sourceClaims, warehouseClaim };
