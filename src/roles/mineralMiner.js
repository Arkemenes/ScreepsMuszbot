// Sits on the mineral's container (architect.js already plants extractor +
// container next to it) and harvests - same "no CARRY, overflow auto-drops
// into the container underneath" mechanic roles/miner.js relies on for
// energy (ROADMAP 0051, Fase 1). Self-contained wanted()/spawn() - never
// routed through rooms/needs.js, since this never competes with any
// energy-economy role for the same resource (constitution §5).

const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const { takeCover } = require("../utils/combat");
const names = require("../utils/names");
const config = require("../utils/config");

// The mineral, its extractor (mining is impossible without one), and its
// container (architect.js's job to plant both - this role never builds).
function mineralSite(room) {
    const mineral = roomCache.minerals(room)[0];
    if (!mineral) return {};
    // from the per-tick cached structure lists - pos.findInRange ran a Room.find (+ filter) per call
    const extractor = roomCache.structuresNear(room, mineral.pos, STRUCTURE_EXTRACTOR, 0)[0];
    const container = roomCache.structuresNear(room, mineral.pos, STRUCTURE_CONTAINER, 1)[0];
    return { mineral, extractor, container };
}

// ROADMAP 0114: sized to deplete the deposit in roughly one life (units per
// creep = live * WORK / harvest cooldown), clamped - a bigger body only mines
// faster, it doesn't lower the energy per unit (~0.4), and past ~12 WORK a
// LOW/MODERATE deposit gains nothing (regen is the limit). Never CARRY: the
// overflow drops into the container underneath. MOVE ~ WORK/5 so it can
// actually walk to the seat.
function body(room, amount) {
    const live = config.get("mineralMiner.lifeBudget", 1400);
    const minWork = config.get("mineralMiner.minWork", 4);
    const maxWork = config.get("mineralMiner.maxWork", 12);
    const cooldown = typeof EXTRACTOR_COOLDOWN !== "undefined" ? EXTRACTOR_COOLDOWN : 5;
    let work = Math.ceil((cooldown * (amount || 0)) / live);
    work = Math.max(minWork, Math.min(maxWork, work));

    const cost = (w) => w * BODYPART_COST[WORK] + Math.max(1, Math.ceil(w / 5)) * BODYPART_COST[MOVE];
    while (work > 1 && cost(work) > room.energyCapacityAvailable) work--;

    const b = [];
    for (let i = 0; i < Math.max(1, Math.ceil(work / 5)); i++) b.push(MOVE);
    for (let i = 0; i < work; i++) b.push(WORK);
    return b;
}

const mineralMiner = {
    body,
    run(creep) {
        if (takeCover(creep)) return;

        const mineral = Game.getObjectById(creep.memory.target);
        if (!mineral) {
            creep.suicide();
            return;
        }

        const container = roomCache.structuresNear(creep.room, mineral.pos, STRUCTURE_CONTAINER, 1)[0];
        const seat = container ? container.pos : mineral.pos;

        if (!creep.pos.isEqualTo(seat)) {
            creep.moveTo(seat, { range: 0, reusePath: 10 });
            return;
        }

        if (mineral.mineralAmount <= 0) return; // depleted - wait for regen
        if (container && container.store.getFreeCapacity() === 0) return; // nowhere to put it

        creep.harvest(mineral);
    },

    wanted(room) {
        const { mineral, extractor, container } = mineralSite(room);
        if (!mineral || !extractor || !container) return 0;
        // ROADMAP 0114: below this a fresh creep idles most of its life for a
        // few units (200 left = 9% busy, 4.5 energy/unit; 2000 = 89%, 0.45).
        // A creep already on the deposit finishes it - this only gates a spawn.
        if (mineral.mineralAmount < config.get("mineralMiner.minAmount", 2000)) return 0;
        if (container.store.getFreeCapacity() === 0) return 0;
        return 1;
    },

    spawn(room) {
        if (room.energyAvailable < BODYPART_COST[WORK] + BODYPART_COST[MOVE]) {
            return false;
        }
        return census.count(room.name, "mineralMiner", 0) < this.wanted(room);
    },

    spawnData(room) {
        const { mineral } = mineralSite(room);
        return {
            name: names.generate("mineralMiner"),
            body: body(room, mineral && mineral.mineralAmount),
            memory: { role: "mineralMiner", target: mineral && mineral.id },
        };
    },
};

module.exports = mineralMiner;
