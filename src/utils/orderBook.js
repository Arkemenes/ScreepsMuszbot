"use strict";
// One unfiltered Game.market.getAllOrders() per tick, shared. utils/market (fair-price
// snapshot) and utils/marketFlip (arbitrage scan) each fetched the whole book on their own -
// the biggest single calls of the bot (6-19 CPU in one tick, cpuTop 2026-10-03). Their
// intervals are multiples of one base (60 ticks) and aligned to it (see due()), so they land
// on the same tick and the second one reuses the first one's copy. The orders are read-only
// for both callers. Their scans share a tick because both run on utils/cadence's 60-tick grid.

// Single-resource quotes use matching(): fetch a filtered book, or reuse all()
// when a full snapshot already exists. Both caches expire at the next tick.
let tick = -1;
let orders = null;
let source = null; // the getAllOrders function the copy came from
const filtered = new Map();
const cpuMeter = require("./cpuMeter");

function currentMarket() {
    const market = typeof Game !== "undefined" && Game.market;
    const fetch = market && typeof market.getAllOrders === "function" ? market.getAllOrders : null;
    if (tick !== Game.time || source !== fetch) {
        tick = Game.time;
        orders = null;
        source = fetch;
        filtered.clear();
    }
    return market;
}

function all() {
    const market = currentMarket();
    if (!orders) {
        let book = [];
        if (source) {
            try { book = cpuMeter.span("market.bookAll", () => market.getAllOrders() || []); } catch (error) { book = []; }
        }
        orders = book;
    }
    return orders;
}

function matching(type, resourceType) {
    const market = currentMarket();
    const key = type + ":" + resourceType;
    if (filtered.has(key)) return filtered.get(key);
    let subset = orders;
    if (!subset) {
        try {
            subset = source ? cpuMeter.span("market.bookFiltered", () =>
                market.getAllOrders({ type, resourceType }) || []) : [];
        } catch (error) { subset = []; }
    }
    subset = subset.filter((order) => order && order.type === type && order.resourceType === resourceType);
    filtered.set(key, subset);
    return subset;
}

// ROADMAP 0147: the full book grouped by resource, built once per tick from all(). A scan that
// quotes the same book for dozens of (room, resource) pairs used to filter the whole book for
// each of them (swingTrade.tick: ~30 CPU per scan); each pair now walks only its resource.
// Same orders, same relative order as filtering all() by resourceType. Read-only.
const EMPTY = [];
let byResourceIndex = null;
let byResourceFor = null;
function byResource(resourceType) {
    const book = all();
    if (byResourceFor !== book) {
        byResourceIndex = new Map();
        for (let i = 0; i < book.length; i++) {
            const order = book[i];
            if (!order) continue;
            const list = byResourceIndex.get(order.resourceType);
            if (list) list.push(order); else byResourceIndex.set(order.resourceType, [order]);
        }
        byResourceFor = book;
    }
    return byResourceIndex.get(resourceType) || EMPTY;
}

function reset() {
    tick = -1;
    orders = null;
    source = null;
    filtered.clear();
    byResourceIndex = null;
    byResourceFor = null;
}

module.exports = { all, matching, byResource, reset };
