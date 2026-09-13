StructureLink.prototype.isCollector = function () {
    const position = this.pos.x + ":" + this.pos.y;
    if (this.memory.isCollectorPosition !== position) {
        this.memory.isCollectorPosition = position;
        this.memory.isCollector =
            this.pos.findInRange(FIND_SOURCES, 2)[0] !== undefined;
    }

    return this.memory.isCollector;
};
