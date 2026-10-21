"use strict";
// ROADMAP 0154 T5-T6 (ARK-133): functional experiments - a temporary value for one allowlisted
// setting, as a heap overlay in utils/config (get(path, fallback, room)), never a write to
// Memory.settings (the base stays the user's).
//
// Memory.experiments = { seq, generation, running: { id: record }, closed: [record...] }
// record = { id, name, room, setting, scope, owner, generation, baseRevision, baseObserved,
//            overlayValue, metricsIds, guardIds, params, startedTick, deadlineTick, state,
//            reason, metricsStart, metricsEnd?, closedTick? }
// Guards and metrics are ids of the strategies registered below plus serializable params -
// never functions in Memory. States: running -> closed (deadline, stop) / aborted (guard, off,
// reset, manual base change, conflict, unknown strategy); start() validates the proposal
// (allowlist, type, conflicts, guards) before anything is written.
//
// reconcile() runs at the top of every tick (main.js, before needs/spawn), with the feature
// on or off: it closes what has to close, re-applies overlays after a reset when
// experiments.abortOnReset is false, and clears orphan overlays. Closing removes only the
// overlay with the record's own owner+generation, invalidates needs for the room and logs the
// reason; a repeated stop finds nothing running and changes nothing.
//
// Base changes: setSetting(path, value) (controlled setter) bumps Memory.settingsRevision[path]
// and closes experiments on that path at once; a direct Memory.settings edit that makes the base
// differ from baseObserved aborts on the next reconcile. A direct edit that returns to the same
// value (ABA) cannot be told apart and is not detected.
const config = require("./config");
const resourceTiers = require("./resourceTiers");
const energyReport = require("./energyReport");
const needs = require("../rooms/needs");

// allowlisted settings - scope "room": readers pass the room to config.get, the overlay only
// affects that room; "global": every reader. Values are primitives (compared with ===).
const SETTINGS = {
    "population.onDemand.pilot": { scope: "room", type: "boolean" },
    "population.onDemand.minIdleTicks": { scope: "room", type: "number", min: 0, max: 20000 },
    "population.onDemand.maxBuilderUtilization": { scope: "room", type: "number", min: 0, max: 1 },
};

// guard id -> (record, params) => reason to abort, or null
const GUARDS = {
    threat: (exp) => {
        const mem = Memory.rooms && Memory.rooms[exp.room];
        return mem && (mem.defenseActive || mem.enemies > 0) ? "threat" : null;
    },
    economy: (exp) => {
        const room = Game.rooms[exp.room];
        if (!room) return "room-not-visible";
        return resourceTiers.supplyShortfall(room);
    },
    bucket: (exp, params) => (Game.cpu.bucket < Number(params.minBucket || 2000) ? "bucket" : null),
};

// metric id -> (record) => small serializable snapshot, taken at start and at close
const METRICS = {
    cpu: () => {
        const cpu = Memory.stats && Memory.stats.cpu;
        const meter = cpu && cpu.meter;
        return { bucket: Game.cpu.bucket, meterUsed: meter ? meter.used : null, meterAt: meter ? meter.at : null };
    },
    energyReport: (exp) => {
        const s = energyReport.summary(exp.room);
        const builder = s.utilization && s.utilization.builder;
        return { coverage: s.coverage, spendPerTick: s.spendPerTick, incomeProxyPerTick: s.incomeProxyPerTick,
            builderUtilization: builder ? builder.ratio : null };
    },
    onDemand: (exp) => {
        const mem = Memory.rooms && Memory.rooms[exp.room];
        const pilot = mem && mem.onDemand;
        return { state: pilot ? pilot.state : null, since: pilot ? pilot.since : null };
    },
};

const DEFAULT_GUARDS = ["threat", "economy"];
let booted = false;

function store() {
    if (!Memory.experiments) Memory.experiments = { seq: 0, generation: 0, running: {}, closed: [] };
    return Memory.experiments;
}

function revision(path) {
    return (Memory.settingsRevision && Memory.settingsRevision[path]) || 0;
}

function scopeRoom(exp) { return exp.scope === "room" ? exp.room : null; }

function collect(exp) {
    const out = {};
    for (const id of exp.metricsIds) {
        try { out[id] = METRICS[id](exp); } catch (e) { out[id] = { error: String(e && e.message || e).slice(0, 80) }; }
    }
    return out;
}

function invalidateFor(exp) {
    if (exp.scope === "room") needs.invalidate(exp.room);
    else for (const name of Object.keys(Game.rooms)) needs.invalidate(name);
}

function close(exp, state, reason) {
    const mem = store();
    if (!mem.running[exp.id]) return false;
    config.clearOverlay(exp.setting, scopeRoom(exp), exp.owner, exp.generation);
    exp.state = state;
    exp.reason = reason;
    exp.closedTick = Game.time;
    exp.metricsEnd = collect(exp);
    delete mem.running[exp.id];
    mem.closed.push(exp);
    const keep = Math.max(0, Number(config.get("experiments.keepClosed", 10)));
    while (mem.closed.length > keep) mem.closed.shift();
    invalidateFor(exp);
    // an end the user chose or the plan reached: autoStart does not run this name again
    if (state === "closed" || reason === "manual-edit" || reason === "manual-setting") {
        if (!mem.done) mem.done = {};
        mem.done[exp.name] = { reason, tick: Game.time };
    }
    console.log("[experiment] " + exp.id + " (" + exp.name + ", " + exp.room + " " + exp.setting + ") " + state + ": " + reason);
    return true;
}

function applyOverlay(exp) {
    config.setOverlay(exp.setting, scopeRoom(exp), { value: exp.overlayValue, owner: exp.owner, generation: exp.generation });
}

// "id" or { id, params } -> { id, params }
function strategy(spec) {
    if (typeof spec === "string") return { id: spec, params: {} };
    if (spec && typeof spec.id === "string") return { id: spec.id, params: spec.params || {} };
    return null;
}

function validValue(def, value) {
    if (typeof value !== def.type) return false;
    if (def.type === "number" && (!isFinite(value) || value < def.min || value > def.max)) return false;
    return true;
}

// { ok: true, id } or { ok: false, error }
function start(opts) {
    const o = opts || {};
    if (config.get("experiments.enabled", true) === false) return { ok: false, error: "experiments.enabled false" };
    const def = SETTINGS[o.setting];
    if (!def) return { ok: false, error: "setting fora da allowlist: " + o.setting + " (permitidos: " + Object.keys(SETTINGS).join(", ") + ")" };
    if (typeof o.name !== "string" || !o.name) return { ok: false, error: "name obrigatório" };
    const room = Game.rooms[o.room];
    if (!room || !room.controller || !room.controller.my) return { ok: false, error: "sala própria visível obrigatória: " + o.room };
    if (!validValue(def, o.value)) return { ok: false, error: "valor inválido para " + o.setting + " (" + def.type + ")" };
    const ticks = Number(o.ticks);
    const maxTicks = Number(config.get("experiments.maxTicks", 20000));
    if (!(ticks >= 1 && ticks <= maxTicks)) return { ok: false, error: "ticks entre 1 e " + maxTicks };
    const guards = (o.guard === undefined ? DEFAULT_GUARDS : [].concat(o.guard)).map(strategy);
    const metrics = (o.metrics === undefined ? ["cpu", "energyReport"] : [].concat(o.metrics)).map(strategy);
    for (const g of guards) if (!g || !GUARDS[g.id]) return { ok: false, error: "guarda desconhecida: " + JSON.stringify(g) };
    for (const m of metrics) if (!m || !METRICS[m.id]) return { ok: false, error: "métrica desconhecida: " + JSON.stringify(m) };

    const mem = store();
    for (const other of Object.values(mem.running)) {
        if (other.room === o.room) return { ok: false, error: "sala já tem experimento: " + other.id };
        if (other.setting === o.setting && (def.scope === "global" || other.scope === "global"))
            return { ok: false, error: "setting já em experimento: " + other.id };
    }
    if (config.overlayOf(o.setting, def.scope === "room" ? o.room : null)) return { ok: false, error: "overlay existente em " + o.setting };
    const params = {};
    for (const g of guards) params[g.id] = g.params;
    // a guard already failing refuses the start instead of opening and closing at once
    const blocked = guardReason({ room: o.room, guardIds: guards.map((g) => g.id), params });
    if (blocked) return { ok: false, error: "guarda bloqueia o início: " + blocked };

    mem.seq = (mem.seq || 0) + 1;
    mem.generation = (mem.generation || 0) + 1;
    const id = "exp" + mem.seq;
    const exp = {
        id, name: o.name, room: o.room, setting: o.setting, scope: def.scope,
        owner: "experiment:" + id, generation: mem.generation,
        baseRevision: revision(o.setting), baseObserved: valueOrNull(config.base(o.setting)),
        overlayValue: o.value, metricsIds: metrics.map((m) => m.id), guardIds: guards.map((g) => g.id), params,
        startedTick: Game.time, deadlineTick: Game.time + ticks, state: "running", reason: null,
    };
    exp.metricsStart = collect(exp);
    mem.running[id] = exp;
    applyOverlay(exp);
    invalidateFor(exp);
    console.log("[experiment] " + id + " start: " + o.room + " " + o.setting + "=" + JSON.stringify(o.value) + " por " + ticks + " ticks");
    return { ok: true, id };
}

function valueOrNull(v) { return v === undefined ? null : v; }

function guardReason(exp) {
    for (const id of exp.guardIds) {
        const fn = GUARDS[id];
        if (!fn) return "unknown-guard:" + id;
        const reason = fn(exp, (exp.params && exp.params[id]) || {});
        if (reason) return reason;
    }
    return null;
}

function stop(id, reason) {
    const exp = Memory.experiments && Memory.experiments.running && Memory.experiments.running[id];
    if (!exp) return false;
    return close(exp, "closed", reason || "stopped");
}

// one reason to end a running experiment this tick, or null
function endReason(exp, boot) {
    if (config.get("experiments.enabled", true) === false) return ["aborted", "off"];
    if (boot && config.get("experiments.abortOnReset", true) !== false) return ["aborted", "reset"];
    if (!SETTINGS[exp.setting]) return ["aborted", "setting-not-allowed"];
    for (const id of exp.metricsIds) if (!METRICS[id]) return ["aborted", "unknown-metric:" + id];
    if (revision(exp.setting) !== exp.baseRevision) return ["aborted", "manual-setting"];
    if (valueOrNull(config.base(exp.setting)) !== exp.baseObserved) return ["aborted", "manual-edit"];
    if (Game.time >= exp.deadlineTick) return ["closed", "deadline"];
    const guard = guardReason(exp);
    if (guard) return ["aborted", "guard:" + guard];
    const live = config.overlayOf(exp.setting, scopeRoom(exp));
    if (live && (live.owner !== exp.owner || live.generation !== exp.generation)) return ["aborted", "conflict"];
    return null;
}

function reconcile() {
    const boot = !booted;
    booted = true;
    const mem = Memory.experiments;
    const running = mem && mem.running ? Object.values(mem.running) : [];
    for (const exp of running) {
        const end = endReason(exp, boot);
        if (end) close(exp, end[0], end[1]);
        else if (!config.overlayOf(exp.setting, scopeRoom(exp))) { applyOverlay(exp); invalidateFor(exp); }
    }
    // an overlay whose record is gone (Memory.experiments edited or wiped) is an orphan
    for (const o of config.overlayEntries()) {
        const id = o.entry.owner.indexOf("experiment:") === 0 ? o.entry.owner.slice(11) : null;
        const exp = id && mem && mem.running && mem.running[id];
        if (!exp || exp.generation !== o.entry.generation) {
            config.clearOverlay(o.path, o.room, o.entry.owner, o.entry.generation);
            if (o.room) needs.invalidate(o.room);
            else for (const name of Object.keys(Game.rooms)) needs.invalidate(name);
            console.log("[experiment] overlay órfão removido: " + o.path + (o.room ? " " + o.room : ""));
        }
    }
    autoStart();
}

// experiments.autoStart: experiments the code runs by default (the API token is read-only, so
// the first live run cannot come from the console). An entry is (re)started whenever it is not
// running - after a reset or a guard abort too - until it ends for good: deadline, a stop or a
// manual base change (Memory.experiments.done[name]). A refused start waits autoStartRetryTicks.
const autoRetry = {}; // name -> { tick, error } (heap)
function autoStart() {
    if (config.get("experiments.enabled", true) === false) return;
    const list = config.get("experiments.autoStart", []);
    if (!Array.isArray(list) || !list.length) return;
    const mem = Memory.experiments;
    for (const entry of list) {
        if (!entry || typeof entry.name !== "string") continue;
        if (mem && mem.done && mem.done[entry.name]) continue;
        if (mem && mem.running && Object.values(mem.running).some((e) => e.name === entry.name)) continue;
        const wait = autoRetry[entry.name];
        if (wait && Game.time >= wait.from && Game.time < wait.tick) continue;
        const r = start(entry);
        if (r.ok) { delete autoRetry[entry.name]; continue; }
        if (!wait || wait.error !== r.error) console.log("[experiment] autoStart " + entry.name + " adiado: " + r.error);
        autoRetry[entry.name] = { from: Game.time, tick: Game.time + Number(config.get("experiments.autoStartRetryTicks", 100)), error: r.error };
    }
}

// controlled setter: writes the base, bumps its revision and closes experiments on that path
function setSetting(path, value) {
    const segments = path.split(".");
    if (!Memory.settings) Memory.settings = {};
    let node = Memory.settings;
    for (let i = 0; i < segments.length - 1; i++) {
        if (!node[segments[i]] || typeof node[segments[i]] !== "object") node[segments[i]] = {};
        node = node[segments[i]];
    }
    if (value === undefined) delete node[segments[segments.length - 1]];
    else node[segments[segments.length - 1]] = value;
    if (!Memory.settingsRevision) Memory.settingsRevision = {};
    Memory.settingsRevision[path] = revision(path) + 1;
    const running = Memory.experiments && Memory.experiments.running ? Object.values(Memory.experiments.running) : [];
    for (const exp of running) if (exp.setting === path) close(exp, "aborted", "manual-setting");
}

function status() {
    const mem = Memory.experiments;
    if (!mem) return "[experiment] nenhum experimento";
    const lines = Object.values(mem.running).map((e) => "[experiment] " + e.id + " running: " + e.name + " " + e.room + " " +
        e.setting + "=" + JSON.stringify(e.overlayValue) + " (base " + JSON.stringify(e.baseObserved) + "), faltam " +
        (e.deadlineTick - Game.time) + "t, guardas " + e.guardIds.join("/"));
    for (const e of mem.closed.slice(-5)) lines.push("[experiment] " + e.id + " " + e.state + " t" + e.closedTick + ": " + e.reason + " (" + e.name + ")");
    return lines.join("\n") || "[experiment] nenhum experimento";
}

function stats() {
    const mem = Memory.experiments;
    if (!mem) return null;
    const last = mem.closed[mem.closed.length - 1];
    return { running: Object.keys(mem.running).length, lastReason: last ? last.reason : "", lastState: last ? last.state : "" };
}

function resetHeap() { booted = false; }

global.experiment = {
    start: (opts) => { const r = start(opts); return r.ok ? "[experiment] " + r.id + " iniciado" : "[experiment] recusado: " + r.error; },
    stop: (id) => (stop(id) ? "[experiment] " + id + " encerrado" : "[experiment] " + id + " não está rodando"),
    status,
    settings: () => Object.keys(SETTINGS).map((p) => p + " (" + SETTINGS[p].scope + ", " + SETTINGS[p].type + ")").join("\n"),
};
global.setSetting = function (path, value) {
    setSetting(path, value);
    return "[settings] " + path + " = " + JSON.stringify(value) + " (revisão " + revision(path) + ")";
};

module.exports = { start, stop, reconcile, setSetting, status, stats, SETTINGS, GUARDS, METRICS, resetHeap };
