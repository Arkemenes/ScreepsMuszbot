"use strict";
// Pure lower-supply / upper-demand envelope. A quote never owns stock or channels.
const nonnegative = (n) => Number.isFinite(n) && n >= 0;
function evaluate(context) {
    const c = context || {}, margin = c.margin === undefined ? 0.20 : c.margin;
    const maxAge = c.maxAgeTicks === undefined ? 1 : c.maxAgeTicks;
    const minCoverage = c.minCoverageFraction === undefined ? 0.95 : c.minCoverageFraction;
    const unknown = (reason) => ({ status: "unknown", reasons: [reason], allocation: null });
    if (!nonnegative(c.nowTick) || !nonnegative(c.observedTick) || !nonnegative(c.horizonTicks) ||
        !nonnegative(c.localFree) || !nonnegative(margin) || !nonnegative(maxAge) ||
        !nonnegative(minCoverage) || minCoverage > 1 || typeof c.regimeId !== "string" || !c.regimeId)
        return unknown("invalid-context");
    if (c.nowTick < c.observedTick || c.nowTick - c.observedTick > maxAge) return unknown("stale-context");
    if (c.quality !== "bounded" || !nonnegative(c.coverageFraction) || c.coverageFraction > 1 ||
        c.coverageFraction < minCoverage || c.coveredHorizonTicks < c.horizonTicks || !Number.isFinite(c.coveredHorizonTicks))
        return unknown("insufficient-evidence");
    if (!Array.isArray(c.supply) || !Array.isArray(c.demand) || c.supply.length + c.demand.length > 32)
        return unknown("curve-budget");
    const boundaries = new Set([0, c.horizonTicks]), identities = new Set();
    for (const segment of [...c.supply, ...c.demand]) {
        if (!segment || typeof segment.commitmentId !== "string" || !segment.commitmentId || identities.has(segment.commitmentId))
            return unknown("ambiguous-commitment");
        identities.add(segment.commitmentId);
        if (!nonnegative(segment.at) || segment.at > c.horizonTicks || !nonnegative(segment.amount || 0) ||
            segment.amount !== undefined && !nonnegative(segment.amount)) return unknown("invalid-curve");
        boundaries.add(segment.at);
        if (segment.until !== undefined) {
            if (!nonnegative(segment.until) || segment.until < segment.at || segment.until > c.horizonTicks || !nonnegative(segment.rate))
                return unknown("invalid-curve");
            boundaries.add(segment.until);
        } else if (segment.rate !== undefined) return unknown("invalid-curve");
    }
    if (boundaries.size > 16) return unknown("boundary-budget");
    const cumulative = (segments, t, right) => segments.reduce((n, s) => n +
        (t > s.at || right && t === s.at ? s.amount || 0 : 0) +
        (s.until === undefined ? 0 : Math.max(0, Math.min(t, s.until) - s.at) * s.rate), 0);
    let minimumSlack = Infinity, firstShortage = null;
    for (const t of [...boundaries].sort((a, b) => a - b)) for (const right of [false, true]) {
        const supply = c.localFree + cumulative(c.supply, t, right);
        const required = cumulative(c.demand, t, right) * (1 + margin);
        const slack = supply - required;
        if (!Number.isFinite(slack)) return unknown("nonfinite-envelope");
        minimumSlack = Math.min(minimumSlack, slack);
        if (slack < -1e-9 && firstShortage === null) firstShortage = { at: t, side: right ? "right" : "left", supply, required };
    }
    return { status: firstShortage ? "blocked" : "ready", reasons: firstShortage ? ["delivery-shortfall"] : [],
        observedTick: c.observedTick, validUntilTick: c.observedTick + maxAge, regimeId: c.regimeId,
        horizonTicks: c.horizonTicks, minimumSlack, firstShortage,
        allocation: firstShortage ? null : { resource: c.resource || "energy", horizonTicks: c.horizonTicks } };
}
module.exports = { evaluate };
