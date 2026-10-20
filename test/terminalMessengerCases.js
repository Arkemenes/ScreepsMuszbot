module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils", name));
    const messenger = load("terminalMessenger"), ops = load("terminalOps");
    const saved = { game: Game, memory: Memory, notify: Game.notify };
    try {
        const sends = [];
        const store = (values) => Object.assign({ getCapacity: () => 300000, getFreeCapacity: () => 200000 }, values);
        const room = { name: "W1N1", controller: { my: true }, find: () => [],
            storage: { id: "messenger-storage", store: store({ energy: 100000 }) },
            terminal: { id: "messenger-terminal", my: true, cooldown: 0, store: store({ energy: 10 }),
                send: (...args) => { sends.push(args); return OK; } } };
        let notifications = 0;
        global.Memory = { settings: { allies: ["AllyAuto"], terminalMessenger: { contacts: {}, maxQueue: 20 },
            terminalOps: { tickInterval: 1 }, terminalFuel: { enabled: true }, logistics: { terminalReserveRatio: 0 },
            stockPolicy: { enabled: true, targets: {} } },
            rooms: { E2N47: { owner: "AllyAuto", controllerLevel: 8 }, E2N48: { owner: "AllyAuto", controllerLevel: 7 } },
            terminalOps: { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} } };
        global.Game = Object.assign({}, saved.game, { time: (saved.game.time || 1000) + 1000,
            rooms: { [room.name]: room }, creeps: {}, notify: () => { notifications++; },
            market: { orders: {}, incomingTransactions: [], outgoingTransactions: [],
                calcTransactionCost: (amount, from, to) => to === "E2N48" ? 9 : 5 } });
        Game.getObjectById = (id) => id === room.storage.id ? room.storage : id === room.terminal.id ? room.terminal : null;

        assert(messenger.setAllyRoom("AllyOne", "E2N46").indexOf("Contact saved") === 0 &&
            messenger.getAllyRoom("allyone") === "E2N46", "0160 contacts are configurable and case insensitive");
        assert(messenger.getAllyRoom("AllyAuto") === "E2N47" && messenger.status().indexOf("AllyAuto -> E2N47 [auto]") >= 0,
            "0160 allies and RCL6+ Memory.rooms intel discover contacts and choose the lower-freight room");
        Memory.settings.allies = undefined;
        Memory.rooms = Memory.rooms || {};
        assert(messenger.queueMessage("vlc6wsw0l", "No room yet").indexOf("observed RCL 6+ terminal room") >= 0,
            "0160 missing ally intel reports the exact discovery requirement");
        Memory.rooms.W9N9 = { owner: "vlc6wsw0l", controllerLevel: 8 };
        assert(messenger.getAllyRoom("vlc6wsw0l") === "W9N9",
            "0160 default ally vlc6wsw0l is discovered from the production Memory.rooms intel schema");
        assert(messenger.queueMessage("AllyOne", "Hello from Arkemenes") .indexOf("queued") >= 0,
            "0160 message command queues English text for an ally");
        assert(messenger.queueMessage("AllyOne", "x".repeat(97)).indexOf("must contain") >= 0,
            "0160 messages exceeding the terminal description limit are rejected");
        const claims = load("terminalClaims"), fuel = load("terminalFuel");
        assert(claims.physicalFree(room, room.terminal, RESOURCE_ENERGY) >= 6 + fuel.operationReserve(room) &&
            fuel.budget(room).keep >= 10,
            "0161 ten-energy postage reserve is usable by messages and replenished to its minimum");
        ops.tick();
        assert(sends.length === 1 && sends[0][0] === RESOURCE_ENERGY && sends[0][1] === 1 &&
            sends[0][2] === "E2N46" && sends[0][3] === "MSG:Hello from Arkemenes",
            "0160 queued message uses one energy and the MSG description protocol (sends=" + JSON.stringify(sends) + ", queue=" + JSON.stringify(messenger.nextQueued()) + ")");
        assert(messenger.nextQueued() === null && messenger.status().indexOf("Recent messages") >= 0,
            "0160 accepted message leaves the queue and appears in local history");

        room.terminal.store.energy = 4;
        const refill = require(path.join(project, "src/roles/hauler")).stockPolicyJob(room);
        assert(fuel.budget(room).keep === 10 && refill && refill.to === room.terminal && refill.amount === 6,
            "0161 hauler replenishes postage spent from the terminal minimum reserve");

        Game.time++;
        Game.market.incomingTransactions = [{ transactionId: "message-tx", time: Game.time, from: "E2N46", to: room.name,
            resourceType: RESOURCE_ENERGY, amount: 1, description: "MSG:Can you send 500 energy?", sender: { username: "AllyOne" } }];
        ops.tick();
        const received = Memory.terminalMessenger.messages.filter((item) => item.direction === "in");
        const receipts = Object.values(Memory.terminalOps.operations).filter((op) => op.kind === "receipt");
        assert(received.length === 1 && received[0].text === "Can you send 500 energy?" && notifications === 1,
            "0160 inbound message notifies once and remains plain text");
        assert(!receipts.some((op) => op.amount === 1), "0160 message postage does not create a one-energy hauling receipt (" + JSON.stringify(receipts) + ")");
        ops.tick();
        assert(Memory.terminalMessenger.messages.filter((item) => item.direction === "in").length === 1,
            "0160 shared transaction scan deduplicates messages across ticks");

        room.terminal.store.energy = 0;
        messenger.queueMessage("AllyOne", "Please confirm receipt");
        const fuelPlan = fuel.budget(room);
        const hauler = require(path.join(project, "src/roles/hauler"));
        const fuelJob = hauler.stockPolicyJob(room);
        assert(fuelPlan.keep >= 6 && messenger.messageFuelDemand(room.name) === 6,
            "0160 queued message reserves postage and freight in the terminal fuel forecast");
        assert(fuelJob && fuelJob.to === room.terminal && fuelJob.amount >= 6,
            "0160 existing stockPolicy hauler job feeds message energy to its sending terminal");
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
