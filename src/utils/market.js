const config = require("./config");

let lastScanTick = null;
let lastSnapshot = null;

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

function historyByResource(history) {
    const grouped = {};
    if (!Array.isArray(history)) return grouped;
    for (const entry of history) {
        if (!entry || typeof entry.resourceType !== "string") continue;
        grouped[entry.resourceType] = Array.isArray(entry.history)
            ? entry.history
            : [];
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

function vwap(orders, expectedType, targetVolume, descending) {
    if (targetVolume <= 0 || !Array.isArray(orders)) return null;
    const expected = expectedType;
    const eligible = orders
        .filter((order) => orderType(order, expected))
        .filter((order) => numberOrZero(order.price) > 0 && numberOrZero(order.amount) > 0)
        .sort((left, right) => descending
            ? right.price - left.price
            : left.price - right.price);
    let remaining = targetVolume;
    let amount = 0;
    let value = 0;
    for (const order of eligible) {
        const taken = Math.min(remaining, numberOrZero(order.amount));
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

function buildResource(resourceType, days, orders) {
    const metrics = historyMetrics(days);
    const lowPercent = config.get("market.vwapDepthPercentLow", 0.01);
    const highPercent = config.get("market.vwapDepthPercentHigh", 0.1);
    const depths = vwapDepths(metrics.averageDailyVolume);
    const sellType = typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell";
    const buyType = typeof ORDER_BUY !== "undefined" ? ORDER_BUY : "buy";
    return {
        resourceType,
        weightedHistory: metrics.weightedHistory,
        averageDailyVolume: metrics.averageDailyVolume,
        bestSell: bestPrice(orders, sellType, false),
        bestBuy: bestPrice(orders, buyType, true),
        vwapDepth: { sell: depths, buy: depths },
        vwap: {
            sell: {
                [lowPercent]: vwap(orders, sellType, depths.low, false),
                [highPercent]: vwap(orders, sellType, depths.high, false),
            },
            buy: {
                [lowPercent]: vwap(orders, buyType, depths.low, true),
                [highPercent]: vwap(orders, buyType, depths.high, true),
            },
        },
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
    const interval = Math.max(1, Number(config.get("market.scanInterval", 100)) || 100);
    if (lastSnapshot && lastScanTick !== null && Game.time - lastScanTick < interval) {
        return lastSnapshot;
    }
    const market = typeof Game !== "undefined" && Game.market;
    let history = [];
    let orders = [];
    if (market && typeof market.getHistory === "function") {
        try { history = market.getHistory() || []; } catch (error) { history = []; }
    }
    if (market && typeof market.getAllOrders === "function") {
        try { orders = market.getAllOrders() || []; } catch (error) { orders = []; }
    }
    const histories = historyByResource(history);
    const groupedOrders = groupOrders(orders);
    const resources = {};
    for (const resourceType of resourceTypes()) {
        resources[resourceType] = buildResource(
            resourceType,
            histories[resourceType],
            groupedOrders[resourceType]
        );
    }
    lastScanTick = Game.time;
    lastSnapshot = { tick: Game.time, resources };
    return lastSnapshot;
}

function snapshot() {
    return lastSnapshot;
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
        .filter((result) => result.averageDailyVolume > 0)
        .map((result) => ({
            resourceType: result.resourceType,
            weightedHistory: result.weightedHistory,
            bestSell: result.bestSell,
            bestBuy: result.bestBuy,
            averageDailyVolume: result.averageDailyVolume,
        }));
    console.log(JSON.stringify(summary));
    return summary;
}

global.marketPrice = marketPrice;

module.exports = {
    scan,
    snapshot,
    groupOrders,
    historyMetrics,
    vwap,
    vwapDepths,
    marketPrice,
};