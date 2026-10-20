// Freight quotes only: this module never sends cargo or writes Memory.
const config = require("./config");
const terminalPowerCost = require("./terminalPowerCost");

function roomName(value) {
    return typeof value === "string" && /^[WE]\d+[NS]\d+$/i.test(value) ? value.toUpperCase() : null;
}
function multiplier(room) {
    return terminalPowerCost.multiplier(typeof Game !== "undefined" && Game.rooms && Game.rooms[room] && Game.rooms[room].terminal);
}

// amount is the quantity wanted AT THE DESTINATION, including for energy.
// An injected cost function makes the economic model testable offline.
function quote(from, to, resourceType, amount, options) {
    const opts = options || {};
    const source = roomName(from), target = roomName(to);
    const hub = roomName(opts.hub === undefined ? config.get("terminalRelay.hub") : opts.hub);
    const fundingRoom = roomName(opts.fundingRoom === undefined ? from : opts.fundingRoom);
    const hubMultiplier = config.get("terminalRelay.freightMultiplier");
    const messageEnergy = config.get("terminalRelay.messageEnergy");
    const minSavingsEnergy = opts.minSavingsEnergy === undefined ? config.get("terminalRelay.minSavingsEnergy") : opts.minSavingsEnergy;
    const minSavingsRatio = opts.minSavingsRatio === undefined ? config.get("terminalRelay.minSavingsRatio") : opts.minSavingsRatio;
    const sourceMultiplier = opts.sourceMultiplier === undefined ? multiplier(source) : opts.sourceMultiplier;
    const fundingMultiplier = opts.fundingMultiplier === undefined ? (fundingRoom === source ? sourceMultiplier : multiplier(fundingRoom)) : opts.fundingMultiplier;
    const cost = opts.calcTransactionCost || (typeof Game !== "undefined" && Game.market && typeof Game.market.calcTransactionCost === "function" && Game.market.calcTransactionCost.bind(Game.market));
    const energy = resourceType === "energy";
    if (!source || !target || source === target || !hub || !fundingRoom ||
        !Number.isSafeInteger(amount) || amount <= 0 || typeof resourceType !== "string" || !resourceType ||
        ["pixel", "cpuUnlock", "accessKey", "token"].includes(resourceType) ||
        (typeof RESOURCES_ALL !== "undefined" && !RESOURCES_ALL.includes(resourceType)) ||
        typeof cost !== "function" || !Number.isSafeInteger(messageEnergy) || messageEnergy < 0 ||
        !Number.isFinite(minSavingsEnergy) || minSavingsEnergy < 0 ||
        !Number.isFinite(minSavingsRatio) || minSavingsRatio < 0 || minSavingsRatio > 1 ||
        [hubMultiplier, sourceMultiplier, fundingMultiplier].some((value) => !Number.isFinite(value) || value <= 0 || value > 1)) {
        return { ok: false, route: "direct", reason: "invalid-quote-input" };
    }
    try {
        function freight(value, origin, destination, factor) {
            const raw = cost(value, origin, destination);
            if (!Number.isSafeInteger(raw) || raw < 0) throw new Error("invalid freight");
            return terminalPowerCost.debit(raw, factor);
        }
        const directFreight = freight(amount, source, target, sourceMultiplier);
        const hubFreight = freight(amount, hub, target, hubMultiplier);
        const fundingAmount = hubFreight + messageEnergy;
        const cargoAmount = amount + (energy ? fundingAmount : 0);
        if (!Number.isSafeInteger(cargoAmount)) throw new Error("unsafe cargo amount");
        const originFreight = freight(cargoAmount, source, hub, sourceMultiplier);
        const fundingFreight = energy ? 0 : freight(fundingAmount, fundingRoom, hub, fundingMultiplier);
        const relayFreight = originFreight + fundingAmount + fundingFreight;
        const directTotal = directFreight + (energy ? amount : 0);
        const relayTotal = relayFreight + (energy ? amount : 0);
        if (![directTotal, relayTotal].every(Number.isSafeInteger)) throw new Error("unsafe energy cost");
        const savingsEnergy = directFreight - relayFreight;
        const savingsRatio = directFreight > 0 ? savingsEnergy / directFreight : 0;
        const economic = savingsEnergy > 0 && savingsEnergy >= minSavingsEnergy && savingsRatio >= minSavingsRatio;
        const eligible = source !== hub && target !== hub && fundingRoom !== hub;
        const enabled = opts.relayAvailable === undefined ? config.get("terminalRelay.enabled") : opts.relayAvailable;
        const critical = opts.urgent === true || opts.critical === true || opts.urgency === "critical";
        const reason = critical ? (opts.urgent === true ? "urgent-direct" : "critical-direct") : !enabled ? "relay-unavailable" : !eligible ? "hub-endpoint" : !economic ? "insufficient-savings" : "relay-saves-energy";
        return {
            ok: true, route: reason === "relay-saves-energy" ? "relay" : "direct", reason,
            sourceRoom: source, targetRoom: target, hub, fundingRoom, resourceType, amount,
            economic, savingsEnergy, savingsRatio,
            direct: { cargoAmount: amount, freight: directFreight, totalEnergy: directTotal },
            relay: { cargoAmount, deliveredAmount: amount, fundingAmount: energy ? 0 : fundingAmount,
                originFreight, fundingFreight, hubFreight, messageEnergy, freight: relayFreight, totalEnergy: relayTotal },
        };
    } catch (error) {
        return { ok: false, route: "direct", reason: "quote-cost-unavailable" };
    }
}

module.exports = { quote };
