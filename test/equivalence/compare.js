"use strict";
// ROADMAP 0145: offline oracle. Runs a reference and a candidate implementation over
// the same worlds and reports every observable difference. `project(result, world)`
// reduces a run to what must not change (intents, targets, amounts, order, fees,
// stock, claims...); the default compares the whole result.
function stable(value) {
    return JSON.stringify(value, (key, v) => {
        if (v && typeof v === "object" && !Array.isArray(v)) {
            return Object.keys(v).sort().reduce((o, k) => { o[k] = v[k]; return o; }, {});
        }
        return v;
    });
}
function clone(world) { return JSON.parse(JSON.stringify(world)); }

function compareImplementations(reference, candidate, worlds, project) {
    const projection = project || ((result) => result);
    const divergences = [];
    worlds.forEach((world, index) => {
        let expected, actual, expectedError = null, actualError = null;
        try { expected = projection(reference(clone(world)), world); } catch (e) { expectedError = String(e && e.message || e); }
        try { actual = projection(candidate(clone(world)), world); } catch (e) { actualError = String(e && e.message || e); }
        if (expectedError !== actualError) { divergences.push({ index, expectedError, actualError }); return; }
        const a = stable(expected), b = stable(actual);
        if (a !== b) divergences.push({ index, expected: a, actual: b });
    });
    return { equal: divergences.length === 0, divergences };
}

module.exports = { compareImplementations };
