// Runs the reaction rooms/refining.js's setLabReaction() configured
// (ROADMAP 0051 Fase 2). Only the OUTPUT lab acts - the two input labs'
// run() calls are no-ops (id check below) so the reaction is computed
// exactly once per room per tick, same dispatch pattern as tower.js/link.js.
// REACTIONS is never hardcoded here - it's a genuine Screeps-provided
// global constant, read live.

const lab = {
    run(structure) {
        const mem = Memory.rooms[structure.room.name];
        const reaction = mem && mem.labReaction;
        if (!reaction || structure.id !== reaction.output) return;

        const input1 = Game.getObjectById(reaction.input1);
        const input2 = Game.getObjectById(reaction.input2);
        if (!input1 || !input2) return;
        if (structure.cooldown > 0) return;

        structure.runReaction(input1, input2);
    },
};

module.exports = lab;
