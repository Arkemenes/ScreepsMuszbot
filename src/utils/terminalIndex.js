// Membership only: quantities, owners, intents and states are always read live.
let source, tick, nextId, candidates = [];
const active = (op) => op && !["completed", "cancelled", "failed"].includes(op.state);
function all() {
    const mem = Memory.terminalOps || {}, ops = mem.operations;
    if (source !== ops || tick !== Game.time || nextId !== mem.nextId) {
        source = ops; tick = Game.time; nextId = mem.nextId;
        candidates = Object.keys(ops || {}).filter((id) => active(ops[id]));
    }
    return candidates.map((id) => ops[id]).filter(active);
}
function forRoom(name) { return all().filter((op) => op.sourceRoom === name || op.targetRoom === name); }
module.exports = { all, forRoom };
