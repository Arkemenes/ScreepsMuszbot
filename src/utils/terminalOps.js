// ROADMAP 0098: sole owner of terminal-operation state. The hauler only
// executes terminalJob assigned here; it never chooses policy.
const census = require("./census");
const config = require("./config");
const cadence = require("./cadence");
const marketPrices = require("./market");
const roomCache = require("./roomCache");
const stockPolicy = require("./resourcePolicy");
const marketAccounting = require("./marketAccounting");
const cpuMeter = require("./cpuMeter");
const claims = require("./terminalClaims");
const purchaseCost = require("./purchaseCost");
const orderRetry = require("./terminalOrderRetry");

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
// Successful calls register intents; cooldown/store changes arrive next tick.
let terminalIntentTick = null;
let terminalIntentOps = null;
const terminalIntents = new Set();
function terminalBusy(name) {
    const ops = memory().operations;
    if (terminalIntentTick !== Game.time || terminalIntentOps !== ops) {
        terminalIntentTick = Game.time; terminalIntentOps = ops; terminalIntents.clear();
    }
    return terminalIntents.has(name);
}
function claimTerminal(name) { terminalBusy(name); terminalIntents.add(name); }
// StructureTerminal.send() for RESOURCE_ENERGY needs amount + fee physically
// present in the source terminal - the fee is paid by the origin on top of
// what arrives at the destination (transfer()'s own creation check above
// already assumes this, and so does 0097's spec). A "transfer" kind is the
// only one that pays its own transactionCost this way (sell/buy fund the fee
// via a separate "fee" job instead), so this only inflates the load target
// for that kind.
function transferLoadTarget(op) { return op.amount + (op.kind === "transfer" && op.resourceType === RESOURCE_ENERGY ? (op.transactionCost || 0) : 0); }
// Single choke point for state changes, so every path that gives up on an
// operation (credits, market unavailable, createOrder error, ...) is reported
// here instead of requiring each call site to remember to log it. Silent
// "failed" ops used to only be visible via terminalOperations() polling.
function touch(op, state) {
    if (state === "failed" && op.state !== "failed") console.log("[terminalOps] " + op.id + " (" + op.kind + " " + op.resourceType + ", " + (op.sourceRoom || "?") + (op.targetRoom ? "->" + op.targetRoom : "") + ") falhou: " + (op.error || "motivo desconhecido"));
    if ((state === "cancelled" || state === "failed") && active(op)) releaseLotTargets(op);
    if (state) op.state = state;
    op.updatedTick = Game.time;
}
function releaseLotTargets(op) {
    const targets = memory().lotTargets || {};
    (op.lots || []).forEach((lot) => {
        const key = lot.targetKey || op.lotKey;
        if (key && targets[key]) targets[key].accepted = Math.max(0, targets[key].accepted - (lot.remaining || 0));
    });
}

// Outgoing cargo keeps its exclusive owner. Usage replenishment is incoming
// stock and may coexist, sized against pending receipts and shared budgets.
function lockConflict(kind, from, to, resourceType, automatic, options) {
    return activeIds().map(operation).filter(active).some((op) => {
        const sameFrom = from && (op.sourceRoom === from || op.targetRoom === from);
        const sameTo = to && (op.sourceRoom === to || op.targetRoom === to);
        if (kind === "receipt") return sameTo && op.kind === "receipt" && op.resourceType === resourceType;
        if (op.kind === "receipt") return false;
        // Automatic balancing plans several transfers at once, sized against
        // each other: a source may feed many targets, but a target takes one
        // inbound transfer and a room never sends and receives at once.
        if (kind === "transfer" && automatic && op.kind === "transfer" && op.automatic && op.resourceType === resourceType) {
            return op.targetRoom === to || op.targetRoom === from || op.sourceRoom === to;
        }
        // A marketOnly resource (pixel, cpuUnlock, accessKey) lives in
        // Game.resources, never in a terminal, so it neither competes for the
        // terminal's space/cooldown nor is blocked by something that does: the
        // "one operation of this kind per room" rule below must not apply to it
        // in either direction (bug real, usuário reportou em produção,
        // 2026-09-24: terminalSell de pixel recusada por causa de uma venda de O
        // ativa na mesma sala). The stock itself IS account-global, though, so
        // two operations on the same marketOnly resource still conflict no
        // matter which room they were issued from.
        if (marketOnlyResource(resourceType) || marketOnlyResource(op.resourceType)) return op.resourceType === resourceType;
        // Independent inbound lots do not spend the receiver's future BUY.
        // The sender still funds cargo/freight from its current physical stock.
        if (kind === "transfer" && automatic && op.kind === "buy" && op.sourceRoom === to &&
            op.resourceType === resourceType) return false;
        // Named incoming requests and disjoint sales reserve quantities, not a room lock.
        if (options && options.owner && (sameFrom || sameTo) && op.resourceType === resourceType &&
            (kind === "buy" || kind === "sell" && op.kind === "sell")) {
            return op.kind === kind && claims.owner(op) === claims.key(options.owner) && !(kind === "sell" && options.lotManaged);
        }
        const replenishing = kind === "buy" && options && options.policy === "swing" ||
            op.kind === "buy" && op.policy === "swing";
        if (replenishing && op.resourceType === resourceType) return false;
        // Incoming purchases own their new lot, never the outgoing cargo.
        const purchasing = kind === "buy" && options && options.automaticPurchase ||
            op.kind === "buy" && op.automaticPurchase;
        const oppositeDirection = kind === "buy" && (op.kind === "sell" || op.kind === "transfer") ||
            op.kind === "buy" && (kind === "sell" || kind === "transfer");
        if (purchasing && oppositeDirection && op.resourceType === resourceType) return false;
        if ((sameFrom || sameTo) && op.resourceType === resourceType) return true;
        // BUY/SELL of different resources may run side by side in one room (a
        // standing sell must not block a flip's buy); only the same resource,
        // handled above, competes for the same stock. Transfers still queue per
        // source terminal.
        return sameFrom && op.kind === kind && kind !== "buy" && kind !== "sell";
    });
}
function create(kind, from, to, resourceType, value, options) {
    const mem = memory();
    const id = "terminal-" + mem.nextId++;
    mem.operations[id] = Object.assign({ id, kind, sourceRoom: from || null, targetRoom: to || null, resourceType, amount: value, remaining: value, state: "queued", createdTick: Game.time, updatedTick: Game.time, loadedAmount: 0, sentAmount: 0, receivedAmount: 0, transactionCost: 0 }, options || {});
    mem.operations[id].accounting = { credits: 0, energy: 0, amount: 0, confidence: "confirmed" };
    claims.owner(mem.operations[id]);
    if (kind === "sell") mem.operations[id].lots = [{ id: options && options.lotId || id, amount: value, remaining: value, limit: options && options.limit }];
    return id;
}
function reservedFrom(roomName, resourceType) {
    return activeIds().map(operation).reduce((sum, op) => {
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
    if (lockConflict("transfer", from, to, resourceType, !!(options && options.automatic))) return result(false, "já existe uma operação concorrente para este terminal/recurso");
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
function trade(kind, roomName, resourceType, value, limit, createListing, skipFeeCap, options) {
    const marketOnly = marketOnlyResource(resourceType);
    const target = marketOnly ? room(roomName) : owned(roomName);
    if (marketOnly && (!target || !target.controller || !target.controller.my)) return result(false, "sala precisa ser própria para uma operação de mercado");
    if (!target) return result(false, "sala precisa ser própria com storage e terminal");
    if (!validResource(resourceType) || !amount(value) || !(typeof limit === "number" && limit > 0)) return result(false, "recurso, quantidade ou limite inválido");
    options = Object.assign({}, options);
    if (!options.owner) options.owner = options.policy === "swing" ? { kind: "swing", id: roomName + ":" + resourceType } : { kind: "manual", id: "terminal-" + memory().nextId };
    if (lockConflict(kind, roomName, null, resourceType, false, options)) return conflictResult(kind, roomName, resourceType, options);
    const prices = priceData(resourceType, !marketOnly);
    if (!prices) return result(false, "aguardando cotação temporal e fairPrice de energia");
    // ROADMAP 0111: a SELL may also use material already sitting in the terminal
    // (e.g. a craft chain delivered its product straight there) - stageSaleCargo
    // already credits it as usable cargo. Energy is excluded: the terminal's
    // energy backs transfer fees and balancing, never a sale.
    const ownReserved = kind === "sell" && !marketOnly ? activeForRoom(roomName).filter((op) => claims.outgoing(op, target, resourceType) && claims.owner(op) === claims.key(options.owner)).reduce((n, op) => n + op.remaining, 0) : 0;
    const available = kind !== "sell" || marketOnly ? value : Math.max(0, saleAvailable(target, resourceType, options.owner, resourceType !== RESOURCE_ENERGY) - ownReserved);
    if (!marketOnly && kind === "sell" && available < value) return result(false, "material insuficiente: disponível " + available + ", necessário " + value);
    // A BUY consumes an ORDER_SELL; a SELL consumes an ORDER_BUY.
    const reference = kind === "buy" ? prices.data.sellPrice : prices.data.buyPrice;
    if (!(typeof reference === "number" && reference > 0)) return result(false, "aguardando " + kind + "Price temporal");
    return result(true, create(kind, roomName, null, resourceType, value, Object.assign({}, options || {}, { limit, referencePrice: reference, energyFairPrice: prices.energy, marketOnly, createListing: !!createListing, skipFeeCap: !!skipFeeCap })));
}
function conflictResult(kind, roomName, resourceType, options) {
    const response = result(false, "já existe uma operação concorrente para este terminal/recurso");
    response.code = "owner-conflict";
    response.owner = options.owner;
    response.blockers = activeForRoom(roomName).filter((op) => op.resourceType === resourceType && op.kind === kind).map((op) => ({ id: op.id, owner: claims.owner(op), state: op.state, remaining: op.remaining }));
    return response;
}
function saleAvailable(source, resource, owner, includeTerminal = true) {
    const physical = claims.physicalFree(source, source.storage, resource, null, owner) +
        (includeTerminal ? claims.physicalFree(source, source.terminal, resource, null, owner) : 0);
    if (physical <= 0) return 0;
    const committed = stockPolicy.commitments(source, claims.key(owner))[resource] || 0;
    const uncommitted = Math.max(0, storeValue(source.storage.store, resource) + (includeTerminal ? storeValue(source.terminal.store, resource) : 0) - committed -
        claims.withdrawn(source.storage, resource) - (includeTerminal ? claims.withdrawn(source.terminal, resource) : 0));
    return Math.min(physical, uncommitted);
}
// Cumulative target includes this lot's confirmed sales. Compatible active sales grow in place.
function sellLot(roomName, resourceType, cumulative, limit, createListing, skipFeeCap, options) {
    options = Object.assign({}, options);
    if (!options.owner || !options.lotId || !amount(cumulative)) return result(false, "owner, lotId e quantidade acumulada são obrigatórios");
    const mem = memory();
    if (!mem.lotTargets) mem.lotTargets = {};
    const key = claims.key(options.owner) + ":" + resourceType + ":" + options.lotId;
    const sales = activeForRoom(roomName).filter((op) => op.kind === "sell" && op.resourceType === resourceType && claims.owner(op) === claims.key(options.owner));
    if (!mem.lotTargets[key]) {
        let sold = 0;
        Object.values(Memory.craft && Memory.craft.active || {}).forEach((c) => { if (claims.key(options.owner) === "craft:" + (c.ownerId || c.id) && options.lotId === c.id + ":" + resourceType) sold = Math.max(sold, c.sold || 0); });
        let remaining = 0;
        sales.forEach((op) => {
            if (!op.lots || !op.lotManaged) {
                op.lots = [{ id: options.lotId, amount: op.amount, remaining: op.remaining, limit: op.limit, dealtAmount: op.dealtAmount || 0, targetKey: key }];
                op.lotManaged = true;
            }
            let dealt = 0;
            (op.lots || []).filter((lot) => lot.id === options.lotId).forEach((lot) => { remaining += lot.remaining; dealt += lot.dealtAmount || 0; });
            sold = Math.max(sold, dealt);
        });
        mem.lotTargets[key] = { accepted: sold + remaining, updatedTick: Game.time };
    }
    const target = mem.lotTargets[key];
    const delta = Math.max(0, cumulative - target.accepted);
    const prior = sales.find((op) => op.limit === limit && op.createListing === !!createListing && op.skipFeeCap === !!skipFeeCap);
    if (!delta) {
        const existing = prior || sales.find((op) => (op.lots || []).some((lot) => lot.id === options.lotId));
        return existing ? result(true, existing.id) : result(false, "nenhum saldo novo do lote");
    }
    const compatible = !!prior;
    if (compatible) {
        const source = owned(roomName);
        if (!source || saleAvailable(source, resourceType, options.owner) < sales.reduce((sum, op) => sum + op.remaining, 0) + delta) return result(false, "saldo físico do proprietário insuficiente");
        prior.amount += delta; prior.remaining += delta;
        let lot = prior.lots && prior.lots.find((entry) => entry.id === options.lotId);
        if (!prior.lots) prior.lots = [{ id: prior.id, amount: prior.amount - delta, remaining: prior.remaining - delta, limit }];
        if (!lot) { lot = { id: options.lotId, amount: 0, remaining: 0, limit }; prior.lots.push(lot); }
        lot.amount += delta; lot.remaining += delta;
        lot.targetKey = key;
        target.accepted = cumulative; target.updatedTick = Game.time;
        if (prior.state === "waiting") touch(prior, "queued");
        return result(true, prior.id);
    }
    options.lotManaged = true;
    const response = trade("sell", roomName, resourceType, delta, limit, createListing, skipFeeCap, options);
    if (response.ok) { target.accepted = cumulative; target.updatedTick = Game.time; operation(response.id).lots[0].targetKey = key; }
    return response;
}
// createListing (default false, pedido do usuário, 2026-09-29): sem ordem
// pública para o que não fechar negócio instantâneo - a operação negocia o
// que existir no livro (parcial incluso, tick a tick) e, esgotadas as
// ordens elegíveis, só espera/retenta em vez de listar o restante. true
// preserva o comportamento original (0098).
// skipFeeCap (default false, pedido do usuário, 2026-09-30): por padrão
// candidateOrders() rejeita qualquer ordem cuja taxa de entrega exceda
// terminalOps.maxFeeRatio (5%) do preço bruto - flips (marketFlip.js)
// passam true porque já avaliam essa mesma taxa como parte do próprio
// lucro líquido, com seu próprio limiar (marketFlip.minProfitRatio).
function buy(roomName, resourceType, value, maxUnitPrice, createListing, skipFeeCap, options) { return announce("terminalBuy", trade("buy", roomName, resourceType, value, maxUnitPrice, createListing, skipFeeCap, options)); }
function sell(roomName, resourceType, value, minUnitPrice, createListing, skipFeeCap, options) {
    return announce("terminalSell", options && options.owner && options.lotId ? sellLot(roomName, resourceType, value, minUnitPrice, createListing, skipFeeCap, options) :
        trade("sell", roomName, resourceType, value, minUnitPrice, createListing, skipFeeCap, options));
}
function activeForRoom(roomName) { return activeIds().map(operation).filter((op) => active(op) && (op.sourceRoom === roomName || op.targetRoom === roomName)); }
// `room` stays sourceRoom||targetRoom (single field) for the existing
// per-room stats() below; `from`/`to`/`resourceType` are additive, kept
// separate so a transfer's two rooms don't collapse into one another and a
// market deal keeps which resource actually traded (ROADMAP 0079 follow-up:
// the dashboard's "Mercado"/"Terminal Network" panels need both).
function record(op, value, credits, energy, fees = 0) { require("./craftLedger").record(op, value, credits, energy); memory().events.push({ tick: Game.time, operationId: op.id, owner: claims.owner(op), room: op.sourceRoom || op.targetRoom, from: op.sourceRoom || null, to: op.targetRoom || null, kind: op.kind, resourceType: op.resourceType, amount: value || 0, credits: credits || 0, transactionEnergy: energy || 0, marketFees: fees }); }

function findHauler(roomName) { return census.creepsByRole(roomName, "hauler").find((creep) => !creep.memory.terminalJob && creep.store.getUsedCapacity() === 0); }
function assign(op, home, direction, from, to, value, resourceType) {
    resourceType = resourceType || op.resourceType;
    if (value <= 0) { touch(op, direction === "load" ? "atTerminal" : "completed"); return false; }
    if (direction === "load" && op.policy === "swing") {
        value = Math.min(value, stockPolicy.terminalFree(home, op.id));
        if (value <= 0) { op.error = "buffer operacional do terminal"; touch(op, "waiting"); return false; }
    }
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

function orderAmount(order) { return order && (order.remainingAmount === undefined ? order.amount || 0 : order.remainingAmount) || 0; }
// Diagnostics score the full book; selection rejects known-ineligible
// orders before computing delivery cost. Effective limits still need freight.
function scoredOrders(op, candidatesOnly = false) {
    if (!Game.market || typeof Game.market.getAllOrders !== "function") return [];
    const wanted = op.kind === "buy" ? ORDER_SELL : ORDER_BUY;
    let orders = [];
    try { orders = cpuMeter.span("terminalOps.orderBook", () => Game.market.getAllOrders({ type: wanted, resourceType: op.resourceType }) || []); } catch (error) { return []; }
    // roomName is null for account-wide resources (pixel, accessKey,
    // cpuUnlock): they aren't shipped anywhere, so the API never attaches a
    // room to their orders. Requiring a truthy roomName unconditionally
    // discarded every single order for those resources here, so
    // terminalBuy/terminalSell always reported "nenhuma ordem no mercado"
    // regardless of the real order book (bug real, usuário reportou em
    // produção, 2026-09-24: terminalSell de pixel via marketPrice mostrava
    // volume no book mas caía sempre em listagem própria).
    const currentPrices = (op.effectiveLimit || op.kind === "buy") && priceData(op.resourceType, !op.marketOnly);
    if (currentPrices) op.energyFairPrice = currentPrices.energy;
    const dead = orderRetry.excluded(op);
    const freight = new Map();
    return cpuMeter.span("terminalOps.scoreOrders", () => orders.filter((order) => {
        if (!order || (Game.market.orders || {})[order.id] || !(order.price > 0) ||
            (!op.marketOnly && !order.roomName) || !(orderAmount(order) > 0)) return false;
        if (!candidatesOnly) return true;
        if (!(op.remaining > 0) || (op.kind === "sell" && !op.marketOnly && !(op.loadedAmount > 0)) ||
            dead.indexOf(order.id) >= 0) return false;
        return op.kind === "buy" ? order.price <= op.limit : op.effectiveLimit || order.price >= op.limit;
    }).map((order) => {
        const quantity = Math.min(op.remaining, orderAmount(order), op.kind === "sell" && !op.marketOnly ? (op.loadedAmount || 0) : op.remaining);
        const freightKey = quantity + ":" + order.roomName;
        if (!op.marketOnly && !freight.has(freightKey)) freight.set(freightKey, txCost(quantity, op.sourceRoom, order.roomName));
        const cost = op.marketOnly ? 0 : freight.get(freightKey);
        const fee = quantity ? cost * (op.energyFairPrice || 0) / quantity : Infinity;
        if (op.kind === "buy") return Object.assign({ order }, purchaseCost.evaluate(Object.assign({}, op, {
            cancelledListingFees: (op.cancelledListingFees || 0) + (op.marketOrderId ? op.orderFeesRemaining || 0 : 0),
        }), order.price, quantity, cost, op.energyFairPrice || 0));
        const effective = op.effectiveLimit ? require("./swingTrade").effective(op.kind, op.resourceType, order.price, quantity, cost, op.energyFairPrice || 0) : order.price - fee;
        return { order, quantity, cost, fee, effective };
    }));
}
// op.limit gates on the order's own raw price - the number the user reads
// straight off the market (marketPrice()/order book) when they pick a
// limit - not the delivery-cost-adjusted "effective" price. Reversed
// 2026-09-24 (real report): a SELL with limit 43 found a buy order at 43.925
// but skipped it because delivery cost to a distant room netted the
// "effective" price down to 32.113 - correct per the original 0098 design
// ("limite sempre é líquido"), but not what the user expects: they set the
// limit by watching the raw market price, so 43.925 should have qualified.
// `effective` still breaks ties/ranks among orders that clear the raw bar,
// so a cheaper-to-deliver order is still preferred over a pricier-to-reach
// one at the same raw price.
// maxFeeRatio (pedido do usuário, 2026-09-30, bug real: uma SELL com preço
// bruto 38.717 mas custo de entrega convertido de 2113 energia acabava com
// efetivo 7.505 - a taxa comeu ~81% do valor, e nada impedia o deal() de
// fechar assim mesmo, já que op.limit só olha o preço bruto). Flips
// (op.skipFeeCap) ficam de fora: já calculam essa mesma taxa como parte do
// próprio lucro líquido (marketFlip.minProfitRatio), então aplicar o teto
// aqui de novo seria redundante e mais restritivo que o desenho do flip.
function candidateOrders(op) {
    delete op.fuelQuote;
    orderRetry.excluded(op);
    if (op.policy === "swing" && !op.cancelledListingFees && op.state !== "cancellingListing") {
        const target = owned(op.sourceRoom);
        if (!target) return [];
        const wanted = op.kind === "sell" ? Math.min(op.remaining, op.loadedAmount || 0) : op.remaining;
        const candidate = cpuMeter.span("terminalOps.swingQuote", () => require("./swingTrade").quote(target, op.kind, op.resourceType, wanted, { excludeId: op.id, deadOrderIds: op.deadOrderIds }));
        if (!candidate.order) { op.policyBlock = candidate.reason; return []; }
        op.limit = candidate.limit; op.energyFairPrice = candidate.energyFairPrice;
        delete op.policyBlock;
        op.fuelQuote = { tick: Game.time, cost: candidate.cost };
        return [op.kind === "buy" ? Object.assign({}, candidate, purchaseCost.evaluate(op, candidate.order.price, candidate.quantity, candidate.cost, candidate.energyFairPrice)) : candidate];
    }
    // deadOrderIds excludes orders that already burned a deal() call this
    // operation without any observable effect (see the verification in
    // executeDeal()) - without this, a permanently-broken order would keep
    // winning the sort every tick and the operation would never move on to
    // an order that actually works.
    const dead = orderRetry.excluded(op);
    const maxFeeRatio = config.get("terminalOps.maxFeeRatio", 0.05);
    const candidates = scoredOrders(op, true).filter((item) => item.quantity > 0 && dead.indexOf(item.order.id) < 0 &&
        (op.kind === "buy" ? item.ok : (op.effectiveLimit ? item.effective : item.order.price) >= op.limit) &&
        (op.kind === "buy" || op.skipFeeCap || item.fee <= item.order.price * maxFeeRatio)
    ).sort((a, b) => op.kind === "buy" ? a.effective - b.effective : b.effective - a.effective);
    if (candidates[0]) op.fuelQuote = { tick: Game.time, cost: candidates[0].cost };
    return candidates;
}
// Two separate things (bug real, usuario reportou em producao, 2026-10-02):
//  - the console LINE is throttled: uma SELL passa por atTerminal a cada volta
//    (waiting -> stageSaleCargo -> atTerminal -> executeDeal), entao o "so loga
//    na entrada em waiting" de executeDeal nao a protege e a mesma linha saia
//    a cada ~8 ticks, por operacao. Agora so a primeira vez por operacao; um
//    valor > 0 em terminalOps.noCandidateLogTicks repete a cada tantos ticks.
//  - the REASON is kept on the operation itself (op.noCandidate), refreshed at
//    most every terminalOps.noCandidateRecordTicks, so it can be read any time
//    with terminalOperation(id) without depending on the log.
function reportNoCandidate(op) {
    const every = config.get("terminalOps.noCandidateLogTicks", 0);
    const recordEvery = config.get("terminalOps.noCandidateRecordTicks", 60);
    const logDue = typeof op.noCandidateLogTick !== "number" || (every > 0 && Game.time - op.noCandidateLogTick >= every);
    const recordDue = !op.noCandidate || Game.time - op.noCandidate.tick >= recordEvery;
    if (!logDue && !recordDue) return;
    const outcome = op.createListing ? "indo para listagem própria" : "aguardando nova ordem elegível (createListing:false, sem listar o restante)";
    const evaluated = scoredOrders(op).filter((item) => item.quantity > 0);
    const dead = orderRetry.excluded(op);
    const scored = evaluated.filter((item) => !dead.includes(item.order.id));
    const head = "[terminalOps] " + op.id + " (" + op.kind + " " + op.resourceType + " em " + op.sourceRoom + "): ";
    if (!scored.length) {
        const reason = evaluated.length ? "orders-without-confirmed-trade" : "nenhuma ordem no mercado";
        const changed = !op.noCandidate || op.noCandidate.reason !== reason;
        op.noCandidate = { ok: false, tick: Game.time, limit: op.limit, reason, best: null,
            excludedOrders: evaluated.map((item) => item.order.id), nextOrderRetryTick: op.nextOrderRetryTick, owner: claims.owner(op) };
        if (logDue || changed) { op.noCandidateLogTick = Game.time; console.log(head + reason + ", " + outcome + " (limite " + op.limit + ")"); }
        return;
    }
    const best = scored.sort((a, b) => op.kind === "buy" ? a.effective - b.effective : b.effective - a.effective)[0];
    if (op.kind === "buy") {
        const reason = best.reason || "aguardando recursos/créditos/capacidade para executar";
        const changed = !op.noCandidate || op.noCandidate.reason !== reason;
        op.noCandidate = Object.assign({}, best, { order: undefined, tick: Game.time, reason,
            best: { id: best.order.id, room: best.order.roomName, price: best.order.price }, owner: claims.owner(op) });
        if (logDue || changed) { op.noCandidateLogTick = Game.time; console.log(head + reason + "; bruto " + best.quantity + ", líquido " + best.netAmount + ", frete " + best.cost + ", efetivo " + best.effective + ", máximo " + op.limit); }
        return;
    }
    const maxFeeRatio = config.get("terminalOps.maxFeeRatio", 0.05);
    const priceOk = op.kind === "buy" ? best.order.price <= op.limit : best.order.price >= op.limit;
    const feeOk = op.skipFeeCap || best.fee <= best.order.price * maxFeeRatio;
    // Distingue as duas razões de rejeição (2026-09-30, pedido do usuário):
    // antes esta mensagem sempre dizia "nenhuma ordem cobre o limite", mesmo
    // quando a ordem cobria o limite bruto perfeitamente bem e só foi
    // rejeitada por causa da taxa de entrega - confuso pra diagnosticar.
    const reason = !priceOk && !feeOk ? "nenhuma ordem cobre o limite " + op.limit + " (preço bruto) e a taxa de entrega excede " + (maxFeeRatio * 100) + "% do valor"
        : !priceOk ? "nenhuma ordem cobre o limite " + op.limit + " (preço bruto)"
        : "a melhor ordem cobre o limite " + op.limit + " mas a taxa de entrega excede " + (maxFeeRatio * 100) + "% do valor";
    op.noCandidate = {
        tick: Game.time, limit: op.limit, reason,
        best: { room: best.order.roomName || "conta", price: best.order.price, deliveryEnergy: best.cost, effective: +best.effective.toFixed(3) },
    };
    if (logDue) {
        op.noCandidateLogTick = Game.time;
        console.log(head + reason + "; melhor encontrada em " + (best.order.roomName || "conta") + " preço " + best.order.price +
            ", custo de entrega " + best.cost + " energia (fair price " + (op.energyFairPrice || 0) + "), efetivo " + best.effective.toFixed(3) +
            " — " + outcome);
    }
}
// The terminal holds less than the sale was counting on: bring loadedAmount down to what is
// really there and send the operation back to staging so the difference is carried again.
// Nothing is dealt this round, and the line is logged once per change of the shortfall.
function shortCargo(op, held, wanted, afterDeal) {
    const before = op.loadedAmount || 0;
    op.loadedAmount = Math.min(before, held);
    op.shortCargoCount = (op.shortCargoCount || 0) + 1;
    op.error = "estoque real no terminal (" + held + ") abaixo do contabilizado/oferecido (" + Math.max(before, wanted) + ") - recarregando a diferenca";
    if (op.lastShortHeld !== held) {
        op.lastShortHeld = held;
        console.log("[terminalOps] " + op.id + " (sell " + op.resourceType + " em " + op.sourceRoom + "): " + op.error + (afterDeal ? " (deal devolveu -6)" : ""));
    }
    touch(op, "queued");
}

function retryDeal(op, target) {
    // A waiting operation re-scanned the order book (getAllOrders) every tick;
    // retry at most every dealRetryTicks until it leaves "waiting".
    if (op.state === "waiting") {
        if (op.nextDealTick > Game.time) return;
        op.nextDealTick = Game.time + config.get("terminalOps.dealRetryTicks", 5);
    }
    executeDeal(op, target);
}
function executeDeal(op, target, selected) {
    if (!op.marketOnly && terminalBusy(op.sourceRoom)) { op.error = "terminal já usado neste tick"; touch(op, "waiting"); return; }
    let choices = selected ? [selected] : candidateOrders(op);
    if (op.kind === "sell" && op.marketOrderId) {
        const order = Game.market.orders && Game.market.orders[op.marketOrderId];
        const exposed = orderAmount(order);
        const unlisted = Math.max(0, op.remaining - exposed);
        const physical = op.marketOnly ? unlisted : Math.max(0, claims.physicalFree(target, target.terminal, op.resourceType, op.id) - exposed);
        if (!unlisted || !physical) { touch(op, "listed"); return; }
        choices = choices.map((item) => {
            const quantity = Math.min(item.quantity, unlisted, physical);
            const cost = op.marketOnly ? 0 : txCost(quantity, op.sourceRoom, item.order.roomName);
            const fee = cost * (op.energyFairPrice || 0) / Math.max(1, quantity);
            return Object.assign({}, item, { quantity, cost, fee, effective: item.order.price - fee });
        }).filter((item) => item.quantity > 0 && (op.effectiveLimit ? item.effective : item.order.price) >= op.limit &&
            (op.skipFeeCap || item.fee <= item.order.price * config.get("terminalOps.maxFeeRatio", 0.05)));
    }
    const candidate = op.kind === "buy" ? choices.find((item) => canExecutePurchase(op, target, item)) || choices[0] : choices[0];
    if (candidate && op.kind === "buy" && op.marketOrderId) { cancelListingForDeal(op); return; }
    // createListing:false: negocia o que existir (parcial incluso, tick a
    // tick, via candidateOrders() normalmente); esgotado o livro elegível,
    // só espera/retenta - nunca cria ordem pública pro que faltar. Loga só
    // na entrada em "waiting" (op.state ainda não é "waiting"), não em cada
    // retry - do contrário a mesma linha repetiria todo tick até o próximo
    // candidato aparecer ou o chamador desistir (bug real reportado pelo
    // usuário, 2026-09-30: log idêntico repetindo a cada tick).
    // 2026-10-02: reportNoCandidate() agora se limita sozinho (a linha sai uma vez
    // por operação; o motivo guardado em op.noCandidate é renovado a cada
    // terminalOps.noCandidateRecordTicks), então pode ser chamado também em
    // "waiting" - antes, uma compra parada ali ficava com o motivo da entrada
    // (ou sem nenhum) para sempre.
    if (!candidate) {
        reportNoCandidate(op);
        if (op.noCandidate) op.error = op.noCandidate.reason;
        if (op.policy === "swing" && op.kind === "buy") { cancel(op.id); return; }
        touch(op, op.createListing ? "listing" : "waiting"); return;
    }
    delete op.noCandidate;
    if (!op.marketOnly && target.terminal.cooldown) { op.error = "terminal em cooldown"; touch(op, "waiting"); return; }
    const fuel = require("./terminalFuel");
    if (candidate && op.policy === "swing" && op.kind === "sell" && !fuel.optionalAllowed(target, candidate.cost)) {
        op.policyBlock = "scarce-energy";
        return;
    }
    const fuelNeeded = candidate && candidate.cost + (!fuel.enabled() && op.policy === "swing" && !(op.kind === "buy" && op.resourceType === RESOURCE_ENERGY) ? stockPolicy.terminalReserve(target) : 0);
    const freeFuel = op.marketOnly ? Infinity : Math.max(0, storeValue(target.terminal.store, RESOURCE_ENERGY) -
        managedTerminalIncrease(target.name, RESOURCE_ENERGY, activeForRoom(target.name).filter((other) => other.id !== op.id)));
    if (!op.marketOnly && freeFuel < fuelNeeded) {
        const missingEnergy = fuelNeeded - freeFuel;
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
    if (op.kind === "buy" && marketAccounting.automatic(op) && candidate.order.price * candidate.quantity > marketAccounting.available(op.id)) {
        op.error = "piso global de créditos/compromissos"; touch(op, "waiting"); return;
    }
    if (op.kind === "buy" && !op.marketOnly && candidate.quantity > freeCapacity(target.terminal.store, op.resourceType)) {
        op.error = "capacidade de recebimento insuficiente"; touch(op, "waiting"); return;
    }
    if (op.kind === "sell" && !op.marketOnly) {
        const held = claims.physicalFree(target, target.terminal, op.resourceType, op.id);
        if (held < candidate.quantity) { shortCargo(op, held, candidate.quantity); return; }
    }
    // Diagnostic (2026-09-24, usuário reportou em produção): status OK de
    // deal() nem sempre correspondeu a uma troca real observável (créditos
    // parados em 0, O "vendido" reaparecendo em um receipt logo depois).
    // Persistir o pedido exato ajuda a cruzar com Game.market.getOrderById()
    // depois do fato, já que candidate.order não sobrevive além deste tick.
    op.lastDealOrderId = candidate.order.id;
    op.lastDealOrderRoom = candidate.order.roomName;
    op.lastDealOrderPrice = candidate.order.price;
    op.lastDealQuantity = candidate.quantity;
    op.lastDealTick = Game.time;
    const creditsBefore = Game.market.credits;
    const status = Game.market.deal(candidate.order.id, candidate.quantity, op.sourceRoom);
    if (status === OK && !op.marketOnly) claimTerminal(op.sourceRoom);
    if (status === OK && op.kind === "buy") marketAccounting.debit(candidate.order.price * candidate.quantity, creditsBefore);
    op.lastDealStatus = status;
    // A failing deal is retried every dealRetryTicks and used to print the same line each time
    // (bug real, usuario reportou em producao, 2026-10-03). A new status prints at once; a
    // repeat of the same one only every terminalOps.dealErrorLogTicks.
    const repeat = status !== OK && op.lastDealLogStatus === status && Game.time - (op.lastDealLogTick || 0) < config.get("terminalOps.dealErrorLogTicks", 500);
    if (!repeat) {
        op.lastDealLogStatus = status; op.lastDealLogTick = Game.time;
        console.log("[terminalOps] " + op.id + " deal(" + candidate.order.id + ", " + candidate.quantity + ", " + op.sourceRoom + ") -> " + status +
            " (ordem em " + (candidate.order.roomName || "conta") + ", preço " + candidate.order.price + ", créditos antes " + (Game.market ? Game.market.credits : "?") + ")" +
            (status === ERR_NOT_ENOUGH_RESOURCES ? " - ERR_NOT_ENOUGH_RESOURCES: terminal com " + storeValue(target.terminal.store, op.resourceType) + " " + op.resourceType + " e " + storeValue(target.terminal.store, RESOURCE_ENERGY) + " de energia" : ""));
    }
    if (status !== OK) {
        op.dealFailures = (op.dealFailures || 0) + 1;
        // -6: the engine says the terminal lacks the goods or the fee energy. The resource
        // check above already passed on bookkeeping, so trust the real store from now on.
        if (status === ERR_NOT_ENOUGH_RESOURCES && op.kind === "sell" && !op.marketOnly) {
            shortCargo(op, storeValue(target.terminal.store, op.resourceType), candidate.quantity, true);
            return;
        }
        op.error = "deal retornou " + status; touch(op, "waiting"); return;
    }
    // deal() only REGISTERS an intent - the engine executes it after the
    // script finishes, so nothing about the trade is observable in the tick
    // that called it: not Game.market.credits, not the order's
    // remainingAmount, not this terminal's own store. Settling here (the old
    // behaviour) was the root cause of the "nenhuma ordem foi efetivada" bug
    // (2026-09-24, usuário reportou em produção): zeroing loadedAmount /
    // feeLoadedAmount and marking the operation "completed" dropped the
    // operation's claim over stock that was still physically sitting in the
    // terminal, and scanTerminalBalances() - which runs at the end of this
    // very same tick() - then saw that cargo and fee energy as unclaimed
    // surplus, minted receipts for both and dispatched haulers to withdraw
    // them straight back to storage. Those withdraw intents are processed in
    // the same end-of-tick batch as the deal, emptying the terminal out from
    // under the pending trade: deal() had returned OK but nothing happened -
    // no transaction in the history, credits frozen, the order's
    // remainingAmount untouched - and the hauler kept shuttling the same
    // stock in and out of the terminal forever. So: park the operation in
    // "settling", keep every claim intact, and let settleDeal() do the
    // bookkeeping on the next tick against evidence that actually exists.
    op.pendingDeal = {
        orderId: candidate.order.id, quantity: candidate.quantity, cost: candidate.cost,
        price: candidate.order.price, tick: Game.time,
        orderRemaining: orderAmount(candidate.order),
        orderRoom: candidate.order.roomName,
        energyBefore: op.marketOnly ? 0 : storeValue(target.terminal.store, RESOURCE_ENERGY),
        terminalBefore: op.marketOnly ? 0 : storeValue(target.terminal.store, op.resourceType),
        sunkFees: op.kind === "buy" ? op.cancelledListingFees || 0 : 0,
    };
    delete op.error;
    touch(op, "settling");
}
// Did the trade the engine was asked for last tick actually happen? The
// terminal's own store is the strongest evidence available: it is local,
// exact, and - unlike the order book or Game.market.credits - cannot be moved
// by other players trading against the same order in between. It stays clean
// while the operation sits in "settling" because the claim over the staged
// cargo was never released, so no receipt and no further load can touch it.
function dealTraded(op, source, pending) {
    const transactions = Game.market && Game.market[op.kind === "buy" ? "incomingTransactions" : "outgoingTransactions"];
    const tx = Array.isArray(transactions) && transactions.find((tx) => tx && tx.order && tx.order.id === pending.orderId &&
        tx.time === pending.tick && tx.amount > 0 && (!tx.resourceType || tx.resourceType === op.resourceType) &&
        (op.marketOnly || tx[op.kind === "buy" ? "to" : "from"] === op.sourceRoom));
    if (tx) { pending.evidence = "transaction"; return Math.min(pending.quantity, tx.amount); }
    if (!op.marketOnly && source && source.terminal) {
        const now = storeValue(source.terminal.store, op.resourceType);
        const moved = op.kind === "buy" ? now - pending.terminalBefore : pending.terminalBefore - now;
        const expected = op.kind === "buy" && op.resourceType === RESOURCE_ENERGY ? pending.quantity - pending.cost : pending.quantity;
        if (moved >= expected) { pending.evidence = "terminal-balance"; return pending.quantity; }
        return 0;
    }
    // marketOnly (pixel / CPU unlock): no terminal is involved at all, so the
    // order book is the only signal. A real trade can only ever lower
    // remainingAmount, and a fully consumed order disappears outright.
    const verify = typeof Game.market.getOrderById === "function" ? Game.market.getOrderById(pending.orderId) : null;
    if (!verify || orderAmount(verify) < pending.orderRemaining) { pending.evidence = "order-book"; return pending.quantity; }
    return 0;
}
function settleDeal(op, source) {
    require("./craftLedger").economic(op);
    const pending = op.pendingDeal;
    if (!pending) { touch(op, "waiting"); return; }
    if (Game.time <= pending.tick) return; // the engine has not run the intent yet
    const traded = dealTraded(op, source, pending);
    const cost = traded === pending.quantity ? pending.cost : traded > 0 && !op.marketOnly ?
        pending.orderRoom ? txCost(traded, op.sourceRoom, pending.orderRoom) : Math.ceil(pending.cost * traded / pending.quantity) : 0;
    op.lastDealObservation = { tick: Game.time, orderId: pending.orderId, requested: pending.quantity, traded,
        evidence: pending.evidence || "none", orderRemainingBefore: pending.orderRemaining,
        freight: cost, netAmount: traded - (op.kind === "buy" && op.resourceType === RESOURCE_ENERGY ? cost : 0),
        energyBefore: pending.energyBefore, energyAfter: source && source.terminal ? storeValue(source.terminal.store, RESOURCE_ENERGY) : null,
        resourceBefore: pending.terminalBefore, resourceAfter: source && source.terminal ? storeValue(source.terminal.store, op.resourceType) : null };
    delete op.pendingDeal;
    if (traded) delete op.noCandidate;
    if (!traded) {
        // Keep alternatives eligible while this order backs off temporarily.
        // No observed trade means no quantity, credit or energy entry.
        op.error = "deal retornou OK mas nenhuma troca foi observada";
        orderRetry.failed(op, pending.orderId);
        delete op.noCandidate;
        touch(op, op.kind === "sell" && !op.marketOnly ? "atTerminal" : "waiting");
        if (op.cancelRequested) cancel(op.id);
        return;
    }
    op.remaining = Math.max(0, op.remaining - traded); op.dealtAmount = (op.dealtAmount || 0) + traded; op.transactionCost += cost;
    op.lastSuccessfulDealTick = Game.time;
    orderRetry.succeeded(op, pending.orderId);
    if (op.kind === "buy") {
        op.netBought = (op.netBought || 0) + (op.resourceType === RESOURCE_ENERGY ? traded - cost : traded);
        op.buyCredits = (op.buyCredits || 0) + pending.price * traded;
        op.cancelledListingFees = Math.max(0, (op.cancelledListingFees || 0) - (pending.sunkFees || 0) * traded / pending.quantity);
    } else settleLots(op, traded, pending.price, cost * (op.energyFairPrice || 0));
    op.feeLoadedAmount = Math.max(0, (op.feeLoadedAmount || 0) - cost);
    if (op.kind === "sell") op.loadedAmount = Math.max(0, (op.loadedAmount || 0) - traded);
    record(op, traded, pending.price * traded * (op.kind === "buy" ? -1 : 1), cost, (pending.sunkFees || 0) * traded / pending.quantity);
    if (op.kind === "buy" && config.get("stockPolicy.enabled", true) && !stockPolicy.used(source, op.resourceType))
        op.receivedAmount = Math.max(op.receivedAmount || 0, op.dealtAmount);
    touch(op, op.remaining ? (op.marketOrderId ? "listed" : "queued") : (op.kind === "buy" && !op.marketOnly ? "awaitingReceipt" : "completed"));
    if (op.kind === "buy" && !op.remaining && (op.receivedAmount || 0) >= (op.dealtAmount || 0)) touch(op, "completed");
    if (op.kind === "sell" && op.policy === "swing") require("./swingTrade").sold(op.sourceRoom, op.resourceType, traded);
    if (op.cancelRequested && active(op)) cancel(op.id);
}
function competitivePrice(op) {
    const step = config.get("terminalOps.marketPriceStep", 0.001);
    let orders = [];
    try { orders = Game.market.getAllOrders({ type: op.kind === "buy" ? ORDER_BUY : ORDER_SELL, resourceType: op.resourceType }) || []; } catch (error) { orders = []; }
    // Same marketOnly exception as scoredOrders() above: pixel/accessKey/
    // cpuUnlock orders never carry a roomName.
    const prices = orders.filter((order) => order && order.price > 0 && (op.marketOnly || order.roomName)).map((order) => {
        const cost = op.marketOnly ? 0 : txCost(Math.max(1, op.remaining), op.sourceRoom, order.roomName);
        const delivery = cost * (op.energyFairPrice || 0) / Math.max(1, op.remaining);
        return op.kind === "buy" ? order.price - delivery : order.price + delivery;
    });
    if (!prices.length) return op.referencePrice;
    return op.kind === "buy" ? Math.max.apply(null, prices) + step : Math.min.apply(null, prices) - step;
}
// How much of a SELL's cargo may sit in the terminal at once. The remainder of
// the terminal is deliberate headroom: the deal's fee energy, plus room for
// incoming transfers and BUY deliveries. See config.terminalOps.
function saleBuffer(op, source) {
    return Math.min(
        config.get("terminalOps.saleBufferAmount", 300000),
        Math.floor((source.terminal.store.getCapacity(op.resourceType) || 0) * config.get("terminalOps.saleBufferCapacityRatio", 0.85))
    );
}
// Tops the terminal up to saleBuffer() for a SELL. Returns whatever assign()
// returns: true only when a hauler actually took the job.
function fundedListing(op, source) {
    const order = op.marketOrderId && Game.market && Game.market.orders && Game.market.orders[op.marketOrderId];
    return op.fixedListing && order && op.loadedAmount >= op.remaining &&
        claims.physicalFree(source, source.terminal, op.resourceType, op.id) >= op.remaining;
}
function stageSaleCargo(op, source) {
    if (op.policy === "swing" && !fundedListing(op, source) && stockPolicy.available(source, op.resourceType, op.id) < op.remaining) {
        op.error = "estoque passou a ser comprometido"; cancel(op.id); return false;
    }
    const buffer = saleBuffer(op, source);
    const already = claims.physicalFree(source, source.terminal, op.resourceType, op.id);
    // Only cargo not allocated to another operation may be credited here.
    const usable = Math.min(already, op.remaining);
    if (usable > op.loadedAmount) op.loadedAmount = usable;
    // ...and the other way round (bug real, usuario reportou em producao, 2026-10-03: deal()
    // devolvendo -6 a cada ~7 ticks, para sempre): loadedAmount e contabilidade, o terminal e
    // o fato. Se algo tirou o estoque de la (varredura, outra operacao, entrega parcial), manter
    // o numero antigo fazia o candidateOrders() oferecer mais do que existe e o deal() falhar
    // eternamente; agora o numero desce ao estoque real e a diferenca volta a ser carregada.
    if (op.loadedAmount > already) op.loadedAmount = already;
    return assign(op, source, "load", source.storage, source.terminal, Math.min(op.remaining - op.loadedAmount,
        claims.physicalFree(source, source.storage, op.resourceType, op.id), Math.max(0, buffer - storeValue(source.terminal.store, op.resourceType))));
}
function settleLots(op, quantity, price, fees) {
    let left = quantity;
    (op.lots || []).forEach((lot) => {
        const taken = Math.min(left, lot.remaining || 0);
        lot.remaining -= taken; lot.dealtAmount = (lot.dealtAmount || 0) + taken;
        lot.credits = (lot.credits || 0) + taken * price;
        lot.fees = (lot.fees || 0) + (quantity ? fees * taken / quantity : 0);
        left -= taken;
    });
}
function chargeMarketFee(op, fee, before) {
    marketAccounting.debit(fee, before);
    op.marketFees = (op.marketFees || 0) + fee;
    op.orderFeesRemaining = (op.orderFeesRemaining || 0) + fee;
    if (op.policy === "swing") op.listingFee = (op.listingFee || 0) + fee;
}
function hydrateMarketFees(op) {
    if (op.marketFees !== undefined) return;
    const recorded = typeof op.listingFee === "number";
    const known = recorded ? op.listingFee : op.listedPrice > 0 && op.listedAmount > 0 ? op.listedPrice * op.listedAmount * 0.05 : 0;
    op.marketFees = Math.max(0, known);
    const order = op.marketOrderId && Game.market && Game.market.orders && Game.market.orders[op.marketOrderId];
    op.orderFeesRemaining = order ? op.marketFees * Math.min(1, orderAmount(order) / Math.max(1, op.listedAmount || op.amount)) : 0;
    if (known && !recorded) op.feeHistoryEstimated = true;
}
function cancelListingForDeal(op) {
    if (op.pendingListingCancel) {
        if (Game.time <= op.pendingListingCancel.tick || Game.market.orders && Game.market.orders[op.pendingListingCancel.id]) {
            op.error = "aguardando confirmação do cancelamento da listing"; return false;
        }
        op.cancelledListingFees = (op.cancelledListingFees || 0) + (op.orderFeesRemaining || 0);
        op.orderFeesRemaining = 0;
        delete op.marketOrderId; delete op.pendingListingCancel;
        delete op.listedAmount; delete op.listedFilled; delete op.listedTick;
        touch(op, op.kind === "buy" ? "queued" : "atTerminal");
        return true;
    }
    if (!op.marketOrderId) return true;
    if (typeof Game.market.cancelOrder !== "function") { op.error = "cancelOrder indisponível"; return false; }
    const status = Game.market.cancelOrder(op.marketOrderId);
    if (status !== OK) { op.error = "cancelOrder retornou " + status; return false; }
    op.pendingListingCancel = { id: op.marketOrderId, tick: Game.time };
    touch(op, "cancellingListing");
    return false;
}
function canExecutePurchase(op, source, candidate) {
    if (!candidate || !candidate.ok || !source) return false;
    if (!op.marketOnly && (terminalBusy(source.name) || source.terminal.cooldown || freeCapacity(source.terminal.store, op.resourceType) < candidate.quantity)) return false;
    const credits = candidate.order.price * candidate.quantity;
    if (Game.market.credits < credits || marketAccounting.automatic(op) && marketAccounting.available(op.id) < credits) return false;
    const fuel = op.marketOnly ? Infinity : Math.max(0, storeValue(source.terminal.store, RESOURCE_ENERGY) -
        managedTerminalIncrease(source.name, RESOURCE_ENERGY, activeForRoom(source.name).filter((other) => other.id !== op.id)));
    return fuel >= candidate.cost;
}
function buyListingCeiling(op, order) {
    const quantity = order ? orderAmount(order) : op.remaining;
    if (!(quantity > 0)) return 0;
    const fees = (op.cancelledListingFees || 0) + (order ? op.orderFeesRemaining || 0 : 0);
    const allowance = Math.max(0, op.limit - fees / quantity);
    if (!order) return allowance / 1.05;
    // Price decreases keep sunk fees; increases add 5% of the positive price delta.
    return allowance <= order.price ? allowance : (allowance + order.price * 0.05) / 1.05;
}
function listResidual(op, target) {
    if (!Game.market || typeof Game.market.createOrder !== "function") { op.error = "mercado indisponível"; touch(op, "waiting"); return; }
    // Cheap interval check first: competitivePrice() scans the order book, and
    // a live order inside its reprice window needs nothing from it.
    const liveOrder = op.marketOrderId && Game.market.orders && Game.market.orders[op.marketOrderId];
    if (op.createdListing && !liveOrder && op.listedTick !== undefined) {
        // Never create twice while waiting for the engine to expose an order ID.
        if (Game.time - op.listedTick > config.get("terminalOps.orderConfirmationTicks", 10)) {
            op.error = "listing criada não reconciliada; não será recriada automaticamente"; touch(op, "failed"); return;
        }
        touch(op, "listing"); return;
    }
    if (op.policy === "swing") {
        const ref = require("./swingTrade").reference(op.resourceType, op.kind);
        if (!ref.reason) {
            op.limit = ref.price * (1 + (op.kind === "buy" ? -1 : 1) * config.get("swing.margin", 0.01));
            op.referencePrice = ref.price; op.energyFairPrice = ref.energy;
        }
    }
    const extended = liveOrder && Math.max(0, op.remaining - (orderAmount(liveOrder) + (op.pendingExtension && op.pendingExtension.amount || 0)));
    if (op.kind === "sell" && extended > 0 && !op.pendingExtension) {
        const exposed = orderAmount(liveOrder);
        const free = op.marketOnly ? extended : Math.max(0, claims.physicalFree(target, target.terminal, op.resourceType, op.id) - exposed);
        const quote = candidateOrders(op).find((item) => item.quantity > 0);
        if (quote && free > 0) {
            const quantity = Math.min(extended, free, quote.quantity);
            const cost = op.marketOnly ? 0 : txCost(quantity, op.sourceRoom, quote.order.roomName);
            const fee = cost * (op.energyFairPrice || 0) / quantity;
            const effective = quote.order.price - fee;
            if ((op.effectiveLimit ? effective : quote.order.price) >= op.limit && (op.skipFeeCap || fee <= quote.order.price * config.get("terminalOps.maxFeeRatio", 0.05))) {
                executeDeal(op, target, Object.assign({}, quote, { quantity, cost, fee, effective, exposed }));
                return;
            }
        }
    }
    if (op.pendingExtension) {
        const pending = op.pendingExtension;
        if (liveOrder && Game.time > pending.tick && ((liveOrder.totalAmount || 0) >= pending.totalBefore + pending.amount || orderAmount(liveOrder) >= pending.remainingBefore + pending.amount)) {
            op.listedAmount += pending.amount; delete op.pendingExtension;
        } else {
            if (Game.time - pending.tick > config.get("terminalOps.orderConfirmationTicks", 10)) {
                delete op.pendingExtension; op.error = "extensão não confirmada; listing preservada sem repetir taxa"; touch(op, "failed"); return;
            }
            touch(op, "listed"); return;
        }
    }
    if (liveOrder && extended > 0 && (op.kind !== "sell" || liveOrder.price >= op.limit / 0.95)) {
        if (op.kind === "sell" && claims.physicalFree(target, target.terminal, op.resourceType, op.id) < op.remaining) { op.error = "aguardando lastro integral da listing"; touch(op, "listed"); return; }
        const fee = liveOrder.price * extended * 0.05;
        if (Game.market.credits < fee || fee > marketAccounting.available(op.id)) { op.error = "orçamento insuficiente para estender listing"; touch(op, "listed"); return; }
        if (op.kind === "buy" && liveOrder.price + ((op.orderFeesRemaining || 0) + (op.cancelledListingFees || 0) + fee) /
            Math.max(1, orderAmount(liveOrder) + extended) > op.limit) { op.error = "extensão excede limite efetivo"; touch(op, "listed"); return; }
        const beforeCredits = Game.market.credits, totalBefore = liveOrder.totalAmount || 0, remainingBefore = orderAmount(liveOrder);
        const status = typeof Game.market.extendOrder === "function" ? Game.market.extendOrder(op.marketOrderId, extended) : ERR_INVALID_ARGS;
        if (status === OK) {
            op.pendingExtension = { amount: extended, tick: Game.time, totalBefore, remainingBefore };
            chargeMarketFee(op, fee, beforeCredits);
        } else op.error = "extendOrder retornou " + status;
        touch(op, "listed"); return;
    }
    if (liveOrder && Game.time - (op.repriceTick || op.listedTick || 0) < config.get("terminalOps.repriceInterval", 1000)) { touch(op, "listed"); return; }
    const ceiling = op.kind === "buy" ? buyListingCeiling(op, liveOrder) : Infinity;
    const floor = op.kind === "sell" ? op.limit / 0.95 : 0;
    const price = op.fixedListing && op.kind === "sell" ? require("./swingTrade").listingPrice(target, op.resourceType, op.limit, require("./orderBook").all()) : op.kind === "buy" ? Math.min(competitivePrice(op), ceiling) : Math.max(competitivePrice(op), floor);
    if (!(price > 0) || (op.kind === "buy" && price > ceiling) || (op.kind === "sell" && price < floor)) { op.error = "não há preço competitivo dentro do limite líquido"; touch(op, "waiting"); return; }
    const old = op.marketOrderId && Game.market.orders && Game.market.orders[op.marketOrderId];
    const interval = config.get("terminalOps.repriceInterval", 1000);
    if (old && Game.time - (op.repriceTick || op.listedTick || 0) < interval) { touch(op, "listed"); return; }
    // Repricing a live order goes through changeOrderPrice, which keeps the
    // order (and its id) and only charges (price - old.price) * remaining *
    // 0.05 - nothing at all when the price goes down. cancelOrder +
    // createOrder, what this did until 2026-09-24, re-paid the full 5% of the
    // whole order every repriceInterval and refunded none of the previous fee:
    // repricing the 62751 O of terminal-180, listed at 62.445, would have burned
    // ~196k credits (bug real, usuário reportou em produção). Failed changes
    // now preserve the paid order for a later retry.
    let changed = null;
    if (old) {
        if (price === op.listedPrice) { op.repriceTick = Game.time; touch(op, "listed"); return; }
        const delta = Math.max(0, price - old.price) * orderAmount(old) * 0.05;
        if (Game.market.credits < delta) {
            op.error = "créditos insuficientes para reprecificar: disponível " +
                Game.market.credits + ", necessário " + delta + ", preço " + old.price + " -> " + price;
            touch(op, "listed");
            return;
        }
        const before = Game.market.credits;
        changed = typeof Game.market.changeOrderPrice === "function" ? Game.market.changeOrderPrice(op.marketOrderId, price) : null;
        if (changed === OK) { chargeMarketFee(op, delta, before); op.listedPrice = price; op.repriceTick = Game.time; touch(op, "listed"); return; }
        op.error = "changeOrderPrice retornou " + changed;
        touch(op, "listed"); return;
    }
    const fee = price * op.remaining * 0.05;
    if (op.policy === "swing" && fee > marketAccounting.available()) { op.error = "piso global de créditos para taxa"; touch(op, "waiting"); return; }
    // Checked before cancelOrder on purpose: the old order used to be cancelled
    // first, so an operation short on credits lost the listing it had already
    // paid for and dropped straight to "failed" with nothing on the market.
    if (Game.market.credits < fee) {
        op.error = "créditos insuficientes para taxa da ordem: disponível " +
            Game.market.credits + ", necessário " + fee +
            ", quantidade " + op.remaining + ", preço " + price;
        touch(op, old ? "listed" : "failed");
        return;
    }
    if (op.kind === "sell" && !op.marketOnly && activeForRoom(op.sourceRoom).some((other) => other.id !== op.id && claims.outgoing(other, target, op.resourceType)) &&
        claims.physicalFree(target, target.terminal, op.resourceType, op.id) < op.remaining) { op.error = "aguardando lastro integral da listing"; touch(op, "waiting"); return; }
    if (activeForRoom(op.sourceRoom).some((other) => other.id !== op.id && other.resourceType === op.resourceType && other.kind === op.kind && other.listedTick === Game.time && !other.marketOrderId)) {
        op.error = "listing do mesmo recurso sendo confirmada"; touch(op, "waiting"); return;
    }
    const creditsBefore = Game.market.credits;
    const status = Game.market.createOrder({ type: op.kind === "buy" ? ORDER_BUY : ORDER_SELL, resourceType: op.resourceType, price, totalAmount: op.remaining, roomName: target.name });
    if (status === OK) chargeMarketFee(op, fee, creditsBefore);
    if (status !== OK) { op.error = "createOrder retornou " + status; touch(op, "waiting"); return; }
    op.marketOrderId = null; op.listedPrice = price; op.listedAmount = op.remaining; op.listedTick = Game.time; op.repriceTick = Game.time; touch(op, "listing");
    op.createdListing = true;
}
function bindCreatedOrders() {
    if (!Game.market || !Game.market.orders) return;
    const bound = new Set(activeIds().map(operation).map((op) => op.marketOrderId).filter(Boolean));
    activeIds().forEach((id) => {
        const op = operation(id);
        // op.listedTick is only ever set by listResidual() right after a real
        // createOrder() call. An op also reaches "listing" via executeDeal()'s
        // no-candidate branch (reportNoCandidate -> touch(op, "listing")),
        // *before* listResidual ever runs - listedTick is still undefined
        // there. `order.created < undefined` is always false in JS, so the
        // age check below used to silently pass for every op in that state,
        // binding it to the first pre-existing order that happened to match
        // room/resource/type - including an unrelated, already fully-filled
        // one of ours from a completely different, older operation. That let
        // syncManagedOrders() (see its own comment) declare the operation
        // "completed" without ever creating an order or trading anything
        // (bug real, usuário reportou em produção, 2026-09-24: terminalSell
        // de 1000 pixel virou "completed" com listedFilled:1000 vinculado a
        // uma ordem antiga de 200 já zerada, sem nenhuma venda real).
        if (!op || op.state !== "listing" || !op.listedTick) return;
        Object.keys(Game.market.orders).some((orderId) => {
            const order = Game.market.orders[orderId];
            if (bound.has(orderId)) return false;
            if (!order || order.roomName !== op.sourceRoom || order.resourceType !== op.resourceType || order.type !== (op.kind === "buy" ? ORDER_BUY : ORDER_SELL) || order.created < op.listedTick) return false;
            if (op.createdListing && (order.price !== op.listedPrice || order.totalAmount !== undefined && order.totalAmount !== op.listedAmount)) return false;
            bound.add(orderId); op.marketOrderId = orderId; touch(op, "listed"); return true;
        });
    });
}
function syncManagedOrders() {
    if (!Game.market || !Game.market.orders) return;
    activeIds().map(operation).forEach((op) => {
        require("./craftLedger").economic(op);
        // op.listedAmount is only set by listResidual() right after it
        // actually creates the order being tracked here - it is the real
        // size of *that* order, needed as the baseline for how much of it
        // has been filled. Falling back to op.remaining when it is missing
        // (the old behaviour) assumed the bound order was the full
        // remaining amount, which is only safe if bindCreatedOrders() bound
        // us to an order we genuinely just created. Defense in depth for
        // that invariant (bug real, ver comentário em bindCreatedOrders):
        // without a real listedAmount there is no trustworthy baseline, so
        // skip instead of risking a phantom full-completion.
        if (!active(op) || !op.marketOrderId || typeof op.listedAmount !== "number") return;
        const order = Game.market.orders[op.marketOrderId];
        if (!order) return;
        hydrateMarketFees(op);
        const remainingOnMarket = order.remainingAmount === undefined ? order.amount : order.remainingAmount;
        if (op.pendingExtension && Game.time > op.pendingExtension.tick &&
            ((order.totalAmount || 0) >= op.pendingExtension.totalBefore + op.pendingExtension.amount || remainingOnMarket >= op.pendingExtension.remainingBefore + op.pendingExtension.amount)) {
            op.listedAmount += op.pendingExtension.amount; delete op.pendingExtension;
        }
        const filled = Math.max(0, op.listedAmount - remainingOnMarket - (op.listedFilled || 0));
        if (filled <= 0) return;
        op.listedFilled = (op.listedFilled || 0) + filled;
        op.remaining = Math.max(0, op.remaining - filled);
        const fees = (op.orderFeesRemaining || 0) * Math.min(1, filled / Math.max(1, filled + remainingOnMarket));
        op.orderFeesRemaining = Math.max(0, (op.orderFeesRemaining || 0) - fees);
        op.dealtAmount = (op.dealtAmount || 0) + filled;
        op.lastSuccessfulDealTick = Game.time;
        if (op.kind === "sell") { op.loadedAmount = Math.max(0, (op.loadedAmount || 0) - filled); settleLots(op, filled, order.price, fees); }
        else { op.netBought = (op.netBought || 0) + filled; op.buyCredits = (op.buyCredits || 0) + filled * order.price; }
        record(op, filled, order.price * filled * (op.kind === "buy" ? -1 : 1), 0, fees);
        if (op.remaining <= 0) {
            if (op.kind === "buy") touch(op, "awaitingReceipt");
            else touch(op, "completed");
        }
    });
}

function incomingReceipt(roomName, resourceType, value, parentId) {
    const target = owned(roomName);
    if (!target || value <= 0) return false;
    // Only merge into a receipt that belongs to the same parent transfer.
    // Merging across parents credited one transfer's cargo to another's
    // receipt, so the real parent never completed (real bug, 2026-10-01:
    // terminal-232's 31388 energy was drained by terminal-199, a receipt of
    // terminal-198, leaving 232 stuck and energyBalancing.pending blocked).
    const existing = activeForRoom(roomName).find((op) => op.kind === "receipt" && op.targetRoom === roomName && op.resourceType === resourceType && (op.parentId || null) === (parentId || null));
    if (existing) {
        existing.amount += value;
        existing.updatedTick = Game.time;
        return true;
    }
    if (!parentId && lockConflict("receipt", null, roomName, resourceType)) return true;
    const keepTerminal = config.get("stockPolicy.enabled", true) && !stockPolicy.used(target, resourceType);
    const id = create("receipt", null, roomName, resourceType, value, { parentId, keepTerminal, state: "awaitingReceipt" });
    if (keepTerminal) { operation(id).receivedAmount = value; completeReceipt(operation(id)); return true; }
    tickReceipt(operation(id), target);
    return true;
}
function awaitingReceiptFor(roomName, resourceType, tx) {
    const ops = activeForRoom(roomName).filter((op) => op.resourceType === resourceType && op.kind !== "receipt");
    if (tx && tx.order && tx.order.id) {
        const matches = ops.filter((op) => op.kind === "buy" && op.sourceRoom === roomName &&
            (op.marketOrderId === tx.order.id || op.pendingDeal && op.pendingDeal.orderId === tx.order.id && op.pendingDeal.tick === tx.time ||
            op.lastDealOrderId === tx.order.id && op.lastDealTick === tx.time));
        return matches.length === 1 ? matches[0] : null;
    }
    if (tx && typeof tx.description === "string" && tx.description.indexOf("terminal operation ") === 0) {
        const parent = operation(tx.description.slice("terminal operation ".length));
        return active(parent) && parent.kind === "transfer" && parent.targetRoom === roomName && parent.resourceType === resourceType ? parent : null;
    }
    const matches = ops.filter((op) => (op.targetRoom === roomName || op.sourceRoom === roomName && op.kind === "buy") &&
        ["awaitingReceipt", "unloading", "waiting", "recovering"].indexOf(op.state) >= 0);
    return matches.length === 1 ? matches[0] : null;
}
const incomingSignature = { ops: null, value: null, tick: -Infinity };
function scanIncoming() {
    const incoming = Game.market && Game.market.incomingTransactions;
    const transactions = Array.isArray(incoming) ? incoming : [];
    // The API lists newest first: same length and same newest id as the last
    // full scan means nothing new arrived and nothing aged out.
    const signature = transactions.length + ":" + (transactions[0] && transactions[0].transactionId);
    if (incomingSignature.ops === memory().operations && incomingSignature.value === signature && Game.time - incomingSignature.tick < 100) return;
    incomingSignature.ops = memory().operations; incomingSignature.value = signature; incomingSignature.tick = Game.time;
    const stillListed = {};
    transactions.forEach((tx) => {
        if (!tx || !tx.transactionId) return;
        stillListed[tx.transactionId] = true;
        if (memory().seenIncoming[tx.transactionId]) return;
        if (tx.to && validResource(tx.resourceType) && amount(tx.amount)) {
            const parent = awaitingReceiptFor(tx.to, tx.resourceType, tx);
            if (!incomingReceipt(tx.to, tx.resourceType, tx.amount, parent && parent.id)) return;
        }
        memory().seenIncoming[tx.transactionId] = Game.time;
    });
    // Game.market.incomingTransactions keeps a much longer history than any
    // fixed tick window is safe to purge on - purging seenIncoming after
    // 1000 ticks (the old behaviour) while the API kept listing transactions
    // far older than that made every incoming trade look "new" again roughly
    // every 1000 ticks, so incomingReceipt() kept re-adding the same trade's
    // amount to the same receipt forever (bug real, usuário reportou em
    // produção, 2026-09-29: three separate receipts ballooned to 556650,
    // 9785000 and 11063579 energy over their lifetime, none ever able to
    // reach remainingAmount 0 again - one of them then absorbed the hauler
    // meant for an unrelated, currently-critical balancing transfer). Only
    // forget an id once the API itself has stopped listing it - self
    // -bounding, since this set can never outgrow whatever the platform
    // already retains.
    Object.keys(memory().seenIncoming).forEach((id) => { if (!stillListed[id]) delete memory().seenIncoming[id]; });
}
function managedTerminalIncrease(roomName, resourceType, roomOps) {
    // loadedAmount and feeLoadedAmount are different currencies: loadedAmount
    // is measured in the operation's own resourceType (only relevant when it
    // matches the resourceType being queried), but feeLoadedAmount is always
    // energy staged to pay a market fee, regardless of what the operation is
    // selling. Real bug: a SELL of "O" stages energy in the terminal for its
    // own fee (feeLoadedAmount), but querying this for "energy" surplus used
    // to bail out on the very first resourceType mismatch (op.resourceType
    // "O" !== "energy") before ever reaching the feeLoadedAmount line - so
    // that staged fee energy looked like unclaimed surplus every tick and got
    // folded into an unrelated energy receipt's amount, ballooning it, while
    // the receipt's hauler hauled the same fee-staged energy straight back to
    // storage the instant it landed, undoing the SELL's own fee job forever.
    return (roomOps || activeForRoom(roomName)).reduce((sum, op) => {
        if (!active(op) || op.sourceRoom !== roomName) return sum;
        if (op.resourceType === resourceType && (op.kind === "sell" || op.kind === "transfer")) sum += Math.max(0, op.loadedAmount || 0);
        if (resourceType === RESOURCE_ENERGY) sum += claims.feeClaim(op);
        return sum;
    }, 0);
}
// Consistency check: what the target-side claims (receipts and already-sent
// transfers) say they still owe must be physically in the terminal, on top of
// what market/source-side operations have staged there. Market operations are
// funded first, so they can never lose cargo to a transfer's bookkeeping; a
// claim the stock cannot cover (drained by another actor) is settled instead of
// waiting for a timer. Skipped while any hauler or recovery is in flight,
// because cargo in a creep's hands is legitimately absent from the terminal.
function reconcileClaims(name, resourceType, terminal) {
    const ops = activeForRoom(name).filter((op) => op.resourceType === resourceType);
    const receipts = ops.filter((op) => op.targetRoom === name && (op.kind === "receipt" || (op.kind === "transfer" && op.sentAmount > 0)))
        .sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0));
    if (!receipts.length) return;
    const busy = receipts.some((op) => op.state === "recovering" || op.state === "unloading" || (op.haulerName && Game.creeps && Game.creeps[op.haulerName]) ||
        (op.kind === "transfer" && Game.time - (op.sentTick || 0) < 3));
    if (busy) { receipts.forEach((op) => { delete op.deficitSinceTick; }); return; }
    const staged = activeForRoom(name).reduce((sum, op) => {
        if (op.sourceRoom !== name) return sum;
        if (op.resourceType === resourceType && (op.kind === "sell" || (op.kind === "transfer" && !(op.sentAmount > 0)))) sum += Math.max(0, op.loadedAmount || 0);
        if (resourceType === RESOURCE_ENERGY) sum += claims.feeClaim(op);
        return sum;
    }, 0);
    // Reserved stock is not evidence of lost receipt cargo. Wait for the
    // source-side claim/intent to settle before declaring a physical deficit.
    if (staged > 0) { receipts.forEach((op) => { delete op.deficitSinceTick; }); return; }
    let free = Math.max(0, storeValue(terminal.store, resourceType) - staged);
    receipts.forEach((op) => {
        const owed = op.kind === "receipt" ? Math.max(0, op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0)) : Math.max(0, op.amount - (op.receivedAmount || 0));
        const covered = Math.min(owed, free);
        free -= covered;
        const shortfall = owed - covered;
        if (shortfall <= 0) { delete op.deficitSinceTick; return; }
        op.deficitSinceTick = op.deficitSinceTick || Game.time;
        if (Game.time - op.deficitSinceTick < config.get("terminalOps.deficitConfirmTicks", 3)) return;
        delete op.deficitSinceTick;
        op.error = "estoque consumido por outro caminho: " + shortfall + " ausente do terminal";
        if (op.kind === "receipt") op.recoveredAmount = (op.recoveredAmount || 0) + shortfall;
        else op.receivedAmount = (op.receivedAmount || 0) + shortfall;
        if (covered <= 0) { if (op.kind === "receipt") completeReceipt(op); else touch(op, "completed"); }
    });
}
function scanTerminalBalances() {
    const seen = memory().terminalBalance;
    Object.keys(Game.rooms || {}).forEach((name) => {
        const target = owned(name);
        if (!target) return;
        // An empty terminal has no store keys, yet that is exactly when a claim
        // must be settled, so claimed resources are reconciled regardless.
        const roomOps = activeForRoom(name);
        const claimed = {};
        roomOps.forEach((op) => { if (op.targetRoom === name && validResource(op.resourceType) && (op.kind === "receipt" || op.sentAmount > 0)) claimed[op.resourceType] = true; });
        Object.keys(claimed).forEach((resourceType) => reconcileClaims(name, resourceType, target.terminal));
        Object.keys(target.terminal.store || {}).forEach((resourceType) => {
            if (!validResource(resourceType)) return;
            const current = storeValue(target.terminal.store, resourceType), key = name + ":" + resourceType;
            // "waiting" belongs here alongside "awaitingReceipt"/"unloading":
            // assign()'s no-hauler fallback (see assign()) demotes a transfer's
            // unload attempt straight to "waiting" the instant no hauler is
            // free, even though its cargo already physically landed in this
            // terminal. Without "waiting" in this list, that stuck-but-already
            // -delivered cargo looked unclaimed on every subsequent tick and
            // got re-detected as fresh surplus, minting a duplicate receipt for
            // the same stock again and again (real bug: a stuck transfer's
            // energy ballooned a receipt's amount from 10000 to 103000 in a
            // handful of ticks). awaitingReceiptFor() below already treats
            // "waiting" the same way for the same reason.
            // "recovering" needs the same treatment: recover()'s drop-based
            // path (see recover()) demotes a transfer's unload leg to
            // "recovering" the instant its hauler dies mid-carry, but any
            // portion of the same op's cargo still sitting untouched in this
            // terminal is unrelated to that dead hauler's dropped chunk.
            // Without "recovering" here, that untouched remainder looked like
            // fresh surplus for as long as the op stayed in that state,
            // minting a second, unrelated receipt that then raced the
            // original op to drain the same terminal stock - both op and
            // receipt ended up with partial receivedAmount, neither ever
            // reaching 0 remaining, so the op never completed and blocked
            // Memory.energyBalancing.pending for that room forever (real bug,
            // 2026-09-30: terminal-198's unload split against a spuriously
            // -created terminal-199, 1500 + 36590 = 38090 sent, room then
            // starved with no new transfer ever queued).
            const reserved = roomOps.filter((op) => active(op) && op.targetRoom === name && op.kind !== "receipt" && op.resourceType === resourceType && ["awaitingReceipt", "unloading", "waiting", "recovering"].indexOf(op.state) >= 0).reduce((sum, op) => sum + Math.max(0, op.amount - (op.receivedAmount || 0)), 0);
            const receiptPending = roomOps.filter((op) => active(op) && op.kind === "receipt" && op.targetRoom === name && op.resourceType === resourceType).reduce((sum, op) => sum + Math.max(0, op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0)), 0);
            // A load performed by our own sell/transfer operation is not an
            // incoming transaction. Without this subtraction, every batch
            // loaded for SELL becomes a synthetic receipt and gets hauled back
            // to storage, creating an endless terminal/storage cycle.
            const managedIncrease = managedTerminalIncrease(name, resourceType, roomOps);
            // Surplus is whatever the terminal holds beyond what an active
            // operation has staged or a pending receipt already claims - not
            // merely growth since the last tick. The terminal should only ever
            // hold what pending operations need; anything else (a leftover
            // batch, or logistics that dropped resource here before any
            // operation existed) is swept back to storage even if it has sat
            // there unnoticed for a while.
            const keep = config.get("stockPolicy.enabled", true) && !stockPolicy.used(target, resourceType);
            const fuel = require("./terminalFuel");
            const fuelReserve = resourceType === RESOURCE_ENERGY ? fuel.unfunded(target) : 0;
            const rawSurplus = keep ? 0 : Math.max(0, current - managedIncrease - reserved - receiptPending - fuelReserve);
            const surplus = resourceType === RESOURCE_ENERGY && rawSurplus <= Math.ceil(fuel.reserve(target) * config.get("terminalFuel.releaseRatio", 0.25)) ? 0 : rawSurplus;
            if (surplus > 0) {
                const parent = awaitingReceiptFor(name, resourceType);
                incomingReceipt(name, resourceType, surplus, parent && parent.id);
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
    // A transfer that already sent has nothing left to recover from the
    // source terminal - send() already moved loadedAmount out of it. The
    // hauler that died was working the target-side unload leg instead
    // (bug real, usuário reportou em produção, 2026-09-28: recover() kept
    // reassigning source-room haulers against stock that no longer existed
    // there, wedging a bogus "recover" job and its lock on the source
    // terminal forever, which then blocked unrelated balancing transfers
    // that needed that same terminal as a source). Retrying the unload
    // fresh (tickTransfer's own waiting/unload branch) is the correct fix -
    // no special recovery needed unless the dying hauler itself was
    // physically carrying cargo, which the drops check above already
    // covers using the correct (target) room passed in by tick().
    if (op.kind === "transfer" && op.sentAmount > 0) { touch(op, "waiting"); return; }
    if (op.loadedAmount > 0 && source) {
        op.recoveryAttempts = (op.recoveryAttempts || 0) + 1;
        if (op.recoveryAttempts > 3) { op.error = "hauler morreu e não foi possível recuperar a carga"; touch(op, "failed"); }
        else { touch(op, "recovering"); assign(op, source, "recover", source.terminal, source.storage, op.loadedAmount); }
    } else touch(op, op.kind === "receipt" ? "waiting" : "queued");
}
function tickTransfer(op, source, target) {
    if (op.state === "queued" || (op.state === "waiting" && op.waitingDirection !== "unload")) assign(op, source, "load", source.storage, source.terminal, transferLoadTarget(op) - op.loadedAmount);
    if (op.state === "atTerminal") {
        if (op.loadedAmount < transferLoadTarget(op)) { touch(op, "queued"); return; }
        if (terminalBusy(source.name)) { op.error = "terminal já usado neste tick"; touch(op, "waiting"); return; }
        if (source.terminal.cooldown) { op.error = "terminal em cooldown"; touch(op, "waiting"); return; }
        if (storeValue(source.terminal.store, op.resourceType) < op.loadedAmount) {
            op.error = "carga ainda não está no terminal";
            op.stallStartedTick = op.stallStartedTick || Game.time;
            // Stall guard: this branch otherwise never calls touch(), so a
            // loadedAmount that never shows up in the terminal (bookkeeping
            // drifted out of sync with what physically happened) would wedge
            // the operation here forever instead of failing it.
            if (Game.time - op.stallStartedTick >= config.get("terminalOps.transferStallTicks", 1500)) { op.error = "carga presa: nunca apareceu no terminal"; touch(op, "failed"); }
            return;
        }
        delete op.stallStartedTick;
        touch(op, "executing");
        const status = source.terminal.send(op.resourceType, op.amount, op.targetRoom, "terminal operation " + op.id);
        if (status === OK) claimTerminal(source.name);
        if (status === OK) { op.sentAmount = op.amount; op.sentTick = Game.time; op.remaining = 0; op.targetTerminalBaseline = storeValue(target.terminal.store, op.resourceType); record(op, op.amount, 0, op.transactionCost); touch(op, "awaitingReceipt"); }
        else { op.error = "send retornou " + status; touch(op, "waiting"); }
    }
    // Compare/request the amount still owed, not op.amount (the original
    // total): a hauler's carry capacity is almost always smaller than the
    // full transfer, so receivedAmount grows across several trips. Gating
    // and sizing the job on the full op.amount worked for the very first
    // trip (the target terminal had just received the whole amount, so
    // store-baseline >= op.amount held) but froze forever after that first
    // partial delivery, since store-baseline then permanently sits below the
    // original total (bug real, usuário reportou em produção, 2026-09-28:
    // terminal-195 delivered 1500 of 30925 then never resumed). tickReceipt()
    // already gets this right by tracking a remaining amount instead.
    const remainingUnload = Math.max(0, op.amount - (op.receivedAmount || 0));
    const unloading = op.state === "awaitingReceipt" || (op.state === "waiting" && op.waitingDirection === "unload");
    if (unloading && remainingUnload > 0) {
        // Stall guard: op.receivedAmount only grows through THIS op's own
        // hauler trips (runHauler's "unload" branch). If some other actor
        // drains the same physical stock without crediting this op - e.g. a
        // receipt spuriously created for this op's own arriving cargo while
        // it briefly sat in "recovering" before "recovering" was added to
        // scanTerminalBalances()'s reserved list above - remainingUnload can
        // never reach 0 even though the terminal is already empty, wedging
        // this op in "waiting" forever and blocking energyBalancing.pending
        // for the target room (real bug, 2026-09-30: terminal-198 stuck for
        // 24642+ ticks after terminal-199 quietly finished its delivery).
        // Time out instead of relying on manual cancelTerminalOperation().
        if (op.unloadStallReceivedAmount !== (op.receivedAmount || 0)) {
            op.unloadStallReceivedAmount = op.receivedAmount || 0;
            op.unloadStallStartedTick = Game.time;
        } else if (Game.time - op.unloadStallStartedTick >= config.get("terminalOps.transferUnloadStallTicks", 10000)) {
            op.error = "descarga travada: sem progresso ha muito tempo (provavel entrega via outra operacao)";
            touch(op, "failed");
            return;
        }
    }
    if (!(unloading && target && remainingUnload > 0)) return;
    const present = Math.max(0, storeValue(target.terminal.store, op.resourceType) - (op.targetTerminalBaseline || 0));
    if (present >= remainingUnload) {
        if (config.get("stockPolicy.enabled", true) && !stockPolicy.used(target, op.resourceType)) {
            op.receivedAmount = op.amount; touch(op, "completed"); return;
        }
        assign(op, target, "unload", target.terminal, target.storage, remainingUnload); return;
    }
}
function tickReceipt(op, target) {
    if (["awaitingReceipt", "waiting", "unloading"].indexOf(op.state) < 0) return;
    // Exclude what managedTerminalIncrease() already earmarks for this same
    // room (e.g. energy a SELL just staged in the terminal to pay its market
    // fee): without this, a receipt for the same resourceType (energy) races
    // a SELL's fee job for the exact same physical stock. The receipt's
    // hauler was seen withdrawing it back to storage the instant the fee
    // hauler dropped it off, so the SELL never had enough to deal and kept
    // restaging the same amount forever - real bug, a receipt and a SELL's
    // fee job pulling 856 energy in and out of the terminal in a loop.
    const raw = Math.max(0, storeValue(target.terminal.store, op.resourceType) - managedTerminalIncrease(target.name, op.resourceType));
    const available = Math.max(0, raw - (op.resourceType === RESOURCE_ENERGY ? require("./terminalFuel").unfunded(target) : 0));
    let remainingAmount = Math.max(0, op.amount - (op.receivedAmount || 0) - (op.recoveredAmount || 0));
    if (op.resourceType === RESOURCE_ENERGY && raw >= remainingAmount) {
        const retained = Math.max(0, remainingAmount - available);
        op.receivedAmount = (op.receivedAmount || 0) + retained;
        op.retainedAmount = (op.retainedAmount || 0) + retained;
        remainingAmount -= retained;
    }
    // Two receipts for the same terminal stock must not race: skip while a
    // sibling receipt already has a hauler working on it.
    const sibling = activeForRoom(target.name).some((other) => other !== op && other.kind === "receipt" && other.targetRoom === op.targetRoom && other.resourceType === op.resourceType && other.haulerName && Game.creeps && Game.creeps[other.haulerName] && Game.creeps[other.haulerName].memory.terminalJob);
    if (sibling) return;
    if (available > 0 && remainingAmount > 0 && config.get("stockPolicy.enabled", true) && !stockPolicy.used(target, op.resourceType)) {
        op.receivedAmount = (op.receivedAmount || 0) + Math.min(remainingAmount, available);
        if (op.receivedAmount + (op.recoveredAmount || 0) >= op.amount) completeReceipt(op);
    }
    else if (available > 0 && remainingAmount > 0) assign(op, target, "unload", target.terminal, target.storage, Math.min(remainingAmount, available));
    else if (remainingAmount <= 0) completeReceipt(op);
}
function completeReceipt(op) {
    touch(op, "completed");
    if (op.parentId && !op.parentCredited) {
        const parent = operation(op.parentId);
        if (parent && active(parent)) {
            op.parentCredited = true;
            parent.receivedAmount = (parent.receivedAmount || 0) + op.amount;
            if (parent.kind !== "buy" || parent.remaining <= 0 && parent.receivedAmount >= (parent.dealtAmount || parent.amount)) touch(parent, "completed");
        }
    }
}
// GC cadence remains independent from terminalIndex's per-tick membership.
// create() bumps nextId; archived history is retained while a live chain needs it.
const INDEX_REFRESH_TICKS = 60;
const activeIndex = { ops: null, nextId: -1, tick: -Infinity };
function activeIds() {
    const mem = memory();
    if (activeIndex.ops !== mem.operations || activeIndex.nextId !== mem.nextId || Game.time - activeIndex.tick >= INDEX_REFRESH_TICKS || Game.time < activeIndex.tick) {
        gcOperations();
        activeIndex.ops = mem.operations; activeIndex.nextId = mem.nextId; activeIndex.tick = Game.time;
    }
    return require("./terminalIndex").all().map((op) => op.id);
}
function gcOperations() {
    require("./terminalHistory").prune(memory());
}
const perf = {};
function phase(name, fn) {
    const start = Game.cpu.getUsed();
    try { fn(); }
    finally {
        const used = Game.cpu.getUsed() - start;
        perf[name] = (perf[name] || 0) + used;
        cpuMeter.record("spans", "terminalOps." + name, used);
    }
}
// The state machines run on a grid (terminalOps.tickInterval, default 5): a deal or a hauler
// hand-off is noticed at most 4 ticks late, well inside a terminal's 10-tick cooldown, while
// every phase below used to walk every active operation on every tick.
let lastTickRun = null;
function tick() {
    if (!config.get("terminalOps.enabled", true)) return;
    const interval = config.get("terminalOps.tickInterval", 5);
    if (interval > 1 && !cadence.due(lastTickRun, interval)) return;
    lastTickRun = Game.time;
    memory();
    phase("gc+orders", () => { activeIds(); bindCreatedOrders(); syncManagedOrders(); });
    phase("incoming", scanIncoming);
    phase("operations", runOperations);
}
// ROADMAP 0111 (bug real, usuario reportou em producao, 2026-10-02): uma
// compra em "awaitingReceipt" so fechava quando um recibo LIGADO a ela
// terminava. Se o material saia do terminal por um recibo sem esse vinculo
// (ex.: o primeiro de dois negocios chega com a operacao ainda em "queued",
// antes de aceitar recibos), a compra ficava para sempre em awaitingReceipt -
// o material ja estava no storage (U 1500, terminal vazio), mas o flip nunca
// vendia (esperava "completed") e a cadeia de fabricacao nunca saia de
// "buying". Fecha quando o material nao esta mais no terminal e nenhum recibo
// filho esta em andamento, depois de terminalOps.orphanBuyConfirmTicks.
function settleOrphanBuy(op, source) {
    if (config.get("stockPolicy.enabled", true) && !stockPolicy.used(source, op.resourceType) &&
        storeValue(source.terminal.store, op.resourceType) >= Math.max(0, (op.dealtAmount || op.amount) - (op.receivedAmount || 0))) {
        op.receivedAmount = op.dealtAmount || op.amount;
        touch(op, "completed"); return;
    }
    const hasChild = activeForRoom(op.sourceRoom).some((other) => other.kind === "receipt" && other.parentId === op.id);
    const inTerminal = Math.max(0, storeValue(source.terminal.store, op.resourceType) - managedTerminalIncrease(op.sourceRoom, op.resourceType));
    if (hasChild || inTerminal > 0) { delete op.orphanSinceTick; return; }
    op.orphanSinceTick = op.orphanSinceTick || Game.time;
    if (Game.time - op.orphanSinceTick < config.get("terminalOps.orphanBuyConfirmTicks", 30)) return;
    delete op.orphanSinceTick;
    op.error = "recebimento concluido por outro caminho: o material ja saiu do terminal";
    touch(op, "completed");
}
function runOperation(id) {
        const op = operation(id); if (!active(op)) return;
        claims.owner(op);
        hydrateMarketFees(op);
        const marketOnly = op.marketOnly || marketOnlyResource(op.resourceType);
        const source = op.sourceRoom && (marketOnly ? room(op.sourceRoom) : owned(op.sourceRoom)), target = op.targetRoom && owned(op.targetRoom);
        if (op.policy === "swing" && op.kind === "sell" && source && op.state !== "settling" && !fundedListing(op, source) &&
            stockPolicy.available(source, op.resourceType, op.id) < op.remaining) { op.error = "estoque comprometido"; cancel(op.id); return; }
        if (op.kind === "receipt") {
            if (op.recoveryStartedTick && Game.time - op.recoveryStartedTick >= config.get("terminalOps.recoveryTicks", 10000)) { op.error = "recovery timeout"; touch(op, "failed"); return; }
            if (op.haulerName && (!Game.creeps || !Game.creeps[op.haulerName])) recover(op, target);
            if (target && (!op.haulerName || !Game.creeps || !Game.creeps[op.haulerName] || !Game.creeps[op.haulerName].memory.terminalJob)) tickReceipt(op, target);
            return;
        }
        if (!source || (op.kind === "transfer" && !target)) { op.error = "terminal/storage indisponível"; touch(op, "waiting"); return; }
        if (op.cancelRequested && !op.pendingDeal && !op.pendingExtension && op.state !== "recovering") { cancel(op.id); return; }
        if (op.state === "cancellingListing") { cancelListingForDeal(op); return; }
        if (op.kind === "buy" && (op.state === "listing" || op.state === "listed")) {
            const candidate = candidateOrders(op).find((item) => canExecutePurchase(op, source, item));
            if (candidate) {
                if (cancelListingForDeal(op)) executeDeal(op, source);
                return;
            }
        }
        if (marketOnly) {
            if (op.state === "settling") settleDeal(op, source);
            else if (op.state === "queued" || op.state === "waiting") retryDeal(op, source);
            else if (op.state === "listing" || op.state === "listed") listResidual(op, source);
            return;
        }
        if (op.haulerName && Game.creeps && Game.creeps[op.haulerName] && Game.creeps[op.haulerName].memory.terminalJob) return;
        if (op.haulerName && (!Game.creeps || !Game.creeps[op.haulerName])) recover(op, op.kind === "transfer" && op.sentAmount > 0 ? target : source);
        if (["loading", "unloading", "recovering"].indexOf(op.state) >= 0) return;
        if (op.kind === "transfer") tickTransfer(op, source, target);
        else if (op.kind === "sell") {
            if (op.state === "settling") settleDeal(op, source);
            else if (["queued", "waiting"].indexOf(op.state) >= 0) stageSaleCargo(op, source);
            else if (op.state === "atTerminal") executeDeal(op, source);
            else if (op.state === "listing" || op.state === "listed") {
                // A public SELL order advertises op.remaining, but a buyer can
                // only take what is physically in the terminal, and nothing used
                // to restock a listed operation: terminal-180 advertised 62751 O
                // against a terminal holding 10000 (bug real, usuário reportou em
                // produção, 2026-09-24), so the 5% listing fee bought reach the
                // cargo could never cover. Topping the terminal up wins over
                // repricing this tick - the price is useless without stock.
                const listedState = op.state;
                const shortfall = Math.min(saleBuffer(op, source), op.remaining) - storeValue(source.terminal.store, op.resourceType);
                // assign() demotes the operation to "waiting"/"atTerminal" when it
                // cannot dispatch; the order is still live, so put it back where it
                // was and retry next tick instead of restarting the listing flow.
                if (shortfall > 0 && !stageSaleCargo(op, source)) touch(op, listedState);
                else if (shortfall > 0) return;
                listResidual(op, source);
            }
        } else if (op.kind === "buy") {
            if (op.state === "settling") settleDeal(op, source);
            else if (["queued", "waiting"].indexOf(op.state) >= 0) retryDeal(op, source);
            else if (op.state === "atTerminal") executeDeal(op, source);
            else if (op.state === "listing" || op.state === "listed") listResidual(op, source);
            else if (op.state === "awaitingReceipt") settleOrphanBuy(op, source);
        }
}
function runOperations() {
    activeIds().slice().sort((a, b) => {
        const priority = (id) => {
            const op = operation(id);
            if (["settling", "awaitingReceipt", "unloading", "recovering"].indexOf(op.state) >= 0) return 0;
            return op.kind === "buy" && op.resourceType === RESOURCE_ENERGY ? 1 : 2;
        };
        return priority(a) - priority(b) || (operation(a).lastSuccessfulDealTick || operation(a).createdTick || 0) -
            (operation(b).lastSuccessfulDealTick || operation(b).createdTick || 0);
    }).forEach((id) => {
        const head = operation(id);
        if (!active(head)) return;
        const key = "op " + head.kind + ":" + head.state;
        phase(key, () => runOperation(id));
    });
    // Runs after the operations above so managedTerminalIncrease() reflects
    // this tick's staged/reconciled amounts before deciding what's surplus.
    phase("balances", scanTerminalBalances);
}
function runHauler(creep) {
    const job = creep.memory.terminalJob; if (!job) return false;
    const op = operation(job.operationId), from = Game.getObjectById(job.fromId), to = Game.getObjectById(job.toId);
    if (!op || !from || !to) { delete creep.memory.terminalJob; return true; }
    // A job still in flight when its operation ended (cancelled while the hauler was
    // walking, not yet carrying) must stop here: finishing the leg would touch() the
    // finished operation back to "atTerminal" and revive it as a zombie that holds its
    // claims and blocks every new sale of that resource (bug real, usuario reportou em
    // producao, 2026-10-02: terminal-1599 cancelada pela cadeia voltou a viver e a
    // venda final nunca abriu).
    if (!active(op) && storeValue(creep.store, job.resourceType) <= 0) { delete creep.memory.terminalJob; op.haulerName = null; return true; }
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
        const cancelling = !!op.cancelRequested || !active(op);
        const home = cancelling && owned(op.sourceRoom || op.targetRoom);
        const destination = home ? home.storage : to;
        const status = creep.transfer(destination, job.resourceType);
        if (status === ERR_NOT_IN_RANGE) creep.moveTo(destination, { range: 1, reusePath: 10 });
        else if (status === OK) {
            if (cancelling) {
                op.recoveredAmount = (op.recoveredAmount || 0) + carried;
                op.haulerName = null;
                if (active(op)) cancel(op.id);
            }
            else if (job.direction === "fee") { op.feeJob = false; op.feeLoadedAmount = (op.feeLoadedAmount || 0) + carried; touch(op, "atTerminal"); }
            else if (job.direction === "load") { op.loadedAmount += carried; touch(op, op.loadedAmount >= transferLoadTarget(op) ? "atTerminal" : "queued"); }
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
            else { op.receivedAmount += carried; if (op.receivedAmount >= op.amount) { if (op.kind === "receipt") completeReceipt(op); else touch(op, "completed"); } else touch(op, "waiting"); }
            // A finished leg releases the creep back to normal duty, so this op
            // must stop tracking it - otherwise the creep's later, unrelated
            // death (doing regular hauling, nothing to do with this operation)
            // still matches tick()'s "my hauler died" check and fires recover()
            // on an operation that has long since moved past needing it (bug
            // real, usuário reportou em produção, 2026-09-28: uma transferência
            // já enviada com sucesso foi arrastada de volta para "recovering"
            // pela morte natural, dias depois, do hauler que só tinha feito o
            // load original, travando a operação para sempre em "atTerminal"
            // já que a carga "a recuperar" não existia mais no terminal).
            op.haulerName = null;
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
    const home = owned(creep.memory.homeRoom || op.sourceRoom || op.targetRoom);
    let available = Infinity;
    if (home && (from === home.storage || from === home.terminal))
        available = claims.physicalFree(home, from, job.resourceType, op.id);
    const request = Math.min(job.amount, Math.max(0, capacity), available);
    if (request <= 0) { op.error = "carga reservada por outro proprietário"; op.haulerName = null; delete creep.memory.terminalJob; touch(op, "waiting"); return true; }
    const status = creep.withdraw(from, job.resourceType, request);
    if (status === ERR_NOT_IN_RANGE) creep.moveTo(from, { range: 1, reusePath: 10 });
    else if (status === OK) claims.withdraw(from, job.resourceType, request);
    else { op.error = "withdraw retornou " + status; op.haulerName = null; touch(op, "waiting"); delete creep.memory.terminalJob; }
    return true;
}
function cancel(id) {
    const op = operation(id); if (!op) return result(false, "operação desconhecida");
    hydrateMarketFees(op);
    if (op.pendingDeal || op.pendingExtension) { op.cancelRequested = true; op.error = "aguardando confirmação do intent antes de cancelar"; return result(true, id); }
    if (op.haulerName && Game.creeps && Game.creeps[op.haulerName] && storeValue(Game.creeps[op.haulerName].store, op.resourceType) > 0) { op.cancelRequested = true; op.error = "carga já retirada; aguardando recuperação"; touch(op, "recovering"); return result(true, id); }
    if (op.marketOrderId && Game.market && typeof Game.market.cancelOrder === "function") {
        const status = Game.market.cancelOrder(op.marketOrderId);
        if (status !== OK && Game.market.orders && Game.market.orders[op.marketOrderId]) {
            op.error = "cancelOrder retornou " + status;
            return result(false, op.error);
        }
    }
    if (active(op) && op.orderFeesRemaining > 0) {
        op.cancelledListingFees = (op.cancelledListingFees || 0) + op.orderFeesRemaining;
        record(op, 0, 0, 0, op.orderFeesRemaining);
        const left = Math.max(1, op.remaining || 0);
        (op.lots || []).forEach((lot) => { lot.fees = (lot.fees || 0) + op.orderFeesRemaining * (lot.remaining || 0) / left; });
        op.orderFeesRemaining = 0;
    }
    touch(op, "cancelled"); return result(true, id);
}
// Shared by stats()/marketTransactionStats()/terminalTransferStats() so the
// window is trimmed once and all three read the same events, not three
// independently-filtered copies of the same array.
function recentEvents() {
    const window = config.get("terminalOps.statsWindowTicks", 60);
    memory().events = memory().events.filter((event) => Game.time - event.tick < window);
    return memory().events;
}
function stats(roomName) {
    const summary = { pending: 0, waiting: 0, lastError: null, count: 0, amount: 0, credits: 0, transactionEnergy: 0 };
    Object.keys(memory().operations).map(operation).forEach((op) => { if (op && (op.sourceRoom === roomName || op.targetRoom === roomName)) { if (active(op)) summary.pending++; if (op.state === "waiting") summary.waiting++; if (op.error) summary.lastError = op.error; } });
    recentEvents().forEach((event) => { if (event.room === roomName) { summary.count++; summary.amount += event.amount; summary.credits += event.credits; summary.transactionEnergy += event.transactionEnergy; } });
    return summary;
}
// ROADMAP 0079 follow-up: market.transactions for the "Mercado" dashboard
// panels. Global, not per-room - a market deal has no meaningful "room" the
// way a transfer does (competitivePrice() picks whichever order/room is
// cheapest, unrelated to which of the empire's rooms owns the operation).
// credits is stored negative for "buy" (money leaving) by record() above;
// both buckets are reported as a positive magnitude here since the bucket
// name (bought/sold) already carries the sign's meaning.
function marketTransactionStats() {
    const summary = { bought: {}, sold: {} };
    recentEvents().forEach((event) => {
        if (event.kind !== "buy" && event.kind !== "sell") return;
        const bucket = event.kind === "buy" ? summary.bought : summary.sold;
        const entry = bucket[event.resourceType] || (bucket[event.resourceType] = { amount: 0, credits: 0 });
        entry.amount += event.amount;
        entry.credits += Math.abs(event.credits);
    });
    return summary;
}
// ROADMAP 0079 follow-up: terminalNetwork.transfers for the "Transferência
// de energia entre salas" panel. Only kind "transfer" (an actual
// terminal.send() between two owned rooms, tickTransfer()) counts - a
// market deal's "room" is whichever order it filled, not a same-empire
// transfer. Keyed by from+to+resourceType (2026-09-24: a room pair moving
// two different resources in the same window used to collapse into one
// amount, losing which resource actually moved) - same pair/same resource
// still sums into a single entry.
function terminalTransferStats() {
    const byPair = {};
    recentEvents().forEach((event) => {
        if (event.kind !== "transfer" || !event.from || !event.to) return;
        const key = event.from + ">" + event.to + ":" + event.resourceType;
        const entry = byPair[key] || (byPair[key] = { from: event.from, to: event.to, resourceType: event.resourceType, amount: 0 });
        entry.amount += event.amount;
    });
    return Object.keys(byPair).map((key) => byPair[key]);
}
let networkCache = null;
// Explicit zeros also work with exporters that only set labels present in a snapshot.
// Cache the derived route map until a new event, expiry, configuration change or reset.
function terminalNetworkStats(previous) {
    const mem = memory(), window = config.get("terminalOps.statsWindowTicks", 60);
    if (networkCache && networkCache.events === mem.events && networkCache.count === mem.events.length &&
        networkCache.window === window && previous === networkCache.snapshot &&
        Game.time >= networkCache.tick && Game.time < networkCache.expires) return networkCache.snapshot;
    const routes = new Map();
    const key = (t) => t.from + ">" + t.to + ":" + t.resourceType;
    (previous && previous.transfers || []).forEach((t) => routes.set(key(t), { from: t.from, to: t.to, resourceType: t.resourceType, amount: 0 }));
    terminalTransferStats().forEach((t) => routes.set(key(t), t));
    let expires = Infinity;
    mem.events.forEach((event) => {
        if (event.kind === "transfer") expires = Math.min(expires, event.tick + window);
    });
    const snapshot = { transfers: Array.from(routes.values()) };
    networkCache = { events: mem.events, count: mem.events.length, window, snapshot, tick: Game.time, expires };
    return snapshot;
}
// Read-only quote: the relay executor is a separate, planned phase (0125).
const terminalRouting = require("./terminalRouting");
global.terminalRelayQuote = terminalRouting.quote;
global.terminalTransfer = function () { return announce("terminalTransfer", transfer.apply(null, arguments)); };
global.terminalBuy = buy;
global.terminalSell = sell;
global.terminalOperations = (options) => JSON.stringify(Object.keys(memory().operations).map(operation)
    .filter((op) => options && options.includeFinalized || active(op)), null, 2);
global.cancelTerminalOperation = cancel;
// One retained operation by id. The list defaults to active operations.
global.terminalOperation = (id) => {
    const op = operation(id);
    return op ? JSON.stringify(op, null, 2) : "[terminalOps] operação desconhecida: " + id;
};
module.exports = { perf, lockConflict, transfer, buy, sell, sellLot, saleAvailable, evaluatePurchase: purchaseCost.evaluate, cancel, tick, runHauler, operation, activeForRoom, txCost, stats, marketTransactionStats, terminalTransferStats, terminalNetworkStats };
