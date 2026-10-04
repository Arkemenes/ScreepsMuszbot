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
        const reaction = labReactions
            .list(structure.room.name)
            .find((r) => labReactions.outputsOf(r).indexOf(structure.id) >= 0);
        if (!reaction) return;

        const input1 = Game.getObjectById(reaction.input1);
        const input2 = Game.getObjectById(reaction.input2);
        if (!input1 || !input2) return;
        if (structure.cooldown > 0) return;

        structure.runReaction(input1, input2);
    },
};

module.exports = lab;
