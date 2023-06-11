StructureContainer.prototype.isCollector = function () {
    if (this.memory.isCollector == undefined) {
        this.memory.isCollector =
            this.pos.findInRange(FIND_SOURCES, 1)[0] !== undefined;
    }

    return this.memory.isCollector;
};
