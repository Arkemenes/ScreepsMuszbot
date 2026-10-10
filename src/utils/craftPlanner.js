// ROADMAP 0111: decides WHICH chain (factory commodity or lab compound) is
// worth running in WHICH room, using marketPricing's conservative model.
// Charter (constitution §6): this module decides "what"; structures/factory.js,
// structures/lab.js and roles/hauler.js only execute. In craft.test mode
// (default) it only records candidates and why everything else was discarded.
const config = require("./config");
const cadence = require("./cadence");
const cpuMeter = require("./cpuMeter");
const census = require("./census");
const roomCache = require("./roomCache");
const market = require("./market");
const marketPricing = require("./marketPricing");
const marketFlip = require("./marketFlip");
const labSlots = require("./labSlots");
const craftChain = require("./craftChain");
const resourceTiers = require("./resourceTiers");

let lastScanTick = null;
let lastLogSignature = null;
const openFailLogged = {};
let scansSinceDiscardLog = 0;

function log(message) {
    if (config.get("craft.log", true)) console.log("[craft] " + message);
}

// One line per candidate when the top list changes, and a discard summary
// every craft.logDiscardEvery scans - never the same text every 5 minutes.
function logScan(mem) {
    const mode = config.get("craft.test", true) ? "test" : "live";
    const signature = mem.candidates.map((c) => c.room + ":" + c.product + ":" + c.qty).join("|");
    if (signature !== lastLogSignature) {
        lastLogSignature = signature;
        if (!mem.candidates.length) log("scan (" + mode + "): nenhum candidato");
        mem.candidates.slice(0, 3).forEach((cand) => {
            log("candidato (" + mode + ") " + cand.room + " " + cand.product + " x" + cand.qty +
                ": custo " + cand.cost + ", receita " + cand.revenue + ", lucro +" + cand.profit +
                " (" + (cand.ratio * 100).toFixed(1) + "% >= margem " + (cand.margin * 100).toFixed(1) + "%, T=" + cand.T + ")" +
                (" [gasto " + cand.spend + "]") + (Object.keys(cand.buys).length ? ", compra " + Object.keys(cand.buys).map((k) => k + " x" + Math.ceil(cand.buys[k])).join(", ") : ""));
        });
    }
    scansSinceDiscardLog++;
    if (scansSinceDiscardLog >= config.get("craft.logDiscardEvery", 12)) {
        scansSinceDiscardLog = 0;
        const top = Object.keys(mem.discards).sort((a, b) => mem.discards[b] - mem.discards[a]).slice(0, 5);
        if (top.length) log("descartes: " + top.map((k) => k + "=" + mem.discards[k]).join(", "));
    }
}

function memory() {
    if (!Memory.craft) Memory.craft = {};
    const mem = Memory.craft;
    if (!mem.candidates) mem.candidates = [];
    if (!mem.discards) mem.discards = {};
    if (!mem.active) mem.active = {};
    if (!mem.ledger) mem.ledger = { runs: [], products: {} };
    if (!mem.suspended) mem.suspended = {};
    return mem;
}

function ownedRooms() {
    return Object.keys(Game.rooms || {}).sort().map((name) => Game.rooms[name]).filter((room) =>
        room && room.controller && room.controller.my && room.storage && room.terminal);
}

// Material already promised to a running flip (it bought it to resell, or is
// about to) is not free stock; energy below the room's reserve floor is not
// either - the hauler would never feed it to a factory anyway.
function flipReserved(roomName, resourceType) {
    const active = (Memory.marketFlip && Memory.marketFlip.active) || {};
    const entry = active[resourceType];
    if (!entry || entry.room !== roomName) return 0;
    // The lock is short on purpose: a flip that has not sold within
    // craft.flipLockTicks failed to resell, and its material is plain stock.
    const since = entry.state === "selling" && typeof entry.sellStartTick === "number" ? entry.sellStartTick : entry.openedTick;
    const locked = typeof since !== "number" || Game.time - since < config.get("craft.flipLockTicks", 100);
    return locked ? entry.quantity || 0 : 0;
}

function energyReserve(room) {
    try { return resourceTiers.reserveFloor(room) || 0; } catch (error) { return 0; }
}

function stockOf(room, resourceType) {
    const total = ((room.storage && room.storage.store[resourceType]) || 0) +
        ((room.terminal && room.terminal.store[resourceType]) || 0);
    return Math.max(0, total - flipReserved(room.name, resourceType) - (resourceType === RESOURCE_ENERGY ? energyReserve(room) : 0));
}

// level >= 1 commodities need the factory set to that level by a power
// creep AND an active PWR_OPERATE_FACTORY effect - detected live, so this
// switches on by itself the day a power creep exists.
function operatorActive(factory, level) {
    if (typeof PWR_OPERATE_FACTORY === "undefined") return false;
    if (factory.level !== level) return false;
    return (factory.effects || []).some((e) => e.effect === PWR_OPERATE_FACTORY && e.ticksRemaining > 0);
}

function labPlanInfo(room) {
    const resolved = labSlots.resolve(room);
    return resolved && resolved.built.length >= 3 ? resolved : null;
}

// A manually pinned factoryProduct / labReaction is never overridden: only
// rooms (per structure kind) without a manual pin enter the planner.
function pinned(roomName, kind) {
    const mem = (Memory.rooms && Memory.rooms[roomName]) || {};
    return kind === "factory"
        ? !!(mem.factoryProduct && !mem.factoryProductAuto)
        : !!(mem.labReaction && !mem.labReactionAuto);
}

// Why this room cannot run this recipe at all, or null.
function viability(room, recipe) {
    if (craftChain.busyKinds(room.name)[recipe.kind]) return "busy";
    if (pinned(room.name, recipe.kind)) return "manual-pin";
    if (recipe.kind === "factory") {
        const factory = roomCache.structuresByType(room, STRUCTURE_FACTORY)[0];
        if (!factory) return "no-factory";
        const level = recipe.level || 0;
        if (level > 0) {
            if (factory.level !== level) return "factory-level";
            if (!operatorActive(factory, level)) return "no-operator";
        }
    } else if (!labPlanInfo(room)) {
        return "no-labs";
    }
    if (!census.creepsByRole(room.name, "hauler").length) return "no-hauler";
    return null;
}

function availableCredits() {
    const credits = Game.market && typeof Game.market.credits === "number" ? Game.market.credits : 0;
    return Math.max(0, credits - marketFlip.committed());
}

// Phase plans depend only on the shape of the chain (which products, which built
// labs), not on quantities, and the lot-size search evaluates the same chain up to
// a dozen times per product: memoize per scan.
let phaseMemo = {};
function phasePlan(product, steps, built) {
    // the batches are part of the key: the strategy is chosen by estimated time (ROADMAP 0116)
    const key = product + "|" + built.join(",") + "|" + steps.map((s) => s.product + ":" + s.batches).join(",");
    if (!(key in phaseMemo)) {
        const tree = labSlots.treeFromSteps(product, steps, marketPricing.recipeOf);
        phaseMemo[key] = tree ? labSlots.planPhases(tree, built, { work: labSlots.workFromSteps(steps, marketPricing.recipeOf) }) : null;
    }
    return phaseMemo[key];
}

function buildContext(room, snapshot) {
    const labInfo = labPlanInfo(room);
    const feeUnits = config.get("craft.deliveryEnergyPerUnit", 0.3);
    return {
        instant(resourceType) {
            const r = snapshot.resources[resourceType];
            return r ? { bid: r.currentBuy, ask: r.currentSell } : null;
        },
        stock: (resourceType) => stockOf(room, resourceType),
        canMake: (recipe) => !viability(room, recipe),
        // Wide mode: only the chain's FINAL lab step runs on several output labs (the
        // executor widens exactly that one); every earlier step keeps a single lab so
        // its product stays together for the next step. `fullSteps` is null for those.
        parallel(recipe, fullSteps) {
            if (recipe.kind !== "lab" || !labInfo || !fullSteps || !config.get("craft.wideLabs", true)) return 1;
            const phases = phasePlan(recipe.product, fullSteps, labInfo.built);
            if (!phases || !phases.ok) return 1;
            const last = phases.phases[phases.phases.length - 1];
            return Math.max(1, labSlots.finalOutputs(labInfo.built, last.inputs, last.out).length);
        },
        // ROADMAP 0115/0116: estimated production time of the chain's lab steps under the
        // strategy the lab plan picks for this room (waves of independent steps, or every step
        // wide); null = not a multi-step lab chain, the plain sum applies
        labTime(steps) {
            if (!labInfo) return null;
            const labSteps = steps.filter((s) => s.kind === "lab");
            if (labSteps.length < 2) return null;
            const plan = phasePlan(labSteps[labSteps.length - 1].product, steps, labInfo.built);
            return plan && plan.ok && typeof plan.T === "number" ? plan.T : null;
        },
        // energy fee for moving the traded units, at the energy ask
        feeCredits(plan, qty) {
            const energy = snapshot.resources[RESOURCE_ENERGY];
            const ask = energy && energy.currentSell;
            if (!(ask > 0)) return 0;
            let units = qty;
            Object.keys(plan.buys).forEach((k) => { units += plan.buys[k]; });
            return units * feeUnits * ask;
        },
        // a lab chain needs a phase plan on the labs actually built
        veto(plan) {
            if (!plan.steps.some((s) => s.kind === "lab")) return null;
            if (!labInfo) return "no-labs";
            const top = plan.steps[plan.steps.length - 1];
            const phases = phasePlan(top.product, plan.steps, labInfo.built);
            return phases && phases.ok ? null : "no-phase-plan";
        },
        extraTicks(plan) {
            if (!labInfo || !plan.steps.some((s) => s.kind === "lab")) return 0;
            const top = plan.steps[plan.steps.length - 1];
            const phases = phasePlan(top.product, plan.steps, labInfo.built);
            return phases && phases.ok ? phases.moves * config.get("craft.logisticsTicksPerMove", 50) : 0;
        },
    };
}

function productsFor(room) {
    const out = [];
    const maxLevel = config.get("craft.maxLevel", 1);
    if (roomCache.structuresByType(room, STRUCTURE_FACTORY).length && typeof COMMODITIES !== "undefined") {
        Object.keys(COMMODITIES).forEach((p) => {
            if ((COMMODITIES[p].level || 0) <= maxLevel) out.push(p);
        });
    }
    if (labPlanInfo(room) && typeof REACTIONS !== "undefined") {
        Object.keys(REACTIONS).forEach((a) => {
            Object.keys(REACTIONS[a]).forEach((b) => {
                if (out.indexOf(REACTIONS[a][b]) < 0) out.push(REACTIONS[a][b]);
            });
        });
    }
    return out;
}

function discard(mem, product, room, reason, detail) {
    const key = detail ? reason + ":" + detail : reason;
    mem.discards[key] = (mem.discards[key] || 0) + 1;
    if (mem.discardSample.length < 20) mem.discardSample.push({ room: room.name, product, reason: key });
}

// Size the lot: the largest one that fits (a) the per-chain CREDIT budget - the
// smaller of maxChainRatio of the balance and the absolute cap; only credits
// spent buying inputs count (own inputs cost opportunity, the delivery fee is
// energy) - and (b) the order books' depth. Depth failures (an input's ask, or
// the product's bid) halve the lot and retry; any other pre-costing rejection
// (no plan, no bid, room veto) cannot be fixed by size and is reported as itself.
function sizeLot(product, recipe, ctx, credits) {
    // the ceiling is divided by (1 + priceDriftReserve): the lot is sized below it so
    // craftChain.open() has room left to raise the purchase limits (see there)
    const budget = Math.min(credits * config.get("craft.maxChainRatio", 0.05), config.get("craft.maxCashAbsolute", 1000000)) /
        (1 + config.get("craft.priceDriftReserve", 0.15));
    let qty = Math.floor(config.get("craft.maxLotUnits", 3000) / recipe.amount) * recipe.amount;
    let last = null;
    const passes = config.get("craft.sizePasses", 12);
    const halve = () => Math.floor(qty / 2 / recipe.amount) * recipe.amount;
    for (let pass = 0; pass < passes && qty >= recipe.amount; pass++) {
        const verdict = last = marketPricing.evaluate(product, qty, ctx);
        if (verdict.cash === undefined) {
            const depth = verdict.reason === "sell-depth" || (verdict.reason === "no-plan" && /:liq-depth$/.test(verdict.detail || ""));
            if (!depth) return { verdict };
            qty = halve();
            continue;
        }
        if (verdict.spend <= budget) return { qty, verdict };
        qty = Math.floor((qty * budget / verdict.spend * 0.98) / recipe.amount) * recipe.amount;
    }
    return last && last.cash === undefined ? { verdict: last } : null;
}

function scanRoom(room, snapshot, mem, found) {
    const ctx = buildContext(room, snapshot);
    const credits = availableCredits();
    // labs that exist but cannot form a plan (too few, or not on the stamp):
    // say so once per room instead of silently never listing lab products
    if (roomCache.structuresByType(room, STRUCTURE_LAB).length && !labPlanInfo(room)) {
        discard(mem, "(labs)", room, "no-labs");
    }
    const busy = craftChain.busyKinds(room.name);
    productsFor(room).forEach((product) => {
        const recipe = marketPricing.recipeOf(product);
        if (!recipe) return;
        if (busy[recipe.kind]) return; // that structure already runs a chain: nothing to report
        const why = viability(room, recipe);
        if (why) { discard(mem, product, room, why); return; }
        const suspendedUntil = mem.suspended[product];
        if (config.get("craft.breakers", false) && suspendedUntil && Game.time < suspendedUntil) { discard(mem, product, room, "suspended"); return; }
        const sized = sizeLot(product, recipe, ctx, credits);
        if (!sized) { discard(mem, product, room, "credits"); return; }
        const verdict = sized.verdict;
        if (!verdict.plan) { discard(mem, product, room, verdict.reason, verdict.detail); return; }
        if (!sized.qty) { discard(mem, product, room, verdict.reason); return; }
        if (!verdict.ok) { discard(mem, product, room, verdict.reason); return; }
        if (verdict.profit < config.get("craft.minProfit", 5000)) { discard(mem, product, room, "min-profit"); return; }
        found.push({
            room: room.name, product, qty: sized.qty, cost: Math.round(verdict.cost), cash: Math.round(verdict.cash), spend: Math.round(verdict.spend),
            revenue: Math.round(verdict.revenue), profit: Math.round(verdict.profit),
            ratio: +verdict.ratio.toFixed(4), margin: +verdict.margin.toFixed(4), T: Math.round(verdict.T),
            steps: verdict.plan.steps.map((s) => ({ product: s.product, kind: s.kind, batches: s.batches })),
            buys: verdict.plan.buys, owns: verdict.plan.owns,
        });
    });
}

function scan() {
    const interval = Math.max(1, Number(config.get("craft.scanInterval", 300)) || 300);
    if (lastScanTick !== null && Game.time - lastScanTick < interval) return;
    if (Game.cpu && Game.cpu.bucket < config.get("craft.minBucket", 500)) return;
    const snapshot = market.snapshot();
    if (!snapshot) return; // market.js has not scanned yet
    phaseMemo = {};
    lastScanTick = Game.time;
    const mem = memory();
    mem.lastScanTick = Game.time;
    mem.discards = {};
    mem.discardSample = [];
    const found = [];
    ownedRooms().forEach((room) => {
        const taken = craftChain.busyKinds(room.name);
        if (taken.factory && taken.lab) return; // both structure kinds are taken
        scanRoom(room, snapshot, mem, found);
    });
    found.sort((a, b) => b.ratio - a.ratio || b.profit - a.profit);
    mem.candidates = found.slice(0, 10);
    logScan(mem);
    // Live mode only: open the best candidates, most profitable first, until
    // a safety cap says stop (craftChain.open re-checks every cap itself).
    if (!config.get("craft.test", true)) {
        mem.opened = [];
        // Inputs a chain is still BUYING (this scan's openings included): every
        // candidate was priced against the same order book, so a second chain on the
        // same input would count the cheap orders the first one is about to eat.
        // It waits for a later scan, which sees the book after that purchase.
        const buying = {};
        Object.keys(mem.active).forEach((k) => {
            const c = mem.active[k];
            if (c && c.state === "buying") Object.keys(c.buys || {}).forEach((r) => { buying[r] = k; });
        });
        for (const candidate of mem.candidates) {
            const room = Game.rooms[candidate.room];
            if (!room) continue;
            const clash = Object.keys(candidate.buys || {}).find((r) => buying[r]);
            if (clash) {
                discard(mem, candidate.product, room, "shared-input:" + clash);
                const key = "shared:" + candidate.room + ":" + candidate.product + ":" + clash + ":" + buying[clash];
                if (!openFailLogged[key]) {
                    openFailLogged[key] = true;
                    log("candidato " + candidate.room + " " + candidate.product + " x" + candidate.qty + " espera: " + clash +
                        " ja esta sendo comprado por " + buying[clash] + " (o livro so vale depois dessa compra)");
                }
                continue;
            }
            const result = craftChain.open(room, candidate);
            if (result.ok) {
                mem.opened.push(candidate.room + ":" + candidate.product);
                Object.keys(candidate.buys || {}).forEach((r) => { buying[r] = candidate.room + ":" + candidate.product; });
            }
            else if (result.reason === "room-busy") continue;
            else if (result.reason === "max-active") {
                // say once per set of running chains, not silently: a candidate
                // that never opens because the single slot is taken looks like a bug
                const running = Object.keys(mem.active).map((r) => r + ":" + mem.active[r].product + "(" + mem.active[r].state + ")").join(", ");
                const key = "max-active:" + Object.keys(mem.active).map((r) => mem.active[r].id).join(",");
                if (!openFailLogged[key]) {
                    openFailLogged[key] = true;
                    log("candidato " + candidate.room + " " + candidate.product + " x" + candidate.qty + " aguardando vaga: ja ha cadeia ativa [" + running + "] (craft.maxActive " + config.get("craft.maxActive", 0) + ")");
                }
                break;
            }
            else {
                discard(mem, candidate.product, room, "open-" + result.reason);
                const key = candidate.room + ":" + candidate.product + ":" + result.reason;
                if (!openFailLogged[key]) {
                    openFailLogged[key] = true;
                    log("nao abriu " + candidate.room + " " + candidate.product + " x" + candidate.qty + ": " + result.reason +
                        " (gasto em compras " + candidate.spend + ")");
                }
            }
        }
    }
}

// Chains advance on a grid (craft.tickInterval, default 10): their states move over
// hundreds to thousands of ticks (reactions, deals), so a step noticed up to 10 ticks late
// costs nothing, while advancing every chain every tick was ~0.3 CPU/tick (cpuTop 2026-10-03).
let lastChainTick = null;
function tick() {
    const chainInterval = config.get("craft.tickInterval", 10);
    if (chainInterval <= 1 || cadence.due(lastChainTick, chainInterval)) {
        lastChainTick = Game.time;
        cpuMeter.span("craft.chains", () => craftChain.tick());
    }
    const mem = memory();
    if (typeof mem.rescanAt === "number" && Game.time >= mem.rescanAt) {
        delete mem.rescanAt;
        lastScanTick = null;
    }
    cpuMeter.span("craft.scan", scan); // 0 most ticks; the scan's cost shows up as avg and max
}

global.craftStatus = () => {
    const mem = memory();
    return JSON.stringify({
        mode: config.get("craft.test", true) ? "test" : "live",
        lastScanTick: mem.lastScanTick || null,
        candidates: mem.candidates,
        discards: mem.discards,
        discardSample: mem.discardSample || [],
        active: mem.active,
        suspended: mem.suspended,
        ledger: mem.ledger.products,
        stats: mem.stats || null,
        stranded: mem.stranded || {},
        opened: mem.opened || [],
    }, null, 2);
};

// craftConfig()     -> only the craft.* values overridden in Memory.settings
// craftConfig(true) -> every craft.* value (effective value, default, overridden?)
global.craftConfig = (all) => {
    const defaults = config.defaults.craft || {};
    const overrides = (Memory.settings && Memory.settings.craft) || {};
    const out = {};
    Object.keys(defaults).concat(Object.keys(overrides)).forEach((key) => {
        if (key in out) return;
        const overridden = overrides[key] !== undefined;
        if (!all && !overridden) return;
        out[key] = { value: config.get("craft." + key), default: defaults[key], overridden };
    });
    return JSON.stringify(out, null, 2);
};

// Forces a scan on the next tick instead of waiting for craft.scanInterval.
// The CPU bucket gate still applies (a scan below craft.minBucket is skipped,
// and runs as soon as the bucket recovers), so say so up front.
global.craftScan = () => {
    memory().rescanAt = Game.time;
    const bucket = Game.cpu && Game.cpu.bucket, min = config.get("craft.minBucket", 500);
    const message = typeof bucket === "number" && bucket < min
        ? "bucket " + bucket + " abaixo de craft.minBucket " + min + " - o scan roda assim que o bucket passar disso"
        : "scan forçado no próximo tick (resultado em craftStatus() e no log)";
    console.log("[craft] " + message);
    return message;
};

// Rebuilds, with the current lab strategy, the steps of running lab chains that have not
// started yet (chains opened before the wide strategy keep their old queue). One room or all.
global.craftReplan = (roomName) => {
    const lines = craftChain.replan(roomName);
    const text = lines.length ? lines.join(String.fromCharCode(10)) : "nenhuma cadeia de lab ativa" + (roomName ? " em " + roomName : "");
    console.log("[craft] replan: " + text);
    return text;
};

global.craftCancel = (roomName) => {
    const ok = craftChain.cancelRoom(roomName);
    console.log(ok ? "[craft] cadeia de " + roomName + " cancelada" : "[craft] " + roomName + " nao tem cadeia ativa");
    return ok;
};

module.exports = { tick, scan, resetLog() { lastLogSignature = null; scansSinceDiscardLog = 0; Object.keys(openFailLogged).forEach((k) => delete openFailLogged[k]); }, viability, operatorActive, buildContext, productsFor, memory, resetScan() { lastScanTick = null; } };
