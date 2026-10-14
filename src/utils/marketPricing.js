// ROADMAP 0111: shared pricing / risk model for craftPlanner and marketFlip.
// Single source: market.js's own 7-day hourly samples (never
// Game.market.getHistory). "bid" = best BUY order (what we receive selling),
// "ask" = best SELL order (what we pay buying) - same convention as
// market.js's buyPrice/sellPrice. Pure: no Memory, no Game objects.
const config = require("./config");
const market = require("./market");

function num(value) {
    return typeof value === "number" && isFinite(value) ? value : 0;
}

function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sigmaRel(prices, center) {
    if (prices.length < 2 || !(center > 0)) return 0;
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + (p - mean) * (p - mean), 0) / prices.length;
    return Math.sqrt(variance) / center;
}

// Abramowitz-Stegun 26.2.23: one-sided z for a confidence level (0.95 -> 1.645).
function zFromConfidence(confidence) {
    const c = Math.min(0.9999, Math.max(0.5, num(confidence) || 0.95));
    if (c === 0.5) return 0;
    const t = Math.sqrt(-2 * Math.log(1 - c));
    return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
        (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
}

function sideStats(rows, which) {
    const priceKey = which === "bid" ? "buyPrice" : "sellPrice";
    const volumeKey = which === "bid" ? "buyVolume" : "sellVolume";
    const present = rows.filter((row) => row[priceKey] !== null && num(row[priceKey]) > 0);
    const med = market.weightedMedian(present.map((row) => ({
        price: row[priceKey],
        volume: row[volumeKey],
    })));
    return {
        median: med,
        depth: median(present.map((row) => num(row[volumeKey]))),
        presence: rows.length ? present.length / rows.length : 0,
        sigmaRel: sigmaRel(present.map((row) => row[priceKey]), med),
    };
}

// The planner prices hundreds of recipes per scan; the medians only change
// when market.js appends a new hourly sample, so memoize per (array identity,
// length, newest sample tick) - heap only, never persisted.
const statsCache = {};

function stats(resourceType) {
    const rows = market.samples(resourceType);
    const newest = rows.length ? rows[rows.length - 1].tick : null;
    const hit = statsCache[resourceType];
    if (hit && hit.rows === rows && hit.length === rows.length && hit.newest === newest) return hit.value;
    const bid = sideStats(rows, "bid");
    const ask = sideStats(rows, "ask");
    const value = {
        count: rows.length,
        bid,
        ask,
        spread: bid.median > 0 && ask.median > 0 ? ask.median / bid.median : null,
    };
    statsCache[resourceType] = { rows, length: rows.length, newest, value };
    return value;
}

function conservativeBid(resourceType, instantBid) {
    const med = stats(resourceType).bid.median;
    if (!(num(instantBid) > 0) || med === null) return null;
    return Math.min(med, instantBid);
}

function conservativeAsk(resourceType, instantAsk) {
    const med = stats(resourceType).ask.median;
    if (!(num(instantAsk) > 0) || med === null) return null;
    return Math.max(med, instantAsk);
}

function requiredMargin(sigma, ticks) {
    const z = zFromConfidence(config.get("craft.confidence", 0.95));
    return config.get("craft.floor", 0.01) +
        z * num(sigma) * Math.sqrt(Math.max(0, num(ticks)) / 3600);
}

// side: "sell" = we sell into the bid book, "buy" = we buy from the ask book.
// The two sides are NOT symmetric (user request, 2026-10-02):
//  - buy: every input is bought at once, up front, at the current ask plus a
//    small slack, so its cost is FIXED at purchase and later volatility cannot
//    touch it; and revenue is priced at the bid (the pessimistic side), so a
//    wide spread does not worsen the numbers either. A buy only has to prove
//    the book exists (samples, presence) and can fill the lot (depth).
//  - sell: the revenue is the one thing still moving until the product is
//    sold, so it keeps spread and volatility (plus the margin's own sigma).
function liquidity(resourceType, lot, which) {
    const s = stats(resourceType);
    const book = which === "sell" ? s.bid : s.ask;
    if (s.count < config.get("craft.minSamples", 48)) return { ok: false, reason: "warming" };
    if (book.median === null || book.presence < config.get("craft.minPresence", 0.9)) {
        return { ok: false, reason: "presence" };
    }
    if (num(book.depth) < config.get("craft.depthLots", 2) * num(lot)) {
        return { ok: false, reason: "depth" };
    }
    if (which !== "sell") return { ok: true, reason: null, sigmaRel: 0 };
    if (s.spread === null || s.spread > config.get("craft.maxSpread", 2)) {
        return { ok: false, reason: "spread" };
    }
    if (book.sigmaRel > config.get("craft.maxSigma", 0.3)) {
        return { ok: false, reason: "volatility" };
    }
    return { ok: true, reason: null, sigmaRel: book.sigmaRel };
}

// Buying cheap is never a risk: an ask at/below the 7d median passes with no
// guardrail. Only an expensive ask has to clear the liquidity checks.
function buyLeg(resourceType, instantAsk, lot) {
    const med = stats(resourceType).ask.median;
    if (med !== null && num(instantAsk) > 0 && instantAsk <= med) {
        return { ok: true, reason: null, cheap: true, sigmaRel: 0 };
    }
    return liquidity(resourceType, lot, "buy");
}

// Flip's sell-leg outlier filter (replaces the old fairPrice * 1.05 ratio):
// price must sit within outlierSigma standard deviations of the 7d median.
function outlier(resourceType, price, which) {
    const book = which === "ask" ? stats(resourceType).ask : stats(resourceType).bid;
    if (book.median === null) return { blocked: true, reason: "no-history" };
    const band = Math.max(book.sigmaRel, config.get("craft.floor", 0.01)) *
        config.get("marketFlip.outlierSigma", 3);
    return Math.abs(price - book.median) > band * book.median
        ? { blocked: true, reason: "outlier" }
        : { blocked: false, reason: null };
}

// --- recipes (COMMODITIES + REACTIONS, one shape) -------------------------

let reactionByProduct = null;
let usesIndex = null;

function reactionIndex() {
    if (reactionByProduct) return reactionByProduct;
    reactionByProduct = {};
    if (typeof REACTIONS === "undefined") return reactionByProduct;
    for (const a in REACTIONS) {
        for (const b in REACTIONS[a]) {
            if (!reactionByProduct[REACTIONS[a][b]]) {
                reactionByProduct[REACTIONS[a][b]] = [a, b];
            }
        }
    }
    return reactionByProduct;
}

function recipeOf(resourceType) {
    if (typeof COMMODITIES !== "undefined" && COMMODITIES[resourceType] &&
        COMMODITIES[resourceType].components) {
        const r = COMMODITIES[resourceType];
        return {
            kind: "factory", product: resourceType, components: r.components,
            amount: r.amount, cooldown: r.cooldown, level: r.level || 0,
        };
    }
    const pair = reactionIndex()[resourceType];
    if (!pair) return null;
    const batch = typeof LAB_REACTION_AMOUNT !== "undefined" ? LAB_REACTION_AMOUNT : 5;
    return {
        kind: "lab", product: resourceType,
        components: pair[0] === pair[1] ? { [pair[0]]: batch * 2 } : { [pair[0]]: batch, [pair[1]]: batch },
        amount: batch,
        cooldown: typeof REACTION_TIME !== "undefined" ? REACTION_TIME[resourceType] : 10,
        level: 0,
    };
}

// material -> recipes that consume it; built once, heap-resident.
function uses(material) {
    if (!usesIndex) {
        usesIndex = {};
        const products = {};
        if (typeof COMMODITIES !== "undefined") Object.keys(COMMODITIES).forEach((p) => { products[p] = true; });
        Object.keys(reactionIndex()).forEach((p) => { products[p] = true; });
        Object.keys(products).forEach((product) => {
            const recipe = recipeOf(product);
            if (!recipe) return;
            Object.keys(recipe.components).forEach((component) => {
                if (!usesIndex[component]) usesIndex[component] = [];
                usesIndex[component].push(recipe);
            });
        });
    }
    return usesIndex[material] || [];
}

function resetCaches() {
    reactionByProduct = null;
    usesIndex = null;
    Object.keys(statsCache).forEach((k) => delete statsCache[k]);
}

// --- cost model ------------------------------------------------------------
// ctx: instant(rt) -> {bid, ask}; stock(rt) -> own units; canMake(recipe) ->
// bool (room feasibility); parallel(recipe) -> concurrent output labs.

function planNode(resourceType, qty, ctx, depth, visiting, forceMake) {
    if (!ctx.why) ctx.why = {};
    const instant = ctx.instant(resourceType) || {};
    const options = [];
    // Why THIS node has no usable option; only published to ctx.why if the
    // node ends up with none (a node that succeeds must not leave a reason
    // behind - it would be mistaken for the chain's real blocker).
    let reason = null;
    // Own stock is used first (valued at the conservative bid: opportunity
    // cost, no cash), and only the shortfall is bought - never all-or-nothing.
    // `cash` is what actually leaves the balance; `total` also counts the
    // opportunity cost of own inputs.
    if (!forceMake) {
        const ownQty = ctx.stock ? Math.min(ctx.stock(resourceType), qty) : 0;
        const buyQty = qty - ownQty;
        const bid = conservativeBid(resourceType, instant.bid);
        const ownCost = ownQty > 0 ? (bid === null ? 0 : bid) * ownQty : 0;
        const owns = ownQty > 0 ? { [resourceType]: ownQty } : {};
        if (buyQty <= 0) {
            options.push({ source: "own", total: ownCost, cash: 0, T: 0, steps: [], buys: {}, owns, sigma: 0 });
        } else {
            const quote = ctx.buyQuote ? ctx.buyQuote(resourceType, buyQty) : null;
            const ask = quote && quote.ok ? quote.unit : conservativeAsk(resourceType, instant.ask);
            const leg = ask === null ? null : buyLeg(resourceType, instant.ask, buyQty);
            if (quote && !quote.ok) reason = quote.reason;
            else if (ask === null) reason = "no-ask";
            else if (!leg.ok) reason = "liq-" + leg.reason;
            else {
                options.push({
                    source: ownQty > 0 ? "mixed" : "buy", total: ownCost + ask * buyQty, cash: ask * buyQty,
                    T: 0, steps: [], buys: { [resourceType]: buyQty }, owns, sigma: leg.sigmaRel || 0,
                });
            }
        }
    }
    const recipe = recipeOf(resourceType);
    if (recipe && depth < config.get("craft.maxDepth", 6) && !visiting[resourceType] &&
        recipe.level <= config.get("craft.maxLevel", 1) &&
        // never make a node out of something already in this chain: the
        // bar <-> mineral inverse recipes would otherwise "buy bars to make
        // the mineral to make the bars" - a circular plan with no real input
        !Object.keys(recipe.components).some((component) => visiting[component]) &&
        (!ctx.canMake || ctx.canMake(recipe))) {
        visiting[resourceType] = true;
        const batches = Math.ceil(qty / recipe.amount);
        let total = 0, cash = 0, T = 0, sigma = 0, ok = true;
        const steps = [], buys = {}, owns = {};
        for (const component in recipe.components) {
            const child = planNode(component, batches * recipe.components[component], ctx, depth + 1, visiting, false);
            if (!child) { ok = false; break; }
            total += child.total;
            cash += child.cash;
            T += child.T;
            sigma = Math.max(sigma, child.sigma);
            child.steps.forEach((step) => steps.push(step));
            for (const k in child.buys) buys[k] = (buys[k] || 0) + child.buys[k];
            for (const k in child.owns) owns[k] = (owns[k] || 0) + child.owns[k];
        }
        delete visiting[resourceType];
        if (ok) {
            // the chain's FINAL step (the root, depth 0) gets the whole step list, so a lab
            // step can work out how many output labs the executor will run in parallel
            const own = { product: resourceType, kind: recipe.kind, batches, level: recipe.level };
            const parallel = Math.max(1, (ctx.parallel && ctx.parallel(recipe, depth === 0 ? steps.concat([own]) : null)) || 1);
            own.time = Math.ceil(batches / parallel) * num(recipe.cooldown);
            steps.push(own);
            let chainT = T + own.time; // every step one after the other
            // ROADMAP 0115/0116: how long the lab steps really take depends on the strategy the
            // lab plan picks (waves of independent steps, or every step wide); only the root
            // knows the whole step list. Steps that are not lab steps still add up.
            if (depth === 0 && ctx.labTime) {
                const labT = ctx.labTime(steps);
                if (typeof labT === "number") {
                    chainT = labT + steps.reduce((sum, st) => sum + (st.kind === "lab" ? 0 : num(st.time)), 0);
                }
            }
            options.push({
                source: "make", total, T: chainT,
                cash, steps, buys, owns, sigma,
            });
        }
    }
    if (!options.length) {
        if (!reason && recipe && ctx.canMake && !ctx.canMake(recipe)) reason = "cant-make";
        // never overwrite what a deeper visit of the same node already said
        if (!(resourceType in ctx.why)) ctx.why[resourceType] = reason || "no-option";
        return null;
    }
    options.sort((a, b) => a.total - b.total);
    return Object.assign({ resourceType, qty }, options[0]);
}

// Full chain verdict for producing `qty` of `product` and selling it.
function evaluate(product, qty, ctx) {
    ctx.why = {};
    const plan = planNode(product, qty, ctx, 0, {}, true);
    if (!plan) {
        // which input blocked the chain, e.g. "U:liq-warming": the deepest
        // blocker that is not the product itself and not a bare "no-option"
        const keys = Object.keys(ctx.why);
        const pick = keys.find((k) => k !== product && ctx.why[k] !== "no-option") ||
            keys.find((k) => ctx.why[k] !== "no-option") || keys[0];
        return { ok: false, reason: "no-plan", detail: pick ? pick + ":" + ctx.why[pick] : null };
    }
    if (ctx.buyQuote) {
        const quotes = {};
        let cash = 0;
        for (const r of Object.keys(plan.buys)) {
            const quote = ctx.buyQuote(r, Math.ceil(plan.buys[r]));
            if (!quote.ok) return { ok: false, reason: "no-plan", detail: r + ":" + quote.reason };
            quotes[r] = quote;
            cash += quote.cost;
        }
        plan.total += cash - plan.cash;
        plan.cash = cash;
        plan.purchaseQuotes = quotes;
    }
    const instant = ctx.instant(product) || {};
    const bid = conservativeBid(product, instant.bid);
    if (bid === null) return { ok: false, reason: "no-bid", plan };
    const sell = liquidity(product, qty, "sell");
    if (!sell.ok) return { ok: false, reason: "sell-" + sell.reason, plan };
    // room-specific rejection (e.g. no lab phase plan) and extra time (lab
    // remanejamentos) come from the caller; the model itself stays pure.
    const veto = ctx.veto ? ctx.veto(plan) : null;
    if (veto) return { ok: false, reason: veto, plan };
    const fee = ctx.feeCredits ? num(ctx.feeCredits(plan, qty)) : 0;
    const cost = plan.total + fee;
    const revenue = bid * qty;
    const profit = revenue - cost;
    const T = plan.T + config.get("craft.logisticsTicksPerMove", 50) * plan.steps.length +
        (ctx.extraTicks ? num(ctx.extraTicks(plan)) : 0);
    const sigma = Math.max(plan.sigma, sell.sigmaRel || 0);
    const margin = requiredMargin(sigma, T);
    const ratio = cost > 0 ? profit / cost : 0;
    return {
        ok: ratio >= margin, reason: ratio >= margin ? null : "margin",
        plan, cost, cash: plan.cash + fee, spend: plan.cash, revenue, profit, ratio, margin, T, sigma,
    };
}

// Hold `held` units of `material`: sell as-is or feed one-level recipes?
function sellOrProcess(material, held, ctx) {
    const instant = ctx.instant(material) || {};
    const directBid = conservativeBid(material, instant.bid);
    const direct = directBid === null ? 0 : directBid * held;
    let best = { action: "sell", gain: 0, direct };
    uses(material).forEach((recipe) => {
        if (recipe.level > config.get("craft.maxLevel", 1)) return;
        if (ctx.canMake && !ctx.canMake(recipe)) return;
        const per = recipe.components[material];
        const batches = Math.floor(held / per);
        if (batches <= 0) return;
        let cost = 0, sigma = 0, ok = true;
        for (const component in recipe.components) {
            if (component === material) continue;
            const child = planNode(component, batches * recipe.components[component], ctx, 1, {}, false);
            if (!child) { ok = false; break; }
            cost += child.total;
            sigma = Math.max(sigma, child.sigma);
        }
        if (!ok) return;
        const out = ctx.instant(recipe.product) || {};
        const bid = conservativeBid(recipe.product, out.bid);
        if (bid === null) return;
        const sell = liquidity(recipe.product, batches * recipe.amount, "sell");
        if (!sell.ok) return;
        const heldValue = directBid === null ? 0 : directBid * batches * per;
        const gain = bid * batches * recipe.amount - cost - heldValue;
        const T = batches * num(recipe.cooldown) + config.get("craft.logisticsTicksPerMove", 50);
        const margin = requiredMargin(Math.max(sigma, sell.sigmaRel || 0), T);
        if (gain > best.gain && gain >= margin * (cost + heldValue)) {
            best = { action: "process", product: recipe.product, kind: recipe.kind, batches, gain, direct };
        }
    });
    return best;
}

module.exports = {
    stats, zFromConfidence, conservativeBid, conservativeAsk, requiredMargin,
    liquidity, buyLeg, outlier, recipeOf, uses, planNode, evaluate,
    sellOrProcess, resetCaches,
};
