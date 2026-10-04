"use strict";
// One unfiltered Game.market.getAllOrders() per tick, shared. utils/market (fair-price
// snapshot) and utils/marketFlip (arbitrage scan) each fetched the whole book on their own -
// the biggest single calls of the bot (6-19 CPU in one tick, cpuTop 2026-10-03). Their
// intervals are multiples of one base (60 ticks) and aligned to it (see due()), so they land
// on the same tick and the second one reuses the first one's copy. The orders are read-only
// for both callers. Their scans share a tick because both run on utils/cadence's 60-tick grid.

let tick = -1;
let orders = null;
let source = null; // the getAllOrders function the copy came from

function all() {
    const market = typeof Game !== "undefined" && Game.market;
    const fetch = market && typeof market.getAllOrders === "function" ? market.getAllOrders : null;
    if (tick !== Game.time || !orders || source !== fetch) {
        let book = [];
        if (fetch) {
            try { book = market.getAllOrders() || []; } catch (error) { book = []; }
        }
        tick = Game.time;
        orders = book;
        source = fetch;
    }
    return orders;
}

function reset() {
    tick = -1;
    orders = null;
    source = null;
}

module.exports = { all, reset };
