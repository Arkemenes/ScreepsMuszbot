StructureLink.prototype.isCollector = function () {
    let nearContainer = this.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType == STRUCTURE_CONTAINER,
    })[0];

    return nearContainer != undefined;
};
