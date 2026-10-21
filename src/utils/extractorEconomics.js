"use strict";
// ROADMAP 0164 (ARK-199): is mining this room's mineral worth the energy its team costs?
//
//   W = Y - K
//   Y = p x R          p = remaining deposit, R = mineral fairPrice; with own use anywhere
//                      (resourcePolicy.used - labs / stock targets) R = max(fair, ask): the
//                      purchase it avoids
//   K = T x a          a = energy fairPrice
//   T = A x (miner + marginal x hauler)
//                      miner = roles/mineralMiner body for the deposit, A = full lives to deplete it
//                      (WORK x mineralMiner.lifeBudget / EXTRACTOR_COOLDOWN per life), marginal =
//                      haulers the hauler.minCountWithMineral floor adds over what the room would
//                      run anyway (rooms/needs, heap; a hauler kept for minerals also hauls energy)
//
// admitted(room) caches the verdict in Memory.rooms[r].extractorEconomics and recomputes it every
// extractorEconomics.checkTicks (1000) or when the mineral changes. Without a price the previous
// verdict stands; with none, the room is admitted (legacy) with reason "price-unknown". Never
// calls roomNeeds (needs asks this module while computing).
const config = require("./config");
const roomCache = require("./roomCache");
const market = require("./market");
const resourcePolicy = require("./resourcePolicy");

function bodyCost(body) {
    let n = 0;
    for (const part of body) n += BODYPART_COST[part] || 0;
    return n;
}

// roles/hauler's [CARRY, CARRY, MOVE] scaled as utils/population.scaledBody does for a stable
// room - computed here because scaledBody's stability check reads roomNeeds (recursion)
function haulerBodyCost(room) {
    const unit = BODYPART_COST[CARRY] * 2 + BODYPART_COST[MOVE];
    const times = Math.max(1, Math.min(Math.floor((room.energyCapacityAvailable || 0) / unit), Math.floor(50 / 3)));
    return times * unit;
}

function fair(resources, type) {
    const r = resources && resources[type];
    return r && typeof r.fairPrice === "number" && isFinite(r.fairPrice) && r.fairPrice > 0 ? r.fairPrice : null;
}

function ownUse(mineralType) {
    for (const room of Game.myRooms || []) {
        if (resourcePolicy.used(room, mineralType)) return true;
    }
    return false;
}

// the numbers behind the verdict; null without a deposit
function evaluate(room) {
    const mineral = roomCache.minerals(room)[0];
    if (!mineral) return null;
    const amount = mineral.mineralAmount || 0;
    const body = require("../roles/mineralMiner").body(room, amount);
    const work = body.filter((p) => p === WORK).length;
    const cooldown = typeof EXTRACTOR_COOLDOWN !== "undefined" ? EXTRACTOR_COOLDOWN : 5;
    const perLife = (work * config.get("mineralMiner.lifeBudget", 1400)) / cooldown;
    const lives = amount > 0 && perLife > 0 ? Math.ceil(amount / perLife) : 0;
    const marginal = require("../rooms/needs").mineralHaulerMarginal(room);
    const haulerCost = haulerBodyCost(room);
    const energy = lives * (bodyCost(body) + marginal * haulerCost);

    const snap = market.snapshot();
    const resources = snap && snap.resources;
    const energyPrice = fair(resources, RESOURCE_ENERGY);
    const mineralFair = fair(resources, mineral.mineralType);
    const used = ownUse(mineral.mineralType);
    const ask = resources && resources[mineral.mineralType] && resources[mineral.mineralType].sellPrice;
    const price = mineralFair === null ? null : used && ask > mineralFair ? ask : mineralFair;
    const out = { mineral: mineral.mineralType, amount, work, lives, marginal, energy, ownUse: used, price, energyPrice };
    if (price === null || energyPrice === null) return Object.assign(out, { priced: false });
    const revenue = amount * price, cost = energy * energyPrice;
    return Object.assign(out, { priced: true, revenue, cost, profit: revenue - cost,
        breakeven: amount > 0 ? cost / amount : null, deficit: Math.max(0, cost - revenue) });
}

function round(v, d) { return v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d; }

// true when a new mineralMiner may be spawned in this room
function admitted(room) {
    if (config.get("extractorEconomics.enabled", true) === false) return true;
    const mineral = roomCache.minerals(room)[0];
    if (!mineral) return false;
    const mem = Memory.rooms[room.name] || (Memory.rooms[room.name] = {});
    const prev = mem.extractorEconomics;
    if (prev && prev.mineral === mineral.mineralType && Game.time < prev.nextCheckTick && Game.time >= prev.tick) return prev.admitted;
    const e = evaluate(room);
    const next = Game.time + Number(config.get("extractorEconomics.checkTicks", 1000));
    let verdict;
    if (!e.priced) {
        verdict = prev && prev.mineral === mineral.mineralType && prev.reason !== "price-unknown"
            ? Object.assign({}, prev, { tick: Game.time, nextCheckTick: next, stale: true })
            : { admitted: true, reason: "price-unknown", mineral: e.mineral, tick: Game.time, nextCheckTick: next };
    } else {
        const ok = e.profit > Number(config.get("extractorEconomics.minProfit", 0));
        verdict = { admitted: ok, reason: ok ? "profitable" : "unprofitable", mineral: e.mineral, tick: Game.time, nextCheckTick: next,
            profit: Math.round(e.profit), breakeven: round(e.breakeven, 2), price: round(e.price, 2), energyPrice: round(e.energyPrice, 2),
            deficit: Math.round(e.deficit), energy: e.energy, ownUse: e.ownUse };
    }
    if (!prev || prev.admitted !== verdict.admitted || prev.reason !== verdict.reason || prev.mineral !== verdict.mineral) {
        console.log("[ExtractorEconomics] " + room.name + " " + line(verdict, e));
    }
    mem.extractorEconomics = verdict;
    return verdict.admitted;
}

function line(v, e) {
    if (v.reason === "price-unknown" || !e || !e.priced) return v.mineral + ": " + (v.admitted ? "admitido" : "bloqueado") + " (" + v.reason + (v.stale ? ", veredito anterior" : "") + ")";
    return v.mineral + " " + e.amount + "un: " + (v.admitted ? "lucrativo" : "não lucrativo") + ", R " + v.price + " cr/un" +
        (e.ownUse ? " (uso próprio)" : "") + " vs equilíbrio " + v.breakeven + " cr/un (" + e.energy + " energia × " + v.energyPrice +
        ", " + e.lives + " vida(s), hauler marginal " + e.marginal + "); lucro " + v.profit + (v.deficit ? ", déficit " + v.deficit : "");
}

function summary(roomName) {
    const v = Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].extractorEconomics;
    if (!v) return null;
    return { admitted: v.admitted ? 1 : 0, reason: v.reason, mineral: v.mineral, profit: v.profit === undefined ? null : v.profit,
        breakeven: v.breakeven === undefined ? null : v.breakeven, price: v.price === undefined ? null : v.price };
}

global.extractorEconomics = function (roomName) {
    const rooms = roomName ? [Game.rooms[roomName]].filter(Boolean) : Game.myRooms || [];
    return rooms.map((room) => {
        const e = evaluate(room);
        if (!e) return "[ExtractorEconomics] " + room.name + ": sem mineral";
        const v = Memory.rooms[room.name] && Memory.rooms[room.name].extractorEconomics;
        const now = e.priced ? { admitted: e.profit > 0, reason: "-", price: round(e.price, 2), breakeven: round(e.breakeven, 2),
            energyPrice: round(e.energyPrice, 2), profit: Math.round(e.profit), deficit: Math.round(e.deficit), mineral: e.mineral } : { admitted: true, reason: "price-unknown", mineral: e.mineral };
        return "[ExtractorEconomics] " + room.name + " agora " + line(now, e) + (v ? "; veredito em vigor: " + v.reason + " até t" + v.nextCheckTick : "");
    }).join("\n") || "[ExtractorEconomics] sem salas";
};

module.exports = { evaluate, admitted, summary };
