const config = require("./config");

let lastScanTick = null;
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

function historyMetrics(days) {
    let volume = 0;
    let weightedTotal = 0;
    let validDays = 0;
    for (const day of Array.isArray(days) ? days : []) {
        const dayVolume = numberOrZero(day && day.volume);
        const averagePrice = numberOrZero(day && day.avgPrice);
        if (dayVolume <= 0 || averagePrice <= 0) continue;
        volume += dayVolume;
        weightedTotal += averagePrice * dayVolume;
        validDays++;
    }
    return {
        weightedHistory: volume > 0 ? weightedTotal / volume : null,
        averageDailyVolume: validDays > 0 ? volume / validDays : 0,
    };
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
    for (const sample of capped) {
        accumulated += sample.volume;
        if (accumulated >= target) return sample.price;
    }
    return capped[capped.length - 1].price;
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
        fairPrice: buyPrice !== null && sellPrice !== null
            ? (buyPrice + sellPrice) / 2
            : null,
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

function vwap(orders, expectedType, targetVolume, descending) {
    if (targetVolume <= 0 || !Array.isArray(orders)) return null;
    const expected = expectedType;
    const eligible = orders
        .filter((order) => orderType(order, expected))
        .filter((order) => numberOrZero(order.price) > 0 && orderAmount(order) > 0)
        .sort((left, right) => descending
            ? right.price - left.price
            : left.price - right.price);
    let remaining = targetVolume;
    let amount = 0;
    let value = 0;
    for (const order of eligible) {
        const taken = Math.min(remaining, orderAmount(order));
        amount += taken;
        value += taken * order.price;
        remaining -= taken;
        if (remaining <= 0) break;
    }
    return amount > 0 ? value / amount : null;
}

function vwapDepths(averageDailyVolume) {
    const lowPercent = config.get("market.vwapDepthPercentLow", 0.01);
    const highPercent = config.get("market.vwapDepthPercentHigh", 0.1);
    return {
        low: averageDailyVolume * lowPercent,
        high: averageDailyVolume * highPercent,
    };
}

function bestPrice(orders, expectedType, descending) {
    const prices = (Array.isArray(orders) ? orders : [])
        .filter((order) => orderType(order, expectedType))
        .map((order) => numberOrZero(order.price))
        .filter((price) => price > 0);
    if (!prices.length) return null;
    return descending ? Math.max.apply(null, prices) : Math.min.apply(null, prices);
}

function fairPrice(vwasp, buyVwap, bestSell, bestBuy) {
    if (numberOrZero(vwasp) > 0) return vwasp;
    if (numberOrZero(buyVwap) > 0) return buyVwap;
    if (numberOrZero(bestSell) > 0 && numberOrZero(bestBuy) > 0) {
        return (bestSell + bestBuy) / 2;
    }
    return numberOrZero(bestSell) > 0 ? bestSell :
        numberOrZero(bestBuy) > 0 ? bestBuy : null;
}

function buildResource(resourceType, days, orders) {
    const sellType = typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell";
    const buyType = typeof ORDER_BUY !== "undefined" ? ORDER_BUY : "buy";
    const sellLevel = bestOrderLevel(orders, sellType, false);
    const buyLevel = bestOrderLevel(orders, buyType, true);
    return {
        resourceType,
        bestSell: sellLevel.price,
        bestBuy: buyLevel.price,
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
    const interval = Math.max(1, Number(config.get("market.snapshotInterval", 3600)) || 3600);
    if (lastSnapshot && lastScanTick !== null && Game.time - lastScanTick < interval) {
        return lastSnapshot;
    }
    const market = typeof Game !== "undefined" && Game.market;
    let orders = [];
    if (market && typeof market.getAllOrders === "function") {
        try { orders = market.getAllOrders() || []; } catch (error) { orders = []; }
    }
    const groupedOrders = groupOrders(orders);
    const resources = {};
    for (const resourceType of resourceTypes()) {
        const sellType = typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell";
        const buyType = typeof ORDER_BUY !== "undefined" ? ORDER_BUY : "buy";
        const sellLevel = bestOrderLevel(groupedOrders[resourceType], sellType, false);
        const buyLevel = bestOrderLevel(groupedOrders[resourceType], buyType, true);
        if (!temporalSnapshots[resourceType]) temporalSnapshots[resourceType] = [];
        temporalSnapshots[resourceType].push({
            tick: Game.time,
            buyPrice: buyLevel.price,
            buyVolume: buyLevel.volume,
            sellPrice: sellLevel.price,
            sellVolume: sellLevel.volume,
        });
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
    lastScanTick = Game.time;
    lastSnapshot = { tick: Game.time, resources };
    return lastSnapshot;
}

function snapshot() {
    return lastSnapshot;
}

function reset() {
    lastScanTick = null;
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
    historyMetrics,
    vwap,
    vwapDepths,
    fairPrice,
    weightedMedian,
    marketPrice,
};