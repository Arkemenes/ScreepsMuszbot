// 2026-10-21 (user decision): a room keeps logistics.balanceReserve (10k) before it may send energy
// to another room - it used to be 1% of storage + 10% of terminal capacity (40k).
module.exports = function (project, assert) {
    const path = require("path");
    const saved = { memory: global.Memory };
    const tiers = require(path.join(project, "src/utils/resourceTiers"));
    const original = tiers.getEconomyState;
    try {
        global.Memory = { settings: {}, rooms: {} };
        tiers.getEconomyState = () => "stable";
        const bal = require(path.join(project, "src/rooms/energyBalancing"));
        const struct = (energy, cap) => ({ store: { energy, getCapacity: () => cap } });
        const room = { name: "R", storage: struct(38000, 1000000), terminal: struct(390, 300000) };
        let s = bal.snapshot(room);
        assert(s.reserve === 10000 && s.excess === 28390, "energy balancing: a room keeps 10k (balanceReserve) and may send the rest (got " + JSON.stringify({ r: s.reserve, e: s.excess }) + ")");
        Memory.settings.logistics = { balanceReserve: null };
        s = bal.snapshot(room);
        assert(s.reserve === 40000 && s.excess === 0, "energy balancing: balanceReserve null restores the old 1% storage + 10% terminal reserve (40k)");
    } finally {
        tiers.getEconomyState = original;
        global.Memory = saved.memory;
    }
};
