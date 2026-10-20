module.exports = function (project, assert) {
    const path = require("path"), load = (name) => require(path.join(project, "src/utils/" + name));
    const ops = load("terminalOps"), claims = load("terminalClaims"), book = load("orderBook"), market = load("market"), retry = load("terminalOrderRetry");
    const saved = { rooms: Game.rooms, creeps: Game.creeps, market: Game.market, time: Game.time, get: Game.getObjectById,
        settings: Memory.settings, ops: Memory.terminalOps, craft: Memory.craft, flip: Memory.marketFlip, snapshot: market.snapshot,
        power: global.PWR_OPERATE_TERMINAL, powerInfo: global.POWER_INFO };
    const store = (initial) => Object.assign({ getCapacity: () => 300000, getFreeCapacity: () => 290000,
        getUsedCapacity: () => 0 }, initial);
    let room, buy, hauler, withdrawal, orders;
    function reset() {
        Game.time += 1000; withdrawal = 0;
        Memory.settings = { terminalOps: { tickInterval: 1 }, terminalFuel: { enabled: false }, stockPolicy: { creditReserve: 0 } };
        Memory.craft = { active: {}, stranded: {} }; Memory.marketFlip = { active: {} };
        room = { name: "IntentRoom", controller: { my: true }, find: () => [],
            terminal: { id: "intent-terminal", cooldown: 0, store: store({ energy: 1000 }) },
            storage: { id: "intent-storage", store: store({ energy: 20000 }) } };
        Game.rooms = { IntentRoom: room }; Game.creeps = {};
        Game.getObjectById = (id) => id === room.terminal.id ? room.terminal : id === room.storage.id ? room.storage : null;
        orders = [{ id: "offer", roomName: "Far", type: ORDER_SELL, resourceType: "UH2O", price: 1, amount: 1000, remainingAmount: 1000 }];
        Game.market = { credits: 1000000, orders: {}, incomingTransactions: [], outgoingTransactions: [],
            calcTransactionCost: (q) => Math.ceil(q * 0.9), getAllOrders: () => orders,
            getOrderById: (id) => orders.find((o) => o.id === id), deal: () => OK };
        market.snapshot = () => ({ resources: { UH2O: { currentBuy: 1, currentSell: 1, fairPrice: 1 }, energy: { fairPrice: 1 } } });
        buy = { id: "intent-buy", kind: "buy", sourceRoom: room.name, resourceType: "UH2O", amount: 1000,
            remaining: 1000, state: "atTerminal", limit: 5, createdTick: Game.time, updatedTick: Game.time,
            transactionCost: 0, createListing: false, skipFeeCap: true };
        Memory.terminalOps = { operations: { [buy.id]: buy }, nextId: 1, seenIncoming: {}, events: [], terminalBalance: {} };
        book.reset();
    }
    function oldReceipt() {
        const receipt = { id: "old-receipt", kind: "receipt", targetRoom: room.name, resourceType: "energy", amount: 1000,
            receivedAmount: 0, state: "unloading", haulerName: "intent-hauler", createdTick: Game.time - 20, updatedTick: Game.time };
        Memory.terminalOps.operations[receipt.id] = receipt;
        hauler = { name: "intent-hauler", room, memory: { homeRoom: room.name, role: "hauler", terminalJob: {
            operationId: receipt.id, direction: "unload", fromId: room.terminal.id, toId: room.storage.id,
            resourceType: "energy", amount: 1000 } }, store: { getUsedCapacity: () => 0, getFreeCapacity: () => 1000 },
            withdraw: (source, resource, q) => { withdrawal = q; return OK; } };
        Game.creeps = { [hauler.name]: hauler };
        return receipt;
    }
    function transaction(q) {
        return { transactionId: "intent-tx", time: buy.pendingDeal.tick, to: room.name, from: "Far", resourceType: "UH2O",
            amount: q, order: { id: buy.pendingDeal.orderId, price: 1, type: ORDER_SELL } };
    }
    try {
        reset(); const receipt = oldReceipt(); ops.tick();
        assert(buy.state === "settling" && buy.pendingDeal.cost === 900 && !buy.feeLoadedAmount,
            "0136: reproducer uses pre-existing terminal fuel, not a fee hauler's loaded counter");
        assert(claims.physicalFree(room, room.terminal, "energy", receipt.id) === 100,
            "0136: pending deal reserves existing freight against an older receipt job");
        ops.runHauler(hauler);
        assert(withdrawal === 100, "0136: old hauler withdrawal leaves all900 freight available for engine execution");
        room.terminal.store.energy -= withdrawal;
        if (room.terminal.store.energy >= buy.pendingDeal.cost) {
            room.terminal.store.UH2O = 1000; room.terminal.store.energy -= 900;
            Game.market.incomingTransactions = [transaction(1000)];
        }
        Game.time++; ops.tick();
        assert(buy.dealtAmount === 1000 && buy.transactionCost === 900 && buy.accounting.credits === -1000,
            "0136: protecting freight lets the formerly silent intent execute and settle exactly once");
        reset(); ops.tick(); buy.feeLoadedAmount = 900;
        assert(claims.physicalFree(room, room.terminal, "energy") === 100,
            "0136: pending freight and loaded fee reserve max rather than their sum");
        const feeReceipt = Object.values(Memory.terminalOps.operations).find((op) => op.kind === "receipt" && op.resourceType === "energy");
        assert(!feeReceipt || feeReceipt.amount <= 100,
            "0136: surplus scan never mints a receipt for accepted intent freight");
        Memory.terminalOps.operations = { [buy.id]: buy }; buy.feeLoadedAmount = 400;
        assert(claims.physicalFree(room, room.terminal, "energy") === 100,
            "0136: partially staged fee is topped up by the intent claim without double counting");
        reset(); ops.tick();
        const tx = transaction(400); Game.market.incomingTransactions = [tx];
        room.terminal.store.UH2O = 400; room.terminal.store.energy -= 360;
        Game.time++; ops.tick();
        assert(buy.dealtAmount === 400 && buy.remaining === 600 && buy.transactionCost === 360 && buy.accounting.credits === -400,
            "0136: a partial engine fill books only confirmed quantity, freight and credits");
        Game.time++; ops.tick();
        assert(buy.dealtAmount === 400 && buy.accounting.amount === 400,
            "0136: replayed partial transaction does not duplicate the confirmed purchase");
        reset(); ops.tick();
        buy = JSON.parse(JSON.stringify(buy)); Memory.terminalOps.operations[buy.id] = buy;
        assert(claims.physicalFree(room, room.terminal, "energy", buy.id, claims.owner(buy)) === 100,
            "0136: reset and the same owner cannot bypass accepted intent freight");
        ops.cancel(buy.id);
        assert(buy.cancelRequested && claims.physicalFree(room, room.terminal, "energy") === 100,
            "0136: cancelling an accepted intent keeps its freight claim until confirmation");
        Game.time++; ops.tick();
        assert(buy.state === "cancelled" && !buy.accounting.amount && !buy.accounting.credits,
            "0136: cancellation after no effect releases only unspent intent reservations");
        reset(); buy.resourceType = "energy"; buy.limit = 20; orders[0].resourceType = "energy"; ops.tick();
        const energyTx = Object.assign(transaction(400), { resourceType: "energy" });
        Game.market.incomingTransactions = [energyTx]; room.terminal.store.energy += 40;
        Game.time++; ops.tick();
        assert(buy.dealtAmount === 400 && buy.netBought === 40 && buy.transactionCost === 360,
            "0136: partial energy purchase confirms gross400 and net40 with actual freight360");
        reset(); buy.kind = "sell"; buy.loadedAmount = 1000; buy.limit = 1; room.terminal.store.UH2O = 1000;
        orders[0].type = ORDER_BUY; orders[0].price = 5; ops.tick();
        assert(claims.physicalFree(room, room.terminal, "UH2O", buy.id, claims.owner(buy)) === 0,
            "0136: pending sale cargo stays protected even against the same owner's old jobs");
        Game.market.outgoingTransactions = [Object.assign(transaction(400), { to: "Far", from: room.name })];
        room.terminal.store.UH2O = 600; room.terminal.store.energy -= 360;
        Game.time++; ops.tick();
        assert(buy.dealtAmount === 400 && buy.loadedAmount === 600 && buy.accounting.credits === 2000 && buy.transactionCost === 360,
            "0136: partial sale preserves unsold cargo and books only actual proceeds and freight");
        reset(); ops.tick(); Game.time++; ops.tick();
        const firstFailure = buy.orderRetries.offer;
        assert(firstFailure.failures === 1 && firstFailure.retryAfter === Game.time + 25 && buy.lastDealObservation.traded === 0,
            "0136: no-effect trade records evidence and a bounded first suspension");
        const retained = JSON.parse(JSON.stringify(buy));
        assert(retry.excluded(retained).includes("offer") && retained.orderRetries.offer.retryAfter === firstFailure.retryAfter,
            "0136: reset preserves the retry deadline instead of extending it");
        orders.push({ id: "alternative", roomName: "Far", type: ORDER_SELL, resourceType: "UH2O", price: 2, amount: 1000 });
        let chosen = null; Game.market.deal = (id) => { chosen = id; return OK; }; Game.time++; book.reset(); ops.tick();
        assert(chosen === "alternative", "0136: another eligible offer executes while the cheapest order is suspended");
        Game.time = firstFailure.retryAfter;
        assert(!retry.excluded(retained).includes("offer"), "0136: expired suspension makes the same order eligible again");
        retry.failed(retained, "offer");
        assert(retained.orderRetries.offer.failures === 2 && retained.orderRetries.offer.retryAfter === Game.time + 50,
            "0136: repeated no-effect attempts back off progressively");
        Memory.settings.terminalOps.orderRetryMaxTicks = 60; Game.time += 50; retry.failed(retained, "offer");
        assert(retained.orderRetries.offer.retryAfter === Game.time + 60, "0136: retry delay respects its configured maximum");
        retry.succeeded(retained, "offer");
        assert(!retained.orderRetries.offer && !retry.excluded(retained).includes("offer"),
            "0136: a successful trade clears the order's failure history");
        const legacy = { deadOrderIds: ["legacy"] }; retry.excluded(legacy); const deadline = legacy.nextOrderRetryTick;
        Game.time += 2; retry.excluded(legacy);
        assert(legacy.nextOrderRetryTick === deadline && legacy.orderRetries.legacy.migrated,
            "0136: legacy blacklist migrates once to a temporary suspension without mass release");
        Game.time = deadline;
        assert(!retry.excluded(legacy).length, "0136: a migrated legacy order eventually returns to selection");
        reset(); ops.tick(); Game.time++; ops.tick();
        const priceDeadline = buy.nextOrderRetryTick;
        buy.limit = 1.5; Game.time = priceDeadline; book.reset(); ops.tick();
        assert(buy.state === "waiting" && !buy.pendingDeal && buy.noCandidate.reason === "effective-price-limit" && !buy.dealtAmount,
            "0136: expired suspension still revalidates freight-inclusive price before another attempt");
        buy.limit = 5; Game.market.credits = 0; Game.time += 10; ops.tick();
        assert(!buy.pendingDeal && buy.error === "créditos insuficientes", "0136: retries never bypass physical credits");
        Game.market.credits = 1000000; room.terminal.store.getFreeCapacity = () => 0; Game.time += 10; ops.tick();
        assert(!buy.pendingDeal && buy.error === "capacidade de recebimento insuficiente", "0136: retries never bypass terminal capacity");
        room.terminal.store.getFreeCapacity = () => 290000; room.terminal.cooldown = 1; Game.time += 10; ops.tick();
        assert(!buy.pendingDeal && buy.error === "terminal em cooldown", "0136: retries never bypass terminal cooldown");

        const fixture = require("./fixtures/0150-terminal-power.json");
        global.PWR_OPERATE_TERMINAL = fixture.power;
        global.POWER_INFO = { [fixture.power]: { effect: fixture.factors } };
        const powerCost = load("terminalPowerCost");
        for (const vector of fixture.rounding) assert(powerCost.debit(vector.raw, vector.factor) === vector.debit,
            "0150 terminal: native rounding raw " + vector.raw + " factor " + vector.factor);
        assert(powerCost.multiplier({ effects: [{ effect: fixture.power, level: 6, ticksRemaining: 100 }] }) === 1 &&
            powerCost.multiplier({ effects: [{ effect: 999, level: 5, ticksRemaining: 100 }] }) === 1,
            "0150 terminal: unsupported levels and unrelated effects never invent a discount");
        reset(); buy.limit = 1.85; ops.tick();
        assert(!buy.pendingDeal, "0150 terminal: unpowered purchase rejects an effective price above its limit");
        reset(); buy.limit = 1.85;
        room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 100 }]; ops.tick();
        assert(buy.pendingDeal && buy.pendingDeal.cost === 810,
            "0150 terminal: realized freight discount can make the same purchase economically eligible");
        for (let level = 1; level <= 5; level++) {
            reset(); room.terminal.effects = [{ effect: fixture.power, level, ticksRemaining: 1 }];
            ops.tick();
            assert(buy.pendingDeal && buy.pendingDeal.cost === Math.ceil(900 * fixture.factors[level - 1]) &&
                buy.pendingDeal.requiredEnergy === 900,
                "0150 terminal: level " + level + " uses discounted debit and raw API buffer on the final active tick");
            assert(claims.physicalFree(room, room.terminal, "energy", buy.id, claims.owner(buy)) === 100,
                "0150 terminal: accepted level " + level + " intent protects the raw buffer even from its owner");
        }
        reset(); room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 100 }];
        room.terminal.store.energy = 810; let calls = 0; Game.market.deal = () => { calls++; return OK; };
        ops.tick();
        assert(calls === 0 && !buy.pendingDeal, "0150 terminal: discounted fuel alone never passes the raw API precondition");
        Memory.settings.terminalFuel = { enabled: true, margin: 0 };
        const forecast = load("terminalFuel").plan(room);
        assert(forecast.forecast === 900 && forecast.reserve >= 900,
            "0150 terminal: fuel forecast funds the API buffer rather than only expected consumption");
        reset(); room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 1 }]; ops.tick();
        const poweredTx = transaction(400);
        buy = JSON.parse(JSON.stringify(buy)); Memory.terminalOps.operations[buy.id] = buy;
        room.terminal.effects = [{ effect: fixture.power, level: 5, ticksRemaining: 100 }];
        room.terminal.store.UH2O = 400; room.terminal.store.energy -= 324;
        Game.market.incomingTransactions = [poweredTx]; Game.time++; ops.tick();
        assert(buy.dealtAmount === 400 && buy.transactionCost === 324 && buy.accounting.energy === 324,
            "0150 terminal: partial fill after reset uses the intent's factor, not the current effect");
        assert(buy.effectUncertain && buy.accounting.confidence === "incomplete",
            "0150 terminal: an unprovable effect timeline never certifies predicted freight as actual cost");
        assert(!buy.pendingDeal && claims.feeClaim(buy) === 0,
            "0150 terminal: settlement releases the unused API buffer without booking it as consumption");
        reset(); room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 1 }]; ops.tick();
        Game.market.incomingTransactions = [transaction(1000)]; room.terminal.store.UH2O = 1000;
        room.terminal.store.energy -= 810; room.terminal.effects = []; Game.time++; ops.tick();
        assert(buy.transactionCost === 810 && buy.dealtAmount === 1000 && claims.feeClaim(buy) === 0,
            "0150 terminal: full fill books discounted debit and releases the gross buffer after expiry");
        Game.time++; ops.tick();
        assert(buy.transactionCost === 810 && buy.dealtAmount === 1000,
            "0150 terminal: replay does not duplicate operated freight or quantity");
        reset(); buy.resourceType = "energy"; buy.limit = 20; orders[0].resourceType = "energy";
        room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 1 }]; ops.tick();
        Game.market.incomingTransactions = [Object.assign(transaction(400), { resourceType: "energy" })];
        room.terminal.effects = []; room.terminal.store.energy += 76; Game.time++; ops.tick();
        assert(buy.dealtAmount === 400 && buy.netBought === 76 && buy.transactionCost === 324,
            "0150 terminal: powered partial energy purchase confirms gross, net and discounted freight");
        reset(); buy.kind = "sell"; buy.resourceType = "energy"; buy.loadedAmount = 1000; buy.limit = 1;
        orders[0].type = ORDER_BUY; orders[0].resourceType = "energy"; orders[0].price = 5;
        room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 100 }];
        room.terminal.store.energy = 1850; calls = 0; Game.market.deal = () => { calls++; return OK; };
        ops.tick();
        assert(calls === 0 && !buy.pendingDeal, "0150 terminal: energy sale funds cargo plus raw freight, not cargo plus discounted freight");
        reset(); buy.kind = "sell"; buy.resourceType = "energy"; buy.loadedAmount = 1000; buy.limit = 1;
        orders[0].type = ORDER_BUY; orders[0].resourceType = "energy"; orders[0].price = 5;
        room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 1 }];
        room.terminal.store.energy = 1900; ops.tick();
        assert(buy.pendingDeal && claims.physicalFree(room, room.terminal, "energy", buy.id, claims.owner(buy)) === 0,
            "0150 terminal: accepted energy sale protects cargo and the entire raw API buffer");
        room.terminal.store.energy -= 1810; room.terminal.effects = []; Game.time++; ops.tick();
        assert(buy.dealtAmount === 1000 && buy.transactionCost === 810 && buy.accounting.credits === 5000,
            "0150 terminal: energy sale balance evidence includes actual freight before confirming full quantity");
        reset(); room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 0 }]; ops.tick();
        assert(buy.pendingDeal.cost === 900, "0150 terminal: expired effect preserves the unpowered reference");
        const policy = load("resourcePolicy"), swing = load("swingTrade");
        const providers = { ready: market.historyReady, summary: market.sampleSummary, snapshot: market.snapshot,
            terminalFree: policy.terminalFree, deficit: policy.deficit };
        try {
            reset();
            Memory.settings.swing = { minSamples: 1, margin: 0 };
            market.historyReady = () => true;
            market.sampleSummary = () => ({ length: 100, buyCount: 100, sellCount: 100, buyTick: Game.time, sellTick: Game.time });
            market.snapshot = () => ({ resources: { energy: { buyPrice: 20, sellPrice: 20, fairPrice: 1 } } });
            policy.terminalFree = () => 300000; policy.deficit = () => 100;
            orders[0].resourceType = "energy";
            const baseQuote = swing.quote(room, "buy", "energy", 1000, { orders });
            room.terminal.effects = [{ effect: fixture.power, level: 1, ticksRemaining: 100 }];
            const poweredQuote = swing.quote(room, "buy", "energy", 1000, { orders });
            assert(baseQuote.quantity === 1000 && baseQuote.netAmount === 100 && poweredQuote.quantity < 1000 &&
                poweredQuote.netAmount === 100 && poweredQuote.cost < poweredQuote.requiredEnergy,
                "0150 terminal: swing sizes gross energy against discounted net delivery without exceeding the deficit");
        } finally {
            market.historyReady = providers.ready; market.sampleSummary = providers.summary; market.snapshot = providers.snapshot;
            policy.terminalFree = providers.terminalFree; policy.deficit = providers.deficit;
        }
    } finally {
        Game.rooms = saved.rooms; Game.creeps = saved.creeps; Game.market = saved.market; Game.time = saved.time;
        Game.getObjectById = saved.get; Memory.settings = saved.settings; Memory.terminalOps = saved.ops;
        Memory.craft = saved.craft; Memory.marketFlip = saved.flip; market.snapshot = saved.snapshot; book.reset();
        if (saved.power === undefined) delete global.PWR_OPERATE_TERMINAL; else global.PWR_OPERATE_TERMINAL = saved.power;
        if (saved.powerInfo === undefined) delete global.POWER_INFO; else global.POWER_INFO = saved.powerInfo;
    }
};
