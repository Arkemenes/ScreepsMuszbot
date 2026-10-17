"use strict";
// ROADMAP 0156-A: offline only. Custom projections declare all relevant observables.
const { isDeepStrictEqual, inspect } = require("node:util");

// Copy supported data without dropping undefined, array holes or partial state.
// Fixture factories reconstruct methods; projections must expose data, not methods.
function copyData(value, ancestors = new Set(), copies = new Map()) {
    if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object") throw new TypeError("Unsupported oracle snapshot: " + typeof value);
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
        throw new TypeError("Unsupported oracle snapshot prototype");
    }
    if (ancestors.has(value)) throw new TypeError("Cyclic oracle snapshot");
    if (copies.has(value)) return copies.get(value);
    ancestors.add(value);
    const copy = Array.isArray(value) ? new Array(value.length) : Object.create(proto);
    copies.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
        if (Array.isArray(value) && key === "length") continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) {
            throw new TypeError("Unsupported oracle snapshot property");
        }
        Object.defineProperty(copy, key, { value: copyData(descriptor.value, ancestors, copies),
            enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(value);
    return copy;
}

function restoreBindings(target, descriptors) {
    for (const key of Reflect.ownKeys(target)) {
        if (!Object.prototype.hasOwnProperty.call(descriptors, key) && !Reflect.deleteProperty(target, key)) {
            throw new Error("Oracle cannot remove fixture binding: " + String(key));
        }
    }
    Object.defineProperties(target, descriptors);
}

// A factory installs fresh Game/Memory/providers instead of mutating host providers.
// Modules are fresh per variant, never per step. Host module identities are restored.
function isolated(run) {
    const globals = Object.getOwnPropertyDescriptors(globalThis);
    // Node may initialize lazy globals while their descriptors are inspected.
    for (const key of Reflect.ownKeys(globalThis)) {
        if (!Object.prototype.hasOwnProperty.call(globals, key)) globals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }
    const hostConsole = console;
    const consoleBindings = Object.getOwnPropertyDescriptors(hostConsole);
    const modules = Object.assign({}, require.cache);
    for (const key of Object.keys(require.cache)) delete require.cache[key];
    try {
        return run();
    } finally {
        try {
            restoreBindings(globalThis, globals);
        } finally {
            try {
                restoreBindings(hostConsole, consoleBindings);
            } finally {
                for (const key of Object.keys(require.cache)) delete require.cache[key];
                Object.assign(require.cache, modules);
            }
        }
    }
}

function observe(run, world, project) {
    let result, error = null;
    try { result = run(); } catch (caught) {
        error = {
            type: caught && caught.constructor ? caught.constructor.name : typeof caught,
            message: caught && caught.message !== undefined ? String(caught.message) : String(caught),
        };
    }
    // Projection/snapshot failures are harness failures, not equivalent bot errors.
    return copyData({ value: project(result, world, error), error });
}

const defaultProjection = (result, world) => ({ result, world });
function appendDifference(divergences, position, expected, actual) {
    if (!isDeepStrictEqual(expected, actual)) {
        const format = (value) => inspect(value, { depth: null, sorted: true, maxArrayLength: null, maxStringLength: null });
        divergences.push(Object.assign({}, position, { expected: format(expected.value), actual: format(actual.value),
            expectedError: expected.error, actualError: actual.error }));
    }
}

function compareImplementations(reference, candidate, worlds, project = defaultProjection) {
    const divergences = [];
    worlds.forEach((world, index) => {
        const run = (implementation) => isolated(() => {
            const executed = copyData(world);
            return observe(() => implementation(executed), executed, project);
        });
        appendDifference(divergences, { index }, run(reference), run(candidate));
    });
    return { equal: divergences.length === 0, divergences };
}

// Scenario: { createWorld: () => freshWorld, steps: [data, ...] }.
// Each variant factory(world) loads its modules/providers and returns (step, world).
// Do not capture production modules or mutable shared state outside the factory.
function compareSequences(referenceFactory, candidateFactory, scenarios, project = defaultProjection) {
    const divergences = [];
    scenarios.forEach((scenario, index) => {
        if (!Array.isArray(scenario.steps)) throw new TypeError("Oracle scenario needs steps");
        const run = (factory) => isolated(() => {
            const world = scenario.createWorld();
            const steps = copyData(scenario.steps);
            const execute = factory(world);
            if (typeof execute !== "function") throw new TypeError("Oracle factory must return a step function");
            return steps.map((step) => observe(() => execute(step, world), world, project));
        });
        const expected = run(referenceFactory), actual = run(candidateFactory);
        expected.forEach((record, step) => appendDifference(divergences, { index, step }, record, actual[step]));
    });
    return { equal: divergences.length === 0, divergences };
}

module.exports = { compareImplementations, compareSequences };
