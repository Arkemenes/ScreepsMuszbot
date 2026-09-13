const { travel, nativeMoveTo } = require("../utils/move");

// Route-caching moveTo. Falls back to the engine's own pathing on any error so
// a bug here can never strand a creep.
Creep.prototype.moveTo = function (target, opts) {
    try {
        return travel(this, target, opts || {});
    } catch (e) {
        console.log("[move] " + (e && e.stack ? e.stack : e));
        return nativeMoveTo.call(this, target, opts);
    }
};
