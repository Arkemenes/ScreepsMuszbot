// ROADMAP 0098: sole owner of terminal-operation state. The hauler only
// executes terminalJob assigned here; it never chooses policy.
const census = require("./census");
const config = require("./config");
const marketPrices = require("./market");
const roomCache = require("./roomCache");

const FINAL_STATES = ["completed", "failed", "cancelled"];

function memory() {
    if (!Memory.terminalOps) Memory.terminalOps = { nextId: 1, operations: {}, seenIncoming: {}, events: [], terminalBalance: {} };
    const mem = Memory.terminalOps;
    if (!mem.operations) mem.operations = {};
    if (!mem.seenIncoming) mem.seenIncoming = {};
    if (!mem.events) mem.events = [];
    if (!mem.terminalBalance) mem.terminalBalance = {};
    return mem;
}
function result(ok, value) {
    const response = ok ? { ok: true, id: value } : { ok: false, error: value };
    response.toString = () => ok ? ("ok: " + value) : ("erro: " + value);
    return response;
}
function amount(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
function validResource(type) {
    return typeof type === "string" && (marketOnlyResource(type) || !Array.isArray(RESOURCES_ALL) || RESOURCES_ALL.indexOf(type) >= 0);
}
function marketOnlyResource(type) {
    const names = ["pixel", "accessKey", "access_key", "cpuUnlock", "cpu_unlock"];
    const constants = [typeof RESOURCE_PIXEL !== "undefined" ? RESOURCE_PIXEL : null, typeof RESOURCE_ACCESS_KEY !== "undefined" ? RESOURCE_ACCESS_KEY : null, typeof RESOURCE_CPU_UNLOCK !== "undefined" ? RESOURCE_CPU_UNLOCK : null];
    return names.indexOf(type) >= 0 || constants.indexOf(type) >= 0;
}
function operation(id) { return memory().operations[id] || null; }
function active(op) { return op && FINAL_STATES.indexOf(op.state) < 0; }
function storeValue(store, resource) { return store && (store[resource] || 0) || 0; }
function freeCapacity(store, resource) { return !store || typeof store.getFreeCapacity !== "function" ? Infinity : Math.max(0, store.getFreeCapacity(resource)); }
function room(name) { return Game.rooms && Game.rooms[name]; }
function owned(name) { const value = room(name); return value && value.controller && value.controller.my && value.storage && value.terminal ? value : null; }
function txCost(value, from, to) { return Game.market && typeof Game.market.calcTransactionCost === "function" ? Game.market.calcTransactionCost(value, from, to) : 0; }
function touch(op, state) { if (state) op.state = state; op.updatedTick = Game.time; }

// One logical operation owns its source resource and involved terminals until
// it reaches a final state. This prevents manual and automatic work from
// racing between two calls to the public API in the same tick.
function lockConflict(kind, from, to, resourceType) {
    return Object.keys(memory().operations).map(operation).filter(active).some((op) => {
        const sameFrom = from && (op.sourceRoom === from || op.targetRoom === from);
        const sameTo = to && (op.sourceRoom === to || op.targetRoom === to);
        if (kind === "receipt") return sameTo && op.kind === "receipt" && op.resourceType === resourceType;
        if (op.kind === "receipt") return false;
        if ((sameFrom || sameTo) && op.resourceType === resourceType) return true;
        return sameFrom && op.kind === kind;
    });
}
function create(kind, from, to, resourceType, value, options) {
    const mem = memory();
    const id = "terminal-" + mem.nextId++;
    mem.operations[id] = Object.assign({ id, kind, sourceRoom: from || null, targetRoom: to || null, resourceType, amount: value, remaining: value, state: "queued", createdTick: Game.time, updatedTick: Game.time, loadedAmount: 0, sentAmount: 0, receivedAmount: 0, transactionCost: 0 }, options || {});
    return id;
}
function reservedFrom(roomName, resourceType) {
    return Object.keys(memory().operations).map(operation).reduce((sum, op) => {
        if (!active(op) || op.sourceRoom !== roomName || op.resourceType !== resourceType || (op.kind !== "transfer" && op.kind !== "sell")) return sum;
        return sum + Math.max(0, (op.amount || 0) - (op.loadedAmount || 0) - (op.sentAmount || 0));
    }, 0);
}

function announce(command, response) {
    if (!response.ok) console.log("[" + command + "] não criada: " + response.error);
    return response;
}
function transfer(from, to, resourceType, value, options) {
    const source = owned(from), target = owned(to);
    if (!source || !target || from === to) return result(false, "origem/destino precisa ser sala própria com storage e terminal");
    if (!validResource(resourceType) || marketOnlyResource(resourceType) || !amount(value)) return result(false, "recurso ou quantidade inválido para transferência física");
    if (lockConflict("transfer", from, to, resourceType)) return result(false, "já existe uma operação concorrente para este terminal/recurso");
    const cost = txCost(value, from, to);
    const available = Math.max(0, storeValue(source.storage.store, resourceType) - reservedFrom(from, resourceType));
    const needed = value + (resourceType === RESOURCE_ENERGY ? cost : 0);
    if (available < needed) return result(false, "material insuficiente: disponível " + available + ", necessário " + needed);
    if (resourceType !== RESOURCE_ENERGY && storeValue(source.storage.store, RESOURCE_ENERGY) < cost) return result(false, "energia de taxa insuficiente: necessário " + cost);
    return result(true, create("transfer", from, to, resourceType, value, Object.assign({ transactionCost: cost }, options || {})));
}
function priceData(resourceType, requireEnergy) {
    const snapshot = marketPrices.snapshot();
    const data = snapshot && snapshot.resources && snapshot.resources[resourceType];
    const energy = snapshot && snapshot.resources && snapshot.resources[RESOURCE_ENERGY];
    if (!data) return null;
    if (requireEnergy && (!energy || typeof energy.fairPrice !== "number")) return null;
    return { data, energy: energy && typeof energy.fairPrice === "number" ? energy.fairPrice : 0 };
}
function trade(kind, roomName, resourceType, value, limit) {
    const marketOnly = marketOnlyResource(resourceType);
    const target = marketOnly ? room(roomName) : owned(roomName);
    if (marketOnly && (!target || !target.controller || !target.controller.my)) return result(false, "sala precisa ser própria para uma operação de mercado");
    if (!target) return result(false, "sala precisa ser própria com storage e terminal");
    if (!validResource(resourceType) || !amount(value) || !(typeof limit === "number" && limit > 0)) return result(false, "recurso, quantidade ou limite inválido");
    if (lockConflict(kind, roomName, null, resourceType)) return result(false, "já existe uma operação concorrente para este terminal/recurso");
    const prices = priceData(resourceType, !marketOnly);
    if (!prices) return result(false, "aguardando cotação temporal e fairPrice de energia");
    const available = marketOnly ? value : Math.max(0, storeValue(target.storage.store, resourceType) - reservedFrom(roomName, resourceType));
    if (!marketOnly && kind === "sell" && available < value) return result(false, "material insuficiente: disponível " + available + ", necessário " + value);
    // A BUY consumes an ORDER_SELL; a SELL consumes an ORDER_BUY.
    const reference = kind === "buy" ? prices.data.sellPrice : prices.data.buyPrice;
    if (!(typeof reference === "number" && reference > 0)) return result(false, "aguardando " + kind + "Price temporal");
    return result(true, create(kind, roomName, null, resourceType, value, { limit, referencePrice: reference, energyFairPrice: prices.energy, marketOnly }));
}
function buy(roomName, resourceType, value, maxUnitPrice) { return announce("terminalBuy", trade("buy", roomName, resourceType, value, maxUnitPrice)); }
function sell(roomName, resourceType, value, minUnitPrice) { return announce("terminalSell", trade("sell", roomName, resourceType, value, minUnitPrice)); }
function activeForRoom(roomName) { return Object.keys(memory().operations).map(operation).filter((op) => active(op) && (op.sourceRoom === roomName || op.targetRoom === roomName)); }
function record(op, value, credits, energy) { memory().events.push({ tick: Game.time, room: op.sourceRoom || op.targetRoom, kind: op.kind, amount: value || 0, credits: credits || 0, transactionEnergy: energy || 0 }); }

function findHauler(roomName) { return census.creepsByRole(roomName, "hauler").find((creep) => !creep.memory.terminalJob && creep.store.getUsedCapacity() === 0); }
function assign(op, home, direction, from, to, value, resourceType) {
    resourceType = resourceType || op.resourceType;
    if (value <= 0) { touch(op, direction === "load" ? "atTerminal" : "completed"); return false; }
    if (direction === "load" && freeCapacity(to.store, resourceType) < value) { op.error = "capacidade insuficiente no terminal"; touch(op, "waiting"); return false; }
    if (direction === "unload" && freeCapacity(to.store, resourceType) < value) { op.error = "capacidade insuficiente no storage"; touch(op, "waiting"); return false; }
    const creep = findHauler(home.name);
    if (!creep) { op.error = "sem hauler disponível"; op.waitingDirection = direction; touch(op, "waiting"); return false; }
    creep.memory.terminalJob = { operationId: op.id, direction, fromId: from.id, toId: to.id, resourceType, amount: value };
    op.haulerName = creep.name;
    op.waitingDirection = direction;
    touch(op, direction === "load" ? "loading" : "unloading");
    return true;
}

function orderAmount(order) { return order && (order.remainingAmount || order.amount) || 0; }
function candidateOrders(op) {
    if (!Game.market || typeof Game.market.getAllOrders !== "function") return [];
    const wanted = op.kind === "buy" ? ORDER_SELL : ORDER_BUY;
    let orders = [];
    try { orders = Game.market.getAllOrders({ type: wanted, resourceType: op.resourceType }) || []; } catch (error) { return []; }
    return orders.filter((order) => order && order.roomName && order.price > 0 && orderAmount(order) > 0).map((order) => {
        const origin = room(op.sourceRoom);
        const quantity = Math.min(op.remaining, orderAmount(order), op.kind === "sell" && !op.marketOnly ? (op.loadedAmount || 0) : op.remaining);
        const cost = op.marketOnly ? 0 : txCost(quantity, op.sourceRoom, order.roomName);
        const fee = quantity ? cost * (op.energyFairPrice || 0) / quantity : Infinity;
        return { order, quantity, cost, effective: op.kind === "buy" ? order.price + fee : order.price - fee };
    }).filter((item) => item.quantity > 0 && (op.kind === "buy" ? item.effective <= op.limit : item.effective >= op.limit)).sort((a, b) => op.kind === "buy" ? a.effective - b.effective : b.effective - a.effective);
}
function executeDeal(op, target) {
    const candidate = candidateOrders(op)[0];
    if (!candidate) { touch(op, "listing"); return; }
    if (!op.marketOnly && target.terminal.cooldown) { op.error = "terminal em cooldown"; touch(op, "waiting"); return; }
    if (!op.marketOnly && storeValue(target.terminal.store, RESOURCE_ENERGY) < candidate.cost) {
        const missingEnergy = candidate.cost - storeValue(target.terminal.store, RESOURCE_ENERGY);
        let assigned = false;
        if (!op.feeJob) {
            op.feeJob = true;
            assigned = assign(op, target, "fee", target.storage, target.terminal, missingEnergy, RESOURCE_ENERGY);
            if (!assigned) delete op.feeJob;
        }
        if (assigned) return;
        op.error = "energia de taxa insuficiente"; touch(op, "waiting"); return;
    }
    if (op.kind === "buy" && (!Game.market || Game.market.credits < candidate.order.price * candidate.quantity)) { op.error = "créditos insuficientes"; touch(op, "waiting"); return; }
    const status = Game.market.deal(candidate.order.id, candidate.quantity, op.sourceRoom);
    if (status !== OK) { op.error = "deal retornou " + status; touch(op, "waiting"); return; }
    op.remaining -= candidate.quantity; op.dealtAmount = (op.dealtAmount || 0) + candidate.quantity; op.transactionCost += candidate.cost;
    op.feeLoadedAmount = Math.max(0, (op.feeLoadedAmount || 0) - candidate.cost);
    if (op.kind === "sell") op.loadedAmount = Math.max(0, (op.loadedAmount || 0) - candidate.quantity);
    record(op, candidate.quantity, candidate.order.price * candidate.quantity * (op.kind === "buy" ? -1 : 1), candidate.cost);
    touch(op, op.remaining ? "queued" : (op.kind === "buy" && !op.marketOnly ? "awaitingReceipt" : "completed"));
}
function competitivePrice(op) {
    const step = config.get("terminalOps.marketPriceStep", 0.001);
    let orders = [];
    try { orders = Game.market.getAllOrders({ type: op.kind === "buy" ? ORDER_BUY : ORDER_SELL, resourceType: op.resourceType }) || []; } catch (error) { orders = []; }
    const prices = orders.filter((order) => order && order.price > 0 && order.roomName).map((order) => {
        const cost = op.marketOnly ? 0 : txCost(Math.max(1, op.remaining), op.sourceRoom, order.roomName);
        const delivery = cost * (op.energyFairPrice || 0) / Math.max(1, op.remaining);
        return op.kind === "buy" ? order.price - delivery : order.price + delivery;
    });
    if (!prices.length) return op.referencePrice;
    return op.kind === "buy" ? Math.max.apply(null, prices) + step : Math.min.apply(null, prices) - step;
}
function listResidual(op, target) {
    if (!Game.market || typeof Game.market.createOrder !== "function") { op.error = "mercado indisponível"; touch(op, "waiting"); return; }
    const ceiling = op.kind === "buy" ? op.limit / 1.05 : Infinity;
    const floor = op.kind === "sell" ? op.limit / 0.95 : 0;
    const price = op.kind === "buy" ? Math.min(competitivePrice(op), ceiling) : Math.max(competitivePrice(op), floor);
    if (!(price > 0) || (op.kind === "buy" && price > ceiling) || (op.kind === "sell" && price < floor)) { op.error = "não há preço competitivo dentro do limite líquido"; touch(op, "waiting"); return; }
    const old = op.marketOrderId && Game.market.orders && Game.market.orders[op.marketOrderId];
    const interval = config.get("terminalOps.repriceInterval", 1000);
    if (old && Game.time - (op.repriceTick || op.listedTick || 0) < interval) { touch(op, "listed"); return; }
    if (old && typeof Game.market.cancelOrder === "function") Game.market.cancelOrder(op.marketOrderId);
    const fee = price * op.remaining * 0.05;
    if (Game.market.credits < fee) {
        op.error = "créditos insuficientes para taxa da ordem: disponível " +
            Game.market.credits + ", necessário " + fee +
            ", quantidade " + op.remaining + ", preço " + price;
        touch(op, "failed");
        return;
    }
    const status = Game.market.createOrder({ type: op.kind === "buy" ? ORDER_BUY : ORDER_SELL, resourceType: op.resourceType, price, totalAmount: op.remaining, roomName: target.name });
    if (status !== OK) { op.error = "createOrder retornou " + status; touch(op, "waiting"); return; }
    op.marketOrderId = null; op.listedPrice = price; op.listedAmount = op.remaining; op.listedTick = Game.time; op.repriceTick = Game.time; touch(op, "listing");
}
function bindCreatedOrders() {
    if (!Game.market || !Game.market.orders) return;
    Object.keys(memory().operations).forEach((id) => {
        const op = operation(id);
        if (!op || op.state !== "listing") return;
        Object.keys(Game.market.orders).some((orderId) => {
            const order = Game.market.orders[orderId];
            if (!order || order.roomName !== op.sourceRoom || order.resourceType !== op.resourceType || order.type !== (op.kind === "buy" ? ORDER_BUY : ORDER_SELL) || order.created < op.listedTick) return false;
            op.marketOrderId = orderId; touch(op, "listed"); return true;
        });
    });
}
function syncManagedOrders() {
    if (!Game.market || !Game.market.orders) return;
    Object.keys(memory().operations).map(operation).forEach((op) => {
        if (!active(op) || !op.marketOrderId) return;
        const order = Game.market.orders[op.marketOrderId];
        if (!order) return;
        const remainingOnMarket = order.remainingAmount === undefined ? order.amount : order.remainingAmount;
        const filled = Math.max(0, (op.listedAmount || op.remaining) - remainingOnMarket - (op.listedFilled || 0));
        if (filled <= 0) return;
        op.listedFilled = (op.listedFilled || 0) + filled;
        op.remaining = Math.max(0, op.remaining - filled);
        record(op, filled, order.price * filled * (op.kind === "buy" ? -1 : 1), 0);
        if (op.remaining <= 0) {
            if (op.kind === "buy") touch(op, "awaitingReceipt");
            else touch(op, "completed");
        }
    });
}

function incomingReceipt(roomName, resourceType, value, parentId) {
    const target = owned(roomName);
    if (!target || value <= 0) return false;
    const existing = activeForRoom(roomName).find((op) => op.kind === "receipt" && op.targetRoom === roomName && op.resourceType === resourceType);
    if (existing) {
        existing.amount += value;
        if (!existing.parentId && parentId) existing.parentId = parentId;
        existing.updatedTick = Game.time;
        return true;
    }
    if (lockConflict("receipt", null, roomName, resourceType)) return true;
    const id = create("receipt", null, roomName, resourceType, value, { parentId, state: "awaitingReceipt" });
    assign(operation(id), target, "unload", target.terminal, target.storage, value);
    return true;
}
function awaitingReceiptFor(roomName, resourceType) {
    return activeForRoom(roomName).find((op) => ((op.targetRoom === roomName) || (op.sourceRoom === roomName && op.kind === "buy")) && op.resourceType === resourceType && ["awaitingReceipt", "unloading", "waiting"].indexOf(op.state) >= 0 && op.kind !== "receipt");
}
function scanIncoming() {
    const transactions = Game.market && Array.isArray(Game.market.incomingTransactions) ? Game.market.incomingTransactions : [];
    transactions.forEach((tx) => {
        if (!tx || !tx.transactionId || memory().seenIncoming[tx.transactionId]) return;
        if (tx.to && validResource(tx.resourceType) && amount(tx.amount)) {
            const parent = awaitingReceiptFor(tx.to, tx.resourceType);
            if (!incomingReceipt(tx.to, tx.resourceType, tx.amount, parent && parent.id)) return;
        }
        memory().seenIncoming[tx.transactionId] = Game.time;
    });
    Object.keys(memory().seenIncoming).forEach((id) => { if (Game.time - memory().seenIncoming[id] > 1000) delete memory().seenIncoming[id]; });
}
function managedTerminalIncrease(roomName, resourceType) {
    return activeForRoom(roomName).reduce((sum, op) => {
        if (op.sourceRoom !== roomName || op.resourceType !== resourceType) return sum;
        if (op.kind === "sell" || op.kind === "transfer") sum += Math.max(0, op.loadedAmount || 0);
        if (resourceType === RESOURCE_ENERGY) sum += Math.max(0, op.feeLoadedAmount || 0);
        return sum;
    }, 0);
}
function scanTerminalBalances() {
    const seen = memory().terminalBalance;
    Object.keys(Game.rooms || {}).forEach((name) => {
        const target = owned(name);
        if (!target) return;
        Object.keys(target.terminal.store || {}).forEach((resourceType) => {
            if (!validResource(resourceType)) return;
            const current = storeValue(target.terminal.store, resourceType), key = name + ":" + resourceType;
            const previous = seen[key] || 0;
            const reserved = activeForRoom(name).filter((op) => op.targetRoom === name && op.kind !== "receipt" && op.resourceType === resourceType && (op.state === "awaitingReceipt" || op.state === "unloading")).reduce((sum, op) => sum + Math.max(0, op.amount - (op.receivedAmount || 0)), 0);
            const receiptPending = activeForRoom(name).filter((op) => op.kind === "receipt" && op.targetRoom === name && op.resourceType === resourceType).reduce((sum, op) => sum + Math.max(0, op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0)), 0);
            // A load performed by our own sell/transfer operation is not an
            // incoming transaction. Without this subtraction, every batch
            // loaded for SELL becomes a synthetic receipt and gets hauled back
            // to storage, creating an endless terminal/storage cycle.
            const managedIncrease = managedTerminalIncrease(name, resourceType);
            const delta = Math.max(0, current - previous - managedIncrease - reserved - receiptPending);
            if (delta > 0) {
                const parent = awaitingReceiptFor(name, resourceType);
                incomingReceipt(name, resourceType, delta, parent && parent.id);
            }
            seen[key] = current;
        });
    });
}
function recover(op, source) {
    if (!op.haulerName || (Game.creeps && Game.creeps[op.haulerName])) return;
    op.recoveryStartedTick = op.recoveryStartedTick || Game.time;
    if (Game.time - op.recoveryStartedTick >= config.get("terminalOps.recoveryTicks", 10000)) {
        op.error = "recovery timeout";
        touch(op, "failed");
        return;
    }
    op.haulerName = null;
    const recoveryRoom = source || owned(op.targetRoom);
    const drops = recoveryRoom && typeof FIND_DROPPED_RESOURCES !== "undefined" ? roomCache.droppedResources(recoveryRoom) || [] : [];
    const drop = drops.find((candidate) => candidate && candidate.resourceType === op.resourceType && candidate.amount > 0);
    if (drop && recoveryRoom) {
        op.recoveryAttempts = (op.recoveryAttempts || 0) + 1;
        touch(op, "recovering");
        assign(op, recoveryRoom, "recover", drop, recoveryRoom.storage, Math.min(op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0), drop.amount));
        return;
    }
    if (op.loadedAmount > 0 && source) {
        op.recoveryAttempts = (op.recoveryAttempts || 0) + 1;
        if (op.recoveryAttempts > 3) { op.error = "hauler morreu e não foi possível recuperar a carga"; touch(op, "failed"); }
        else { touch(op, "recovering"); assign(op, source, "recover", source.terminal, source.storage, op.loadedAmount); }
    } else touch(op, op.kind === "receipt" ? "waiting" : "queued");
}
function tickTransfer(op, source, target) {
    if (op.state === "queued" || (op.state === "waiting" && op.waitingDirection !== "unload")) assign(op, source, "load", source.storage, source.terminal, op.amount - op.loadedAmount);
    if (op.state === "atTerminal") {
        if (op.loadedAmount < op.amount) { touch(op, "queued"); return; }
        if (source.terminal.cooldown) { op.error = "terminal em cooldown"; touch(op, "waiting"); return; }
        if (storeValue(source.terminal.store, op.resourceType) < op.loadedAmount) { op.error = "carga ainda não está no terminal"; return; }
        touch(op, "executing");
        const status = source.terminal.send(op.resourceType, op.amount, op.targetRoom, "terminal operation " + op.id);
        if (status === OK) { op.sentAmount = op.amount; op.remaining = 0; op.targetTerminalBaseline = storeValue(target.terminal.store, op.resourceType); record(op, op.amount, 0, op.transactionCost); touch(op, "awaitingReceipt"); }
        else { op.error = "send retornou " + status; touch(op, "waiting"); }
    }
    if ((op.state === "awaitingReceipt" || (op.state === "waiting" && op.waitingDirection === "unload")) && target && storeValue(target.terminal.store, op.resourceType) - (op.targetTerminalBaseline || 0) >= op.amount) assign(op, target, "unload", target.terminal, target.storage, op.amount);
}
function tickReceipt(op, target) {
    if (["awaitingReceipt", "waiting", "unloading"].indexOf(op.state) < 0) return;
    const available = storeValue(target.terminal.store, op.resourceType);
    const remainingAmount = Math.max(0, op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0));
    if (available > 0 && remainingAmount > 0) assign(op, target, "unload", target.terminal, target.storage, Math.min(remainingAmount, available));
    else if (remainingAmount <= 0) touch(op, "completed");
}
function gcOperations() {
    const retention = config.get("terminalOps.operationRetentionTicks", 10000);
    Object.keys(memory().operations).forEach((id) => {
        const op = operation(id);
        if (op && FINAL_STATES.indexOf(op.state) >= 0 && Game.time - (op.updatedTick || op.createdTick || Game.time) >= retention) delete memory().operations[id];
    });
}
function tick() {
    if (!config.get("terminalOps.enabled", true)) return;
    memory(); gcOperations(); bindCreatedOrders(); syncManagedOrders(); scanIncoming(); scanTerminalBalances();
    Object.keys(memory().operations).forEach((id) => {
        const op = operation(id); if (!active(op)) return;
        const marketOnly = op.marketOnly || marketOnlyResource(op.resourceType);
        const source = op.sourceRoom && (marketOnly ? room(op.sourceRoom) : owned(op.sourceRoom)), target = op.targetRoom && owned(op.targetRoom);
        if (op.kind === "receipt") {
            if (op.recoveryStartedTick && Game.time - op.recoveryStartedTick >= config.get("terminalOps.recoveryTicks", 10000)) { op.error = "recovery timeout"; touch(op, "failed"); return; }
            if (op.haulerName && (!Game.creeps || !Game.creeps[op.haulerName])) recover(op, target);
            if (target && (!op.haulerName || !Game.creeps || !Game.creeps[op.haulerName] || !Game.creeps[op.haulerName].memory.terminalJob)) tickReceipt(op, target);
            return;
        }
        if (!source || (op.kind === "transfer" && !target)) { op.error = "terminal/storage indisponível"; touch(op, "waiting"); return; }
        if (marketOnly) {
            if (op.state === "queued" || op.state === "waiting") executeDeal(op, source);
            else if (op.state === "listing" || op.state === "listed") listResidual(op, source);
            return;
        }
        if (op.haulerName && Game.creeps && Game.creeps[op.haulerName] && Game.creeps[op.haulerName].memory.terminalJob) return;
        if (op.haulerName && (!Game.creeps || !Game.creeps[op.haulerName])) recover(op, source);
        if (["loading", "unloading", "recovering"].indexOf(op.state) >= 0) return;
        if (op.kind === "transfer") tickTransfer(op, source, target);
        else if (op.kind === "sell") {
            if (["queued", "waiting"].indexOf(op.state) >= 0) {
                const buffer = Math.min(config.get("terminalOps.saleBufferAmount", 10000), Math.floor((source.terminal.store.getCapacity(op.resourceType) || 0) * config.get("terminalOps.saleBufferCapacityRatio", 0.1)));
                const already = storeValue(source.terminal.store, op.resourceType);
                assign(op, source, "load", source.storage, source.terminal, Math.min(op.remaining, Math.max(0, buffer - already)));
            }
            else if (op.state === "atTerminal") executeDeal(op, source);
            else if (op.state === "listing" || op.state === "listed") listResidual(op, source);
        } else if (op.kind === "buy") {
            if (["queued", "waiting"].indexOf(op.state) >= 0) executeDeal(op, source);
            else if (op.state === "listing" || op.state === "listed") listResidual(op, source);
        }
    });
}
function runHauler(creep) {
    const job = creep.memory.terminalJob; if (!job) return false;
    const op = operation(job.operationId), from = Game.getObjectById(job.fromId), to = Game.getObjectById(job.toId);
    if (!op || !from || !to) { delete creep.memory.terminalJob; return true; }
    const carried = storeValue(creep.store, job.resourceType);
    const used = typeof creep.store.getUsedCapacity === "function" ? creep.store.getUsedCapacity() : carried;
    // A terminal job is exclusive: never try to mix its resource with an
    // unrelated load already carried by the hauler. ERR_FULL (-8) otherwise
    // leaves the same job retrying forever while normal logistics owns the
    // creep's capacity.
    if (carried <= 0 && used > 0) {
        op.error = "hauler está carregando outro recurso";
        op.haulerName = null;
        touch(op, "waiting");
        delete creep.memory.terminalJob;
        return true;
    }
    if (carried > 0) {
        const status = creep.transfer(to, job.resourceType);
        if (status === ERR_NOT_IN_RANGE) creep.moveTo(to, { range: 1, reusePath: 10 });
        else if (status === OK) {
            if (job.direction === "fee") { op.feeJob = false; op.feeLoadedAmount = (op.feeLoadedAmount || 0) + carried; touch(op, "atTerminal"); }
            else if (job.direction === "load") { op.loadedAmount += carried; touch(op, op.loadedAmount >= op.amount ? "atTerminal" : "queued"); }
            else if (job.direction === "recover") {
                op.recoveredAmount = (op.recoveredAmount || 0) + carried;
                op.loadedAmount = 0; op.recoveryAttempts = 0;
                delete op.recoveryStartedTick;
                if (op.kind === "receipt" && (op.receivedAmount || 0) + op.recoveredAmount >= op.amount) {
                    touch(op, "completed");
                    if (op.parentId) { const parent = operation(op.parentId); if (parent) touch(parent, "completed"); }
                }
                else touch(op, op.kind === "receipt" ? "waiting" : "queued");
            }
            else { op.receivedAmount += carried; if (op.parentId) { const parent = operation(op.parentId); if (parent && op.receivedAmount >= op.amount) touch(parent, "completed"); } touch(op, op.receivedAmount >= op.amount ? "completed" : "waiting"); }
            delete creep.memory.terminalJob;
        }
        else {
            op.error = "transfer retornou " + status;
            op.haulerName = null;
            touch(op, "waiting");
            delete creep.memory.terminalJob;
        }
        return true;
    }
    const capacity = typeof creep.store.getFreeCapacity === "function" ? creep.store.getFreeCapacity(job.resourceType) : job.amount;
    const request = Math.min(job.amount, Math.max(0, capacity));
    if (request <= 0) return true;
    const status = creep.withdraw(from, job.resourceType, request);
    if (status === ERR_NOT_IN_RANGE) creep.moveTo(from, { range: 1, reusePath: 10 });
    else if (status !== OK) { op.error = "withdraw retornou " + status; touch(op, "waiting"); delete creep.memory.terminalJob; }
    return true;
}
function cancel(id) {
    const op = operation(id); if (!op) return result(false, "operação desconhecida");
    if (op.haulerName && Game.creeps && Game.creeps[op.haulerName] && storeValue(Game.creeps[op.haulerName].store, op.resourceType) > 0) { op.error = "carga já retirada; aguardando recuperação"; touch(op, "recovering"); return result(true, id); }
    if (op.marketOrderId && Game.market && typeof Game.market.cancelOrder === "function") Game.market.cancelOrder(op.marketOrderId);
    touch(op, "cancelled"); return result(true, id);
}
function stats(roomName) {
    const summary = { pending: 0, waiting: 0, lastError: null, count: 0, amount: 0, credits: 0, transactionEnergy: 0 };
    Object.keys(memory().operations).map(operation).forEach((op) => { if (op && (op.sourceRoom === roomName || op.targetRoom === roomName)) { if (active(op)) summary.pending++; if (op.state === "waiting") summary.waiting++; if (op.error) summary.lastError = op.error; } });
    const window = config.get("terminalOps.statsWindowTicks", 60);
    memory().events = memory().events.filter((event) => Game.time - event.tick < window);
    memory().events.forEach((event) => { if (event.room === roomName) { summary.count++; summary.amount += event.amount; summary.credits += event.credits; summary.transactionEnergy += event.transactionEnergy; } });
    return summary;
}
global.terminalTransfer = function () { return announce("terminalTransfer", transfer.apply(null, arguments)); };
global.terminalBuy = buy;
global.terminalSell = sell;
global.terminalOperations = () => JSON.stringify(Object.keys(memory().operations).map(operation), null, 2);
global.cancelTerminalOperation = cancel;
module.exports = { transfer, buy, sell, cancel, tick, runHauler, operation, activeForRoom, txCost, stats };
