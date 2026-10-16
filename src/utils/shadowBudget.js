"use strict";
// ROADMAP 0145: live shadow comparison with a hard CPU budget. The candidate is what
// acts; `reference` is the previous implementation, a PURE calculation over the same
// snapshot (no intents, no Memory writes), run only here and compared by the caller.
// Never use it for decisions that mutate state (claims, ledger, orders): those are
// covered by the offline oracle (test/equivalence) and the post-deploy invariants.
//   - off unless shadow.enabled
//   - needs a healthy bucket (shadow.minBucket) so it can never drain it
//   - at most one run per name per tick, and shadow.maxCpuPerTick in total
//   - past the cap it switches itself off until the next global reset
const config = require("./config");

let tickSeen = -1;
let spent = 0;
const ran = {};
let tripped = false;
const divergences = { count: 0, sample: null };

function run(name, reference) {
    if (tripped || !config.get("shadow.enabled", false)) return { ran: false };
    if (Game.cpu.bucket < config.get("shadow.minBucket", 9000)) return { ran: false };
    if (tickSeen !== Game.time) { tickSeen = Game.time; spent = 0; Object.keys(ran).forEach((k) => { delete ran[k]; }); }
    if (ran[name]) return { ran: false };
    ran[name] = true;
    const start = Game.cpu.getUsed();
    let value; let error = null;
    try { value = reference(); } catch (e) { error = String(e && e.message || e); }
    spent += Game.cpu.getUsed() - start;
    if (spent > config.get("shadow.maxCpuPerTick", 0.5)) tripped = true;
    return { ran: true, value, error };
}

// The caller compares reference vs candidate and reports a mismatch here: bounded
// summary only (a counter and the first sample), never a per-tick log.
function diverged(name, detail) {
    divergences.count++;
    if (!divergences.sample) divergences.sample = { name, tick: Game.time, detail: String(detail).slice(0, 200) };
}

function status() { return { tripped, divergences: divergences.count, sample: divergences.sample }; }

module.exports = { run, diverged, status };
