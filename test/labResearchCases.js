"use strict";

// The research engine uses local inventory, never the smoke's Game objects.
// baselinePlans temporarily installs config defaults and restores Memory.
module.exports = function labResearchCases(project, assert) {
    const path = require("path");
    const saved = global.Memory;
    try {
        require(path.join(project, "docs/lab-search/run.cjs")).selfTest();
        assert(global.Memory === saved, "0128: research checks preserve the live Memory stub");
        assert(true, "0128: offline lab model and search invariants");
    } catch (error) {
        assert(false, "0128: offline lab model and search invariants: " + error.stack);
    }
};
