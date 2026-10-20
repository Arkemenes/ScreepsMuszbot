// Economic freight only. The public send/deal API still requires raw fuel.
// No Memory, market queries, room scans or retained game objects.
function multiplier(terminal) {
    if (!terminal || !terminal.effects || !terminal.effects.length ||
        typeof PWR_OPERATE_TERMINAL === "undefined" || typeof POWER_INFO === "undefined") return 1;
    for (const effect of terminal.effects) {
        if (effect.effect !== PWR_OPERATE_TERMINAL || !(effect.ticksRemaining > 0)) continue;
        const info = POWER_INFO[PWR_OPERATE_TERMINAL];
        const factor = info && Number.isInteger(effect.level) && Array.isArray(info.effect) && info.effect[effect.level - 1];
        return Number.isFinite(factor) && factor > 0 && factor <= 1 ? factor : 1;
    }
    return 1;
}
function debit(raw, factor) {
    return factor > 0 && factor < 1 ? Math.ceil(raw * factor) : raw;
}
// Older intents did not persist a separate API requirement.
function required(quote) { return quote.requiredEnergy === undefined ? quote.cost : quote.requiredEnergy; }
function snapshot(terminal) {
    const effect = terminal && (terminal.effects || []).find((entry) =>
        typeof PWR_OPERATE_TERMINAL !== "undefined" && entry.effect === PWR_OPERATE_TERMINAL && entry.ticksRemaining > 0);
    return effect ? { factor: multiplier(terminal), remaining: effect.ticksRemaining, level: effect.level } : null;
}
function sameAfter(before, after, elapsed) {
    if (!before || before.remaining <= elapsed) return !after;
    return !!after && before.factor === after.factor && before.level === after.level && before.remaining - elapsed === after.remaining;
}
module.exports = { multiplier, debit, required, snapshot, sameAfter };
