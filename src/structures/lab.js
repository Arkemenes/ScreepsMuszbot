// Runs the reaction rooms/refining.js's setLabReaction() configured
// (ROADMAP 0051 Fase 2). Only the OUTPUT lab acts - the two input labs'
// run() calls are no-ops (id check below) so the reaction is computed
// exactly once per room per tick, same dispatch pattern as tower.js/link.js.
// REACTIONS is never hardcoded here - it's a genuine Screeps-provided
// global constant, read live.

const labReactions = require("../utils/labReactions");

const lab = {
    run(structure) {
        // ROADMAP 0111: a "wide" reaction lists several output labs (reaction.outputs);
        // each reacts on its own cooldown. ROADMAP 0115: a room may run several reactions
        // at once, each in labs of its own - this lab acts for the one it is an output of.
        labReactions.execute(structure);
    },
};

module.exports = lab;
