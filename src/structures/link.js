var link = {
    /** @param {Structure} link **/
    run: function (link) {
        if (
            link.isCollector() &&
            link.store["energy"] >= 50 &&
            link.isActive()
        ) {
            let nonCollectorLinks = link.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.structureType == STRUCTURE_LINK && !s.isCollector(),
            });
            let target = _.sortBy(nonCollectorLinks, (s) =>
                s.store.getFreeCapacity()
            )[0];
            link.transferEnergy(target);
        }
    },
};

module.exports = link;
