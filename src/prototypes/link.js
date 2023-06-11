StructureLink.prototype.isCollector = function () {
    if (this.memory.isCollector == undefined) {
        this.memory.isCollector =
            this.pos.findInRange(FIND_SOURCES, 2)[0] !== undefined;
    }

    return this.memory.isCollector;
};
