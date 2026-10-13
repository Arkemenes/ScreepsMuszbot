module.exports = function (project, assert) {
    const path = require("path");
    const load = (name) => require(path.join(project, name));
    const policy = load("src/utils/labPolicy"), stock = load("src/utils/resourcePolicy");
    const fuel = load("src/utils/terminalFuel"), slots = load("src/utils/labSlots");
    const research = load("docs/lab-search/recipes.cjs");
    const saved = { game: Game, memory: Memory, reactions: REACTIONS, times: REACTION_TIME,
        commitments: stock.commitments, consumer: stock.consumerAvailable };
    try {
        global.Memory = { settings: { craft: { labPolicy: true, wideLabs: true, labStrategy: "auto" } },
            rooms: {}, craft: { active: {} }, terminalOps: { operations: {} } };
        global.Game = Object.assign({}, saved.game, { time: 199200000, creeps: {} });
        global.REACTIONS = {}; global.REACTION_TIME = {};
        for (const [p, recipe] of Object.entries(research.recipes)) {
            for (const [a, b] of [recipe.inputs, recipe.inputs.slice().reverse()]) (REACTIONS[a] ||= {})[b] = p;
            REACTION_TIME[p] = recipe.cooldown;
        }
        const item = policy.descriptor(research.order("XGH2O").map((p) => ({kind:"lab",product:p,batches:20})));
        const first = policy.planFor("wide-live", item, slots.SLOT_NUMBERS);
        const initial = JSON.stringify(first);
        for (let i = 0; i < 100; i++) { Game.time++; policy.planFor("wide-live", item, slots.SLOT_NUMBERS); }
        assert(first === policy.planFor("wide-live", item, slots.SLOT_NUMBERS) && JSON.stringify(first) === initial,
            "fallback lab plan reuses immutable geometry across ticks without changing its layouts");
        const bigger = { ...item, targets: Object.fromEntries(item.order.map((p) => [p, 200])) };
        const bigPlan = policy.widePlan(bigger, slots.SLOT_NUMBERS);
        assert(bigPlan !== first && bigPlan.window === 200 && bigPlan.phases[0] === first.phases[0],
            "lot resizing updates the plan window while reusing quantity-independent lab phases");
        const reduced = { ...item, targets: { ...item.targets, [item.order[0]]: 0 } };
        assert(policy.widePlan(reduced, slots.SLOT_NUMBERS).phases.length === first.phases.length - 1,
            "zero targets remove phases even when fallback geometry is already cached");
        assert(policy.widePlan(item, [1, 2, 3]).phases.every((phase) => phase.layout.length === 3),
            "fallback cache respects the actual built lab geometry");
        global.REACTIONS = { ...REACTIONS };
        assert(policy.widePlan(item, slots.SLOT_NUMBERS) !== first,
            "replacing recipe data invalidates cached fallback plans");
        Memory.settings.craft.policyCacheEntries = 1;
        const retained = policy.widePlan(item, slots.SLOT_NUMBERS);
        for (let i = 0; i < 8; i++) policy.widePlan({ ...item,
            targets: Object.fromEntries(item.order.map((p) => [p, 300 + i])) }, slots.SLOT_NUMBERS);
        assert(policy.widePlan(item, slots.SLOT_NUMBERS) !== retained,
            "fallback plan cache evicts entries at its configured bound");

        const room = { name: "CpuEconomy", storage: { store: { energy: 1 } }, terminal: { store: { energy: 1 } } };
        Memory.settings.stockPolicy = { targets: { energy: 100000, O: 50 }, rooms: { CpuEconomy: { targets: { energy: 0, O: -1 } } } };
        assert(stock.target(room, "energy") === 0 && !stock.used(room, "O") && stock.target(room,"missing") === undefined,
            "single-resource target lookup preserves zero, invalid override and absent resource semantics");
        Memory.settings.stockPolicy.rooms.CpuEconomy.targets.O = 100;
        assert(stock.used(room,"O") && stock.target(room,"O") === 100,
            "single-resource target lookup observes in-place config changes in the same tick");
        let enumerations = 0;
        Memory.settings.stockPolicy.targets = new Proxy({ energy: 100000, O: 50 }, {
            ownKeys(value) { enumerations++; return Reflect.ownKeys(value); }
        });
        for (let i = 0; i < 100; i++) stock.used(room, "O");
        assert(enumerations === 0, "resource membership checks do not enumerate the whole target map");
        delete Memory.settings.stockPolicy.rooms;
        Memory.terminalOps.operations = Object.fromEntries(Array.from({length:8}, (_,i) => ["op"+i,
            {id:"op"+i,kind:"sell",state:"waiting",sourceRoom:room.name,resourceType:"O",policy:"swing",
                remaining:10,fuelQuote:{tick:Game.time,cost:1}}]));
        let calls = 0;
        stock.commitments = () => { calls++; return {}; };
        assert(fuel.plan(room).forecast === 0 && calls === 1,
            "scarce fuel forecast computes optional reservations once for all sale candidates");
        room.terminal.store.energy = 100;
        assert(fuel.plan(room).forecast === 2 && calls === 2,
            "a fresh fuel forecast observes same-tick inventory changes without stale reservation caching");
        stock.commitments = saved.commitments;
        const hauler = load("src/roles/hauler");
        const feedRoom = { name: "CpuReagentSelection", find: () => [],
            storage: { id: "feed-storage", store: {} }, terminal: { id: "feed-terminal", store: {} } };
        const labs = {};
        const reactions = Array.from({length:6}, (_,i) => {
            for (const id of ["a"+i,"b"+i,"out"+i]) labs[id] = { id, mineralType: null, store: {} };
            return {a:"O",b:"H",product:"OH",input1:"a"+i,input2:"b"+i,output:"out"+i};
        });
        Memory.settings.stockPolicy.enabled = true;
        Memory.rooms[feedRoom.name] = {labReactions:reactions};
        Memory.craft.active = {fixture:{room:feedRoom.name}};
        Game.rooms = { [feedRoom.name]: feedRoom }; Game.getObjectById = (id) => labs[id];
        let reads = 0;
        stock.consumerAvailable = () => { reads++; return 0; };
        assert(hauler.pickChainFeedJob(feedRoom) === null && reads === 4,
            "six lab reactions query unavailable stock once per resource and source during one job selection");
        Game.time++;
        assert(hauler.pickChainFeedJob(feedRoom) === null && reads === 8,
            "a new hauler job selection rechecks reagent stock rather than retaining an old missing-source result");
        assert(!JSON.stringify(Memory).includes("wide-live"), "derived fallback geometry stays outside persistent Memory");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory;
        global.REACTIONS = saved.reactions; global.REACTION_TIME = saved.times;
        stock.commitments = saved.commitments; stock.consumerAvailable = saved.consumer;
    }
};
