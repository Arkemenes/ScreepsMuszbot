"use strict";
// ROADMAP 0153: recovery metadata lives on the canonical terminal operation.
const policy = require("./listingPolicy");
const ownerKey = (owner) => owner && typeof owner === "object" ? owner.kind + ":" + owner.id : String(owner || "");
function automatic(op) {
    const owner = ownerKey(op && op.owner);
    return !!(op && op.kind === "sell" && !owner.startsWith("manual:") && (op.policy === "swing" || op.automatic ||
        owner && owner.includes(":")));
}
function enroll(op, order, now) {
    op.listingPolicyManaged = true;
    if (!op.listingLifecycle) {
        const age = policy.age(order, null, now);
        op.listingLifecycle = { owner: ownerKey(op.owner), generation: 1, observedAt: now,
            createdAt: age.createdAt, ageSource: age.source };
    }
    const state = op.listingLifecycle;
    if (order && !state.orderId) {
        state.orderId = order.id || op.marketOrderId;
        const age = policy.age(order, state.ageSource === "submission" ? null : state, now);
        state.createdAt = age.createdAt; state.ageSource = age.source;
        state.price = order.price; state.total = order.totalAmount;
        state.resource = order.resourceType; state.type = order.type; state.room = order.roomName;
    }
    return state;
}
function observe(op, order, tick, now, timeout) {
    const state = enroll(op, order, now);
    state.lastReconciledTick = tick;
    if (state.halted) return;
    if (state.owner !== ownerKey(op.owner) || state.orderId && op.marketOrderId !== state.orderId && !state.cancelConfirmed ||
        order && (order.resourceType !== state.resource || order.type !== state.type || order.roomName !== state.room)) {
        if (!state.halted) state.generation++;
        state.halted = "manual-edit"; return;
    }
    const pending = state.pending;
    if (pending) {
        if (tick <= pending.tick) return;
        let confirmed = false;
        if (pending.kind === "cancel") confirmed = !order;
        if (pending.kind === "reprice") confirmed = !!order && order.price === pending.price && order.totalAmount === state.total;
        if (pending.kind === "extend") confirmed = !!order && order.totalAmount === pending.total + pending.amount && order.price === state.price;
        if (order && (pending.kind === "extend" && (order.totalAmount > pending.total + pending.amount || order.price !== state.price) ||
            pending.kind === "reprice" && order.totalAmount !== state.total)) {
            state.generation++; state.halted = "manual-edit"; return;
        }
        if (confirmed) {
            if (order) { state.price = order.price; state.total = order.totalAmount; }
            if (pending.kind === "cancel") { state.cancelConfirmed = true; state.cancelReason = pending.reason; }
            delete state.pending;
        } else if (tick - pending.tick > timeout) state.halted = "unconfirmed-" + pending.kind;
        return;
    }
    if (!order && op.createdListing && op.listedTick !== undefined && !op.marketOrderId) {
        if (tick - op.listedTick > timeout) state.halted = "unconfirmed-create";
        return;
    }
    if (state.orderId && !order && !state.cancelConfirmed) { state.halted = "missing-order-unknown"; return; }
    if (order && (state.price !== order.price || state.total !== order.totalAmount)) {
        state.generation++; state.halted = "manual-edit";
    }
}
module.exports = { automatic, enroll, observe };
