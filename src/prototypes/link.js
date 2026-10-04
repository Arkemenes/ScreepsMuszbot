// A link never moves, so whether it sits by a source (a collector) is settled once per
// global: heap per id, with Memory as the fallback that survives a reset (the lookup costs
// two engine getters - pos and memory - and runs from link.run, hauler, builder, upgrader,
// needs and miner on every link every tick).
const collectorById = {};

StructureLink.prototype.isCollector = function () {
    const id = this.id;
    if (id !== undefined && id in collectorById) return collectorById[id];
    const position = this.pos.x + ":" + this.pos.y;
    if (this.memory.isCollectorPosition !== position) {
        this.memory.isCollectorPosition = position;
        this.memory.isCollector =
            this.pos.findInRange(FIND_SOURCES, 2)[0] !== undefined;
    }

    if (id !== undefined) collectorById[id] = this.memory.isCollector;
    return this.memory.isCollector;
};
