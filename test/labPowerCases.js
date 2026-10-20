module.exports = function (project, assert) {
    const path = require("path"), load = (n) => require(path.join(project, "src/utils", n));
    const fixture = require("./fixtures/0150-lab-power.json");
    const amount = load("labReactionAmount"), execute = load("labReactions").execute, model = load("labPlanModel");
    const saved = { game: Game, memory: Memory, power: global.PWR_OPERATE_LAB, info: global.POWER_INFO,
        reactions: global.REACTIONS, time: global.REACTION_TIME };
    let a, b, out, second, calls;
    function reset(q = 14) {
        global.Memory = { rooms: { PowerLabRoom: {} }, craft: { active: {} }, settings: {} };
        global.Game = { ...saved.game, time: (Game.time || 1000) + 1 };
        calls = 0;
        const lab = (id, resource, quantity) => ({ id, room: { name: "PowerLabRoom" }, cooldown: 0, mineralType: resource,
            store: resource ? { [resource]: quantity } : {}, runReaction: () => { calls++; return OK; } });
        a = lab("power-a", "H", q); b = lab("power-b", "O", q); out = lab("power-out", null, 0); second = lab("power-second", null, 0);
        out.effects = second.effects = [{ effect: 5, level: 1, ticksRemaining: 1 }];
        Game.getObjectById = (id) => [a, b, out, second].find((l) => l.id === id);
        Memory.rooms.PowerLabRoom.labReactions = [{ a: "H", b: "O", product: "OH", input1: a.id, input2: b.id,
            output: out.id, outputs: [out.id, second.id], remaining: q }];
        global.PWR_OPERATE_LAB = fixture.power; global.POWER_INFO = { [fixture.power]: { effect: fixture.extras } };
        global.REACTIONS = { H: { O: "OH" }, O: { H: "OH" } }; global.REACTION_TIME = { OH: 20 };
    }
    try {
        reset();
        for (let level = 1; level <= 5; level++) {
            const power = amount.snapshot({ effects: [{ effect: 5, level, ticksRemaining: 1 }] });
            assert(amount.amount(power) === fixture.base + fixture.extras[level - 1] && amount.amount(power, 1) === fixture.base,
                "0150 lab: level " + level + " uses full quantity on last active tick and base after expiry");
        }
        assert(amount.amount(amount.snapshot({ effects: [{ effect: 5, level: 1, ticksRemaining: 10 },
            { effect: 999, ticksRemaining: 10 }] })) === null, "0150 lab: an additional unknown effect remains unsupported");
        assert(!amount.canFinish(21, [{ amount: 7, count: 1 }]) && amount.canFinish(21, [{ amount: 7, count: 3 }]),
            "0150 lab: strict feasibility respects the bounded number of future operated calls");
        assert(amount.canFinish(1000, []) && !amount.canFinish(3, [{ amount: 7, count: 4 }]),
            "0150 lab: large base quotas stay constant-size and an impossible residual is rejected");
        reset(7); execute(out); execute(second);
        assert(calls === 1, "0150 lab: shared inputs fund only one seven-unit reaction, not two five-unit reservations");
        reset(6); execute(out); assert(calls === 0, "0150 lab: base-sized inputs never fund an operated reaction");
        reset(14); out.store.OH = 2994; execute(out);
        assert(calls === 0, "0150 lab: capacity is checked against the full operated amount");
        reset(10); execute(out); execute(second);
        assert(calls === 0, "0150 lab: strict quota rejects an operated call that would leave an impossible tail");
        reset(14);
        const state = { pending: [], wait: {}, produced: {}, geometry: [a.id, b.id, out.id].join(",") };
        Memory.craft.active.owner = { queue: [{ run: state }], qi: 0 };
        Memory.rooms.PowerLabRoom.labReactions[0].owner = "owner"; execute(out); execute(second);
        assert(state.pending.length === 2 && state.pending.every((p) => p.amount === 7),
            "0150 lab: owned pending stores quantitative amounts across shared outputs");
        // Reconcile a supported quantity after the visible effect has expired.
        state.pending = state.pending.slice(0, 1); out.effects = []; out.cooldown = 19; out.store.OH = 7;
        Game.time++; load("labPolicyRuntime").reconcile({ name: "PowerLabRoom" }, {}, { run: state });
        assert(state.produced.OH === 7 && state.pending.length === 0,
            "0150 lab: expired-effect confirmation advances by the persisted amount rather than a literal five");
        const plan = { phases: [{ products: ["OH"], layout: ["H", "O", "OH"] }] };
        const scenario = (qty, remaining) => ({ product: "OH", qty, built: [1, 2, 3], steps: ["OH"], stock: {},
            recipes: { OH: { inputs: ["H", "O"], cooldown: 1 } }, labs: [
                { role: "H", amount: qty }, { role: "O", amount: qty },
                { role: "OH", amount: 0, reactionPower: { extra: 2, remaining } }], bandwidth: null });
        const operated = model.simulate(plan, scenario(14, 100), { maxTicks: 100, trace: true });
        assert(operated.status === "complete" && operated.calls === 2 && operated.produced.OH === 14,
            "0150 lab: model completes fourteen units with two operated calls and conserves inputs");
        const mixed = model.simulate(plan, scenario(12, 1), { maxTicks: 100, trace: true });
        assert(mixed.status === "complete" && mixed.trace.reactions.map((r) => r.amount).join() === "7,5",
            "0150 lab: model handles effect expiry between reactions without changing the target");
        const tail = model.simulate(plan, scenario(10, 1), { maxTicks: 100 });
        assert(tail.status === "complete" && tail.produced.OH === 10,
            "0150 lab: strict quota ten waits for expiry and finishes exactly instead of creating a tail of three");
        reset(14); out.effects[0].ticksRemaining = 100;
        const ledger = load("craftLedger"); load("marketPricing").resetCaches();
        const chain = { id: "ledger-owner", key: "ledger-owner", room: "PowerLabRoom", state: "working", qi: 0,
            queue: [{ kind: "lab", product: "OH", started: true }], buys: {}, economics: { operations: {} } };
        Memory.craft.active[chain.key] = chain;
        ledger.ensure(chain, { H: 14, O: 14 }); execute(out);
        assert(chain.inventory.pending[0].quantity === 7,
            "0150 lab: inventory ledger reserves the operated quantity rather than five");
        out.store.OH = 7; out.mineralType = "OH"; out.effects[0].ticksRemaining--; Game.time++; ledger.settle(chain);
        assert(chain.inventory.production.OH === 7 && chain.inventory.balances.H === 7 && chain.inventory.balances.O === 7,
            "0150 lab: confirmed inventory consumes seven of each reagent and records seven product units");
        Game.time++; out.cooldown = 0; execute(out);
        out.store.OH += 9; out.effects = [{ effect: 5, level: 2, ticksRemaining: 100 }]; Game.time++; ledger.settle(chain);
        assert(chain.inventory.uncertainProduction && chain.inventory.production.OH === 7 && !ledger.totals(chain).known,
            "0150 lab: a concurrent effect change never books the predicted quantity as confirmed production");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory;
        load("marketPricing").resetCaches();
        for (const [key, value] of [["PWR_OPERATE_LAB", saved.power], ["POWER_INFO", saved.info], ["REACTIONS", saved.reactions], ["REACTION_TIME", saved.time]]) {
            if (value === undefined) delete global[key]; else global[key] = value;
        }
    }
};
