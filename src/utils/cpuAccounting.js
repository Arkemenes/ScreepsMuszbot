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
function snapshot() {
    const first = samples.length ? samples[samples.length === capacity ? cursor : 0] : null;
    const last = samples.length ? samples[(cursor + capacity - 1) % capacity] : null;
    return { ticks: samples.length, validTicks: sums.valid, pairedTicks: sums.paired,
        missingEndTicks: sums.valid - sums.paired, skippedTicks: samples.length - sums.valid,
        missingTicks: sums.missingTicks, fromTick: first ? first.tick : null, toTick: last ? last.tick : null,
        bootTick, includesReset: !!(first && bootTick !== null && first.tick <= bootTick),
        coldUsed: sums.coldValid ? round(sums.coldUsed / sums.coldValid) : null,
        warmUsed: sums.valid - sums.coldValid > 0 ? round((sums.used - sums.coldUsed) / (sums.valid - sums.coldValid)) : null,
        maxUsed: sums.valid ? round(currentMax()) : null,
        used: sums.valid ? round(sums.used / sums.valid) : null,
        headroom: sums.valid ? round((sums.limit - sums.used) / sums.valid) : null,
        pairedUsed: sums.paired ? round(sums.pairedUsed / sums.paired) : null,
        scriptUsed: sums.paired ? round(sums.script / sums.paired) : null,
        residual: sums.paired ? round((sums.pairedUsed - sums.script) / sums.paired) : null };
}
module.exports = { begin, end, snapshot, reset, boot };
