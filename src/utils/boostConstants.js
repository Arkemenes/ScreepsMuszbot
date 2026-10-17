"use strict";
// Read at the decision boundary; missing native data must remain unknown.
function current() {
    return {
        boosts: typeof BOOSTS === "undefined" ? null : BOOSTS,
        mineralPerPart: typeof LAB_BOOST_MINERAL === "undefined" ? null : LAB_BOOST_MINERAL,
        energyPerPart: typeof LAB_BOOST_ENERGY === "undefined" ? null : LAB_BOOST_ENERGY,
        toughType: typeof TOUGH === "undefined" ? null : TOUGH,
        workType: typeof WORK === "undefined" ? null : WORK,
        buildPower: typeof BUILD_POWER === "undefined" ? null : BUILD_POWER,
        repairPower: typeof REPAIR_POWER === "undefined" ? null : REPAIR_POWER,
        repairCost: typeof REPAIR_COST === "undefined" ? null : REPAIR_COST,
    };
}
module.exports = { current };
