const config = require("../utils/config");
const resourceTiers = require("../utils/resourceTiers");
const roomCache = require("../utils/roomCache");

// Multiple collector links in the same room run independently within the
// same tick and each sees the same (not-yet-applied) free capacity on a
// shared target - intents don't mutate store synchronously, so a second
// collector can issue a transferEnergy() the engine will reject once the
// first one's intent lands, wasting that link's cooldown for nothing. One
// send per room per tick avoids the race entirely; same Game.time-keyed
// reset pattern as utils/roomCache.js.
let sendClaimTick = -1;
let claimedRooms = {};

function claimRoomSend(roomName) {
    if (sendClaimTick !== Game.time) {
        sendClaimTick = Game.time;
        claimedRooms = {};
    }
    if (claimedRooms[roomName]) return false;
    claimedRooms[roomName] = true;
    return true;
}

// Split the non-collector links into "the one near the controller" (range 3,
// same geometric pattern utils/energy.js's receivingLink() already uses) and
// "everything else" - the base/storage link. With more than 2 non-collector
// links this just lumps every extra one in with the storage link, same as
// treating it as the generic fallback.
function classify(nonCollectorLinks, room) {
    let controllerLink = null;
    if (room.controller) {
        controllerLink = nonCollectorLinks.find((s) =>
            s.pos.inRangeTo(room.controller, 3)
        );
    }
    const storageLink = nonCollectorLinks.find((s) => s !== controllerLink);
    return { controllerLink: controllerLink || null, storageLink: storageLink || null };
}

// ROADMAP 0054 "Link tiers": with both a controller and a storage link
// built, decide between them instead of just picking whichever has more
// free capacity. In order: (1) controller at real risk of downgrade always
// wins, even over an empty storage link; (2) storage below its own reserve
// is the symmetric emergency; (3) a comfortable storage with the
// controller still short of RCL8 (real RCL to gain) favors the
// controller; (4) default to the storage link, the base priority.
function pickTarget(nonCollectorLinks, room) {
    const { controllerLink, storageLink } = classify(nonCollectorLinks, room);

    // fallback: RCL too low for one of the two yet, or more than 2 links -
    // same behavior as before this feature existed
    if (!controllerLink || !storageLink) {
        return _.sortBy(
            nonCollectorLinks,
            (s) => -s.store.getFreeCapacity(RESOURCE_ENERGY)
        )[0];
    }

    const rcl = room.controller.level;
    if (resourceTiers.controllerCritical(room)) {
        return controllerLink;
    }

    if (!resourceTiers.aboveReserve(room)) {
        return storageLink;
    }

    const storageCapacity = room.storage
        ? room.storage.store.getCapacity(RESOURCE_ENERGY)
        : 0;
    const storageFillRatio = storageCapacity
        ? room.storage.store.energy / storageCapacity
        : 0;
    if (
        storageFillRatio >= config.get("logistics.storageSatisfactoryRatio", 0.5) &&
        rcl < 8
    ) {
        return controllerLink;
    }

    return storageLink;
}

var link = {
    /** @param {Structure} link **/
    run: function (link) {
        if (
            link.isCollector() &&
            link.store["energy"] >= 50 &&
            link.cooldown === 0 &&
            link.isActive()
        ) {
            // ROADMAP: don't burn the collector's cooldown topping off a
            // non-collector link that's already nearly full - only consider
            // one below the configured fill ratio, not merely "has any free
            // capacity at all" (a 799/800 link used to still qualify).
            const receiveFillRatio = config.get("logistics.linkReceiveFillRatio", 0.95);
            let nonCollectorLinks = _.filter(
                roomCache.structures(link.room),
                (s) => {
                    if (s.structureType != STRUCTURE_LINK || s.isCollector()) return false;
                    const capacity = s.store.getCapacity(RESOURCE_ENERGY);
                    if (!capacity || s.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return false;
                    return s.store[RESOURCE_ENERGY] / capacity < receiveFillRatio;
                }
            );
            let target = pickTarget(nonCollectorLinks, link.room);

            if (target) {
                // The engine rejects transferEnergy() with ERR_FULL when the
                // requested amount exceeds the target's free capacity - that
                // check is against the raw amount, not the amount left after
                // LINK_LOSS_RATIO is applied, so amount must never exceed
                // freeCapacity (a previous version tried to compensate for
                // the loss by requesting more than freeCapacity and always
                // hit ERR_FULL instead - every collector send silently
                // failed).
                const transferAmount = Math.min(
                    link.store[RESOURCE_ENERGY],
                    target.store.getFreeCapacity(RESOURCE_ENERGY)
                );
                if (transferAmount > 0 && claimRoomSend(link.room.name)) {
                    link.transferEnergy(target, transferAmount);
                }
            }
        }
    },
};

module.exports = link;
