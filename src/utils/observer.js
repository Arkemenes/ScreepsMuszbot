// Which owned rooms have a working observer (STRUCTURE_OBSERVER, RCL8-only)
// and which rooms they can reach (OBSERVER_RANGE - linear/Chebyshev
// distance, not path distance). Shared by structures/observer.js (decides
// what to observe each tick), rooms/needs.js (an observer takes over the
// scout's exploratory duty - ROADMAP 0028) and roles/scout.js (skip an
// on-demand room an observer already covers).

function myObservers() {
    return _.filter(
        Game.structures,
        (s) => s.structureType === STRUCTURE_OBSERVER
    );
}

function hasAnyObserver() {
    return myObservers().length > 0;
}

// The first owned observer that can reach `roomName`, or null.
function observerFor(roomName) {
    for (const obs of myObservers()) {
        if (
            Game.map.getRoomLinearDistance(obs.room.name, roomName) <=
            OBSERVER_RANGE
        ) {
            return obs;
        }
    }
    return null;
}

module.exports = { myObservers, hasAnyObserver, observerFor };
