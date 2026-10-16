"use strict";
// ROADMAP 0147: how often does a recurring decision see exactly the inputs it saw last
// time? Heap only, read-only: a probe never changes what the caller does, it just counts.
// A decision cache is only worth building where this says "most calls repeat".
//   hit(name, key, hash)  key identifies the subject (room, operation); hash is a number
//                         folded from the inputs with fold()
const MAX_KEYS = 256;
let last = new Map();
let stats = {};
let since = null;
let broken = false;

function fold(h, v) {
    if (typeof v === "string") { for (let i = 0; i < v.length; i++) h = (Math.imul(h, 31) + v.charCodeAt(i)) | 0; return h; }
    if (typeof v === "number") return (Math.imul(h, 31) + (v | 0) + ((v * 1000) % 1000 | 0)) | 0;
    return (Math.imul(h, 31) + (v ? 1 : 0)) | 0;
}

function hit(name, key, hash) {
    if (broken) return;
    try {
        if (since === null) since = Game.time;
        const entry = stats[name] || (stats[name] = { calls: 0, same: 0 });
        const id = name + ":" + key;
        entry.calls++;
        if (last.get(id) === hash) entry.same++;
        else {
            if (last.size >= MAX_KEYS && !last.has(id)) last = new Map();
            last.set(id, hash);
        }
    } catch (e) { broken = true; }
}

function snapshot() {
    return { since, broken, names: Object.keys(stats).map((n) => ({ name: n, calls: stats[n].calls, same: stats[n].same,
        rate: stats[n].calls ? Math.round(stats[n].same / stats[n].calls * 1000) / 10 : 0 })) };
}

function reset() { last = new Map(); stats = {}; since = null; broken = false; }

module.exports = { hit, fold, snapshot, reset };
