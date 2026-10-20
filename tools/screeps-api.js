#!/usr/bin/env node
"use strict";
// Read-only Screeps API client for humans and LLM agents. Credentials come from
// .env (SCREEPS_TOKEN, SCREEPS_HOST, SCREEPS_SHARD) or the process environment.
// Only GET requests are issued on purpose: nothing here can change the game.
//
//   node tools/screeps-api.js cpu [n]             CPU meter summary (top n per group)
//   node tools/screeps-api.js memory <path>       Memory at <path> (gz: payloads decoded)
//   node tools/screeps-api.js segment <id>        RawMemory segment <id>
//   node tools/screeps-api.js get <endpoint> [k=v ...]   any GET endpoint, JSON out
//
// Rate limit: /api/user/memory allows ~1440 calls/day per token - poll sparingly.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function loadEnv() {
    const file = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
}

loadEnv();
const TOKEN = process.env.SCREEPS_TOKEN;
const HOST = process.env.SCREEPS_HOST || "screeps.com";
const SHARD = process.env.SCREEPS_SHARD || "shard3";

function fail(message) {
    console.error(message);
    process.exit(1);
}

async function get(endpoint, params) {
    if (!TOKEN) fail("SCREEPS_TOKEN is empty - fill it in .env");
    const url = new URL(endpoint.startsWith("/") ? endpoint : "/" + endpoint, "https://" + HOST);
    Object.keys(params || {}).forEach((k) => url.searchParams.set(k, params[k]));
    const res = await fetch(url, { headers: { "X-Token": TOKEN } });
    if (res.status === 429) fail("HTTP 429 rate limited; retry after " + res.headers.get("Retry-After") + "s");
    const body = await res.text();
    if (!res.ok) fail("HTTP " + res.status + ": " + body.slice(0, 300));
    try { return JSON.parse(body); } catch (e) { return fail("non-JSON reply (server down or maintenance?): " + body.slice(0, 200)); }
}

function decode(data) {
    if (typeof data !== "string") return data;
    if (data.startsWith("gz:")) return JSON.parse(zlib.gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
    try { return JSON.parse(data); } catch (e) { return data; }
}

async function memory(memPath) {
    const json = await get("/api/user/memory", { path: memPath || "", shard: SHARD });
    return decode(json.data);
}

function printTop(title, group, n) {
    if (!group) return;
    const rows = Object.keys(group).map((k) => [k, group[k]]).sort((a, b) => (b[1].avg || 0) - (a[1].avg || 0));
    console.log("[" + title + "]");
    rows.slice(0, n).forEach(([k, s]) => console.log("  " + k.padEnd(28) + " avg " + String(s.avg).padStart(7) +
        "  max " + String(s.max).padStart(7) + "  calls " + s.calls));
}

async function cpu(n) {
    const c = await memory("stats.cpu");
    if (!c) fail("Memory.stats.cpu is empty");
    const m = c.meter || {};
    const a = c.accounting || {};
    console.log("bucket " + c.bucket + " / limit " + c.limit + " / last tick used " + (c.used && c.used.toFixed ? c.used.toFixed(2) : c.used));
    console.log("meter window " + m.ticks + " ticks (" + m.fromTick + ".." + m.toTick + "), script avg " + m.used +
        ", max tick " + m.maxTick + (m.includesReset ? " [includes global reset]" : ""));
    console.log("bucket balance " + a.validTicks + "/" + a.ticks + " ticks: inferred " + a.used + "/tick, warm " + a.warmUsed +
        ", residual " + a.residual + ", max " + a.maxUsed);
    ["modules", "roles", "structures", "spans", "tick"].forEach((g) => printTop(g, m[g], n));
    if (m.fns) {
        console.log("[fns] (last profile session)");
        Object.keys(m.fns).forEach((k) => console.log("  " + k.padEnd(40) + " self " + m.fns[k].self + "  total " + m.fns[k].total));
    }
}

async function main() {
    const [cmd, ...args] = process.argv.slice(2);
    if (cmd === "cpu") return cpu(Number(args[0]) || 15);
    if (cmd === "memory") return console.log(JSON.stringify(await memory(args[0]), null, 2));
    if (cmd === "segment") {
        const json = await get("/api/user/memory-segment", { segment: args[0], shard: SHARD });
        return console.log(JSON.stringify(decode(json.data), null, 2));
    }
    if (cmd === "get" && args[0]) {
        const params = {};
        args.slice(1).forEach((kv) => { const i = kv.indexOf("="); if (i > 0) params[kv.slice(0, i)] = kv.slice(i + 1); });
        return console.log(JSON.stringify(await get(args[0], params), null, 2));
    }
    fail("usage: node tools/screeps-api.js cpu [n] | memory <path> | segment <id> | get <endpoint> [k=v ...]");
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
