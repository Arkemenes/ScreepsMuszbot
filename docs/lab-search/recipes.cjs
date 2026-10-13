"use strict";

// Screeps common/lib/constants.js, verified 2026-10-11. No powers or boosts.
const cooldowns = { OH: 20, ZK: 5, UL: 5, G: 5, UH: 10, UH2O: 5, XUH2O: 60,
    UO: 10, UHO2: 5, XUHO2: 60, KH: 10, KH2O: 5, XKH2O: 60, KO: 10, KHO2: 5,
    XKHO2: 60, LH: 15, LH2O: 10, XLH2O: 65, LO: 10, LHO2: 5, XLHO2: 60,
    ZH: 20, ZH2O: 40, XZH2O: 160, ZO: 10, ZHO2: 5, XZHO2: 60, GH: 10,
    GH2O: 15, XGH2O: 80, GO: 10, GHO2: 30, XGHO2: 150 };
const inputs = { OH: ["H", "O"], ZK: ["Z", "K"], UL: ["U", "L"], G: ["ZK", "UL"] };
for (const mineral of ["U", "K", "L", "Z", "G"]) {
    inputs[mineral + "H"] = [mineral, "H"];
    inputs[mineral + "O"] = [mineral, "O"];
    inputs[mineral + "H2O"] = [mineral + "H", "OH"];
    inputs[mineral + "HO2"] = [mineral + "O", "OH"];
    inputs["X" + mineral + "H2O"] = [mineral + "H2O", "X"];
    inputs["X" + mineral + "HO2"] = [mineral + "HO2", "X"];
}
const recipes = Object.fromEntries(Object.entries(inputs).map(([p, reagents]) => [p, { inputs: reagents, cooldown: cooldowns[p] }]));
const products = ["XUH2O", "XUHO2", "XKH2O", "XKHO2", "XLH2O", "XLHO2", "XZH2O", "XZHO2", "XGH2O", "XGHO2"];
function order(product) {
    const result = [];
    function visit(p) {
        if (!recipes[p] || result.includes(p)) return;
        recipes[p].inputs.forEach(visit); result.push(p);
    }
    visit(product); return result;
}
function tree(product) { return { product, inputs: recipes[product].inputs.map((p) => recipes[p] ? tree(p) : p) }; }
function rawStock(product, qty) {
    const stock = {};
    function visit(p, amount) {
        if (recipes[p]) recipes[p].inputs.forEach((r) => visit(r, amount));
        else stock[p] = (stock[p] || 0) + amount;
    }
    visit(product, qty); return stock;
}
function composition(product) { return rawStock(product, 1); }
module.exports = { recipes, products, order, tree, rawStock, composition };
