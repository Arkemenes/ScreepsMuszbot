"use strict";
// Scalar snapshots work in both live execution and the offline schedule model.
function base() { return typeof LAB_REACTION_AMOUNT === "number" ? LAB_REACTION_AMOUNT : 5; }
function snapshot(lab) {
    let power = null;
    for (const effect of lab && lab.effects || []) {
        if (!(effect.ticksRemaining > 0)) continue;
        if (typeof PWR_OPERATE_LAB === "undefined" || effect.effect !== PWR_OPERATE_LAB || typeof POWER_INFO === "undefined")
            return { unsupported: true };
        const info = POWER_INFO[PWR_OPERATE_LAB];
        const extra = info && Number.isInteger(effect.level) && Array.isArray(info.effect) && info.effect[effect.level - 1];
        if (!Number.isSafeInteger(extra) || extra < 0) return { unsupported: true };
        if (power) return { unsupported: true };
        power = { extra, remaining: effect.ticksRemaining };
    }
    return power;
}
function amount(power, elapsed = 0) {
    if (power && power.unsupported) return null;
    return base() + (power && power.remaining > elapsed ? power.extra : 0);
}
// Future operated calls are bounded by the observed effect's expiry. Base
// reactions remain possible afterwards. Only residues modulo base are needed.
function opportunities(power, cooldown, first) {
    if (!power || power.unsupported || !(power.remaining > first)) return null;
    return { amount: base() + power.extra, count: Math.min(base() - 1,
        Math.ceil((power.remaining - first) / Math.max(1, cooldown))) };
}
function canFinish(quantity, future) {
    if (quantity === Infinity) return true;
    if (!Number.isSafeInteger(quantity) || quantity < 0) return false;
    const unit = base();
    if (quantity % unit === 0) return true;
    let reachable = Array(unit).fill(Infinity); reachable[0] = 0;
    for (const option of future) {
        if (!option || !(option.count > 0)) continue;
        const next = reachable.slice();
        for (let residue = 0; residue < unit; residue++) for (let n = 1; n <= Math.min(unit - 1, option.count); n++) {
            const value = reachable[residue] + n * option.amount;
            if (value <= quantity) next[value % unit] = Math.min(next[value % unit], value);
        }
        reachable = next;
    }
    return reachable[quantity % unit] <= quantity;
}
function sameAfter(before, after, elapsed) {
    if (before && before.unsupported || after && after.unsupported) return false;
    if (!before || before.remaining <= elapsed) return !after;
    return !!after && before.extra === after.extra && before.remaining - elapsed === after.remaining;
}
module.exports = { base, snapshot, amount, opportunities, canFinish, sameAfter };
