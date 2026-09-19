const config = require("./config");

let lastCurrentScanTick = null;
let lastSnapshotTick = null;
let lastSnapshot = null;
const temporalSnapshots = {};

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

function groupOrders(orders) {
    const grouped = {};
    if (!Array.isArray(orders)) return grouped;
    for (const order of orders) {
        if (!order || typeof order.resourceType !== "string") continue;
        if (!grouped[order.resourceType]) grouped[order.resourceType] = [];
        grouped[order.resourceType].push(order);
    }
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
    const eligible = (Array.isArray(orders) ? orders : [])
        .filter((order) => orderType(order, expectedType))
        .filter((order) => numberOrZero(order.price) > 0 && orderAmount(order) > 0)
        .sort((left, right) => descending
            ? right.price - left.price
            : left.price - right.price);
    if (!eligible.length) return { price: null, volume: 0 };
    const price = eligible[0].price;
    return {
        price,
        volume: eligible
            .filter((order) => order.price === price)
            .reduce((sum, order) => sum + orderAmount(order), 0),
    };
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

function temporalResource(resourceType, now) {
    const snapshots = temporalSnapshots[resourceType] || [];
    const buySamples = snapshots.filter((sample) => sample.buyPrice !== null)
        .map((sample) => ({ price: sample.buyPrice, volume: sample.buyVolume }));
    const sellSamples = snapshots.filter((sample) => sample.sellPrice !== null)
        .map((sample) => ({ price: sample.sellPrice, volume: sample.sellVolume }));
    const buyPrice = weightedMedian(buySamples);
    const sellPrice = weightedMedian(sellSamples);
    return {
        buyPrice,
        sellPrice,
        fairPrice: pointwiseFairPrice(snapshots),
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
    const currentInterval = Math.max(1, Number(config.get("market.currentInterval", 100)) || 100);
    if (lastSnapshot && lastCurrentScanTick !== null && Game.time - lastCurrentScanTick < currentInterval) {
        return lastSnapshot;
    }
    const market = typeof Game !== "undefined" && Game.market;
    let orders = [];
    if (market && typeof market.getAllOrders === "function") {
        try { orders = market.getAllOrders() || []; } catch (error) { orders = []; }
    }
    const groupedOrders = groupOrders(orders);
    const resources = {};
    const snapshotInterval = Math.max(1, Number(config.get("market.snapshotInterval", 3600)) || 3600);
    const snapshotDue = lastSnapshotTick === null || Game.time - lastSnapshotTick >= snapshotInterval;
    for (const resourceType of resourceTypes()) {
        const sellType = typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell";
        const buyType = typeof ORDER_BUY !== "undefined" ? ORDER_BUY : "buy";
        const sellLevel = bestOrderLevel(groupedOrders[resourceType], sellType, false);
        const buyLevel = bestOrderLevel(groupedOrders[resourceType], buyType, true);
        if (!temporalSnapshots[resourceType]) temporalSnapshots[resourceType] = [];
        if (snapshotDue) {
            temporalSnapshots[resourceType].push({
                tick: Game.time,
                buyPrice: buyLevel.price,
                buyVolume: buyLevel.volume,
                sellPrice: sellLevel.price,
                sellVolume: sellLevel.volume,
            });
        }
        const windowTicks = Math.max(1, Number(config.get("market.snapshotWindowTicks", 604800)) || 604800);
        while (temporalSnapshots[resourceType].length &&
            Game.time - temporalSnapshots[resourceType][0].tick > windowTicks) {
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
    if (snapshotDue) lastSnapshotTick = Game.time;
    lastSnapshot = { tick: Game.time, resources };
    return lastSnapshot;
}

function snapshot() {
    return lastSnapshot;
}

function reset() {
    lastCurrentScanTick = null;
    lastSnapshotTick = null;
    lastSnapshot = null;
    for (const resourceType in temporalSnapshots) delete temporalSnapshots[resourceType];
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

global.marketPrice = marketPrice;

module.exports = {
    scan,
    snapshot,
    reset,
    groupOrders,
    weightedMedian,
    pointwiseFairPrice,
    marketPrice,
};
