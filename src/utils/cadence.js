"use strict";
// Periodic work on a fixed grid. Everything that runs "every N ticks" uses a multiple of
// 60 (Grafana samples once a minute, and jobs whose intervals divide one another land on
// the same tick, so they can share what they read - utils/orderBook).
//
// due(last, interval) is true on the first tick of a new `interval`-sized bucket counted
// from tick 0 (not "N ticks after the last run"): a skipped tick - low-bucket shedding, a
// guard that threw - runs at the next one, and two jobs on intervals 60 and 120 coincide.
// `last` is the tick the job last ran (null/undefined = never: due at once).
function due(last, interval) {
    if (last === null || last === undefined || Game.time < last) return true;
    const size = Math.max(1, Number(interval) || 1);
    return Math.floor(Game.time / size) !== Math.floor(last / size);
}

module.exports = { due };
