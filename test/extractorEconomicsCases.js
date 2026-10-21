// ROADMAP 0164 (ARK-199): mineral extractor admission by net profit W = Y - K.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src", n);
    const saved = { game: global.Game, memory: global.Memory };
    const roomCache = require(src("utils/roomCache"));
    const market = require(src("utils/market"));
    const policy = require(src("utils/resourcePolicy"));
    const needs = require(src("rooms/needs"));
    const census = require(src("utils/census"));
    const original = { minerals: roomCache.minerals, near: roomCache.structuresNear, snapshot: market.snapshot, used: policy.used,
        marginal: needs.mineralHaulerMarginal, count: census.count };
    try {
        let mineral = { id: "min1", mineralType: "Z", mineralAmount: 30000, pos: {} };
        let snap = { resources: { energy: { fairPrice: 33 }, Z: { fairPrice: 13, sellPrice: 12 }, H: { fairPrice: 200, sellPrice: 210 } } };
        let used = false, miners = 0;
        roomCache.minerals = () => [mineral];
        roomCache.structuresNear = (room, pos, type) => [{ structureType: type }];
        market.snapshot = () => snap;
        policy.used = () => used;
        needs.mineralHaulerMarginal = () => 1;
        census.count = (room, role) => (role === "mineralMiner" ? miners : 0);
        const room = { name: "MinRoom", energyCapacityAvailable: 12900 };
        global.Memory = { settings: {}, rooms: { MinRoom: {} } };
        global.Game = Object.assign({}, saved.game, { time: 20000, myRooms: [room] });
        delete require.cache[require.resolve(src("utils/extractorEconomics"))];
        const econ = require(src("utils/extractorEconomics"));

        const z = econ.evaluate(room);
        assert(z.priced && z.work === 12 && z.lives === 9 && z.energy === 9 * (12 * 100 + 3 * 50 + 1 * 2400) && z.profit < 0,
            "0164 cost: 12 WORK miner, full lives to deplete, one marginal 16x(CCM) hauler per life (got " + JSON.stringify(z) + ")");
        assert(econ.admitted(room) === false && Memory.rooms.MinRoom.extractorEconomics.reason === "unprofitable" &&
            Memory.rooms.MinRoom.extractorEconomics.nextCheckTick === 21000 && Memory.rooms.MinRoom.extractorEconomics.breakeven > 13 &&
            Memory.rooms.MinRoom.extractorEconomics.deficit > 0,
            "0164 unprofitable: Z at 13 cr vs energy at 33 is blocked until the next check, with breakeven and deficit (got " + JSON.stringify(Memory.rooms.MinRoom.extractorEconomics) + ")");
        snap.resources.Z.fairPrice = 400; Game.time = 20500;
        assert(econ.admitted(room) === false, "0164 cache: the verdict holds until nextCheckTick even if the price moves");
        Game.time = 21000;
        assert(econ.admitted(room) === true && Memory.rooms.MinRoom.extractorEconomics.reason === "profitable",
            "0164 profitable: re-evaluated at nextCheckTick, a deposit worth more than its team's energy is admitted");
        mineral = { id: "min2", mineralType: "H", mineralAmount: 30000, pos: {} }; snap.resources.Z.fairPrice = 13; Game.time = 21010;
        assert(econ.admitted(room) === true && Memory.rooms.MinRoom.extractorEconomics.mineral === "H",
            "0164 cache: a different mineral type is re-evaluated at once");
        mineral = { id: "min1", mineralType: "Z", mineralAmount: 30000, pos: {} }; Game.time = 21020;
        econ.admitted(room); // Z unprofitable again
        used = true; snap.resources.Z.sellPrice = 60;
        assert(econ.evaluate(room).price === 60 && econ.evaluate(room).ownUse === true,
            "0164 own use: a mineral our labs/stock use is worth max(fair, ask) - the purchase it avoids");
        used = false; snap.resources.Z.sellPrice = 12;

        snap = null; Game.time = 22100;
        assert(econ.admitted(room) === false && Memory.rooms.MinRoom.extractorEconomics.stale === true,
            "0164 price unknown: the previous verdict stands (marked stale)");
        delete Memory.rooms.MinRoom.extractorEconomics; Game.time = 22101;
        assert(econ.admitted(room) === true && Memory.rooms.MinRoom.extractorEconomics.reason === "price-unknown" &&
            Memory.rooms.MinRoom.extractorEconomics.nextCheckTick === 22201,
            "0164 price unknown: with no previous verdict the room is admitted (legacy) as price-unknown, retried after unknownRecheckTicks");
        snap = { resources: { energy: { fairPrice: 33 }, Z: { fairPrice: 13, sellPrice: 12 } } }; Game.time = 23200;
        econ.admitted(room);

        assert(needs.mineralOperationActive(room) === false,
            "0164 hauler floor: a blocked deposit with no miner is no mineral operation (no extra hauler paid)");
        miners = 1;
        assert(needs.mineralOperationActive(room) === true, "0164 hauler floor: a miner still alive keeps the operation (and its hauler) until it dies");
        miners = 0;
        Memory.settings.extractorEconomics = { enabled: false };
        assert(econ.admitted(room) === true && needs.mineralOperationActive(room) === true, "0164 flag off: legacy admission");
    } finally {
        roomCache.minerals = original.minerals;
        roomCache.structuresNear = original.near;
        market.snapshot = original.snapshot;
        policy.used = original.used;
        needs.mineralHaulerMarginal = original.marginal;
        census.count = original.count;
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
