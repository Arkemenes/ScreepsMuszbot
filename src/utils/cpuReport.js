"use strict";
// ARK-145: one heap-only request. No counters or ring scan while waiting.
const config = require("./config");
const meter = require("./cpuMeter");
let pending; // undefined: automatic request not considered; null: idle
function settings() {
    return { reuseOrderBook: !!config.get("terminalOps.reuseOrderBook", true), listingPolicy: !!config.get("listingPolicy.enabled", false) };
}
function arm(n, automatic = false) {
    const requestedCapacity = Number(config.get("stats.cpuBalanceWindowTicks", 600));
    const capacity = Number.isFinite(requestedCapacity) && requestedCapacity > 0 ? Math.max(1, Math.floor(requestedCapacity)) : 600;
    const value = Number(n);
    const requested = Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : 600;
    const count = Math.min(requested, capacity);
    const fromTick = automatic ? meter.accounting().bootTick + 1 : Game.time + 1;
    pending = { armedTick: Game.time, fromTick, toTick: fromTick + count - 1, requestedTicks: count,
        automatic, capped: count < requested, settings: settings() };
    return Object.assign({}, pending, { settings: Object.assign({}, pending.settings) });
}
function poll() {
    if (pending === undefined) {
        const auto = Number(config.get("stats.autoReportIntervals", 150));
        if (Number.isFinite(auto) && auto > 0) arm(auto, true);
        else pending = null;
    }
    if (!pending) return null;
    if (Game.time < pending.armedTick) {
        pending = null;
        return { cancelled: true, reason: "clock-rewind" };
    }
    if (Game.time <= pending.toTick) return null;
    const request = pending;
    pending = null;
    const current = settings();
    const settingsMatch = current.reuseOrderBook === request.settings.reuseOrderBook && current.listingPolicy === request.settings.listingPolicy;
    const balance = meter.accountingRange(request.fromTick, request.toTick);
    return Object.assign({}, request, { balance, settingsMatch, endingSettings: current, complete: balance.complete && settingsMatch });
}
function due() {
    return pending === undefined || !!(pending && (Game.time > pending.toTick || Game.time < pending.armedTick));
}
module.exports = { arm, poll, due };
