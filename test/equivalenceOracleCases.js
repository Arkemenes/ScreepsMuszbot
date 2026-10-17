// ROADMAP 0156-A: test the oracle with deliberately different implementations.
module.exports = function (project, assert) {
    const path = require("path");
    const { isDeepStrictEqual } = require("node:util");
    const { compareImplementations: compare, compareSequences } = require(path.join(project, "test/equivalence/compare"));
    const worlds = [{ claims: 0, intents: [], fees: 0, Memory: {} }];
    const claims = (n) => (world) => { world.claims = n; return "ok"; };
    const different = compare(claims(10), claims(999), worlds, (result, world) => ({ result, claims: world.claims }));
    assert(!different.equal, "0156 oracle divergent worlds: claims 10/999 with identical return diverge");
    assert(worlds[0].claims === 0, "0156 oracle divergent worlds: input world stays untouched");
    assert(!compare(claims(10), claims(999), worlds).equal,
        "0156 oracle divergent worlds: default projection includes executed state");
    assert(compare(claims(10), claims(10), worlds).equal,
        "0156 oracle divergent worlds: equivalent pair passes");
    const shared = { n: 0 };
    assert(compare((world) => { world.a.n++; return world.b.n; }, () => 1,
        [{ a: shared, b: shared }], (result) => result).equal,
        "0156 oracle divergent worlds: input aliases preserve fixture semantics");

    const action = (intents, fees = 0) => (world) => { world.intents = intents; world.fees = fees; };
    for (const [candidate, label] of [
        [action([{ type: "sell", amount: 5 }]), "intent"],
        [action([{ type: "buy", amount: 6 }]), "quantity"],
        [action([{ type: "buy", amount: 5 }], 2), "fee"],
    ]) {
        assert(!compare(action([{ type: "buy", amount: 5 }]), candidate, worlds).equal,
            "0156 oracle divergent worlds: detects changed " + label);
    }
    assert(!compare(action(["buy", "sell"]), action(["sell", "buy"]), worlds).equal,
        "0156 oracle divergent worlds: intent order is observable");
    assert(compare(() => ({ a: 1, b: 2 }), () => ({ b: 2, a: 1 }), [{}]).equal,
        "0156 oracle divergent worlds: object key order is irrelevant");
    const fail = (n, ErrorType = Error, message = "boom") => (world) => {
        world.Memory.partial = n;
        throw new ErrorType(message);
    };
    assert(!compare(fail(1), fail(2), worlds).equal,
        "0156 oracle divergent worlds: same error preserves different partial state");
    assert(!compare(fail(1), fail(1, TypeError), worlds).equal,
        "0156 oracle divergent worlds: error type is observable");
    assert(!compare(fail(1), fail(1, Error, "other"), worlds).equal,
        "0156 oracle divergent worlds: error message is observable");
    assert(compare(fail(1), fail(1), worlds).equal,
        "0156 oracle divergent worlds: equal errors and partial state pass");
    assert(!compare(() => undefined, () => null, [{}]).equal &&
        !compare(() => ({ x: undefined }), () => ({}), [{}]).equal,
        "0156 oracle divergent worlds: undefined is not silently omitted");
    const throws = (fn) => { try { fn(); return false; } catch (_) { return true; } };
    const cycle = {}; cycle.self = cycle;
    for (const value of [() => {}, 1n, NaN, new Map(), cycle]) {
        assert(throws(() => compare(() => value, () => value, [{}])),
            "0156 oracle divergent worlds: unsupported snapshot fails explicitly (" + typeof value + ")");
    }
    assert(throws(() => compare(() => 1, () => 1, [{}], () => { throw new Error("bad projection"); })),
        "0156 oracle divergent worlds: projection failure is a harness error");

    const fixture = path.join(project, "test/equivalence/fixtures/warmCounter");
    const beforeModule = require(fixture);
    const savedGame = global.Game, savedMemory = global.Memory, savedLog = console.log;
    const providerKey = "__oracleFixtureProvider";
    const previousProvider = Object.getOwnPropertyDescriptor(global, providerKey);
    const makeWorld = () => ({ Memory: { count: 0 }, trace: [] });
    const scenario = { createWorld: makeWorld, steps: [{ tick: 1 }, { tick: 2 }, { tick: 3 }] };
    const factory = (world) => {
        global.Game = { time: 0 };
        global.Memory = world.Memory;
        global[providerKey] = { value: "fixture" };
        const counter = require(fixture);
        return (step) => {
            Game.time = step.tick;
            Memory.count++;
            world.trace.push(counter.next() + ":" + counter.providerValue());
            return Memory.count;
        };
    };
    const equivalent = compareSequences(factory, factory, [scenario, scenario]);
    assert(equivalent.equal,
        "0156 oracle warm isolation: fresh world/modules/providers for every variant and scenario");
    assert(global.Game === savedGame && global.Memory === savedMemory && require(fixture) === beforeModule &&
        isDeepStrictEqual(Object.getOwnPropertyDescriptor(global, providerKey), previousProvider),
        "0156 oracle warm isolation: original globals and module cache restored");

    const warmReference = (world) => {
        const counter = require(fixture);
        return (step) => { world.trace.push(counter.next()); return step.tick * 2; };
    };
    const staleCandidate = (world) => {
        const counter = require(fixture);
        let cached;
        return (step) => { world.trace.push(counter.next()); if (cached === undefined) cached = step.tick * 2; return cached; };
    };
    const warm = compareSequences(warmReference, staleCandidate, [scenario]);
    assert(!warm.equal && warm.divergences.length === 2 && warm.divergences[0].step === 1,
        "0156 oracle warm isolation: cache survives steps and stale second step diverges");
    const assertWarm = (world) => {
        const counter = require(fixture);
        return (step) => {
            const next = counter.next();
            if (next !== step.tick) throw new Error("module cache was cleared between steps");
            world.Memory.count = next;
            return next;
        };
    };
    assert(compareSequences(assertWarm, (world) => (step) => {
        world.Memory.count = step.tick; return step.tick;
    }, [scenario]).equal, "0156 oracle warm isolation: module heap remains warm between steps");

    const badFactory = () => {
        global.Game = { time: -1 };
        global[providerKey] = {};
        console.log = () => {};
        require(fixture);
        throw new Error("factory failed");
    };
    assert(throws(() => compareSequences(badFactory, factory, [scenario])) && global.Game === savedGame &&
        global.Memory === savedMemory && console.log === savedLog && require(fixture) === beforeModule &&
        isDeepStrictEqual(Object.getOwnPropertyDescriptor(global, providerKey), previousProvider),
        "0156 oracle warm isolation: finally restores globals/providers/modules after factory error");
    assert(throws(() => compareSequences(factory, factory, [scenario], () => { throw new Error("projection failed"); })) &&
        global.Game === savedGame && global.Memory === savedMemory && console.log === savedLog,
        "0156 oracle warm isolation: finally restores after projection error");
    const methods = { createWorld: () => ({ count: 0, add() { return ++this.count; } }), steps: [0, 1] };
    assert(compareSequences((world) => () => world.add(), (world) => () => world.add(), [methods],
        (result, world) => ({ result, count: world.count })).equal,
        "0156 oracle warm isolation: fixture reconstructs methods and explicitly projects data");
};
