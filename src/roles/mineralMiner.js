// Sits on the mineral's container (architect.js already plants extractor +
// container next to it) and harvests - same "no CARRY, overflow auto-drops
// into the container underneath" mechanic roles/miner.js relies on for
// energy (ROADMAP 0051, Fase 1). Self-contained wanted()/spawn() - never
// routed through rooms/needs.js, since this never competes with any
// energy-economy role for the same resource (constitution §5).

const census = require("../utils/census");
const { takeCover } = require("../utils/combat");
const names = require("../utils/names");

// The mineral, its extractor (mining is impossible without one), and its
// container (architect.js's job to plant both - this role never builds).
function mineralSite(room) {
    const mineral = room.find(FIND_MINERALS)[0];
    if (!mineral) return {};
    const extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, {
        filter: (s) => s.structureType === STRUCTURE_EXTRACTOR,
    })[0];
    const container = mineral.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    })[0];
    return { mineral, extractor, container };
}

// As many WORK as the room can afford right now, capped - a mineral doesn't
// need the aggressive body scaling roles/miner.js does for a source (no
// replacement-timing race, regeneration is slow enough that one extra tick
// of downtime is irrelevant).
function body(room) {
    const workCost = BODYPART_COST[WORK];
    const moveCost = BODYPART_COST[MOVE];
    const affordable = Math.floor(
        (room.energyCapacityAvailable - moveCost) / workCost
    );
    const n = Math.max(1, Math.min(8, affordable || 1));
    const b = [MOVE];
    for (let i = 0; i < n; i++) b.push(WORK);
    return b;
}

const mineralMiner = {
    run(creep) {
        if (takeCover(creep)) return;

        const mineral = Game.getObjectById(creep.memory.target);
        if (!mineral) {
            creep.suicide();
            return;
        }

        const container = mineral.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER,
        })[0];
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
        if (mineral.mineralAmount <= 0) return 0;
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
            body: body(room),
            memory: { role: "mineralMiner", target: mineral && mineral.id },
        };
    },
};

module.exports = mineralMiner;
