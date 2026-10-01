// ROADMAP 0110: instant-arbitrage scanner. Finds a buy-order/sell-order pair
// for the same resourceType whose net profit (after the energy delivery fee,
// priced off the SAME scan's order book, never market.js's cached
// fairPrice) clears marketFlip.minProfitRatio, then either just logs it
// (marketFlip.test, default true) or opens it via terminalOps.buy()/sell()
// - never touches terminalOps.js itself.
const config = require("./config");
const marketPrices = require("./market");
const terminalOps = require("./terminalOps");

const FINAL_STATES = ["completed", "failed", "cancelled"];
let lastScanTick = null;

function memory() {
    if (!Memory.marketFlip) {
        Memory.marketFlip = {
            lastScanTick: null,
            committedCredits: 0,
            active: {},
            lastOpportunities: [],
            stats: { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 },
        };
    }
    const mem = Memory.marketFlip;
    if (!mem.active) mem.active = {};
    if (!mem.lastOpportunities) mem.lastOpportunities = [];
    if (!mem.stats) mem.stats = { completed: 0, netProfit: 0, cancelled: 0, guardrailBlocked: 0 };
    if (typeof mem.committedCredits !== "number") mem.committedCredits = 0;
    return mem;
}

// Same marketOnly detection as terminalOps.js (kept local instead of shared -
// terminalOps.js is out of scope for this feature, see spec's "Out of scope").
function marketOnlyResource(type) {
    const names = ["pixel", "accessKey", "access_key", "cpuUnlock", "cpu_unlock"];
    const constants = [
        typeof RESOURCE_PIXEL !== "undefined" ? RESOURCE_PIXEL : null,
        typeof RESOURCE_ACCESS_KEY !== "undefined" ? RESOURCE_ACCESS_KEY : null,
        typeof RESOURCE_CPU_UNLOCK !== "undefined" ? RESOURCE_CPU_UNLOCK : null,
    ];
    return names.indexOf(type) >= 0 || constants.indexOf(type) >= 0;
}
function orderAmount(order) {
    return (order && (typeof order.remainingAmount === "number" ? order.remainingAmount : order.amount)) || 0;
}
// A single top-of-book order per side - never aggregates several orders at
// the same price into one virtual level - so each leg is already scoped to
// exactly one orderId/price with no book-walking needed.
function bestOrder(orders, type, descending) {
    const eligible = (Array.isArray(orders) ? orders : [])
        .filter((order) => order && (order.type === type || order.orderType === type) && order.price > 0 && orderAmount(order) > 0)
        .sort((a, b) => (descending ? b.price - a.price : a.price - b.price));
    return eligible[0] || null;
}
function txCost(value, from, to) {
    return Game.market && typeof Game.market.calcTransactionCost === "function" ? Game.market.calcTransactionCost(value, from, to) : 0;
}
function energyAskPrice(grouped) {
    const order = bestOrder(grouped[RESOURCE_ENERGY], typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell", false);
    return order ? order.price : null;
}
// First owned room (deterministic order) that can actually execute the leg
// and, when busyRooms is given, isn't already running another flip - so
// different rooms can flip in parallel (pedido do usuário, 2026-09-30) while
// a single terminal never juggles two flips at once. marketOnly resources
// (pixel/accessKey/cpuUnlock) only need an owned controller, physical
// resources need storage+terminal too (same requirement terminalOps.buy()/
// sell() itself enforces).
function pickRoom(marketOnly, busyRooms) {
    const names = Object.keys(Game.rooms || {}).sort();
    for (const name of names) {
        if (busyRooms && busyRooms[name]) continue;
        const room = Game.rooms[name];
        if (!room || !room.controller || !room.controller.my) continue;
        if (marketOnly || (room.storage && room.terminal)) return room;
    }
    return null;
}
// No fairPrice data at all is treated as a violation - the guardrail's job
// is to refuse trading against a resourceType nobody has any read on yet.
// Pedido do usuário, 2026-09-29: não exige mais confidence:"ready" (só o
// ratio contra fairPrice, mesmo com a janela temporal ainda "warming").
function guardrailBlocks(resourceType, buyPrice) {
    const snapshot = marketPrices.snapshot();
    const data = snapshot && snapshot.resources && snapshot.resources[resourceType];
    if (!data || typeof data.fairPrice !== "number") return true;
    return buyPrice > data.fairPrice * config.get("marketFlip.guardrailFairPriceRatio", 1.05);
}
function evaluateResourceType(resourceType, grouped, energyPrice) {
    const sellType = typeof ORDER_SELL !== "undefined" ? ORDER_SELL : "sell";
    const buyType = typeof ORDER_BUY !== "undefined" ? ORDER_BUY : "buy";
    const sellOrder = bestOrder(grouped[resourceType], sellType, false); // what we'd BUY against
    const buyOrder = bestOrder(grouped[resourceType], buyType, true); // what we'd SELL against
    if (!sellOrder || !buyOrder) return null;
    const buyPrice = sellOrder.price, sellPrice = buyOrder.price;
    if (!(sellPrice > buyPrice)) return null;
    const quantity = Math.min(orderAmount(sellOrder), orderAmount(buyOrder));
    if (quantity <= 0) return null;
    const marketOnly = marketOnlyResource(resourceType);
    let energyFeeCredits = 0;
    if (!marketOnly) {
        const room = pickRoom(false);
        if (!room) return null;
        const feeUnits = txCost(quantity, room.name, sellOrder.roomName) + txCost(quantity, room.name, buyOrder.roomName);
        energyFeeCredits = feeUnits * (energyPrice || 0);
    }
    const cost = buyPrice * quantity;
    const netProfit = (sellPrice - buyPrice) * quantity - energyFeeCredits;
    return {
        resourceType, buyPrice, sellPrice, quantity, marketOnly, cost,
        netProfit, netProfitRatio: cost > 0 ? netProfit / cost : 0,
        wouldBlockGuardrail: guardrailBlocks(resourceType, buyPrice),
    };
}
// Which rooms already have an active flip - a single terminal never runs
// two at once (pedido do usuário, 2026-09-30), but different terminals can,
// as long as they're on different resourceTypes (exclusividade por
// resourceType acima já garante isso: duas salas nunca compram o mesmo
// recurso ao mesmo tempo e disputam a mesma venda).
function busyRooms(mem) {
    const busy = {};
    Object.keys(mem.active).forEach((resourceType) => {
        const room = mem.active[resourceType].room;
        if (room) busy[room] = true;
    });
    return busy;
}
function openFlip(candidate, quantity, expectedNetProfit) {
    const mem = memory();
    const room = pickRoom(candidate.marketOnly, busyRooms(mem));
    if (!room) return false; // toda sala elegível já está ocupada com outro flip
    // createListing:false - explícito, pedido do usuário, 2026-09-29: um
    // flip é só instantâneo, nunca deixa uma ordem pública parada esperando.
    // skipFeeCap:true - o flip já avalia a taxa de entrega como parte do
    // próprio netProfit/minProfitRatio (pedido do usuário, 2026-09-30).
    const response = terminalOps.buy(room.name, candidate.resourceType, quantity, candidate.buyPrice, false, true);
    if (!response.ok) return false;
    const reserved = quantity * candidate.buyPrice;
    mem.committedCredits += reserved;
    mem.active[candidate.resourceType] = {
        resourceType: candidate.resourceType, room: room.name, state: "buying",
        buyOpId: response.id, sellOpId: null,
        quantity, buyPrice: candidate.buyPrice, sellPrice: candidate.sellPrice,
        reservedCredits: reserved, expectedNetProfit, openedTick: Game.time,
    };
    return true;
}
function scan() {
    const interval = Math.max(1, Number(config.get("marketFlip.scanInterval", 60)) || 60);
    if (lastScanTick !== null && Game.time - lastScanTick < interval) return;
    lastScanTick = Game.time;
    const mem = memory();
    mem.lastScanTick = Game.time;
    const market = typeof Game !== "undefined" && Game.market;
    let orders = [];
    if (market && typeof market.getAllOrders === "function") {
        try { orders = market.getAllOrders() || []; } catch (error) { orders = []; }
    }
    // Only resourceTypes actually present in the book can ever form a pair -
    // this already covers "every resourceType, including commodities and
    // marketOnly" without walking the full RESOURCES_ALL list every scan.
    const grouped = marketPrices.groupOrders(orders);
    const energyPrice = energyAskPrice(grouped);
    const minProfitRatio = config.get("marketFlip.minProfitRatio", 0.01);
    const maxRatio = config.get("marketFlip.maxCreditRatioPerFlip", 0.05);
    const testMode = config.get("marketFlip.test", true);
    const candidates = Object.keys(grouped)
        .map((resourceType) => evaluateResourceType(resourceType, grouped, energyPrice))
        .filter((candidate) => candidate && candidate.netProfitRatio >= minProfitRatio)
        .sort((a, b) => b.netProfitRatio - a.netProfitRatio);
    const opportunities = [];
    let availableCredits = market && typeof market.credits === "number" ? market.credits - mem.committedCredits : 0;
    candidates.forEach((candidate) => {
        const opportunity = {
            resourceType: candidate.resourceType, buyPrice: candidate.buyPrice, sellPrice: candidate.sellPrice,
            quantity: 0, netProfit: 0, netProfitRatio: candidate.netProfitRatio,
            wouldBlockGuardrail: candidate.wouldBlockGuardrail, executed: false,
        };
        opportunities.push(opportunity);
        if (candidate.wouldBlockGuardrail) mem.stats.guardrailBlocked++;
        if (mem.active[candidate.resourceType] || candidate.wouldBlockGuardrail) return;
        // Ranked most-to-least profitable, each candidate's cap is taken
        // against whatever's LEFT after the previous candidates in this same
        // scan reserved theirs - never against the tick's original balance.
        const cap = Math.max(0, availableCredits) * maxRatio;
        const quantity = Math.min(candidate.quantity, candidate.buyPrice > 0 ? Math.floor(cap / candidate.buyPrice) : 0);
        if (quantity <= 0) return;
        const ratio = quantity / candidate.quantity;
        const netProfit = candidate.netProfit * ratio;
        opportunity.quantity = quantity;
        opportunity.netProfit = netProfit;
        availableCredits -= quantity * candidate.buyPrice;
        if (!testMode && openFlip(candidate, quantity, netProfit)) opportunity.executed = true;
    });
    mem.lastOpportunities = opportunities;
}
function releaseFlip(resourceType, cancelled) {
    const mem = memory();
    const entry = mem.active[resourceType];
    if (!entry) return;
    mem.committedCredits = Math.max(0, mem.committedCredits - entry.reservedCredits);
    if (cancelled) mem.stats.cancelled++;
    else { mem.stats.completed++; mem.stats.netProfit += entry.expectedNetProfit; }
    delete mem.active[resourceType];
}
function cancelFlip(resourceType) {
    const entry = memory().active[resourceType];
    if (!entry) return;
    const opId = entry.sellOpId || entry.buyOpId;
    const op = opId && terminalOps.operation(opId);
    if (op && FINAL_STATES.indexOf(op.state) < 0) terminalOps.cancel(opId);
    releaseFlip(resourceType, true);
}
function advanceFlips() {
    const mem = memory();
    const maxHolding = config.get("marketFlip.maxHoldingTicks", 1500);
    const maxBuyWait = config.get("marketFlip.maxBuyWaitTicks", 15);
    Object.keys(mem.active).forEach((resourceType) => {
        const entry = mem.active[resourceType];
        const elapsed = Game.time - entry.openedTick;
        if (elapsed >= maxHolding) { cancelFlip(resourceType); return; }
        if (entry.state === "buying") {
            const buyOp = terminalOps.operation(entry.buyOpId);
            if (!buyOp || buyOp.state === "failed" || buyOp.state === "cancelled") { cancelFlip(resourceType); return; }
            if (buyOp.state !== "completed") {
                // Flip é pra ser instantâneo, não uma ordem de espera - se
                // nada foi negociado ainda depois de maxBuyWaitTicks
                // (pedido do usuário, 2026-09-30: viu um buy limit ficar
                // retentando por muitos ticks depois que o preço subiu -
                // não faz sentido esperar o mercado "voltar"), desiste e
                // cancela a compra, sem esperar o stall guard geral
                // (maxHoldingTicks). Uma vez que algo já foi negociado
                // (dealtAmount > 0), vale a pena esperar o resto pelo
                // orçamento normal - já há lucro real em jogo.
                if (!(buyOp.dealtAmount > 0) && elapsed >= maxBuyWait) cancelFlip(resourceType);
                return;
            }
            // createListing:false pode fechar "completed" tendo negociado só
            // parte de entry.quantity (livro esgotou antes) - vende o que
            // realmente foi comprado, nunca o plano original.
            const dealt = Math.max(0, Math.min(entry.quantity, buyOp.dealtAmount || 0));
            if (dealt <= 0) { cancelFlip(resourceType); return; } // nada foi comprado - nada pra vender
            // Vende pela MESMA sala que comprou - entry.room, nunca um
            // pickRoom() novo: o estoque comprado está no storage daquela
            // sala específica, e com salas em paralelo (2026-09-30) uma
            // re-seleção poderia escolher outra sala sem o material.
            const response = terminalOps.sell(entry.room, resourceType, dealt, entry.sellPrice, false, true); // skipFeeCap:true, mesmo motivo do buy() acima
            if (!response.ok) return; // retry next tick, within the same maxHoldingTicks budget
            if (dealt < entry.quantity) {
                const ratio = dealt / entry.quantity;
                mem.committedCredits = Math.max(0, mem.committedCredits - entry.reservedCredits * (1 - ratio));
                entry.reservedCredits *= ratio;
                entry.expectedNetProfit *= ratio;
                entry.quantity = dealt;
            }
            entry.sellOpId = response.id;
            entry.state = "selling";
            return;
        }
        const sellOp = terminalOps.operation(entry.sellOpId);
        if (!sellOp || sellOp.state === "failed" || sellOp.state === "cancelled") { cancelFlip(resourceType); return; }
        if (sellOp.state === "completed") releaseFlip(resourceType, false);
    });
}
function tick() {
    advanceFlips();
    scan();
}
global.marketFlipStatus = () => JSON.stringify({
    mode: config.get("marketFlip.test", true) ? "test" : "live",
    lastScanTick: memory().lastScanTick,
    opportunities: memory().lastOpportunities,
    active: Object.keys(memory().active).map((resourceType) => memory().active[resourceType]),
}, null, 2);
global.marketFlipStats = () => JSON.stringify(memory().stats, null, 2);
module.exports = { tick };
