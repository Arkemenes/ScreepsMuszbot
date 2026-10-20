module.exports = function (project, assert) {
    const path = require("path"), load = (n) => require(path.join(project, "src/utils", n));
    const ops = load("terminalOps"), claims = load("terminalClaims");
    const saved = { game: Game, memory: Memory, power: global.PWR_OPERATE_TERMINAL, info: global.POWER_INFO, resources: global.RESOURCES_ALL };
    let source, target, op, sends;
    function reset(resource = "energy") {
        const store = (values) => Object.assign({ getCapacity: () => 300000, getFreeCapacity: () => 200000 }, values);
        global.Memory = { settings: { terminalOps: { tickInterval: 1, sendConfirmationTicks: 2 }, terminalFuel: { enabled: false },
            stockPolicy: { enabled: true, targets: {}, creditReserve: 0 } }, craft: { active: {}, stranded: {} } };
        source = { name: "W1N1", controller: { my: true }, find: () => [],
            storage: { id: "send-storage", store: store({ energy: 100000, O: 10000 }) },
            terminal: { id: "send-terminal", cooldown: 0, store: store({ energy: resource === "energy" ? 1100 : 100, O: resource === "O" ? 1000 : 0 }),
                effects: [{ effect: 8, level: 1, ticksRemaining: 1 }], send: () => { sends++; return OK; } } };
        target = { name: "W2N1", controller: { my: true }, find: () => [],
            storage: { id: "target-storage", store: store({ energy: 0 }) }, terminal: { id: "target-terminal", cooldown: 0, store: store({ energy: 0, O: 0 }) } };
        global.Game = { ...saved.game, time: (Game.time || 1000) + 1000, rooms: { [source.name]: source, [target.name]: target }, creeps: {},
            market: { credits: 100000, orders: {}, incomingTransactions: [], outgoingTransactions: [], calcTransactionCost: (q) => Math.ceil(q / 10) } };
        Game.getObjectById = (id) => [source.storage, source.terminal, target.storage, target.terminal].find((s) => s.id === id);
        global.PWR_OPERATE_TERMINAL = 8; global.POWER_INFO = { 8: { effect: [0.9, 0.8, 0.7, 0.6, 0.5] } };
        global.RESOURCES_ALL = ["energy", "O"];
        sends = 0;
        const response = ops.transfer(source.name, target.name, resource, 1000);
        if (!response.ok) throw new Error(response.error);
        op = ops.operation(response.id); op.loadedAmount = resource === "energy" ? 1100 : 1000; op.state = "atTerminal";
    }
    function apply(q, factor = 0.9) {
        const cost = Math.ceil(Math.ceil(q / 10) * factor);
        source.terminal.store[op.resourceType] -= q; source.terminal.store.energy -= cost;
        target.terminal.store[op.resourceType] += q;
        const tx = { transactionId: "send-" + Game.time, time: Game.time, from: source.name, to: target.name,
            resourceType: op.resourceType, amount: q, description: "terminal operation " + op.id };
        Game.market.incomingTransactions = [tx]; Game.market.outgoingTransactions = [tx];
        source.terminal.effects = [];
    }
    try {
        reset(); ops.tick();
        assert(op.pendingSend && !op.sentAmount && op.accounting.amount === 0 && op.accounting.energy === 0,
            "0150 send: OK is pending and never books cargo or freight before engine execution");
        assert(claims.physicalFree(source, source.terminal, "energy", op.id, claims.owner(op)) === 0,
            "0150 send: pending protects cargo plus gross API buffer even from its owner");
        ops.tick(); assert(sends === 1, "0150 send: same-tick re-entry never duplicates an accepted intent");
        apply(1000); Game.time++;
        Memory.terminalOps = JSON.parse(JSON.stringify(Memory.terminalOps)); op = ops.operation(op.id); ops.tick();
        assert(op.sentAmount === 1000 && op.remaining === 0 && op.transactionCost === 90 && op.accounting.energy === 90,
            "0150 send: full transaction after reset and expiry books discounted freight once");
        assert(!op.pendingSend && !Object.values(Memory.terminalOps.operations).some((o) => o.kind === "receipt" && o.parentId === op.id),
            "0150 send: managed arrival never creates a competing child receipt");
        Game.time++; ops.tick(); assert(op.accounting.amount === 1000 && sends === 1,
            "0150 send: replay does not repeat send or confirmed accounting");
        reset("O"); ops.tick(); apply(400); Game.time++; ops.tick();
        assert(op.amount === 1000 && op.sentAmount === 400 && op.remaining === 600 && op.transactionCost === 36,
            "0150 send: partial execution preserves original request and outstanding cargo");
        Game.time++; ops.tick();
        assert(op.pendingSend && op.pendingSend.quantity === 600 && sends === 2,
            "0150 send: after delivering the partial arrival only the remaining quantity is resubmitted");
        apply(600, 1); Game.time++; ops.tick();
        assert(op.amount === 1000 && op.sentAmount === 1000 && op.remaining === 0 && op.receivedAmount === 1000 && op.transactionCost === 96,
            "0150 send: mixed operated and unpowered partials finish the full request without resetting accounting");
        reset(); ops.tick(); ops.cancel(op.id);
        assert(op.cancelRequested && op.pendingSend && claims.physicalFree(source, source.terminal, "energy") === 0,
            "0150 send: cancellation keeps accepted cargo and API fuel protected");
        Game.time += 2; ops.tick();
        assert(op.state === "cancelled" && !op.pendingSend && op.accounting.energy === 0 && op.accounting.amount === 0,
            "0150 send: confirmed no-effect cancellation releases reservations without inventing a transfer");
        reset("O"); ops.tick(); ops.cancel(op.id); apply(400); Game.time++; ops.tick();
        assert(op.state === "cancelled" && op.sentAmount === 400 && op.receivedAmount === 400 && op.remaining === 600 && sends === 1,
            "0150 send: cancellation after a partial execution delivers accepted cargo and never sends the remainder");
        reset(); ops.tick(); source.terminal.store.energy -= 10; Game.time += 2; ops.tick();
        assert(op.pendingSend && sends === 1 && op.error,
            "0150 send: unexplained balance movement never authorizes a duplicate send");
    } finally {
        global.Game = saved.game; global.Memory = saved.memory;
        global.RESOURCES_ALL = saved.resources;
        if (saved.power === undefined) delete global.PWR_OPERATE_TERMINAL; else global.PWR_OPERATE_TERMINAL = saved.power;
        if (saved.info === undefined) delete global.POWER_INFO; else global.POWER_INFO = saved.info;
    }
};
