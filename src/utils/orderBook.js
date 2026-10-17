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
let sourceMarket = null;
const filtered = new Map();
const rawQueries = new Map();
let allCovered = false;
const cpuMeter = require("./cpuMeter");

function currentMarket() {
    const market = typeof Game !== "undefined" && Game.market;
    const fetch = market && typeof market.getAllOrders === "function" ? market.getAllOrders : null;
    if (tick !== Game.time || source !== fetch || sourceMarket !== market) {
        tick = Game.time;
        orders = null;
        source = fetch;
        sourceMarket = market;
        filtered.clear();
        rawQueries.clear(); allCovered = false;
        byResourceFor = null; byResourceIndex = null;
    }
    return market;
}

function all() {
    const market = currentMarket();
    if (!orders) {
        let book = [];
        if (source) {
            try {
                const value = cpuMeter.span("market.bookAll", () => market.getAllOrders());
                allCovered = Array.isArray(value); book = allCovered ? value : [];
            } catch (error) { book = []; }
        }
        orders = book;
    }
    return orders;
}

function query(type, resourceType) {
    const market = currentMarket();
    const key = type + ":" + resourceType;
    if (rawQueries.has(key)) return rawQueries.get(key);
    let subset = allCovered && orders ? orders.filter((order) => order && order.type === type && order.resourceType === resourceType) : null;
    let covered = allCovered;
    if (!subset) {
        try {
            const value = source ? cpuMeter.span("market.bookFiltered", () =>
                market.getAllOrders({ type, resourceType })) : null;
            covered = Array.isArray(value); subset = covered ? value : [];
        } catch (error) { subset = []; }
    }
    const value = { orders: subset, covered };
    // A failed fetch is not an immutable book: a later call may recover this tick.
    if (covered) rawQueries.set(key, value);
    return value;
}
function filteredOrders(key, raw) {
    const saved = filtered.get(key);
    if (saved && saved.source === raw) return saved.orders;
    const split = key.indexOf(":");
    const type = key.slice(0, split), resourceType = key.slice(split + 1);
    const orders = raw.orders.filter((order) => order && order.type === type && order.resourceType === resourceType);
    filtered.set(key, { source: raw, orders });
    return orders;
}
function matching(type, resourceType) {
    const key = type + ":" + resourceType;
    return filteredOrders(key, query(type, resourceType));
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
    sourceMarket = null;
    filtered.clear();
    rawQueries.clear(); allCovered = false;
    byResourceIndex = null;
    byResourceFor = null;
}

function quote(type, resourceType) {
    const raw = query(type, resourceType);
    return { orders: filteredOrders(type + ":" + resourceType, raw), covered: raw.covered };
}
module.exports = { all, matching, byResource, query, quote, reset };
