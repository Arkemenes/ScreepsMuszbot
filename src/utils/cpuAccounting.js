"use strict";
// Post-script debit inferred next tick. This is a balance observation, not a
// profiler for serialization/GC; keep the unobserved residual unattributed.
const config = require("./config");
// ROADMAP 0145: bootTick is the first tick this global ran (a deploy or a server reset
// starts a new global). It survives reset() on purpose: the window that contains it
// carries the cold start, which is not steady-state cost.
let previous, capacity = 0, samples = [], cursor = 0, sums, bootTick = null, maxUsed = 0, rescanMax = false;
function reset() {
    previous = null; capacity = 0; samples = []; cursor = 0; maxUsed = 0; rescanMax = false;
    sums = { valid: 0, used: 0, limit: 0, paired: 0, pairedUsed: 0, script: 0, missingTicks: 0, coldValid: 0, coldUsed: 0 };
}
reset();
function adjust(s, sign) {
    sums.missingTicks += sign * s.missingTicks;
    if (s.used === null) return;
    sums.valid += sign; sums.used += sign * s.used; sums.limit += sign * s.limit;
    if (s.cold) { sums.coldValid += sign; sums.coldUsed += sign * s.used; }
    if (sign > 0) { if (s.used > maxUsed) maxUsed = s.used; } else if (s.used >= maxUsed) rescanMax = true;
    if (s.script !== null) {
        sums.paired += sign; sums.pairedUsed += sign * s.used; sums.script += sign * s.script;
    }
}
function begin() {
    if (bootTick === null) bootTick = Game.time;
    const requested = Number(config.get("stats.cpuBalanceWindowTicks", 600));
    const cap = Number.isFinite(requested) && requested > 0 ? Math.max(1, Math.floor(requested)) : 600;
    const shard = Game.shard && Game.shard.name;
    if (capacity !== cap || previous && (Game.time < previous.tick || shard !== previous.shard)) {
        reset(); capacity = cap;
    }
    if (previous && previous.tick === Game.time) return;
    const now = { tick: Game.time, bucket: Game.cpu.bucket, limit: Game.cpu.limit, shard, script: null };
    if (previous) {
        const valid = now.tick === previous.tick + 1 && now.limit === previous.limit &&
            Number.isFinite(previous.limit) && previous.limit >= 0 &&
            Number.isFinite(previous.bucket) && Number.isFinite(now.bucket) &&
            previous.bucket > 0 && now.bucket > 0 && now.bucket < 10000 &&
            previous.bucket + previous.limit < 10000;
        const used = valid ? previous.limit + previous.bucket - now.bucket : null;
        const sample = { tick: previous.tick, limit: previous.limit,
            used: used !== null && Number.isFinite(used) && used >= 0 ? used : null,
            cold: previous.tick === bootTick, script: previous.script, missingTicks: Math.max(0, now.tick - previous.tick - 1) };
        if (samples[cursor]) adjust(samples[cursor], -1);
        samples[cursor] = sample; adjust(sample, 1); cursor = (cursor + 1) % capacity;
    }
    previous = now;
}
function end(used) {
    if (previous && previous.tick === Game.time && Number.isFinite(used) && used >= 0) previous.script = used;
}
const round = (value) => Math.round(value * 1000) / 1000;
function currentMax() {
    if (rescanMax) {
        maxUsed = 0;
        samples.forEach((s) => { if (s.used !== null && s.used > maxUsed) maxUsed = s.used; });
        rescanMax = false;
    }
    return maxUsed;
}
function boot() { return bootTick; }
function describe(total, ticks, first, last, max) {
    return { ticks, validTicks: total.valid, pairedTicks: total.paired,
        missingEndTicks: total.valid - total.paired, skippedTicks: ticks - total.valid,
        missingTicks: total.missingTicks, fromTick: first ? first.tick : null, toTick: last ? last.tick : null,
        bootTick, includesReset: !!(first && last && bootTick !== null && first.tick <= bootTick && bootTick <= last.tick),
        coldUsed: total.coldValid ? round(total.coldUsed / total.coldValid) : null,
        warmUsed: total.valid - total.coldValid > 0 ? round((total.used - total.coldUsed) / (total.valid - total.coldValid)) : null,
        maxUsed: total.valid ? round(max) : null,
        used: total.valid ? round(total.used / total.valid) : null,
        headroom: total.valid ? round((total.limit - total.used) / total.valid) : null,
        pairedUsed: total.paired ? round(total.pairedUsed / total.paired) : null,
        scriptUsed: total.paired ? round(total.script / total.paired) : null,
        residual: total.paired ? round((total.pairedUsed - total.script) / total.paired) : null };
}
function snapshot() {
    const first = samples.length ? samples[samples.length === capacity ? cursor : 0] : null;
    const last = samples.length ? samples[(cursor + capacity - 1) % capacity] : null;
    return describe(sums, samples.length, first, last, currentMax());
}
// Scan the existing bounded ring only when an explicitly requested report closes.
function range(fromTick, toTick) {
    if (!Number.isInteger(fromTick) || !Number.isInteger(toTick) || toTick < fromTick) throw new TypeError("Invalid CPU report range");
    const total = { valid: 0, used: 0, limit: 0, paired: 0, pairedUsed: 0, script: 0, missingTicks: 0, coldValid: 0, coldUsed: 0 };
    let ticks = 0, first = null, last = null, max = 0;
    for (const s of samples) {
        if (s.tick < fromTick || s.tick > toTick) continue;
        ticks++;
        if (!first || s.tick < first.tick) first = s;
        if (!last || s.tick > last.tick) last = s;
        if (s.used === null) continue;
        total.valid++; total.used += s.used; total.limit += s.limit; max = Math.max(max, s.used);
        if (s.cold) { total.coldValid++; total.coldUsed += s.used; }
        if (s.script !== null) { total.paired++; total.pairedUsed += s.used; total.script += s.script; }
    }
    const requestedTicks = toTick - fromTick + 1;
    total.missingTicks = Math.max(0, requestedTicks - ticks);
    const result = describe(total, ticks, first, last, max);
    result.requestedFromTick = fromTick; result.requestedToTick = toTick; result.requestedTicks = requestedTicks;
    result.complete = ticks === requestedTicks && total.valid === ticks && total.paired === ticks && !result.includesReset;
    return result;
}
module.exports = { begin, end, snapshot, range, reset, boot };
