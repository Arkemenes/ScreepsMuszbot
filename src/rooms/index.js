let roomLogic = {
    spawning: require("./spawning"),
    getIntel: require("./intel"),
    planCity: require("./architect"),
    remotes: require("./remotes"), // also registers global.reserveRoom/unreserveRoom/claimRoom
    raiding: require("./raiding"), // also registers global.raidRoom/raidSquad/raidRemote
    checkSafeMode: require("./defense").checkSafeMode, // ROADMAP 0032 D6
};
// registers global.setLabReaction/cancelLabReaction/boostCreep/
// setFactoryProduct/cancelFactoryProduct (ROADMAP 0051) - no per-tick
// entry point, structures/lab.js|factory.js read Memory.rooms[x] directly
require("./refining");

module.exports = roomLogic;
