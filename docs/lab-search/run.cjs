"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const { recipes, products, order } = require("./recipes.cjs");
const { trios, simulate } = require("./model.cjs");
const { baselinePlans, beamPlans, exactSmall, WIDTH, LIMIT, EXACT_LIMIT } = require("./search.cjs");
const ROOT = path.resolve(__dirname, "../..");
const RESULT_PATH = path.join(ROOT, "docs/lab-search-results.json");
const TABLE_PATH = path.join(ROOT, "docs/lab-search-comparison.csv");
function planId(plan) { return crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16); }
function compare(a, b) { return a.ticks - b.ticks || a.movement - b.movement || a.switches - b.switches || a.planId.localeCompare(b.planId); }
function metrics(result, id, name, family) {
    const { trace, produced, ...rest } = result;
    return { planId: id, name, family, ...rest };
}
function computeProduct(product, quick) {
    const rows = [], plans = {};
    for (const count of quick ? [10] : [3, 6, 10]) {
        const built = Array.from({ length: count }, (_, i) => i + 1);
        let templates;
        for (const qty of quick ? [20, 3000] : [5, 20, 100, 500, 3000]) {
            const base = { product, qty, built }, search = beamPlans(product, qty, built, templates);
            templates = search.templates;
            const baseline = baselinePlans(product, qty, built);
            const reference = baseline.slice();
            const extras = baseline.map((p) => ({ ...p, name: p.name + "-reassign", family: "hybrid", reassign: true }));
            const heuristic = [...reference, ...extras, ...search.candidates];
            const exact = count === 3 && qty <= 20 ? exactSmall(product, qty, built) : null;
            const candidates = heuristic.concat(exact && exact.plan ? [exact.plan] : []);
            const distinct = [...new Map(candidates.map((p) => [planId(p), p])).entries()];
            const geometry = { directedTrios: trios(built).length, outputInputPairs: trios(built).length / 2 };
            const modes = [{ bandwidth: null, delay: 0 }];
            for (const bandwidth of quick ? [2, 4] : [2, 4, 8, 16]) for (const delay of quick ? [0] : [0, 50, 200]) modes.push({ bandwidth, delay });
            for (const mode of modes) {
                const scenario = { ...base, ...mode }, outcomes = [];
                for (const [id, plan] of distinct) {
                    const result = simulate(plan, scenario);
                    outcomes.push(metrics(result, id, plan.name, plan.family));
                }
                const completed = outcomes.filter((r) => r.status === "complete").sort(compare);
                assert(completed.length, "0128 at least one complete reference/candidate: " + JSON.stringify(scenario));
                const references = outcomes.filter((r) => reference.some((p) => planId(p) === r.planId));
                const baselineComplete = references.filter((r) => r.status === "complete").sort(compare);
                const winner = completed[0];
                if (baselineComplete.length) assert(winner.ticks <= baselineComplete[0].ticks, "0128 never regress reference");
                plans[winner.planId] = distinct.find(([id]) => id === winner.planId)[1];
                for (const ref of references) plans[ref.planId] = distinct.find(([id]) => id === ref.planId)[1];
                const heuristicBest = completed.find((r) => r.name !== "exact");
                let proof = null;
                if (exact && mode.bandwidth === null) {
                    const { plan, actions, ...details } = exact;
                    proof = { ...details, heuristicTicks: heuristicBest && heuristicBest.ticks,
                        heuristicGap: exact.ticks == null ? null : heuristicBest.ticks - exact.ticks };
                    if (exact.reason === "optimal-proved") {
                        const replay = outcomes.find((r) => r.name === "exact");
                        assert.equal(replay.ticks, exact.ticks, "0128 exact physical replay");
                        assert.equal(winner.ticks, exact.ticks, "0128 exact winner");
                    }
                }
                const id = `${product}-RCL${count === 3 ? 6 : count === 6 ? 7 : 8}-Q${qty}-B${mode.bandwidth == null ? "inf" : mode.bandwidth}-D${mode.delay}`;
                rows.push({ id, ...scenario, rcl: count === 3 ? 6 : count === 6 ? 7 : 8, geometry, winner,
                    bestReferenceTicks: baselineComplete.length ? baselineComplete[0].ticks : null,
                    speedup: baselineComplete.length ? baselineComplete[0].ticks / winner.ticks : null,
                    references, unavailableReferences: baseline.unavailable || [], search: { width: WIDTH, expansionLimit: LIMIT, expanded: search.expanded, reason: search.reason,
                        layoutTruncated: search.layoutTruncated, windowLimits: search.windowLimits,
                        generatedCandidates: search.candidates.length, evaluated: distinct.length,
                        complete: completed.length, stalled: outcomes.filter((r) => r.status === "stalled").length,
                        simulationLimit: outcomes.filter((r) => r.status === "limit").length }, exact: proof });
            }
            if (parentPort) parentPort.postMessage({ progress: `${product} labs=${count} qty=${qty}: ${modes.length} cenários concluídos` });
        }
    }
    return { rows, plans };
}
function verifyLegacy() {
    const expected = { 3: [65908, 65936], 6: [27658, 16436], 10: [22783, 8186, 12978] };
    for (const count of [3, 6, 10]) {
        const scenario = { product: "XLH2O", qty: 3000, built: Array.from({ length: count }, (_, i) => i + 1) };
        const results = baselinePlans(scenario.product, scenario.qty, scenario.built).map((p) => simulate(p, scenario));
        assert.deepEqual(results.map((r) => r.ticks), expected[count], "0128 legacy times");
    }
    return expected;
}
function selfTest() {
    verifyLegacy();
    assert.equal(products.length, 10); assert.equal(recipes.XLH2O.cooldown, 65);
    assert.equal(order("XGH2O").length, 7);
    for (const count of [3, 6, 10]) {
        const built = Array.from({ length: count }, (_, i) => i + 1);
        assert(trios(built).every((g) => g.a !== g.b && g.out !== g.a && g.out !== g.b));
    }
    const built = Array.from({ length: 10 }, (_, i) => i + 1);
    const pipeline = baselinePlans("XLH2O", 100, built).find((p) => p.family === "pipeline");
    const physical = simulate(pipeline, { product: "XLH2O", qty: 100, built }, { trace: true });
    assert.equal(physical.status, "complete");
    assert(physical.peakDualRoleLabs >= 3, "0128 multiple dual-role labs");
    assert.equal(physical.trace.dualRolePeriods.reduce((sum, p) => sum + (p.end - p.start) * p.slots.length, 0), physical.dualRoleTicks, "0128 dual-role durations include idle cooldown intervals");
    const trace = physical.trace.reactions;
    for (const p of ["LH2O", "XLH2O"]) {
        const first = trace.find((r) => r.product === p);
        assert(recipes[p].inputs.filter((r) => recipes[r]).every((r) => trace.some((x) => x.product === r && x.tick < first.tick)), "0128 no same-tick new input");
    }
    const exact = exactSmall("XLH2O", 20, [1, 2, 3]);
    assert.equal(exact.reason, "optimal-proved"); assert.equal(exact.ticks, 86);
    const replay = simulate(exact.plan, { product: "XLH2O", qty: 20, built: [1, 2, 3] }, { trace: true });
    assert.equal(replay.ticks, exact.ticks);
    assert(replay.cooldownSwitches > 0, "0128 role changes while cooling");
    const last = new Map();
    for (const r of replay.trace.reactions) {
        const previous = last.get(r.out);
        if (previous) assert(r.tick - previous.tick >= recipes[previous.product].cooldown, "0128 cooldown preserved across products");
        last.set(r.out, r);
    }
    assert.equal(exactSmall("XLH2O", 20, [1, 2, 3], 1).reason, "state-limit", "0128 truncated search is not proof");
    const finite = simulate(pipeline, { product: "XLH2O", qty: 100, built, bandwidth: 2, delay: 50 });
    assert.equal(finite.status, "complete"); assert(finite.ticks > physical.ticks);
    const b = beamPlans("XLH2O", 20, [1, 2, 3]);
    assert(b.expanded <= LIMIT && b.candidates.length <= WIDTH);
    const same = beamPlans("XLH2O", 20, [1, 2, 3]);
    assert.deepEqual(b.candidates, same.candidates, "0128 deterministic beam");
    console.log("0128: legacy, conservation, snapshot, shared inputs, dual roles, cooldown, transport, exact and beam checks passed");
}
function save(results, legacy, quick) {
    const rows = results.flatMap((r) => r.rows).sort((a, b) => a.id.localeCompare(b.id));
    const plans = Object.assign({}, ...results.map((r) => r.plans));
    const data = { schema: 1, quick, source: "https://github.com/screeps/common/blob/master/lib/constants.js", verifiedDate: "2026-10-11",
        model: { bandwidth: "aggregate lab interfaces; no idle credit accumulation", delay: "per lab role switch after drain; cooldown preserved", buffer: "max(40,10*N) divided between copies",
            beam: "production windows and connected/independent groups; not all possible intents", width: WIDTH, expansionLimit: LIMIT, exactStateLimit: EXACT_LIMIT,
            proof: "three-lab triangle, qty<=20, instant logistics only", excluded: ["powers", "boosts", "market", "actual creep movement"] },
        legacy, recipes, products, rows, plans };
    fs.writeFileSync(RESULT_PATH, JSON.stringify(data, null, 2) + "\n");
    const header = "case,product,rcl,qty,bandwidth,delay,winner,family,ticks,movement,switches,dual_role_peak,reference_ticks,speedup,beam_expanded,beam_reason,exact_reason,exact_ticks\n";
    const csv = rows.map((r) => [r.id, r.product, r.rcl, r.qty, r.bandwidth == null ? "inf" : r.bandwidth, r.delay,
        r.winner.name, r.winner.family, r.winner.ticks, r.winner.movement, r.winner.switches, r.winner.peakDualRoleLabs,
        r.bestReferenceTicks, r.speedup, r.search.expanded, r.search.reason, r.exact && r.exact.reason, r.exact && r.exact.ticks].join(",")).join("\n");
    fs.writeFileSync(TABLE_PATH, header + csv + "\n");
    console.log(`Saved ${rows.length} scenarios, ${Object.keys(plans).length} replayable plans: docs/lab-search-results.json and docs/lab-search-comparison.csv`);
}
async function main(args = process.argv.slice(2)) {
    if (args.includes("--self-test")) { selfTest(); return; }
    if (args.includes("--replay")) {
        const id = args[args.indexOf("--replay") + 1], data = JSON.parse(fs.readFileSync(RESULT_PATH, "utf8"));
        const row = data.rows.find((r) => r.id === id); assert(row, "Unknown scenario: " + id);
        const plan = data.plans[row.winner.planId], result = simulate(plan, row, { trace: args.includes("--trace") });
        assert.deepEqual(metrics(result, row.winner.planId, plan.name, plan.family), row.winner, "0128 replay metrics");
        if (result.trace) fs.writeFileSync(path.join(ROOT, "docs/lab-search-trace.json"), JSON.stringify({ id, plan, result }, null, 2) + "\n");
        console.log(JSON.stringify({ id, ...metrics(result, row.winner.planId, plan.name, plan.family) }, null, 2)); return;
    }
    const quick = args.includes("--quick");
    const selected = args.includes("--products") ? args[args.indexOf("--products") + 1].split(",") : quick ? ["XLH2O"] : products;
    assert(selected.every((p) => products.includes(p)), "Unknown catalyzed compound");
    const workerCount = args.includes("--workers") ? Number(args[args.indexOf("--workers") + 1]) : 4;
    assert(Number.isInteger(workerCount) && workerCount >= 1 && workerCount <= 4);
    const legacy = verifyLegacy(), results = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(workerCount, selected.length) }, async () => {
        while (next < selected.length) {
            const product = selected[next++];
            const result = await new Promise((resolve, reject) => {
                const worker = new Worker(__filename, { workerData: { product, quick } });
                worker.on("message", (msg) => { if (msg.progress) console.log(msg.progress); else if (msg.result) resolve(msg.result); });
                worker.on("error", reject);
                worker.on("exit", (code) => { if (code) reject(new Error("Research worker failed: " + product + " exit=" + code)); });
            });
            results.push(result);
        }
    }));
    save(results, legacy, quick);
}
if (!isMainThread) parentPort.postMessage({ result: computeProduct(workerData.product, workerData.quick) });
else if (require.main === module) main().catch((err) => { console.error(err); process.exitCode = 1; });
module.exports = { main, selfTest, verifyLegacy, computeProduct };
