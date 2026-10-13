"use strict";
const model = require("../../src/utils/labPlanModel");
const { recipes, order, rawStock } = require("./recipes.cjs");
function simulate(plan, scenario, options) {
    return model.simulate(plan, { ...scenario, recipes, steps: order(scenario.product),
        stock: scenario.stock || rawStock(scenario.product, scenario.qty) }, options);
}
module.exports = { ...model, simulate };
