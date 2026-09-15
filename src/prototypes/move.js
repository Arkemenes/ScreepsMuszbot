const { travel, nativeMoveTo } = require("../utils/move");
const traffic = require("../utils/traffic");
const nativeMove = Creep.prototype.move;

// Route-caching moveTo. Falls back to the engine's own pathing on any error so
// a bug here can never strand a creep.
Creep.prototype.moveTo = function (target, opts) {
    try {
        const result = travel(this, target, opts || {});
        traffic.recordMoveToIntent(this);
        return result;
    } catch (e) {
        console.log("[move] " + (e && e.stack ? e.stack : e));
        const result = nativeMoveTo.call(this, target, opts);
        traffic.recordMoveToIntent(this);
        return result;
    }
};

Creep.prototype.move = function (direction) {
    traffic.recordDirectionIntent(this, direction);
    return nativeMove.call(this, direction);
};
