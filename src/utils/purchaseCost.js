// One purchase evaluation for execution, swing quotes and diagnostics.
const config = require("./config");
function evaluate(op, price, quantity, freight, energyPrice) {
    const netAmount = op.resourceType === RESOURCE_ENERGY ? quantity - freight : quantity;
    const fee = quantity > 0 ? freight * energyPrice / quantity : Infinity;
    const sunk = Math.max(0, op.cancelledListingFees || 0);
    const effective = netAmount > 0 ? (price * quantity + sunk +
        (op.resourceType === RESOURCE_ENERGY ? 0 : freight * energyPrice)) / netAmount : Infinity;
    const freightShare = op.resourceType === RESOURCE_ENERGY ? freight / Math.max(1, quantity) : fee / Math.max(Number.EPSILON, price + fee);
    const cap = op.maxBuyFreightShare === undefined ? config.get("terminalOps.maxBuyFreightShare", null) : op.maxBuyFreightShare;
    const reason = !(quantity > 0) || !(netAmount > 0) ? "nonpositive-net-amount" : effective > op.limit ? "effective-price-limit" :
        typeof cap === "number" && freightShare > cap ? "freight-share-limit" : null;
    return { ok: !reason, reason, quantity, netAmount, cost: freight, fee, effective, freightShare, maxBuyFreightShare: cap, sunkFees: sunk, limit: op.limit };
}
module.exports = { evaluate };
