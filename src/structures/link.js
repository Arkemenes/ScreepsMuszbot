var link = {
    /** @param {Structure} link **/
    run: function (link) {
        if (
            link.isCollector() &&
            link.store["energy"] >= 50 &&
            link.cooldown === 0 &&
            link.isActive()
        ) {
            let nonCollectorLinks = link.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.structureType == STRUCTURE_LINK &&
                    !s.isCollector() &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });
            let target = _.sortBy(
                nonCollectorLinks,
                (s) => -s.store.getFreeCapacity(RESOURCE_ENERGY)
            )[0];

            if (target) {
                link.transferEnergy(target);
            }
        }
    },
};

module.exports = link;
