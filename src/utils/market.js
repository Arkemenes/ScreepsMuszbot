const config = require("./config");
const orderBook = require("./orderBook");
const cadence = require("./cadence");
const marketHistory = require("./marketHistoryStore");

let lastCurrentScanTick = null;
let lastSnapshotTick = null;
let firstSnapshotDueTick = null;
let lastSnapshot = null;
const temporalSnapshots = {};
let sampleSummaryCache = new WeakMap();
let marketHistoryLoaded = false;
let historyDirty = false;

function numberOrZero(value) {
    return typeof value === "number" && isFinite(value) ? value : 0;
}

function resourceTypes() {
    const types = [];
    const seen = {};
    const lists = [
        typeof RESOURCES_ALL !== "undefined" ? RESOURCES_ALL : [],
        typeof INTERSHARD_RESOURCES !== "undefined" ? INTERSHARD_RESOURCES : [],
    ];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const resourceType of list) {
            if (typeof resourceType === "string" && !seen[resourceType]) {
                seen[resourceType] = true;
                types.push(resourceType);
            }
        }
    }
    return types;
}

// The grouping of the book is kept for the array it was built from: market.scan and
// marketFlip.scan run on the same tick over the same shared book (utils/orderBook), and each
// regrouped thousands of orders. Callers only read the groups.
let groupedFor = null;
let groupedResult = null;
function groupOrders(orders) {
    if (orders === groupedFor && groupedResult) return groupedResult;
    const grouped = {};
    if (!Array.isArray(orders)) return grouped;
    for (const order of orders) {
        if (!order || typeof order.resourceType !== "string") continue;
        if (!grouped[order.resourceType]) grouped[order.resourceType] = [];
        grouped[order.resourceType].push(order);
    }
    groupedFor = orders;
    groupedResult = grouped;
    return grouped;
}

function orderType(order, expected) {
    return order && (order.type === expected || order.orderType === expected);
}

function orderAmount(order) {
    return numberOrZero(
        order && typeof order.remainingAmount === "number"
            ? order.remainingAmount
            : order && order.amount
    );
}

function bestOrderLevel(orders, expectedType, descending) {
    // one pass: the best price and the volume sitting exactly on it (the book of energy
    // holds thousands of orders - this used to filter twice and sort them all)
    const list = Array.isArray(orders) ? orders : [];
    let price = null;
    let volume = 0;
    for (let i = 0; i < list.length; i++) {
        const order = list[i];
        if (!orderType(order, expectedType)) continue;
        if (!(numberOrZero(order.price) > 0)) continue;
        const amount = orderAmount(order);
        if (!(amount > 0)) continue;
        if (price === null || (descending ? order.price > price : order.price < price)) {
            price = order.price;
            volume = amount;
        } else if (order.price === price) {
            volume += amount;
        }
    }
    return { price, volume };
}

function weightedMedian(samples) {
    const valid = (Array.isArray(samples) ? samples : [])
        .filter((sample) => numberOrZero(sample.price) > 0 && numberOrZero(sample.volume) > 0)
        .map((sample) => ({ price: sample.price, volume: sample.volume }));
    if (!valid.length) return null;
    const totalWeight = valid.reduce((sum, sample) => sum + sample.volume, 0);
    const maxWeight = totalWeight * config.get("market.snapshotWeightCap", 0.01);
    const capped = valid.map((sample) => ({
        price: sample.price,
        volume: Math.min(sample.volume, maxWeight),
    }));
    capped.sort((left, right) => left.price - right.price);
    const target = capped.reduce((sum, sample) => sum + sample.volume, 0) / 2;
    let accumulated = 0;
    for (let index = 0; index < capped.length; index++) {
        const sample = capped[index];
        accumulated += sample.volume;
        if (accumulated === target && capped[index + 1]) {
            return (sample.price + capped[index + 1].price) / 2;
        }
        if (accumulated >= target) return sample.price;
    }
    return capped[capped.length - 1].price;
}

function pointwiseFairPrice(snapshots) {
    return weightedMedian((Array.isArray(snapshots) ? snapshots : [])
        .filter((sample) => sample.buyPrice !== null && sample.sellPrice !== null)
        .map((sample) => ({
            price: (sample.buyPrice + sample.sellPrice) / 2,
            volume: (sample.buyVolume + sample.sellVolume) / 2,
        })));
}

// The three medians of a resource depend only on its hourly samples (and the weight cap),
// which change once per market.snapshotInterval - not on every 120-tick scan. Kept per resource
// for the samples' identity (array, length, last tick) and dropped when they change.
let medianCache = {};
function medians(resourceType, snapshots) {
    const cap = config.get("market.snapshotWeightCap", 0.01);
    const last = snapshots.length ? snapshots[snapshots.length - 1].tick : null;
    const hit = medianCache[resourceType];
    if (hit && hit.source === snapshots && hit.length === snapshots.length && hit.last === last && hit.cap === cap) {
        return hit;
    }
    const buySamples = snapshots.filter((sample) => sample.buyPrice !== null)
        .map((sample) => ({ price: sample.buyPrice, volume: sample.buyVolume }));
    const sellSamples = snapshots.filter((sample) => sample.sellPrice !== null)
        .map((sample) => ({ price: sample.sellPrice, volume: sample.sellVolume }));
    return (medianCache[resourceType] = {
        source: snapshots, length: snapshots.length, last, cap,
        buyPrice: weightedMedian(buySamples),
        sellPrice: weightedMedian(sellSamples),
        fairPrice: pointwiseFairPrice(snapshots),
    });
}

function temporalResource(resourceType, now) {
    const snapshots = temporalSnapshots[resourceType] || [];
    const cached = medians(resourceType, snapshots);
    const buyPrice = cached.buyPrice;
    const sellPrice = cached.sellPrice;
    return {
        buyPrice,
        sellPrice,
        fairPrice: cached.fairPrice,
        sampleCount: snapshots.length,
        windowCoverageTicks: snapshots.length
            ? now - snapshots[0].tick
            : 0,
        confidence: snapshots.length && now - snapshots[0].tick >=
            config.get("market.snapshotWindowTicks", 604800)
            ? "ready"
            : "warming",
    };
}

function commodityRecipe(resourceType) {
    return typeof COMMODITIES !== "undefined" && COMMODITIES[resourceType];
}

function reachesResource(resourceType, targetType, visited) {
    if (visited[resourceType]) return false;
    visited[resourceType] = true;
    const recipe = commodityRecipe(resourceType);
    if (!recipe || !recipe.components) return false;
    for (const componentType in recipe.components) {
        if (componentType === targetType ||
            reachesResource(componentType, targetType, visited)) {
            return true;
        }
    }
    return false;
}

function isCyclicCommodity(resourceType, memo) {
    if (memo[resourceType] !== undefined) return memo[resourceType];
    memo[resourceType] = reachesResource(resourceType, resourceType, {});
    return memo[resourceType];
}

function derivedPrice(resourceType, resources, memo, visiting, cycleMemo) {
    if (memo[resourceType] !== undefined) return memo[resourceType];
    if (isCyclicCommodity(resourceType, cycleMemo)) {
        return resources[resourceType] || null;
    }
    if (visiting[resourceType]) return null;
    const recipe = commodityRecipe(resourceType);
    if (!recipe || !recipe.components || !(recipe.amount > 0)) {
        return resources[resourceType] || null;
    }
    visiting[resourceType] = true;
    const result = { buyPrice: 0, sellPrice: 0, fairPrice: 0 };
    for (const componentType in recipe.components) {
        const component = derivedPrice(componentType, resources, memo, visiting, cycleMemo);
        const amount = numberOrZero(recipe.components[componentType]);
        if (!component || component.buyPrice === null || component.sellPrice === null ||
            component.fairPrice === null || amount <= 0) {
            delete visiting[resourceType];
            memo[resourceType] = null;
            return null;
        }
        result.buyPrice += component.buyPrice * amount;
        result.sellPrice += component.sellPrice * amount;
        result.fairPrice += component.fairPrice * amount;
    }
    delete visiting[resourceType];
    result.buyPrice /= recipe.amount;
    result.sellPrice /= recipe.amount;
    result.fairPrice /= recipe.amount;
    memo[resourceType] = result;
    return result;
}

function applyCommodityPrices(resources) {
    const memo = {};
    const cycleMemo = {};
    for (const resourceType in resources) {
        if (!commodityRecipe(resourceType) || isCyclicCommodity(resourceType, cycleMemo)) continue;
        const current = resources[resourceType];
        const derived = derivedPrice(resourceType, resources, memo, {}, cycleMemo);
        current.buyPrice = derived ? derived.buyPrice : null;
        current.sellPrice = derived ? derived.sellPrice : null;
        current.fairPrice = derived ? derived.fairPrice : null;
    }
}

function buildResource(resourceType, days, orders) {
    const sellType = typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell";
    const buyType = typeof ORDER_BUY !== "undefined" ? ORDER_BUY : "buy";
    const sellLevel = bestOrderLevel(orders, sellType, false);
    const buyLevel = bestOrderLevel(orders, buyType, true);
    return {
        resourceType,
        currentBuy: buyLevel.price,
        currentSell: sellLevel.price,
        currentBuyVolume: buyLevel.volume,
        currentSellVolume: sellLevel.volume,
    };
}

function emptySnapshot() {
    const resources = {};
    for (const resourceType of resourceTypes()) {
        resources[resourceType] = buildResource(resourceType, [], []);
    }
    return { tick: Game.time, resources };
}

function scan() {
    if (firstSnapshotDueTick === null) firstSnapshotDueTick = Game.time;
    if (Game.cpu && Game.cpu.bucket < config.get("market.minBucket", 500)) return lastSnapshot;
    let historyBecameReady = false;
    if (!marketHistoryLoaded && marketHistory.load()) {
        const persisted = marketHistory.history();
        for (const resourceType in persisted) {
            const current = temporalSnapshots[resourceType] || [];
            const merged = current.concat(persisted[resourceType] || []);
            const byTick = {};
            merged.forEach((sample) => {
                if (sample && byTick[sample.tick] === undefined) {
                    byTick[sample.tick] = sample;
                }
            });
            temporalSnapshots[resourceType] = Object.keys(byTick)
                .map((tick) => byTick[tick])
                .sort((left, right) => left.tick - right.tick);
            for (const sample of temporalSnapshots[resourceType]) {
                const scheduled = Number.isFinite(sample.scheduledTick) ? sample.scheduledTick : sample.tick;
                if (lastSnapshotTick === null || scheduled > lastSnapshotTick) {
                    lastSnapshotTick = scheduled;
                }
            }
        }
        marketHistoryLoaded = true;
        historyBecameReady = true;
    }
    // Hydration may finish between market scans. Flush real samples collected
    // during loading before taking the cadence fast path.
    if (historyDirty && marketHistoryLoaded && marketHistory.save(temporalSnapshots)) historyDirty = false;
    const currentInterval = Math.max(1, Number(config.get("market.currentInterval", 120)) || 120);
    const snapshotInterval = Math.max(1, Number(config.get("market.snapshotInterval", 3600)) || 3600);
    const dueTick = lastSnapshotTick === null ? firstSnapshotDueTick : lastSnapshotTick + snapshotInterval;
    const snapshotDue = Game.time >= dueTick;
    // Delayed collection resumes immediately; it need not wait for the book grid.
    if (lastSnapshot && !historyBecameReady && !snapshotDue && !cadence.due(lastCurrentScanTick, currentInterval)) {
        return lastSnapshot;
    }
    const orders = orderBook.all();
    const groupedOrders = groupOrders(orders);
    const resources = {};
    // Coalesce missed slots into one real observation, keeping the original grid.
    const scheduledTick = dueTick + Math.floor(Math.max(0, Game.time - dueTick) / snapshotInterval) * snapshotInterval;
    for (const resourceType of resourceTypes()) {
        const sellType = typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell";
        const buyType = typeof ORDER_BUY !== "undefined" ? ORDER_BUY : "buy";
        const sellLevel = bestOrderLevel(groupedOrders[resourceType], sellType, false);
        const buyLevel = bestOrderLevel(groupedOrders[resourceType], buyType, true);
        if (!temporalSnapshots[resourceType]) temporalSnapshots[resourceType] = [];
        if (snapshotDue) {
            sampleSummaryCache.delete(temporalSnapshots[resourceType]);
            temporalSnapshots[resourceType].push({
                tick: Game.time,
                scheduledTick,
                buyPrice: buyLevel.price,
                buyVolume: buyLevel.volume,
                sellPrice: sellLevel.price,
                sellVolume: sellLevel.volume,
            });
        }
        const windowTicks = Math.max(1, Number(config.get("market.snapshotWindowTicks", 604800)) || 604800);
        while (temporalSnapshots[resourceType].length &&
            Game.time - temporalSnapshots[resourceType][0].tick > windowTicks) {
            sampleSummaryCache.delete(temporalSnapshots[resourceType]);
            temporalSnapshots[resourceType].shift();
        }
        resources[resourceType] = buildResource(
            resourceType,
            [],
            groupedOrders[resourceType]
        );
        Object.assign(resources[resourceType], temporalResource(resourceType, Game.time));
    }
    applyCommodityPrices(resources);
    lastCurrentScanTick = Game.time;
    if (snapshotDue) {
        lastSnapshotTick = scheduledTick;
        historyDirty = true;
        if (marketHistoryLoaded && marketHistory.save(temporalSnapshots)) historyDirty = false;
    }
    lastSnapshot = { tick: Game.time, resources };
    return lastSnapshot;
}

function snapshot() {
    return lastSnapshot;
}

// ROADMAP 0111: raw hourly samples (heap-resident) for marketPricing's own
// statistics - same read-only data the medians above come from, never copied.
function samples(resourceType) {
    return temporalSnapshots[resourceType] || [];
}

// Counts/latest valid ticks depend only on history, not price, settings or age.
// All canonical mutations invalidate here at their source; hydration replaces arrays.
function sampleSummary(resourceType) {
    const provider = module.exports.samples;
    const rows = provider(resourceType);
    const canonical = provider === samples;
    let summary = canonical && sampleSummaryCache.get(rows);
    if (!summary) {
        summary = { length: rows.length, buyCount: 0, sellCount: 0, buyTick: null, sellTick: null };
        for (const row of rows) {
            if (row.buyPrice > 0) { summary.buyCount++; summary.buyTick = row.tick; }
            if (row.sellPrice > 0) { summary.sellCount++; summary.sellTick = row.tick; }
        }
        // Replaced providers have no immutable-history contract, so read them live.
        if (canonical) sampleSummaryCache.set(rows, summary);
    }
    return { ...summary };
}

function historyReady() {
    return marketHistoryLoaded && lastSnapshot !== null;
}

function reset() {
    lastCurrentScanTick = null;
    lastSnapshotTick = null;
    firstSnapshotDueTick = null;
    lastSnapshot = null;
    for (const resourceType in temporalSnapshots) delete temporalSnapshots[resourceType];
    marketHistoryLoaded = false;
    historyDirty = false;
    marketHistory.resetCache();
    medianCache = {};
    sampleSummaryCache = new WeakMap();
    groupedFor = null;
    groupedResult = null;
}

function marketPrice(resourceType) {
    const current = lastSnapshot;
    if (!current) {
        console.log("[market] ainda nao ha snapshot; aguarde o proximo scan");
        return null;
    }
    if (resourceType) {
        const result = current.resources[resourceType];
        console.log(result ? JSON.stringify(result) : "[market] recurso desconhecido: " + resourceType);
        return result || null;
    }
    const summary = Object.keys(current.resources)
        .map((key) => current.resources[key])
        .filter((result) => result.fairPrice !== null)
        .map((result) => ({
            resourceType: result.resourceType,
            fairPrice: result.fairPrice,
        }));
    console.log(JSON.stringify(summary));
    return summary;
}

function flushHistory() {
    if (!marketHistoryLoaded) return Object.assign({ ok: false, reason: "history-not-hydrated" }, marketHistory.status());
    const ok = marketHistory.save(temporalSnapshots);
    if (ok) historyDirty = false;
    return Object.assign({ ok }, marketHistory.status());
}
global.marketPrice = marketPrice;
global.marketHistoryFlush = flushHistory;

module.exports = {
    scan,
    snapshot,
    samples,
    sampleSummary,
    historyReady,
    reset,
    groupOrders,
    weightedMedian,
    pointwiseFairPrice,
    marketPrice,
    flushHistory,
};
