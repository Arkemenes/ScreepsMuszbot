// ROADMAP 0111 phase 6: executes ONE chain the planner picked. State machine
//   buying -> working (one queue item at a time) -> selling -> done
// with a stall guard on every state, and abort() that never loses material:
// bought inputs simply stay in storage as own stock (the planner reuses them
// at opportunity cost; strandedSweep() sells what is still unused after
// craft.retentionTicks). The hauler and structures/factory.js|lab.js only
// execute: this module sets Memory.rooms[r].factoryProduct / labReaction (marked
// *Auto so a manual pin is never touched) and the hauler does the carrying.
// Capacity, not a counter, limits parallelism (user request, 2026-10-02): a room
// runs at most one chain per STRUCTURE KIND ("factory", "lab") at a time, so its
// factory and its labs work side by side, and rooms are independent of each
// other. A chain occupies every kind its steps use for its whole life; the
// shared per-room flags are only ever cleared for the kind (and product) that
// chain owns. craft.maxActive > 0 still adds a global cap if one is wanted.
// Lab phases follow labSlots.planPhases: an intermediate that the next phase
// consumes in place stays in its lab (reaction.keep stops the hauler draining
// it, labLoad protects it from the transient drain); only a "park" phase
// routes its product through storage. The final product is SOLD AS IT COMES OUT
// (partialSales, user request 2026-10-02): the sooner it is sold, the shorter the
// price risk. Product goes to storage and a sell op at the break-even floor takes
// it to the terminal itself; it is NOT delivered straight to the terminal, because
// terminalOps sweeps any terminal stock no operation claims back to storage.
const config = require("./config");
const roomCache = require("./roomCache");
const market = require("./market");
const marketPricing = require("./marketPricing");
const marketFlip = require("./marketFlip");
const terminalOps = require("./terminalOps");
const labSlots = require("./labSlots");

const FINAL = ["completed", "failed", "cancelled"];

function log(message) {
    if (config.get("craft.log", true)) console.log("[craft] " + message);
}

function craft() {
    if (!Memory.craft) Memory.craft = {};
    const mem = Memory.craft;
    if (!mem.active) mem.active = {};
    if (!mem.suspended) mem.suspended = {};
    if (!mem.stranded) mem.stranded = {};
    if (!mem.ledger) mem.ledger = { runs: [], products: {} };
    if (!mem.stats) mem.stats = { completed: 0, aborted: 0, profit: 0 };
    return mem;
}

function roomMem(roomName) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    return Memory.rooms[roomName];
}

function snapshotResource(resourceType) {
    const snapshot = market.snapshot();
    return snapshot && snapshot.resources && snapshot.resources[resourceType];
}

// product units sitting anywhere the chain can see (storage, terminal,
// factory, labs) - progress is measured against a baseline taken at item start
function stockAnywhere(room, resourceType) {
    let sum = 0;
    [room.storage, room.terminal].forEach((s) => { if (s && s.store) sum += s.store[resourceType] || 0; });
    roomCache.structuresByType(room, STRUCTURE_FACTORY).forEach((s) => { sum += (s.store && s.store[resourceType]) || 0; });
    roomCache.structuresByType(room, STRUCTURE_LAB).forEach((s) => { sum += (s.store && s.store[resourceType]) || 0; });
    return sum;
}

function opState(id) {
    const op = id && terminalOps.operation(id);
    return op || null;
}

// --- flags the hauler/structures read ---------------------------------------
// kind: "factory" | "lab" clears only that structure's flags (omitted = both);
// product: directToTerminal is a single per-room field, so it is cleared only by
// the chain that set it (omitted = unconditionally).
function clearFlags(roomName, kind, product) {
    const mem = roomMem(roomName);
    if (!kind || kind === "factory") {
        if (mem.factoryProductAuto) { delete mem.factoryProduct; delete mem.factoryProductAuto; delete mem.factoryEnergy; }
    }
    if (!kind || kind === "lab") {
        if (mem.labReactionAuto) { delete mem.labReaction; delete mem.labReactions; delete mem.labReactionAuto; }
        if (mem.labLoadAuto) { delete mem.labLoad; delete mem.labLoadAuto; }
    }
    if (!product || mem.directToTerminal === product) delete mem.directToTerminal;
}

// Which structure kinds a chain uses. Chains stored before this existed have no
// `kinds`, so derive it from the queue.
function kindsOf(chain) {
    if (chain.kinds) return chain.kinds;
    const seen = {};
    (chain.queue || []).forEach((item) => { seen[item.kind] = true; });
    return Object.keys(seen).sort();
}

function chainRoomOf(chain, key) {
    return chain.room || String(key).split(":")[0];
}

// {factory: bool, lab: bool} - kinds already taken by a running chain in the room.
function busyKinds(roomName) {
    const busy = { factory: false, lab: false };
    const active = craft().active;
    Object.keys(active).forEach((key) => {
        const chain = active[key];
        if (!chain || chainRoomOf(chain, key) !== roomName) return;
        kindsOf(chain).forEach((kind) => { busy[kind] = true; });
    });
    return busy;
}

function clearChainFlags(chain) {
    const kinds = kindsOf(chain);
    if (!kinds.length) { clearFlags(chain.room, undefined, chain.product); return; }
    kinds.forEach((kind) => clearFlags(chain.room, kind, chain.product));
}

// Labs holding an intermediate for a later phase are protected from the
// transient drain while the chain runs (transientStock reads mem.labLoad).
function syncHolds(roomName, chain) {
    const mem = roomMem(roomName);
    const ids = Object.keys(chain.holds || {});
    if (!ids.length) {
        if (mem.labLoadAuto) { delete mem.labLoad; delete mem.labLoadAuto; }
        return;
    }
    mem.labLoad = {};
    ids.forEach((id) => { mem.labLoad[id] = [chain.holds[id]]; });
    mem.labLoadAuto = true;
}

// kinds: only those structures count (omitted = either). A manual factory pin
// must not block lab chains, and the other way round.
function manualPin(roomName, kinds) {
    const mem = roomMem(roomName);
    const has = (kind) => !kinds || kinds.indexOf(kind) >= 0;
    return !!((has("factory") && mem.factoryProduct && !mem.factoryProductAuto) ||
        (has("lab") && mem.labReaction && !mem.labReactionAuto));
}

// --- queue -------------------------------------------------------------------
// One item per production step, in dependency order (planNode builds steps
// children-first). Lab steps take their slots from labSlots.planPhases.
function buildQueue(room, candidate) {
    const steps = candidate.steps;
    const labSteps = steps.filter((s) => s.kind === "lab");
    const phaseByProduct = {};
    // ROADMAP 0116: "wide" strategy = every step on the labs that reach the centre pair, one
    // after the other, each product handed to the next step through storage (nothing stays in
    // place). The planner picked it by estimated time with these same inputs.
    let wideStrategy = false;
    if (labSteps.length) {
        const resolved = labSlots.resolve(room);
        if (!resolved) return null;
        const top = labSteps[labSteps.length - 1];
        const tree = labSlots.treeFromSteps(top.product, steps, marketPricing.recipeOf);
        const plan = tree && labSlots.planPhases(tree, resolved.built, { work: labSlots.workFromSteps(steps, marketPricing.recipeOf) });
        if (!plan || !plan.ok || plan.phases.length !== labSteps.length) return null;
        wideStrategy = plan.strategy === "wide";
        plan.phases.forEach((phase) => { phaseByProduct[phase.product] = { phase, ids: resolved.ids, built: resolved.built }; });
    }
    // Which phases leave their product in place for the next one: all but the
    // last lab step, unless the planner parked it (storage round trip).
    const lastLab = labSteps.length ? labSteps[labSteps.length - 1].product : null;
    const heldSlots = {};
    const queue = [];
    for (const step of steps) {
        const recipe = marketPricing.recipeOf(step.product);
        if (!recipe) return null;
        const target = step.batches * recipe.amount;
        if (step.kind === "factory") {
            queue.push({ kind: "factory", product: step.product, target, energy: step.batches * (recipe.components[RESOURCE_ENERGY] || 0) });
        } else {
            const hit = phaseByProduct[step.product];
            if (!hit) return null;
            const reagents = Object.keys(recipe.components);
            const ids = hit.phase.inputs.map((slot) => hit.ids[slot]);
            const output = hit.ids[hit.phase.out];
            if (reagents.length !== 2 || ids.some((id) => !id) || !output) return null;
            const parked = hit.phase.ops.some((o) => o.op === "park");
            const keep = !wideStrategy && step.product !== lastLab && !parked;
            const consumes = hit.phase.inputs.filter((slot) => heldSlots[slot]).map((slot) => hit.ids[slot]);
            hit.phase.inputs.forEach((slot) => { delete heldSlots[slot]; });
            if (keep) heldSlots[hit.phase.out] = true;
            // The LAST lab step runs wide (every lab that reaches both inputs reacts);
            // earlier steps keep a single output so their product stays in one lab
            // for the next step. craft.wideLabs false turns this off.
            const outputs = (wideStrategy || step.product === lastLab) && config.get("craft.wideLabs", true)
                ? labSlots.finalOutputs(hit.built, hit.phase.inputs, hit.phase.out).map((slot) => hit.ids[slot]).filter(Boolean)
                : [output];
            queue.push({ kind: "lab", product: step.product, target, a: reagents[0], b: reagents[1], input1: ids[0], input2: ids[1], output, outputs, keep, consumes, wave: hit.phase.wave });
        }
    }
    queue.strategy = wideStrategy ? "wide" : "waves"; // plain property: dropped when the chain is stored
    // ROADMAP 0115: inside a run of consecutive lab steps the independent ones (same wave)
    // sit next to each other, so the executor can start them together. Children always
    // have a lower wave than their parent, so dependency order is kept.
    for (let i = 0; i < queue.length;) {
        if (queue[i].kind !== "lab") { i++; continue; }
        let j = i;
        while (j < queue.length && queue[j].kind === "lab") j++;
        const run = queue.slice(i, j).map((item, n) => ({ item, n }));
        run.sort((x, y) => (x.item.wave - y.item.wave) || (x.n - y.n));
        run.forEach((entry, n) => { queue[i + n] = entry.item; });
        i = j;
    }
    return queue;
}

// The queue items that run together: consecutive lab items of one wave (ROADMAP 0115).
// Chains stored before waves existed carry no `wave`, so each item is its own group.
function groupAt(chain, qi) {
    const first = chain.queue[qi];
    const group = first ? [first] : [];
    if (first && first.kind === "lab" && first.wave !== undefined) {
        for (let i = qi + 1; i < chain.queue.length; i++) {
            const item = chain.queue[i];
            if (item.kind === "lab" && item.wave === first.wave) group.push(item); else break;
        }
    }
    return group;
}

function reactionOf(item) {
    const reaction = { a: item.a, b: item.b, product: item.product, output: item.output, input1: item.input1, input2: item.input2 };
    if (item.outputs && item.outputs.length > 1) reaction.outputs = item.outputs.slice();
    if (item.keep) reaction.keep = true;
    return reaction;
}

// A lab may start a phase empty or already holding exactly what that phase
// expects there (a reagent, or the intermediate kept in place); any other
// mineral must be drained first.
function labsClear(expected) {
    return Object.keys(expected).every((id) => {
        const lab = Game.getObjectById(id);
        return !lab || !lab.store || !lab.mineralType || lab.mineralType === expected[id];
    });
}

// --- opening -----------------------------------------------------------------
function activeCount() { return Object.keys(craft().active).length; }

function open(room, candidate) {
    const mem = craft();
    const kinds = Array.from(new Set((candidate.steps || []).map((step) => step.kind))).sort();
    const busy = busyKinds(room.name);
    if (kinds.some((kind) => busy[kind])) return { ok: false, reason: "room-busy" };
    const cap = config.get("craft.maxActive", 0);
    if (cap > 0 && activeCount() >= cap) return { ok: false, reason: "max-active" };
    if (manualPin(room.name, kinds)) return { ok: false, reason: "manual-pin" };
    // credits that actually leave the balance (purchases); the delivery fee is
    // energy and own inputs are opportunity cost - neither counts against caps
    const spend = candidate.spend;
    if (spend > config.get("craft.maxCashAbsolute", 1000000)) return { ok: false, reason: "cash-cap" };
    const credits = Game.market && typeof Game.market.credits === "number" ? Game.market.credits : 0;
    if (marketFlip.committed() + spend > credits * config.get("craft.maxCommittedRatio", 0.25)) {
        return { ok: false, reason: "committed-cap" };
    }
    const queue = buildQueue(room, candidate);
    if (!queue) return { ok: false, reason: "no-queue" };
    // Pre-flight is the planner's verdict from this same scan; every input is
    // bought up front. Each purchase's price LIMIT is the chain's own break-even,
    // not the ask plus a fixed 2%: the chain's headroom (revenue / (1 + margin)
    // - cost) is shared between the bought inputs, only craft.buyHeadroomUse of
    // it is used, and a limit never exceeds craft.maxBuyPremium over the ask. The
    // headroom is also clamped so that the planned spend plus everything the
    // limits could add never passes maxCashAbsolute or the committed-credits cap,
    // and that worst case is what gets reserved.
    const buyKeys = Object.keys(candidate.buys);
    const quotes = {};
    for (const resourceType of buyKeys) {
        const qty = Math.ceil(candidate.buys[resourceType]);
        const res = snapshotResource(resourceType);
        const ask = res && marketPricing.conservativeAsk(resourceType, res.currentSell);
        if (!(ask > 0) || qty <= 0) return { ok: false, reason: "no-quote:" + resourceType };
        quotes[resourceType] = { ask, qty };
    }
    const slack = config.get("craft.buySlack", 0.02);
    const slackCost = buyKeys.reduce((sum, r) => sum + quotes[r].ask * quotes[r].qty * slack, 0);
    const headroom = Math.max(0, candidate.revenue / (1 + candidate.margin) - candidate.cost);
    const cashRoom = config.get("craft.maxCashAbsolute", 1000000) - spend - slackCost;
    const chainRoom = credits * config.get("craft.maxChainRatio", 0.05) - spend - slackCost;
    const committedRoom = credits * config.get("craft.maxCommittedRatio", 0.25) - marketFlip.committed() - spend - slackCost;
    const allowance = Math.max(0, Math.min(headroom * config.get("craft.buyHeadroomUse", 0.5), cashRoom, chainRoom, committedRoom));
    const premium = config.get("craft.maxBuyPremium", 0.5);
    const limits = {};
    let overpay = 0;
    buyKeys.forEach((r) => {
        const q = quotes[r];
        const raw = q.ask * (1 + slack) + allowance / buyKeys.length / q.qty;
        limits[r] = Math.max(q.ask * (1 + slack), Math.min(raw, q.ask * (1 + premium)));
        overpay += q.qty * (limits[r] - q.ask);
    });
    const buys = {};
    const placed = [];
    for (const resourceType of buyKeys) {
        const q = quotes[resourceType];
        const attempt = terminalOps.buy(room.name, resourceType, q.qty, limits[resourceType], false, true);
        if (!attempt.ok) { placed.forEach((id) => terminalOps.cancel(id)); return { ok: false, reason: "buy-refused:" + resourceType }; }
        placed.push(attempt.id);
        buys[resourceType] = { opId: attempt.id, qty: q.qty, limit: limits[resourceType] };
    }
    const reserve = spend + overpay;
    marketFlip.commit(reserve);
    // first chain of a room keeps the plain room name as its key; a second one
    // (the other structure kind) gets the kinds appended
    const key = mem.active[room.name] ? room.name + ":" + kinds.join("+") : room.name;
    mem.active[key] = {
        id: room.name + "-" + Game.time, key, kinds, room: room.name, product: candidate.product, qty: candidate.qty,
        openedTick: Game.time, state: Object.keys(buys).length ? "buying" : "working", stateTick: Game.time,
        queue, qi: 0, buys, reserved: reserve,
        est: { cash: candidate.cash, spend, cost: candidate.cost, revenue: candidate.revenue, profit: candidate.profit, floor: candidate.cost / candidate.qty },
        ownCost: Math.max(0, candidate.cost - candidate.cash),
        holds: {},
    };
    log(room.name + " abriu " + candidate.product + " x" + candidate.qty + ": compra " +
        (Object.keys(buys).map((k) => k + " x" + buys[k].qty + " (limite " + buys[k].limit.toFixed(1) + ")").join(", ") || "nada (so estoque proprio)") +
        ", gasto " + Math.round(spend) + ", custo " + Math.round(candidate.cost) + ", lucro estimado +" + Math.round(candidate.profit) +
        " (" + (candidate.ratio * 100).toFixed(1) + "%, T=" + candidate.T + ")");
    return { ok: true };
}

// --- advancing -----------------------------------------------------------------
// Shrinks every step of the chain to the fraction of the inputs that actually
// arrived (whole batches only); false if a step would drop below one batch.
function scaleChain(chain, fraction, limiting) {
    const scaled = chain.queue.map((item) => {
        const recipe = marketPricing.recipeOf(item.product);
        if (!recipe) return null;
        const batches = Math.floor((item.target / recipe.amount) * fraction);
        if (batches < 1) return null;
        return { item, target: batches * recipe.amount, energy: batches * (recipe.components[RESOURCE_ENERGY] || 0) };
    });
    if (scaled.some((entry) => !entry)) return false;
    scaled.forEach((entry) => {
        entry.item.target = entry.target;
        if (entry.item.kind === "factory") entry.item.energy = entry.energy;
    });
    // the credits that did not get spent go back to the shared budget at once
    const release = chain.reserved * (1 - fraction);
    marketFlip.release(release);
    chain.reserved -= release;
    chain.qty = Math.max(1, Math.floor(chain.qty * fraction));
    chain.est.profit *= fraction; chain.est.cost *= fraction; chain.est.revenue *= fraction;
    chain.scaled = fraction; // the unit break-even floor stays the same
    log(chain.room + " " + chain.product + ": compra de " + limiting + " preenchida " + Math.round(fraction * 100) +
        "% - cadeia reduzida para " + chain.qty + " (o resto fica para o proximo lote)");
    return true;
}

function setState(chain, state) { chain.state = state; chain.stateTick = Game.time; }

function startItem(room, chain) {
    // ROADMAP 0115: the whole wave starts together (a group of one for everything else)
    const group = groupAt(chain, chain.qi);
    const item = group[0];
    const mem = roomMem(room.name);
    if (group.every((it) => it.started)) return true;
    if (item.kind === "lab") {
        // drain barrier: with no reaction set the hauler drains every lab, so
        // the slots start empty (a lab holds one mineral type only)
        delete mem.labReaction; delete mem.labReactions; delete mem.labReactionAuto;
        syncHolds(room.name, chain);
        // every lab of every step starts empty or already holding what that step expects
        // there (a lab holds one mineral type): reagents in the inputs, product in the outputs
        const expected = {};
        group.forEach((it) => {
            expected[it.input1] = it.a;
            expected[it.input2] = it.b;
            (it.outputs && it.outputs.length ? it.outputs : [it.output]).forEach((id) => { expected[id] = it.product; });
        });
        if (!labsClear(expected)) return false;
        if (group.length === 1) mem.labReaction = reactionOf(item);
        else mem.labReactions = group.map(reactionOf);
        mem.labReactionAuto = true;
    } else {
        mem.factoryProduct = item.product;
        mem.factoryProductAuto = true;
        mem.factoryEnergy = item.energy;
    }
    group.forEach((it) => {
        it.base = stockAnywhere(room, it.product);
        it.started = true;
        it.startTick = Game.time;
    });
    return true;
}

// Units of the item's product made so far: what is in stock beyond the baseline,
// plus what the chain has already sold on the way (partial sales).
function madeSoFar(room, chain, item) {
    return stockAnywhere(room, item.product) - item.base + (item.product === chain.product ? chain.sold || 0 : 0);
}

function itemDone(room, item, chain) {
    return madeSoFar(room, chain, item) >= item.target;
}

function eventsSince(roomName, resourceType, kind, tick) {
    const events = (Memory.terminalOps && Memory.terminalOps.events) || [];
    return events.filter((e) => e.room === roomName && e.resourceType === resourceType && e.kind === kind && e.tick >= tick);
}

function realized(chain, room) {
    const energy = snapshotResource(RESOURCE_ENERGY);
    const energyAsk = (energy && energy.currentSell) || 0;
    let revenue = 0, spent = 0, energyUnits = 0;
    eventsSince(chain.room, chain.product, "sell", chain.firstSaleTick || chain.sellStart || chain.openedTick).forEach((e) => { revenue += e.credits; energyUnits += e.transactionEnergy || 0; });
    Object.keys(chain.buys).forEach((resourceType) => {
        eventsSince(chain.room, resourceType, "buy", chain.openedTick).forEach((e) => { spent += -e.credits; energyUnits += e.transactionEnergy || 0; });
    });
    return revenue - spent - energyUnits * energyAsk - chain.ownCost;
}

// Unit price below which the product is never sold (user request 2026-10-02: always
// sell at a profit). Every cost of the operation, counted as it really happened:
// credits and energy fee of the purchases (from the trade events, summed once when
// the buying ends), the own stock / energy at its opportunity cost, and the energy
// fee of the SALE at its worst case (a send costs at most 1 energy per unit, whatever
// the buyer's distance - terminalOps does not cap it for chains). The listing's 5%
// market fee is added by terminalOps itself (it lists at floor / 0.95). On top comes
// craft.minSaleMargin, the reward for the operation. While still buying, the
// planner's estimate stands in for the actual numbers.
function saleFloor(chain) {
    const margin = config.get("craft.minSaleMargin", 0.01);
    const energy = snapshotResource(RESOURCE_ENERGY);
    const energyAsk = (energy && energy.currentSell) || 0;
    const saleEnergy = config.get("craft.saleEnergyPerUnit", 1);
    const units = Math.max(1, chain.produced || chain.qty);
    let cost;
    if (chain.state === "buying") {
        const planned = config.get("craft.deliveryEnergyPerUnit", 0.3);
        cost = chain.est.cost + chain.qty * Math.max(0, saleEnergy - planned) * energyAsk;
    } else {
        if (!chain.buyCost) {
            const tally = { credits: 0, energy: 0 };
            Object.keys(chain.buys).forEach((resourceType) => {
                eventsSince(chain.room, resourceType, "buy", chain.openedTick).forEach((e) => {
                    tally.credits += -e.credits;
                    tally.energy += e.transactionEnergy || 0;
                });
            });
            chain.buyCost = tally;
        }
        cost = chain.buyCost.credits + (chain.buyCost.energy + units * saleEnergy) * energyAsk + chain.ownCost;
    }
    return cost / units * (1 + margin);
}

function recordRun(chain, profit, extra) {
    const mem = craft();
    const keep = config.get("craft.ledgerKeep", 20);
    const run = Object.assign({ tick: Game.time, product: chain.product, room: chain.room, estimated: Math.round(chain.est.profit), profit: Math.round(profit) }, extra || {});
    mem.ledger.runs.push(run);
    if (mem.ledger.runs.length > keep) mem.ledger.runs.shift();
    const entry = mem.ledger.products[chain.product] || (mem.ledger.products[chain.product] = { runs: 0, profit: 0, last: [] });
    entry.runs++; entry.profit += run.profit;
    entry.last.push(run.profit);
    if (entry.last.length > config.get("craft.productLosses", 3)) entry.last.shift();
    // breakers: N losses in a row suspend the product; a net-negative global
    // window puts the whole planner back into test mode
    if (!config.get("craft.breakers", false)) return;
    const n = config.get("craft.productLosses", 3);
    if (entry.last.length >= n && entry.last.every((p) => p < 0)) {
        mem.suspended[chain.product] = Game.time + config.get("craft.suspendTicks", 86400);
        entry.last = [];
        console.log("[craft] " + chain.product + " suspenso: " + n + " execucoes negativas seguidas");
    }
    const window = mem.ledger.runs.slice(-config.get("craft.globalRuns", 10));
    if (window.length >= config.get("craft.globalRuns", 10) && window.reduce((sum, r) => sum + r.profit, 0) < 0) {
        if (!Memory.settings) Memory.settings = {};
        Memory.settings.craft = Object.assign(Memory.settings.craft || {}, { test: true });
        console.log("[craft] lucro liquido negativo nas ultimas " + window.length + " execucoes - planner de volta ao modo test");
    }
}

function finish(chain, room, profit, extra) {
    const mem = craft();
    log(chain.room + " " + chain.product + " concluida: lucro real " + Math.round(profit) + " (estimado " + Math.round(chain.est.profit) + ")");
    marketFlip.release(chain.reserved);
    clearChainFlags(chain);
    delete mem.active[chain.key || chain.room];
    mem.stats.completed++;
    mem.stats.profit += profit;
    // the lot is sold: let the planner pick the next one on the next tick
    // instead of waiting up to craft.scanInterval (only after a SUCCESSFUL
    // lot - an abort never retriggers itself)
    mem.rescanAt = Game.time + 1;
    recordRun(chain, profit, extra);
}

function abort(chain, room, reason) {
    const mem = craft();
    // cancel whatever is still in flight; delivered inputs stay as own stock
    Object.keys(chain.buys).forEach((resourceType) => {
        const op = opState(chain.buys[resourceType].opId);
        if (op && FINAL.indexOf(op.state) < 0) terminalOps.cancel(op.id);
    });
    if (chain.sellOpId) {
        const op = opState(chain.sellOpId);
        if (op && FINAL.indexOf(op.state) < 0) terminalOps.cancel(op.id);
    }
    if (chain.partialOpId) {
        const op = opState(chain.partialOpId);
        if (op && FINAL.indexOf(op.state) < 0) terminalOps.cancel(op.id);
    }
    marketFlip.release(chain.reserved);
    clearChainFlags(chain);
    delete mem.active[chain.key || chain.room];
    mem.stats.aborted++;
    const items = {};
    Object.keys(chain.buys).forEach((resourceType) => { items[resourceType] = chain.buys[resourceType].qty; });
    const spent = chain.est.spend;
    mem.stranded[chain.room + "-" + Game.time] = { room: chain.room, tick: Game.time, product: chain.product, items, spent };
    recordRun(chain, 0, { aborted: reason });
    log(chain.room + " " + chain.product + " abortado (" + reason + ") - insumos ficam em estoque");
}

// --- partial sales ---------------------------------------------------------------
// While the chain's FINAL item is still being produced, sell what is already in
// storage/terminal instead of waiting for the whole lot. Same rules as the final
// sale: instant (no listing), never below the break-even floor, and an order is
// only opened while the current bid is at or above that floor (so none sits
// waiting to be filled). One order at a time - terminalOps takes a single sell per
// room and resource. Product still in a lab is not sold (it has to be carried to
// storage first); the rest is picked up by the normal selling state.
function partialSales(chain, room, item) {
    if (chain.partialOpId) {
        const op = opState(chain.partialOpId);
        if (!op || FINAL.indexOf(op.state) >= 0) {
            chain.soldBase = (chain.soldBase || 0) + (op ? op.dealtAmount || 0 : chain.partialDealt || 0);
            chain.partialOpId = null;
            chain.partialDealt = 0;
        } else {
            chain.partialDealt = op.dealtAmount || 0;
        }
    }
    chain.sold = (chain.soldBase || 0) + (chain.partialDealt || 0);
    if (!config.get("craft.partialSales", true) || item.product !== chain.product || chain.partialOpId) return;
    const product = chain.product;
    const reach = ((room.storage && room.storage.store[product]) || 0) + ((room.terminal && room.terminal.store[product]) || 0);
    const unsold = Math.max(0, stockAnywhere(room, product) - item.base);
    const sellable = Math.min(unsold, reach);
    const lot = Math.max(1, Math.ceil(item.target * config.get("craft.minPartialSellRatio", 0.1)));
    if (sellable < lot) return;
    const res = snapshotResource(chain.product);
    const floor = saleFloor(chain);
    if (!(res && res.currentBuy >= floor)) return; // never below the profit floor, and do not park an order that cannot fill
    if (chain.sellRetryTick > Game.time) return;
    const attempt = terminalOps.sell(chain.room, product, Math.floor(sellable), floor, false, true);
    if (!attempt.ok) { chain.sellRetryTick = Game.time + config.get("craft.sellRetryTicks", 25); return; }
    chain.partialOpId = attempt.id;
    chain.firstSaleTick = chain.firstSaleTick || Game.time;
    log(chain.room + " " + product + ": vendendo " + Math.floor(sellable) + " ja produzidos (piso " + floor.toFixed(2) +
        ", vendido " + chain.sold + "/" + item.target + ")");
}

// Production is over: stop the order in flight (its trades are kept) and let the
// normal selling state handle whatever is left, holding / listing at the floor.
function finishPartials(chain) {
    if (!chain.partialOpId) return;
    const op = opState(chain.partialOpId);
    if (op && FINAL.indexOf(op.state) < 0) terminalOps.cancel(op.id);
    chain.soldBase = (chain.soldBase || 0) + ((op && op.dealtAmount) || chain.partialDealt || 0);
    chain.partialOpId = null;
    chain.partialDealt = 0;
    chain.sold = chain.soldBase;
}

function advance(chain, room) {
    // The stall guard measures PROGRESS, not time in the state: a long lab
    // reaction (XLH2O is ~12000 ticks on one output lab) legitimately stays in
    // "working" far longer than craft.stallTicks while its product keeps
    // accumulating. Any new output resets the clock; only a chain that stops
    // producing for stallTicks is aborted.
    if (chain.state === "working") {
        groupAt(chain, chain.qi).forEach((current) => {
            if (!current.started || current.finished) return;
            const made = madeSoFar(room, chain, current);
            if (made > (current.progress || 0)) {
                current.progress = made;
                chain.stateTick = Game.time;
            }
        });
    }
    if (Game.time - chain.stateTick > config.get("craft.stallTicks", 3000) && chain.state !== "selling") {
        abort(chain, room, "stall:" + chain.state);
        return;
    }
    if (chain.state === "buying") {
        let pending = false, fill = 1, limiting = null;
        for (const resourceType of Object.keys(chain.buys)) {
            const entry = chain.buys[resourceType];
            const op = opState(entry.opId);
            const dealt = (op && op.dealtAmount) || 0;
            let final = !!op && FINAL.indexOf(op.state) >= 0;
            // An order without a listing never closes by itself once the book runs
            // out: it sits in "waiting" for a new eligible order, and the whole chain
            // (every reagent already in storage) waits with it until the stall guard
            // aborts it. One that has already traded something and then shows no new
            // trade for buyPatienceTicks is cut short and handled as a partial fill
            // below; one that has traded nothing keeps waiting (nothing to build on).
            if (op && !final) {
                if (dealt > (entry.dealt || 0)) { entry.dealt = dealt; entry.progressTick = Game.time; }
                const idle = Game.time - (entry.progressTick || chain.openedTick);
                if (dealt > 0 && idle >= config.get("craft.buyPatienceTicks", 300)) {
                    terminalOps.cancel(op.id);
                    final = true;
                    log(chain.room + " " + chain.product + ": compra de " + resourceType + " parou em " + dealt + "/" + entry.qty +
                        " ha " + idle + " ticks sem novo negocio - seguindo com o que chegou");
                } else if (dealt <= 0 && idle >= config.get("craft.buyIdleAbortTicks", 900)) {
                    // nothing traded at all: nothing to build on, and every other input
                    // is already paid for. Give the credits back instead of waiting
                    // for the 3000-tick stall guard.
                    abort(chain, room, "buy-idle:" + resourceType);
                    return;
                }
            }
            // an order that closed without trading anything is a real failure
            if (!op || (final && op.state !== "completed" && dealt <= 0)) { abort(chain, room, "buy-failed:" + resourceType); return; }
            if (!final) { pending = true; continue; }
            const ratio = Math.min(1, dealt / chain.buys[resourceType].qty);
            if (ratio < fill) { fill = ratio; limiting = resourceType; }
        }
        if (pending) return;
        // A purchase that filled only part of the order (the book ran out) is
        // not a failure: carry on with what arrived, scaled down; whatever was
        // bought beyond that stays in storage as stock for the next lot.
        if (fill < 0.98) {
            if (fill < config.get("craft.minPartialRatio", 0.3) || !scaleChain(chain, fill, limiting)) {
                abort(chain, room, "partial-buy:" + limiting);
                return;
            }
        }
        setState(chain, "working"); // and start the first item this same tick
    }
    if (chain.state === "working") {
        const group = groupAt(chain, chain.qi);
        const item = group[group.length - 1];
        if (!startItem(room, chain)) return;
        // Each step of the wave is closed as soon as ITS product is there: its holds are
        // set and, while others still run, its reaction leaves the list at once (the hauler
        // must not stock the inputs of a step that is already done).
        group.forEach((it) => {
            partialSales(chain, room, it);
            if (it.finished || !itemDone(room, it, chain)) return;
            it.finished = true;
            (it.consumes || []).forEach((id) => { delete chain.holds[id]; });
            if (it.keep) chain.holds[it.output] = it.product;
            log(chain.room + " " + chain.product + ": etapa " + it.product + " concluida (" + (chain.queue.indexOf(it) + 1) + "/" + chain.queue.length + ")");
        });
        if (!group.every((it) => it.finished)) {
            const mem = roomMem(chain.room);
            if (Array.isArray(mem.labReactions)) {
                mem.labReactions = mem.labReactions.filter((r) => !group.some((it) => it.finished && it.product === r.product));
            }
            syncHolds(chain.room, chain);
            return;
        }
        clearFlags(chain.room, item.kind, chain.product);
        syncHolds(chain.room, chain);
        chain.qi += group.length;
        if (chain.qi >= chain.queue.length) {
            finishPartials(chain);
            chain.produced = Math.max(0, stockAnywhere(room, chain.product) - item.base + (chain.sold || 0));
            chain.sellStart = Game.time;
            setState(chain, "selling");
            log(chain.room + " " + chain.product + ": producao pronta (" + chain.produced + "), vendendo no piso " + saleFloor(chain).toFixed(2));
        } else {
            chain.stateTick = Game.time; // progress resets the stall clock per item
        }
        return;
    }
    if (chain.state === "selling") sellStep(chain, room);
}

function sellStep(chain, room) {
    const mem = craft();
    const floor = saleFloor(chain);
    if (chain.sellOpId) {
        const op = opState(chain.sellOpId);
        if (op && op.state === "completed") {
            finish(chain, room, realized(chain, room), { sold: op.dealtAmount || 0 });
            return;
        }
        if (op && FINAL.indexOf(op.state) < 0) {
            // An instant sell (no listing) opened while the bid was at the floor
            // can end up waiting forever if the market then drops below it. After
            // the retention window, give up waiting for a bid and list at the
            // floor instead - only while the bid is STILL below the floor (a
            // healthy order must never be cancelled and recreated every tick).
            const res = snapshotResource(chain.product);
            const stuck = !op.createListing && !chain.forceListing &&
                Game.time - chain.sellStart >= config.get("craft.retentionTicks", 259200) &&
                !((res && res.currentBuy) >= floor);
            if (!stuck) return; // still trading
            terminalOps.cancel(op.id);
            chain.forceListing = true;
            log(chain.room + " " + chain.product + ": venda sem comprador no piso " + floor.toFixed(2) + " - trocando por ordem listada no piso");
        }
        chain.sellOpId = null; // failed/cancelled: retry below
    }
    const remaining = Math.max(0, (chain.produced || chain.qty) - (chain.sold || 0));
    const sellable = Math.min(remaining, stockAnywhere(room, chain.product));
    if (sellable <= 0) { finish(chain, room, realized(chain, room), { sold: 0 }); return; }
    const res = snapshotResource(chain.product);
    const bid = res && res.currentBuy;
    const holdFor = config.get("craft.retentionTicks", 259200);
    const held = Game.time - chain.sellStart;
    let listing = !!chain.forceListing;
    if (!(bid >= floor)) {
        // never sell below break-even: hold, then list at the floor and wait
        if (held < holdFor) {
            if (!chain.holding) log(chain.room + " " + chain.product + ": bid " + (bid || 0).toFixed(2) + " abaixo do piso " + floor.toFixed(2) + " - segurando");
            chain.holding = true;
            return;
        }
        listing = true;
    }
    if (listing) chain.forceListing = true;
    chain.holding = false;
    if (chain.sellRetryTick > Game.time) return;
    const attempt = terminalOps.sell(chain.room, chain.product, Math.floor(sellable), floor, listing, true);
    if (attempt.ok) chain.sellOpId = attempt.id;
    else chain.sellRetryTick = Game.time + config.get("craft.sellRetryTicks", 25); // refused (e.g. a concurrent op): do not retry, and print, every tick
}

// --- replanning chains already running (console craftReplan) ------------------
// A chain keeps the queue it was opened with, so one opened before the wide strategy
// (ROADMAP 0116) never gets it. This rebuilds, with the CURRENT plan, only the steps not
// started yet; what is running or finished is left alone, except that nothing stays pinned
// in place any more (the product of an earlier step is handed to storage by the drain and
// the wide steps receive it from there). Nothing changes unless the current plan for the
// chain is the wide one. roomName omitted = every room. Returns one line per chain.
function replan(roomName) {
    const mem = craft();
    const out = [];
    Object.keys(mem.active).forEach((key) => {
        const chain = mem.active[key];
        if (!chain || !(chain.queue || []).some((item) => item.kind === "lab")) return;
        const name = chainRoomOf(chain, key);
        if (roomName && name !== roomName) return;
        const label = key + " " + chain.product;
        if (chain.state !== "buying" && chain.state !== "working") { out.push(label + ": em '" + chain.state + "', nada a trocar"); return; }
        const room = Game.rooms[name];
        if (!room) { out.push(label + ": sem visao da sala"); return; }
        const pending = chain.queue.map((item, n) => n).filter((n) => n >= chain.qi && !chain.queue[n].started);
        if (!pending.length) { out.push(label + ": nenhuma etapa pendente (a que esta rodando termina como esta)"); return; }
        const steps = chain.queue.map((item) => {
            const recipe = marketPricing.recipeOf(item.product);
            return { product: item.product, kind: item.kind, batches: Math.max(1, Math.round(item.target / (recipe ? recipe.amount : 1))) };
        });
        const fresh = buildQueue(room, { steps });
        if (!fresh || fresh.length !== chain.queue.length || fresh.some((item, n) => item.product !== chain.queue[n].product)) {
            out.push(label + ": o plano atual nao reproduz a fila desta cadeia, nada trocado");
            return;
        }
        if (fresh.strategy !== "wide") { out.push(label + ": para esta cadeia o plano atual e '" + fresh.strategy + "', nada a trocar"); return; }
        pending.forEach((n) => { chain.queue[n] = fresh[n]; });
        // steps already done or running: their product must not stay pinned in place
        chain.queue.forEach((item, n) => { if (pending.indexOf(n) < 0 && item.kind === "lab") item.keep = false; });
        const roomMemory = roomMem(name);
        [roomMemory.labReaction].concat(roomMemory.labReactions || []).forEach((reaction) => { if (reaction) delete reaction.keep; });
        // An earlier step's product pinned in place is released (the drain takes it to storage),
        // except in a lab that is an INPUT of a pending step: the wide step reads it right there,
        // and letting the drain empty it would only cost a round trip.
        const inputsNeeded = {};
        pending.forEach((n) => { inputsNeeded[chain.queue[n].input1] = true; inputsNeeded[chain.queue[n].input2] = true; });
        Object.keys(chain.holds || {}).forEach((id) => { if (!inputsNeeded[id]) delete chain.holds[id]; });
        syncHolds(name, chain);
        chain.stateTick = Game.time; // the stall clock restarts: the plan just changed
        out.push(label + ": " + pending.length + " etapa(s) pendente(s) trocada(s) para a estrategia larga (" +
            pending.map((n) => chain.queue[n].product).join(", ") + ")");
        log(name + " " + chain.product + ": cadeia replanejada para a estrategia larga (" + pending.length + " etapa(s))");
    });
    return out;
}

// --- stranded inputs ---------------------------------------------------------
function strandedSweep() {
    const mem = craft();
    const hold = config.get("craft.retentionTicks", 259200);
    Object.keys(mem.stranded).forEach((key) => {
        const entry = mem.stranded[key];
        if (Game.time - entry.tick < hold) return;
        const room = Game.rooms[entry.room];
        if (!room || !room.terminal || !room.storage) return;
        // anything the planner can still turn into something better is left to it
        delete mem.stranded[key];
        Object.keys(entry.items).forEach((resourceType) => {
            const res = snapshotResource(resourceType);
            const bid = res && marketPricing.conservativeBid(resourceType, res.currentBuy);
            const have = Math.min(entry.items[resourceType], stockAnywhere(room, resourceType));
            if (!(bid > 0) || have <= 0) return;
            const decision = marketPricing.sellOrProcess(resourceType, have, {
                instant: (rt) => { const r = snapshotResource(rt); return r ? { bid: r.currentBuy, ask: r.currentSell } : null; },
                stock: (rt) => stockAnywhere(room, rt),
            });
            if (decision.action === "process") return;
            terminalOps.sell(entry.room, resourceType, Math.floor(have), bid, false, true);
        });
    });
}

// Console kill switch (craftCancel): aborts a running chain at once - open
// orders are cancelled, credits freed, flags cleared, inputs stay as stock.
function cancelRoom(roomName) {
    const active = craft().active;
    const keys = Object.keys(active).filter((key) => active[key] && chainRoomOf(active[key], key) === roomName);
    keys.forEach((key) => abort(active[key], Game.rooms[roomName], "manual"));
    return keys.length > 0;
}

function tick() {
    const mem = craft();
    Object.keys(mem.active).forEach((key) => {
        const chain = mem.active[key];
        if (!chain) return;
        const room = Game.rooms[chainRoomOf(chain, key)];
        if (!room) return;
        advance(chain, room);
    });
    strandedSweep();
}

module.exports = { open, tick, manualPin, clearFlags, activeCount, recordRun, cancelRoom, busyKinds, kindsOf, saleFloor, groupAt, replan };
