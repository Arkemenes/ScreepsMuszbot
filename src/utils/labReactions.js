"use strict";
// ROADMAP 0115: the lab reactions running in a room. A craft chain may run several at
// once (independent steps of the reaction tree, in labs of their own): those are
// Memory.rooms[r].labReactions, a list. A manual setLabReaction() (rooms/refining.js) and
// a single-step chain stay in the singular Memory.rooms[r].labReaction. Every consumer
// asks here instead of reading either field, so the two cases look the same to it.
//   reaction = { a, b, product, input1, input2, output, outputs?, keep? }

function list(roomName) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (!mem) return [];
    if (Array.isArray(mem.labReactions) && mem.labReactions.length) return mem.labReactions;
    return mem.labReaction ? [mem.labReaction] : [];
}

// ids of the labs that run (produce into) this reaction: the planned output, or the
// wide list when the reaction runs on several output labs
function outputsOf(reaction) {
    return reaction.outputs && reaction.outputs.length ? reaction.outputs : [reaction.output];
}

module.exports = { list, outputsOf };
