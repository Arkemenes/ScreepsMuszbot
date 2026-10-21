"use strict";
// ROADMAP 0162 (ARK-198): priority tiers by CPU bucket band.
//
// band()        "critical" | "low" | "normal" | "full", from Game.cpu.bucket against
//               cpu.bands, with cpu.bands.hysteresis so a bucket hovering on a threshold
//               does not flip the band every tick (state in the heap; a global reset
//               starts from the raw value).
// runs(tier)    whether a tier runs in this tick's band: critical T0, low T0-1,
//               normal T0-2, full T0-3.
// allows(label) the tier of a guard() label prefix (cpu.tiers) checked with runs();
//               an unknown label runs (never switch something off by omission).
// scaled(key, fallback)  a config value boosted in the full band: an interval divided,
//               a budget multiplied, per cpu.boost[key] = { factor, kind }.
// skip(label)   counts what was skipped this tick (published as cpu.skipped).
const config = require("./config");

const BANDS = ["critical", "low", "normal", "full"];
const MAX_TIER = { critical: 0, low: 1, normal: 2, full: 3 };

let current = null; // band of the last evaluated tick
let bandTick = -1;
let skipped = {};
let skippedTick = -1;

// Read key by key so a partial Memory.settings override keeps the other defaults.
function thresholds() {
    return {
        critical: Number(config.get("cpu.bands.critical", 1000)) || 1000,
        low: Number(config.get("cpu.bands.low", 3000)) || 3000,
        full: Number(config.get("cpu.bands.full", 9500)) || 9500,
        hysteresis: Math.max(0, Number(config.get("cpu.bands.hysteresis", 0)) || 0),
    };
}

function raw(bucket, t) {
    if (bucket < t.critical) return "critical";
    if (bucket < t.low) return "low";
    if (bucket >= t.full) return "full";
    return "normal";
}

// Edges sit at critical / low / full; moving up needs bucket >= edge + h, moving down
// needs bucket < edge - h. Inside the dead zone the previous band holds.
function band() {
    if (bandTick === Game.time && current) return current;
    const bucket = Game.cpu.bucket;
    const t = thresholds();
    const target = raw(bucket, t);
    if (!current || t.hysteresis === 0 || target === current) {
        current = target;
    } else {
        const up = BANDS.indexOf(target) > BANDS.indexOf(current);
        const shifted = raw(up ? bucket - t.hysteresis : bucket + t.hysteresis, t);
        // move only as far as the band the bucket clears with the margin
        if (up ? BANDS.indexOf(shifted) > BANDS.indexOf(current) : BANDS.indexOf(shifted) < BANDS.indexOf(current)) current = shifted;
    }
    bandTick = Game.time;
    return current;
}

function level() {
    return BANDS.indexOf(band());
}

function runs(tier) {
    return tier <= MAX_TIER[band()];
}

function tierOf(label) {
    const t = config.get("cpu.tiers." + label, 0);
    return Number.isInteger(t) ? t : 0;
}

// cpu.boost keys are config paths (with dots), so the map is merged, not walked.
function boostRule(key) {
    const own = Memory.settings && Memory.settings.cpu && Memory.settings.cpu.boost;
    if (own && Object.prototype.hasOwnProperty.call(own, key)) return own[key];
    const defs = config.defaults.cpu && config.defaults.cpu.boost;
    return defs && defs[key];
}

function allows(label) {
    return runs(tierOf(label));
}

function scaled(key, fallback) {
    const value = config.get(key, fallback);
    if (band() !== "full") return value;
    const rule = boostRule(key);
    const factor = rule && Number(rule.factor);
    if (!(factor > 0) || !(Number(value) > 0)) return value;
    if (rule.kind === "budget") return value * factor;
    return Math.max(1, Math.round(value / factor));
}

function skip(label) {
    if (skippedTick !== Game.time) { skippedTick = Game.time; skipped = {}; }
    skipped[label] = (skipped[label] || 0) + 1;
}

// This tick's skipped labels (empty object when nothing was skipped).
function skippedNow() {
    return skippedTick === Game.time ? skipped : {};
}

// Tests start each case from a clean heap.
function reset() {
    current = null; bandTick = -1; skipped = {}; skippedTick = -1;
}

module.exports = { band, level, runs, tierOf, allows, scaled, skip, skippedNow, reset, BANDS };
