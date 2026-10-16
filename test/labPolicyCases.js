"use strict";

module.exports = function labPolicyCases(PROJECT, assert) {
    const path = require("node:path");
    const load = (name) => require(path.join(PROJECT, name));
    const saved = { Memory: global.Memory, Game: global.Game, REACTIONS: global.REACTIONS, REACTION_TIME: global.REACTION_TIME };
    const research = load("docs/lab-search/recipes.cjs");
    const slots = load("src/utils/labSlots");
    const core = load("src/utils/labPlanModel");
    const config = load("src/utils/config");
    let runtime = load("src/utils/labPolicyRuntime"), policy = load("src/utils/labPolicy");
    const reactions = load("src/utils/labReactions");
    let clock = 800000;
    function store(values, cap) {
        const result = { ...values };
        Object.defineProperties(result, {
            getUsedCapacity: { value(r) { return r ? this[r] || 0 : Object.values(this).reduce((a, n) => a + n, 0); } },
            getCapacity: { value() { return cap; } },
            getFreeCapacity: { value() { return cap - this.getUsedCapacity(); } }
        });
        return result;
    }
    function world(product, qty, built, overrides = {}) {
        global.REACTIONS = {};
        global.REACTION_TIME = {};
        Object.entries(research.recipes).forEach(([p, r]) => {
            for (const [a, b] of [r.inputs, r.inputs.slice().reverse()]) {
                if (!REACTIONS[a]) REACTIONS[a] = {};
                REACTIONS[a][b] = p;
            }
            REACTION_TIME[p] = r.cooldown;
        });
        load("src/utils/marketPricing").resetCaches();
        global.Memory = { settings: { stockPolicy: { enabled: false }, craft: { labPolicy: true,
            labStrategy: "auto", wideLabs: true, policyBandwidth: "instant", policySwitchDelay: 0,
            policyWorkPerTick: 100000, policyBuffer: 100, policyReplanTicks: 1000000, partialSales: false,
            policyCandidates: 4, log: false, ...overrides } }, rooms: {}, craft: { active: {} } };
        const objects = {}, intents = [];
        const room = { name: "Policy" + (++clock), controller: { level: 8, my: true },
            find() { return labs; } };
        Memory.rooms[room.name] = {};
        const stock = research.rawStock(product, qty);
        room.storage = { id: "storage", store: store(stock, 1000000), room };
        objects.storage = room.storage;
        const labs = built.map((slot) => {
            const offset = slots.OFFSETS[slot];
            const pos = { x: 20 + offset[1], y: 20 + offset[0], roomName: room.name,
                getRangeTo(other) { const p = other.pos || other; return Math.max(Math.abs(this.x - p.x), Math.abs(this.y - p.y)); },
                inRangeTo(other, range) { return this.getRangeTo(other) <= range; } };
            const lab = { id: room.name + ":" + slot, my: true, structureType: STRUCTURE_LAB,
                pos, room, cooldown: 0, mineralType: null, store: store({}, 3000), isActive() { return true; },
                runReaction(a, b) { intents.push({ out: lab, a, b, product: REACTIONS[a.mineralType][b.mineralType] }); return OK; } };
            objects[lab.id] = lab;
            return lab;
        });
        global.Game = { time: clock, rooms: { [room.name]: room }, creeps: {},
            getObjectById(id) { return objects[id] || null; }, cpu: { bucket: 10000, getUsed() { return 0; } }, market: { orders: {} } };
        slots.resetCache();
        const steps = research.order(product).map((p) => ({ kind: "lab", product: p, batches: qty / 5 }));
        const item = policy.descriptor(steps);
        const chain = { id: room.name, key: room.name, room: room.name, product, qty, queue: [item], qi: 0,
            kinds: ["lab"], state: "working", stateTick: Game.time, holds: {}, buys: {}, reserved: 0,
            est: { spend: 0, cost: 1, revenue: 2, profit: 1 } };
        Memory.craft.active[room.name] = chain;
        return { room, labs, item, chain, intents, objects, steps };
    }
    function transport(w, budget) {
        const mem = Memory.rooms[w.room.name], desired = mem.labPolicyDesired || {}, inputs = mem.labPolicyInputs || {};
        if (!mem.labPolicyDesired) reactions.list(w.room.name).forEach((r) => {
            desired[r.input1] = r.a; desired[r.input2] = r.b;
            reactions.outputsOf(r).forEach((id) => { desired[id] = r.product; });
            inputs[r.input1] = [r.a, r.remaining || w.chain.qty];
            inputs[r.input2] = [r.b, r.remaining || w.chain.qty];
        });
        const jobs = [];
        w.labs.forEach((lab) => {
            const p = lab.mineralType;
            const held = mem.labPolicyHold && mem.labPolicyHold[lab.id] === p ||
                mem.labLoad && mem.labLoad[lab.id] && mem.labLoad[lab.id].includes(p);
            if (p && lab.store[p] && ((lab.id in desired && desired[lab.id] !== p) || !held &&
                !reactions.list(w.room.name).some((r) => r.keep && r.output === lab.id))) jobs.push({ lab, p, drain: true, n: lab.store[p] });
        });
        Object.entries(inputs).forEach(([id, [p, target, refill]]) => {
            if (refill === false) return;
            const lab = w.objects[id];
            if (!lab.mineralType || lab.mineralType === p)
                jobs.push({ lab, p, drain: false, n: Math.min(Math.max(0, target - (lab.store[p] || 0)), w.room.storage.store[p] || 0) });
        });
        // Fair rotating five-unit service at the start-of-tick logistics boundary.
        for (let n = 0; n < jobs.length * 1000 && budget > 0 && jobs.some((j) => j.n > 0); n++) {
            const job = jobs[(n + Game.time) % jobs.length];
            const amount = Math.min(job.n, budget, budget === Infinity ? job.n : 5,
                job.drain ? job.lab.store[job.p] || 0 : w.room.storage.store[job.p] || 0);
            if (!amount) continue;
            if (job.drain) { job.lab.store[job.p] -= amount; w.room.storage.store[job.p] = (w.room.storage.store[job.p] || 0) + amount; }
            else { w.room.storage.store[job.p] -= amount; job.lab.store[job.p] = (job.lab.store[job.p] || 0) + amount; }
            job.lab.mineralType = job.lab.store[job.p] ? job.p : null;
            job.n -= amount; budget -= amount;
        }
    }
    function engine(w, drop) {
        w.labs.forEach((l) => { l.cooldown = Math.max(0, l.cooldown - 1); });
        const calls = w.intents.splice(0);
        for (const intent of calls) {
            if (drop) { drop = false; continue; }
            const r = research.recipes[intent.product];
            assert((intent.a.store[r.inputs[0]] || intent.a.store[r.inputs[1]] || 0) >= 5 &&
                (intent.b.store[r.inputs[0]] || intent.b.store[r.inputs[1]] || 0) >= 5, "0127: shared input is consumed once");
            for (const lab of [intent.a, intent.b]) {
                lab.store[lab.mineralType] -= 5;
                if (!lab.store[lab.mineralType]) lab.mineralType = null;
            }
            intent.out.store[intent.product] = (intent.out.store[intent.product] || 0) + 5;
            intent.out.mineralType = intent.product;
            intent.out.cooldown = r.cooldown - 1;
        }
    }
    function run(w, options = {}) {
        let peak = 0, switchedCooling = false, dropped = false;
        for (let n = 0; n < 30000; n++) {
            if (options.chain) {
                load("src/utils/craftChain").tick();
                w.item = w.chain.queue[w.chain.qi] || w.item;
                if (w.chain.state === "selling") return { peak, switchedCooling };
            } else runtime.tick(w.room, w.chain, w.item);
            if (options.forcePlan && w.item.run.planId && !w.item.started) throw new Error("Unexpected force timing");
            if (options.forcePlan && n === 0) {
                w.item.run.planId = options.forcePlan; w.item.run.phase = 0; w.item.run.enter = true;
            }
            if (w.item.run && w.item.run.done) return { peak, switchedCooling };
            if (options.reset && n === 20) {
                const cloned = JSON.parse(JSON.stringify(Memory.craft.active[w.chain.key]));
                Memory.craft.active[w.chain.key] = cloned; w.chain = cloned; w.item = cloned.queue[0];
                for (const p of ["src/utils/labPolicy", "src/utils/labPolicyRuntime"]) delete require.cache[require.resolve(path.join(PROJECT, p))];
                policy = load("src/utils/labPolicy"); runtime = load("src/utils/labPolicyRuntime");
            }
            const mem = Memory.rooms[w.room.name];
            switchedCooling = switchedCooling || w.labs.some((l) => l.cooldown > 0 && mem.labPolicyDesired && mem.labPolicyDesired[l.id] !== l.mineralType);
            transport(w, options.bandwidth || Infinity);
            const list = reactions.list(w.room.name);
            peak = Math.max(peak, w.labs.filter((l) => list.some((r) => r.output === l.id) && list.some((r) => r.input1 === l.id || r.input2 === l.id)).length);
            const before = JSON.stringify(w.item.run && w.item.run.produced);
            w.labs.forEach((l) => reactions.execute(l));
            assert(JSON.stringify(w.item.run && w.item.run.produced) === before, "0127: OK is not confirmed production");
            const drop = options.drop && !dropped && w.intents.length > 0;
            engine(w, drop); dropped = dropped || drop;
            Game.time++;
        }
        throw new Error("Policy stalled: " + JSON.stringify(w.item.run));
    }
    try {
        let w = world("XLH2O", 20, [1, 2, 3]);
        {
            w.room.controller.pos={x:25,y:25};
            let activeChecks=0;
            w.labs.forEach(lab=>{lab.isActive=()=>{activeChecks++;return true;};});
            const initial=runtime.resolve(w.room);
            for(let i=0;i<20;i++){Game.time++;runtime.resolve(w.room);}
            assert(initial && activeChecks===w.labs.length,
                "ARK-116: unchanged lab activity is checked once across21ticks, not once per lab per tick");
            Memory.rooms[w.room.name].labBoostReservations={[w.labs[0].id]:true};
            const boosted=runtime.resolve(w.room);
            assert((!boosted || !boosted.built.includes(initial.built[0])) && activeChecks===w.labs.length,
                "ARK-116: new boost reservation changes usability without repeating activity checks");
            delete Memory.rooms[w.room.name].labBoostReservations;
            Memory.rooms[w.room.name].labLoad={[w.labs[0].id]:"boost"};
            Memory.rooms[w.room.name].labLoadAuto=false;
            assert(runtime.resolve(w.room)===null && activeChecks===w.labs.length,
                "ARK-116: manual lab loading is filtered live outside the activity cache");
            Memory.rooms[w.room.name].labLoadAuto=true;
            assert(runtime.resolve(w.room).built.length===initial.built.length && activeChecks===w.labs.length,
                "ARK-116: automatic loading does not reserve a cached-active lab");
            delete Memory.rooms[w.room.name].labLoad;delete Memory.rooms[w.room.name].labLoadAuto;
            w.room.controller.level=7;runtime.resolve(w.room);
            assert(activeChecks===w.labs.length*2,"ARK-116: controller level change invalidates lab activity");
            w.labs[0].isActive=()=>false;
            const disabled=runtime.resolve(w.room);
            assert(!disabled || !disabled.built.includes(initial.built[0]),
                "ARK-116: replacement activity method cannot reuse an old active result");
            w.labs[0].isActive=()=>true;w.room.controller.level=8;
            runtime.resolve(w.room);
            delete w.objects[w.labs[0].id];
            assert(runtime.resolve(w.room)===null,
                "ARK-116: a missing lab cannot remain usable through a cached activity result");
            w.objects[w.labs[0].id]=w.labs[0];
            delete w.room.controller.pos;
        }
        const scenario = runtime.snapshot(w.room, w.chain, w.item, runtime.resolve(w.room));
        const key = policy.request(w.item, scenario, true);
        assert(key.length < 40, "0127: evaluation key is compact in Memory");
        let result = policy.poll(key);
        for (let i = 0; result.status === "evaluating" && i < 100; i++) { Game.time++; result = policy.poll(key); }
        assert(result.best && result.best.ticks < 300, "0127: measured candidate beats legacy waves on three labs");
        const meter = load("src/utils/cpuMeter"), originalSpan = meter.span, measured = new Set();
        const assignmentConfig=load("src/utils/config"), savedAssignmentGet=assignmentConfig.get;
        let assignmentReads=null;const profilesPerAssignment=[];
        assignmentConfig.get=(key,...args)=>{
            if(assignmentReads!==null && key==="craft.policyBuffer") assignmentReads++;
            return savedAssignmentGet(key,...args);
        };
        let metrics;
        meter.span = (key, fn) => {
            measured.add(key);
            if(key!=="labPolicy.assignments") return originalSpan(key, fn);
            assignmentReads=0;
            try {return originalSpan(key,fn);}
            finally {profilesPerAssignment.push(assignmentReads);assignmentReads=null;}
        };
        try { metrics = run(w, { reset: true }); }
        finally { meter.span = originalSpan;assignmentConfig.get=savedAssignmentGet; }
        assert(profilesPerAssignment.length>0 && profilesPerAssignment.some(n=>n===1) &&
            profilesPerAssignment.every(n=>n<=1),
            "ARK-116: multilevel assignments read one logistics profile per decision instead of repeating it per lab");
        assert(["labPolicy.resolve", "labPolicy.profile", "labPolicy.confirm", "labPolicy.plan",
            "labPolicy.poll", "labPolicy.enter", "labPolicy.assignments"].every((key) => measured.has(key)),
            "ARK-116: real multilevel execution measures policy stages across heap reset");
        assert(w.item.run.done && Object.values(w.item.run.produced).every((n) => n === 20), "0127: live policy produces exact multilevel balances");
        assert(metrics.switchedCooling, "0127: roles change while producer cooldown persists");
        const final = (w.room.storage.store.XLH2O || 0) + w.labs.reduce((sum, l) => sum + (l.store.XLH2O || 0), 0);
        assert(final === 20, "0127: final amount survives heap reset and role rotation");

        w = world("XLH2O", 100, slots.SLOT_NUMBERS);
        const catalogue = load("src/utils/labPolicyData");
        const row = catalogue.rows.find((r) => r[0] === "XLH2O" && r[1] === 10 && r[2] === 3000 && r[3] === 2 && r[4] === 0);
        const pipeline = row[5];
        assert(policy.dual(policy.planFor(pipeline, w.item, slots.SLOT_NUMBERS), policy.recipeMap()), "0127: catalogue includes simultaneous production and consumption");
        const piped = run(w, { forcePlan: pipeline });
        assert(piped.peak >= 3 && w.item.run.produced.XLH2O === 100,
            "0127: several intermediate labs produce and feed concurrently " + JSON.stringify(piped));

        w = world("XLH2O", 5, [1, 2, 3]);
        const rawModel = runtime.snapshot(w.room, w.chain, w.item, runtime.resolve(w.room));
        rawModel.stock.LH = 5; rawModel.stock.OH = 5; rawModel.stock.L = 0; rawModel.stock.H = 0; rawModel.stock.O = 0;
        rawModel.targets.LH = 0; rawModel.targets.OH = 0;
        const outcome = core.simulate(policy.widePlan(w.item, rawModel.built), { ...rawModel, recipes: policy.recipeMap(), steps: w.item.order });
        assert(outcome.status === "complete" && outcome.produced.LH === 0 && outcome.produced.LH2O === 5, "0127: initial intermediates reduce individual production targets");

        w = world("XLH2O", 5, [1, 2, 3]);
        run(w, { drop: 1 });
        assert(w.item.run.done && w.item.run.rejected >= 1, "0127: a failed accepted intent is retried without invented production");
        w = world("XLH2O", 20, [1, 2, 3], { policyBandwidth: 2 });
        run(w, { bandwidth: 2 });
        assert(w.item.run.produced.XLH2O === 20, "0127: finite logistics completes with exact targets");

        w = world("XLH2O", 20, [1, 2, 3, 4, 5, 6], { policyBandwidth: 0, policySwitchDelay: null });
        assert(!runtime.profile(w.room).allowPipeline, "0127: unmeasured logistics excludes pipelines");
        Memory.rooms[w.room.name].labBoostReservations = { [w.labs[3].id]: true };
        assert(!runtime.resolve(w.room).built.includes(4), "0127: reserved boost lab is excluded");
        const wide = policy.widePlan(w.item, runtime.resolve(w.room).built);
        assert(wide && wide.phases.every((p) => p.layout.length === 5), "0127: actual partial topology gets a valid wide fallback");
        const input = w.labs[0];
        Memory.rooms[w.room.name].labPolicyInputs = { [input.id]: ["H", 10] };
        assert(reactions.deliveryLimit(w.room.name, input, "H") === 10, "0127: reagent delivery is limited to the current buffer");
        reactions.recordDelivery(input.id, 10);
        assert(reactions.deliveryLimit(w.room.name, input, "H") === 0, "0127: concurrent haulers cannot overfill the same buffer");

        w = world("XLH2O", 35, [1, 2, 3]);
        w.room.storage.store.LH = 10; w.room.storage.store.OH = 10;
        w.item.targets.LH = 25; w.item.targets.OH = 25;
        run(w);
        assert(w.item.run.produced.LH === 25 && w.item.run.produced.OH === 25 && w.item.run.produced.XLH2O === 35,
            "0127: off-grid lot and preexisting intermediates are evaluated with individual targets");

        w = world("XLH2O", 20, [1, 2, 3, 4, 5, 6]);
        w.labs[0].mineralType = "H"; w.labs[0].store.H = 5;
        w.labs[1].mineralType = "O"; w.labs[1].store.O = 5;
        Memory.rooms[w.room.name].labReaction = { a: "H", b: "O", product: "OH", input1: w.labs[0].id,
            input2: w.labs[1].id, output: w.labs[2].id, outputs: [w.labs[2].id, w.labs[3].id] };
        reactions.execute(w.labs[2]); reactions.execute(w.labs[3]);
        assert(w.intents.length === 1, "0127: wide outputs cannot double-consume shared start-of-tick inputs");

        w = world("XLH2O", 20, [1, 2, 3, 4, 5, 6]);
        w.labs[0].mineralType = "H"; w.labs[0].store.H = 5;
        w.labs[1].mineralType = "L"; w.labs[1].store.L = 5;
        w.labs[3].mineralType = "OH"; w.labs[3].store.OH = 5;
        Memory.rooms[w.room.name].labReactions = [
            { a: "H", b: "L", product: "LH", input1: w.labs[0].id, input2: w.labs[1].id, output: w.labs[2].id },
            { a: "LH", b: "OH", product: "LH2O", input1: w.labs[2].id, input2: w.labs[3].id, output: w.labs[5].id }
        ];
        reactions.execute(w.labs[2]);
        w.labs[2].mineralType = "LH"; w.labs[2].store.LH = 5;
        reactions.execute(w.labs[5]);
        assert(w.intents.length === 1, "0127: even a mutated store cannot expose new intermediate to the same tick");

        for (const automatic of [false, true]) {
            w = world("XLH2O", 20, [1, 2, 3]);
            const roomMem = Memory.rooms[w.room.name];
            const manual = { a: "H", b: "O", product: "OH", input1: w.labs[0].id,
                input2: w.labs[1].id, output: w.labs[2].id };
            if (automatic) roomMem.labReactions = [manual];
            else roomMem.labReaction = manual;
            w.labs[0].mineralType = "H"; w.labs[0].store.H = 100;
            w.labs[1].mineralType = "O"; w.labs[1].store.O = 100;
            reactions.execute(w.labs[2]);
            assert(w.intents.length === 1, "ARK-124: unreserved " + (automatic ? "automatic" : "manual") + " reaction remains executable");
            for (const lab of w.labs) {
                Game.time++; w.intents.length = 0;
                roomMem.labBoostReservations = { [lab.id]: true };
                reactions.execute(w.labs[2]);
                assert(w.intents.length === 0, "ARK-124: new boost reservation on " + lab.id + " blocks every reaction participant");
                delete roomMem.labBoostReservations;
                lab.isActive = () => false;
                reactions.execute(w.labs[2]);
                assert(w.intents.length === 0, "ARK-124: inactive " + lab.id + " cannot participate in a configured reaction");
                lab.isActive = () => true;
                reactions.execute(w.labs[2]);
                assert(w.intents.length === 1, "ARK-124: restored lab availability resumes without consuming quota while blocked");
            }
        }

        w = world("XLH2O", 20, [1, 2, 3]);
        const mem = Memory.rooms[w.room.name];
        mem.labReactionAuto = true;
        mem.labReactions = [{ a: "H", b: "O", product: "OH", owner: w.chain.key, input1: w.labs[0].id,
            input2: w.labs[1].id, output: w.labs[2].id }];
        mem.labPolicyInputs = { [w.labs[0].id]: ["H", 10], [w.labs[1].id]: ["O", 10] };
        mem.labPolicyDesired = { [w.labs[0].id]: "H", [w.labs[1].id]: "O", [w.labs[2].id]: "OH" };
        const hauler = load("src/roles/hauler");
        let job = hauler.pickChainFeedJob(w.room);
        assert(job && job.kind === "labReagent" && job.policy && job.amount === 10,
            "0127: real hauler feed honors the policy buffer limit");
        Game.time++;
        mem.labPolicyInputs[w.labs[0].id] = ["H", 10, false];
        mem.labPolicyInputs[w.labs[1].id] = ["O", 10, false];
        job = hauler.pickChainFeedJob(w.room);
        assert(!job || job.kind !== "labReagent", "0127: hauler does not refill tiny deficits above the low watermark");
        Game.time++;
        w.labs[0].mineralType = "L"; w.labs[0].store.L = 5;
        job = hauler.pickChainFeedJob(w.room);
        assert(job && job.kind === "transientDrain" && job.from.id === w.labs[0].id,
            "0127: real hauler drains a role conflict before loading reagents");

        w = world("XLH2O", 40, [1, 2, 3], { policyWorkPerTick: 1, policyPlanningTicks: 1 });
        const limited = policy.request(w.item, runtime.snapshot(w.room, w.chain, w.item, runtime.resolve(w.room)), true);
        assert(policy.poll(limited).status === "evaluating", "0127: candidate evaluation yields within its per-tick work budget");
        Game.time += 2;
        runtime.tick(w.room, w.chain, w.item);
        assert(w.item.run.planId === "wide-live" && w.item.run.selection === "wide-live-fallback",
            "0127: unfinished search falls back to a physically valid reference");

        w = world("XLH2O", 5, [1, 2, 3]);
        runtime.tick(w.room, w.chain, w.item);
        w.item.run.planId = "wide-live"; w.item.run.enter = true; w.item.run.phase = 0;
        Game.time++;
        runtime.tick(w.room, w.chain, w.item);
        transport(w, Infinity); w.labs.forEach((l) => reactions.execute(l)); engine(w);
        assert(w.item.run.pending.length === 1, "0127: successful intent persists until physical confirmation");
        w.labs[0].isActive = () => false;
        Game.time++;
        runtime.tick(w.room, w.chain, w.item);
        assert(w.item.run.produced.LH === 5 && !w.item.run.pending.length && w.item.run.wait.room === "unavailable",
            "0127: confirmation survives an RCL loss below three usable labs");
        w.labs[0].isActive = () => true;
        run(w);
        assert(w.item.run.produced.LH === 5 && w.item.run.done, "0127: topology recovery does not repeat already produced intermediates");

        w = world("XLH2O", 100, [1, 2, 3], { policyReplanTicks: 1 });
        Game.creeps.carrier = { name: "carrier", room: w.room, memory: { role: "hauler",
            mineralJob: { policy: true, kind: "labReagent", toId: w.labs[0].id } }, store: store({ H: 10 }, 100) };
        w.room.storage.store.H -= 10; Game.time++;
        const carried = runtime.snapshot(w.room, w.chain, w.item, runtime.resolve(w.room));
        assert(carried.stock.H === 200, "0127: stock evaluation includes the chain's in-flight reagent cargo");
        w.room.storage.store.H += 10; Game.creeps = {}; Game.time++;
        runtime.tick(w.room, w.chain, w.item);
        w.item.run.planId = "wide-live"; w.item.run.enter = true; w.item.run.phase = 0; w.item.run.evalKey = null;
        Game.time++;
        runtime.tick(w.room, w.chain, w.item);
        transport(w, Infinity); w.labs.forEach((l) => reactions.execute(l)); engine(w); Game.time++;
        runtime.tick(w.room, w.chain, w.item);
        const completed = w.item.run.produced.LH;
        const originalPoll = policy.poll;
        try {
            w.item.run.evalKey = "completed-later"; w.item.run.estimate = 50000; w.item.run.selectedTick = Game.time - 1;
            policy.poll = () => ({ best: { id: "better-candidate", ticks: 1 }, status: "complete" });
            Game.time++;
            runtime.tick(w.room, w.chain, w.item);
            assert(completed === 5 && w.item.run.produced.LH === 5 && w.item.run.planId === null,
                "0127: a completed better candidate can interrupt a long fallback at a settled tick boundary");
        } finally { policy.poll = originalPoll; }
        run(w);
        assert(w.item.run.produced.LH === 100 && w.item.run.produced.XLH2O === 100,
            "0127: mid-lot reselection preserves previously confirmed production");

        function openChain(w) {
            Memory.craft = { active: {} };
            Game.market.credits = 1000000;
            const result = load("src/utils/craftChain").open(w.room, { product: "XLH2O", qty: 20, steps: w.steps,
                owns: research.rawStock("XLH2O", 20), buys: {}, spend: 0, cash: 1, cost: 1,
                revenue: 10, profit: 9, margin: 0.1, ratio: 9, T: 300 });
            assert(result.ok, "0127: craft accepts the shared policy executor");
            w.chain = Memory.craft.active[w.room.name]; w.item = w.chain.queue[0];
        }
        w = world("XLH2O", 20, [1, 2, 3]);
        openChain(w);
        assert(w.chain.queue.length === 1 && w.item.policy, "0127: a multilevel craft queue uses one compact policy item");
        Memory.rooms[w.room.name].labReaction = { a: "H", b: "O", product: "OH", input1: w.labs[0].id, input2: w.labs[1].id, output: w.labs[2].id };
        load("src/utils/craftChain").tick();
        assert(w.chain.wait === "manual-pin" && !w.item.started, "0127: a manual reaction suspends rather than overwrites the chain");
        delete Memory.rooms[w.room.name].labReaction;
        run(w, { chain: true });
        assert(w.chain.state === "selling" && w.chain.produced === 20, "0127: end-to-end craft closes the policy with exact saleable production");

        w = world("XLH2O", 20, [1, 2, 3], { labPolicy: false });
        openChain(w);
        const legacy = w.chain.queue;
        load("src/utils/craftChain").tick();
        Memory.settings.craft.labPolicy = true;
        load("src/utils/craftChain").replan(w.room.name);
        assert(w.chain.queue === legacy && w.chain.queue[0].started && !w.chain.queue[0].policy,
            "0127: replanning preserves the already running legacy wave");
        run(w, { chain: true });
        assert(w.chain.queue.some((i) => i.policy) && w.chain.produced === 20, "0127: legacy suffix migrates at a barrier without losing intermediates");

        for (const product of load("docs/lab-search/recipes.cjs").products) {
            w = world(product, 5, [1, 2, 3]);
            const initial = core.materialTotals(w.room.storage.store, [], research.recipes);
            run(w);
            const final = core.materialTotals(w.room.storage.store, w.labs.map((lab) => ({ role: lab.mineralType,
                amount: lab.mineralType ? lab.store[lab.mineralType] : 0 })), research.recipes);
            assert(w.item.run.produced[product] === 5 && JSON.stringify(initial) === JSON.stringify(final),
                "0127: live mineral conservation and exact catalyzed product " + product);
        }

        for (const row of catalogue.rows) {
            const targets = Object.fromEntries(research.order(row[0]).map((p) => [p, row[2]]));
            const item = { product: row[0], order: Object.keys(targets), targets };
            const plan = policy.planFor(row[5], item, Array.from({ length: row[1] }, (_, i) => i + 1));
            assert(plan && plan.phases.length, "0127: saved winner remains geometrically executable " + row[0]);
        }

        assert(catalogue.rows.length === 1950 && Object.keys(catalogue.plans).length === 596,
            "0127: full precomputed comparison is published as reproducible plans");
        for (const count of [3, 6, 10]) {
            const built = Array.from({ length: count }, (_, i) => i + 1);
            const reference = policy.widePlan(w.item, built);
            assert(reference.phases.every((phase) => phase.layout.filter((p) => p === phase.products[0]).length === count - 2),
                "0127: cold wide reference uses every eligible output on " + count + " labs");
        }
        // Multiple real runtimes share one Game/Memory. Claims/listings are varied
        // independently in economyScaleCases; here transport and engine settle intents.
        for (const roomCount of [3, 5, 10]) for (const labCount of [3, 7, 10]) {
            const worlds = [], rooms = {}, objects = {}, mem = {}, active = {};
            for (let i = 0; i < roomCount; i++) {
                const next = world("XLH2O", 5, slots.SLOT_NUMBERS.slice(0, labCount));
                worlds.push(next); rooms[next.room.name] = next.room;
                Object.assign(objects, next.objects); mem[next.room.name] = Memory.rooms[next.room.name];
                active[next.chain.key] = next.chain;
            }
            Game.rooms = rooms; Game.getObjectById = (id) => objects[id] || null;
            Memory.rooms = mem; Memory.craft.active = active;
            const meter = load("src/utils/cpuMeter"), span = meter.span;
            let assignmentCalls = 0, ticks = 0;
            meter.span = (key, fn) => { if (key === "labPolicy.assignments") assignmentCalls++; return span(key, fn); };
            try {
                for (; ticks < 5000 && worlds.some((v) => !v.item.run || !v.item.run.done); ticks++) {
                    for (const v of worlds) {
                        if (v.item.run && v.item.run.done) continue;
                        runtime.tick(v.room, v.chain, v.item);
                        transport(v, Infinity);
                        v.labs.forEach((lab) => reactions.execute(lab));
                        engine(v, false);
                    }
                    Game.time++;
                }
            } finally { meter.span = span; }
            assert(ticks < 5000 && worlds.every((v) => v.item.run.done && v.item.run.produced.XLH2O === 5),
                "ARK-128: simultaneous rooms preserve exact T3 production at scale " + roomCount + "/" + labCount);
            assert(assignmentCalls <= ticks * roomCount,
                "ARK-128: assignments execute at most once per working room/tick at scale " + roomCount + "/" + labCount);
            console.log("ARK-128 lab scale " + JSON.stringify({ rooms: roomCount, labs: labCount, ticks, assignmentCalls }));
        }
        console.log("0127: runtime policy, confirmation, cooldown, pipelines, inventory, heap reset and logistics passed");
    } finally {
        Object.assign(global, saved);
        slots.resetCache();
        load("src/utils/marketPricing").resetCaches();
    }
};
