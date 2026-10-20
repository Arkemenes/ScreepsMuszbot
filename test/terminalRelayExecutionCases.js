module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils", name));
    const ops = load("terminalOps"), fuel = load("terminalFuel");
    const saved = { game: Game, memory: Memory, resources: global.RESOURCES_ALL };
    try {
        const store = (values) => Object.assign({ getCapacity: () => 300000, getFreeCapacity: () => 200000 }, values);
        const sends = [];
        function ownRoom(name, energy, mineral) {
            const terminal = { id: name + "-terminal", my: true, cooldown: 0, store: store({ energy }),
                send: (...args) => { sends.push(args); return OK; } };
            const storage = { id: name + "-storage", store: store({ energy, Z: mineral }) };
            return { name, controller: { my: true, owner: { username: "Arkemenes" } }, find: () => [], storage, terminal };
        }
        const source = ownRoom("W1N1", 100000, 1000), target = ownRoom("W2N2", 100000, 0);
        const directSource = ownRoom("W3N3", 100000, 1000), directTarget = ownRoom("W4N4", 100000, 0);
        const directCost = (quantity, from, to) => {
            if (to === "E2N46") return Math.ceil(quantity * 0.1);
            if (from === "E2N46") return Math.ceil(quantity * 0.2);
            return Math.ceil(quantity * 0.9);
        };
        global.Memory = { settings: { allies: ["AllyAuto"], terminalRelay: { hub: "E2N46", key: "test-only-key", transportEnabled: false },
            terminalOps: { tickInterval: 1 }, terminalFuel: { enabled: true, margin: 0, transactions: 2 },
            logistics: { terminalReserveRatio: 0 }, stockPolicy: { enabled: true, targets: {} } },
            rooms: { E2N46: { owner: "AllyAuto", controllerLevel: 8 } },
            terminalOps: { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} } };
        global.RESOURCES_ALL = [RESOURCE_ENERGY, "Z"];
        global.Game = Object.assign({}, saved.game, { time: (saved.game.time || 1000) + 2000,
            rooms: { [source.name]: source, [target.name]: target, [directSource.name]: directSource, [directTarget.name]: directTarget },
            myRooms: [source, target, directSource, directTarget], creeps: {},
            market: { orders: {}, incomingTransactions: [], outgoingTransactions: [], calcTransactionCost: directCost } });
        Game.getObjectById = (id) => id === source.storage.id ? source.storage : id === source.terminal.id ? source.terminal :
            id === target.storage.id ? target.storage : id === target.terminal.id ? target.terminal :
            id === directSource.storage.id ? directSource.storage : id === directSource.terminal.id ? directSource.terminal :
            id === directTarget.storage.id ? directTarget.storage : id === directTarget.terminal.id ? directTarget.terminal : null;

        const unavailable = ops.quoteTransfer(source.name, target.name, "Z", 100);
        assert(unavailable.ok && unavailable.route === "direct", "0125 executor keeps relay unavailable while transport is disabled");
        const key = Memory.settings.terminalRelay.key;
        delete Memory.settings.terminalRelay.key;
        const noKey = ops.setRelayEnabled(true);
        Memory.settings.terminalRelay.key = key;
        assert(noKey.indexOf("remains disabled") >= 0,
            "0125 executor refuses activation without a private key");
        const enableResult = ops.setRelayEnabled(true);
        assert(enableResult.indexOf("enabled") >= 0, "0125 relay activation accepts a configured private key and allied hub");
        const quote = ops.quoteTransfer(source.name, target.name, "Z", 100);
        const urgent = ops.quoteTransfer(source.name, target.name, "Z", 100, { urgent: true });
        assert(quote.ok && quote.route === "relay" && urgent.route === "direct" && urgent.reason === "urgent-direct",
            "0125 executor selects the beneficial relay and urgent requests stay direct");
        const created = ops.transfer(source.name, target.name, "Z", 100);
        const op = created.ok && ops.operation(created.id);
        const persisted = JSON.stringify(op);
        assert(op && op.route === "relay" && op.state === "staging" && op.relay.phase === "staging" && sends.length === 0,
            "0125 physical transfer stages as relay without sending during creation");
        assert(persisted.indexOf("test-only-key") < 0 && ops.relayStatus().keyConfigured &&
            JSON.stringify(ops.relayStatus()).indexOf("test-only-key") < 0,
            "0125 relay operation and status never expose the private key");
        source.terminal.store.energy = 0;
        const budget = fuel.budget(source);
        assert(budget.funded >= op.routingQuote.originFreight + op.routingQuote.fundingAmount + op.routingQuote.fundingFreight,
            "0125 relay funding and both origin freights are reserved in terminalFuel");
        const hauler = require(path.join(project, "src/roles/hauler"));
        const fuelJob = hauler.stockPolicyJob(source);
        assert(fuelJob && fuelJob.to === source.terminal &&
            fuelJob.amount >= op.routingQuote.originFreight + op.routingQuote.fundingAmount + op.routingQuote.fundingFreight,
            "0125 existing stockPolicy job sends relay energy to the terminal via a hauler");
        ops.setRelayEnabled(false);
        const fallback = ops.transfer(directSource.name, directTarget.name, "Z", 100);
        assert(fallback.ok && ops.operation(fallback.id).route === "direct",
            "0125 new transfers fall back to direct routing when relay transport is disabled");
        assert(ops.relayStatus().operations.some((item) => item.id === created.id) && !ops.relayStatus().transportEnabled,
            "0125 disabling relay blocks new operations while preserving staged operation reconciliation");
        op.pendingSend = { relayPhase: "cargo", tick: Game.time - 3, from: source.name, to: "E2N46",
            resourceType: "Z", quantity: 100, cost: op.routingQuote.originFreight,
            cargoBefore: source.terminal.store.Z || 0, energyBefore: source.terminal.store.energy };
        op.state = "sending";
        op.relay.phase = "cargo";
        Game.time++;
        ops.tick();
        assert(op.state === "receiptUncertain" && !op.pendingSend && sends.length === 0,
            "0125 unconfirmed cargo send enters review and is never retransmitted");
        assert(sends.length === 0, "0125 setup and dry quote do not issue terminal intents");
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
        global.RESOURCES_ALL = saved.resources;
    }
};
