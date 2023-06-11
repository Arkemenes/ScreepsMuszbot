let creepLogic = require("roles");
let roomLogic = require("rooms");
let prototypes = require("prototypes");
let utils = require("utils");

// // This line monkey patches the global prototypes.
utils.profiler.enable();

module.exports.loop = function () {
    utils.profiler.wrap(function () {
        utils.memory.wrap(function () {
            // make a list of all of our rooms
            Game.myRooms = _.filter(
                Game.rooms,
                (r) => r.controller && r.controller.level > 0 && r.controller.my
            );
            // get intel for each room
            _.forEach(Game.rooms, (r) => roomLogic.getIntel(r));
            // get intel for each room
            _.forEach(Game.myRooms, (r) => roomLogic.planCity(r));
            // run spwan logic for each room in our empire
            _.forEach(Game.myRooms, (r) => roomLogic.spawning(r));
            // run each creep role see /creeps/index.js
            for (var name in Game.creeps) {
                var creep = Game.creeps[name];
                let role = creep.memory.role;
                if (creepLogic[role]) {
                    creepLogic[role].run(creep);
                }
            }
            // free up memory if creep no longer exists
            for (var name in Memory.creeps) {
                if (!Game.creeps[name]) {
                    delete Memory.creeps[name];
                }
            }
            utils.stats();
        });
    });
};
