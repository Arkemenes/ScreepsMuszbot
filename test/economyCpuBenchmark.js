// Standalone cold/warm geometry benchmark; timings are evidence, not assertions.
const { performance } = require("perf_hooks");
global.Memory = { settings: { craft: {} } };
const slots = require(process.argv[2] || "../src/utils/labSlots");
const research = require("../docs/lab-search/recipes.cjs");
for (const product of ["XLH2O", "XGH2O"]) for (const count of [3, 6, 10]) {
    slots.resetCache();
    const tree = research.tree(product);
    let reads = 0;
    const watch = (n) => {
        if (typeof n === "string") return;
        const inputs = n.inputs; inputs.forEach(watch);
        Object.defineProperty(n, "inputs", { get() { reads++; return inputs; } });
    };
    watch(tree);
    const built = slots.SLOT_NUMBERS.slice(0, count);
    const nodesBefore = slots.perf && slots.perf.nodes;
    const start = performance.now(), cold = slots.planPhases(tree, built);
    const coldMs = performance.now() - start, coldReads = reads;
    const warmStart = performance.now();
    for (let i = 0; i < 100; i++) slots.planPhases(tree, built);
    console.log(JSON.stringify({ product, count, ok: cold.ok, moves: cold.moves,
        coldReads, warmReads: reads - coldReads, coldMs: +coldMs.toFixed(3),
        nodes: slots.perf ? slots.perf.nodes - nodesBefore : null,
        warm100Ms: +(performance.now() - warmStart).toFixed(3) }));
}
const portfolioMs = [];
for (let run = 0; run < 3; run++) {
    slots.resetCache();
    const start = performance.now();
    for (const product of research.products) for (const count of [3, 6, 10]) {
        slots.planPhases(research.tree(product), slots.SLOT_NUMBERS.slice(0, count));
    }
    portfolioMs.push(+(performance.now() - start).toFixed(3));
}
console.log(JSON.stringify({ portfolio: "10 products x 3 topologies", runsMs: portfolioMs,
    medianMs: portfolioMs.sort((a, b) => a - b)[1] }));
